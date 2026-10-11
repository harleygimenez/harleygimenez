package io.github.harleygimenez.assinadorpje.core

import java.io.File
import java.nio.file.Files
import java.security.KeyStore
import java.security.PrivateKey
import java.security.cert.X509Certificate

/** Certificado de teste gerado com o `keytool` da própria JDK. */
object CertificadoTeste {
    const val SENHA = "senha-teste"

    val arquivo: File by lazy {
        val dir = Files.createTempDirectory("assinador-teste").toFile()
        val pfx = File(dir, "teste.p12")
        val keytool = File(System.getProperty("java.home"), "bin/keytool").path
        val p = ProcessBuilder(
            keytool, "-genkeypair", "-alias", "teste", "-keyalg", "RSA", "-keysize", "2048",
            "-dname", "CN=Fulano de Tal:12345678900, O=ICP-Brasil, C=BR", "-validity", "2",
            "-storetype", "PKCS12", "-keystore", pfx.path, "-storepass", SENHA, "-keypass", SENHA,
        ).redirectErrorStream(true).start()
        val saida = p.inputStream.readBytes().toString(Charsets.UTF_8)
        check(p.waitFor() == 0) { "keytool falhou: $saida" }
        pfx
    }

    private val ks: KeyStore by lazy {
        KeyStore.getInstance("PKCS12").apply { arquivo.inputStream().use { load(it, SENHA.toCharArray()) } }
    }

    val chave: PrivateKey get() = ks.getKey("teste", SENHA.toCharArray()) as PrivateKey
    val cadeia: List<X509Certificate> get() = ks.getCertificateChain("teste").map { it as X509Certificate }
    val assinante: Assinante get() = AssinanteJca(chave, cadeia)
}

class EnvioGravado(val url: String, val tipo: String, val corpo: String, val cabecalhos: Map<String, String>)

class ClienteHttpFalso(private val status: Int = 200, private val corpo: String = "") : ClienteHttp {
    val envios = mutableListOf<EnvioGravado>()

    override fun post(url: String, tipoConteudo: String, corpo: ByteArray, cabecalhos: Map<String, String>): RespostaHttp {
        synchronized(envios) { envios += EnvioGravado(url, tipoConteudo, corpo.toString(Charsets.UTF_8), cabecalhos) }
        return RespostaHttp(status, this.corpo)
    }
}
