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
    private val maxRedirecionamentos: Int = 5,
) : ClienteHttp {
    override fun post(url: String, tipoConteudo: String, corpo: ByteArray, cabecalhos: Map<String, String>): RespostaHttp {
        // O login clássico do PJe (logarPJeOffice.seam) autentica a sessão e
        // responde 302 para a área logada — é o caminho de sucesso. Seguimos o
        // redirect (como o navegador), carregando os cookies/cabeçalhos.
        var metodo = "POST"
        var alvo = url
        var conteudo: ByteArray? = corpo
        var tipo: String? = tipoConteudo
        var ultima = RespostaHttp(0, "")
        for (salto in 0..maxRedirecionamentos) {
            val conexao = URL(alvo).openConnection() as HttpURLConnection
            try {
                conexao.requestMethod = metodo
                conexao.connectTimeout = timeoutMs
                conexao.readTimeout = timeoutMs
                conexao.instanceFollowRedirects = false
                conexao.useCaches = false
                conexao.setRequestProperty("User-Agent", agente)
                for ((k, v) in cabecalhos) conexao.setRequestProperty(k, v)
                if (conteudo != null) {
                    conexao.doOutput = true
                    tipo?.let { conexao.setRequestProperty("Content-Type", it) }
                    conexao.setFixedLengthStreamingMode(conteudo!!.size)
                    conexao.outputStream.use { it.write(conteudo!!) }
                }
                val status = conexao.responseCode
                val local = conexao.getHeaderField("Location")
                if (status in 300..399 && !local.isNullOrEmpty() && salto < maxRedirecionamentos) {
                    alvo = URL(URL(alvo), local).toString()
                    // 301/302/303 viram GET sem corpo; 307/308 preservam método e corpo.
                    if (status != 307 && status != 308) { metodo = "GET"; conteudo = null; tipo = null }
                    ultima = RespostaHttp(status, "")
                    continue
                }
                val fluxo = if (status >= 400) conexao.errorStream else conexao.inputStream
                val texto = fluxo?.use { it.readBytes().toString(Charsets.UTF_8) }.orEmpty()
                return RespostaHttp(status, texto)
            } finally {
                conexao.disconnect()
            }
        }
        return ultima
    }
}
