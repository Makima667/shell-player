// QQ音乐 · 官方直连（自建，不依赖海棠/元力那类转身解析）
//
// 链路：官方搜索 c.y.qq.com → 官方 vkey 接口 u.y.qq.com/cgi-bin/musicu.fcg → CDN 直链。
// 实测（2026-10-29）：免费曲目可以拿到 M500 的 128k 直链，Range 请求回 206 audio/mpeg；
// VIP / 数字专辑曲目官方对未登录请求返回空 vkey，这时候插件会明确告诉你原因，
// 而不是给一个放不出来的地址。
//
// 想让 VIP 曲目也能放：在插件设置里填 QQ_UIN（QQ 号）和 QQ_KEY（网页版 Cookie 里的 qm_keyst），
// 插件会带上你自己的登录票据去取地址。
const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const REFERER = 'https://y.qq.com/';
const GUID = String(Math.floor(1e9 + Math.random() * 8e9));

function userVars() {
  try {
    if (typeof env === 'undefined' || !env) return {};
    if (typeof env.getUserVariables === 'function') return env.getUserVariables() || {};
    return env.userVariables || {};
  } catch (e) {
    return {};
  }
}

const headers = () => {
  const v = userVars();
  const cookie = ['uin=o' + (v.QQ_UIN || '0'), v.QQ_KEY ? 'qm_keyst=' + v.QQ_KEY : ''].filter(Boolean).join('; ');
  return { Referer: REFERER, 'User-Agent': UA, Cookie: cookie };
};

function toItem(s) {
  const pay = s.pay || {};
  return {
    id: s.id,
    mid: s.mid,
    title: s.name || s.title,
    artist: (s.singer || []).map(x => x.name).join('/'),
    album: (s.album && s.album.name) || '',
    artwork: s.album && s.album.mid
      ? `https://y.qq.com/music/photo_new/T002R500x500M000${s.album.mid}.jpg`
      : '',
    duration: (s.interval || 0) * 1000,
    vip: !!(pay.pay_play || pay.pay_down),
  };
}

// 音质档 → QQ 的文件名前缀，从高到低依次尝试
const FILES = {
  super: ['F000', 'M800', 'M500'],
  high: ['M800', 'M500'],
  standard: ['M500', 'M800'],
  low: ['M500'],
};
const QUALITY_OF = { F000: 'flac', M800: '320k', M500: '128k' };

// 同一首歌在 QQ 上常有多条发行（专辑版 / 精选集版 / 单曲版），付费标记不一样。
// 用户点的那条是 VIP、另一条免费时，直接放能播的那条——同名同歌手，不是随便拿翻唱顶替。
const siblingCache = new Map();

async function searchRaw(keyword, page = 1, limit = 30) {
  const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(keyword)}&format=json&n=${limit}&p=${page}&cr=1&new_json=1`;
  const res = await axios.get(url, { headers: headers() });
  const list = (res.data && res.data.data && res.data.data.song && res.data.data.song.list) || [];
  return list.map(toItem);
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s|\(|\)|（|）|\[|\]/g, '');

async function playableSibling(musicItem, prefixes) {
  const key = String(musicItem.mid || musicItem.id);
  const hit = siblingCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.value;

  const wantTitle = norm(musicItem.title);
  const wantArtist = norm(musicItem.artist);
  const wantDur = Number(musicItem.duration) > 0 ? Number(musicItem.duration) / 1000 : 0;
  let list = [];
  try {
    list = await searchRaw(`${musicItem.title} ${musicItem.artist || ''}`.trim(), 1, 20);
  } catch (e) {
    siblingCache.set(key, { at: Date.now(), value: null });
    return null;
  }

  // 只认同名 + 同歌手 + 时长接近的条目：那是同一首录音的另一个发行（专辑版/精选集版），
  // 换过去用户听不出差别。同名不同版本（live、合唱、翻唱）一律不顶替——宁可报错也不骗人。
  const sameRecording = list.filter((it) => {
    if (String(it.mid) === key) return false;
    if (norm(it.title) !== wantTitle) return false;
    if (norm(it.artist) !== wantArtist) return false;
    if (wantDur && Math.abs(Number(it.duration) / 1000 - wantDur) > 5) return false;
    return true;
  });

  for (const cand of sameRecording.slice(0, 4)) {
    try {
      const got = await getVkey(cand.mid, prefixes);
      if (got) {
        siblingCache.set(key, { at: Date.now(), value: got });
        return got;
      }
    } catch (e) { /* 换下一条 */ }
  }
  siblingCache.set(key, { at: Date.now(), value: null });
  return null;
}

async function getVkey(mid, prefixes) {
  const v = userVars();
  const uin = v.QQ_UIN || '0';
  const filenames = prefixes.map(p => p + mid + (p === 'F000' ? '.flac' : '.mp3'));
  const body = {
    comm: { uin, format: 'json', ct: 24, cv: 0, platform: 'yqq.json' },
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: { guid: GUID, songmid: filenames.map(() => mid), songtype: filenames.map(() => 0), uin, loginflag: 1, platform: '20', filename: filenames },
    },
  };
  const res = await axios.post('https://u.y.qq.com/cgi-bin/musicu.fcg', body, { headers: headers() });
  const data = res.data && res.data.req_0 && res.data.req_0.data;
  if (!data) throw new Error('QQ 音乐没有返回播放信息');
  const sip = (data.sip && data.sip[0]) || 'https://ws.stream.qqmusic.qq.com/';
  for (const item of data.midurlinfo || []) {
    if (item && item.vkey && item.purl) {
      return {
        url: sip.replace(/^http:\/\//, 'https://') + item.purl,
        quality: QUALITY_OF[String(item.filename).slice(0, 4)] || '128k',
        size: item.filesize || undefined,
      };
    }
  }
  return null;
}

module.exports = {
  platform: 'QQ音乐',
  version: '1.0.0',
  author: 'self-hosted',
  srcUrl: '',
  cacheControl: 'no-cache',
  hints: {
    '能放什么': '免费曲目直接可播（官方给 128k）；VIP / 数字专辑曲目要填自己的 QQ_UIN 和 QQ_KEY。',
    'VIP 曲目报错': '官方对未登录请求返回空 vkey。到插件设置填 QQ_UIN（QQ 号）和 QQ_KEY（y.qq.com Cookie 里的 qm_keyst）。',
    '为什么只有 128k': '免登录只签发 M500（128k）。高档位 M800 / F000 需要账号权限，填了票据后会自动往上试。',
  },
  userVariables: [
    { key: 'QQ_UIN', name: 'QQ_UIN（可选，QQ 号）', placeholder: '例如 10001' },
    { key: 'QQ_KEY', name: 'QQ_KEY（可选，Cookie 里的 qm_keyst）', placeholder: 'y.qq.com 登录后从 Cookie 复制' },
  ],

  async search(keyword, page = 1) {
    const limit = 30;
    const list = await searchRaw(keyword, page, limit);
    return { isEnd: list.length < limit, data: list };
  },

  async getMediaSource(musicItem, quality) {
    const mid = musicItem.mid || musicItem.id;
    const prefixes = FILES[quality] || FILES.standard;
    const got = await getVkey(mid, prefixes);
    if (got) return got;

    // 这条是付费条目：找同名（优先同歌手）的免费条目顶上
    const alt = await playableSibling(musicItem, prefixes);
    if (alt) return alt;

    throw new Error(musicItem.vip
      ? '这首歌在 QQ 音乐只有付费版本：到插件设置填自己的 QQ_UIN / QQ_KEY，或者换一个音源'
      : 'QQ 音乐没有返回可用地址（可能已下架或地区限制）');
  },

  async getLyric(musicItem) {
    const mid = musicItem.mid || musicItem.id;
    const url = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${mid}&format=json&nobase64=1&g_tk=5381`;
    const res = await axios.get(url, { headers: { ...headers(), Referer: 'https://y.qq.com/portal/player.html' } });
    const d = res.data || {};
    return { rawLrc: d.lyric || '', translation: d.trans || '' };
  },
};
