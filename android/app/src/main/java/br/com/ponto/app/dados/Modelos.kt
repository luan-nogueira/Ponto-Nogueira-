package br.com.ponto.app.dados

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class TipoBatida(val rotulo: String) {
    @SerialName("entrada") ENTRADA("Entrada"),
    @SerialName("inicio_intervalo") INICIO_INTERVALO("Início do intervalo"),
    @SerialName("fim_intervalo") FIM_INTERVALO("Fim do intervalo"),
    @SerialName("saida") SAIDA("Saída");

    val api get() = when (this) {
        ENTRADA -> "entrada"
        INICIO_INTERVALO -> "inicio_intervalo"
        FIM_INTERVALO -> "fim_intervalo"
        SAIDA -> "saida"
    }

    companion object {
        fun daApi(valor: String) = entries.first { it.api == valor }
    }
}

@Serializable
data class Sessao(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_at") val expiraEm: Long = 0,
    val user: UsuarioAuth,
)

@Serializable
data class UsuarioAuth(val id: String, val email: String? = null)

@Serializable
data class Perfil(
    val id: String,
    val nome: String,
    val papel: String,
    @SerialName("empresa_id") val empresaId: String,
)

@Serializable
data class Local(
    val id: String,
    val nome: String,
    val endereco: String? = null,
    val lat: Double,
    val lng: Double,
    @SerialName("raio_metros") val raioMetros: Int,
    @SerialName("distancia_m") val distanciaM: Double? = null,
    @SerialName("dentro_cerca") val dentroCerca: Boolean? = null,
)

@Serializable
data class Batida(
    val id: String,
    val tipo: TipoBatida,
    val status: String,
    @SerialName("registrado_em") val registradoEm: String,
    @SerialName("motivo_rejeicao") val motivoRejeicao: String? = null,
    val nsr: Long? = null,
)

/** Resposta de registrar_batida: o comprovante da batida. */
@Serializable
data class Comprovante(
    val id: String,
    @SerialName("id_cliente") val idCliente: String,
    val tipo: TipoBatida,
    val status: String,
    @SerialName("motivo_rejeicao") val motivoRejeicao: String? = null,
    @SerialName("registrado_em") val registradoEm: String,
    val nsr: Long? = null,
    val hash: String? = null,
    val local: String? = null,
    @SerialName("distancia_m") val distanciaM: Double? = null,
    val colaborador: String? = null,
    val empresa: String? = null,
    val cnpj: String? = null,
)

/** Batida guardada no celular até ser enviada (sem internet). */
@Serializable
data class BatidaPendente(
    val idCliente: String,
    val tipo: TipoBatida,
    val lat: Double,
    val lng: Double,
    val precisaoM: Float?,
    val mock: Boolean,
    val horaDispositivo: String,
    val fotoArquivo: String?,
    val dispositivo: String,
)

@Serializable
data class PontoLocalizacao(
    val lat: Double,
    val lng: Double,
    @SerialName("precisao_m") val precisaoM: Float?,
    val velocidade: Float?,
    val bateria: Int?,
    @SerialName("mock_location") val mock: Boolean,
    @SerialName("capturado_em") val capturadoEm: String,
)

@Serializable
data class Empresa(@SerialName("intervalo_rastreio_s") val intervaloRastreioS: Int = 300)
