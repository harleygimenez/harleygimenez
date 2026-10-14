package io.github.harleygimenez.assinadorpje

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.Menu
import android.view.MenuItem
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Toast
import io.github.harleygimenez.assinadorpje.core.Processador
import io.github.harleygimenez.assinadorpje.core.RespostaPje
import io.github.harleygimenez.assinadorpje.core.ServidorLocal
import java.io.ByteArrayInputStream

/**
 * Navegador do PJe com o assinador embutido: as chamadas da página para
 * `http://127.0.0.1:8800/pjeOffice/...` são atendidas aqui mesmo
 * (`shouldInterceptRequest`), sem servidor local e sem depender do Chrome.
 */
class PjeWebActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var processador: Processador

    /** URL da página principal, usada como origem quando a chamada não traz `Origin`. */
    @Volatile
    private var paginaAtual: String? = null

    private var callbackArquivos: ValueCallback<Array<Uri>>? = null
    private var modoComputador = false
    private var agentePadrao: String = ""

    /** Pedido de geolocalização da página aguardando a permissão do Android. */
    private var origemLocalizacao: String? = null
    private var callbackLocalizacao: GeolocationPermissions.Callback? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        processador = Processador(
            confirmador = ConfirmadorNaTela(this),
            registro = app.registro,
            cookiesPara = { servidor -> CookieManager.getInstance().getCookie(servidor) },
        )

        // Esconde a barra de cima (ActionBar): ela tampava o painel do tribunal.
        // Os controles vão para uma barra fininha embaixo (ver construirBarraInferior).
        actionBar?.hide()

        web = WebView(this)
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false) // window.open abre na mesma tela
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            builtInZoomControls = true
            displayZoomControls = false
            useWideViewPort = true
            loadWithOverviewMode = true
            agentePadrao = userAgentString
        }
        web.webViewClient = Cliente()
        web.webChromeClient = object : WebChromeClient() {
            override fun onReceivedTitle(view: WebView, title: String?) {
                this@PjeWebActivity.title = title ?: "PJe"
            }

            // A página do PJe pede a localização (navigator.geolocation), como no
            // PJeOffice do Windows. Se já temos a permissão, liberamos na hora;
            // senão, pedimos ao Android e respondemos em onRequestPermissionsResult.
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                if (temPermissaoLocalizacao()) {
                    callback.invoke(origin, true, false)
                    return
                }
                origemLocalizacao = origin
                callbackLocalizacao = callback
                requestPermissions(
                    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                    PEDIDO_LOCALIZACAO,
                )
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams,
            ): Boolean {
                callbackArquivos?.onReceiveValue(null)
                callbackArquivos = filePathCallback
                val intent = fileChooserParams.createIntent().apply {
                    if (fileChooserParams.mode == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    }
                }
                return try {
                    startActivityForResult(intent, PEDIDO_ARQUIVO)
                    true
                } catch (e: Exception) {
                    callbackArquivos = null
                    false
                }
            }
        }
        web.setDownloadListener { url, userAgent, contentDisposition, mimetype, _ ->
            baixar(url, userAgent, contentDisposition, mimetype)
        }

        // WebView ocupa todo o topo; a barra de controles fica embaixo.
        val raiz = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        raiz.addView(web, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        raiz.addView(construirBarraInferior())
        setContentView(raiz)

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
        } else {
            web.loadUrl(intent.getStringExtra(EXTRA_URL) ?: Tribunais.lista.first().second)
        }
    }

    /** Barra fininha embaixo com os controles (substitui a ActionBar de cima). */
    private fun construirBarraInferior(): LinearLayout {
        val barra = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Ui.AZUL)
        }
        fun item(rotulo: String, aoClicar: () -> Unit) {
            barra.addView(Button(this).apply {
                text = rotulo
                isAllCaps = false
                textSize = 12f
                setTextColor(Color.WHITE)
                setBackgroundColor(Color.TRANSPARENT)
                val pv = Ui.dp(this@PjeWebActivity, 6)
                setPadding(0, pv, 0, pv)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                setOnClickListener { aoClicar() }
            })
        }
        item("◀ Voltar") { if (web.canGoBack()) web.goBack() else finish() }
        item("⟳ Recarregar") { web.reload() }
        item("🖥 PC") { alternarComputador() }
        item("⌂ Início") { finish() }
        return barra
    }

    private fun alternarComputador() {
        modoComputador = !modoComputador
        web.settings.userAgentString = if (modoComputador) {
            agentePadrao.replace(Regex("\\(Linux; Android[^)]*\\)"), "(X11; Linux x86_64)").replace(" Mobile", "")
        } else {
            agentePadrao
        }
        Toast.makeText(this, if (modoComputador) "Versão para computador" else "Versão para celular", Toast.LENGTH_SHORT).show()
        web.reload()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        callbackArquivos?.onReceiveValue(null)
        web.destroy()
        super.onDestroy()
    }

    @Deprecated("API antiga, suficiente aqui")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, MENU_RECARREGAR, 0, "Recarregar")
        menu.add(0, MENU_COMPUTADOR, 1, "Versão para computador").isCheckable = true
        menu.add(0, MENU_INICIO, 2, "Assinador (início)")
        return true
    }

    override fun onPrepareOptionsMenu(menu: Menu): Boolean {
        menu.findItem(MENU_COMPUTADOR)?.isChecked = modoComputador
        return super.onPrepareOptionsMenu(menu)
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            MENU_RECARREGAR -> web.reload()
            MENU_COMPUTADOR -> alternarComputador()
            MENU_INICIO -> finish()
            else -> return super.onOptionsItemSelected(item)
        }
        return true
    }

    @Deprecated("API antiga, suficiente aqui")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != PEDIDO_ARQUIVO) {
            super.onActivityResult(requestCode, resultCode, data)
            return
        }
        val clip = data?.clipData
        val resultado: Array<Uri>? = when {
            resultCode != RESULT_OK -> null
            clip != null -> Array(clip.itemCount) { clip.getItemAt(it).uri }
            else -> WebChromeClient.FileChooserParams.parseResult(resultCode, data)
        }
        callbackArquivos?.onReceiveValue(resultado)
        callbackArquivos = null
    }

    private fun temPermissaoLocalizacao(): Boolean =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode == PEDIDO_LOCALIZACAO) {
            val concedida = grantResults.any { it == PackageManager.PERMISSION_GRANTED }
            callbackLocalizacao?.invoke(origemLocalizacao, concedida, false)
            origemLocalizacao = null
            callbackLocalizacao = null
            return
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    }

    private fun baixar(url: String, userAgent: String, contentDisposition: String?, mimetype: String?) {
        if (!url.startsWith("http")) {
            Toast.makeText(this, "Este tipo de download não é suportado no navegador embutido", Toast.LENGTH_LONG).show()
            return
        }
        if (Build.VERSION.SDK_INT < 29 &&
            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), 0)
            Toast.makeText(this, "Permita o acesso aos arquivos e toque em baixar de novo", Toast.LENGTH_LONG).show()
            return
        }
        val nome = URLUtil.guessFileName(url, contentDisposition, mimetype)
        val pedido = DownloadManager.Request(Uri.parse(url))
            .setMimeType(mimetype)
            .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url).orEmpty())
            .addRequestHeader("User-Agent", userAgent)
            .setTitle(nome)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, nome)
        servico<DownloadManager>().enqueue(pedido)
        Toast.makeText(this, "Baixando $nome", Toast.LENGTH_SHORT).show()
    }

    private inner class Cliente : WebViewClient() {
        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            paginaAtual = url
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            paginaAtual = url
        }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val esquema = request.url.scheme?.lowercase()
            if (esquema == "http" || esquema == "https") return false
            // mailto:, tel:, intent: etc. vão para outros apps.
            return try {
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
                true
            } catch (e: Exception) {
                true
            }
        }

        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            val url = request.url
            if (!ehPjeOffice(url)) return null
            val origin = request.requestHeaders.entries.firstOrNull { it.key.equals("Origin", true) }?.value
                ?.takeIf { it != "null" }
            if (request.method.equals("OPTIONS", ignoreCase = true)) return resposta(204, null, origin)
            val post = request.method.equals("POST", ignoreCase = true)
            val corpo = when ((url.path ?: "").trimEnd('/').lowercase()) {
                "/pjeoffice", "/pjeoffice/logout" -> RespostaPje.de(true, post)
                "/pjeoffice/versao" -> RespostaPje.VERSAO
                "/pjeoffice/requisicao" -> {
                    val r = ServidorLocal.parametros(url.encodedQuery.orEmpty())["r"]
                    val ok = r != null && processador.processar(r, origin ?: paginaAtual).sucesso
                    RespostaPje.de(ok, post)
                }
                else -> null
            }
            return if (corpo == null) resposta(404, null, origin) else resposta(200, corpo, origin)
        }
    }

    private fun ehPjeOffice(u: Uri): Boolean {
        val host = u.host?.lowercase()
        return (host == "127.0.0.1" || host == "localhost") &&
            (u.port == 8800 || u.port == 8801) &&
            (u.path ?: "").lowercase().startsWith("/pjeoffice")
    }

    private fun resposta(status: Int, corpo: RespostaPje.Corpo?, origin: String?): WebResourceResponse {
        val cabecalhos = mutableMapOf(
            "Access-Control-Allow-Origin" to (origin ?: "*"),
            "Access-Control-Allow-Private-Network" to "true",
            "Access-Control-Allow-Methods" to "GET, OPTIONS, POST",
            "Access-Control-Allow-Headers" to "Origin, X-Requested-With, Content-Type, Accept, Authorization",
            "Cache-Control" to "no-store",
        )
        if (origin != null) cabecalhos["Access-Control-Allow-Credentials"] = "true"
        val motivo = when (status) { 200 -> "OK"; 204 -> "No Content"; else -> "Not Found" }
        return WebResourceResponse(
            corpo?.tipo ?: "text/plain", "UTF-8", status, motivo, cabecalhos,
            ByteArrayInputStream(corpo?.bytes ?: ByteArray(0)),
        )
    }

    companion object {
        const val EXTRA_URL = "url"
        private const val PEDIDO_ARQUIVO = 10
        private const val PEDIDO_LOCALIZACAO = 11
        private const val MENU_RECARREGAR = 1
        private const val MENU_COMPUTADOR = 2
        private const val MENU_INICIO = 3
    }
}
