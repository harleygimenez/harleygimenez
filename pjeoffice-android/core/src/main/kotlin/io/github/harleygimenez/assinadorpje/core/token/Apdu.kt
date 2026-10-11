package io.github.harleygimenez.assinadorpje.core.token

/** Resposta de um comando APDU: dados + status word (SW1 SW2). */
class RespostaApdu(val dados: ByteArray, val sw: Int) {
    val ok: Boolean get() = sw == 0x9000
    val sw1: Int get() = sw ushr 8
    val sw2: Int get() = sw and 0xFF

    fun exigirOk(oQue: String): ByteArray {
        if (!ok) throw ErroToken("$oQue: o token respondeu ${Hex.sw(sw)} (${Hex.significado(sw)})", sw)
        return dados
    }

    companion object {
        fun de(bruto: ByteArray): RespostaApdu {
            require(bruto.size >= 2) { "Resposta APDU curta demais" }
            val sw = ((bruto[bruto.size - 2].toInt() and 0xFF) shl 8) or (bruto[bruto.size - 1].toInt() and 0xFF)
            return RespostaApdu(bruto.copyOfRange(0, bruto.size - 2), sw)
        }
    }
}

class ErroToken(mensagem: String, val sw: Int = -1) : Exception(mensagem)

/** Leva APDUs até o cartão e devolve a resposta bruta (dados + SW). */
interface Transporte : AutoCloseable {
    /** ATR do cartão (obtido ao ligar). */
    val atr: ByteArray

    fun transmitir(apdu: ByteArray): ByteArray

    override fun close() {}
}

object Apdu {
    /** Monta um APDU curto (ISO 7816-4). [le] = null omite o Le. */
    fun montar(cla: Int, ins: Int, p1: Int, p2: Int, dados: ByteArray? = null, le: Int? = null): ByteArray {
        val b = java.io.ByteArrayOutputStream()
        b.write(cla); b.write(ins); b.write(p1); b.write(p2)
        if (dados != null && dados.isNotEmpty()) {
            require(dados.size <= 255) { "APDU curto aceita até 255 bytes de dados" }
            b.write(dados.size)
            b.write(dados)
        }
        if (le != null) b.write(le and 0xFF)
        return b.toByteArray()
    }
}

object Hex {
    fun de(b: ByteArray, max: Int = Int.MAX_VALUE): String {
        val n = minOf(b.size, max)
        val s = (0 until n).joinToString(" ") { "%02X".format(b[it].toInt() and 0xFF) }
        return if (b.size > n) "$s … (+${b.size - n} bytes)" else s
    }

    fun bytes(s: String): ByteArray {
        val limpo = s.replace(" ", "").replace(":", "")
        require(limpo.length % 2 == 0)
        return ByteArray(limpo.length / 2) { limpo.substring(2 * it, 2 * it + 2).toInt(16).toByte() }
    }

    fun sw(sw: Int) = "%04X".format(sw)

    fun significado(sw: Int): String = when {
        sw == 0x9000 -> "ok"
        sw ushr 8 == 0x61 -> "há mais dados"
        sw ushr 8 == 0x6C -> "tamanho esperado ${sw and 0xFF}"
        sw and 0xFFF0 == 0x63C0 -> "PIN incorreto, restam ${sw and 0x0F} tentativa(s)"
        sw == 0x6983 -> "PIN bloqueado"
        sw == 0x6982 -> "condição de segurança não satisfeita (falta PIN?)"
        sw == 0x6985 -> "condições de uso não satisfeitas"
        sw == 0x6A80 -> "dados incorretos"
        sw == 0x6A82 -> "arquivo não encontrado"
        sw == 0x6A86 -> "P1/P2 incorretos"
        sw == 0x6A88 -> "dado de referência não encontrado"
        sw == 0x6700 -> "tamanho incorreto"
        sw == 0x6D00 -> "instrução não suportada"
        sw == 0x6E00 -> "classe não suportada"
        else -> "desconhecido"
    }
}

/** Log das APDUs de uma sessão, para diagnóstico. Nunca registra o PIN. */
class LogApdu {
    private val linhas = mutableListOf<String>()

    @Synchronized
    fun add(linha: String) {
        linhas += linha
        if (linhas.size > 2000) linhas.removeAt(0)
    }

    @Synchronized
    fun texto(): String = linhas.joinToString("\n")
}
