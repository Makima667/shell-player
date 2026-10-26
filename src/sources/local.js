// 本地文件音源：选择音频文件或文件夹，同名 .lrc 作为歌词。文件只在本机读取，刷新后需重新选择
const files = new Map(); // id -> { file, lrc, url, title, artist, duration }
const baseName = n => n.replace(/\.[^.]+$/, '');
const AUDIO_RE = /\.(mp3|flac|m4a|aac|ogg|opus|wav|webm|ape|wma)$/i;

export const localSource = {
  kind: 'builtin',
  name: '本地文件',
  version: '1.0.0',
  description: '播放电脑或手机里的音频文件，同名 .lrc 会作为歌词。文件不会上传；重新打开播放器后需要重新选择。',
  canSearch: true,
  canUrl: true,
  get count() { return files.size; },
  async search(keyword) {
    const k = keyword.trim().toLowerCase();
    const list = [...files.entries()]
      .filter(([, f]) => !k || (f.title + f.artist + f.file.name).toLowerCase().includes(k))
      .map(([id, f]) => ({ id, title: f.title, artist: f.artist, album: '本地文件', duration: f.duration || 0 }));
    return { list, hasMore: false };
  },
  async getUrl(track) {
    const f = files.get(track.id);
    if (!f) throw new Error('这首本地歌曲已失效，请在「音源」里重新选择文件');
    if (!f.url) f.url = URL.createObjectURL(f.file);
    return { url: f.url };
  },
  async getLyric(track) {
    const f = files.get(track.id);
    return { lrc: f && f.lrc ? await f.lrc.text() : '' };
  },
  setDuration(id, d) { const f = files.get(id); if (f) f.duration = d; },
  import(fileList) {
    const all = [...fileList];
    const lrcs = new Map(all.filter(f => /\.lrc$/i.test(f.name)).map(f => [baseName(f.name).toLowerCase(), f]));
    let n = 0;
    for (const f of all) {
      if (!(f.type.startsWith('audio/') || AUDIO_RE.test(f.name))) continue;
      const base = baseName(f.name);
      const id = 'f:' + (f.webkitRelativePath || f.name) + ':' + f.size;
      let artist = '未知歌手', title = base;
      const m = base.match(/^(.+?)\s+-\s+(.+)$/);
      if (m) { artist = m[1].trim(); title = m[2].trim(); }
      files.set(id, { file: f, lrc: lrcs.get(base.toLowerCase()), title, artist });
      n++;
    }
    return n;
  }
};
