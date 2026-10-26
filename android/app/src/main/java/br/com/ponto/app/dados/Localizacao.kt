package br.com.ponto.app.dados

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.os.Build
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.tasks.await

data class Posicao(val lat: Double, val lng: Double, val precisaoM: Float?, val mock: Boolean)

fun Location.paraPosicao() = Posicao(
    lat = latitude,
    lng = longitude,
    precisaoM = if (hasAccuracy()) accuracy else null,
    mock = ehFalsa(),
)

@Suppress("DEPRECATION")
fun Location.ehFalsa(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) isMock else isFromMockProvider

object Localizacao {
    /** Posição atual com alta precisão (GPS ligado). Exige permissão já concedida. */
    @SuppressLint("MissingPermission")
    suspend fun atual(contexto: Context): Posicao? {
        val cliente = LocationServices.getFusedLocationProviderClient(contexto)
        val pedido = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setMaxUpdateAgeMillis(10_000)
            .setDurationMillis(20_000)
            .build()
        return cliente.getCurrentLocation(pedido, CancellationTokenSource().token).await()?.paraPosicao()
    }

    /** Distância em metros (para checar a cerca sem internet). */
    fun distancia(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Float {
        val r = FloatArray(1)
        Location.distanceBetween(lat1, lng1, lat2, lng2, r)
        return r[0]
    }
}
