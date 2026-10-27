// 本地文件音源，两种来源：
// 1. 扫描出来的本地音乐库（桌面扫描音乐文件夹，安卓读系统媒体库），按文件路径播放，重启后还在
// 2. 手动选择的文件（网页版也能用），只在本次打开期间有效，同名 .lrc 作为歌词
const files = new Map(); // id -> { file, lrc, url, title, artist, duration }
let library = [];        // [{ path, title, artist, album, duration }]
// 读取本机文件的方法由平台层提供（桌面 / 安卓）
const hooks = { fileUrl: null, lyric: null, readTags: null };
const libTrack = x => ({ id: 'p:' + x.path, path: x.path, title: x.title || '未知歌曲', artist: x.artist || '未知歌手', album: x.album || '', duration: x.duration || 0 });
const baseName = n => n.replace(/\.[^.]+$/, '');
const AUDIO_RE = /\.(mp3|flac|m4a|aac|ogg|opus|wav|webm|ape|wma)$/i;

export const localSource = {
  kind: 'builtin',
  name: '本地文件',
  version: '1.0.0',
  description: '播放电脑或手机里的音乐：桌面版扫描音乐文件夹，安卓读取系统媒体库，也可以手动选择文件。同名 .lrc 或内嵌歌词会作为歌词。',
  canSearch: true,
  canUrl: true,
  get count() { return files.size + library.length; },
  get library() { return library; },
  setHooks(h) { Object.assign(hooks, h); },
  setLibrary(list) { library = Array.isArray(list) ? list : []; },
  libraryTracks() { return library.map(libTrack); },
  async search(keyword) {
    const k = keyword.trim().toLowerCase();
    const picked = [...files.entries()]
      .filter(([, f]) => !k || (f.title + f.artist + f.file.name).toLowerCase().includes(k))
      .map(([id, f]) => ({ id, title: f.title, artist: f.artist, album: f.album || '本地文件', duration: f.duration || 0, cover: f.cover || '' }));
    const scanned = library.filter(x => !k || (x.title + x.artist + x.album + x.path).toLowerCase().includes(k)).map(libTrack);
    return { list: [...picked, ...scanned], hasMore: false };
  },
  async getUrl(track) {
    if (track.path) {
      if (!hooks.fileUrl) throw new Error('这个版本不能直接读取本机文件');
      return { url: await hooks.fileUrl(track.path) };
    }
    const f = files.get(track.id);
    if (!f) throw new Error('这首本地歌曲已失效，请在「音源」里重新选择文件');
    if (!f.url) f.url = URL.createObjectURL(f.file);
    return { url: f.url };
  },
  async getLyric(track) {
    if (track.path) return { lrc: hooks.lyric ? await hooks.lyric(track.path) : '' };
    const f = files.get(track.id);
    if (!f) return { lrc: '' };
    return { lrc: f.lrc ? await f.lrc.text() : f.lyric || '' };
  },
  // 读取刚导入文件的标签，补全歌名、歌手、封面和内嵌歌词。onProgress(已完成, 总数)
  async readTags(ids, onProgress) {
    if (!hooks.readTags) return;
    const list = ids.filter(id => files.has(id));
    let done = 0, next = 0;
    const worker = async () => {
      while (next < list.length) {
        const f = files.get(list[next++]);
        try {
          const t = await hooks.readTags(f.file);
          if (t.title) f.title = t.title;
          if (t.artist) f.artist = t.artist;
          if (t.album) f.album = t.album;
          if (t.duration) f.duration = t.duration;
          if (t.cover) f.cover = t.cover;
          if (t.lyric) f.lyric = t.lyric;
        } catch { /* 读不了标签就用文件名 */ }
        onProgress?.(++done, list.length);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  },
  setDuration(id, d) { const f = files.get(id); if (f) f.duration = d; },
  // 返回新导入的歌曲 id 列表
  import(fileList) {
    const all = [...fileList];
    const lrcs = new Map(all.filter(f => /\.lrc$/i.test(f.name)).map(f => [baseName(f.name).toLowerCase(), f]));
    const ids = [];
    for (const f of all) {
      if (!(f.type.startsWith('audio/') || AUDIO_RE.test(f.name))) continue;
      const base = baseName(f.name);
      const id = 'f:' + (f.webkitRelativePath || f.name) + ':' + f.size;
      let artist = '未知歌手', title = base;
      const m = base.match(/^(.+?)\s+-\s+(.+)$/);
      if (m) { artist = m[1].trim(); title = m[2].trim(); }
      files.set(id, { file: f, lrc: lrcs.get(base.toLowerCase()), title, artist });
      ids.push(id);
    }
    return ids;
  }
};
