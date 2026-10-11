package io.github.harleygimenez.assinadorpje.core.token

import java.io.ByteArrayOutputStream

/** Os dois endpoints bulk de um leitor CCID (implementado no app com `UsbDeviceConnection`). */
interface CanalUsb : AutoCloseable {
    fun enviar(dados: ByteArray)

    /** Lê o que vier no endpoint bulk-in (um ou mais pacotes USB). */
    fun receber(): ByteArray

    override fun close() {}
}

/**
 * Leitor CCID (USB "Smart Card", classe 0x0B) no nível de troca de APDU curto,
 * que é o que o leitor embutido no StarSign CUT S anuncia.
 *
 * Mensagens (CCID 1.1, §6): cabeçalho de 10 bytes
 * `tipo | tamanho (4, little-endian) | slot | seq | 3 bytes específicos`.
 */
class LeitorCcid(
    private val usb: CanalUsb,
    private val log: LogApdu? = null,
    private val slot: Int = 0,
) : Transporte {
    private var seq = 0
    override var atr: ByteArray = ByteArray(0)
        private set

    /** Liga o cartão (PC_to_RDR_IccPowerOn) e guarda o ATR. */
    fun ligar(): ByteArray {
        val r = trocar(POWER_ON, ByteArray(0), byteArrayOf(0, 0, 0)) // bPowerSelect = automático
        atr = r
        log?.add("ATR ${Hex.de(r)}")
        return r
    }

    fun desligar() {
        runCatching { trocar(POWER_OFF, ByteArray(0), byteArrayOf(0, 0, 0)) }
    }

    override fun transmitir(apdu: ByteArray): ByteArray =
        trocar(XFR_BLOCK, apdu, byteArrayOf(0, 0, 0)) // bBWI = 0, wLevelParameter = 0 (APDU curto)

    override fun close() {
        desligar()
        usb.close()
    }

    private fun trocar(tipo: Int, dados: ByteArray, especificos: ByteArray): ByteArray {
        val s = seq
        seq = (seq + 1) and 0xFF
        val msg = ByteArray(10 + dados.size)
        msg[0] = tipo.toByte()
        escreverLe32(msg, 1, dados.size)
        msg[5] = slot.toByte()
        msg[6] = s.toByte()
        especificos.copyInto(msg, 7)
        dados.copyInto(msg, 10)
        usb.enviar(msg)

        while (true) {
            val resp = lerMensagem()
            if (resp.size < 10) throw ErroToken("Resposta CCID curta (${resp.size} bytes)")
            val rseq = resp[6].toInt() and 0xFF
            if (rseq != s) continue // resposta atrasada de um comando anterior
            val status = resp[7].toInt() and 0xFF
            val erro = resp[8].toInt() and 0xFF
            when (status ushr 6) {
                0 -> return resp.copyOfRange(10, 10 + lerLe32(resp, 1))
                2 -> continue // pedido de mais tempo (time extension): a resposta vem depois
                else -> {
                    val icc = status and 0x03
                    val motivo = when {
                        icc == 2 -> "nenhum cartão no leitor"
                        icc == 1 -> "cartão inativo"
                        erro == 0xFE -> "cartão removido ou mudo"
                        erro == 0xFD -> "erro de paridade"
                        erro == 0xFB -> "erro de hardware"
                        erro == 0xF8 -> "erro de procedimento"
                        erro == 0xF4 -> "procedimento interrompido"
                        else -> "erro 0x%02X".format(erro)
                    }
                    throw ErroToken("Leitor CCID recusou o comando: $motivo")
                }
            }
        }
    }

    private fun lerMensagem(): ByteArray {
        val acc = ByteArrayOutputStream()
        var esperado = -1
        while (true) {
            val parte = usb.receber()
            if (parte.isEmpty()) throw ErroToken("O token não respondeu (tempo esgotado)")
            acc.write(parte)
            val b = acc.toByteArray()
            if (esperado < 0 && b.size >= 10) esperado = 10 + lerLe32(b, 1)
            if (esperado in 0..b.size) return b.copyOf(esperado)
        }
    }

    companion object {
        const val POWER_ON = 0x62
        const val POWER_OFF = 0x63
        const val XFR_BLOCK = 0x6F
        const val DATA_BLOCK = 0x80

        fun lerLe32(b: ByteArray, i: Int): Int =
            (b[i].toInt() and 0xFF) or ((b[i + 1].toInt() and 0xFF) shl 8) or
                ((b[i + 2].toInt() and 0xFF) shl 16) or ((b[i + 3].toInt() and 0xFF) shl 24)

        fun escreverLe32(b: ByteArray, i: Int, v: Int) {
            b[i] = v.toByte(); b[i + 1] = (v ushr 8).toByte(); b[i + 2] = (v ushr 16).toByte(); b[i + 3] = (v ushr 24).toByte()
        }

        /**
         * Lê o descritor de classe CCID (tipo 0x21, 54 bytes) dos descritores
         * brutos do dispositivo, para diagnóstico.
         */
        fun descreverDescritor(brutos: ByteArray?): String {
            if (brutos == null) return "descritores USB indisponíveis"
            var i = 0
            while (i + 1 < brutos.size) {
                val len = brutos[i].toInt() and 0xFF
                if (len == 0) break
                val tipo = brutos[i + 1].toInt() and 0xFF
                if (tipo == 0x21 && len >= 54 && i + 54 <= brutos.size) {
                    val features = lerLe32(brutos, i + 40)
                    val maxMsg = lerLe32(brutos, i + 44)
                    val nivel = when {
                        features and 0x40000 != 0 -> "APDU estendido"
                        features and 0x20000 != 0 -> "APDU curto"
                        features and 0x10000 != 0 -> "TPDU"
                        else -> "caractere"
                    }
                    val protocolos = lerLe32(brutos, i + 6)
                    return "CCID: troca=$nivel, dwFeatures=0x%08X, dwMaxCCIDMessageLength=$maxMsg, protocolos=0x%X"
                        .format(features, protocolos)
                }
                i += len
            }
            return "descritor CCID não encontrado"
        }

        /** O leitor precisa trocar APDUs inteiros; TPDU/caractere exigiria T=0/T=1 no app. */
        fun nivelApdu(brutos: ByteArray?): Boolean? {
            if (brutos == null) return null
            var i = 0
            while (i + 1 < brutos.size) {
                val len = brutos[i].toInt() and 0xFF
                if (len == 0) break
                if ((brutos[i + 1].toInt() and 0xFF) == 0x21 && len >= 54 && i + 54 <= brutos.size) {
                    return lerLe32(brutos, i + 40) and 0x60000 != 0
                }
                i += len
            }
            return null
        }
    }
}
