// 平台名称 ↔ 洛雪源平台代号，用来把"别的音源搜到的歌"交给洛雪源取播放地址
export const LX_NAMES = { kw: '酷我', kg: '酷狗', tx: 'QQ音乐', wy: '网易云', mg: '咪咕' };

const ALIASES = [
  ['kw', /酷我|kuwo|^kw$/i],
  ['kg', /酷狗|kugou|^kg$/i],
  ['tx', /qq|腾讯|^tx$/i],
  ['wy', /网易|netease|163|^wy$/i],
  ['mg', /咪咕|migu|^mg$/i]
];

export function lxKeyOf(name) {
  if (!name) return null;
  for (const [k, re] of ALIASES) if (re.test(String(name))) return k;
  return null;
}

// 把播放器里的歌曲对象转换成洛雪源期望的 musicInfo（同时给出 v1 平铺字段和 v2 的 meta 字段）
export function toLxMusicInfo(track, key) {
  const mf = track.mf || {};
  const raw = track.raw || {};
  const pick = (...ks) => { for (const k of ks) { const v = track[k] ?? mf[k] ?? raw[k]; if (v != null && v !== '') return v; } return undefined; };
  const songmid = pick('songmid', 'songMid', 'mid', 'rid', 'musicrid', 'songId', 'id');
  const hash = pick('hash', 'FileHash', 'fileHash');
  const copyrightId = pick('copyrightId', 'contentId');
  const albumId = pick('albumId', 'albumid', 'album_id', 'albummid');
  const strMediaMid = pick('strMediaMid', 'mediaMid', 'media_mid');
  const interval = track.duration ? `${String(Math.floor(track.duration / 60)).padStart(2, '0')}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}` : null;
  const info = {
    id: songmid, name: track.title, singer: track.artist, source: key, interval,
    albumName: track.album, img: track.cover,
    songmid: key === 'kw' ? String(songmid).replace(/^MUSIC_/, '') : songmid,
    hash, copyrightId, albumId, strMediaMid, lrcUrl: pick('lrcUrl'), mrcUrl: pick('mrcUrl'), trcUrl: pick('trcUrl'),
    types: [], _types: {}, typeUrl: {}
  };
  info.meta = { songId: info.songmid, albumName: track.album, picUrl: track.cover, albumId, hash, copyrightId, strMediaMid, qualitys: [], _qualitys: {} };
  return info;
}
