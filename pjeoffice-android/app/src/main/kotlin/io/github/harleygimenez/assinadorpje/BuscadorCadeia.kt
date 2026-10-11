package io.github.harleygimenez.assinadorpje

import android.content.Context
import io.github.harleygimenez.assinadorpje.core.CompletadorCadeia
import java.net.HttpURLConnection
import java.net.URL
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.ConcurrentHashMap

/**
 * Completa a cadeia de certificados no aparelho: primeiro pelas CAs embutidas
 * (cadeias da AC-OAB em `assets/cadeia-icp/`), depois pela rede (campo AIA).
 * Mantém um cache em memória por URL.
 */
object BuscadorCadeia : CompletadorCadeia.Buscador {
    private val cache = ConcurrentHashMap<String, ByteArray>()

    fun instalar(ctx: Context) {
        CompletadorCadeia.padrao = this
        CompletadorCadeia.caisLocais = carregarEmbutidas(ctx)
    }

    /** Lê as cadeias (.p7c/.cer/.pem) de `assets/cadeia-icp/`. */
    private fun carregarEmbutidas(ctx: Context): List<X509Certificate> {
        val cf = CertificateFactory.getInstance("X.509")
        val certs = mutableListOf<X509Certificate>()
        try {
            val assets = ctx.assets
            for (nome in assets.list("cadeia-icp").orEmpty()) {
                runCatching {
                    assets.open("cadeia-icp/$nome").use { entrada ->
                        val bytes = entrada.readBytes()
                        cf.generateCertificates(bytes.inputStream()).forEach { certs += it as X509Certificate }
                    }
                }
            }
        } catch (e: Exception) {
            // Sem assets de cadeia: segue só com a rede (AIA).
        }
        return certs.distinctBy { it.subjectX500Principal to it.serialNumber }
    }

    override fun buscar(url: String): ByteArray? {
        if (!url.startsWith("http://") && !url.startsWith("https://")) return null
        cache[url]?.let { return it }
        return try {
            val con = URL(url).openConnection() as HttpURLConnection
            con.connectTimeout = 10_000
            con.readTimeout = 10_000
            con.instanceFollowRedirects = true
            con.setRequestProperty("User-Agent", "AssinadorPJeAndroid")
            try {
                if (con.responseCode !in 200..299) return null
                val bytes = con.inputStream.use { it.readBytes() }
                if (bytes.size > 2 * 1024 * 1024) return null // CA cert/p7b é pequeno
                cache[url] = bytes
                bytes
            } finally {
                con.disconnect()
            }
        } catch (e: Exception) {
            null
        }
    }
}
