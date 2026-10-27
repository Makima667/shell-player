// update / stop / scan 由安卓端（Kotlin）实现，这里只生成权限并打包安卓工程
const COMMANDS: &[&str] = &["update", "stop", "scan"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
