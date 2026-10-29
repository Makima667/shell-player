// 网易云 · 官方直连（自建，不依赖任何第三方解析后端）
//
// 为什么要自己写：元力/青听那套「官方搜索 + 海棠 yinyue.haitangw.net 解析」的链路，
// 解析层 2026-10 已 404，备用的 share.duanx.cn 整域名连不上，所以拿到的地址播不了。
// 这里改成完全直连网易官方接口：不经过任何中转，地址是网易自己签发的 CDN 链接。
//
// 限制（写在实现里，不藏）：
//   - 未填 Cookie：只能拿免费曲目，VIP/独家曲目官方返回 url=null
//   - 填了 MUSIC_U：按你的账号权限给 128k / 320k / flac
//   - 周杰伦等独家版权曲目网易云本身就没有，搜不到不是插件的问题
const axios = require('axios');
const API = 'https://interface3.music.163.com';
const REFERER = 'https://music.163.com/';

const QUALITY_BR = { low: 128000, standard: 128000, high: 320000, super: 999000 };

// 宿主把插件设置挂在全局 env 上（MusicFree 与空壳播放器都提供这个入口）
function userVars() {
  try {
    if (typeof env === 'undefined' || !env) return {};
    if (typeof env.getUserVariables === 'function') return env.getUserVariables() || {};
    return env.userVariables || {};
  } catch (e) {
    return {};
  }
}

const headers = (cookie) => ({
  Referer: REFERER,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Cookie: 'os=pc; appver=2.9.7' + (cookie ? `; MUSIC_U=${cookie}` : ''),
});

function toItem(s) {
  return {
    id: s.id,
    title: s.name,
    artist: (s.artists || s.ar || []).map(a => a.name).join('/'),
    album: (s.album && s.album.name) || (s.al && s.al.name) || '',
    artwork: (s.album && s.album.picUrl) || (s.al && s.al.picUrl) || '',
    duration: s.duration || s.dt || 0,
  };
}

module.exports = {
  platform: '网易云',
  version: '1.0.0',
  author: 'self-hosted',
  srcUrl: '',
  cacheControl: 'no-cache',
  hints: {
    '为什么有的歌搜不到': '网易云没有周杰伦等独家版权曲目，搜索接口不会返回它们。',
    'VIP 曲目播不了': '在插件设置里填网易云 Cookie 里的 MUSIC_U，就能按你的账号权限取 320k / flac。',
  },
  userVariables: [
    { key: 'MUSIC_U', name: 'MUSIC_U（可选，VIP 曲目需要）', placeholder: '从 music.163.com 的 Cookie 里复制 MUSIC_U 的值' },
  ],

  async search(keyword, page = 1) {
    const limit = 30;
    const offset = (page - 1) * limit;
    const url = `${API}/api/search/get?type=1&limit=${limit}&offset=${offset}&s=${encodeURIComponent(keyword)}`;
    const res = await axios.get(url, { headers: headers() });
    const songs = (res.data && res.data.result && res.data.result.songs) || [];
    return {
      isEnd: songs.length < limit,
      data: songs.map(toItem),
    };
  },

  async getMediaSource(musicItem, quality) {
    const br = QUALITY_BR[quality] || 128000;
    const cookie = userVars().MUSIC_U || '';
    const url = `${API}/api/song/enhance/player/url?ids=[${musicItem.id}]&br=${br}`;
    const res = await axios.get(url, { headers: headers(cookie) });
    const d = (res.data && res.data.data && res.data.data[0]) || null;
    if (!d) throw new Error('网易云没有返回播放信息');
    if (!d.url) {
      const code = d.code;
      throw new Error(code === 404
        ? '这首歌在网易云已下架或没有版权'
        : '这首歌需要会员权限：到插件设置里填 MUSIC_U，或换一个音源');
    }
    return { url: d.url.replace(/^http:\/\//, 'https://'), quality: d.br >= 999000 ? 'flac' : d.br >= 320000 ? '320k' : '128k', size: d.size };
  },

  async getLyric(musicItem) {
    const url = `${API}/api/song/lyric?id=${musicItem.id}&lv=1&kv=1&tv=-1`;
    const res = await axios.get(url, { headers: headers() });
    const lrc = (res.data && res.data.lrc && res.data.lrc.lyric) || '';
    const trans = (res.data && res.data.tlyric && res.data.tlyric.lyric) || '';
    return { rawLrc: lrc, translation: trans };
  },

  async getMusicInfo(musicItem) {
    const url = `${API}/api/song/detail?ids=[${musicItem.id}]`;
    const res = await axios.get(url, { headers: headers() });
    const s = (res.data && res.data.songs && res.data.songs[0]) || null;
    return s ? toItem(s) : null;
  },
};
