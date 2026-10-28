// 读取音频文件里的标签：歌名、歌手、专辑、时长、封面、歌词。用于手动选择的本地文件
let mm;
const pad = n => String(n).padStart(2, '0');
const lrcTime = ms => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}.${pad(Math.floor(ms / 10) % 100)}`;

// 内嵌歌词：同步歌词（SYLT）转成 LRC，普通歌词（USLT，常常本身就是 LRC 文本）原样返回
export function lyricsText(list) {
  for (const l of list || []) {
    if (typeof l === 'string' && l.trim()) return l;
    if (l?.syncText?.length) return l.syncText.map(x => `[${lrcTime(x.timestamp || 0)}]${x.text}`).join('\n');
    if (l?.text?.trim()) return l.text;
  }
  return '';
}

// 有些软件把歌词写在自定义字段里（TXXX:LYRICS、UNSYNCEDLYRICS 之类）
function nativeLyrics(native) {
  for (const tags of Object.values(native || {})) {
    for (const t of tags) {
      if (!/USLT|LYRIC/i.test(String(t.id))) continue;
      const v = typeof t.value === 'string' ? t.value : t.value?.text || t.value?.lyrics;
      if (typeof v === 'string' && v.trim()) return v;
    }
  }
  return '';
}

export async function readTags(file) {
  mm ||= await import('music-metadata');
  const m = await mm.parseBlob(file, { duration: false });
  const c = m.common || {};
  const pic = c.picture?.[0];
  return {
    title: c.title?.trim() || '',
    artist: (c.artists?.length ? c.artists.join(' / ') : c.artist || '').trim(),
    album: c.album?.trim() || '',
    duration: m.format?.duration || 0,
    cover: pic ? URL.createObjectURL(new Blob([pic.data], { type: pic.format || 'image/jpeg' })) : '',
    lyric: lyricsText(c.lyrics) || nativeLyrics(m.native)
  };
}
