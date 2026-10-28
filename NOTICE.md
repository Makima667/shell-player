# 来源与声明

## 上游

本仓库的音源文件不是原创，全部来自公开渠道的合集，按文件逐个保留原作者的文件头注释（`@name` / `@author` / `@version` 等）。

| 用途 | 来源 | 抓取版本 |
| --- | --- | --- |
| 落雪音乐音源（15 个） | [`skxingyu/lx_music-`](https://github.com/skxingyu/lx_music-) 中的 `音源接口.zip`、`音源接口-2026-8更新.zip`、`0912-update.zip`、`music_sources.zip` | `8439573`（2026-09-12） |
| MusicFree 插件（32 个） | [`qwerwhr/musicfree-plugins`](https://github.com/qwerwhr/musicfree-plugins) | `9cb5658`（2026-06-05） |
| 插件格式参考 | [`maotoumao/MusicFreePlugins`](https://github.com/maotoumao/MusicFreePlugins)（官方插件集） | 仅参考，未收录其插件 |

单个音源的作者、版本以文件头为准，例如「六音音源」出自 sixyin.com，「ikun音源」出自 `lxmusics/lx-music-api-server` 的服务端方案。本仓库未修改任何脚本正文，只在 `sources/catalog.json` 里补了分类、等级和一句话说明。

## 容易忽略的两件事

**部分脚本经过混淆。** 名单见 [SOURCES.md](SOURCES.md) 里带「（混淆）」标记的条目。混淆后的代码无法审计它到底请求了什么、把你的 IP / Cookie 发到哪，只能确认它能在离线沙箱里完成初始化并声明平台。用不用由你判断，仓库不做隐藏。

**音源的可用性不归本仓库控制。** 这些脚本依赖第三方的解析服务，作者停服、接口变更、平台风控升级都会让某个音源当天失效。本仓库能保证的只有：文件没被改坏、格式符合宿主规范、索引与订阅地址始终指向真实存在的文件。

## 许可

各脚本版权归原作者，本仓库对其不做任何授权声明，仅做归档与索引。仓库自身的脚本（`scripts/`、`tests/`）以 MIT 提供。

音源仅供个人学习研究使用。请支持正版音乐，不要用于批量下载或商业分发。
