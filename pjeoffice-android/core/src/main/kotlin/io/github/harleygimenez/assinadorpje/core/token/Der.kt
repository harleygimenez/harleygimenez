package io.github.harleygimenez.assinadorpje.core.token

/** Leitor DER mínimo (TLV), suficiente para os diretórios PKCS#15. */
class Tlv(val tag: Int, val valor: ByteArray, val construido: Boolean) {
    fun filhos(): List<Tlv> = if (construido) Der.ler(valor) else emptyList()

    /** Todos os nós da árvore, em profundidade. */
    fun todos(): List<Tlv> = listOf(this) + filhos().flatMap { it.todos() }
}

object Der {
    fun ler(b: ByteArray): List<Tlv> {
        val saida = mutableListOf<Tlv>()
        var i = 0
        while (i < b.size) {
            val inicio = b[i].toInt() and 0xFF
            // Preenchimento comum no fim de EFs PKCS#15
            if (inicio == 0x00 || inicio == 0xFF) break
            var tag = inicio
            i++
            if (inicio and 0x1F == 0x1F) {
                while (i < b.size) {
                    val c = b[i++].toInt() and 0xFF
                    tag = (tag shl 8) or c
                    if (c and 0x80 == 0) break
                }
            }
            if (i >= b.size) break
            var len = b[i++].toInt() and 0xFF
            if (len and 0x80 != 0) {
                val n = len and 0x7F
                if (n == 0 || n > 3 || i + n > b.size) break
                len = 0
                repeat(n) { len = (len shl 8) or (b[i++].toInt() and 0xFF) }
            }
            if (i + len > b.size) break
            saida += Tlv(tag, b.copyOfRange(i, i + len), inicio and 0x20 != 0)
            i += len
        }
        return saida
    }
}
