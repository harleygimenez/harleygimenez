package io.github.harleygimenez.assinadorpje.core

import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.Base64

/**
 * Quem assina: uma chave privada RSA e a cadeia do certificado (folha
 * primeiro). É [AutoCloseable] para que assinantes com recurso vivo (token
 * USB) liberem a sessão assim que a tarefa termina; [close] é no-op por padrão.
 */
interface Assinante : AutoCloseable {
    val cadeia: List<X509Certificate>

    override fun close() {}

    /**
     * Assina [dados] com um algoritmo no formato do PJe: `MD5withRSA`,
     * `SHA256withRSA`... ou `ASN1MD5withRSA` (quando [dados] já é o resumo).
     */
    fun assinar(algoritmo: String, dados: ByteArray): ByteArray

    /** Assina um resumo já calculado (o PJe envia o hash do documento). */
    fun assinarResumo(resumo: String, hash: ByteArray): ByteArray

    /**
     * Cadeia no formato PkiPath (ASN.1 DER), em Base64 — o formato que o PJe
     * espera. Completa a cadeia pelo AIA (ver [CompletadorCadeia]) quando o
     * certificado trouxer só a folha, para incluir a AC-OAB e as CAs acima.
     */
    fun cadeiaPkiPathBase64(): String {
        val completa = CompletadorCadeia.completar(cadeia)
        val caminho = CertificateFactory.getInstance("X.509").generateCertPath(completa)
        return Base64.getEncoder().encodeToString(caminho.getEncoded("PkiPath"))
    }

    val titular: String get() = cadeia.firstOrNull()?.subjectX500Principal?.name.orEmpty()
}

/**
 * Assinante baseado em [PrivateKey] da JCA. Serve tanto para chave carregada de
 * um arquivo .pfx/.p12 quanto para chave do KeyChain do Android.
 *
 * Chaves do KeyChain/AndroidKeyStore nem sempre aceitam `MD5withRSA` (o
 * algoritmo que o PJe ainda pede no login). Nesse caso calculamos o resumo aqui
 * e fazemos só a operação RSA PKCS#1 v1.5 com `NONEwithRSA` — o resultado é
 * byte a byte idêntico ao de `MD5withRSA`.
 */
class AssinanteJca(
    private val chave: PrivateKey,
    override val cadeia: List<X509Certificate>,
) : Assinante {

    override fun assinar(algoritmo: String, dados: ByteArray): ByteArray {
        val resumo = Algoritmos.resumoDe(algoritmo)
        // "ASN1MD5withRSA" & cia.: `dados` já é o resumo (o PJe manda o hash do documento).
        if (Algoritmos.resumoPronto(algoritmo)) return assinarResumo(resumo, dados)
        val erroJca = try {
            return Signature.getInstance(Algoritmos.nomeJca(algoritmo)).run {
                initSign(chave)
                update(dados)
                sign()
            }
        } catch (e: Exception) {
            e
        }
        // Caminho manual (resumo + RSA cru com NONEwithRSA). Serve para chaves de
        // arquivo .pfx; chaves do Android Keystore não aceitam RSA cru, então se
        // também falhar, devolvemos o erro original (mais claro que o do raw).
        return try {
            assinarResumo(resumo, MessageDigest.getInstance(resumo).digest(dados))
        } catch (e: Exception) {
            throw erroJca
        }
    }

    override fun assinarResumo(resumo: String, hash: ByteArray): ByteArray =
        Signature.getInstance("NONEwithRSA").run {
            initSign(chave)
            update(Algoritmos.digestInfo(resumo, hash))
            sign()
        }
}

object Algoritmos {
    /**
     * Prefixos DER do `DigestInfo` (PKCS#1 v1.5, RFC 8017 §9.2) para cada resumo.
     */
    private val prefixos: Map<String, ByteArray> = mapOf(
        "MD5" to hex("3020300c06082a864886f70d020505000410"),
        "SHA-1" to hex("3021300906052b0e03021a05000414"),
        "SHA-224" to hex("302d300d06096086480165030402040500041c"),
        "SHA-256" to hex("3031300d060960864801650304020105000420"),
        "SHA-384" to hex("3041300d060960864801650304020205000430"),
        "SHA-512" to hex("3051300d060960864801650304020305000440"),
    )

    private val tamanhos = mapOf("MD5" to 16, "SHA-1" to 20, "SHA-224" to 28, "SHA-256" to 32, "SHA-384" to 48, "SHA-512" to 64)

    /** `ASN1MD5withRSA`, `md5withrsa`, `SHA256withRSA`... → `MD5`, `SHA-256`. */
    fun resumoDe(algoritmo: String): String {
        val a = algoritmo.uppercase().removePrefix("ASN1").replace("-", "")
        val nome = a.substringBefore("WITH")
        return when (nome) {
            "MD5" -> "MD5"
            "SHA1", "SHA" -> "SHA-1"
            "SHA224" -> "SHA-224"
            "SHA256" -> "SHA-256"
            "SHA384" -> "SHA-384"
            "SHA512" -> "SHA-512"
            else -> throw IllegalArgumentException("Algoritmo de assinatura não suportado: $algoritmo")
        }.also {
            if (!a.endsWith("WITHRSA")) throw IllegalArgumentException("Só há suporte a RSA: $algoritmo")
        }
    }

    /** Algoritmos `ASN1...withRSA` assinam um resumo já calculado, sem recalcular o hash. */
    fun resumoPronto(algoritmo: String): Boolean = algoritmo.uppercase().startsWith("ASN1")

    fun nomeJca(algoritmo: String): String = resumoDe(algoritmo).replace("-", "") + "withRSA"

    fun digestInfo(resumo: String, hash: ByteArray): ByteArray {
        val prefixo = prefixos[resumo] ?: throw IllegalArgumentException("Resumo não suportado: $resumo")
        val tamanho = tamanhos.getValue(resumo)
        require(hash.size == tamanho) { "Hash $resumo deve ter $tamanho bytes, recebido ${hash.size}" }
        return prefixo + hash
    }

    fun hex(s: String): ByteArray {
        val limpo = s.trim()
        require(limpo.length % 2 == 0) { "Hexadecimal com tamanho ímpar" }
        return ByteArray(limpo.length / 2) { i -> limpo.substring(2 * i, 2 * i + 2).toInt(16).toByte() }
    }
}
