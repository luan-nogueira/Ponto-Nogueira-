package br.com.ponto.app.servico

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import br.com.ponto.app.PontoApp
import br.com.ponto.app.dados.ErroServidor
import java.util.concurrent.TimeUnit

/** Envia as batidas feitas sem internet assim que houver conexão. */
class SincronizarWorker(contexto: Context, parametros: WorkerParameters) : CoroutineWorker(contexto, parametros) {
    override suspend fun doWork(): Result {
        val repositorio = (applicationContext as PontoApp).repositorio
        if (!repositorio.logado || repositorio.pendentes().isEmpty()) return Result.success()
        return try {
            repositorio.enviarFila()
            RastreioService.sincronizar(applicationContext)
            Result.success()
        } catch (e: ErroServidor) {
            if (e.codigo == 401) Result.failure() else Result.retry()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    companion object {
        fun agendar(contexto: Context) {
            val pedido = OneTimeWorkRequestBuilder<SincronizarWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(contexto).enqueueUniqueWork("sincronizar", ExistingWorkPolicy.REPLACE, pedido)
        }
    }
}
