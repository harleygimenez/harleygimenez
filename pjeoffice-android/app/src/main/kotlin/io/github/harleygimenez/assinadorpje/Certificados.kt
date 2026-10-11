package io.github.harleygimenez.assinadorpje

import android.content.Context
import android.net.Uri
import android.security.KeyChain
import io.github.harleygimenez.assinadorpje.core.Assinante
import io.github.harleygimenez.assinadorpje.core.AssinanteJca
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.security.KeyStore
import java.security.PrivateKey
import java.security.cert.X509Certificate
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Onde está o certificado do usuário:
 * - [Fonte.PFX]: arquivo A1 (.pfx/.p12) copiado para a área privada do app.
 *   O arquivo continua protegido pela própria senha; a senha só fica na
 *   memória enquanto o app está aberto (nunca é gravada).
 * - [Fonte.KEYCHAIN]: certificado instalado no Android (Configurações >
 *   Segurança > Credenciais). A chave nunca sai do armazenamento do sistema.
 */
class Certificados(private val ctx: Context) {

    enum class Fonte { NENHUM, PFX, KEYCHAIN, TOKEN }

    private val prefs = ctx.getSharedPreferences("certificado", Context.MODE_PRIVATE)
    private val arquivoPfx: File get() = File(ctx.filesDir, "certificado.p12")

    @Volatile
    private var desbloqueado: Assinante? = null

    val fonte: Fonte
        get() = runCatching { Fonte.valueOf(prefs.getString("fonte", null) ?: "NENHUM") }.getOrDefault(Fonte.NENHUM)

    /** Titular e validade, para exibir na tela. */
    val descricao: String get() = prefs.getString("descricao", null).orEmpty()

    val precisaSenha: Boolean get() = fonte == Fonte.PFX && desbloqueado == null

    /** Valida a senha, guarda o arquivo e deixa o certificado desbloqueado. Bloqueante. */
    fun importarPfx(uri: Uri, senha: CharArray) {
        val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw IOException("Não foi possível ler o arquivo")
        val assinante = carregarPfx(bytes, senha)
        arquivoPfx.writeBytes(bytes)
        prefs.edit()
            .putString("fonte", Fonte.PFX.name)
            .putString("descricao", descrever(assinante.cadeia.first()))
            .remove("alias")
            .apply()
        desbloqueado = assinante
    }

    fun desbloquear(senha: CharArray) {
        desbloqueado = carregarPfx(arquivoPfx.readBytes(), senha)
    }

    fun bloquear() {
        desbloqueado = null
    }

    /** Usa um certificado já instalado no Android. Bloqueante (não chamar na thread principal). */
    fun usarKeyChain(alias: String) {
        val cadeia = KeyChain.getCertificateChain(ctx, alias)
            ?: throw IOException("Não foi possível ler o certificado escolhido")
        prefs.edit()
            .putString("fonte", Fonte.KEYCHAIN.name)
            .putString("alias", alias)
            .putString("descricao", descrever(cadeia.first()))
            .apply()
        arquivoPfx.delete()
        desbloqueado = null
    }

    /**
     * Passa a usar o token A3 (StarSign). Só guarda a descrição lida no
     * diagnóstico; a assinatura abre o token e pede o PIN a cada uso.
     */
    fun usarToken(descricao: String) {
        prefs.edit()
            .putString("fonte", Fonte.TOKEN.name)
            .putString("descricao", descricao)
            .remove("alias")
            .apply()
        arquivoPfx.delete()
        desbloqueado = null
    }

    fun remover() {
        prefs.edit().clear().apply()
        arquivoPfx.delete()
        desbloqueado = null
    }

    /** O assinante pronto para uso, ou `null`. Bloqueante (KeyChain faz IPC). */
    fun assinante(): Assinante? = when (fonte) {
        Fonte.PFX -> desbloqueado
        Fonte.KEYCHAIN -> {
            val alias = prefs.getString("alias", null)
            val chave = alias?.let { KeyChain.getPrivateKey(ctx, it) }
            val cadeia = alias?.let { KeyChain.getCertificateChain(ctx, it) }
            if (chave == null || cadeia.isNullOrEmpty()) null else AssinanteJca(chave, cadeia.toList())
        }
        // O token é aberto sob demanda (precisa do PIN e do USB); ver AcessoToken.
        Fonte.TOKEN -> null
        Fonte.NENHUM -> null
    }

    private fun carregarPfx(bytes: ByteArray, senha: CharArray): Assinante {
        val ks = KeyStore.getInstance("PKCS12")
        try {
            ks.load(ByteArrayInputStream(bytes), senha)
        } catch (e: IOException) {
            throw IllegalArgumentException("Senha incorreta ou arquivo inválido", e)
        }
        val alias = ks.aliases().toList().firstOrNull { ks.isKeyEntry(it) }
            ?: throw IllegalArgumentException("O arquivo não contém chave privada")
        val chave = ks.getKey(alias, senha) as PrivateKey
        val cadeia = ks.getCertificateChain(alias).map { it as X509Certificate }
        return AssinanteJca(chave, cadeia)
    }

    companion object {
        fun descrever(c: X509Certificate): String {
            val nome = Regex("CN=([^,]+)").find(c.subjectX500Principal.name)?.groupValues?.get(1)
                ?: c.subjectX500Principal.name
            val validade = SimpleDateFormat("dd/MM/yyyy", Locale.US).format(c.notAfter)
            return "$nome\nVálido até $validade"
        }
    }
}
