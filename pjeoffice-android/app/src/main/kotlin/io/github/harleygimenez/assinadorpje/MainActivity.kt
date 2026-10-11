package io.github.harleygimenez.assinadorpje

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.security.KeyChain
import android.text.InputType
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import io.github.harleygimenez.assinadorpje.core.Protocolo

object Tribunais {
    /** Endereços de exemplo; qualquer outro PJe pode ser digitado em "Outro endereço". */
    val lista = listOf(
        "TRF3 – 1º grau" to "https://pje1g.trf3.jus.br/pje/login.seam",
        "TRF3 – 2º grau" to "https://pje2g.trf3.jus.br/pje/login.seam",
        "TRF1 – 1º grau" to "https://pje1g.trf1.jus.br/pje/login.seam",
        "TRT2 (SP) – 1º grau" to "https://pje.trt2.jus.br/primeirograu/login.seam",
        "TJMG – 1º grau" to "https://pje.tjmg.jus.br/pje/login.seam",
        "TJDFT – 1º grau" to "https://pje.tjdft.jus.br/pje/login.seam",
    )
}

class MainActivity : Activity() {

    private lateinit var textoCertificado: TextView
    private lateinit var botaoDesbloquear: android.widget.Button
    private lateinit var chaveServidor: Switch
    private lateinit var textoRegistro: TextView
    private val prefs by lazy { getSharedPreferences("app", Context.MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Assinador PJe"
        val raiz = Ui.coluna(this)
        setContentView(ScrollView(this).apply { addView(raiz) })

        // Certificado
        val cert = Ui.cartao(this).also { raiz.addView(it) }
        cert.addView(Ui.titulo(this, "Certificado digital"))
        textoCertificado = Ui.texto(this).also { cert.addView(it) }
        cert.addView(Ui.botao(this, "Importar certificado A1 (.pfx / .p12)") { escolherPfx() })
        cert.addView(Ui.botao(this, "Usar certificado instalado no Android") { escolherKeyChain() })
        botaoDesbloquear = Ui.botao(this, "Desbloquear") { alternarBloqueio() }.also { cert.addView(it) }
        cert.addView(Ui.botao(this, "Remover certificado do app") { confirmarRemocao() })

        // PJe
        val pje = Ui.cartao(this).also { raiz.addView(it) }
        pje.addView(Ui.titulo(this, "Acessar o PJe"))
        pje.addView(Ui.texto(this, "Recomendado: o navegador do próprio app já traz o assinador embutido.", Ui.CINZA, 13f))
        pje.addView(Ui.botao(this, "Abrir o PJe no app") { escolherTribunal { abrirNoApp(it) } })

        // Chrome
        val chrome = Ui.cartao(this).also { raiz.addView(it) }
        chrome.addView(Ui.titulo(this, "Usar pelo Chrome"))
        chrome.addView(
            Ui.texto(
                this,
                "Liga um servidor em 127.0.0.1:${Protocolo.PORTA_HTTP}, igual ao PJeOffice do computador. " +
                    "Os pedidos de assinatura chegam como notificação. O Chrome pode pedir permissão para " +
                    "\"acessar dispositivos na rede local\" — permita.",
                Ui.CINZA, 13f,
            )
        )
        chaveServidor = Switch(this).apply {
            text = "Assinador ativo para o navegador"
            textSize = 15f
            setOnCheckedChangeListener { _, ligado -> if (ligado) ligarServidor() else desligarServidor() }
        }
        chrome.addView(chaveServidor)
        chrome.addView(Ui.botao(this, "Abrir o PJe no Chrome") { escolherTribunal { abrirNoNavegador(it) } })

        // Registro
        val reg = Ui.cartao(this).also { raiz.addView(it) }
        reg.addView(Ui.titulo(this, "Registro"))
        textoRegistro = Ui.texto(this, tamanho = 12f).apply { typeface = Typeface.MONOSPACE }
        reg.addView(textoRegistro)
        val linha = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        linha.addView(Ui.botao(this, "Copiar detalhes") { copiarRegistro() }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        linha.addView(Ui.botao(this, "Limpar") { app.registro.limpar() }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        reg.addView(linha)

        raiz.addView(
            Ui.texto(
                this,
                "Projeto independente, sem vínculo com o CNJ ou tribunais. Compatível com o protocolo do PJeOffice Pro.",
                Ui.CINZA, 12f,
            )
        )
    }

    override fun onResume() {
        super.onResume()
        app.registro.aoMudar = { runOnUiThread { atualizarRegistro() } }
        atualizarCertificado()
        atualizarRegistro()
        chaveServidor.setOnCheckedChangeListener(null)
        chaveServidor.isChecked = PjeOfficeService.ativo
        chaveServidor.setOnCheckedChangeListener { _, ligado -> if (ligado) ligarServidor() else desligarServidor() }
    }

    override fun onPause() {
        app.registro.aoMudar = null
        super.onPause()
    }

    private fun atualizarCertificado() {
        val c = app.certificados
        textoCertificado.text = when (c.fonte) {
            Certificados.Fonte.NENHUM -> "Nenhum certificado configurado."
            Certificados.Fonte.PFX -> "Arquivo A1 ${if (c.precisaSenha) "(bloqueado)" else "(desbloqueado)"}\n${c.descricao}"
            Certificados.Fonte.KEYCHAIN -> "Certificado do Android\n${c.descricao}"
        }
        botaoDesbloquear.visibility = if (c.fonte == Certificados.Fonte.PFX) android.view.View.VISIBLE else android.view.View.GONE
        botaoDesbloquear.text = if (c.precisaSenha) "Desbloquear (digitar a senha)" else "Bloquear (esquecer a senha)"
    }

    private fun atualizarRegistro() {
        val linhas = app.registro.todas()
        textoRegistro.text = if (linhas.isEmpty()) "Nenhuma requisição ainda." else linhas.take(15).joinToString("\n") { it.linha() }
    }

    private fun copiarRegistro() {
        val texto = app.registro.todas().joinToString("\n\n") { it.linha() + "\n" + it.detalhe }
        servico<ClipboardManager>().setPrimaryClip(ClipData.newPlainText("Registro do Assinador PJe", texto))
        Toast.makeText(this, "Registro copiado (sem cookies de sessão)", Toast.LENGTH_SHORT).show()
    }

    // --- Certificado -----------------------------------------------------------------------

    private fun escolherPfx() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/x-pkcs12", "application/pkcs12", "application/octet-stream", "*/*"))
        startActivityForResult(intent, PEDIDO_PFX)
    }

    @Deprecated("API antiga, suficiente aqui")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val uri = data?.data
        if (requestCode == PEDIDO_PFX && resultCode == RESULT_OK && uri != null) {
            pedirSenha("Senha do arquivo do certificado") { senha -> importar(uri, senha) }
        }
    }

    private fun importar(uri: Uri, senha: CharArray) {
        Thread {
            val erro = runCatching { app.certificados.importarPfx(uri, senha) }.exceptionOrNull()
            runOnUiThread {
                atualizarCertificado()
                Toast.makeText(
                    this,
                    erro?.let { "Não foi possível importar: ${it.message}" } ?: "Certificado importado",
                    Toast.LENGTH_LONG,
                ).show()
            }
        }.start()
    }

    private fun escolherKeyChain() {
        KeyChain.choosePrivateKeyAlias(this, { alias ->
            if (alias == null) return@choosePrivateKeyAlias
            val erro = runCatching { app.certificados.usarKeyChain(alias) }.exceptionOrNull()
            runOnUiThread {
                atualizarCertificado()
                if (erro != null) Toast.makeText(this, "Erro: ${erro.message}", Toast.LENGTH_LONG).show()
            }
        }, arrayOf("RSA"), null, null, -1, null)
    }

    private fun alternarBloqueio() {
        val c = app.certificados
        if (!c.precisaSenha) {
            c.bloquear()
            atualizarCertificado()
            return
        }
        pedirSenha("Senha do certificado") { senha ->
            val erro = runCatching { c.desbloquear(senha) }.exceptionOrNull()
            atualizarCertificado()
            if (erro != null) Toast.makeText(this, erro.message ?: "Senha incorreta", Toast.LENGTH_LONG).show()
        }
    }

    private fun confirmarRemocao() {
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Light_Dialog_Alert)
            .setMessage("Remover o certificado deste app? (Certificados instalados no Android continuam no sistema.)")
            .setPositiveButton("Remover") { _, _ -> app.certificados.remover(); atualizarCertificado() }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun pedirSenha(titulo: String, aoConfirmar: (CharArray) -> Unit) {
        val campo = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            hint = "Senha"
        }
        val caixa = Ui.coluna(this, 20).apply { addView(campo) }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Light_Dialog_Alert)
            .setTitle(titulo)
            .setView(caixa)
            .setPositiveButton("OK") { _, _ -> aoConfirmar(campo.text.toString().toCharArray()) }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    // --- PJe -------------------------------------------------------------------------------

    private fun escolherTribunal(aoEscolher: (String) -> Unit) {
        val ultimo = prefs.getString("ultimo_endereco", null)
        val opcoes = buildList {
            if (ultimo != null && Tribunais.lista.none { it.second == ultimo }) add("Último: $ultimo" to ultimo)
            addAll(Tribunais.lista)
            add("Outro endereço…" to "")
        }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Light_Dialog_Alert)
            .setTitle("Qual PJe?")
            .setItems(opcoes.map { it.first }.toTypedArray()) { _, i ->
                val url = opcoes[i].second
                if (url.isEmpty()) pedirEndereco(aoEscolher) else lembrarEUsar(url, aoEscolher)
            }
            .show()
    }

    private fun pedirEndereco(aoEscolher: (String) -> Unit) {
        val campo = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setText("https://")
        }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Light_Dialog_Alert)
            .setTitle("Endereço do PJe")
            .setView(Ui.coluna(this, 20).apply { addView(campo) })
            .setPositiveButton("Abrir") { _, _ ->
                val url = campo.text.toString().trim()
                if (url.startsWith("https://")) lembrarEUsar(url, aoEscolher)
                else Toast.makeText(this, "Use um endereço https://", Toast.LENGTH_LONG).show()
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun lembrarEUsar(url: String, aoEscolher: (String) -> Unit) {
        prefs.edit().putString("ultimo_endereco", url).apply()
        aoEscolher(url)
    }

    private fun abrirNoApp(url: String) {
        startActivity(Intent(this, PjeWebActivity::class.java).putExtra(PjeWebActivity.EXTRA_URL, url))
    }

    private fun abrirNoNavegador(url: String) {
        if (!PjeOfficeService.ativo) ligarServidor()
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (e: Exception) {
            Toast.makeText(this, "Nenhum navegador encontrado", Toast.LENGTH_LONG).show()
        }
    }

    // --- Servidor local --------------------------------------------------------------------

    private fun ligarServidor() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), PEDIDO_NOTIFICACOES)
        }
        startForegroundService(Intent(this, PjeOfficeService::class.java))
    }

    private fun desligarServidor() {
        stopService(Intent(this, PjeOfficeService::class.java))
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PEDIDO_NOTIFICACOES && grantResults.firstOrNull() != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(
                this,
                "Sem notificações não é possível confirmar assinaturas vindas do Chrome. Use o navegador do app.",
                Toast.LENGTH_LONG,
            ).show()
        }
    }

    companion object {
        private const val PEDIDO_PFX = 1
        private const val PEDIDO_NOTIFICACOES = 2
    }
}
