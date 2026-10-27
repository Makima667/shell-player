//! 本地音乐：桌面扫描用户添加的文件夹，安卓由媒体插件从系统媒体库读取歌曲列表。
//! 这里负责读取标签、封面和歌词，并把歌曲所在位置加入 asset 协议的允许范围，前端才能播放。
//! 前端里也运行着第三方音源脚本，所以只允许读取音乐文件夹里的音频和同名歌词，不接受任意路径。
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime, State};

use lofty::config::ParseOptions;
use lofty::prelude::*;
use lofty::probe::Probe;

const AUDIO_EXT: &[&str] = &["mp3", "flac", "m4a", "aac", "ogg", "opus", "wav", "ape", "wma", "aiff", "aif"];

#[derive(Serialize)]
pub struct LocalTrack {
    path: String,
    title: String,
    artist: String,
    album: String,
    duration: f64,
}

/// 桌面端的音乐文件夹（保存在应用配置目录，默认是系统的「音乐」文件夹）
pub struct Folders(Mutex<Vec<PathBuf>>);

fn is_audio(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXT.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn folders_file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("music-folders.json"))
}

fn save_folders<R: Runtime>(app: &AppHandle<R>, list: &[PathBuf]) {
    if let Some(f) = folders_file(app) {
        if let Some(dir) = f.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(f, serde_json::to_string(list).unwrap_or_default());
    }
}

pub fn init<R: Runtime>(app: &AppHandle<R>) {
    let mut list: Vec<PathBuf> = Vec::new();
    if cfg!(desktop) {
        match folders_file(app).and_then(|f| std::fs::read_to_string(f).ok()) {
            Some(text) => list = serde_json::from_str(&text).unwrap_or_default(),
            None => {
                if let Ok(d) = app.path().audio_dir() {
                    list.push(d);
                }
            }
        }
        for d in &list {
            let _ = app.asset_protocol_scope().allow_directory(d, true);
        }
    }
    app.manage(Folders(Mutex::new(list)));
}

/// 路径是否可以读取：桌面要在音乐文件夹里，安卓要在共享存储里，并且都必须是音频文件
fn permitted(folders: &Folders, p: &Path) -> bool {
    if !is_audio(p) || p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return false;
    }
    if cfg!(target_os = "android") {
        return p.starts_with("/storage/");
    }
    let real = match p.canonicalize() {
        Ok(r) => r,
        Err(_) => return false,
    };
    folders.0.lock().unwrap().iter().any(|d| d.canonicalize().map(|d| real.starts_with(d)).unwrap_or(false))
}

fn read_track(p: &Path, min_duration: f64) -> Option<LocalTrack> {
    let stem = p.file_stem()?.to_string_lossy().to_string();
    // 没有标签时按「歌手 - 歌名」拆文件名
    let (mut artist, mut title) = match stem.split_once(" - ") {
        Some((a, t)) => (a.trim().to_string(), t.trim().to_string()),
        None => (String::new(), stem.clone()),
    };
    let mut album = String::new();
    let mut duration = 0.0;
    let opts = ParseOptions::new().read_cover_art(false);
    if let Ok(f) = Probe::open(p).and_then(|x| x.options(opts).read()) {
        duration = f.properties().duration().as_secs_f64();
        if let Some(tag) = f.primary_tag().or_else(|| f.first_tag()) {
            if let Some(t) = tag.title().filter(|t| !t.trim().is_empty()) {
                title = t.trim().to_string();
            }
            if let Some(a) = tag.artist().filter(|a| !a.trim().is_empty()) {
                artist = a.trim().to_string();
            }
            if let Some(a) = tag.album() {
                album = a.trim().to_string();
            }
        }
    }
    if duration > 0.0 && duration < min_duration {
        return None;
    }
    Some(LocalTrack { path: p.to_string_lossy().to_string(), title, artist, album, duration })
}

#[tauri::command]
pub fn music_folders(folders: State<'_, Folders>) -> Vec<String> {
    folders.0.lock().unwrap().iter().map(|p| p.to_string_lossy().to_string()).collect()
}

/// 弹出系统的选择文件夹窗口，把选中的文件夹加入音乐文件夹
#[tauri::command]
pub async fn add_music_folder<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_dialog::DialogExt;
        let picked = app.dialog().file().set_title("选择音乐文件夹").blocking_pick_folder();
        let Some(dir) = picked.and_then(|p| p.into_path().ok()) else { return Ok(None) };
        let folders = app.state::<Folders>();
        let mut list = folders.0.lock().unwrap();
        if !list.contains(&dir) {
            list.push(dir.clone());
            save_folders(&app, &list);
        }
        let _ = app.asset_protocol_scope().allow_directory(&dir, true);
        Ok(Some(dir.to_string_lossy().to_string()))
    }
    #[cfg(mobile)]
    {
        let _ = app;
        Err("手机上会自动读取系统媒体库，不需要选择文件夹".into())
    }
}

#[tauri::command]
pub fn remove_music_folder<R: Runtime>(app: AppHandle<R>, folders: State<'_, Folders>, path: String) {
    let mut list = folders.0.lock().unwrap();
    list.retain(|p| p != Path::new(&path));
    save_folders(&app, &list);
}

/// 扫描所有音乐文件夹（桌面）。短于 min_duration 秒的文件（提示音、录音）会被跳过
#[tauri::command]
pub async fn scan_music(folders: State<'_, Folders>, min_duration: f64) -> Result<Vec<LocalTrack>, String> {
    let dirs = folders.0.lock().unwrap().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for d in dirs {
            for e in walkdir::WalkDir::new(&d).follow_links(true).into_iter().filter_map(|e| e.ok()) {
                let p = e.path();
                if e.file_type().is_file() && is_audio(p) && seen.insert(p.to_path_buf()) {
                    if let Some(t) = read_track(p, min_duration) {
                        out.push(t);
                    }
                }
            }
        }
        out
    })
    .await
    .map_err(|e| e.to_string())
}

/// 安卓：系统媒体库给出的歌曲路径，加入允许播放的范围
#[tauri::command]
pub fn allow_media<R: Runtime>(app: AppHandle<R>, folders: State<'_, Folders>, paths: Vec<String>) {
    for p in paths {
        let p = PathBuf::from(p);
        if cfg!(target_os = "android") && permitted(&folders, &p) {
            let _ = app.asset_protocol_scope().allow_file(&p);
        }
    }
}

/// 读取内嵌封面，返回 data URL
#[tauri::command]
pub async fn local_cover(folders: State<'_, Folders>, path: String) -> Result<Option<String>, String> {
    use base64::Engine;
    let p = PathBuf::from(&path);
    if !permitted(&folders, &p) {
        return Ok(None);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let f = lofty::read_from_path(&p).ok()?;
        let tag = f.primary_tag().or_else(|| f.first_tag())?;
        let pic = tag.pictures().first()?;
        let mime = pic.mime_type().map(|m| m.as_str().to_string()).unwrap_or_else(|| "image/jpeg".into());
        Some(format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(pic.data())))
    })
    .await
    .map_err(|e| e.to_string())
}

/// 歌词：优先同名 .lrc 文件，其次是标签里内嵌的歌词
#[tauri::command]
pub async fn local_lyric(folders: State<'_, Folders>, path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !permitted(&folders, &p) {
        return Ok(String::new());
    }
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(bytes) = std::fs::read(p.with_extension("lrc")) {
            return String::from_utf8_lossy(&bytes).to_string();
        }
        lofty::read_from_path(&p)
            .ok()
            .and_then(|f| {
                let tag = f.primary_tag().or_else(|| f.first_tag())?;
                tag.get_string(&ItemKey::Lyrics).map(|s| s.to_string())
            })
            .unwrap_or_default()
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    // 1 秒的静音 WAV：没有标签，按文件名拆出歌手和歌名
    fn silent_wav(path: &Path) {
        let (rate, secs) = (8000u32, 1u32);
        let data = rate * 2 * secs;
        let mut b = Vec::new();
        b.extend_from_slice(b"RIFF");
        b.extend_from_slice(&(36 + data).to_le_bytes());
        b.extend_from_slice(b"WAVEfmt ");
        b.extend_from_slice(&16u32.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&1u16.to_le_bytes());
        b.extend_from_slice(&rate.to_le_bytes());
        b.extend_from_slice(&(rate * 2).to_le_bytes());
        b.extend_from_slice(&2u16.to_le_bytes());
        b.extend_from_slice(&16u16.to_le_bytes());
        b.extend_from_slice(b"data");
        b.extend_from_slice(&data.to_le_bytes());
        b.resize(b.len() + data as usize, 0);
        std::fs::write(path, b).unwrap();
    }

    #[test]
    fn reads_wav_and_skips_short_files() {
        let dir = std::env::temp_dir().join("shell-player-local-test");
        let _ = std::fs::create_dir_all(&dir);
        let f = dir.join("歌手甲 - 一首歌.wav");
        silent_wav(&f);
        let t = read_track(&f, 0.0).expect("应该读到");
        assert_eq!(t.title, "一首歌");
        assert_eq!(t.artist, "歌手甲");
        assert!((t.duration - 1.0).abs() < 0.05, "时长 {}", t.duration);
        assert!(read_track(&f, 30.0).is_none());
        assert!(is_audio(&f) && !is_audio(&dir.join("a.lrc")));
        let folders = Folders(Mutex::new(vec![dir.clone()]));
        assert!(permitted(&folders, &f));
        assert!(!permitted(&folders, &dir.join("..").join("x.mp3")));
        assert!(!permitted(&folders, Path::new("/etc/passwd")));
    }
}
