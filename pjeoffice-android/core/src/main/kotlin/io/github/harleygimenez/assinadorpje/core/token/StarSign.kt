package io.github.harleygimenez.assinadorpje.core.token

import io.github.harleygimenez.assinadorpje.core.Algoritmos
import io.github.harleygimenez.assinadorpje.core.Assinante
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate

/**
 * Token G&D StarSign CUT S (applet SafeSign da A.E.T. Europe), usado por
 * certificados A3 do ICP-Brasil.
 *
 * A sequência (handshake "DRM", canal lógico 1, VERIFY PIN, MSE SET e
 * PSO COMPUTE DIGITAL SIGNATURE) e os endereços dos arquivos foram
 * conferidos no projeto LGPL `DiegoRibeirodeSouza/starsign-driver`, que
 * documenta APDUs reais capturados do SafeSign 4.7. Veja NOTICE.md.
 *
 * O cartão faz o padding PKCS#1 mas **não** inclui o cabeçalho DigestInfo;
 * por isso montamos o DigestInfo aqui e o cartão só faz a exponenciação.
 */
class StarSign(private val transporte: Transporte, private val log: LogApdu? = null) {

    private var canal = 0

    /** Referências de chave descobertas no PrKDF (a tentar na assinatura). */
    @Volatile private var chavesRef: List<Int> = listOf(1)
    @Volatile private var chavesDescobertas = false
    /** Referência de chave que funcionou na última assinatura (diagnóstico). */
    @Volatile private var chaveRefUsada: Int = -1
    /**
     * PIN já preenchido (ASCII + 0x00 até 15 bytes), guardado após o VERIFY para
     * reautenticar logo antes de assinar. No SafeSign, o SELECT AID das leituras
     * (cadeia, PrKDF) reseta a autenticação do PIN, então reenviá-lo imediatamente
     * antes do MSE SET é o que mantém a assinatura válida.
     */
    @Volatile private var pinMemoria: ByteArray? = null

    private fun env(cla: Int, ins: Int, p1: Int, p2: Int, dados: ByteArray? = null, le: Int? = null): RespostaApdu {
        val apdu = Apdu.montar(cla or canal, ins, p1, p2, dados, le)
        log?.add("→ ${Hex.de(apdu, 24)}")
        val resp = RespostaApdu.de(transporte.transmitir(apdu))
        log?.add("← ${Hex.sw(resp.sw)} ${Hex.de(resp.dados, 16)}")
        // Encadeia GET RESPONSE / reenvia com Le corrigido automaticamente.
        if (resp.sw1 == 0x61) return env(0, 0xC0, 0, 0, null, resp.sw2).let { RespostaApdu(it.dados, it.sw) }
        if (resp.sw1 == 0x6C && dados == null) return env(cla, ins, p1, p2, null, resp.sw2)
        return resp
    }

    /** Handshake + canal lógico 1 + seleção do AID PKCS#15. Idempotente. */
    fun abrir() {
        transporte.transmitirSeForLeitor()
        // 1. 1ª PUT DATA (o cartão costuma responder 6D00 — tudo bem).
        env(0, 0xDA, 0x01, 0x00, DRM)
        // 2. SELECT AID (canal 0): ativa o applet, que devolve o texto de desafio.
        env(0, 0xA4, 0x04, 0x00, AID, le = 256).exigirOk("selecionar aplicação do token")
        // 3. 2ª PUT DATA: agora deve aceitar.
        env(0, 0xDA, 0x01, 0x00, DRM).exigirOk("autenticar o aplicativo no token")
        // 4. SELECT MF e abrir canal lógico 1.
        env(0, 0xA4, 0x00, 0x0C, Hex.bytes("3F00")).exigirOk("selecionar o diretório raiz")
        val r = env(0, 0x70, 0x00, 0x00, le = 1)
        canal = when {
            r.ok && r.dados.isNotEmpty() -> r.dados[0].toInt() and 0x03
            r.sw == 0x6A81 -> 1 // canal já aberto de uma sessão anterior
            else -> { r.exigirOk("abrir canal de comunicação"); 1 }
        }
        // 5. SELECT AID no canal 1.
        env(0, 0xA4, 0x04, 0x00, AID, le = 256)
        // 6. Descobre a referência da chave agora (antes do PIN): o PrKDF é
        //    legível sem PIN, e assim a assinatura não precisa fazer SELECT AID
        //    depois do PIN (o que resetaria a autenticação no SafeSign).
        runCatching { refsDeAssinatura() }
    }

    /** Tentativas de PIN restantes sem gastar nenhuma. -1 = já autenticado, 0 = bloqueado. */
    fun tentativasRestantes(): Int {
        val r = env(0, 0x20, 0x00, PIN_REF)
        return when {
            r.sw1 == 0x63 -> r.sw2 and 0x0F
            r.ok -> -1
            r.sw == 0x6983 -> 0
            else -> -1
        }
    }

    /** VERIFY PIN (ASCII + preenchimento com 0x00 até 15 bytes). */
    fun verificarPin(pin: CharArray) {
        val ascii = String(pin).toByteArray(Charsets.US_ASCII)
        if (ascii.size > PIN_MAX) throw ErroToken("PIN muito longo (máximo $PIN_MAX caracteres)")
        val campo = ByteArray(PIN_MAX)
        ascii.copyInto(campo)
        val r = env(0, 0x20, 0x00, PIN_REF, campo)
        if (r.ok) pinMemoria = campo.copyOf() // guarda para reautenticar antes de assinar
        campo.fill(0)
        ascii.fill(0)
        when {
            r.ok -> Unit
            r.sw1 == 0x63 -> throw ErroToken("PIN incorreto. Restam ${r.sw2 and 0x0F} tentativa(s).", r.sw)
            r.sw == 0x6983 -> throw ErroToken("PIN bloqueado. Desbloqueie com o gerenciador do token.", r.sw)
            else -> r.exigirOk("verificar o PIN")
        }
    }

    /** Reenvia o PIN já verificado (reautentica). No-op se nenhum PIN foi guardado. */
    private fun reautenticar() {
        val campo = pinMemoria ?: return
        env(0, 0x20, 0x00, PIN_REF, campo)
    }

    /** Lê a cadeia de certificados (folha primeiro). Ignora slots vazios. */
    fun lerCadeia(): List<X509Certificate> {
        val cf = CertificateFactory.getInstance("X.509")
        // Descoberta PKCS#15: ODF (5031) → CDF (certificados, contexto [4]) →
        // endereços dos certificados → leitura de cada um.
        val odf = runCatching { lerEf("5031") }.getOrNull() ?: return emptyList()
        val cdfFid = fidNoOdf(odf, 0xA4) ?: "4404"
        val cdf = runCatching { lerEf(cdfFid) }.getOrNull() ?: return emptyList()
        val certs = caminhosNoCdf(cdf).mapNotNull { p ->
            val der = runCatching { lerCert(p) }.getOrNull() ?: return@mapNotNull null
            runCatching { cf.generateCertificate(der.inputStream()) as X509Certificate }.getOrNull()
        }
        return ordenarCadeia(certs)
    }

    /** Endereços (hex) dos certificados achados no CDF — para diagnóstico. */
    fun caminhosCertHex(): List<String> = runCatching {
        val odf = lerEf("5031")
        val cdf = lerEf(fidNoOdf(odf, 0xA4) ?: "4404")
        caminhosNoCdf(cdf).map { Hex.de(it).replace(" ", "") }
    }.getOrDefault(emptyList())

    private fun reselecionarApp() {
        env(0, 0xA4, 0x04, 0x00, AID, le = 256)
    }

    /** Seleciona um EF filho da aplicação (por FID) e lê todo o conteúdo. */
    private fun lerEf(fidHex: String): ByteArray {
        reselecionarApp()
        env(0, 0xA4, 0x00, 0x0C, Hex.bytes(fidHex)).exigirOk("selecionar $fidHex")
        return lerBinarioAtual(8000)
    }

    /** No ODF, encontra o FID apontado por um contexto (ex.: [4] = 0xA4 = certificados). */
    private fun fidNoOdf(odf: ByteArray, tagCtx: Int): String? {
        for (t in Der.ler(odf)) {
            if (t.tag != tagCtx) continue
            val seq = Der.ler(t.valor).firstOrNull { it.tag == 0x30 } ?: continue
            val oct = seq.filhos().firstOrNull { it.tag == 0x04 } ?: continue
            return Hex.de(oct.valor).replace(" ", "")
        }
        return null
    }

    /**
     * No CDF há um certificado por objeto (o seu + CAs). O endereço de cada um
     * é um OCTET STRING com o caminho de arquivo (começa com 3F00/3FFF).
     * Varremos o CDF inteiro e coletamos todos esses caminhos.
     */
    private fun caminhosNoCdf(cdf: ByteArray): List<ByteArray> {
        val caminhos = mutableListOf<ByteArray>()
        fun varrer(nos: List<Tlv>) {
            for (n in nos) {
                val v = n.valor
                val ehCaminho = n.tag == 0x04 && v.size in 4..10 &&
                    (v[0].toInt() and 0xFF) == 0x3F &&
                    ((v[1].toInt() and 0xFF) == 0xFF || (v[1].toInt() and 0xFF) == 0x00)
                if (ehCaminho) caminhos += v
                if (n.construido) varrer(n.filhos())
            }
        }
        varrer(Der.ler(cdf))
        return caminhos.distinctBy { Hex.de(it) }
    }

    /** Lê um certificado pelo caminho do CDF (ignora MF 3F00 e placeholder 3FFF). */
    private fun lerCert(path: ByteArray): ByteArray {
        reselecionarApp()
        val comps = path.toList().chunked(2) { it.toByteArray() }.filterNot {
            val hi = it[0].toInt() and 0xFF
            val lo = it[1].toInt() and 0xFF
            hi == 0x3F && (lo == 0x00 || lo == 0xFF)
        }
        if (comps.isEmpty()) throw ErroToken("Caminho de certificado vazio")
        for (i in 0 until comps.size - 1) {
            env(0, 0xA4, 0x00, 0x0C, comps[i]).exigirOk("navegar até o certificado")
        }
        val sel = env(0, 0xA4, 0x02, 0x00, comps.last(), le = 256)
        if (sel.ok) return lerBinarioAtual(8000)
        // Caminho curto (só a folha): neste token os certificados ficam no DF 4302.
        if (comps.size == 1 && sel.sw == 0x6A82) {
            reselecionarApp()
            env(0, 0xA4, 0x00, 0x0C, Hex.bytes("4302")).exigirOk("selecionar diretório de certificados")
            env(0, 0xA4, 0x02, 0x00, comps.last(), le = 256).exigirOk("selecionar certificado")
            return lerBinarioAtual(8000)
        }
        sel.exigirOk("selecionar certificado")
        return ByteArray(0)
    }

    /** Ordena a cadeia com a folha primeiro, subindo pelos emissores. */
    private fun ordenarCadeia(certs: List<X509Certificate>): List<X509Certificate> = Companion.ordenarCadeia(certs)

    /**
     * Assina [dados] com SHA-256 + RSA. Monta o DigestInfo aqui (o cartão não o
     * faz) e envia o bloco já pronto; o cartão aplica o padding PKCS#1 e a RSA.
     *
     * A referência da chave (keyReference) varia por token e por emissão: usar
     * `01` fixo fazia o MSE SET responder 6A88 ("dado de referência não
     * encontrado"). Descobrimos as referências reais no PrKDF e tentamos cada
     * uma até o cartão aceitar.
     */
    fun assinarSha256(dados: ByteArray): ByteArray {
        val hash = java.security.MessageDigest.getInstance("SHA-256").digest(dados)
        val digestInfo = Algoritmos.digestInfo("SHA-256", hash)
        val refs = refsDeAssinatura() // já descoberto no abrir(); não faz SELECT AID aqui
        reautenticar() // reenvia o PIN imediatamente antes do MSE SET (sem SELECT AID no meio)
        var erro: RespostaApdu? = null
        for (ref in refs) {
            val mse = byteArrayOf(0x84.toByte(), 0x01, ref.toByte(), 0x80.toByte(), 0x01, 0x02)
            val m = env(0, 0x22, 0x41, 0xB6, mse)
            if (!m.ok) { erro = m; continue }
            val r = env(0, 0x2A, 0x9E, 0x9A, digestInfo, le = 256)
            if (r.ok) { chaveRefUsada = ref; return r.dados }
            erro = r
        }
        return (erro ?: RespostaApdu(ByteArray(0), 0x6A88)).exigirOk(
            "gerar a assinatura (nenhuma referência de chave aceita: ${refs.joinToString { "%02X".format(it) }})"
        )
    }

    /** Lista de referências de chave a tentar na assinatura (descobre uma vez). */
    private fun refsDeAssinatura(): List<Int> {
        if (!chavesDescobertas) {
            val achadas = descobrirChavesRef()
            // Mantém 0x01 como última tentativa caso a descoberta falhe ou o
            // token aceite esse valor por compatibilidade.
            chavesRef = (achadas + 1).distinct().ifEmpty { listOf(1) }
            chavesDescobertas = true
        }
        return chavesRef
    }

    /** Referência de chave usada na última assinatura, em hex (diagnóstico). */
    fun chaveRefUsadaHex(): String = if (chaveRefUsada >= 0) "%02X".format(chaveRefUsada) else "—"

    /** Referências de chave encontradas no PrKDF, em hex (diagnóstico). */
    fun refsDeChaveHex(): List<String> =
        runCatching { descobrirChavesRef() }.getOrDefault(emptyList()).map { "%02X".format(it) }

    /**
     * Descobre as referências de chave privada no PrKDF (EF apontado pelo
     * contexto [0] do ODF; 4400 por padrão). Cada chave carrega o keyReference
     * num INTEGER curto dentro do CommonKeyAttributes.
     */
    private fun descobrirChavesRef(): List<Int> = runCatching {
        val odf = lerEf("5031")
        val prkdfFid = fidNoOdf(odf, 0xA0) ?: "4400"
        val prkdf = lerEf(prkdfFid)
        refsNoPrkdf(prkdf)
    }.getOrDefault(emptyList())

    /**
     * No PrKDF, o CommonKeyAttributes é um SEQUENCE que traz o iD (OCTET STRING)
     * e o usage (BIT STRING); o keyReference é um INTEGER de 1 byte ali dentro.
     */
    private fun refsNoPrkdf(prkdf: ByteArray): List<Int> {
        val refs = mutableListOf<Int>()
        fun ehAtributosDeChave(seq: Tlv): Boolean {
            val f = seq.filhos()
            return f.any { it.tag == 0x04 } && f.any { it.tag == 0x03 }
        }
        fun varrer(nos: List<Tlv>) {
            for (n in nos) {
                if (n.tag == 0x30 && ehAtributosDeChave(n)) {
                    n.filhos().firstOrNull { it.tag == 0x02 && it.valor.size == 1 }
                        ?.let { refs += it.valor[0].toInt() and 0xFF }
                }
                if (n.construido) varrer(n.filhos())
            }
        }
        varrer(Der.ler(prkdf))
        return refs.distinct()
    }

    fun fechar() {
        pinMemoria?.fill(0)
        pinMemoria = null
        runCatching { transporte.close() }
    }

    /**
     * Varre a estrutura PKCS#15 e devolve um dump (fid, tamanho, início em hex)
     * dos diretórios/arquivos, para descobrir onde estão os certificados neste
     * token (os IDs variam por emissão). Diagnóstico — não altera nada.
     */
    fun explorarPkcs15(): String {
        val sb = StringBuilder()
        val candidatos = listOf(
            "5031", "5032", "5033", "6050",
            "4400", "4401", "4402", "4403", "4404", "4405", "4406", "4407", "4408", "4409",
            "4301", "4302", "4303", "4304", "4305", "4306",
        )
        for (c in candidatos) {
            // Volta para a raiz da aplicação antes de cada arquivo.
            env(0, 0xA4, 0x04, 0x00, AID, le = 256)
            val sel = env(0, 0xA4, 0x00, 0x0C, Hex.bytes(c))
            if (!sel.ok) {
                sb.append("$c: ${Hex.sw(sel.sw)}\n")
                continue
            }
            val dados = lerBinarioAtual(260)
            sb.append(if (dados.isEmpty()) "$c: ok (DF ou vazio)\n" else "$c (${dados.size}B): ${Hex.de(dados, 140)}\n")
        }
        return sb.toString()
    }

    private fun lerBinarioAtual(max: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        var off = 0
        while (off < max) {
            val n = minOf(0xFE, max - off)
            val r = env(0, 0xB0, (off ushr 8) and 0x7F, off and 0xFF, le = n)
            if (!r.ok || r.dados.isEmpty()) break
            out.write(r.dados)
            off += r.dados.size
            if (r.dados.size < n) break
        }
        return out.toByteArray()
    }

    private fun Transporte.transmitirSeForLeitor() {
        if (this is LeitorCcid && atr.isEmpty()) ligar()
    }

    companion object {
        /** AID da aplicação PKCS#15 (`A000000063 "PKCS-15"`). */
        val AID = Hex.bytes("A0 00 00 00 63 50 4B 43 53 2D 31 35")

        /** String que o applet exige via PUT DATA para liberar as operações. */
        val DRM = "I am A.E.T. Europe B.V. SafeSign or BlueX approved software.".toByteArray(Charsets.US_ASCII)

        const val PIN_REF = 0x02
        const val PIN_MAX = 15

        const val ATR_CONHECIDO = "3B F9 96 00 00 81 31 FE 45 53 43 45 37 20 0E 00 20 20 28"

        /**
         * Ordena a cadeia com a folha (certificado do titular) primeiro,
         * subindo pelos emissores. A folha é um certificado NÃO-CA
         * (basicConstraints == -1) que não emite nenhum outro da lista — o
         * token pode guardar CAs de uma cadeia diferente da do titular (ex.:
         * CAs da RFB ao lado de um certificado da OAB), e sem o critério
         * "não-CA" pegaríamos o topo dessa sub-cadeia de CAs como folha,
         * descartando o certificado do titular.
         */
        internal fun ordenarCadeia(certs: List<X509Certificate>): List<X509Certificate> {
            if (certs.size <= 1) return certs
            fun naoEmiteOutro(c: X509Certificate) =
                certs.none { o -> o !== c && o.issuerX500Principal == c.subjectX500Principal }
            val folha = certs.firstOrNull { it.basicConstraints == -1 && naoEmiteOutro(it) }
                ?: certs.firstOrNull { it.basicConstraints == -1 }
                ?: certs.firstOrNull { naoEmiteOutro(it) }
                ?: certs.first()
            val ordenada = mutableListOf(folha)
            var atual = folha
            while (true) {
                val emissor = certs.firstOrNull { it !in ordenada && it.subjectX500Principal == atual.issuerX500Principal } ?: break
                ordenada += emissor
                atual = emissor
            }
            return ordenada
        }
    }
}

/**
 * [Assinante] que delega tudo ao token: o PIN já foi verificado em [sessao]
 * antes de criar esta instância, e [cadeia] já foi lida.
 */
class AssinanteStarSign(
    private val sessao: StarSign,
    override val cadeia: List<X509Certificate>,
) : Assinante {

    override fun assinar(algoritmo: String, dados: ByteArray): ByteArray {
        val resumo = Algoritmos.resumoDe(algoritmo)
        if (resumo != "SHA-256") {
            // O PJe pede SHA-256 no SSO; os demais exigiriam outro algoritmo no cartão.
            throw ErroToken("O token só assina com SHA-256 nesta versão (pediram $algoritmo)")
        }
        if (Algoritmos.resumoPronto(algoritmo)) {
            throw ErroToken("Assinatura de hash pronto ainda não suportada pelo token")
        }
        return sessao.assinarSha256(dados)
    }

    override fun assinarResumo(resumo: String, hash: ByteArray): ByteArray {
        throw ErroToken("Assinatura de hash pronto ainda não suportada pelo token")
    }

    /** Encerra a sessão USB do token assim que a tarefa de assinatura termina. */
    override fun close() {
        sessao.fechar()
    }
}
