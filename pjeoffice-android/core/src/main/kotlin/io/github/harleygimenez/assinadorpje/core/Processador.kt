package io.github.harleygimenez.assinadorpje.core

import java.net.URI
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/** Quão confiável é o servidor que pediu a assinatura. */
enum class Autorizacao {
    /** `codigoSeguranca` decifrado com a chave do CNJ autoriza este servidor. */
    CNJ,

    /** HTTPS num domínio `*.jus.br`, mas o código de segurança não confere. */
    DOMINIO_JUDICIARIO,

    NEGADA,
}

object Seguranca {
    fun autorizacao(r: Requisicao): Autorizacao {
        if (CodigoSeguranca.autoriza(r.codigoSeguranca, r.aplicacao, r.servidor)) return Autorizacao.CNJ
        val uri = runCatching { URI(r.servidor) }.getOrNull() ?: return Autorizacao.NEGADA
        val host = uri.host?.lowercase() ?: return Autorizacao.NEGADA
        return if (uri.scheme.equals("https", ignoreCase = true) && host.endsWith(".jus.br")) {
            Autorizacao.DOMINIO_JUDICIARIO
        } else {
            Autorizacao.NEGADA
        }
    }

    /** `esquema://host:porta`, como no `PjeSecurityAgent` do PJeOffice. */
    fun origem(url: String?): String? {
        val uri = runCatching { URI(url?.trim()?.lowercase() ?: return null) }.getOrNull() ?: return null
        val esquema = uri.scheme ?: return null
        val host = uri.host ?: return null
        val porta = when {
            uri.port >= 0 -> uri.port
            esquema == "https" -> 443
            esquema == "http" -> 80
            else -> -1
        }
        return "$esquema://$host:$porta"
    }

    /**
     * Proteção contra CSRF: a página que chamou o assinador tem de ser do
     * mesmo servidor indicado na requisição. Sem isso, um site qualquer
     * poderia mandar o usuário "logar" uma sessão do atacante.
     */
    fun mesmaOrigem(origemChamador: String?, servidor: String): Boolean {
        val a = origem(origemChamador) ?: return false
        return a == origem(servidor)
    }
}

/**
 * Pergunta ao usuário se a requisição pode ser executada e devolve o
 * [Assinante] a usar (o app pode pedir a senha do .pfx nesse momento), ou
 * `null` se o usuário recusar / não houver certificado.
 */
fun interface Confirmador {
    fun confirmar(pedido: Pedido): Assinante?
}

class Pedido(val requisicao: Requisicao, val descricao: String, val autorizacao: Autorizacao)

data class EntradaRegistro(
    val quando: Date,
    val tarefaId: String,
    val host: String,
    val sucesso: Boolean,
    val mensagem: String,
    val detalhe: String,
) {
    fun linha(): String {
        val hora = SimpleDateFormat("dd/MM HH:mm:ss", Locale.US).format(quando)
        return "$hora ${if (sucesso) "OK" else "ERRO"} $tarefaId @ $host — $mensagem"
    }
}

/** Histórico em memória das últimas requisições, para diagnóstico no app. */
class Registro(private val limite: Int = 50) {
    private val entradas = ArrayDeque<EntradaRegistro>()

    @Volatile
    var aoMudar: (() -> Unit)? = null

    fun adicionar(e: EntradaRegistro) {
        synchronized(entradas) {
            entradas.addFirst(e)
            while (entradas.size > limite) entradas.removeLast()
        }
        aoMudar?.invoke()
    }

    fun todas(): List<EntradaRegistro> = synchronized(entradas) { entradas.toList() }

    fun limpar() {
        synchronized(entradas) { entradas.clear() }
        aoMudar?.invoke()
    }
}

class Processador(
    private val confirmador: Confirmador,
    private val http: ClienteHttp = ClienteHttpPadrao(),
    val registro: Registro = Registro(),
    private val tarefas: Map<String, Tarefa> = Tarefas.conhecidas,
    /** Cookies do navegador embutido para o servidor, quando houver. */
    private val cookiesPara: (String) -> String? = { null },
) {
    private val ocupado = AtomicBoolean(false)

    /**
     * Executa uma requisição. [origemChamador] é o `Origin` da página que
     * chamou (ou a URL da página aberta no navegador embutido).
     */
    fun processar(json: String, origemChamador: String?): Resultado {
        val requisicao = try {
            Requisicao.deJson(json)
        } catch (e: Exception) {
            return registrar("?", "?", Resultado(false, "Requisição inválida: ${e.message}"), json.take(500))
        }
        val detalhe = requisicao.resumo()
        if (!ocupado.compareAndSet(false, true)) {
            return registrar(requisicao.tarefaId, requisicao.host, Resultado(false, "Ainda há uma operação em andamento"), detalhe)
        }
        val r = try {
            executar(requisicao, origemChamador)
        } finally {
            ocupado.set(false)
        }
        return registrar(requisicao.tarefaId, requisicao.host, r, detalhe)
    }

    private fun executar(requisicao: Requisicao, origemChamador: String?): Resultado {
        val autorizacao = Seguranca.autorizacao(requisicao)
        if (autorizacao == Autorizacao.NEGADA) {
            return Resultado(false, "Servidor não reconhecido pelo CNJ: ${requisicao.servidor}")
        }
        if (!Seguranca.mesmaOrigem(origemChamador, requisicao.servidor)) {
            return Resultado(false, "Origem da requisição ($origemChamador) difere do servidor — rejeitada por segurança")
        }
        val tarefa = tarefas[requisicao.tarefaId]
            ?: return Resultado(false, "Tarefa ainda não suportada no Android: ${requisicao.tarefaId}")
        val assinante = try {
            confirmador.confirmar(Pedido(requisicao, tarefa.descrever(requisicao), autorizacao))
        } catch (e: Exception) {
            return Resultado(false, "Erro ao obter o certificado: ${e.message}")
        } ?: return Resultado(false, "Cancelado pelo usuário")
        return try {
            tarefa.executar(Contexto(requisicao, assinante, http, cookiesPara(requisicao.servidor)))
        } catch (e: ErroTarefa) {
            Resultado(false, e.message ?: "Erro na tarefa")
        } catch (e: Exception) {
            Resultado(false, "Falha na tarefa: ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    private fun registrar(tarefaId: String, host: String, r: Resultado, detalhe: String): Resultado {
        registro.adicionar(EntradaRegistro(Date(), tarefaId, host, r.sucesso, r.mensagem, detalhe))
        return r
    }
}
