package io.github.harleygimenez.assinadorpje.core

import java.net.URI

/**
 * Requisição enviada pela página do PJe ao assinador local
 * (`http://127.0.0.1:8800/pjeOffice/requisicao/?r=<json>`).
 *
 * O campo `tarefa` costuma chegar como uma string contendo outro JSON;
 * também aceitamos um objeto já aninhado.
 */
data class Requisicao(
    val aplicacao: String?,
    val servidor: String,
    val sessao: String?,
    val codigoSeguranca: String?,
    val tarefaId: String,
    val tarefa: Map<String, Any?>,
) {
    /** Host do servidor do tribunal (ex.: `pje.trf3.jus.br`). */
    val host: String get() = runCatching { URI(servidor).host }.getOrNull().orEmpty()

    /**
     * Endereço de envio: sempre `servidor + caminho`, como no PJeOffice — a
     * assinatura nunca vai para um host diferente do servidor autorizado.
     */
    fun resolver(caminho: String): String {
        val base = servidor.trimEnd('/')
        return if (caminho.startsWith("/")) base + caminho else "$base/$caminho"
    }

    /** Versão resumida, sem cookies de sessão, para o registro exibido ao usuário. */
    fun resumo(): String = Json.escrever(
        linkedMapOf(
            "aplicacao" to aplicacao,
            "servidor" to servidor,
            "tarefaId" to tarefaId,
            "tarefa" to tarefa,
            "sessao" to if (sessao.isNullOrEmpty()) null else "(${sessao.length} caracteres omitidos)",
        )
    )

    companion object {
        fun deJson(texto: String): Requisicao {
            val obj = Json.lerObjeto(texto)
            val tarefa = when (val t = obj["tarefa"]) {
                null -> emptyMap()
                is String -> if (t.isBlank()) emptyMap() else Json.lerObjeto(t)
                is Map<*, *> -> t.entries.associate { it.key.toString() to it.value }
                else -> throw Json.ErroJson("Campo 'tarefa' inválido")
            }
            val servidor = obj.texto("servidor") ?: throw Json.ErroJson("Campo 'servidor' ausente")
            val tarefaId = obj.texto("tarefaId") ?: throw Json.ErroJson("Campo 'tarefaId' ausente")
            return Requisicao(
                aplicacao = obj.texto("aplicacao"),
                servidor = servidor,
                sessao = obj.texto("sessao"),
                codigoSeguranca = obj.texto("codigoSeguranca"),
                tarefaId = tarefaId,
                tarefa = tarefa,
            )
        }
    }
}

internal fun Map<String, Any?>.texto(chave: String): String? = when (val v = this[chave]) {
    null -> null
    is String -> v
    else -> v.toString()
}

internal fun Map<String, Any?>.booleano(chave: String): Boolean = when (val v = this[chave]) {
    is Boolean -> v
    is String -> v.equals("true", ignoreCase = true)
    else -> false
}

@Suppress("UNCHECKED_CAST")
internal fun Map<String, Any?>.listaDeObjetos(chave: String): List<Map<String, Any?>> =
    (this[chave] as? List<*>)?.mapNotNull { it as? Map<String, Any?> } ?: emptyList()
