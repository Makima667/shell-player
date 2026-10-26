use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_media_session::init())
        .setup(|app| {
            // 桌面歌词：透明、置顶、无边框的独立窗口，默认隐藏，由前端控制显示
            #[cfg(desktop)]
            {
                use tauri::{WebviewUrl, WebviewWindowBuilder};
                WebviewWindowBuilder::new(app, "lyrics", WebviewUrl::App("lyrics.html".into()))
                    .title("桌面歌词")
                    .inner_size(900.0, 140.0)
                    .min_inner_size(360.0, 90.0)
                    .decorations(false)
                    .transparent(true)
                    .shadow(false)
                    .always_on_top(true)
                    .skip_taskbar(true)
                    .resizable(true)
                    .visible(false)
                    .build()?;
            }
            #[cfg(mobile)]
            let _ = app;
            Ok(())
        })
        .on_window_event(|window, event| {
            // 关掉主窗口时整个应用退出（否则隐藏的歌词窗口会让进程留在后台）
            if window.label() == "main" {
                if let tauri::WindowEvent::Destroyed = event {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("启动失败");
}
