package io.github.harleygimenez.assinadorpje.core

import java.io.ByteArrayInputStream
import java.math.BigInteger
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.interfaces.RSAPublicKey
import java.util.Base64

/**
 * Verificação do `codigoSeguranca` enviado pelo PJe, como faz o PJeOffice
 * (`PjePermissionChecker`): o código é `"aplicacao:url1,url2,..."` cifrado
 * com a chave privada do CNJ. Decifrado com a chave pública do certificado
 * `PJeOffice.cer`, ele diz quais servidores o CNJ autorizou para aquela
 * aplicação.
 */
object CodigoSeguranca {

    /** Certificado público "PJe" do CNJ distribuído com o PJeOffice (MIT, signer4j-pje). */
    private const val CERTIFICADO_CNJ_BASE64 =
        "MIIDrjCCApYCCQCdUO9BXLny8TANBgkqhkiG9w0BAQsFADCBmDELMAkGA1UEBhMCQlIxETAPBgNVBAgMCEJyYXNpbGlhMREwDwYDVQQHDAhCcmFzaWxpYTEoMCYGA1UECgwfQ29uc2VsaG8gTmFjaW9uYWwgZGUgSnVzdGnDg8KnYTEMMAoGA1UECwwDUEpFMQwwCgYDVQQDDANQSmUxHTAbBgkqhkiG9w0BCQEWDnBqZUBjbmouanVzLmJyMB4XDTE2MDIxNzIyMjAxMVoXDTI2MDIxNDIyMjAxMVowgZgxCzAJBgNVBAYTAkJSMREwDwYDVQQIDAhCcmFzaWxpYTERMA8GA1UEBwwIQnJhc2lsaWExKDAmBgNVBAoMH0NvbnNlbGhvIE5hY2lvbmFsIGRlIEp1c3Rpw4PCp2ExDDAKBgNVBAsMA1BKRTEMMAoGA1UEAwwDUEplMR0wGwYJKoZIhvcNAQkBFg5wamVAY25qLmp1cy5icjCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAMWucUVfkDlm4+/oOJCaCdgswt+G+K9Mkzizu1LTX2sLQ88uForoGotLpQ7+2Isplv/LFsNzKedHjdEnALM2sMTsFKwk7ceMmSL9OQ80/ejpksomH9TPn3oDuMS8+386nAtGeuBGrkfcRBllwHT4fQRLR0LBJIg3Xilv7l6DcuuE2FXAEervZ2SucZvznIHnsx233IDj4P40+CodKuEPWYf5Ok7GnlY7rmOy8P1/84L2o3S9EYjpOszPMfGzNuFt4u1aifzaJ26qP52ALL4He+h4ncQBZV6dZo6dDGBN639P4JCfZeIl3C5U9jLG7Oo2nA00xrtWHyIMjSeaICtA1UUCAwEAATANBgkqhkiG9w0BAQsFAAOCAQEAs5ql6uErVqi96ljD8ljJnteLrYYnDWLE8NEz3S7OW9as8Rrnpznbu3cCASl3z2V0+E7DZRYPx28FGoFBnrUcd2K4Y5rm0Ubt9usLTrnI7lfTn4AKiEExvja0KLISL4z5rSpZpeFVB8zyNkx1E1SbnruKHYjNHlDXnT/rw/NGz5omIs0iRxr1RCCc1M0jl4V7oihVSgJ8WNnZUAJozlhJNDBv3A+3OEu6PtXVd7tV29dbnbNYqBdOq2FfPuz35S0r5rndvLDces/6DEMG4zOcch4Klxi8H/Xeevq7OeEx6de6IF671C13aVWS8iBwi4NbEHHIKBxpEhuqqwpRb/70Uw=="

    private val chave: RSAPublicKey by lazy {
        val der = Base64.getDecoder().decode(CERTIFICADO_CNJ_BASE64)
        val cert = CertificateFactory.getInstance("X.509").generateCertificate(ByteArrayInputStream(der)) as X509Certificate
        cert.publicKey as RSAPublicKey
    }

    /** Decifra o código; devolve `aplicacao` e a lista de servidores autorizados. */
    fun decifrar(codigo: String, chavePublica: RSAPublicKey = chave): Pair<String, List<String>>? {
        val bytes = runCatching { Base64.getMimeDecoder().decode(codigo.trim()) }.getOrNull() ?: return null
        val texto = rsaPublicoDecifrar(bytes, chavePublica)?.toString(Charsets.UTF_8)?.trim() ?: return null
        val i = texto.indexOf(':')
        if (i <= 0 || i == texto.length - 1) return null
        val app = texto.substring(0, i).trim()
        val urls = texto.substring(i + 1).split(',').map { it.trim() }.filter { it.isNotEmpty() }
        return app to urls
    }

    /** `true` se o código autoriza esse par aplicação/servidor. */
    fun autoriza(codigo: String?, aplicacao: String?, servidor: String, chavePublica: RSAPublicKey = chave): Boolean {
        if (codigo.isNullOrBlank() || aplicacao.isNullOrBlank()) return false
        val (app, urls) = decifrar(codigo, chavePublica) ?: return false
        return app == aplicacao && urls.any { it.equals(servidor, ignoreCase = true) }
    }

    /**
     * `RSA/ECB/PKCS1Padding` em modo DECRYPT com chave pública, feito à mão
     * com BigInteger porque nem todo provedor do Android aceita esse uso.
     */
    internal fun rsaPublicoDecifrar(dados: ByteArray, chave: RSAPublicKey): ByteArray? {
        val k = (chave.modulus.bitLength() + 7) / 8
        if (dados.size != k) return null
        val m = BigInteger(1, dados).modPow(chave.publicExponent, chave.modulus)
        val bloco = m.toByteArray().let { b ->
            when {
                b.size == k -> b
                b.size < k -> ByteArray(k - b.size) + b
                else -> b.copyOfRange(b.size - k, b.size)
            }
        }
        // 00 || BT (01 ou 02) || PS (>= 8 bytes) || 00 || mensagem
        if (bloco[0] != 0.toByte() || (bloco[1] != 1.toByte() && bloco[1] != 2.toByte())) return null
        var i = 2
        while (i < k && bloco[i] != 0.toByte()) i++
        if (i >= k || i < 10) return null
        return bloco.copyOfRange(i + 1, k)
    }
}
