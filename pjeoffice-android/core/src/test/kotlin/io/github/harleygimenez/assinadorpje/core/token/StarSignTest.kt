package io.github.harleygimenez.assinadorpje.core.token

import io.github.harleygimenez.assinadorpje.core.Algoritmos
import io.github.harleygimenez.assinadorpje.core.ParCaFolha
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.security.interfaces.RSAPrivateCrtKey
import java.security.interfaces.RSAPublicKey
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * Cartão StarSign CUT S simulado: reproduz as respostas conhecidas do applet
 * SafeSign (handshake, canal, PIN, MSE, assinatura) para validar a sequência
 * de APDUs sem o hardware. A assinatura é a RSA crua do bloco recebido —
 * exatamente o que o chip real faz (padding PKCS#1 sem DigestInfo).
 */
class CartaoSimulado(
    private val chave: RSAPrivateCrtKey,
    private val certLeaf: ByteArray,
    private val pinCerto: String = "1234",
    /** Referência de chave que o cartão aceita no MSE SET (as demais dão 6A88). */
    private val chaveRefCorreta: Int = 0x45,
) : Transporte {
    override val atr = Hex.bytes(StarSign.ATR_CONHECIDO)

    var tentativas = 3
    var autenticado = false
    var refMseAceita: Int? = null
    private var appletAtivo = false
    private var canalAberto = false
    private var mseFeito = false
    private var efSelecionado: String? = null
    val recebidos = mutableListOf<String>()

    private fun sw(v: Int) = byteArrayOf(((v ushr 8) and 0xFF).toByte(), (v and 0xFF).toByte())
    private fun resp(dados: ByteArray, v: Int) = dados + sw(v)

    override fun transmitir(apdu: ByteArray): ByteArray {
        recebidos += Hex.de(apdu, 8)
        val ins = apdu[1].toInt() and 0xFF
        val p1 = apdu[2].toInt() and 0xFF
        val p2 = apdu[3].toInt() and 0xFF
        val lc = if (apdu.size > 4) apdu[4].toInt() and 0xFF else 0
        val dados = if (apdu.size >= 5 + lc && lc > 0) apdu.copyOfRange(5, 5 + lc) else ByteArray(0)

        return when (ins) {
            0xDA -> if (!appletAtivo) sw(0x6D00) else sw(0x9000) // PUT DATA (handshake)
            0xA4 -> when (p1) {
                0x04 -> { // SELECT AID: ativa o applet e RESETA a autenticação (como o SafeSign real)
                    appletAtivo = true; efSelecionado = null; autenticado = false; mseFeito = false
                    resp("desafio".toByteArray(), 0x9000)
                }
                0x02 -> { // SELECT EF filho (certificado)
                    val fid = Hex.de(dados).replace(" ", "")
                    if (fid == "2F01") { efSelecionado = fid; sw(0x9000) } else sw(0x6A82)
                }
                else -> { // SELECT por FID (ODF/CDF/PrKDF/DF)
                    val fid = Hex.de(dados).replace(" ", "")
                    efSelecionado = if (fid in setOf("5031", "4404", "4400")) fid else null
                    sw(0x9000)
                }
            }
            0x70 -> { canalAberto = true; resp(byteArrayOf(0x01), 0x9000) } // MANAGE CHANNEL
            0x20 -> when { // VERIFY
                lc == 0 -> sw(if (autenticado) 0x9000 else 0x63C0 or tentativas) // consulta contador
                else -> {
                    val pin = String(dados).trimEnd('\u0000')
                    if (pin == pinCerto) { autenticado = true; sw(0x9000) }
                    else { tentativas--; if (tentativas <= 0) sw(0x6983) else sw(0x63C0 or tentativas) }
                }
            }
            0x22 -> { // MSE SET: só aceita a referência de chave correta
                val ref = if (lc >= 3 && (dados[0].toInt() and 0xFF) == 0x84) dados[2].toInt() and 0xFF else -1
                if (ref == chaveRefCorreta) { mseFeito = true; refMseAceita = ref; sw(0x9000) }
                else sw(0x6A88) // dado de referência não encontrado
            }
            0x2A -> { // PSO: COMPUTE DIGITAL SIGNATURE
                if (!autenticado) return sw(0x6982)
                if (!mseFeito) return sw(0x6985)
                resp(rsaCru(dados), 0x9000)
            }
            0xB0 -> { // READ BINARY do EF selecionado
                val conteudo = when (efSelecionado) {
                    "5031" -> ODF
                    "4404" -> CDF
                    "4400" -> PRKDF
                    "2F01" -> certLeaf
                    else -> return sw(0x6986)
                }
                val off = (p1 shl 8) or p2
                if (off >= conteudo.size) return sw(0x9000) // fim: sem dados
                val n = minOf(apdu.last().toInt() and 0xFF, conteudo.size - off)
                resp(conteudo.copyOfRange(off, off + n), 0x9000)
            }
            else -> sw(0x6D00)
        }
    }

    /** ODF: chaves privadas [0] (0xA0) → EF 4400 (PrKDF) e certificados [4] (0xA4) → EF 4404 (CDF). */
    private val ODF = Hex.bytes("A0 06 30 04 04 02 44 00  A4 06 30 04 04 02 44 04")

    /**
     * PrKDF com uma chave RSA: PrivateKeyObject → CommonKeyAttributes (iD +
     * usage + keyReference 0x45). A referência 0x45 é a que o MSE SET aceita.
     */
    private val PRKDF = Hex.bytes("30 12 30 00 30 0A 04 01 45 03 02 06 C0 02 01 45 A1 02 30 00")

    /**
     * CDF como no token real: objeto do certificado com certAttributes [1]
     * (A1) → X509CertificateAttributes (SEQ) → Path (SEQ) → OCTET STRING com o
     * endereço. Aqui o caminho é 3FFF 2F01 (placeholder + EF 2F01).
     */
    private val CDF = Hex.bytes("30 0C A1 0A 30 08 30 06 04 04 3F FF 2F 01")

    /** RSA crua: o cartão assina o bloco já com padding PKCS#1 (sem DigestInfo). */
    private fun rsaCru(bloco: ByteArray): ByteArray {
        val k = (chave.modulus.bitLength() + 7) / 8
        val padded = ByteArray(k)
        padded[1] = 0x01
        for (i in 2 until k - bloco.size - 1) padded[i] = 0xFF.toByte()
        bloco.copyInto(padded, k - bloco.size)
        val m = BigInteger(1, padded).modPow(chave.privateExponent, chave.modulus)
        val out = m.toByteArray()
        return when {
            out.size == k -> out
            out.size < k -> ByteArray(k - out.size) + out
            else -> out.copyOfRange(out.size - k, out.size)
        }
    }
}

class StarSignTest {
    private val par = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
    private val cert = CertificadoDeTeste.gerar(par)

    private fun cartao(pin: String = "1234") =
        CartaoSimulado(par.private as RSAPrivateCrtKey, cert, pin)

    @Test
    fun `abre a sessão com handshake e canal lógico`() {
        val c = cartao()
        val s = StarSign(c)
        s.abrir()
        // Duas PUT DATA, SELECT AID, SELECT MF, MANAGE CHANNEL
        assertTrue(c.recebidos.count { it.startsWith("00 DA") } >= 2)
        assertTrue(c.recebidos.any { it.startsWith("00 70") })
    }

    @Test
    fun `lê o contador de PIN sem gastar tentativa`() {
        val c = cartao()
        val s = StarSign(c).apply { abrir() }
        assertEquals(3, s.tentativasRestantes())
        assertEquals(3, c.tentativas)
    }

    @Test
    fun `PIN errado conta a tentativa e lança erro claro`() {
        val c = cartao(pin = "9999")
        val s = StarSign(c).apply { abrir() }
        val e = assertFailsWith<ErroToken> { s.verificarPin("1234".toCharArray()) }
        assertTrue(e.message!!.contains("tentativa"))
        assertEquals(2, c.tentativas)
    }

    @Test
    fun `assina com SHA-256 e a assinatura confere com a chave pública`() {
        val c = cartao()
        val s = StarSign(c).apply { abrir(); verificarPin("1234".toCharArray()) }
        val dados = "autenticação no PJe".toByteArray()
        val assinatura = s.assinarSha256(dados)
        assertEquals(256, assinatura.size)

        val ok = Signature.getInstance("SHA256withRSA").run {
            initVerify(par.public)
            update(dados)
            verify(assinatura)
        }
        assertTrue(ok, "a assinatura do token deve valer como SHA256withRSA")
    }

    @Test
    fun `descobre a referência de chave no PrKDF e a usa no MSE SET`() {
        val c = cartao()
        val s = StarSign(c).apply { abrir(); verificarPin("1234".toCharArray()) }
        assertEquals(listOf("45"), s.refsDeChaveHex())
        s.assinarSha256("x".toByteArray())
        assertEquals(0x45, c.refMseAceita)
        assertEquals("45", s.chaveRefUsadaHex())
    }

    @Test
    fun `reautentica o PIN antes de assinar quando o SELECT AID o resetou`() {
        // Fluxo real: após o PIN, ler a cadeia faz SELECT AID (que reseta a
        // autenticação no SafeSign). A assinatura deve reenviar o PIN e funcionar.
        val c = cartao()
        val s = StarSign(c).apply { abrir(); verificarPin("1234".toCharArray()) }
        s.lerCadeia() // faz SELECT AID → reseta o PIN no cartão simulado
        assertTrue(!c.autenticado, "o SELECT AID da leitura deve ter derrubado o PIN")
        val assinatura = s.assinarSha256("login no PJe".toByteArray())
        assertEquals(256, assinatura.size)
        val ok = Signature.getInstance("SHA256withRSA").run {
            initVerify(par.public); update("login no PJe".toByteArray()); verify(assinatura)
        }
        assertTrue(ok, "após reautenticar, a assinatura deve conferir")
    }

    @Test
    fun `assina mesmo quando a chave do token não é a referência 01`() {
        // O cartão só aceita 0x45; o 01 fixo antigo daria 6A88. A descoberta resolve.
        val c = CartaoSimulado(par.private as RSAPrivateCrtKey, cert, "1234", chaveRefCorreta = 0x45)
        val s = StarSign(c).apply { abrir(); verificarPin("1234".toCharArray()) }
        val assinatura = s.assinarSha256("autenticação".toByteArray())
        assertEquals(256, assinatura.size)
    }

    @Test
    fun `digestInfo é o esperado para SHA-256`() {
        val hash = MessageDigest.getInstance("SHA-256").digest(ByteArray(0))
        val di = Algoritmos.digestInfo("SHA-256", hash)
        assertEquals(51, di.size)
        assertEquals("3031300D060960864801650304020105000420", Hex.de(di.copyOf(19)).replace(" ", ""))
    }

    @Test
    fun `não assina antes do PIN`() {
        val c = cartao()
        val s = StarSign(c).apply { abrir() }
        assertFailsWith<ErroToken> { s.assinarSha256("x".toByteArray()) }
    }

    @Test
    fun `lê a cadeia de certificados`() {
        val c = cartao()
        val s = StarSign(c).apply { abrir(); verificarPin("1234".toCharArray()) }
        val cadeia = s.lerCadeia()
        assertEquals(1, cadeia.size) // só o leaf tem conteúdo no simulado
        assertContentEquals(cert, cadeia.first().encoded)
    }

    @Test
    fun `ordena a folha nao-CA primeiro, ignorando CA orfa de outra cadeia`() {
        // Simula o token real: uma CA órfã (de outra cadeia, ex.: RFB) + a CA do
        // titular + a folha, embaralhadas. A folha (não-CA) deve vir primeiro, e a
        // CA órfã não deve virar "folha".
        val entrada = listOf(ParCaFolha.caOrfa, ParCaFolha.ca, ParCaFolha.folha)
        val ordenada = StarSign.ordenarCadeia(entrada)
        assertEquals(ParCaFolha.folha, ordenada.first(), "a folha do titular (não-CA) deve ser a primeira")
        assertEquals(listOf(ParCaFolha.folha, ParCaFolha.ca), ordenada, "só a cadeia do titular, folha→CA emissora")
    }

    @Test
    fun `AssinanteStarSign assina MD5withRSA e SHA256withRSA`() {
        // O PJe SSO pede SHA256withRSA; o login clássico (cnj.autenticador, ex.:
        // TJRJ) pede MD5withRSA. O token assina os dois.
        val c = cartao()
        val s = StarSign(c).apply { abrir(); verificarPin("1234".toCharArray()) }
        val a = AssinanteStarSign(s, s.lerCadeia())
        val okMd5 = Signature.getInstance("MD5withRSA").run {
            initVerify(par.public); update("x".toByteArray()); verify(a.assinar("MD5withRSA", "x".toByteArray()))
        }
        assertTrue(okMd5, "o token deve assinar MD5withRSA (login clássico do PJe)")
        val okSha = Signature.getInstance("SHA256withRSA").run {
            initVerify(par.public); update("y".toByteArray()); verify(a.assinar("SHA256withRSA", "y".toByteArray()))
        }
        assertTrue(okSha, "o token deve assinar SHA256withRSA (login SSO do PJe)")
    }
}

class DerTest {
    @Test
    fun `lê TLV aninhado e ignora preenchimento`() {
        // SEQUENCE { INTEGER 1, OCTET STRING "ab" } + 0xFF de padding
        val b = Hex.bytes("30 07 02 01 01 04 02 61 62 FF FF")
        val raiz = Der.ler(b)
        assertEquals(1, raiz.size)
        assertEquals(0x30, raiz[0].tag)
        val filhos = raiz[0].filhos()
        assertEquals(2, filhos.size)
        assertEquals(0x02, filhos[0].tag)
        assertContentEquals(byteArrayOf(0x61, 0x62), filhos[1].valor)
    }

    @Test
    fun `lê comprimento longo`() {
        val conteudo = ByteArray(300) { 1 }
        val b = Hex.bytes("04 82 01 2C") + conteudo
        val t = Der.ler(b).single()
        assertEquals(300, t.valor.size)
    }
}

class CcidTest {
    @Test
    fun `enquadra e desenquadra uma troca de APDU`() {
        // Canal USB simulado: devolve um DATA_BLOCK com "9000".
        val canal = object : CanalUsb {
            var ultimoEnvio: ByteArray = ByteArray(0)
            override fun enviar(dados: ByteArray) { ultimoEnvio = dados }
            override fun receber(): ByteArray {
                val payload = Hex.bytes("90 00")
                val msg = ByteArray(10 + payload.size)
                msg[0] = LeitorCcid.DATA_BLOCK.toByte()
                LeitorCcid.escreverLe32(msg, 1, payload.size)
                msg[6] = ultimoEnvio.getOrElse(6) { 0 } // devolve a mesma sequência
                payload.copyInto(msg, 10)
                return msg
            }
        }
        val leitor = LeitorCcid(canal)
        val resp = RespostaApdu.de(leitor.transmitir(Hex.bytes("00 A4 04 00")))
        assertTrue(resp.ok)
        assertEquals(LeitorCcid.XFR_BLOCK, canal.ultimoEnvio[0].toInt() and 0xFF)
        assertEquals(4, LeitorCcid.lerLe32(canal.ultimoEnvio, 1))
    }

    @Test
    fun `detecta nível de troca pelo descritor CCID`() {
        // Descritor CCID (0x21) de 54 bytes com dwFeatures no offset 40 = 0x20000 (APDU curto).
        val d = ByteArray(54)
        d[0] = 54; d[1] = 0x21
        LeitorCcid.escreverLe32(d, 40, 0x20000)
        assertEquals(true, LeitorCcid.nivelApdu(d))
        LeitorCcid.escreverLe32(d, 40, 0x10000) // TPDU
        assertEquals(false, LeitorCcid.nivelApdu(d))
    }
}
