package io.github.harleygimenez.assinadorpje

import android.app.Activity
import android.app.AlertDialog
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Typeface
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import io.github.harleygimenez.assinadorpje.core.token.AssinanteStarSign
import io.github.harleygimenez.assinadorpje.core.token.ErroToken
import io.github.harleygimenez.assinadorpje.core.token.Hex
import io.github.harleygimenez.assinadorpje.core.token.LogApdu
import io.github.harleygimenez.assinadorpje.core.token.StarSign
import java.security.Signature

/**
 * Diagnóstico do token A3 (G&D StarSign CUT S) por USB OTG.
 *
 * Por segurança, o fluxo padrão NÃO envia o PIN: conecta, mostra ATR, o
 * descritor CCID, o contador de tentativas e tenta ler o certificado. A
 * assinatura de teste é opcional e só então pede o PIN — uma vez, com aviso
 * do risco de bloqueio.
 */
class TokenActivity : Activity() {

    private lateinit var saida: TextView
    private lateinit var botaoConectar: Button
    private lateinit var botaoAssinar: Button
    private val log = LogApdu()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Token A3 (StarSign)"
        val raiz = Ui.coluna(this)
        setContentView(ScrollView(this).apply { addView(raiz) })

        raiz.addView(Ui.titulo(this, "Diagnóstico do token"))
        raiz.addView(
            Ui.texto(
                this,
                "Conecte o token pelo cabo USB OTG. O teste conecta e lê os dados do token " +
                    "sem enviar o PIN. A assinatura de teste é opcional e só então pede o PIN.",
                Ui.CINZA, 13f,
            )
        )
        botaoConectar = Ui.botao(this, "Conectar e ler (sem PIN)") { conectar(assinarTeste = false) }
            .also { raiz.addView(it) }
        botaoAssinar = Ui.botao(this, "Testar assinatura (pede o PIN)") { avisarEAssinar() }
            .also { raiz.addView(it) }
        raiz.addView(Ui.botao(this, "Usar este token para assinar no PJe") { usarNoPje() })
        raiz.addView(Ui.botao(this, "Copiar log técnico") {
            getSystemService(android.content.ClipboardManager::class.java)
                ?.setPrimaryClip(android.content.ClipData.newPlainText("log token", log.texto()))
            android.widget.Toast.makeText(this, "Log copiado", android.widget.Toast.LENGTH_SHORT).show()
        })

        saida = TextView(this).apply {
            setPadding(0, Ui.dp(this@TokenActivity, 12), 0, 0)
            typeface = Typeface.MONOSPACE
            textSize = 12f
            setTextIsSelectable(true)
        }
        raiz.addView(saida)
    }

    override fun onDestroy() {
        try {
            unregisterReceiver(receptorPermissao)
        } catch (_: Exception) {
        }
        super.onDestroy()
    }

    private fun escrever(linha: String) {
        runOnUiThread { saida.append(linha + "\n") }
    }

    private fun limpar() {
        runOnUiThread { saida.text = "" }
    }

    // --- Permissão USB ---------------------------------------------------------------------

    private var pendente: ((UsbDevice) -> Unit)? = null

    private val receptorPermissao = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != ACAO_PERMISSAO) return
            val device = intentDevice(intent)
            val concedida = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            val acao = pendente
            pendente = null
            if (concedida && device != null && acao != null) acao(device)
            else escrever("✖ Permissão de USB negada ou token desconectado.")
        }
    }

    private fun comToken(acao: (UsbDevice) -> Unit) {
        val manager = servico<UsbManager>()
        val device = manager.deviceList.values.firstOrNull { UsbCcid.ehLeitor(it) }
            ?: manager.deviceList.values.firstOrNull()
        if (device == null) {
            escrever("✖ Nenhum dispositivo USB encontrado. Conecte o token pelo cabo OTG.")
            return
        }
        escrever("Dispositivo: ${device.manufacturerName ?: "?"} ${device.productName ?: ""} " +
            "(VID ${"%04X".format(device.vendorId)} PID ${"%04X".format(device.productId)})")
        if (manager.hasPermission(device)) {
            acao(device)
            return
        }
        pendente = acao
        val flags = if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
        val pi = PendingIntent.getBroadcast(this, 0, Intent(ACAO_PERMISSAO).setPackage(packageName), flags)
        val filtro = IntentFilter(ACAO_PERMISSAO)
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(receptorPermissao, filtro, Context.RECEIVER_NOT_EXPORTED)
        else registerReceiver(receptorPermissao, filtro)
        manager.requestPermission(device, pi)
    }

    @Suppress("DEPRECATION")
    private fun intentDevice(intent: Intent): UsbDevice? =
        if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        else intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)

    // --- Fluxos ----------------------------------------------------------------------------

    private fun conectar(assinarTeste: Boolean, pin: CharArray? = null) {
        limpar()
        botaoConectar.isEnabled = false
        botaoAssinar.isEnabled = false
        comToken { device ->
            Thread {
                try {
                    executar(device, assinarTeste, pin)
                } catch (e: ErroToken) {
                    escrever("✖ ${e.message}")
                } catch (e: Exception) {
                    escrever("✖ Erro inesperado: ${e.javaClass.simpleName}: ${e.message}")
                } finally {
                    pin?.fill('\u0000')
                    runOnUiThread { botaoConectar.isEnabled = true; botaoAssinar.isEnabled = true }
                }
            }.start()
        }
    }

    private fun executar(device: UsbDevice, assinarTeste: Boolean, pin: CharArray?) {
        val leitor = UsbCcid.abrir(servico(), device, log)
        try {
            escrever("ATR: ${Hex.de(leitor.atr)}")
            if (Hex.de(leitor.atr) == StarSign.ATR_CONHECIDO) escrever("✔ ATR bate com o StarSign CUT S conhecido.")
            else escrever("⚠ ATR diferente do StarSign de referência — pode ser outro modelo.")

            val token = StarSign(leitor, log)
            escrever("\nAbrindo sessão (handshake + canal)…")
            token.abrir()
            escrever("✔ Sessão aberta.")

            val tentativas = token.tentativasRestantes()
            escrever(when {
                tentativas < 0 -> "PIN: já autenticado nesta sessão."
                tentativas == 0 -> "⚠ PIN BLOQUEADO."
                else -> "PIN: $tentativas tentativa(s) restante(s) — nenhuma foi usada."
            })

            escrever("\nLendo certificado(s)…")
            runCatching { token.caminhosCertHex() }.getOrNull()?.let { caminhos ->
                if (caminhos.isNotEmpty()) escrever("  Endereços no CDF: ${caminhos.joinToString(", ")}")
            }
            val cadeia = try {
                token.lerCadeia()
            } catch (e: ErroToken) {
                escrever("  (não foi possível ler sem PIN: ${e.message})")
                emptyList()
            }
            if (cadeia.isEmpty()) escrever("  Nenhum certificado lido sem PIN (normal em alguns tokens).")
            cadeia.forEachIndexed { i, c ->
                escrever("  [$i] ${Certificados.descrever(c).replace("\n", " — ")}")
            }

            escrever("\nEstrutura PKCS#15 (para localizar os certificados):")
            escrever(runCatching { token.explorarPkcs15() }.getOrElse { "  (falha ao varrer: ${it.message})" })

            if (!assinarTeste) {
                escrever("\n✔ Diagnóstico concluído (sem enviar PIN).")
                return
            }
            if (pin == null || pin.isEmpty()) {
                escrever("\n✖ PIN não informado para o teste de assinatura.")
                return
            }
            if (tentativas in 1..2) {
                escrever("\n✖ Poucas tentativas de PIN restantes. Teste de assinatura abortado por segurança.")
                return
            }
            escrever("\nVerificando PIN…")
            token.verificarPin(pin)
            escrever("✔ PIN aceito.")
            escrever("\nEstrutura PKCS#15 após o PIN:")
            escrever(runCatching { token.explorarPkcs15() }.getOrElse { "  (falha ao varrer: ${it.message})" })
            val cadeiaPos = if (cadeia.isNotEmpty()) cadeia else runCatching { token.lerCadeia() }.getOrDefault(emptyList())
            if (cadeiaPos.isEmpty()) { escrever("✖ Não foi possível ler o certificado após o PIN."); return }
            val assinante = AssinanteStarSign(token, cadeiaPos)
            val dados = "teste de assinatura assinador-pje ${System.currentTimeMillis()}".toByteArray()
            val assinatura = assinante.assinar("SHA256withRSA", dados)
            escrever("✔ Assinatura gerada: ${assinatura.size} bytes.")
            val ok = Signature.getInstance("SHA256withRSA").run {
                initVerify(cadeiaPos.first().publicKey); update(dados); verify(assinatura)
            }
            escrever(if (ok) "✔ Assinatura CONFERE com a chave pública do certificado. Token funcional!"
            else "✖ A assinatura NÃO confere — reporte o log técnico.")
        } finally {
            leitor.close()
        }
    }

    /** Lê o certificado (sem PIN) e marca o token como a fonte de assinatura do PJe. */
    private fun usarNoPje() {
        limpar()
        comToken { device ->
            Thread {
                try {
                    val leitor = UsbCcid.abrir(servico(), device, log)
                    try {
                        val token = StarSign(leitor, log)
                        token.abrir()
                        val cadeia = token.lerCadeia()
                        if (cadeia.isEmpty()) {
                            escrever("✖ Não foi possível ler o certificado do token (pode exigir PIN). Tente o diagnóstico.")
                            return@Thread
                        }
                        val desc = "Token StarSign — " + Certificados.descrever(cadeia.first())
                        app.certificados.usarToken(desc)
                        escrever("✔ Token definido como certificado do PJe.\n$desc\n\nAgora abra o PJe no app e faça o login; o PIN será pedido na hora de assinar.")
                    } finally {
                        leitor.close()
                    }
                } catch (e: ErroToken) {
                    escrever("✖ ${e.message}")
                } catch (e: Exception) {
                    escrever("✖ Erro inesperado: ${e.javaClass.simpleName}: ${e.message}")
                }
            }.start()
        }
    }

    private fun avisarEAssinar() {
        val campo = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "PIN do token"
        }
        val caixa = Ui.coluna(this, 20).apply {
            addView(Ui.texto(this@TokenActivity,
                "O teste envia o PIN uma vez. PIN errado consome tentativa e pode bloquear o token. " +
                    "Confira o contador antes.", Ui.ALERTA, 13f))
            addView(campo)
        }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Light_Dialog_Alert)
            .setTitle("Testar assinatura")
            .setView(caixa)
            .setPositiveButton("Assinar teste") { _, _ -> conectar(assinarTeste = true, pin = campo.text.toString().toCharArray()) }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    companion object {
        private const val ACAO_PERMISSAO = "io.github.harleygimenez.assinadorpje.USB_PERMISSAO"
    }
}
