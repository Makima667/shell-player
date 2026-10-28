# 落雪音乐（LX Music）音源说明

## 桌面版：一键写入

```bash
node scripts/install.mjs --dry-run   # 先看会写什么
node scripts/install.mjs             # 实际写入
```

| 参数 | 作用 |
| --- | --- |
| `--dry-run` | 只打印增删改，不落盘 |
| `--lx-dir <dir>` | 指定数据目录（便携版、非默认安装位置） |
| `--restore` | 回滚到同目录下最近一次备份 |
| `--print-urls` | 只打印订阅地址 |

数据目录按平台自动定位：

- Windows：`%APPDATA%\lx-music-desktop`（便携版为 `<程序目录>\portable\userData`）
- macOS：`~/Library/Application Support/lx-music-desktop`
- Linux：`$XDG_CONFIG_HOME/lx-music-desktop` 或 `~/.config/lx-music-desktop`

实际写入的是 `<数据目录>/LxDatas/user_api.json` 里的 `userApis` 数组，格式与 LX 自己导入后存的完全一致：

```json
{
  "id": "user_api_sp_juhe-lerd",
  "name": "聚合API接口 (by lerd)",
  "description": "理论可听全平台无损",
  "author": "lerd",
  "homepage": "",
  "version": "v2.0.0",
  "allowShowUpdateAlert": true,
  "script": "gz_<deflate+base64 的脚本正文>"
}
```

`script` 用 `gz_` 前缀的压缩串，是 LX 导入自定义源时的内部表示；安装脚本压缩、测试用例解压回原文逐字节比对，保证不会被写坏。

**执行前请退出 LX Music。** 应用在退出/变更时会整体重写这个文件，运行中写入会被覆盖。

## 移动版：手动导入

安卓 / 鸿蒙没有订阅机制，只能：

1. 从 [`sources/lx/`](../sources/lx) 下载 `.js`，或取 Release 中自动打包的 `lx-sources.zip`；
2. 应用内「设置 → 自定义源 → 导入」选中文件；
3. 回到「设置 → 自定义源」启用。

## 音质与平台

音源能拿到什么音质，取决于作者服务器和对应平台账号。`flac24bit` / `hires` 这类字段只代表脚本声明支持，不代表一定给得到。要 VIP 音质通常需要在音源里填自己的 Cookie，各脚本头部注释会写清对应字段（例如 `@netease MUSIC_U=`）。

## 排错

- **列表里没有音源**：确认写的是 `LxDatas/user_api.json`，且执行前已退出应用。
- **有音源但播放失败**：先换 `tier=主推` 的另一个（同一平台一般有 2–3 个备胎）；仍然失败说明作者服务器挂了，等更新或删掉该文件。
- **提示「初始化失败」**：多数是脚本自检头部信息或连不上作者服务器所致，与安装方式无关。
- **想彻底重来**：`node scripts/install.mjs --restore`，或直接删 `user_api.json` 让应用重建。
