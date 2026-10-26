package com.shellplayer.media

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class UpdateArgs {
    var title: String = ""
    var artist: String = ""
    var album: String = ""
    var playing: Boolean = false
    var position: Double = 0.0
    var duration: Double = 0.0
}

@TauriPlugin
class MediaSessionPlugin(private val activity: Activity) : Plugin(activity) {
    private var askedNotification = false

    override fun load(webView: WebView) {
        // 通知栏、耳机按键、锁屏上的操作转发给前端
        MediaPlaybackService.listener = { action, position ->
            val payload = JSObject()
            payload.put("action", action)
            if (position != null) payload.put("position", position)
            trigger("action", payload)
        }
    }

    @Command
    fun update(invoke: Invoke) {
        val args = invoke.parseArgs(UpdateArgs::class.java)
        askNotificationPermission()
        val intent = Intent(activity, MediaPlaybackService::class.java).apply {
            action = MediaPlaybackService.ACTION_UPDATE
            putExtra("title", args.title)
            putExtra("artist", args.artist)
            putExtra("album", args.album)
            putExtra("playing", args.playing)
            putExtra("position", args.position)
            putExtra("duration", args.duration)
        }
        try {
            if (MediaPlaybackService.running) activity.startService(intent)
            else ContextCompat.startForegroundService(activity, intent)
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("无法启动后台播放服务：" + e.message)
        }
    }

    @Command
    fun stop(invoke: Invoke) {
        if (MediaPlaybackService.running) {
            val intent = Intent(activity, MediaPlaybackService::class.java).apply { action = MediaPlaybackService.ACTION_STOP }
            try { activity.startService(intent) } catch (_: Exception) { }
        }
        invoke.resolve()
    }

    private fun askNotificationPermission() {
        if (askedNotification || Build.VERSION.SDK_INT < 33) return
        askedNotification = true
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1107)
        }
    }
}
