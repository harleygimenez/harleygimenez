package io.github.harleygimenez.assinadorpje

import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import io.github.harleygimenez.assinadorpje.core.token.CanalUsb
import io.github.harleygimenez.assinadorpje.core.token.ErroToken
import io.github.harleygimenez.assinadorpje.core.token.LeitorCcid

/**
 * Canal bulk USB para um leitor CCID (classe 0x0B), sobre a API de host USB do
 * Android. Serve para o token G&D StarSign CUT S com cabo OTG.
 */
class UsbCcid(
    private val conexao: UsbDeviceConnection,
    private val iface: UsbInterface,
    private val bulkIn: UsbEndpoint,
    private val bulkOut: UsbEndpoint,
    private val timeoutMs: Int = 15_000,
) : CanalUsb {

    override fun enviar(dados: ByteArray) {
        var off = 0
        while (off < dados.size) {
            val n = minOf(bulkOut.maxPacketSize.coerceAtLeast(64), dados.size - off)
            val bloco = dados.copyOfRange(off, off + n)
            val escrito = conexao.bulkTransfer(bulkOut, bloco, bloco.size, timeoutMs)
            if (escrito < 0) throw ErroToken("Falha ao enviar dados ao token (USB)")
            off += escrito
        }
        // Pacote final curto quando o tamanho é múltiplo exato do pacote.
        if (dados.isNotEmpty() && dados.size % bulkOut.maxPacketSize == 0) {
            conexao.bulkTransfer(bulkOut, ByteArray(0), 0, timeoutMs)
        }
    }

    override fun receber(): ByteArray {
        val buf = ByteArray(bulkIn.maxPacketSize.coerceAtLeast(64) * 4 + 16)
        val n = conexao.bulkTransfer(bulkIn, buf, buf.size, timeoutMs)
        if (n < 0) throw ErroToken("O token não respondeu (USB)")
        return buf.copyOf(n)
    }

    override fun close() {
        runCatching { conexao.releaseInterface(iface) }
        runCatching { conexao.close() }
    }

    companion object {
        private const val CLASSE_CCID = 0x0B

        /** Reconhece um leitor de smart card (CCID) entre os dispositivos USB. */
        fun ehLeitor(d: UsbDevice): Boolean {
            for (i in 0 until d.interfaceCount) {
                if (d.getInterface(i).interfaceClass == CLASSE_CCID) return true
            }
            // Alguns leitores declaram a classe no dispositivo, não na interface.
            return d.deviceClass == CLASSE_CCID
        }

        /**
         * Abre o leitor e devolve um [LeitorCcid] pronto (já ligado). Lança
         * [ErroToken] com uma mensagem clara se algo faltar.
         */
        fun abrir(manager: UsbManager, device: UsbDevice, log: io.github.harleygimenez.assinadorpje.core.token.LogApdu? = null): LeitorCcid {
            val iface = (0 until device.interfaceCount).map { device.getInterface(it) }
                .firstOrNull { it.interfaceClass == CLASSE_CCID }
                ?: (0 until device.interfaceCount).map { device.getInterface(it) }.firstOrNull { temBulk(it) }
                ?: throw ErroToken("Este dispositivo USB não parece um leitor de certificado")

            var inEp: UsbEndpoint? = null
            var outEp: UsbEndpoint? = null
            for (e in 0 until iface.endpointCount) {
                val ep = iface.getEndpoint(e)
                if (ep.type != UsbConstants.USB_ENDPOINT_XFER_BULK) continue
                if (ep.direction == UsbConstants.USB_DIR_IN) inEp = ep else outEp = ep
            }
            if (inEp == null || outEp == null) throw ErroToken("Leitor sem os canais de dados esperados")

            val conexao = manager.openDevice(device)
                ?: throw ErroToken("Não foi possível abrir o leitor (permissão USB negada?)")
            if (!conexao.claimInterface(iface, true)) {
                conexao.close()
                throw ErroToken("Outro app está usando o leitor de certificado")
            }

            val descritores = conexao.rawDescriptors
            log?.add(LeitorCcid.descreverDescritor(descritores))
            val nivel = LeitorCcid.nivelApdu(descritores)
            if (nivel == false) {
                log?.add("Aviso: o leitor não anuncia troca por APDU; pode não funcionar.")
            }

            val canal = UsbCcid(conexao, iface, inEp, outEp)
            val leitor = LeitorCcid(canal, log)
            leitor.ligar()
            return leitor
        }

        private fun temBulk(iface: UsbInterface): Boolean {
            for (e in 0 until iface.endpointCount) {
                if (iface.getEndpoint(e).type == UsbConstants.USB_ENDPOINT_XFER_BULK) return true
            }
            return false
        }
    }
}
