package io.github.harleygimenez.assinadorpje

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/** Interface montada em código, sem AndroidX nem XML de layout. */
object Ui {
    const val AZUL = 0xFF1E3A5F.toInt()
    const val CINZA = 0xFF5F6B7A.toInt()
    const val FUNDO_CARTAO = 0xFFF1F4F8.toInt()
    const val ALERTA = 0xFFB3261E.toInt()

    fun dp(ctx: Context, v: Int): Int = (v * ctx.resources.displayMetrics.density).toInt()

    fun coluna(ctx: Context, padding: Int = 16): LinearLayout = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        val p = dp(ctx, padding)
        setPadding(p, p, p, p)
    }

    fun cartao(ctx: Context): LinearLayout = coluna(ctx, 16).apply {
        background = GradientDrawable().apply {
            setColor(FUNDO_CARTAO)
            cornerRadius = dp(ctx, 12).toFloat()
        }
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dp(ctx, 12) }
    }

    fun titulo(ctx: Context, texto: String): TextView = TextView(ctx).apply {
        text = texto
        textSize = 18f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(AZUL)
        setPadding(0, 0, 0, dp(ctx, 6))
    }

    fun texto(ctx: Context, texto: String = "", cor: Int = Color.DKGRAY, tamanho: Float = 15f): TextView =
        TextView(ctx).apply {
            text = texto
            textSize = tamanho
            setTextColor(cor)
            setPadding(0, dp(ctx, 2), 0, dp(ctx, 2))
        }

    fun botao(ctx: Context, texto: String, aoClicar: (View) -> Unit): Button = Button(ctx).apply {
        text = texto
        isAllCaps = false
        setOnClickListener(aoClicar)
        layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(ctx, 4) }
    }
}
