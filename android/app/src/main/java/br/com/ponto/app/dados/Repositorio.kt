package br.com.ponto.app.dados

import android.content.Context
import android.provider.Settings
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

/**
 * Ponto único de acesso a dados do app: sessão, locais, batidas (com fila offline)
 * e envio de localização.
 */
class Repositorio(private val contexto: Context, val api: SupabaseApi = SupabaseApi()) {
    private val prefs = contexto.getSharedPreferences("ponto", Context.MODE_PRIVATE)
    private val json = api.json
    private val travaSessao = Mutex()
    private val travaFila = Mutex()
    private val pastaFila = File(contexto.filesDir, "fila").apply { mkdirs() }
    private val pastaFotos = File(contexto.filesDir, "fotos").apply { mkdirs() }

    val idDispositivo: String by lazy {
        Settings.Secure.getString(contexto.contentResolver, Settings.Secure.ANDROID_ID) ?: "desconhecido"
    }

    // Sessão ---------------------------------------------------------------------

    private var sessao: Sessao?
        get() = prefs.getString("sessao", null)?.let { runCatching { json.decodeFromString(Sessao.serializer(), it) }.getOrNull() }
        set(v) = prefs.edit().putString("sessao", v?.let { json.encodeToString(Sessao.serializer(), it) }).apply()

    var perfil: Perfil?
        get() = prefs.getString("perfil", null)?.let { runCatching { json.decodeFromString(Perfil.serializer(), it) }.getOrNull() }
        private set(v) = prefs.edit().putString("perfil", v?.let { json.encodeToString(Perfil.serializer(), it) }).apply()

    val logado get() = sessao != null && perfil != null

    suspend fun entrar(email: String, senha: String) {
        val nova = api.entrar(email.trim(), senha)
        val perfis = api.consultar(nova.accessToken, "usuarios?select=id,nome,papel,empresa_id&id=eq.${nova.user.id}")
        val p = json.decodeFromString(ListSerializer(Perfil.serializer()), perfis).firstOrNull()
            ?: throw ErroServidor(403, "Conta sem cadastro na empresa. Fale com o administrador.")
        sessao = nova
        perfil = p
        runCatching { atualizarLocais() }
        runCatching { atualizarConfiguracao() }
    }

    suspend fun sair() {
        sessao?.let { api.sair(it.accessToken) }
        prefs.edit().clear().apply()
    }

    /** Token válido, renovando se estiver para expirar. */
    suspend fun token(): String = travaSessao.withLock {
        val atual = sessao ?: throw ErroServidor(401, "Sessão expirada, entre de novo")
        if (atual.expiraEm - 60 > Instant.now().epochSecond) return atual.accessToken
        try {
            val nova = api.renovar(atual.refreshToken)
            sessao = nova
            nova.accessToken
        } catch (e: ErroServidor) {
            if (e.codigo in 400..401) {
                sessao = null
            }
            throw e
        }
    }

    // Locais e configuração ------------------------------------------------------

    var locais: List<Local>
        get() = prefs.getString("locais", null)?.let {
            runCatching { json.decodeFromString(ListSerializer(Local.serializer()), it) }.getOrNull()
        } ?: emptyList()
        private set(v) = prefs.edit().putString("locais", json.encodeToString(ListSerializer(Local.serializer()), v)).apply()

    /** Empresa do colaborador (nome, logo e configurações), guardada para funcionar sem internet. */
    var empresa: Empresa?
        get() = prefs.getString("empresa", null)?.let { runCatching { json.decodeFromString(Empresa.serializer(), it) }.getOrNull() }
        private set(v) = prefs.edit().putString("empresa", v?.let { json.encodeToString(Empresa.serializer(), it) }).apply()

    val intervaloRastreioS get() = empresa?.intervaloRastreioS ?: 300

    /** Locais do colaborador; com posição, o servidor calcula distância e se está dentro. */
    suspend fun atualizarLocais(lat: Double? = null, lng: Double? = null): List<Local> {
        val params = buildJsonObject {
            if (lat != null && lng != null) { put("p_lat", lat); put("p_lng", lng) }
        }
        val lista = json.decodeFromString(ListSerializer(Local.serializer()), api.rpc(token(), "meus_locais", params))
        locais = lista
        return lista
    }

    suspend fun atualizarConfiguracao() {
        val texto = api.consultar(token(), "empresas?select=nome,logo_url,intervalo_rastreio_s")
        json.decodeFromString(ListSerializer(Empresa.serializer()), texto).firstOrNull()?.let { empresa = it }
    }

    // Jornada --------------------------------------------------------------------

    /** Próximas batidas permitidas, guardadas para funcionar sem internet. */
    var proximas: List<TipoBatida>
        get() = prefs.getString("proximas", null)?.split(",")?.filter { it.isNotBlank() }?.map(TipoBatida::daApi)
            ?: listOf(TipoBatida.ENTRADA)
        private set(v) = prefs.edit().putString("proximas", v.joinToString(",") { it.api }).apply()

    /** Jornada aberta = já bateu entrada e ainda não bateu saída. */
    val emJornada get() = TipoBatida.ENTRADA !in proximas

    suspend fun atualizarProximas(): List<TipoBatida> {
        val texto = api.rpc(token(), "minhas_proximas_batidas", buildJsonObject { })
        val lista = json.decodeFromString(ListSerializer(String.serializer()), texto).map(TipoBatida::daApi)
        // batidas ainda na fila mudam a próxima esperada
        proximas = pendentes().fold(lista) { _, p -> depoisDe(p.tipo) }
        return proximas
    }

    private fun depoisDe(tipo: TipoBatida) = when (tipo) {
        TipoBatida.ENTRADA, TipoBatida.FIM_INTERVALO -> listOf(TipoBatida.INICIO_INTERVALO, TipoBatida.SAIDA)
        TipoBatida.INICIO_INTERVALO -> listOf(TipoBatida.FIM_INTERVALO)
        TipoBatida.SAIDA -> listOf(TipoBatida.ENTRADA)
    }

    suspend fun batidasDeHoje(): List<Batida> {
        val inicio = LocalDate.now(ZoneId.of("America/Sao_Paulo")).atStartOfDay(ZoneId.of("America/Sao_Paulo")).toInstant()
        val uid = perfil?.id ?: return emptyList()
        val texto = api.consultar(
            token(),
            "batidas?select=id,tipo,status,registrado_em,motivo_rejeicao,nsr&usuario_id=eq.$uid" +
                "&registrado_em=gte.$inicio&order=registrado_em.desc",
        )
        return json.decodeFromString(ListSerializer(Batida.serializer()), texto)
    }

    // Batidas --------------------------------------------------------------------

    sealed interface Resultado {
        data class Registrada(val comprovante: Comprovante) : Resultado
        data object NaFila : Resultado
    }

    fun arquivoFotoNovo(): File = File(pastaFotos, "${UUID.randomUUID()}.jpg")

    /**
     * Registra a batida. Sem internet, guarda na fila e devolve [Resultado.NaFila];
     * a fila é enviada depois pelo [br.com.ponto.app.servico.SincronizarWorker].
     */
    suspend fun baterPonto(tipo: TipoBatida, pos: Posicao, foto: File?): Resultado {
        val pendente = BatidaPendente(
            idCliente = UUID.randomUUID().toString(),
            tipo = tipo,
            lat = pos.lat,
            lng = pos.lng,
            precisaoM = pos.precisaoM,
            mock = pos.mock,
            horaDispositivo = Instant.now().toString(),
            fotoArquivo = foto?.absolutePath,
            dispositivo = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL} ($idDispositivo)",
        )
        // grava antes de enviar: se o app fechar no meio, nada se perde
        salvarNaFila(pendente)
        return try {
            val comprovante = enviar(pendente, offline = false)
            Resultado.Registrada(comprovante)
        } catch (e: Exception) {
            if (!SupabaseApi.semInternet(e)) {
                removerDaFila(pendente)
                throw e
            }
            proximas = depoisDe(tipo)
            Resultado.NaFila
        }
    }

    private suspend fun enviar(p: BatidaPendente, offline: Boolean): Comprovante {
        val uid = perfil?.id ?: throw ErroServidor(401, "Sessão expirada")
        val caminhoFoto = p.fotoArquivo?.let { File(it) }?.takeIf { it.exists() }?.let { arquivo ->
            val caminho = "$uid/${p.idCliente}.jpg"
            api.enviarFoto(token(), caminho, arquivo.readBytes())
            caminho
        }
        val params = buildJsonObject {
            put("p_id_cliente", p.idCliente)
            put("p_tipo", p.tipo.api)
            put("p_lat", p.lat)
            put("p_lng", p.lng)
            p.precisaoM?.let { put("p_precisao_m", it) }
            put("p_mock_location", p.mock)
            put("p_hora_dispositivo", p.horaDispositivo)
            caminhoFoto?.let { put("p_foto_path", it) }
            put("p_dispositivo", p.dispositivo)
            put("p_offline", offline)
        }
        val comprovante = json.decodeFromString(Comprovante.serializer(), api.rpc(token(), "registrar_batida", params))
        removerDaFila(p)
        runCatching { atualizarProximas() }
        return comprovante
    }

    fun pendentes(): List<BatidaPendente> =
        pastaFila.listFiles().orEmpty().sortedBy { it.lastModified() }.mapNotNull {
            runCatching { json.decodeFromString(BatidaPendente.serializer(), it.readText()) }.getOrNull()
        }.sortedBy { it.horaDispositivo }

    /** Envia a fila. Devolve os comprovantes; para no primeiro erro de rede. */
    suspend fun enviarFila(): List<Comprovante> = travaFila.withLock {
        pendentes().map { p ->
            try {
                enviar(p, offline = true)
            } catch (e: ErroServidor) {
                // recusa definitiva do servidor (ex.: dados inválidos): não adianta reenviar
                if (e.codigo in 400..499 && e.codigo != 401) removerDaFila(p)
                throw e
            }
        }
    }

    private fun salvarNaFila(p: BatidaPendente) =
        File(pastaFila, "${p.idCliente}.json").writeText(json.encodeToString(BatidaPendente.serializer(), p))

    private fun removerDaFila(p: BatidaPendente) {
        File(pastaFila, "${p.idCliente}.json").delete()
        p.fotoArquivo?.let { File(it).delete() }
    }

    // Localização ----------------------------------------------------------------

    suspend fun enviarLocalizacoes(pontos: List<PontoLocalizacao>): Int {
        if (pontos.isEmpty()) return 0
        val lista = json.encodeToJsonElement(ListSerializer(PontoLocalizacao.serializer()), pontos) as JsonArray
        val texto = api.rpc(token(), "enviar_localizacoes", buildJsonObject { put("p_pontos", lista) })
        return texto.trim().toIntOrNull() ?: 0
    }
}
