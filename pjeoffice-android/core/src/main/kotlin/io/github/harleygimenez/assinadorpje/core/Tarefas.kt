package io.github.harleygimenez.assinadorpje.core

import java.util.Base64

/**
 * Constantes do protocolo. Formatos conferidos no código do PJeOffice Pro
 * publicado sob licença MIT em https://github.com/tomvieira/signer4j-pje
 * (pacotes `br.jus.cnj.pje.office.*`).
 */
object Protocolo {
    /** Versão informada ao tribunal no cabeçalho `versao`. */
    const val VERSAO = "2.5.16"
    const val USER_AGENT = "PjeOffice-PRO ($VERSAO)"
    const val PORTA_HTTP = 8800
}

data class Resultado(val sucesso: Boolean, val mensagem: String)

class Contexto(
    val requisicao: Requisicao,
    val assinante: Assinante,
    val http: ClienteHttp,
    /** Cookies do navegador embutido (inclui os HttpOnly, que o JS da página não enxerga). */
    val cookiesNavegador: String? = null,
) {
    /** Como `AstractPjeClient.createOutput`: `Cookie` = sessão e `versao`. */
    fun cabecalhos(extras: Map<String, String> = emptyMap()): Map<String, String> {
        val cabecalhos = linkedMapOf("versao" to Protocolo.VERSAO)
        val cookie = Cookies.juntar(cookiesNavegador, requisicao.sessao)
        if (cookie.isNotEmpty()) cabecalhos["Cookie"] = cookie
        cabecalhos.putAll(extras)
        return cabecalhos
    }

    fun postFormulario(caminho: String, campos: List<Pair<String, String>>): RespostaHttp =
        http.post(
            requisicao.resolver(caminho),
            "application/x-www-form-urlencoded; charset=UTF-8",
            Formulario.codificar(campos),
            cabecalhos(),
        )

    fun postJson(caminho: String, objeto: Any?): RespostaHttp =
        http.post(
            requisicao.resolver(caminho),
            "application/json; charset=UTF-8",
            Json.escrever(objeto).toByteArray(Charsets.UTF_8),
            cabecalhos(mapOf("Accept" to "application/json")),
        )
}

/** Uma tarefa do protocolo do PJeOffice (`tarefaId`). */
interface Tarefa {
    val id: String

    /** Texto mostrado ao usuário antes de assinar. */
    fun descrever(r: Requisicao): String

    fun executar(ctx: Contexto): Resultado
}

class ErroTarefa(mensagem: String) : Exception(mensagem)

private fun Map<String, Any?>.exigir(chave: String): String =
    texto(chave)?.takeIf { it.isNotEmpty() } ?: throw ErroTarefa("Parâmetro '$chave' não informado!")

/**
 * Como os verificadores do PJeOffice (`PjeWebClient.Checker`): respostas que
 * começam com `Erro:` são falha; nos envios de documentos, só `Sucesso` vale.
 */
private enum class Verificacao { NENHUMA, SE_ERRO, EXIGE_SUCESSO }

private fun verificar(resposta: RespostaHttp, verificacao: Verificacao, ok: String): Resultado {
    if (!resposta.sucesso) return Resultado(false, "Servidor retornou HTTP ${resposta.status}")
    val corpo = resposta.corpo
    if (verificacao != Verificacao.NENHUMA && corpo.startsWith("Erro:")) {
        val msg = corpo.removePrefix("Erro:").trim().ifEmpty { "Desconhecido" }
        return Resultado(false, "Servidor retornou erro: $msg")
    }
    if (verificacao == Verificacao.EXIGE_SUCESSO && corpo.isNotEmpty() && !corpo.startsWith("Sucesso")) {
        return Resultado(false, "Servidor não recebeu os dados enviados")
    }
    return Resultado(true, ok)
}

/** Login "clássico" (`PjeAutenticatorTask`): assina `mensagem`, envia formulário. */
object TarefaCnjAutenticador : Tarefa {
    override val id = "cnj.autenticador"

    override fun descrever(r: Requisicao) = "Entrar no PJe com seu certificado em ${r.host}"

    override fun executar(ctx: Contexto): Resultado {
        val t = ctx.requisicao.tarefa
        val enviarPara = t.exigir("enviarPara")
        val mensagem = t.exigir("mensagem")
        val algoritmo = t.texto("algoritmoAssinatura") ?: "MD5withRSA"
        val assinatura = ctx.assinante.assinar(algoritmo, mensagem.toByteArray(Charsets.UTF_8))
        val resposta = ctx.postFormulario(
            enviarPara,
            listOf("assinatura" to b64(assinatura), "cadeiaCertificado" to ctx.assinante.cadeiaPkiPathBase64()),
        )
        return verificar(resposta, Verificacao.SE_ERRO, "Login enviado ao tribunal")
    }
}

/** Login no SSO do PJe (`PjeAutenticatorSSOTask`): corpo JSON com `uuid`. */
object TarefaSsoAutenticador : Tarefa {
    override val id = "sso.autenticador"

    override fun descrever(r: Requisicao) = "Entrar no PJe com seu certificado em ${r.host}"

    override fun executar(ctx: Contexto): Resultado {
        val t = ctx.requisicao.tarefa
        val enviarPara = t.exigir("enviarPara")
        val mensagem = t.exigir("mensagem")
        val token = t.exigir("token")
        val algoritmo = t.texto("algoritmoAssinatura") ?: "MD5withRSA"
        val assinatura = ctx.assinante.assinar(algoritmo, mensagem.toByteArray(Charsets.UTF_8))
        val resposta = ctx.postJson(
            enviarPara,
            linkedMapOf(
                "uuid" to token,
                "mensagem" to mensagem,
                "assinatura" to b64(assinatura),
                "certChain" to ctx.assinante.cadeiaPkiPathBase64(),
            ),
        )
        return verificar(resposta, Verificacao.NENHUMA, "Login enviado ao tribunal")
    }
}

/**
 * Assinatura de documentos por hash (`PjeAssinadorHashTask`): o PJe manda o
 * hash (hexadecimal) de cada documento; cada assinatura vai num POST próprio.
 */
object TarefaCnjAssinadorHash : Tarefa {
    override val id = "cnj.assinadorHash"

    override fun descrever(r: Requisicao): String {
        val n = r.tarefa.listaDeObjetos("arquivos").size
        return "Assinar $n documento(s) em ${r.host}"
    }

    override fun executar(ctx: Contexto): Resultado {
        val t = ctx.requisicao.tarefa
        val algoritmo = t.exigir("algoritmoAssinatura")
        val uploadUrl = t.exigir("uploadUrl")
        val modoTeste = t.booleano("modoTeste")
        val arquivos = t.listaDeObjetos("arquivos")
        if (arquivos.isEmpty()) return Resultado(false, "Não há dados a serem assinados")
        Algoritmos.resumoDe(algoritmo) // valida antes de começar

        val cadeia = if (modoTeste) b64("coração intrépido infalível".toByteArray()) else ctx.assinante.cadeiaPkiPathBase64()
        val falhas = mutableListOf<String>()
        for ((i, arquivo) in arquivos.withIndex()) {
            val id = arquivo.texto("id") ?: "[index: $i]"
            try {
                val hash = arquivo.exigir("hash")
                val assinatura = if (modoTeste) "ASSINATURA_MODO_TESTE".toByteArray()
                else ctx.assinante.assinar(algoritmo, Algoritmos.hex(hash))
                val campos = mutableListOf(
                    "assinatura" to b64(assinatura),
                    "cadeiaCertificado" to cadeia,
                    "id" to (arquivo.texto("id") ?: ""),
                    "codIni" to (arquivo.texto("codIni") ?: ""),
                    "hash" to hash,
                )
                arquivo["idTarefa"]?.let { campos += "idTarefa" to it.toString() }
                val r = verificar(ctx.postFormulario(uploadUrl, campos), Verificacao.EXIGE_SUCESSO, "ok")
                if (!r.sucesso) falhas += "documento $id: ${r.mensagem}"
            } catch (e: Exception) {
                falhas += "documento $id: ${e.message}"
            }
        }
        return if (falhas.isEmpty()) Resultado(true, "${arquivos.size} documento(s) assinado(s)")
        else Resultado(false, "Falha em ${falhas.size} de ${arquivos.size}: ${falhas.joinToString("; ")}")
    }
}

/**
 * Assinatura de conteúdos em Base64 (`PjeAssinadorBase64Task`): assina cada
 * `conteudoBase64` e devolve `[{hashDoc, assinaturaBase64}]` em JSON.
 */
object TarefaCnjAssinadorBase64 : Tarefa {
    override val id = "cnj.assinadorBase64"

    override fun descrever(r: Requisicao): String {
        val n = r.tarefa.listaDeObjetos("arquivos").size
        return "Assinar $n conteúdo(s) em ${r.host}"
    }

    override fun executar(ctx: Contexto): Resultado {
        val t = ctx.requisicao.tarefa
        val algoritmo = t.exigir("algoritmoAssinatura")
        val uploadUrl = t.exigir("uploadUrl")
        val arquivos = t.listaDeObjetos("arquivos")
        if (arquivos.isEmpty()) throw ErroTarefa("Parâmetro 'arquivos' não informado!")
        val saida = arquivos.mapNotNull { a ->
            val hashDoc = a.texto("hashDoc")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val conteudo = a.texto("conteudoBase64")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val assinatura = ctx.assinante.assinar(algoritmo, Base64.getMimeDecoder().decode(conteudo))
            linkedMapOf("hashDoc" to hashDoc, "assinaturaBase64" to b64(assinatura))
        }
        if (saida.isEmpty()) return Resultado(false, "Nenhum documento pôde ser assinado de um total de ${arquivos.size}")
        return verificar(ctx.postJson(uploadUrl, saida), Verificacao.EXIGE_SUCESSO, "${saida.size} conteúdo(s) assinado(s)")
    }
}

/** Envio só da cadeia do certificado (`PjeCertChainTask`). */
object TarefaCnjCertChain : Tarefa {
    override val id = "cnj.certchain"

    override fun descrever(r: Requisicao) = "Enviar os dados do seu certificado para ${r.host}"

    override fun executar(ctx: Contexto): Resultado {
        val uploadUrl = ctx.requisicao.tarefa.exigir("uploadUrl")
        val resposta = ctx.postFormulario(uploadUrl, listOf("cadeiaDeCertificadosBase64" to ctx.assinante.cadeiaPkiPathBase64()))
        return verificar(resposta, Verificacao.EXIGE_SUCESSO, "Certificado enviado")
    }
}

object Tarefas {
    val conhecidas: Map<String, Tarefa> = listOf(
        TarefaCnjAutenticador,
        TarefaSsoAutenticador,
        TarefaCnjAssinadorHash,
        TarefaCnjAssinadorBase64,
        TarefaCnjCertChain,
    ).associateBy { it.id }
}

object Cookies {
    /** Junta duas strings `a=1; b=2`; em nomes repetidos vale a segunda. */
    fun juntar(primeiro: String?, segundo: String?): String {
        val mapa = LinkedHashMap<String, String>()
        for (fonte in listOf(primeiro, segundo)) {
            fonte?.split(';')?.map { it.trim() }?.filter { it.contains('=') }?.forEach {
                mapa[it.substringBefore('=').trim()] = it.substringAfter('=').trim()
            }
        }
        return mapa.entries.joinToString("; ") { "${it.key}=${it.value}" }
    }
}

private fun b64(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)
