# MusicFree 插件订阅说明

## 导入

「设置 → 插件管理 → 从网络安装」，粘贴：

```
https://cdn.jsdelivr.net/gh/Makima667/shell-player@main/sources/musicfree/plugins.json
```

被墙时换 `plugins-fastly.json` 或 `plugins-raw.json`（同样是本仓库生成的三份等价订阅，只有 CDN 前缀不同）。

订阅文件结构就是 MusicFree 官方格式：

```json
{
  "desc": "Shell Player 音源库 · MusicFree 插件订阅（32 个）",
  "plugins": [
    { "name": "网易云 · 主源（2025.09 版）", "url": "https://cdn.jsdelivr.net/gh/...", "version": "2025.09.14" }
  ]
}
```

## 为什么指向本仓库

插件正文全部提交在 `sources/musicfree/plugins/`，订阅里的 URL 指向本仓库文件，而不是原作者仓库或网盘。任何上游删库、改路径、挂掉都不影响已发布的订阅——失效的是接口本身，需要按下面的流程替换。

## 插件形态

MusicFree 插件是 CommonJS 模块，宿主执行后读 `module.exports`。本仓库同时收录两种导出风格：

- 具名导出：`module.exports = { platform, search, getMediaSource, ... }`
- 默认导出：`module.exports.default = { ... }`

校验脚本会实际执行插件（`require` 全部走桩函数、无文件与网络权限），确认能拿到 `platform` / `search` / `getMediaSource` 才允许入库。

## 同名平台怎么选

同一平台往往有多个作者的实现，订阅名里带了来源，例如「网易云 · 念心」「网易云 · 元力」。建议每个平台只启用 1–2 个：多个同平台插件同时开启会让搜索结果重复。某个失效时再换备胎。

## 需要自备凭据的插件

WebDAV / Navidrome 一类需要你自己的服务器，本仓库未收录（收录了也用不了）。B 站 Cookie 版、各类 VIP 渠道插件可能需要在插件设置里填 Cookie，具体看插件内的 `hints` 字段。

## 加插件

1. 把编译后的单文件 `.js` 放进 `sources/musicfree/plugins/<slug>.js`；
2. 在 `sources/catalog.json` 的 `musicfree` 数组里补 `{ slug, tier, note }`；
3. `npm run build && npm run validate`；
4. 提交推送，订阅地址不变，客户端点「检查更新」即可拉到新条目。
