package io.github.harleygimenez.assinadorpje.core.token

import java.io.File
import java.nio.file.Files
import java.security.KeyPair
import java.security.KeyStore
import java.security.cert.X509Certificate

/** Gera um certificado X.509 DER de teste a partir de um par de chaves, via keytool. */
object CertificadoDeTeste {
    fun gerar(par: KeyPair): ByteArray {
        val dir = Files.createTempDirectory("starsign-teste").toFile()
        val pfx = File(dir, "t.p12")
        val keytool = File(System.getProperty("java.home"), "bin/keytool").path
        val senha = "senha-teste"
        val p = ProcessBuilder(
            keytool, "-genkeypair", "-alias", "a", "-keyalg", "RSA", "-keysize", "2048",
            "-dname", "CN=Fulano:12345678900, O=ICP-Brasil, C=BR", "-validity", "2",
            "-storetype", "PKCS12", "-keystore", pfx.path, "-storepass", senha, "-keypass", senha,
        ).redirectErrorStream(true).start()
        val saida = p.inputStream.readBytes().toString(Charsets.UTF_8)
        check(p.waitFor() == 0) { "keytool falhou: $saida" }
        val ks = KeyStore.getInstance("PKCS12").apply { pfx.inputStream().use { load(it, senha.toCharArray()) } }
        val cert = ks.getCertificate("a") as X509Certificate
        // Ignoramos o par recebido para o conteúdo: o teste usa a chave do keystore
        // via CartaoSimulado só para a RSA; o que importa é o DER válido.
        return cert.encoded
    }
}
