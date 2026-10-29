// 酷狗 · 官方搜索 + 洛雪源接力（自建）
//
// 为什么这样拆：酷狗的官方播放地址对热门曲目一律「需要付费」，但**搜索接口是通的**，
// 而洛雪源（星海 / 聚合API）能用酷狗的 hash 直接换出 flac / Hi-Res 直链。
// 所以这个插件只负责「把歌搜出来、把 hash / albumId 带上」，取地址优先走官方，
// 官方不给就明确抛错——播放器会自动把这首歌交给支持 kg 的洛雪源，实测能拿到 941kbps 的 flac。
const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function toItem(x) {
  const hash = x.FileHash || x.SQFileHash || x.HQFileHash;
  return {
    id: hash,
    hash,
    sqHash: x.SQFileHash || '',
    hqHash: x.HQFileHash || '',
    albumId: x.AlbumID || x.AlbumId || '',
    audioId: x.Audioid || x.MixSongID || '',
    title: (x.SongName || '').replace(/<[^>]+>/g, ''),
    artist: (x.SingerName || '').replace(/<[^>]+>/g, ''),
    album: x.AlbumName || '',
    duration: (x.Duration || 0) * 1000,
    pay: Number(x.Privilege || x.PayType || 0) > 0,
  };
}

module.exports = {
  platform: '酷狗',
  version: '1.0.0',
  author: 'self-hosted',
  srcUrl: '',
  cacheControl: 'no-cache',
  hints: {
    '为什么有的歌要等一秒': '取地址会先试官方接口，官方给的是付费墙，随后交给洛雪源（星海/聚合）换 flac——这一步是播放器自动做的。',
    '确保有洛雪源': '音源页里至少要有一个支持 kg 的洛雪源（内置的「星海音乐源」「聚合API接口」都支持）。',
  },

  async search(keyword, page = 1) {
    const limit = 30;
    const url = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}`
      + '&platform=WebFilter&userid=0&clientver=&area_code=1&filter=2&iscorrection=1';
    const res = await axios.get(url, { headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' } });
    const lists = (res.data && res.data.data && res.data.data.lists) || [];
    return { isEnd: lists.length < limit, data: lists.map(toItem) };
  },

  async getMediaSource(musicItem) {
    const hash = musicItem.hash || musicItem.id;
    if (!hash) throw new Error('这条结果没有 hash，换一条试试');
    try {
      const r = await axios.get(`https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${hash}`, {
        headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' },
      });
      const d = r.data || {};
      if (d.url) return { url: d.url, quality: d.bitRate >= 320 ? '320k' : '128k', size: d.fileSize };
    } catch (e) { /* 继续往下抛，让播放器交给洛雪源 */ }
    throw new Error('酷狗官方不给免费地址（需要会员）：已交给洛雪源取无损');
  },

  async getLyric(musicItem) {
    const hash = musicItem.hash || musicItem.id;
    const r = await axios.get(`https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=&hash=${hash}`, {
      headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' },
    });
    const cand = (r.data && r.data.candidates && r.data.candidates[0]) || null;
    if (!cand) return { rawLrc: '' };
    const l = await axios.get(`https://lyrics.kugou.com/download?ver=1&client=pc&id=${cand.id}&accesskey=${cand.accesskey}&fmt=lrc&charset=utf8`, {
      headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' },
    });
    const b64 = (l.data && l.data.content) || '';
    const text = b64 ? Buffer.from(b64, 'base64').toString('utf8') : '';
    return { rawLrc: text };
  },
};
