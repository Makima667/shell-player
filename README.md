# 空壳播放器 · 音源仓库

这个仓库只做一件事：**把音源直接塞进你的播放器，装完就能听。**

- **15 个落雪音乐（LX Music）自定义音源**，桌面版由脚本直接写进配置，重启即生效；
- **32 个 MusicFree 插件**，一条订阅地址全量导入；
- 每个文件都在隔离进程里跑过一遍（语法 → 初始化 → 导出接口），通过才收录。

清单：[docs/SOURCES.md](docs/SOURCES.md)（由脚本生成，含平台、版本、混淆标注）。

## 落雪音乐（桌面版）

```bash
git clone https://github.com/Makima667/shell-player.git
cd shell-player
node scripts/install.mjs
```

脚本会自动定位数据目录（Windows `%APPDATA%\lx-music-desktop\LxDatas\user_api.json`，macOS / Linux 为对应路径），把 15 个音源按 LX 自己的存储格式（`gz_` + base64）合并进 `user_api.json`：

- 写之前先备份成 `user_api.json.bak.<时间戳>`；
- 重复执行幂等，同内容不会写两遍；同名音源不覆盖你的改动；
- 配置解析失败就**原样保留、直接退出**，不会覆盖坏掉的配置；
- 支持 `--dry-run`（演练）、`--lx-dir <目录>`（便携版）、`--restore`（回滚到最近备份）。

重启 LX Music →「设置 → 自定义源」→ 逐个启用。若 LX 正在运行，先退出再执行脚本，否则应用退出时会覆盖回去。

## 落雪音乐（安卓 / 移动版）

移动版没有订阅机制，只能导入文件：从 [`sources/lx/`](sources/lx) 下载需要的 `.js`，或取 Release 里的打包 `lx-sources.zip`（推 `main` 时自动构建），在应用内「设置 → 自定义源 → 导入」选择文件。

## MusicFree

「设置 → 插件管理 → 从网络安装」，粘贴订阅地址：

```
https://cdn.jsdelivr.net/gh/Makima667/shell-player@main/sources/musicfree/plugins.json
```

备用线路（jsDelivr 被墙时）：

```
https://fastly.jsdelivr.net/gh/Makima667/shell-player@main/sources/musicfree/plugins-fastly.json
https://raw.githubusercontent.com/Makima667/shell-player/main/sources/musicfree/plugins-raw.json
```

订阅里每个插件都指向本仓库自己的文件（`sources/musicfree/plugins/*.js`），不依赖第三方地址存活。

## 收录范围

| 生态 | 数量 | 覆盖 |
| --- | --- | --- |
| 落雪音源 | 15 | 网易云 / QQ音乐 / 酷狗 / 酷我 / 咪咕 五平台聚合，含单平台直连备胎 |
| MusicFree 插件 | 32 | 网易云 7、QQ音乐 5、酷狗 4、酷我 4、咪咕 1、汽水 3、B站 / YouTube / 猫耳 / 喜马拉雅 / 千千 / GD / 云云音乐 等 |

平台、版本、是否混淆都在 [docs/SOURCES.md](docs/SOURCES.md) 里列清楚——混过的代码没法审计，标注出来由你决定用不用。

## 维护

```bash
npm run build      # 重新生成 manifest / 订阅文件 / 音源清单
npm run validate   # 校验全部音源 + 确认生成文件没有过期
npm test           # 安装脚本的往返测试（写入→还原→幂等→损坏保护）
npm run urls       # 打印订阅地址
```

- 收录/取舍写在 [`sources/catalog.json`](sources/catalog.json)（slug、等级、一句话说明），其余字段（版本、平台、哈希、大小）全部从文件本身解析，不手填。
- 加音源：文件丢进 `sources/lx/` 或 `sources/musicfree/plugins/`，在 `catalog.json` 补一条，`npm run build`。
- 下架：删文件 + 删条目，`npm run build`；`validate` 会拦住漏删、重名、内容重复和忘记重建的情况。

## 目录

```
sources/
  catalog.json                 收录决策（人工）
  manifest.json                总索引（生成）
  lx/                          落雪音源 .js + index.json
  musicfree/
    plugins/                   MusicFree 插件 .js
    plugins.json               订阅（jsDelivr）
    plugins-fastly.json        订阅（fastly）
    plugins-raw.json           订阅（raw.githubusercontent）
scripts/
  lib.mjs                      解析与隔离探针
  probe-worker.mjs             单文件探针子进程（限内存、限时）
  build-index.mjs              生成全部索引
  validate.mjs                 校验 + 检查索引是否过期
  install.mjs                  写入 LX Music 配置
tests/install.test.mjs         安装脚本回归测试
```

## 声明

音源脚本版权归各自作者，本仓库只做归档、索引与安装自动化，未做任何二次修改。音源指向的是第三方接口，随时可能失效或变更；失效时删掉对应文件重跑 `npm run build` 即可。仅供个人学习研究使用，请支持正版音乐。
