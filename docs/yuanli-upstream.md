# 青听 / 元力音源逆向记录

> 实测时间：2026-10-29 19:31（本机网络，真实请求，无代理）
> 复现命令：`node scripts/check-upstream.mjs`

## 一、你给的两个 URL 是同一份东西的两个镜像

| | `13413.kstore.vip/QingMusic/music.json` | `musicapi.haitangw.net/music.json` |
| --- | --- | --- |
| 体积 | 1886 B | 1778 B |
| 文件头 | `@name 青听音源 / @author 微信公众号: 元力菌` | 完全相同 |
| 线路数 | 6（kw / kg / wy / tx / bili / mg） | 4（kw / kg / wy / tx） |
| 音质档 | kw 到 master、wy 到 jymaster | kw 只到 lossless，wy 到 hires |

结论：**不是两套相互对照的方案，是同一个作者（元力菌）放在两个 CDN 上的同一份配置**。kstore 那份更新、更全。

格式本身只是「线路声明」：

```json
{"lines":[{"id":"wy","name":"小云源","enabled":true,
  "searchApi":"wySearchMusic","detailApi":"wyMusicDetail",
  "levels":["standard","exhigh","lossless","hires","sky","jyeffect","jymaster"]}]}
```

`searchApi` / `detailApi` 是**青听 App 内部函数名**（`fetchSearchMusic`、`kgSearchMusic`…），配置里没有任何实现——真正的网络代码编译在 APK 里（`kejichangqing/QingMusic` 仓库只有 README、图标和这个 json，不含源码）。所以「导入音源」导入的只是一张开关表，用哪些平台、允许哪些音质档。

## 二、这套源的完整链路

```
青听配置(music.json)
   ↓ 读取 lines，决定用哪些平台
各平台官方搜索接口 ——  wy: interface3.music.163.com /api/search/get
                        kg: songsearch.kugou.com/song_search_v2
                        tx: c.y.qq.com/soso/fcgi-bin/client_search_cp
   ↓ 拿到 songid / hash / songmid
海棠解析后端 ——      http://yinyue.haitangw.net/wy/wy.php?id=&level=
                    http://yinyue.haitangw.net/kg/kg_song_kw.php?id=&type=json&level=
                    http://yinyue.haitangw.net/qq/qq_kw.php?id=&type=json&level=
   ↓ 返回 { data: { url } }
播放
```

同一套东西还有 MusicFree 版本，托管在同一台机器上：`13413.kstore.vip/yuanli/{wy,kg,kw,qq}.js`（元力菌自己维护的插件，混淆过，`platform` 显示为「元力WY / 元力KG / 元力KW / 元力QQ」）。新版 wy 还加了一条备胎，把地址拼到 `share.duanx.cn`。

## 三、实测：链路 11 环只活 7 环，死的正好是出地址那几环

| 环节 | 结果 |
| --- | --- |
| 青听配置（kstore） | ✔ 200 / 226ms |
| 青听配置（haitangw） | ✔ 200（但首次常被 TLS reset，要重试） |
| 海棠解析后端根 | ✖ 200 但**空回包** |
| `yinyue.haitangw.net/wy/wy.php` | ✖ **404** |
| `yinyue.haitangw.net/kg/kg_song_kw.php` | ✖ **404** |
| `yinyue.haitangw.net/qq/qq_kw.php` | ✖ **404** |
| 元力分发 wy/kg/kw/qq.js | ✔ 200 / 56–97ms（文件都在，还更新到 84K/73K/61K/63K） |
| 备胎中转 `share.duanx.cn` | ✖ **DNS 不存在（ENOTFOUND）** |

用应用自己的运行时跑元力最新版插件，端到端结果：

- 网易：搜索 5.2s 出 30 条；取地址返回 `https://share.duanx.cn/url/wy/<id>/128k` —— 域名解析不了，**拿到也是死的**
- 酷狗：搜索接口 5s 超时（缺 UA/Referer 被挡）
- 酷我：`search.kuwo.cn` 连不上
- QQ：搜索 3.8s 返回 **0 条**

## 四、所以「不稳定」的真实原因

1. **出地址的那一层整体挂了**（海棠三个 php 全 404），配置和插件文件还在更新，但按下去没有地址。
2. 唯一的备胎 `share.duanx.cn` 域名已经不存在，插件仍然往里拼地址。
3. 这类源本质是「共享解析池」：靠后端持有的会员账号签发直链，后端一停、账号一封就全灭，你这边没有任何可修的地方。

## 五、能自己修的那部分

同目录下 `sources/musicfree/plugins/wy-official.js` 是重新写的**网易官方直连**（不走任何中转，地址由网易 CDN 自己签发）：

- 搜索：`interface3.music.163.com/api/search/get`，实测 0.4–1.2s 出 30 条，排序正常
- 播放地址：`/api/song/enhance/player/url`，实测返回 320k 直链，`Range: bytes=0-1023` 回 **206 audio/mpeg**
- 歌词：`/api/song/lyric`，含翻译
- 在插件设置里填 `MUSIC_U`（网易云 Cookie 里那一段），才能按你账号权限拿 VIP 曲目的 320k / flac；不填就只能播免费曲目——这本就是官方接口的边界
- 周杰伦这类独家版权曲目网易云**本身没有**，搜不到不是插件问题（实测「晴天」前四条全是翻唱）

酷狗 / QQ 的官方直链需要会员票据，公共中转（vkeys、gdstudio、meting 等）要么 403、要么域名没了，所以暂时没有等价的直连版本——这一块只能靠你自己的会员 Cookie 或第三方源。
