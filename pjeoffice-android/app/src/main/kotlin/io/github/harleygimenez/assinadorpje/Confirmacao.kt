package io.github.harleygimenez.assinadorpje

import android.app.Activity
import android.app.AlertDialog
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.widget.EditText
import io.github.harleygimenez.assinadorpje.core.Assinante
import io.github.harleygimenez.assinadorpje.core.Autorizacao
import io.github.harleygimenez.assinadorpje.core.Confirmador
import io.github.harleygimenez.assinadorpje.core.Pedido
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** Um pedido de assinatura esperando a resposta do usuário. */
class PedidoPendente(val id: Int, val pedido: Pedido) {
    private val latch = CountDownLatch(1)

    @Volatile
    var aprovado = false
        private set

    /** PIN digitado para o token (quando a fonte é TOKEN). Zerado após o uso. */
    @Volatile
    var pin: CharArray? = null

    fun responder(ok: Boolean, pin: CharArray? = null) {
        this.pin = pin
        aprovado = ok
        latch.countDown()
    }

    fun aguardar(minutos: Long): Boolean {
        latch.await(minutos, TimeUnit.MINUTES)
        return aprovado
    }
}

object CentralConfirmacao {
    private val contador = AtomicInteger(1)
    private val pendentes = ConcurrentHashMap<Int, PedidoPendente>()

    fun criar(pedido: Pedido): PedidoPendente =
        PedidoPendente(contador.getAndIncrement(), pedido).also { pendentes[it.id] = it }

    fun obter(id: Int): PedidoPendente? = pendentes[id]

    /** Responde uma única vez; chamadas repetidas são ignoradas. */
    fun responder(id: Int, ok: Boolean, pin: CharArray? = null) {
        pendentes.remove(id)?.responder(ok, pin)
    }
}

/**
 * Depois de aprovado, produz o [Assinante]: o token é aberto aqui (com o PIN
 * digitado), os demais vêm de [Certificados.assinante]. Zera o PIN em seguida.
 */
private fun assinanteAprovado(ctx: Context, pendente: PedidoPendente): Assinante? {
    val certificados = ctx.app.certificados
    if (certificados.fonte != Certificados.Fonte.TOKEN) return certificados.assinante()
    val pin = pendente.pin ?: return null
    return try {
        AcessoToken.abrir(ctx, pin)
    } finally {
        pin.fill('\u0000')
        pendente.pin = null
    }
}

/** Diálogo "Assinar / Recusar", pedindo a senha do .pfx quando necessário. */
object DialogoConfirmacao {
    fun mostrar(activity: Activity, pendente: PedidoPendente, certificados: Certificados, aoFechar: () -> Unit = {}) {
        val r = pendente.pedido.requisicao
        val corpo = Ui.coluna(activity, 20)
        val builder = AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_Light_Dialog_Alert)
            .setTitle("Pedido de assinatura")
            .setView(corpo)
            .setOnDismissListener {
                CentralConfirmacao.responder(pendente.id, false)
                aoFechar()
            }

        if (certificados.fonte == Certificados.Fonte.NENHUM) {
            corpo.addView(Ui.texto(activity, "Nenhum certificado configurado. Abra o Assinador PJe e importe seu certificado A1 (.pfx) ou escolha um certificado instalado no Android."))
            builder.setPositiveButton("Fechar", null).show()
            return
        }

        corpo.addView(Ui.texto(activity, pendente.pedido.descricao, tamanho = 16f))
        corpo.addView(Ui.texto(activity, "Servidor: ${r.servidor}", Ui.CINZA, 13f))
        corpo.addView(Ui.texto(activity, "Tarefa: ${r.tarefaId}", Ui.CINZA, 13f))
        if (pendente.pedido.autorizacao != Autorizacao.CNJ) {
            corpo.addView(
                Ui.texto(
                    activity,
                    "Atenção: o código de segurança deste servidor não foi confirmado com a chave do CNJ. " +
                        "Só continue se você abriu este endereço do PJe por conta própria.",
                    Ui.ALERTA, 13f,
                )
            )
        }
        val ehToken = certificados.fonte == Certificados.Fonte.TOKEN
        corpo.addView(Ui.texto(activity, "Certificado:\n${certificados.descricao}", tamanho = 14f))
        if (ehToken) {
            corpo.addView(Ui.texto(activity, "O token A3 será lido pelo cabo USB. PIN errado consome tentativa e pode bloquear o token.", Ui.ALERTA, 13f))
        }

        // Pede senha para o .pfx bloqueado; pede PIN para o token.
        val precisaSegredo = certificados.precisaSenha || ehToken
        val segredo = if (precisaSegredo) EditText(activity).apply {
            hint = if (ehToken) "PIN do token" else "Senha do certificado"
            inputType = if (ehToken) InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            else InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }.also { corpo.addView(it) } else null
        val erro = Ui.texto(activity, "", Ui.ALERTA, 13f)
        corpo.addView(erro)

        val dialogo = builder
            .setPositiveButton("Assinar", null)
            .setNegativeButton("Recusar", null)
            .create()
        dialogo.setOnShowListener {
            dialogo.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                when {
                    ehToken -> {
                        val pin = segredo?.text?.toString().orEmpty()
                        if (pin.isEmpty()) { erro.text = "Informe o PIN do token"; return@setOnClickListener }
                        CentralConfirmacao.responder(pendente.id, true, pin.toCharArray())
                    }
                    segredo != null -> {
                        try {
                            certificados.desbloquear(segredo.text.toString().toCharArray())
                        } catch (e: Exception) {
                            erro.text = e.message ?: "Senha incorreta"
                            return@setOnClickListener
                        }
                        CentralConfirmacao.responder(pendente.id, true)
                    }
                    else -> CentralConfirmacao.responder(pendente.id, true)
                }
                dialogo.dismiss()
            }
        }
        dialogo.show()
    }
}

/** Confirmação na própria tela (navegador embutido em primeiro plano). */
class ConfirmadorNaTela(private val activity: Activity) : Confirmador {
    override fun confirmar(pedido: Pedido): Assinante? {
        val certificados = activity.app.certificados
        val pendente = CentralConfirmacao.criar(pedido)
        activity.runOnUiThread {
            if (activity.isFinishing || activity.isDestroyed) CentralConfirmacao.responder(pendente.id, false)
            else DialogoConfirmacao.mostrar(activity, pendente, certificados)
        }
        if (!pendente.aguardar(5)) {
            CentralConfirmacao.responder(pendente.id, false)
            return null
        }
        return assinanteAprovado(activity, pendente)
    }
}

/**
 * Confirmação quando o pedido vem do Chrome (servidor local): uma notificação
 * que, tocada, abre o diálogo por cima do navegador.
 */
class ConfirmadorPorNotificacao(private val ctx: Context) : Confirmador {
    override fun confirmar(pedido: Pedido): Assinante? {
        val nm = ctx.servico<NotificationManager>()
        if (!nm.areNotificationsEnabled()) {
            throw IllegalStateException("Ative as notificações do Assinador PJe para confirmar assinaturas vindas do Chrome")
        }
        val pendente = CentralConfirmacao.criar(pedido)
        val abrir = PendingIntent.getActivity(
            ctx, pendente.id,
            Intent(ctx, ConfirmacaoActivity::class.java)
                .putExtra(ConfirmacaoActivity.EXTRA_ID, pendente.id)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val recusar = PendingIntent.getBroadcast(
            ctx, pendente.id,
            Intent(ctx, AcoesReceiver::class.java)
                .setAction(AcoesReceiver.RECUSAR)
                .putExtra(ConfirmacaoActivity.EXTRA_ID, pendente.id),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = Notification.Builder(ctx, Notificacoes.CANAL_PEDIDOS)
            .setSmallIcon(R.drawable.ic_notificacao)
            .setContentTitle("Toque para confirmar a assinatura")
            .setContentText(pedido.descricao)
            .setStyle(Notification.BigTextStyle().bigText(pedido.descricao))
            .setCategory(Notification.CATEGORY_CALL)
            .setContentIntent(abrir)
            .setAutoCancel(true)
            .addAction(Notification.Action.Builder(null, "Recusar", recusar).build())
            .build()
        val idNotificacao = Notificacoes.ID_PEDIDO_BASE + pendente.id
        nm.notify(idNotificacao, n)
        val ok = pendente.aguardar(3)
        nm.cancel(idNotificacao)
        if (!ok) {
            CentralConfirmacao.responder(pendente.id, false)
            return null
        }
        return assinanteAprovado(ctx, pendente)
    }
}

/** Atividade transparente que só exibe o [DialogoConfirmacao]. */
class ConfirmacaoActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent.getIntExtra(EXTRA_ID, -1)
        val pendente = CentralConfirmacao.obter(id)
        if (pendente == null) {
            finish()
            return
        }
        servico<NotificationManager>().cancel(Notificacoes.ID_PEDIDO_BASE + id)
        DialogoConfirmacao.mostrar(this, pendente, app.certificados) { finish() }
    }

    companion object {
        const val EXTRA_ID = "id"
    }
}
