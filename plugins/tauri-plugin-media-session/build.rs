// update / stop / scan / lyrics / overlay 由安卓端（Kotlin）实现，这里只生成权限并打包安卓工程
// register_listener / remove_listener 是前端 addPluginListener 用的，不在权限里的话通知栏、耳机按键的操作传不到前端
const COMMANDS: &[&str] = &["update", "stop", "scan", "lyrics", "overlay", "register_listener", "remove_listener"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
