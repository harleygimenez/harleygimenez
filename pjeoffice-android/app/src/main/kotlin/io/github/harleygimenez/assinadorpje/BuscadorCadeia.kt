package io.github.harleygimenez.assinadorpje

import io.github.harleygimenez.assinadorpje.core.CompletadorCadeia
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/**
 * Baixa certificados de CA pela rede (campo AIA), para completar a cadeia
 * ICP-Brasil/AC-OAB no aparelho. Mantém um cache em memória por URL.
 */
object BuscadorCadeia : CompletadorCadeia.Buscador {
    private val cache = ConcurrentHashMap<String, ByteArray>()

    fun instalar() {
        CompletadorCadeia.padrao = this
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
