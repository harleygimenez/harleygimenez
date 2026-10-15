package io.github.harleygimenez.assinadorpje

import android.app.Application
import android.content.Context
import io.github.harleygimenez.assinadorpje.core.Registro

class App : Application() {
    /** Histórico das requisições recebidas (navegador embutido e servidor local). */
    val registro = Registro()

    val certificados: Certificados by lazy { Certificados(this) }

    override fun onCreate() {
        super.onCreate()
        Notificacoes.criarCanais(this)
        // Completa a cadeia de certificados (AC-OAB, CAs, raiz): primeiro pelas
        // cadeias embutidas, depois pela rede (campo AIA).
        BuscadorCadeia.instalar(this)
    }
}

val Context.app: App get() = applicationContext as App

/** Preferências simples do app. */
object Preferencias {
    private const val ARQ = "app"
    private const val POST_NAVEGADOR = "modo_post_navegador"

    /** Chave A/B: SSO envia pela página (navegador) em vez do POST nativo. */
    fun postPeloNavegador(ctx: Context): Boolean =
        ctx.getSharedPreferences(ARQ, Context.MODE_PRIVATE).getBoolean(POST_NAVEGADOR, false)

    fun definirPostPeloNavegador(ctx: Context, ligado: Boolean) {
        ctx.getSharedPreferences(ARQ, Context.MODE_PRIVATE).edit().putBoolean(POST_NAVEGADOR, ligado).apply()
    }
}

/** `getSystemService` tipado; os serviços usados aqui sempre existem. */
inline fun <reified T : Any> Context.servico(): T = checkNotNull(getSystemService(T::class.java))
