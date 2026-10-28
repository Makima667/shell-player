// 内置音源包：首次启动时自动加入，避免"装好了但没声音"。
//
// 这些文件是从 `sources/lx` 与 `sources/musicfree/plugins` 里挑出来的，用 `?raw` 打进包里，
// 不联网、不依赖第三方 CDN。改这个目录后记得同步提升 BUNDLE_VERSION，
// 老用户点一次「恢复内置音源」就能拿到新版本。
import juheLerd from './lx/juhe-lerd.js?raw';
import molan from './lx/molan.js?raw';
import ikun from './lx/ikun.js?raw';
import huibq from './lx/huibq.js?raw';
import xinghai from './lx/xinghai.js?raw';

import wyYinyue from './musicfree/wy-yinyue.js?raw';
import qqTengxun from './musicfree/qq-tengxun.js?raw';
import kgJianyun from './musicfree/kg-jianyun.js?raw';
import kwMao from './musicfree/kw-mao.js?raw';
import qsQishui from './musicfree/qs-qishui.js?raw';
import biliCookie from './musicfree/bili-cookie.js?raw';
import ximalaya from './musicfree/ximalaya.js?raw';
import qianqian from './musicfree/qianqian.js?raw';
import yt from './musicfree/yt.js?raw';

export const BUNDLE_VERSION = 1;

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

  { slug: 'wy-yinyue', kind: 'musicfree', name: '网易云', note: '主源，可搜索可播放', code: wyYinyue },
  { slug: 'qq-tengxun', kind: 'musicfree', name: 'QQ音乐', note: '全量', code: qqTengxun },
  { slug: 'kg-jianyun', kind: 'musicfree', name: '酷狗', note: '简云', code: kgJianyun },
  { slug: 'kw-mao', kind: 'musicfree', name: '酷我', note: '猫', code: kwMao },
  { slug: 'qs-qishui', kind: 'musicfree', name: '汽水音乐', note: '', code: qsQishui },
  { slug: 'bili-cookie', kind: 'musicfree', name: '哔哩哔哩', note: '支持 Cookie', code: biliCookie },
  { slug: 'ximalaya', kind: 'musicfree', name: '喜马拉雅', note: '电台 / 有声书', code: ximalaya },
  { slug: 'qianqian', kind: 'musicfree', name: '千千音乐', note: '', code: qianqian },
  { slug: 'yt', kind: 'musicfree', name: 'YouTube', note: '', code: yt }
];

export const bundledId = (item) => `b:${item.kind}:${item.slug}`;
