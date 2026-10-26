package br.com.ponto.app.dados

import br.com.ponto.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Erro devolvido pelo servidor (não é falta de internet). */
class ErroServidor(val codigo: Int, mensagem: String) : Exception(mensagem)

/**
 * Acesso direto à API REST do Supabase (Auth, PostgREST e Storage) com OkHttp.
 * Falta de internet aparece como IOException.
 */
class SupabaseApi(private val url: String = BuildConfig.SUPABASE_URL, private val chave: String = BuildConfig.SUPABASE_ANON_KEY) {
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }
    private val jsonTipo = "application/json".toMediaType()
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    suspend fun entrar(email: String, senha: String): Sessao {
        val corpo = buildJsonObject { put("email", email); put("password", senha) }.toString()
        val resposta = enviar(
            Request.Builder().url("$url/auth/v1/token?grant_type=password").post(corpo.toRequestBody(jsonTipo)),
            token = null,
        )
        return json.decodeFromString(Sessao.serializer(), resposta)
    }

    suspend fun renovar(refreshToken: String): Sessao {
        val corpo = buildJsonObject { put("refresh_token", refreshToken) }.toString()
        val resposta = enviar(
            Request.Builder().url("$url/auth/v1/token?grant_type=refresh_token").post(corpo.toRequestBody(jsonTipo)),
            token = null,
        )
        return json.decodeFromString(Sessao.serializer(), resposta)
    }

    suspend fun sair(token: String) {
        runCatching { enviar(Request.Builder().url("$url/auth/v1/logout").post(ByteArray(0).toRequestBody()), token) }
    }

    /** Chama uma função do banco (POST /rest/v1/rpc/nome). */
    suspend fun rpc(token: String, funcao: String, parametros: JsonObject): String =
        enviar(
            Request.Builder().url("$url/rest/v1/rpc/$funcao").post(parametros.toString().toRequestBody(jsonTipo)),
            token,
        )

    /** Consulta uma tabela: caminho = "batidas?select=*&usuario_id=eq.X". */
    suspend fun consultar(token: String, caminho: String): String =
        enviar(Request.Builder().url("$url/rest/v1/$caminho").get(), token)

    suspend fun enviarFoto(token: String, caminho: String, bytes: ByteArray) {
        val corpo: RequestBody = bytes.toRequestBody("image/jpeg".toMediaType())
        enviar(
            Request.Builder().url("$url/storage/v1/object/fotos-ponto/$caminho")
                .header("x-upsert", "true")
                .post(corpo),
            token,
        )
    }

    private suspend fun enviar(req: Request.Builder, token: String?): String = withContext(Dispatchers.IO) {
        req.header("apikey", chave)
        req.header("Authorization", "Bearer ${token ?: chave}")
        http.newCall(req.build()).execute().use { r ->
            val texto = r.body?.string().orEmpty()
            if (!r.isSuccessful) throw ErroServidor(r.code, mensagemDeErro(texto, r.code))
            texto
        }
    }

    private fun mensagemDeErro(texto: String, codigo: Int): String {
        val obj = runCatching { json.parseToJsonElement(texto).jsonObject }.getOrNull()
        val msg = listOf("message", "msg", "error_description", "error")
            .firstNotNullOfOrNull { obj?.get(it)?.let(::textoOuNulo) }
        return when {
            codigo == 400 && msg?.contains("Invalid login", true) == true -> "E-mail ou senha incorretos"
            msg != null -> msg
            else -> "Erro no servidor ($codigo)"
        }
    }

    private fun textoOuNulo(e: JsonElement) = runCatching { e.jsonPrimitive.content }.getOrNull()

    companion object {
        fun semInternet(e: Throwable) = e is IOException
    }
}
