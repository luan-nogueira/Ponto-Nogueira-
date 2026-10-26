package br.com.ponto.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import br.com.ponto.app.PontoApp
import br.com.ponto.app.dados.Batida
import br.com.ponto.app.dados.Comprovante
import br.com.ponto.app.dados.ErroServidor
import br.com.ponto.app.dados.Local
import br.com.ponto.app.dados.Localizacao
import br.com.ponto.app.dados.Posicao
import br.com.ponto.app.dados.Repositorio
import br.com.ponto.app.dados.SupabaseApi
import br.com.ponto.app.dados.TipoBatida
import br.com.ponto.app.servico.RastreioService
import br.com.ponto.app.servico.SincronizarWorker
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File

/** Situação da cerca: em qual local o colaborador está e a que distância. */
data class Cerca(val local: Local, val distanciaM: Double, val dentro: Boolean)

data class EstadoPonto(
    val logado: Boolean = false,
    val nome: String = "",
    val empresa: String = "",
    val logoUrl: String? = null,
    val posicao: Posicao? = null,
    val cerca: Cerca? = null,
    val semLocal: Boolean = false,
    val buscandoGps: Boolean = false,
    val proximas: List<TipoBatida> = listOf(TipoBatida.ENTRADA),
    val hoje: List<Batida> = emptyList(),
    val pendentes: Int = 0,
    val fotografando: TipoBatida? = null,
    val enviando: Boolean = false,
    val comprovante: Comprovante? = null,
    val salvaOffline: TipoBatida? = null,
    val erro: String? = null,
)

class PontoViewModel(app: Application) : AndroidViewModel(app) {
    private val repo: Repositorio = (app as PontoApp).repositorio
    private val _estado = MutableStateFlow(
        EstadoPonto(logado = repo.logado, nome = repo.perfil?.nome.orEmpty()).comEmpresa()
    )
    val estado = _estado.asStateFlow()
    private var gps: Job? = null

    // Login ----------------------------------------------------------------------

    fun entrar(email: String, senha: String, aoTerminar: (String?) -> Unit) = viewModelScope.launch {
        try {
            repo.entrar(email, senha)
            _estado.update { it.copy(logado = true, nome = repo.perfil?.nome.orEmpty(), erro = null).comEmpresa() }
            atualizar()
            aoTerminar(null)
        } catch (e: Exception) {
            aoTerminar(mensagem(e))
        }
    }

    fun sair() = viewModelScope.launch {
        getApplication<Application>().stopService(android.content.Intent(getApplication(), RastreioService::class.java))
        repo.sair()
        _estado.value = EstadoPonto()
    }

    // Tela principal -------------------------------------------------------------

    /** Chamado quando a tela aparece: atualiza dados e passa a acompanhar o GPS. */
    fun aoAparecer() {
        if (!repo.logado) return
        atualizar()
        gps?.cancel()
        gps = viewModelScope.launch {
            while (isActive) {
                lerGps()
                delay(15_000)
            }
        }
    }

    fun aoSumir() {
        gps?.cancel()
    }

    fun atualizar() = viewModelScope.launch {
        _estado.update { it.copy(pendentes = repo.pendentes().size, proximas = repo.proximas) }
        if (repo.pendentes().isNotEmpty()) SincronizarWorker.agendar(getApplication())
        runCatching { repo.atualizarProximas() }.onSuccess { p -> _estado.update { it.copy(proximas = p) } }
        runCatching { repo.batidasDeHoje() }.onSuccess { h -> _estado.update { it.copy(hoje = h) } }
            .onFailure { e -> if (e is ErroServidor && e.codigo == 401) expirou() }
        runCatching { repo.atualizarConfiguracao() }.onSuccess { _estado.update { it.comEmpresa() } }
        _estado.update { it.copy(pendentes = repo.pendentes().size) }
        RastreioService.sincronizar(getApplication())
    }

    private suspend fun lerGps() {
        if (!RastreioService.temPermissao(getApplication())) return
        _estado.update { it.copy(buscandoGps = true) }
        val pos = runCatching { Localizacao.atual(getApplication()) }.getOrNull()
        _estado.update { it.copy(buscandoGps = false, posicao = pos ?: it.posicao) }
        pos?.let { calcularCerca(it) }
    }

    /** Usa o servidor para calcular a cerca; sem internet, calcula com os locais guardados. */
    private suspend fun calcularCerca(pos: Posicao) {
        val locais = runCatching { repo.atualizarLocais(pos.lat, pos.lng) }.getOrNull()
        val cerca = if (locais != null) {
            locais.firstOrNull()?.let { Cerca(it, it.distanciaM ?: 0.0, it.dentroCerca == true) }
        } else {
            repo.locais.map { l ->
                val d = Localizacao.distancia(pos.lat, pos.lng, l.lat, l.lng).toDouble()
                Cerca(l, d, d <= l.raioMetros)
            }.minByOrNull { it.distanciaM }
        }
        _estado.update { it.copy(cerca = cerca, semLocal = (locais ?: repo.locais).isEmpty()) }
    }

    // Batida ---------------------------------------------------------------------

    fun iniciarBatida(tipo: TipoBatida) = _estado.update { it.copy(fotografando = tipo, erro = null) }

    fun cancelarFoto() = _estado.update { it.copy(fotografando = null) }

    fun arquivoFoto(): File = repo.arquivoFotoNovo()

    /** Depois da selfie: pega a posição na hora e envia. */
    fun confirmarBatida(foto: File?) = viewModelScope.launch {
        val tipo = _estado.value.fotografando ?: return@launch
        _estado.update { it.copy(fotografando = null, enviando = true, erro = null) }
        try {
            val pos = Localizacao.atual(getApplication())
                ?: throw IllegalStateException("Não foi possível obter o GPS. Vá para um lugar aberto e tente de novo.")
            when (val r = repo.baterPonto(tipo, pos, foto)) {
                is Repositorio.Resultado.Registrada -> _estado.update { it.copy(comprovante = r.comprovante) }
                Repositorio.Resultado.NaFila -> {
                    SincronizarWorker.agendar(getApplication())
                    _estado.update { it.copy(salvaOffline = tipo) }
                }
            }
        } catch (e: Exception) {
            foto?.delete()
            _estado.update { it.copy(erro = mensagem(e)) }
        } finally {
            _estado.update { it.copy(enviando = false) }
            atualizar()
        }
    }

    fun fecharAvisos() = _estado.update { it.copy(comprovante = null, salvaOffline = null, erro = null) }

    private fun EstadoPonto.comEmpresa() = copy(empresa = repo.empresa?.nome.orEmpty(), logoUrl = repo.empresa?.logoUrl)

    private fun expirou() {
        _estado.value = EstadoPonto(erro = "Sua sessão expirou. Entre de novo.")
    }

    private fun mensagem(e: Throwable) = when {
        SupabaseApi.semInternet(e) -> "Sem conexão com a internet"
        else -> e.message ?: "Erro inesperado"
    }
}
