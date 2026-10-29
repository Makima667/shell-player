// 内置音源包：首次启动时自动加入，避免"装好了但没声音"。
//
// 这里只放「体检过、确实能出声」的源（体检脚本见仓库 main 分支的 `npm run health`）。
// 2026-10-29 这一轮把已失效的元力系撤出了内置（后端 yinyue.haitangw.net 三个解析接口
// 全 404、备胎 share.duanx.cn 域名不存在），换成官方直连的两个自建源。
//
// 改这个目录后记得同步提升 BUNDLE_VERSION，老用户点一次「恢复内置音源」就能拿到新版本。
import juheLerd from './lx/juhe-lerd.js?raw';
import molan from './lx/molan.js?raw';
import ikun from './lx/ikun.js?raw';
import huibq from './lx/huibq.js?raw';
import xinghai from './lx/xinghai.js?raw';

import wyOfficial from './musicfree/wy-official.js?raw';
import qqOfficial from './musicfree/qq-official.js?raw';
import qqTengxun from './musicfree/qq-tengxun.js?raw';
import kgOfficial from './musicfree/kg-official.js?raw';

export const BUNDLE_VERSION = 3;

/**
 * kind: 'lx' 只提供播放地址与歌词（配合能搜索的音源使用）
 *       'musicfree' 自带搜索 + 取地址，是能独立听歌的那一类
 */
export const BUNDLED_SOURCES = [
  { slug: 'juhe-lerd', kind: 'lx', name: '聚合API接口 (by lerd)', note: '五平台聚合，主力', code: juheLerd },
  { slug: 'molan', kind: 'lx', name: '墨澜聚合音源', note: '多接口回退', code: molan },
  { slug: 'ikun', kind: 'lx', name: 'ikun音源', note: 'ikun 服务端，五平台', code: ikun },
  { slug: 'huibq', kind: 'lx', name: 'Huibq 音源', note: '轻量，128k/320k', code: huibq },
  { slug: 'xinghai', kind: 'lx', name: '星海音乐源', note: '轻量备胎', code: xinghai },

  { slug: 'wy-official', kind: 'musicfree', name: '网易云 · 官方直连', note: '实测可播，可填 MUSIC_U', code: wyOfficial },
  { slug: 'qq-official', kind: 'musicfree', name: 'QQ音乐 · 官方直连', note: '免费曲目可播，VIP 需填 QQ_UIN / QQ_KEY', code: qqOfficial },
  { slug: 'qq-tengxun', kind: 'musicfree', name: 'QQ音乐 · 腾讯音乐', note: '实测可播的第三方源', code: qqTengxun },
  { slug: 'kg-official', kind: 'musicfree', name: '酷狗 · 官方搜索', note: '配合洛雪源取无损（实测 941kbps flac）', code: kgOfficial },
];

export const bundledId = (item) => `b:${item.kind}:${item.slug}`;
