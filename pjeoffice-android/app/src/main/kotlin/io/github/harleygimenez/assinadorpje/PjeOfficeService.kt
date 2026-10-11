package io.github.harleygimenez.assinadorpje

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import io.github.harleygimenez.assinadorpje.core.EntradaRegistro
import io.github.harleygimenez.assinadorpje.core.Processador
import io.github.harleygimenez.assinadorpje.core.Protocolo
import io.github.harleygimenez.assinadorpje.core.ServidorLocal
import java.util.Date

object Notificacoes {
    const val CANAL_SERVIDOR = "servidor"
    const val CANAL_PEDIDOS = "pedidos"
    const val ID_SERVIDOR = 1
    const val ID_PEDIDO_BASE = 1000

    fun criarCanais(ctx: Context) {
        val nm = ctx.servico<NotificationManager>()
        nm.createNotificationChannel(
            NotificationChannel(CANAL_SERVIDOR, "Assinador ativo para o Chrome", NotificationManager.IMPORTANCE_LOW)
        )
        nm.createNotificationChannel(
            NotificationChannel(CANAL_PEDIDOS, "Pedidos de assinatura", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Avisos para confirmar assinaturas pedidas pelo PJe"
            }
        )
    }
}

/**
 * Serviço em primeiro plano que mantém o servidor do PJeOffice em
 * `127.0.0.1:8800`, para usar o PJe pelo Chrome (ou outro navegador).
 */
class PjeOfficeService : Service() {
    private var servidor: ServidorLocal? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACAO_PARAR) {
            stopSelf()
            return START_NOT_STICKY
        }
        val notificacao = notificacao()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(Notificacoes.ID_SERVIDOR, notificacao, TIPO_USO_ESPECIAL)
        } else {
            startForeground(Notificacoes.ID_SERVIDOR, notificacao)
        }
        if (servidor == null) {
            val s = ServidorLocal(Processador(ConfirmadorPorNotificacao(this), registro = app.registro))
            try {
                s.iniciar()
                servidor = s
                ativo = true
            } catch (e: Exception) {
                app.registro.adicionar(
                    EntradaRegistro(
                        Date(), "servidor", "127.0.0.1:${Protocolo.PORTA_HTTP}", false,
                        "Não foi possível abrir a porta ${Protocolo.PORTA_HTTP}: ${e.message}", "",
                    )
                )
                stopSelf()
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        servidor?.parar()
        servidor = null
        ativo = false
        super.onDestroy()
    }

    private fun notificacao(): Notification {
        val abrir = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val parar = PendingIntent.getService(
            this, 1, Intent(this, PjeOfficeService::class.java).setAction(ACAO_PARAR), PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, Notificacoes.CANAL_SERVIDOR)
            .setSmallIcon(R.drawable.ic_notificacao)
            .setContentTitle("Assinador PJe ativo")
            .setContentText("Aguardando o PJe no navegador (127.0.0.1:${Protocolo.PORTA_HTTP})")
            .setContentIntent(abrir)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Desligar", parar).build())
            .build()
    }

    companion object {
        const val ACAO_PARAR = "io.github.harleygimenez.assinadorpje.PARAR"

        /** `ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE` (API 34). */
        private const val TIPO_USO_ESPECIAL = 0x40000000

        @Volatile
        var ativo = false
            private set
    }
}

/** Ações das notificações (ex.: "Recusar" um pedido sem abrir o app). */
class AcoesReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == RECUSAR) {
            val id = intent.getIntExtra(ConfirmacaoActivity.EXTRA_ID, -1)
            CentralConfirmacao.responder(id, false)
            context.servico<NotificationManager>().cancel(Notificacoes.ID_PEDIDO_BASE + id)
        }
    }

    companion object {
        const val RECUSAR = "io.github.harleygimenez.assinadorpje.RECUSAR"
    }
}
