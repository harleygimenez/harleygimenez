package io.github.harleygimenez.assinadorpje.core

/**
 * Leitor/gravador JSON mínimo, sem dependências, para que o núcleo rode igual
 * na JVM (testes) e no Android. Objetos viram [Map], listas viram [List],
 * números viram [Long] ou [Double].
 */
object Json {

    class ErroJson(mensagem: String) : IllegalArgumentException(mensagem)

    fun ler(texto: String): Any? {
        val leitor = Leitor(texto)
        leitor.espacos()
        val valor = leitor.valor()
        leitor.espacos()
        if (!leitor.fim()) throw ErroJson("Conteúdo extra na posição ${leitor.pos}")
        return valor
    }

    @Suppress("UNCHECKED_CAST")
    fun lerObjeto(texto: String): Map<String, Any?> =
        ler(texto) as? Map<String, Any?> ?: throw ErroJson("Esperado um objeto JSON")

    fun escrever(valor: Any?): String = StringBuilder().also { escrever(valor, it) }.toString()

    private fun escrever(valor: Any?, sb: StringBuilder) {
        when (valor) {
            null -> sb.append("null")
            is String -> texto(valor, sb)
            is Boolean, is Int, is Long -> sb.append(valor.toString())
            is Number -> {
                val d = valor.toDouble()
                if (d.isNaN() || d.isInfinite()) sb.append("null") else sb.append(valor.toString())
            }
            is Map<*, *> -> {
                sb.append('{')
                var primeiro = true
                for ((k, v) in valor) {
                    if (!primeiro) sb.append(',')
                    primeiro = false
                    texto(k.toString(), sb)
                    sb.append(':')
                    escrever(v, sb)
                }
                sb.append('}')
            }
            is Iterable<*> -> {
                sb.append('[')
                var primeiro = true
                for (v in valor) {
                    if (!primeiro) sb.append(',')
                    primeiro = false
                    escrever(v, sb)
                }
                sb.append(']')
            }
            is Array<*> -> escrever(valor.asList(), sb)
            else -> texto(valor.toString(), sb)
        }
    }

    private fun texto(s: String, sb: StringBuilder) {
        sb.append('"')
        for (c in s) {
            when (c) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                '\b' -> sb.append("\\b")
                '\u000C' -> sb.append("\\f")
                else -> if (c < ' ') sb.append(String.format("\\u%04x", c.code)) else sb.append(c)
            }
        }
        sb.append('"')
    }

    private class Leitor(val s: String) {
        var pos = 0

        fun fim() = pos >= s.length

        fun espacos() {
            while (pos < s.length && s[pos].isWhitespace()) pos++
        }

        fun valor(): Any? {
            if (fim()) throw ErroJson("Fim inesperado do JSON")
            return when (val c = s[pos]) {
                '{' -> objeto()
                '[' -> lista()
                '"' -> texto()
                't' -> literal("true", true)
                'f' -> literal("false", false)
                'n' -> literal("null", null)
                else -> if (c == '-' || c.isDigit()) numero() else throw ErroJson("Caractere inesperado '$c' na posição $pos")
            }
        }

        private fun literal(palavra: String, valor: Any?): Any? {
            if (!s.startsWith(palavra, pos)) throw ErroJson("Literal inválido na posição $pos")
            pos += palavra.length
            return valor
        }

        private fun objeto(): Map<String, Any?> {
            val mapa = LinkedHashMap<String, Any?>()
            pos++
            espacos()
            if (s.getOrNull(pos) == '}') { pos++; return mapa }
            while (true) {
                espacos()
                if (s.getOrNull(pos) != '"') throw ErroJson("Esperada chave na posição $pos")
                val chave = texto()
                espacos()
                if (s.getOrNull(pos) != ':') throw ErroJson("Esperado ':' na posição $pos")
                pos++
                espacos()
                mapa[chave] = valor()
                espacos()
                when (s.getOrNull(pos)) {
                    ',' -> pos++
                    '}' -> { pos++; return mapa }
                    else -> throw ErroJson("Esperado ',' ou '}' na posição $pos")
                }
            }
        }

        private fun lista(): List<Any?> {
            val itens = ArrayList<Any?>()
            pos++
            espacos()
            if (s.getOrNull(pos) == ']') { pos++; return itens }
            while (true) {
                espacos()
                itens.add(valor())
                espacos()
                when (s.getOrNull(pos)) {
                    ',' -> pos++
                    ']' -> { pos++; return itens }
                    else -> throw ErroJson("Esperado ',' ou ']' na posição $pos")
                }
            }
        }

        private fun texto(): String {
            val sb = StringBuilder()
            pos++
            while (true) {
                if (fim()) throw ErroJson("Texto não terminado")
                val c = s[pos++]
                when (c) {
                    '"' -> return sb.toString()
                    '\\' -> {
                        if (fim()) throw ErroJson("Escape incompleto")
                        when (val e = s[pos++]) {
                            '"' -> sb.append('"')
                            '\\' -> sb.append('\\')
                            '/' -> sb.append('/')
                            'b' -> sb.append('\b')
                            'f' -> sb.append('\u000C')
                            'n' -> sb.append('\n')
                            'r' -> sb.append('\r')
                            't' -> sb.append('\t')
                            'u' -> {
                                if (pos + 4 > s.length) throw ErroJson("Escape \\u incompleto")
                                sb.append(s.substring(pos, pos + 4).toInt(16).toChar())
                                pos += 4
                            }
                            else -> throw ErroJson("Escape inválido '\\$e'")
                        }
                    }
                    else -> sb.append(c)
                }
            }
        }

        private fun numero(): Number {
            val inicio = pos
            if (s[pos] == '-') pos++
            while (pos < s.length && (s[pos].isDigit() || s[pos] in ".eE+-")) pos++
            val txt = s.substring(inicio, pos)
            return txt.toLongOrNull() ?: txt.toDoubleOrNull() ?: throw ErroJson("Número inválido '$txt'")
        }
    }
}
