package io.github.harleygimenez.assinadorpje.core

import io.github.harleygimenez.assinadorpje.core.token.Hex
import java.io.File
import java.nio.file.Files
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Gera, com o keytool, uma CA raiz e uma folha assinada por ela. */
object ParCaFolha {
    private const val SENHA = "senha-teste"
    val ca: X509Certificate
    val folha: X509Certificate

    init {
        val dir = Files.createTempDirectory("cadeia-teste").toFile()
        val ks = File(dir, "ks.p12").path
        val kt = File(System.getProperty("java.home"), "bin/keytool").path
        fun run(vararg args: String) {
            val p = ProcessBuilder(listOf(kt) + args).redirectErrorStream(true).start()
            val saida = p.inputStream.readBytes().toString(Charsets.UTF_8)
            check(p.waitFor() == 0) { "keytool falhou: ${args.joinToString(" ")}\n$saida" }
        }
        val base = arrayOf("-storetype", "PKCS12", "-keystore", ks, "-storepass", SENHA, "-keypass", SENHA)
        run("-genkeypair", "-alias", "ca", "-dname", "CN=AC Teste, O=ICP-Brasil, C=BR",
            "-keyalg", "RSA", "-keysize", "2048", "-validity", "3", "-ext", "bc:c", *base)
        run("-genkeypair", "-alias", "leaf", "-dname", "CN=Fulano:12345678900, O=ICP-Brasil, C=BR",
            "-keyalg", "RSA", "-keysize", "2048", "-validity", "3", *base)
        val csr = File(dir, "leaf.csr").path
        val cer = File(dir, "leaf.cer").path
        run("-certreq", "-alias", "leaf", "-file", csr, *base)
        run("-gencert", "-alias", "ca", "-infile", csr, "-outfile", cer, "-validity", "3", *base)

        val store = KeyStore.getInstance("PKCS12").apply { File(ks).inputStream().use { load(it, SENHA.toCharArray()) } }
        ca = store.getCertificate("ca") as X509Certificate
        folha = CertificateFactory.getInstance("X.509")
            .generateCertificate(File(cer).inputStream()) as X509Certificate
    }
}

class CompletadorCadeiaTest {

    @Test
    fun `parseAia lê a URL de caIssuers`() {
        val url = "http://ca/x.cer"
        val uri = byteArrayOf(0x86.toByte(), url.length.toByte()) + url.toByteArray(Charsets.US_ASCII)
        val oid = Hex.bytes("06 08 2B 06 01 05 05 07 30 02") // caIssuers 1.3.6.1.5.5.7.48.2
        val ad = byteArrayOf(0x30, (oid.size + uri.size).toByte()) + oid + uri
        val aia = byteArrayOf(0x30, ad.size.toByte()) + ad
        assertEquals(listOf(url), CompletadorCadeia.parseAia(aia))
    }

    @Test
    fun `parseAia ignora métodos que não são caIssuers`() {
        // OCSP (1.3.6.1.5.5.7.48.1) deve ser ignorado.
        val url = "http://ocsp/x"
        val uri = byteArrayOf(0x86.toByte(), url.length.toByte()) + url.toByteArray(Charsets.US_ASCII)
        val oid = Hex.bytes("06 08 2B 06 01 05 05 07 30 01")
        val ad = byteArrayOf(0x30, (oid.size + uri.size).toByte()) + oid + uri
        val aia = byteArrayOf(0x30, ad.size.toByte()) + ad
        assertTrue(CompletadorCadeia.parseAia(aia).isEmpty())
    }

    @Test
    fun `reconhece emissor e auto-assinado`() {
        assertTrue(CompletadorCadeia.ehAutoAssinado(ParCaFolha.ca))
        assertFalse(CompletadorCadeia.ehAutoAssinado(ParCaFolha.folha))
        assertTrue(CompletadorCadeia.emissorDe(ParCaFolha.folha, ParCaFolha.ca))
        assertFalse(CompletadorCadeia.emissorDe(ParCaFolha.ca, ParCaFolha.folha))
    }

    @Test
    fun `completar baixa a CA pelo AIA e para na raiz`() {
        val buscador = CompletadorCadeia.Buscador { ParCaFolha.ca.encoded }
        val completa = CompletadorCadeia.completar(
            listOf(ParCaFolha.folha), buscador,
            aiaDe = { listOf("http://repositorio/ca.cer") },
        )
        assertEquals(listOf(ParCaFolha.folha, ParCaFolha.ca), completa)
    }

    @Test
    fun `completa pelas CAs embutidas sem usar a rede`() {
        var baixou = false
        val buscador = CompletadorCadeia.Buscador { baixou = true; null }
        val completa = CompletadorCadeia.completar(
            listOf(ParCaFolha.folha),
            buscador = buscador,
            locais = listOf(ParCaFolha.ca),
            aiaDe = { listOf("http://x") },
        )
        assertEquals(listOf(ParCaFolha.folha, ParCaFolha.ca), completa)
        assertFalse(baixou, "com a CA embutida, não deve baixar pela rede")
    }

    @Test
    fun `sem buscador devolve a cadeia original`() {
        val so = listOf(ParCaFolha.folha)
        assertEquals(so, CompletadorCadeia.completar(so, buscador = null, aiaDe = { listOf("http://x") }))
    }

    @Test
    fun `não baixa quando a cadeia já termina na raiz`() {
        var chamou = false
        val buscador = CompletadorCadeia.Buscador { chamou = true; null }
        val completa = CompletadorCadeia.completar(
            listOf(ParCaFolha.folha, ParCaFolha.ca), buscador,
            aiaDe = { listOf("http://x") },
        )
        assertEquals(listOf(ParCaFolha.folha, ParCaFolha.ca), completa)
        assertFalse(chamou, "não deve baixar nada se o topo já é a raiz")
    }
}
