package com.shellplayer.media

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * 前台服务：保证切到后台、锁屏后进程不被回收，音乐继续播放；
 * 同时提供媒体通知（上一首 / 播放暂停 / 下一首）和系统媒体会话（耳机按键、锁屏、蓝牙）。
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

    private fun emit(action: String, pos: Double? = null) {
        try { listener?.invoke(action, pos) } catch (_: Exception) { }
    }

    override fun onCreate() {
        super.onCreate()
        running = true
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
                refresh()
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

    private fun refresh() {
        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, (duration * 1000).toLong())
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

    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_media_play)
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
        wakeLock?.let { if (it.isHeld) it.release() }
        session.isActive = false
        session.release()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
