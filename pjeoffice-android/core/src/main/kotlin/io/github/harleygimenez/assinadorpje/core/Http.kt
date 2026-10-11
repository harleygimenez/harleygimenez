package io.github.harleygimenez.assinadorpje.core

import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

data class RespostaHttp(val status: Int, val corpo: String) {
    /** Como o PJeOffice (`PjeWebCodec.isSuccess`): 2xx ou 304. */
    val sucesso: Boolean get() = status in 200..299 || status == 304
}

/** Envio das assinaturas ao tribunal. Interface para poder simular nos testes. */
fun interface ClienteHttp {
    fun post(url: String, tipoConteudo: String, corpo: ByteArray, cabecalhos: Map<String, String>): RespostaHttp
}

object Formulario {
    fun codificar(campos: List<Pair<String, String>>): ByteArray =
        campos.joinToString("&") { (k, v) -> enc(k) + "=" + enc(v) }.toByteArray(Charsets.UTF_8)

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")
}

class ClienteHttpPadrao(
    private val timeoutMs: Int = 60_000,
    private val agente: String = Protocolo.USER_AGENT,
) : ClienteHttp {
    override fun post(url: String, tipoConteudo: String, corpo: ByteArray, cabecalhos: Map<String, String>): RespostaHttp {
        val conexao = URL(url).openConnection() as HttpURLConnection
        try {
            conexao.requestMethod = "POST"
            conexao.connectTimeout = timeoutMs
            conexao.readTimeout = timeoutMs
            conexao.doOutput = true
            conexao.instanceFollowRedirects = false
            conexao.useCaches = false
            conexao.setRequestProperty("Content-Type", tipoConteudo)
            conexao.setRequestProperty("User-Agent", agente)
            for ((k, v) in cabecalhos) conexao.setRequestProperty(k, v)
            conexao.setFixedLengthStreamingMode(corpo.size)
            conexao.outputStream.use { it.write(corpo) }
            val status = conexao.responseCode
            val fluxo = if (status >= 400) conexao.errorStream else conexao.inputStream
            val texto = fluxo?.use { it.readBytes().toString(Charsets.UTF_8) }.orEmpty()
            return RespostaHttp(status, texto)
        } finally {
            conexao.disconnect()
        }
    }
}
