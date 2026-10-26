use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

// 关闭主窗口时是否只隐藏到托盘（由前端设置）
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

#[tauri::command]
fn set_close_to_tray(on: bool) {
    CLOSE_TO_TRAY.store(on, Ordering::Relaxed);
}

// 托盘提示文字显示当前歌曲
#[tauri::command]
fn set_tray_tooltip(app: tauri::AppHandle, text: String) {
    #[cfg(desktop)]
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(text));
    }
    #[cfg(mobile)]
    let _ = (app, text);
}

#[cfg(desktop)]
fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // 单实例：再次打开时把已有窗口叫到前台
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
            .plugin(
                tauri_plugin_window_state::Builder::default()
                    .with_state_flags(
                        tauri_plugin_window_state::StateFlags::all()
                            - tauri_plugin_window_state::StateFlags::VISIBLE,
                    )
                    .build(),
            );
    }

    builder
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_media_session::init())
        .invoke_handler(tauri::generate_handler![set_close_to_tray, set_tray_tooltip])
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                use tauri::{WebviewUrl, WebviewWindowBuilder};

                // 桌面歌词：透明、置顶、无边框的独立窗口，默认隐藏，由前端控制显示
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

                // 托盘：左键显示窗口，右键菜单控制播放
                let item = |id: &str, text: &str| MenuItem::with_id(app, id, text, true, None::<&str>);
                let menu = Menu::with_items(
                    app,
                    &[
                        &item("show", "显示主窗口")?,
                        &PredefinedMenuItem::separator(app)?,
                        &item("toggle", "播放 / 暂停")?,
                        &item("prev", "上一首")?,
                        &item("next", "下一首")?,
                        &item("dlyric", "桌面歌词")?,
                        &PredefinedMenuItem::separator(app)?,
                        &item("quit", "退出")?,
                    ],
                )?;
                let mut tray = TrayIconBuilder::with_id("main")
                    .tooltip("空壳播放器")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, e| match e.id.as_ref() {
                        "show" => show_main(app),
                        "quit" => app.exit(0),
                        other => {
                            let _ = app.emit_to("main", "tray", other.to_string());
                        }
                    })
                    .on_tray_icon_event(|tray, e| {
                        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                            show_main(tray.app_handle());
                        }
                    });
                if let Some(icon) = app.default_window_icon() {
                    tray = tray.icon(icon.clone());
                }
                tray.build(app)?;
            }
            #[cfg(mobile)]
            let _ = app;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                // 开着"关闭到托盘"时，点关闭只隐藏窗口，音乐继续播放
                tauri::WindowEvent::CloseRequested { api, .. } if cfg!(desktop) && CLOSE_TO_TRAY.load(Ordering::Relaxed) => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                // 真正关掉主窗口时整个应用退出（否则隐藏的歌词窗口会让进程留在后台）
                tauri::WindowEvent::Destroyed => window.app_handle().exit(0),
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("启动失败")
        .run(|_app, _event| {
            // macOS 点 Dock 图标时重新显示窗口
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                show_main(_app);
            }
        });
}
