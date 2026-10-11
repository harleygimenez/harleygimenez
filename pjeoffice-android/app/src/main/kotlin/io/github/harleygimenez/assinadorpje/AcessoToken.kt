package io.github.harleygimenez.assinadorpje

import android.content.Context
import android.hardware.usb.UsbManager
import io.github.harleygimenez.assinadorpje.core.Assinante
import io.github.harleygimenez.assinadorpje.core.token.AssinanteStarSign
import io.github.harleygimenez.assinadorpje.core.token.ErroToken
import io.github.harleygimenez.assinadorpje.core.token.LogApdu
import io.github.harleygimenez.assinadorpje.core.token.StarSign

/**
 * Abre o token A3 (StarSign) sob demanda e devolve um [Assinante] com a sessão
 * USB viva. O chamador deve fechar o assinante ao terminar (o [core] faz isso
 * no `finally` do processador) — isso encerra a sessão USB.
 *
 * O PIN é verificado aqui, uma vez por operação, depois de ler o contador de
 * tentativas para não bloquear o token à toa.
 */
object AcessoToken {

    /** `true` se há um leitor USB conectado e com permissão concedida. */
    fun pronto(ctx: Context): Boolean {
        val manager = ctx.servico<UsbManager>()
        val d = manager.deviceList.values.firstOrNull { UsbCcid.ehLeitor(it) } ?: return false
        return manager.hasPermission(d)
    }

    /**
     * Abre o token, verifica o [pin] e lê a cadeia. Bloqueante — chame fora da
     * thread principal. Lança [ErroToken] com mensagem clara em qualquer falha.
     */
    fun abrir(ctx: Context, pin: CharArray, log: LogApdu? = null): Assinante {
        val manager = ctx.servico<UsbManager>()
        val device = manager.deviceList.values.firstOrNull { UsbCcid.ehLeitor(it) }
            ?: manager.deviceList.values.firstOrNull()
            ?: throw ErroToken("Token não encontrado. Conecte-o pelo cabo OTG.")
        if (!manager.hasPermission(device)) {
            throw ErroToken("Sem permissão de USB para o token. Abra o Diagnóstico do token e conceda o acesso, depois tente de novo.")
        }
        val leitor = UsbCcid.abrir(manager, device, log)
        val token = StarSign(leitor, log)
        try {
            token.abrir()
            val tentativas = token.tentativasRestantes()
            if (tentativas == 0) throw ErroToken("PIN do token bloqueado.")
            if (tentativas in 1..2) throw ErroToken("Poucas tentativas de PIN restantes ($tentativas). Operação abortada por segurança.")
            token.verificarPin(pin)
            val cadeia = token.lerCadeia()
            if (cadeia.isEmpty()) throw ErroToken("Não foi possível ler o certificado do token.")
            return AssinanteStarSign(token, cadeia)
        } catch (e: Throwable) {
            runCatching { leitor.close() }
            throw e
        }
    }
}
