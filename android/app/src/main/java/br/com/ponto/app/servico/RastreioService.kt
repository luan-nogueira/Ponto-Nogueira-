package br.com.ponto.app.servico

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import br.com.ponto.app.PontoApp
import br.com.ponto.app.R
import br.com.ponto.app.dados.PontoLocalizacao
import br.com.ponto.app.dados.ehFalsa
import br.com.ponto.app.ui.MainActivity
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant

/**
 * Envia a localização periodicamente enquanto a jornada está aberta (entre a
 * entrada e a saída). Fica com uma notificação fixa, como exige o Android, e
 * para sozinho na saída (LGPD: nada é coletado fora do expediente).
 */
class RastreioService : Service() {
    private val escopo = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val trava = Mutex()
    private val buffer = mutableListOf<PontoLocalizacao>()
    private val cliente by lazy { LocationServices.getFusedLocationProviderClient(this) }
    private val repositorio by lazy { (application as PontoApp).repositorio }

    private val retorno = object : LocationCallback() {
        override fun onLocationResult(resultado: LocationResult) {
            val pontos = resultado.locations.map {
                PontoLocalizacao(
                    lat = it.latitude,
                    lng = it.longitude,
                    precisaoM = if (it.hasAccuracy()) it.accuracy else null,
                    velocidade = if (it.hasSpeed()) it.speed else null,
                    bateria = bateria(),
                    mock = it.ehFalsa(),
                    capturadoEm = Instant.ofEpochMilli(it.time).toString(),
                )
            }
            escopo.launch { enviar(pontos) }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    @SuppressLint("MissingPermission")
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!repositorio.logado || !repositorio.emJornada || !temPermissao(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        ServiceCompat.startForeground(
            this, NOTIFICACAO, notificacao(),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0,
        )
        val intervalo = repositorio.intervaloRastreioS.coerceAtLeast(30) * 1000L
        val pedido = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalo)
            .setMinUpdateIntervalMillis(intervalo / 2)
            .setMinUpdateDistanceMeters(0f)
            .build()
        cliente.removeLocationUpdates(retorno)
        cliente.requestLocationUpdates(pedido, retorno, Looper.getMainLooper())
        return START_STICKY
    }

    private suspend fun enviar(novos: List<PontoLocalizacao>) = trava.withLock {
        if (!repositorio.emJornada) {
            buffer.clear()
            stopSelf()
            return@withLock
        }
        buffer += novos
        try {
            repositorio.enviarLocalizacoes(buffer.toList())
            buffer.clear()
        } catch (e: Exception) {
            // sem internet: guarda até 500 pontos e tenta de novo no próximo envio
            while (buffer.size > 500) buffer.removeAt(0)
        }
    }

    private fun bateria(): Int? =
        (getSystemService(Context.BATTERY_SERVICE) as BatteryManager)
            .getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).takeIf { it in 0..100 }

    private fun notificacao(): Notification {
        val abrir = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, PontoApp.CANAL_RASTREIO)
            .setSmallIcon(R.drawable.ic_ponto)
            .setContentTitle("Jornada em andamento")
            .setContentText("Sua localização é enviada à empresa até você bater a saída.")
            .setOngoing(true)
            .setContentIntent(abrir)
            .build()
    }

    override fun onDestroy() {
        cliente.removeLocationUpdates(retorno)
        escopo.cancel()
        super.onDestroy()
    }

    companion object {
        private const val NOTIFICACAO = 1

        fun temPermissao(contexto: Context) =
            ContextCompat.checkSelfPermission(contexto, android.Manifest.permission.ACCESS_FINE_LOCATION) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED

        /** Liga ou desliga o rastreio conforme a jornada. */
        fun sincronizar(contexto: Context) {
            val repositorio = (contexto.applicationContext as PontoApp).repositorio
            val intent = Intent(contexto, RastreioService::class.java)
            if (repositorio.logado && repositorio.emJornada && temPermissao(contexto)) {
                ContextCompat.startForegroundService(contexto, intent)
            } else {
                contexto.stopService(intent)
            }
        }
    }
}
