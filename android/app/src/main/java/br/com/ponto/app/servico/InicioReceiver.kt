package br.com.ponto.app.servico

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Retoma o rastreio e o envio da fila quando o celular liga ou o app é atualizado. */
class InicioReceiver : BroadcastReceiver() {
    override fun onReceive(contexto: Context, intent: Intent) {
        RastreioService.sincronizar(contexto)
        SincronizarWorker.agendar(contexto)
    }
}
