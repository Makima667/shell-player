package com.shellplayer.media

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.MediaStore
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
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

@InvokeArg
class ScanArgs {
    var minDuration: Double = 30.0
}

@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.READ_MEDIA_AUDIO], alias = "audio"),
        Permission(strings = [Manifest.permission.READ_EXTERNAL_STORAGE], alias = "storage")
    ]
)
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

    /* ---------- 本地音乐：读取系统媒体库 ---------- */
    private val audioAlias get() = if (Build.VERSION.SDK_INT >= 33) "audio" else "storage"

    @Command
    fun scan(invoke: Invoke) {
        if (getPermissionState(audioAlias) != PermissionState.GRANTED) {
            requestPermissionForAlias(audioAlias, invoke, "scanPermissionCallback")
            return
        }
        doScan(invoke)
    }

    @PermissionCallback
    private fun scanPermissionCallback(invoke: Invoke) {
        if (getPermissionState(audioAlias) == PermissionState.GRANTED) doScan(invoke)
        else invoke.reject("没有获得读取音乐的权限，可以在系统设置里给空壳播放器打开「音乐和音频」权限")
    }

    private fun doScan(invoke: Invoke) {
        val args = invoke.parseArgs(ScanArgs::class.java)
        Thread {
            try {
                val list = JSArray()
                val proj = arrayOf(
                    MediaStore.Audio.Media.TITLE,
                    MediaStore.Audio.Media.ARTIST,
                    MediaStore.Audio.Media.ALBUM,
                    MediaStore.Audio.Media.DURATION,
                    MediaStore.Audio.Media.DATA
                )
                val sel = "${MediaStore.Audio.Media.IS_MUSIC} != 0 AND ${MediaStore.Audio.Media.DURATION} >= ?"
                val minMs = (args.minDuration * 1000).toLong().toString()
                activity.contentResolver.query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, proj, sel, arrayOf(minMs), null)?.use { c ->
                    while (c.moveToNext()) {
                        val path = c.getString(4) ?: continue
                        val artist = c.getString(1)
                        val o = JSObject()
                        o.put("path", path)
                        o.put("title", c.getString(0) ?: path.substringAfterLast('/').substringBeforeLast('.'))
                        o.put("artist", if (artist == null || artist == "<unknown>") "" else artist)
                        o.put("album", c.getString(2) ?: "")
                        o.put("duration", c.getLong(3) / 1000.0)
                        list.put(o)
                    }
                }
                val ret = JSObject()
                ret.put("tracks", list)
                invoke.resolve(ret)
            } catch (e: Exception) {
                invoke.reject("读取媒体库失败：" + e.message)
            }
        }.start()
    }
}
