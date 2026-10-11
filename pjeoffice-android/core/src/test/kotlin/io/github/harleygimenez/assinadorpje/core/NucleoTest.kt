package io.github.harleygimenez.assinadorpje.core

import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.net.URLEncoder
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.interfaces.RSAPublicKey
import java.util.Base64
import javax.crypto.Cipher
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

const val SERVIDOR = "https://pje.trf3.jus.br/pje"
const val ORIGEM = "https://pje.trf3.jus.br"

class JsonTest {
    @Test
    fun `lê e escreve objetos aninhados`() {
        val texto = """{"a":"x\"yç","b":[1,2.5,true,null],"c":{"d":-3}}"""
        val obj = Json.lerObjeto(texto)
        assertEquals("x\"yç", obj["a"])
        assertEquals(listOf(1L, 2.5, true, null), obj["b"])
        assertEquals(mapOf("d" to -3L), obj["c"])
        assertEquals(obj, Json.lerObjeto(Json.escrever(obj)))
    }

    @Test
    fun `rejeita JSON quebrado`() {
        assertFailsWith<Json.ErroJson> { Json.ler("""{"a":}""") }
        assertFailsWith<Json.ErroJson> { Json.ler("""{"a":1} lixo""") }
    }
}

class RequisicaoTest {
    @Test
    fun `aceita tarefa como string JSON`() {
        val r = Requisicao.deJson(requisicaoSso())
        assertEquals("sso.autenticador", r.tarefaId)
        assertEquals("pje.trf3.jus.br", r.host)
        assertEquals("frase-desafio", r.tarefa["mensagem"])
        assertEquals("$SERVIDOR/api/login", r.resolver("/api/login"))
        assertFalse(r.resumo().contains("JSESSIONID"), "o resumo não pode expor a sessão")
    }

    @Test
    fun `envio nunca sai do servidor autorizado`() {
        val r = Requisicao.deJson(requisicaoSso())
        assertTrue(r.resolver("https://golpe.com/x").startsWith("$SERVIDOR/"))
    }

    @Test
    fun `junta cookies dando preferência à sessão da página`() {
        assertEquals("a=1; JSESSIONID=novo; b=2", Cookies.juntar("a=1; JSESSIONID=velho", "JSESSIONID=novo; b=2"))
        assertEquals("", Cookies.juntar(null, null))
    }
}

class SegurancaTest {
    private val par = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()

    private fun codigo(texto: String): String = Base64.getEncoder().encodeToString(
        Cipher.getInstance("RSA/ECB/PKCS1Padding").run {
            init(Cipher.ENCRYPT_MODE, par.private)
            doFinal(texto.toByteArray())
        }
    )

    @Test
    fun `decifra código de segurança no formato do CNJ`() {
        val chave = par.public as RSAPublicKey
        val c = codigo("PJe:https://pje.trf3.jus.br/pje, https://pje1g.trf3.jus.br/pje")
        assertEquals("PJe" to listOf("https://pje.trf3.jus.br/pje", "https://pje1g.trf3.jus.br/pje"), CodigoSeguranca.decifrar(c, chave))
        assertTrue(CodigoSeguranca.autoriza(c, "PJe", "https://PJE.trf3.jus.br/pje", chave))
        assertFalse(CodigoSeguranca.autoriza(c, "Outro", SERVIDOR, chave))
        assertFalse(CodigoSeguranca.autoriza(c, "PJe", "https://pje.trf1.jus.br/pje", chave))
        assertNull(CodigoSeguranca.decifrar("bGl4bw==", chave))
    }

    @Test
    fun `chave pública embutida do CNJ carrega`() {
        // Código falso: não decifra, mas a chave tem de carregar sem erro.
        assertFalse(CodigoSeguranca.autoriza(codigo("PJe:$SERVIDOR"), "PJe", SERVIDOR))
    }

    @Test
    fun `sem código válido só aceita https em jus br`() {
        fun aut(servidor: String) = Seguranca.autorizacao(Requisicao.deJson(requisicaoSso(servidor)))
        assertEquals(Autorizacao.DOMINIO_JUDICIARIO, aut(SERVIDOR))
        assertEquals(Autorizacao.DOMINIO_JUDICIARIO, aut("https://sso.cloud.pje.jus.br/auth/realms/pje"))
        assertEquals(Autorizacao.NEGADA, aut("http://pje.trf3.jus.br/pje"))
        assertEquals(Autorizacao.NEGADA, aut("https://pje.trf3.jus.br.golpe.com/pje"))
        assertEquals(Autorizacao.NEGADA, aut("lixo"))
    }

    @Test
    fun `origem precisa bater com o servidor`() {
        assertTrue(Seguranca.mesmaOrigem("https://pje.trf3.jus.br", SERVIDOR))
        assertTrue(Seguranca.mesmaOrigem("https://pje.trf3.jus.br:443/pje/login.seam", SERVIDOR))
        assertFalse(Seguranca.mesmaOrigem("https://golpe.com", SERVIDOR))
        assertFalse(Seguranca.mesmaOrigem("http://pje.trf3.jus.br", SERVIDOR))
        // GET sem Origin (login por image-ping): liberado.
        assertTrue(Seguranca.mesmaOrigem(null, SERVIDOR))
    }
}

class AssinaturaTest {
    private val dados = "frase-desafio".toByteArray()

    private fun verificar(algoritmo: String, assinatura: ByteArray, conteudo: ByteArray = dados) {
        val ok = Signature.getInstance(algoritmo).run {
            initVerify(CertificadoTeste.cadeia.first().publicKey)
            update(conteudo)
            verify(assinatura)
        }
        assertTrue(ok, "assinatura $algoritmo inválida")
    }

    @Test
    fun `assina com os algoritmos pedidos pelo PJe`() {
        val a = CertificadoTeste.assinante
        verificar("MD5withRSA", a.assinar("MD5withRSA", dados))
        verificar("SHA1withRSA", a.assinar("SHA1withRSA", dados))
        verificar("SHA256withRSA", a.assinar("SHA256withRSA", dados))
    }

    @Test
    fun `ASN1MD5withRSA assina o hash como MD5withRSA assinaria o documento`() {
        val md5 = MessageDigest.getInstance("MD5").digest(dados)
        verificar("MD5withRSA", CertificadoTeste.assinante.assinar("ASN1MD5withRSA", md5))
    }

    @Test
    fun `caminho manual NONEwithRSA gera a mesma assinatura`() {
        val a = CertificadoTeste.assinante
        for (alg in listOf("MD5withRSA", "SHA256withRSA")) {
            val resumo = Algoritmos.resumoDe(alg)
            val manual = a.assinarResumo(resumo, MessageDigest.getInstance(resumo).digest(dados))
            assertContentEquals(a.assinar(alg, dados), manual)
        }
    }

    @Test
    fun `normaliza nomes de algoritmo`() {
        assertEquals("MD5", Algoritmos.resumoDe("ASN1MD5withRSA"))
        assertEquals("SHA-256", Algoritmos.resumoDe("SHA256WITHRSA"))
        assertTrue(Algoritmos.resumoPronto("ASN1SHA256withRSA"))
        assertFalse(Algoritmos.resumoPronto("MD5withRSA"))
        assertFailsWith<IllegalArgumentException> { Algoritmos.resumoDe("SHA256withECDSA") }
    }

    @Test
    fun `cadeia PkiPath decodifica de volta`() {
        val b64 = CertificadoTeste.assinante.cadeiaPkiPathBase64()
        val caminho = CertificateFactory.getInstance("X.509")
            .generateCertPath(ByteArrayInputStream(Base64.getDecoder().decode(b64)), "PkiPath")
        assertEquals(CertificadoTeste.cadeia, caminho.certificates)
    }
}

class ProcessadorTest {
    private val pedidos = mutableListOf<Pedido>()

    private fun processador(http: ClienteHttp, aceitar: Boolean = true) = Processador(
        confirmador = { p -> pedidos += p; if (aceitar) CertificadoTeste.assinante else null },
        http = http,
        cookiesPara = { "AWSALB=xyz" },
    )

    private fun campos(corpo: String) = corpo.split('&').associate {
        URLDecoder.decode(it.substringBefore('='), "UTF-8") to URLDecoder.decode(it.substringAfter('='), "UTF-8")
    }

    private fun verificaAssinatura(algoritmo: String, conteudo: ByteArray, b64: String) {
        val ok = Signature.getInstance(algoritmo).run {
            initVerify(CertificadoTeste.cadeia.first().publicKey)
            update(conteudo)
            verify(Base64.getDecoder().decode(b64))
        }
        assertTrue(ok, "assinatura inválida")
    }

    @Test
    fun `sso autenticador envia JSON assinado ao tribunal`() {
        val http = ClienteHttpFalso()
        val r = processador(http).processar(requisicaoSso(), ORIGEM)
        assertTrue(r.sucesso, r.mensagem)
        assertEquals(Autorizacao.DOMINIO_JUDICIARIO, pedidos.single().autorizacao)
        val envio = http.envios.single()
        assertEquals("$SERVIDOR/api/login", envio.url)
        assertTrue(envio.tipo.startsWith("application/json"))
        assertEquals("application/json", envio.cabecalhos["Accept"])
        assertEquals("AWSALB=xyz; JSESSIONID=abc", envio.cabecalhos["Cookie"])
        assertEquals(Protocolo.VERSAO, envio.cabecalhos["versao"])

        val corpo = Json.lerObjeto(envio.corpo)
        assertEquals("uuid-123", corpo["uuid"])
        assertEquals("frase-desafio", corpo["mensagem"])
        verificaAssinatura("SHA256withRSA", "frase-desafio".toByteArray(), corpo["assinatura"] as String)
        assertNotNull(corpo["certChain"])
    }

    @Test
    fun `sso sem algoritmo informado usa SHA256withRSA`() {
        val http = ClienteHttpFalso()
        // Requisição SSO sem o campo algoritmoAssinatura.
        val tarefa = Json.escrever(mapOf("mensagem" to "abc", "enviarPara" to "/api/login", "token" to "u1"))
        val r = processador(http).processar(requisicao("sso.autenticador", tarefa), ORIGEM)
        assertTrue(r.sucesso, r.mensagem)
        val corpo = Json.lerObjeto(http.envios.single().corpo)
        verificaAssinatura("SHA256withRSA", "abc".toByteArray(), corpo["assinatura"] as String)
    }

    @Test
    fun `cnj autenticador usa MD5withRSA e formulário`() {
        val http = ClienteHttpFalso()
        val tarefa = Json.escrever(mapOf("mensagem" to "abc", "enviarPara" to "/logar.seam"))
        val r = processador(http).processar(requisicao("cnj.autenticador", tarefa), ORIGEM)
        assertTrue(r.sucesso, r.mensagem)
        val c = campos(http.envios.single().corpo)
        assertEquals(setOf("assinatura", "cadeiaCertificado"), c.keys)
        verificaAssinatura("MD5withRSA", "abc".toByteArray(), c.getValue("assinatura"))
    }

    @Test
    fun `cnj autenticador falha quando o tribunal responde Erro`() {
        val tarefa = Json.escrever(mapOf("mensagem" to "abc", "enviarPara" to "/logar.seam"))
        val r = processador(ClienteHttpFalso(corpo = "Erro: certificado revogado"))
            .processar(requisicao("cnj.autenticador", tarefa), ORIGEM)
        assertFalse(r.sucesso)
        assertTrue(r.mensagem.contains("certificado revogado"))
    }

    @Test
    fun `assinador hash assina cada documento`() {
        val conteudo = "conteúdo do PDF".toByteArray()
        val md5 = MessageDigest.getInstance("MD5").digest(conteudo).joinToString("") { "%02x".format(it) }
        val tarefa = Json.escrever(
            mapOf(
                "algoritmoAssinatura" to "ASN1MD5withRSA",
                "modoTeste" to false,
                "uploadUrl" to "/arquivoAssinadoUpload.seam?action=x",
                "arquivos" to listOf(
                    mapOf("id" to "10", "codIni" to "c1", "hash" to md5, "isBin" to false, "idTarefa" to 77),
                    mapOf("id" to "11", "codIni" to "c2", "hash" to md5, "isBin" to true),
                ),
            )
        )
        val http = ClienteHttpFalso(corpo = "Sucesso")
        val r = processador(http).processar(requisicao("cnj.assinadorHash", tarefa), ORIGEM)
        assertTrue(r.sucesso, r.mensagem)
        assertEquals(2, http.envios.size)
        val c = campos(http.envios[0].corpo)
        assertEquals("10", c["id"])
        assertEquals("c1", c["codIni"])
        assertEquals(md5, c["hash"])
        assertEquals("77", c["idTarefa"])
        assertNull(campos(http.envios[1].corpo)["idTarefa"])
        verificaAssinatura("MD5withRSA", conteudo, c.getValue("assinatura"))
        assertEquals("$SERVIDOR/arquivoAssinadoUpload.seam?action=x", http.envios[0].url)
    }

    @Test
    fun `assinador hash exige Sucesso na resposta`() {
        val tarefa = Json.escrever(
            mapOf(
                "algoritmoAssinatura" to "ASN1MD5withRSA",
                "uploadUrl" to "/up",
                "arquivos" to listOf(mapOf("id" to "1", "hash" to "00112233445566778899aabbccddeeff")),
            )
        )
        val r = processador(ClienteHttpFalso(corpo = "<html>login</html>"))
            .processar(requisicao("cnj.assinadorHash", tarefa), ORIGEM)
        assertFalse(r.sucesso)
    }

    @Test
    fun `assinador base64 devolve lista JSON`() {
        val conteudo = "documento".toByteArray()
        val tarefa = Json.escrever(
            mapOf(
                "algoritmoAssinatura" to "SHA256withRSA",
                "uploadUrl" to "/assinaturas",
                "arquivos" to listOf(
                    mapOf("hashDoc" to "h1", "conteudoBase64" to Base64.getEncoder().encodeToString(conteudo)),
                    mapOf("hashDoc" to "h2"),
                ),
            )
        )
        val http = ClienteHttpFalso(corpo = "Sucesso")
        val r = processador(http).processar(requisicao("cnj.assinadorBase64", tarefa), ORIGEM)
        assertTrue(r.sucesso, r.mensagem)
        @Suppress("UNCHECKED_CAST")
        val lista = Json.ler(http.envios.single().corpo) as List<Map<String, Any?>>
        assertEquals(1, lista.size)
        assertEquals("h1", lista[0]["hashDoc"])
        verificaAssinatura("SHA256withRSA", conteudo, lista[0]["assinaturaBase64"] as String)
    }

    @Test
    fun `certchain envia só a cadeia`() {
        val http = ClienteHttpFalso(corpo = "Sucesso")
        val r = processador(http).processar(requisicao("cnj.certchain", """{"uploadUrl":"/cadeia"}"""), ORIGEM)
        assertTrue(r.sucesso, r.mensagem)
        assertEquals(setOf("cadeiaDeCertificadosBase64"), campos(http.envios.single().corpo).keys)
    }

    @Test
    fun `recusa servidor fora do Judiciário sem pedir confirmação`() {
        val p = processador(ClienteHttpFalso())
        val r = p.processar(requisicaoSso(servidor = "https://golpe.com.br"), "https://golpe.com.br")
        assertFalse(r.sucesso)
        assertTrue(pedidos.isEmpty())
        assertEquals(1, p.registro.todas().size)
    }

    @Test
    fun `recusa chamada vinda de outra origem`() {
        val http = ClienteHttpFalso()
        val r = processador(http).processar(requisicaoSso(), "https://site-malicioso.com")
        assertFalse(r.sucesso)
        assertTrue(pedidos.isEmpty())
        assertTrue(http.envios.isEmpty())
    }

    @Test
    fun `aceita GET sem Origin (login por image-ping)`() {
        val http = ClienteHttpFalso()
        val r = processador(http).processar(requisicaoSso(), null)
        assertTrue(r.sucesso, r.mensagem)
        assertEquals(1, http.envios.size)
    }

    @Test
    fun `usuário cancelando não envia nada`() {
        val http = ClienteHttpFalso()
        val r = processador(http, aceitar = false).processar(requisicaoSso(), ORIGEM)
        assertFalse(r.sucesso)
        assertTrue(http.envios.isEmpty())
    }

    @Test
    fun `tarefa desconhecida fica registrada`() {
        val p = processador(ClienteHttpFalso())
        val r = p.processar(requisicao("cnj.assinador", """{"arquivos":[]}"""), ORIGEM)
        assertFalse(r.sucesso)
        assertTrue(p.registro.todas().first().detalhe.contains("cnj.assinador"))
    }

    @Test
    fun `erro HTTP do tribunal vira falha`() {
        val r = processador(ClienteHttpFalso(status = 401)).processar(requisicaoSso(), ORIGEM)
        assertFalse(r.sucesso)
        assertTrue(r.mensagem.contains("401"))
    }
}

class ClienteHttpPadraoTest {
    @Test
    fun `segue o redirect 302 do login clássico carregando os cookies`() {
        val servidor = com.sun.net.httpserver.HttpServer.create(java.net.InetSocketAddress("127.0.0.1", 0), 0)
        var cookieNoRedirect: String? = null
        servidor.createContext("/logar") { ex ->
            // confere que o cookie da sessão chegou no POST
            val corpo = ex.requestBody.readBytes()
            assertTrue(corpo.isNotEmpty(), "o POST do login deve ter corpo")
            ex.responseHeaders.add("Location", "/home")
            ex.sendResponseHeaders(302, -1)
            ex.close()
        }
        servidor.createContext("/home") { ex ->
            cookieNoRedirect = ex.requestHeaders.getFirst("Cookie")
            val b = "logado".toByteArray()
            ex.sendResponseHeaders(200, b.size.toLong())
            ex.responseBody.use { it.write(b) }
        }
        servidor.start()
        try {
            val base = "http://127.0.0.1:${servidor.address.port}"
            val r = ClienteHttpPadrao(timeoutMs = 5_000).post(
                "$base/logar", "application/x-www-form-urlencoded",
                "assinatura=abc".toByteArray(), mapOf("Cookie" to "JSESSIONID=xyz"),
            )
            assertEquals(200, r.status, "deve seguir o 302 e terminar em 200")
            assertTrue(r.sucesso)
            assertEquals("logado", r.corpo)
            assertEquals("JSESSIONID=xyz", cookieNoRedirect, "o cookie deve ser reenviado no redirect")
        } finally {
            servidor.stop(0)
        }
    }
}

class ServidorLocalTest {
    private val http = ClienteHttpFalso()
    private val servidor = ServidorLocal(
        Processador(confirmador = { CertificadoTeste.assinante }, http = http),
        porta = 0,
    ).also { it.iniciar() }

    @AfterTest
    fun parar() = servidor.parar()

    private fun abrir(caminho: String, origem: String? = ORIGEM): HttpURLConnection =
        (URL("http://127.0.0.1:${servidor.portaAberta}$caminho").openConnection() as HttpURLConnection).apply {
            if (origem != null) setRequestProperty("Origin", origem)
        }

    private fun larguraImagem(c: HttpURLConnection): Int {
        val b = c.inputStream.readBytes()
        return when (c.contentType) {
            "image/gif" -> (b[6].toInt() and 0xff) or ((b[7].toInt() and 0xff) shl 8)
            "image/png" -> java.nio.ByteBuffer.wrap(b, 16, 4).int
            else -> error("tipo inesperado ${c.contentType}")
        }
    }

    @Test
    fun `responde à verificação de disponibilidade`() {
        val c = abrir("/pjeOffice/?&u=123", origem = null)
        assertEquals(200, c.responseCode)
        assertEquals(1, larguraImagem(c))
    }

    @Test
    fun `informa a versão`() {
        val c = abrir("/pjeOffice/versao/")
        assertEquals(Protocolo.VERSAO, Json.lerObjeto(c.inputStream.readBytes().toString(Charsets.UTF_8))["versao"])
    }

    @Test
    fun `executa requisição GET e devolve GIF 1x1`() {
        val r = URLEncoder.encode(requisicaoSso(), "UTF-8")
        val c = abrir("/pjeOffice/requisicao/?r=$r&u=1")
        assertEquals(1, larguraImagem(c))
        assertEquals(ORIGEM, c.getHeaderField("Access-Control-Allow-Origin"))
        assertEquals(1, http.envios.size)
    }

    @Test
    fun `falha devolve PNG 2x1`() {
        val r = URLEncoder.encode(requisicao("tarefa.inexistente", "{}"), "UTF-8")
        assertEquals(2, larguraImagem(abrir("/pjeOffice/requisicao/?r=$r")))
    }

    @Test
    fun `POST responde JSON`() {
        val r = URLEncoder.encode(requisicaoSso(), "UTF-8")
        val c = abrir("/pjeOffice/requisicao/?r=$r").apply {
            requestMethod = "POST"
            doOutput = true
            outputStream.use { }
        }
        assertEquals(200, c.responseCode)
        assertEquals(true, Json.lerObjeto(c.inputStream.readBytes().toString(Charsets.UTF_8))["success"])
    }

    @Test
    fun `pré-voo libera acesso à rede privada`() {
        val c = abrir("/pjeOffice/requisicao/").apply { requestMethod = "OPTIONS" }
        assertEquals(204, c.responseCode)
        assertEquals("true", c.getHeaderField("Access-Control-Allow-Private-Network"))
    }

    @Test
    fun `bloqueia chamadas de sites fora do servidor`() {
        val r = URLEncoder.encode(requisicaoSso(), "UTF-8")
        assertEquals(2, larguraImagem(abrir("/pjeOffice/requisicao/?r=$r", origem = "https://site-malicioso.com")))
        assertTrue(http.envios.isEmpty())
    }
}

fun requisicao(tarefaId: String, tarefa: String, servidor: String = SERVIDOR): String =
    Json.escrever(
        mapOf(
            "aplicacao" to "PJe",
            "servidor" to servidor,
            "sessao" to "JSESSIONID=abc",
            "codigoSeguranca" to "cod",
            "tarefaId" to tarefaId,
            "tarefa" to tarefa,
        )
    )

fun requisicaoSso(servidor: String = SERVIDOR): String = requisicao(
    "sso.autenticador",
    Json.escrever(
        mapOf(
            "mensagem" to "frase-desafio",
            "enviarPara" to "/api/login",
            "token" to "uuid-123",
            "algoritmoAssinatura" to "SHA256withRSA",
        )
    ),
    servidor,
)
