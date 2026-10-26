//! 安卓后台播放插件。
//! 前端调用 `plugin:media-session|update` 更新通知栏（标题、歌手、播放状态、进度），
//! 通知栏 / 耳机按键 / 锁屏控制通过 `action` 事件回传给前端。
//! 桌面端不需要它：WebView 自带的 Media Session 已经接入系统媒体控制。
use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("media-session")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin("com.shellplayer.media", "MediaSessionPlugin")?;
            Ok(())
        })
        .build()
}
