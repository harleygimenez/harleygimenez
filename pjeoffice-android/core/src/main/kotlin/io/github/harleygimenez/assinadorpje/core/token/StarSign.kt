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
        campo.fill(0)
        when {
            r.ok -> Unit
            r.sw1 == 0x63 -> throw ErroToken("PIN incorreto. Restam ${r.sw2 and 0x0F} tentativa(s).", r.sw)
            r.sw == 0x6983 -> throw ErroToken("PIN bloqueado. Desbloqueie com o gerenciador do token.", r.sw)
            else -> r.exigirOk("verificar o PIN")
        }
    }

    /** Lê a cadeia de certificados (folha primeiro). Ignora slots vazios. */
    fun lerCadeia(): List<X509Certificate> {
        val cf = CertificateFactory.getInstance("X.509")
        return CAMINHOS_CERT.mapNotNull { caminho ->
            val der = runCatching { lerArquivo(caminho) }.getOrNull() ?: return@mapNotNull null
            runCatching { cf.generateCertificate(der.inputStream()) as X509Certificate }.getOrNull()
        }
    }

    /**
     * Assina [dados] com SHA-256 + RSA. Monta o DigestInfo aqui (o cartão não o
     * faz) e envia o bloco já pronto; o cartão aplica o padding PKCS#1 e a RSA.
     */
    fun assinarSha256(dados: ByteArray): ByteArray {
        env(0, 0x22, 0x41, 0xB6, MSE_SET).exigirOk("preparar a assinatura")
        val hash = java.security.MessageDigest.getInstance("SHA-256").digest(dados)
        val digestInfo = Algoritmos.digestInfo("SHA-256", hash)
        val r = env(0, 0x2A, 0x9E, 0x9A, digestInfo, le = 256)
        return r.exigirOk("gerar a assinatura")
    }

    fun fechar() = runCatching { transporte.close() }

    private fun lerArquivo(caminho: String): ByteArray {
        selecionarCaminho(caminho)
        val saida = java.io.ByteArrayOutputStream()
        var offset = 0
        while (offset < 0x10000) {
            val n = 0xFE
            val r = env(0, 0xB0, (offset ushr 8) and 0x7F, offset and 0xFF, le = n)
            if (!r.ok || r.dados.isEmpty()) break
            saida.write(r.dados)
            offset += r.dados.size
            if (r.dados.size < n) break
        }
        return saida.toByteArray()
    }

    /**
     * Resolve um caminho do PKCS#15. Caminhos de certificado usam o
     * placeholder `3FFF`: o componente anterior é um DF real a selecionar uma
     * vez (`P1=0x00`) e o último é um EF filho (`P1=0x02`).
     */
    private fun selecionarCaminho(caminho: String) {
        val fids = Hex.bytes(caminho).toList().chunked(2) { it.toByteArray() }
        val ph = fids.indexOfFirst { it[0].toInt() and 0xFF == 0x3F && it[1].toInt() and 0xFF == 0xFF }
        if (ph >= 0) {
            val mid = fids[fids.size - 2]
            val fim = fids[fids.size - 1]
            env(0, 0xA4, 0x00, 0x0C, mid).exigirOk("selecionar diretório do certificado")
            env(0, 0xA4, 0x02, 0x00, fim, le = 256).exigirOk("selecionar certificado")
            return
        }
        // Navegação comum a partir do MF; último componente como EF filho.
        for (i in 0 until fids.size - 1) {
            env(0, 0xA4, 0x00, 0x0C, fids[i]).exigirOk("navegar no token")
        }
        env(0, 0xA4, 0x02, 0x00, fids.last(), le = 256).exigirOk("selecionar arquivo")
    }

    private fun Transporte.transmitirSeForLeitor() {
        if (this is LeitorCcid && atr.isEmpty()) ligar()
    }

    companion object {
        /** AID da aplicação PKCS#15 (`A000000063 "PKCS-15"`). */
        val AID = Hex.bytes("A0 00 00 00 63 50 4B 43 53 2D 31 35")

        /** String que o applet exige via PUT DATA para liberar as operações. */
        val DRM = "I am A.E.T. Europe B.V. SafeSign or BlueX approved software.".toByteArray(Charsets.US_ASCII)

        /** MSE SET: key ref 0x01, algoritmo 0x02 — nesta ordem (o cartão exige). */
        val MSE_SET = Hex.bytes("84 01 01 80 01 02")

        const val PIN_REF = 0x02
        const val PIN_MAX = 15

        /** Slots de certificado sob `3F00 3FFF 4302 <ef>` (folha primeiro). */
        val CAMINHOS_CERT = listOf(
            "3F00 3FFF 4302 0114", // certificado de assinatura (folha)
            "3F00 3FFF 4302 05A0", // CA intermediária 1
            "3F00 3FFF 4302 13AE", // CA intermediária 2
            "3F00 3FFF 4302 1371", // CA raiz
        )

        const val ATR_CONHECIDO = "3B F9 96 00 00 81 31 FE 45 53 43 45 37 20 0E 00 20 20 28"
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
}
