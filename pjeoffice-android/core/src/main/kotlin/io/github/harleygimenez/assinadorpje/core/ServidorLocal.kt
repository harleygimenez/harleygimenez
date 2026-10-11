package io.github.harleygimenez.assinadorpje.core

import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketException
import java.net.URLDecoder
import java.util.Base64
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Respostas idênticas às do PJeOffice (`PjeWebTaskResponse`): a página lê a
 * largura da imagem — GIF 1x1 = sucesso, PNG 2x1 = falha. Requisições POST
 * recebem `{"success": true|false}`.
 */
object RespostaPje {
    class Corpo(val tipo: String, val bytes: ByteArray)

    private fun b64(s: String) = Base64.getDecoder().decode(s)

    val IMAGEM_SUCESSO = Corpo("image/gif", b64("R0lGODlhAQABAPAAAEz/AAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=="))
    val IMAGEM_FALHA = Corpo(
        "image/png",
        b64("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAABHNCSVQICAgIfAhkiAAAABFJREFUCJlj/M/A8J+BgYEBAA0FAgD+6nhnAAAAAElFTkSuQmCC"),
    )
    val JSON_SUCESSO = Corpo("application/json", """{"success": true}""".toByteArray())
    val JSON_FALHA = Corpo("application/json", """{"success": false}""".toByteArray())
    val VERSAO = Corpo("application/json", """{ "versao": "${Protocolo.VERSAO}", "success": true }""".toByteArray())

    fun de(sucesso: Boolean, json: Boolean): Corpo = when {
        json && sucesso -> JSON_SUCESSO
        json -> JSON_FALHA
        sucesso -> IMAGEM_SUCESSO
        else -> IMAGEM_FALHA
    }
}

/**
 * Servidor HTTP mínimo que imita o PJeOffice em `127.0.0.1:8800`, para o PJe
 * aberto no Chrome do celular conseguir falar com o app.
 *
 * Rotas (as mesmas do `PjeWebServer`):
 * - `/pjeOffice/`             → disponibilidade
 * - `/pjeOffice/versao/`      → `{ "versao": ..., "success": true }`
 * - `/pjeOffice/requisicao/`  → executa `?r=<json>` (GET ou POST)
 * - `OPTIONS *`               → pré-voo CORS / Private Network Access
 */
class ServidorLocal(
    private val processador: Processador,
    val porta: Int = Protocolo.PORTA_HTTP,
    private val endereco: InetAddress = InetAddress.getByName("127.0.0.1"),
) {
    private var socket: ServerSocket? = null
    private var pool: ExecutorService? = null

    val ativo: Boolean get() = socket?.isClosed == false

    /** Porta realmente aberta (útil com `porta = 0` nos testes). */
    val portaAberta: Int get() = socket?.localPort ?: -1

    @Synchronized
    fun iniciar() {
        if (ativo) return
        val s = ServerSocket()
        s.reuseAddress = true
        s.bind(java.net.InetSocketAddress(endereco, porta), 50)
        val p = Executors.newCachedThreadPool()
        socket = s
        pool = p
        Thread({
            while (!s.isClosed) {
                val cliente = try { s.accept() } catch (e: SocketException) { break }
                p.execute { atender(cliente) }
            }
        }, "assinador-pje-servidor").apply { isDaemon = true }.start()
    }

    @Synchronized
    fun parar() {
        runCatching { socket?.close() }
        pool?.shutdownNow()
        socket = null
        pool = null
    }

    private fun atender(cliente: Socket) {
        cliente.use { c ->
            c.soTimeout = 30_000
            val saida = c.getOutputStream()
            if (!c.inetAddress.isLoopbackAddress) {
                responder(saida, 401, null, null)
                return
            }
            val pedido = try { lerPedido(BufferedInputStream(c.getInputStream())) } catch (e: Exception) { null }
            if (pedido == null) {
                responder(saida, 400, null, null)
                return
            }
            val origin = pedido.cabecalhos["origin"]
            if (pedido.metodo == "OPTIONS") {
                responder(saida, 204, null, origin)
                return
            }
            val post = pedido.metodo == "POST"
            val corpo = when (pedido.caminho.trimEnd('/').lowercase()) {
                "/pjeoffice" -> RespostaPje.de(true, post)
                "/pjeoffice/versao" -> RespostaPje.VERSAO
                "/pjeoffice/logout", "/pjeoffice/shutdown" -> RespostaPje.de(true, post)
                "/pjeoffice/requisicao" -> {
                    val r = pedido.parametros["r"] ?: if (post) corpoComoRequisicao(pedido.corpo) else null
                    val sucesso = if (r == null) false
                    else processador.processar(r, origin ?: pedido.cabecalhos["referer"]).sucesso
                    RespostaPje.de(sucesso, post)
                }
                else -> null
            }
            if (corpo == null) responder(saida, 404, null, origin) else responder(saida, 200, corpo, origin)
        }
    }

    /** Aceita também o JSON no corpo do POST (não é o padrão do PJe, mas não custa). */
    private fun corpoComoRequisicao(corpo: ByteArray): String? {
        val texto = corpo.toString(Charsets.UTF_8).trim()
        if (texto.isEmpty()) return null
        return if (texto.startsWith("{")) texto else parametros(texto)["r"]
    }

    private class Pedido(
        val metodo: String,
        val caminho: String,
        val parametros: Map<String, String>,
        val cabecalhos: Map<String, String>,
        val corpo: ByteArray,
    )

    private fun lerPedido(entrada: InputStream): Pedido? {
        val linha = lerLinha(entrada) ?: return null
        val partes = linha.split(' ')
        if (partes.size < 2) return null
        val metodo = partes[0].uppercase()
        val alvo = partes[1]
        val cabecalhos = HashMap<String, String>()
        while (true) {
            val h = lerLinha(entrada) ?: break
            if (h.isEmpty()) break
            val i = h.indexOf(':')
            if (i > 0) cabecalhos[h.substring(0, i).trim().lowercase()] = h.substring(i + 1).trim()
        }
        val tamanho = cabecalhos["content-length"]?.toIntOrNull() ?: 0
        require(tamanho in 0..LIMITE_CORPO) { "Corpo grande demais" }
        val corpo = ByteArray(tamanho)
        var lido = 0
        while (lido < tamanho) {
            val n = entrada.read(corpo, lido, tamanho - lido)
            if (n < 0) break
            lido += n
        }
        return Pedido(metodo, alvo.substringBefore('?'), parametros(alvo.substringAfter('?', "")), cabecalhos, corpo)
    }

    private fun lerLinha(entrada: InputStream): String? {
        val b = ByteArrayOutputStream()
        while (true) {
            val c = entrada.read()
            if (c < 0) return if (b.size() == 0) null else b.toString("UTF-8")
            if (c == '\n'.code) break
            if (c != '\r'.code) b.write(c)
            require(b.size() <= LIMITE_LINHA) { "Linha grande demais" }
        }
        return b.toString("UTF-8")
    }

    private fun responder(saida: OutputStream, status: Int, corpo: RespostaPje.Corpo?, origin: String?) {
        val texto = when (status) {
            200 -> "OK"; 204 -> "No Content"; 400 -> "Bad Request"; 401 -> "Unauthorized"
            else -> "Not Found"
        }
        val bytes = corpo?.bytes ?: ByteArray(0)
        val sb = StringBuilder()
        sb.append("HTTP/1.1 $status $texto\r\n")
        if (corpo != null) sb.append("Content-Type: ${corpo.tipo}\r\n")
        sb.append("Content-Length: ${bytes.size}\r\n")
        sb.append("Cache-Control: no-store\r\n")
        // Mesmos cabeçalhos do CorsFilter do PJeOffice, devolvendo a origem exata
        // (com credenciais o navegador não aceita "*").
        sb.append("Access-Control-Allow-Origin: ${origin ?: "*"}\r\n")
        sb.append("Access-Control-Allow-Private-Network: true\r\n")
        sb.append("Access-Control-Allow-Methods: GET, OPTIONS, POST\r\n")
        sb.append("Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept, Authorization\r\n")
        if (origin != null) sb.append("Access-Control-Allow-Credentials: true\r\n")
        sb.append("Access-Control-Max-Age: 86400\r\n")
        sb.append("Vary: Origin\r\n")
        sb.append("Connection: close\r\n\r\n")
        saida.write(sb.toString().toByteArray(Charsets.US_ASCII))
        saida.write(bytes)
        saida.flush()
    }

    companion object {
        private const val LIMITE_CORPO = 10 * 1024 * 1024
        private const val LIMITE_LINHA = 256 * 1024

        fun parametros(consulta: String): Map<String, String> =
            consulta.split('&').filter { it.isNotEmpty() }.associate {
                val k = it.substringBefore('=')
                val v = it.substringAfter('=', "")
                URLDecoder.decode(k, "UTF-8") to URLDecoder.decode(v, "UTF-8")
            }
    }
}
