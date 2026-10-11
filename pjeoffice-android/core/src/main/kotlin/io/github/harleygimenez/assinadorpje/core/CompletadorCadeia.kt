package io.github.harleygimenez.assinadorpje.core

import io.github.harleygimenez.assinadorpje.core.token.Der
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate

/**
 * Completa a cadeia de certificados a partir da folha, seguindo o campo AIA
 * (Authority Information Access → caIssuers) de cada certificado. Os
 * certificados do ICP-Brasil (inclusive os da AC-OAB) trazem nesse campo a URL
 * do certificado do emissor no repositório do ITI, então dá para montar a
 * cadeia inteira (folha → AC-OAB 2º nível → CAs acima → raiz) sem precisar
 * embutir nenhum certificado no app.
 *
 * O download fica a cargo de um [Buscador] injetado pelo app (o núcleo não
 * acessa a rede), e só é usado quando a cadeia está incompleta — para o token,
 * que já devolve a cadeia toda, nada é baixado.
 */
object CompletadorCadeia {

    /** Baixa os bytes de uma URL (certificado DER/PEM ou pacote PKCS#7). */
    fun interface Buscador {
        fun buscar(url: String): ByteArray?
    }

    /** Buscador padrão, definido pelo app (via rede). Nulo = sem buscar na rede. */
    @Volatile
    var padrao: Buscador? = null

    /**
     * CAs embutidas no app (ex.: cadeias da AC-OAB), usadas antes da rede.
     * Definidas pelo app ao iniciar.
     */
    @Volatile
    var caisLocais: List<X509Certificate> = emptyList()

    private const val OID_AIA = "1.3.6.1.5.5.7.1.1"
    private const val OID_CA_ISSUERS = "1.3.6.1.5.5.7.48.2"

    /**
     * Devolve a cadeia completada (folha primeiro). Se [buscador] for nulo, ou
     * não houver como avançar, devolve o que já tinha. Nunca lança por rede.
     */
    fun completar(
        inicial: List<X509Certificate>,
        buscador: Buscador? = padrao,
        locais: List<X509Certificate> = caisLocais,
        maxExtra: Int = 8,
        aiaDe: (X509Certificate) -> List<String> = ::caIssuers,
    ): List<X509Certificate> {
        if (inicial.isEmpty() || (buscador == null && locais.isEmpty())) return inicial
        val cf = CertificateFactory.getInstance("X.509")
        val saida = ArrayList(inicial)
        var extra = 0
        while (extra < maxExtra) {
            val topo = saida.last()
            if (ehAutoAssinado(topo)) break
            // Se o emissor já está na cadeia, nada a fazer.
            if (saida.any { it !== topo && emissorDe(topo, it) }) break
            // 1) procura o emissor nas CAs embutidas (sem rede);
            // 2) se não achar, baixa pelo AIA.
            val emissor = locais.firstOrNull { emissorDe(topo, it) }
                ?: buscador?.let { b ->
                    aiaDe(topo).asSequence()
                        .mapNotNull { runCatching { b.buscar(it) }.getOrNull() }
                        .flatMap { bytes -> lerCertificados(cf, bytes).asSequence() }
                        .firstOrNull { emissorDe(topo, it) }
                }
                ?: break
            if (saida.any { mesmo(it, emissor) }) break
            saida.add(emissor)
            extra++
        }
        return saida
    }

    /** URLs de caIssuers no campo AIA do certificado. */
    fun caIssuers(cert: X509Certificate): List<String> {
        val bruto = cert.getExtensionValue(OID_AIA) ?: return emptyList()
        // extensionValue é um OCTET STRING envolvendo a AIA.
        val interno = Der.ler(bruto).firstOrNull { it.tag == 0x04 }?.valor ?: return emptyList()
        return parseAia(interno)
    }

    /** Extrai as URLs caIssuers de uma `AuthorityInfoAccessSyntax` (DER). */
    fun parseAia(aiaDer: ByteArray): List<String> {
        val seq = Der.ler(aiaDer).firstOrNull { it.tag == 0x30 } ?: return emptyList()
        val urls = mutableListOf<String>()
        for (ad in seq.filhos()) { // cada AccessDescription (SEQUENCE)
            if (ad.tag != 0x30) continue
            val filhos = ad.filhos()
            val oid = filhos.firstOrNull { it.tag == 0x06 }?.let { oidTexto(it.valor) }
            if (oid != OID_CA_ISSUERS) continue
            // accessLocation: GeneralName uniformResourceIdentifier = [6] IA5String (tag 0x86)
            val uri = filhos.firstOrNull { it.tag == 0x86 } ?: continue
            urls += String(uri.valor, Charsets.US_ASCII)
        }
        return urls
    }

    /** Lê 1+ certificados de bytes DER, PEM ou pacote PKCS#7. */
    private fun lerCertificados(cf: CertificateFactory, bytes: ByteArray): List<X509Certificate> =
        runCatching {
            cf.generateCertificates(bytes.inputStream()).map { it as X509Certificate }
        }.getOrElse {
            runCatching { listOf(cf.generateCertificate(bytes.inputStream()) as X509Certificate) }.getOrDefault(emptyList())
        }

    fun ehAutoAssinado(c: X509Certificate): Boolean =
        c.subjectX500Principal == c.issuerX500Principal && emissorDe(c, c)

    /** `candidato` é o emissor de `filho`? (nome bate e a assinatura confere) */
    fun emissorDe(filho: X509Certificate, candidato: X509Certificate): Boolean {
        if (filho.issuerX500Principal != candidato.subjectX500Principal) return false
        return runCatching { filho.verify(candidato.publicKey); true }.getOrDefault(false)
    }

    private fun mesmo(a: X509Certificate, b: X509Certificate): Boolean =
        a.serialNumber == b.serialNumber && a.subjectX500Principal == b.subjectX500Principal

    private fun oidTexto(der: ByteArray): String {
        if (der.isEmpty()) return ""
        val sb = StringBuilder()
        val primeiro = der[0].toInt() and 0xFF
        sb.append(primeiro / 40).append('.').append(primeiro % 40)
        var valor = 0L
        for (i in 1 until der.size) {
            val b = der[i].toInt() and 0xFF
            valor = (valor shl 7) or (b and 0x7F).toLong()
            if (b and 0x80 == 0) { sb.append('.').append(valor); valor = 0 }
        }
        return sb.toString()
    }
}
