package com.shellplayer.media

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.provider.Settings
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray

/** 歌词数据和显示设置，由插件写入，播放服务读取 */
object LyricState {
    class Line(val t: Double, val text: String, val sub: String)

    @Volatile var lines: List<Line> = emptyList()
    @Volatile var overlayOn = false
    @Volatile var locked = false
    @Volatile var ticker = true
    @Volatile var size = 17f
    @Volatile var color = 0xFF8AB4FF.toInt()

    fun parse(json: String): List<Line> = try {
        val a = JSONArray(json)
        (0 until a.length()).map {
            val o = a.getJSONObject(it)
            Line(o.optDouble("t", -1.0), o.optString("text", ""), o.optString("sub", ""))
        }.filter { it.t >= 0 }
    } catch (_: Exception) { emptyList() }

    /** 当前时间对应的行号，没有时返回 -1 */
    fun indexAt(pos: Double): Int {
        val ls = lines
        var lo = 0
        var hi = ls.size - 1
        var idx = -1
        while (lo <= hi) {
            val mid = (lo + hi) ushr 1
            if (ls[mid].t <= pos + 0.15) { idx = mid; lo = mid + 1 } else hi = mid - 1
        }
        return idx
    }
}

/**
 * 悬浮歌词：贴在状态栏下方的一行歌词，所有安卓手机通用。
 * 系统不允许普通应用画进状态栏本身，所以默认放在状态栏下面；没锁定时可以上下拖动，锁定后触摸会穿透。
 */
class LyricOverlay(private val ctx: Context) {
    private val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val prefs = ctx.getSharedPreferences("shell_player_overlay", Context.MODE_PRIVATE)
    private var root: LinearLayout? = null
    private var line: TextView? = null
    private var sub: TextView? = null
    private var params: WindowManager.LayoutParams? = null

    val showing get() = root != null

    fun canShow() = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx)

    private fun statusBarHeight(): Int {
        val id = ctx.resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (id > 0) ctx.resources.getDimensionPixelSize(id) else 0
    }

    private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.resources.displayMetrics)

    private fun text(size: Float) = TextView(ctx).apply {
        setSingleLine(true)
        ellipsize = TextUtils.TruncateAt.END
        gravity = Gravity.CENTER
        setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
        setShadowLayer(dp(2f), 0f, dp(0.5f), 0xCC000000.toInt())
    }

    @SuppressLint("ClickableViewAccessibility")
    fun show() {
        if (root != null || !canShow()) return
        val l = text(LyricState.size).apply { paint.isFakeBoldText = true }
        val s = text(LyricState.size * 0.7f).apply { visibility = View.GONE }
        val box = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = dp(8f).toInt()
            setPadding(pad * 2, pad / 2, pad * 2, pad / 2)
            addView(l)
            addView(s)
        }
        @Suppress("DEPRECATION")
        val type = if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else WindowManager.LayoutParams.TYPE_PHONE
        val p = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = prefs.getInt("y", statusBarHeight())
        }
        // 没锁定时上下拖动，松手记住位置
        var downY = 0f
        var startY = 0
        box.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { downY = e.rawY; startY = p.y }
                MotionEvent.ACTION_MOVE -> {
                    p.y = (startY + (e.rawY - downY)).toInt().coerceAtLeast(0)
                    try { wm.updateViewLayout(box, p) } catch (_: Exception) { }
                }
                MotionEvent.ACTION_UP -> prefs.edit().putInt("y", p.y).apply()
            }
            true
        }
        try {
            wm.addView(box, p)
            root = box; line = l; sub = s; params = p
            apply()
        } catch (_: Exception) { }
    }

    fun hide() {
        root?.let { try { wm.removeView(it) } catch (_: Exception) { } }
        root = null; line = null; sub = null; params = null
    }

    /** 应用字号、颜色和锁定状态 */
    fun apply() {
        val box = root ?: return
        val p = params ?: return
        line?.setTextColor(LyricState.color)
        line?.setTextSize(TypedValue.COMPLEX_UNIT_SP, LyricState.size)
        sub?.setTextColor(0xF0FFFFFF.toInt())
        sub?.setTextSize(TypedValue.COMPLEX_UNIT_SP, LyricState.size * 0.7f)
        box.background = if (LyricState.locked) null else GradientDrawable().apply {
            cornerRadius = dp(12f)
            setColor(0x33000000)
        }
        p.flags = if (LyricState.locked) p.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        else p.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
        try { wm.updateViewLayout(box, p) } catch (_: Exception) { }
    }

    fun setText(text: String, subText: String) {
        line?.text = text
        sub?.text = subText
        sub?.visibility = if (subText.isEmpty()) View.GONE else View.VISIBLE
    }
}
