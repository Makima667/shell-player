package com.shellplayer.media

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Base64
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * 前台服务：保证切到后台、锁屏后进程不被回收，音乐继续播放；
 * 同时提供媒体通知（上一首 / 播放暂停 / 下一首）和系统媒体会话（耳机按键、锁屏、蓝牙、原子随身听这类系统卡片）。
 * 歌词按播放进度在这里计时，应用切到后台也能继续更新悬浮歌词和通知栏滚动歌词。
 */
class MediaPlaybackService : Service() {
    companion object {
        const val CHANNEL_ID = "shell_player_playback"
        const val NOTIFICATION_ID = 1107
        const val ACTION_UPDATE = "com.shellplayer.media.UPDATE"
        const val ACTION_STOP = "com.shellplayer.media.STOP"
        const val ACTION_TOGGLE = "com.shellplayer.media.TOGGLE"
        const val ACTION_NEXT = "com.shellplayer.media.NEXT"
        const val ACTION_PREV = "com.shellplayer.media.PREV"

        @Volatile var running = false
        @Volatile var instance: MediaPlaybackService? = null
        /** 封面地址（http 或 data:），不走 Intent，避免超出跨进程传输的大小限制 */
        @Volatile var coverUrl = ""
        var listener: ((String, Double?) -> Unit)? = null
    }

    private lateinit var session: MediaSessionCompat
    private var wakeLock: PowerManager.WakeLock? = null
    private var title = ""
    private var artist = ""
    private var album = ""
    private var playing = false
    private var position = 0.0
    private var duration = 0.0
    private var updatedAt = 0L
    private var cover: Bitmap? = null
    private var loadedCover = ""
    private var tickerText = ""
    private var lyricIdx = -2
    private val handler = Handler(Looper.getMainLooper())
    private var overlay: LyricOverlay? = null
    private val lyricTick = object : Runnable {
        override fun run() {
            syncLyric()
            if (playing) handler.postDelayed(this, 250)
        }
    }

    private fun emit(action: String, pos: Double? = null) {
        try { listener?.invoke(action, pos) } catch (_: Exception) { }
    }

    override fun onCreate() {
        super.onCreate()
        running = true
        instance = this
        createChannel()
        session = MediaSessionCompat(this, "ShellPlayer").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() = emit("play")
                override fun onPause() = emit("pause")
                override fun onStop() = emit("pause")
                override fun onSkipToNext() = emit("next")
                override fun onSkipToPrevious() = emit("prev")
                override fun onSeekTo(pos: Long) = emit("seek", pos / 1000.0)
            })
            isActive = true
        }
        handler.post { applyLyricConfig() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_UPDATE -> {
                title = intent.getStringExtra("title") ?: ""
                artist = intent.getStringExtra("artist") ?: ""
                album = intent.getStringExtra("album") ?: ""
                playing = intent.getBooleanExtra("playing", false)
                position = intent.getDoubleExtra("position", 0.0)
                duration = intent.getDoubleExtra("duration", 0.0)
                updatedAt = SystemClock.elapsedRealtime()
                loadCover()
                refresh()
                handler.removeCallbacks(lyricTick)
                handler.post(lyricTick)
            }
            ACTION_TOGGLE -> { emit(if (playing) "pause" else "play"); if (!running) refresh() }
            ACTION_NEXT -> emit("next")
            ACTION_PREV -> emit("prev")
            ACTION_STOP -> {
                ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            else -> refresh()
        }
        return START_NOT_STICKY
    }

    /* ---------- 封面：后台线程读取，读到后刷新媒体会话和通知 ---------- */
    private fun loadCover() {
        val url = coverUrl
        if (url == loadedCover) return
        loadedCover = url
        cover = null
        if (url.isEmpty()) return
        Thread {
            val bmp = try {
                val bytes = if (url.startsWith("data:")) Base64.decode(url.substringAfter(","), Base64.DEFAULT)
                else (java.net.URL(url).openConnection() as java.net.HttpURLConnection).run {
                    connectTimeout = 8000; readTimeout = 8000
                    setRequestProperty("User-Agent", "Mozilla/5.0")
                    inputStream.use { it.readBytes() }
                }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.let { scale(it) }
            } catch (_: Exception) { null }
            handler.post { if (loadedCover == url && bmp != null) { cover = bmp; refresh() } }
        }.start()
    }

    private fun scale(b: Bitmap): Bitmap {
        val max = 512
        if (b.width <= max && b.height <= max) return b
        val r = max.toFloat() / maxOf(b.width, b.height)
        return Bitmap.createScaledBitmap(b, (b.width * r).toInt(), (b.height * r).toInt(), true)
    }

    /* ---------- 歌词：悬浮歌词 + 通知栏滚动文字 ---------- */
    fun applyLyricConfig() {
        if (LyricState.overlayOn) {
            if (overlay == null) overlay = LyricOverlay(this)
            overlay?.show()
            overlay?.apply()
        } else overlay?.hide()
        lyricIdx = -2
        syncLyric()
    }

    fun lyricsChanged() { lyricIdx = -2; syncLyric() }

    private fun syncLyric() {
        val pos = position + if (playing) (SystemClock.elapsedRealtime() - updatedAt) / 1000.0 else 0.0
        val idx = LyricState.indexAt(pos)
        if (idx == lyricIdx) return
        lyricIdx = idx
        val l = LyricState.lines.getOrNull(idx)
        val text = l?.text?.ifEmpty { "♪" } ?: if (title.isEmpty()) "" else "$title - $artist"
        overlay?.setText(text, l?.sub ?: "")
        if (LyricState.ticker && l != null && text != tickerText) {
            tickerText = text
            try {
                val n = buildNotification(text)
                // 魅族等系统读取这两个标记，在状态栏显示滚动文字
                n.flags = n.flags or 0x1000000 or 0x2000000
                (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION_ID, n)
            } catch (_: Exception) { }
        }
    }

    private fun refresh() {
        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, artist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, (duration * 1000).toLong())
                .apply {
                    cover?.let {
                        putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it)
                        putBitmap(MediaMetadataCompat.METADATA_KEY_ART, it)
                        putBitmap(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON, it)
                    }
                }
                .build()
        )
        session.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or
                        PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or PlaybackStateCompat.ACTION_SEEK_TO
                )
                .setState(
                    if (playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                    (position * 1000).toLong(),
                    if (playing) 1f else 0f
                )
                .build()
        )

        val notification = buildNotification()
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
        updateWakeLock()
    }

    private fun pending(action: String, code: Int): PendingIntent =
        PendingIntent.getService(
            this, code,
            Intent(this, MediaPlaybackService::class.java).setAction(action),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

    private fun buildNotification(ticker: String? = null) = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_media_play)
        .setLargeIcon(cover)
        .setTicker(ticker)
        .setContentTitle(title.ifEmpty { "空壳播放器" })
        .setContentText(artist)
        .setSubText(album)
        .setContentIntent(
            packageManager.getLaunchIntentForPackage(packageName)?.let {
                it.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            }
        )
        .setDeleteIntent(pending(ACTION_STOP, 5))
        .addAction(android.R.drawable.ic_media_previous, "上一首", pending(ACTION_PREV, 1))
        .addAction(
            if (playing) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
            if (playing) "暂停" else "播放",
            pending(ACTION_TOGGLE, 2)
        )
        .addAction(android.R.drawable.ic_media_next, "下一首", pending(ACTION_NEXT, 3))
        .setStyle(
            androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(session.sessionToken)
                .setShowActionsInCompactView(0, 1, 2)
        )
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOnlyAlertOnce(true)
        .setOngoing(playing)
        .setSilent(true)
        .build()

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "正在播放", NotificationManager.IMPORTANCE_LOW).apply {
                description = "显示正在播放的歌曲和播放控制"
                setShowBadge(false)
            }
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
    }

    private fun updateWakeLock() {
        if (playing) {
            if (wakeLock == null) {
                wakeLock = (getSystemService(Context.POWER_SERVICE) as PowerManager)
                    .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ShellPlayer:playback").apply { setReferenceCounted(false) }
            }
            wakeLock?.acquire(6 * 60 * 60 * 1000L)
        } else {
            wakeLock?.let { if (it.isHeld) it.release() }
        }
    }

    override fun onDestroy() {
        running = false
        instance = null
        handler.removeCallbacks(lyricTick)
        overlay?.hide()
        wakeLock?.let { if (it.isHeld) it.release() }
        session.isActive = false
        session.release()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
