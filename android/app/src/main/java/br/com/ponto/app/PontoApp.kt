package br.com.ponto.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.work.Configuration
import androidx.work.WorkManager
import br.com.ponto.app.dados.Repositorio

class PontoApp : Application() {
    lateinit var repositorio: Repositorio
        private set

    override fun onCreate() {
        super.onCreate()
        WorkManager.initialize(this, Configuration.Builder().build())
        repositorio = Repositorio(this)
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CANAL_RASTREIO, getString(R.string.canal_rastreio), NotificationManager.IMPORTANCE_LOW)
        )
    }

    companion object {
        const val CANAL_RASTREIO = "rastreio"
    }
}
