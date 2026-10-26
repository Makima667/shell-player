# 空壳播放器 Shell Player

一个**不带曲库**的音乐播放器：搜索、播放列表、歌单、下载、歌词都做好了，歌从哪里来由你配置的**音源**决定。

- 桌面版（Windows / macOS / Linux）和安卓版基于 [Tauri 2](https://tauri.app)，一套代码
- 网页版可以直接部署到 Cloudflare Pages
- 不内置任何第三方平台的音源

## 下载安装

[**Releases 页面**](https://github.com/Makima667/shell-player/releases) 按系统下载一个文件即可：

| 系统 | 文件 | 说明 |
|---|---|---|
| Windows | `ShellPlayer_*_x64-setup.exe` | 双击安装，不需要管理员权限，装完桌面和开始菜单都有快捷方式 |
| macOS | `ShellPlayer_*_universal.dmg` | 拖进「应用程序」；没有苹果签名，首次打开需右键选「打开」 |
| Linux | `ShellPlayer_*_amd64.AppImage` | `chmod +x` 后直接运行，或用 `.deb` |
| 安卓 | `ShellPlayer-android.apk` | 需允许安装未知来源应用 |

装好后在「音源」页添加音源才能搜索和播放，接入方式见应用内的「接入说明」。

## 功能

| | |
|---|---|
| 音源 | MusicFree 插件（含订阅）、洛雪（LX Music）自定义源、JSON 配置源、JS 脚本源；启用/停用、插件设置、一键更新；**把 .js/.json 拖进窗口或直接粘贴网址/代码即可导入** |
| 搜索 | 多个音源并发搜索，**谁先返回先显示谁**，单个音源超时不拖累整体；搜索历史 |
| 播放 | 列表循环 / 单曲循环 / 随机，音质选择并自动降级，**失败自动换源**，出错自动跳下一首；提前取好下一首的地址；暂停/继续淡入淡出；**定时关闭**；重新打开时从上次的进度接着播 |
| 歌单 | 我喜欢、自建歌单、最近播放、播放列表另存为歌单、拖动排序、右键/长按菜单 |
| 下载 | 桌面/安卓保存到「下载/ShellPlayer」并附带 .lrc，可离线播放；网页版保存到浏览器下载目录 |
| 歌词 | LRC 同步滚动、翻译歌词、卡拉 OK 逐行填色、点击歌词跳转；**桌面歌词**（透明置顶窗口，可锁定穿透） |
| 系统集成 | 桌面：系统媒体控制（Windows 媒体浮层 / macOS 正在播放 / Linux MPRIS）、托盘菜单、关闭到托盘、单实例、记住窗口位置；安卓：前台服务保证后台播放，通知栏和耳机按键控制，返回键先关浮层 |
| 动效 | 跟随封面取色的流动背景和主题色、模糊封面背景交叉淡入、封面从播放条飞入唱片、黑胶缓起缓停与唱臂、律动条、卡拉 OK 歌词、按方向的页面切换、导航滑块、爱心粒子、按钮涟漪；可在设置里关闭，也尊重系统的「减少动态效果」 |
| 其他 | 首次使用引导、本地文件播放（文件或整个文件夹，支持拖入）、深浅色主题、快捷键（按 ? 查看）、手机底部标签栏与滑动切歌、备份导入导出 |

## 音源怎么接

详细格式写在应用里的「接入说明」页（源码见 `src/ui/docs.js`）。简单说：

- **MusicFree 插件**：粘贴插件 .js、填插件网址，或填订阅地址（`{"plugins":[...]}`）一次导入一组。插件常用的 `axios`、`crypto-js`、`cheerio`、`dayjs`、`qs`、`he`、`big-integer` 都已内置。
- **洛雪自定义源**：只负责取播放地址和歌词，**不能搜索**。播放器会把其他音源搜到的歌按平台（kw / kg / tx / wy / mg）交给它，例如 MusicFree「QQ音乐」插件搜到的歌会交给支持 `tx` 的洛雪源。
- **JSON 配置源**：把一个返回 JSON 的接口映射成音源，适合自建服务，比如 Navidrome / Subsonic（应用里有模板）。
- **JS 脚本源**：`module.exports = { search, getUrl, getLyric }`。

取播放地址的顺序：歌曲所在音源 → 支持该平台的洛雪源 → （开启「失败自动换源」时）去其他音源搜同名同歌手的歌。

## 开发

```bash
npm install
npm run dev          # 网页版开发，http://localhost:1420
npm test             # 音源运行时测试
npm run tauri dev    # 桌面版开发（需要 Rust 和系统依赖，见 Tauri 文档）
```

安卓开发需要 Android SDK + NDK：

```bash
npx tauri android init
npx tauri android dev
```

目录结构：

```
src/
  core/        通用工具、网络请求、歌词解析、换源匹配
  sources/     音源运行时（JSON / 脚本 / MusicFree / 洛雪）、调度、示例源、本地文件源
  ui/          接入说明、动效（取色、律动条）
  platform.js  网页 / 桌面 / 安卓差异（下载、桌面歌词、安卓媒体通知）
  main.js      界面
src-tauri/     Tauri 应用（桌面歌词窗口在 src/lib.rs 里创建）
plugins/tauri-plugin-media-session/   安卓后台播放插件（Kotlin 前台服务 + MediaSession）
```

## 打包发布

推送 `v*` 标签（例如 `git tag v0.1.0 && git push origin v0.1.0`）或在 Actions 里手动运行「打包发布」，会生成一个草稿 Release，包含：

- Windows：`.msi`、`-setup.exe`
- macOS：通用 `.dmg`（未签名，首次打开需要在「系统设置 → 隐私与安全性」里允许）
- Linux：`.AppImage`、`.deb`、`.rpm`
- 安卓：`ShellPlayer-android.apk`

**安卓签名**：在仓库 Secrets 里配置 `ANDROID_KEYSTORE_BASE64`（`base64 -w0 release.jks` 的结果）、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`。不配置时会用临时密钥签名，可以安装测试，但之后的版本无法覆盖升级。

## 部署网页版到 Cloudflare Pages（免费）

1. 在 Cloudflare 后台创建 API Token（模板选 *Edit Cloudflare Workers*，或自定义权限 *Account → Cloudflare Pages → Edit*），记下 Account ID。
2. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。
3. 在 Actions 里手动运行「部署网页版到 Cloudflare Pages」，完成后访问 `https://shell-player.pages.dev`。
4. 验证没问题后，可以打开 `deploy-web.yml` 里的 `push` 触发，合并到 main 自动部署。

网页版受浏览器限制：接口需要允许跨域（CORS），也不能设置 Referer / User-Agent 等请求头，所以多数 MusicFree 插件和洛雪源在网页版上不可用，请用桌面版或安卓版。

## 声明

本项目只是播放器外壳，不提供、不内置任何音乐内容或第三方平台接口。请只接入你有权使用的内容：自己的曲库、正版授权的接口、公版或 CC 授权音乐。脚本类音源能执行任意代码，只导入你信任的来源。
