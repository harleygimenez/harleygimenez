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

/** `getSystemService` tipado; os serviços usados aqui sempre existem. */
inline fun <reified T : Any> Context.servico(): T = checkNotNull(getSystemService(T::class.java))
