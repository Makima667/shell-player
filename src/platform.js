// 平台差异集中在这里：网页 / 桌面（Tauri）/ 安卓（Tauri）
import { setFetch, http } from './core/http.js';
import { safeFileName } from './core/util.js';

export const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
let os = 'web';

export async function initPlatform() {
  if (!isTauri) return;
  try { os = (await import('@tauri-apps/plugin-os')).platform(); } catch { os = 'desktop'; }
  const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
  setFetch(tauriFetch);
}

export const platformName = () => os;
export const isMobile = () => os === 'android' || os === 'ios';
export const isDesktopApp = () => isTauri && !isMobile();
export const canRunScripts = () => {
  try { new Function('return 1')(); return true; } catch { return false; }
};

/* ---------- 下载 ---------- */
async function saveDir() {
  const path = await import('@tauri-apps/api/path');
  const fs = await import('@tauri-apps/plugin-fs');
  const candidates = [];
  try { candidates.push(await path.join(await path.downloadDir(), 'ShellPlayer')); } catch { /* 不支持 */ }
  try { candidates.push(await path.join(await path.appLocalDataDir(), 'downloads')); } catch { /* 不支持 */ }
  for (const dir of candidates) {
    try {
      if (!(await fs.exists(dir))) await fs.mkdir(dir, { recursive: true });
      return dir;
    } catch { /* 换下一个目录 */ }
  }
  throw new Error('找不到可以写入的下载目录');
}

const extOf = (url, contentType) => {
  const m = String(url).split('?')[0].match(/\.(mp3|flac|m4a|aac|ogg|opus|wav|ape)$/i);
  if (m) return m[1].toLowerCase();
  if (/flac/.test(contentType)) return 'flac';
  if (/mp4|m4a|aac/.test(contentType)) return 'm4a';
  if (/ogg/.test(contentType)) return 'ogg';
  if (/wav/.test(contentType)) return 'wav';
  return 'mp3';
};

/** 下载歌曲（和歌词）。返回保存位置的说明 */
export async function downloadTrack({ url, headers, track, lrc }) {
  const base = safeFileName(`${track.artist} - ${track.title}`);
  if (isTauri) {
    const fs = await import('@tauri-apps/plugin-fs');
    const path = await import('@tauri-apps/api/path');
    const res = await http(url, { headers, responseType: 'arraybuffer', timeout: 10 * 60 * 1000 });
    if (!res.ok) throw new Error('下载失败：HTTP ' + res.status);
    const dir = await saveDir();
    const file = await path.join(dir, `${base}.${extOf(url, res.headers['content-type'] || '')}`);
    await fs.writeFile(file, new Uint8Array(res.data));
    if (lrc) await fs.writeTextFile(await path.join(dir, base + '.lrc'), lrc);
    return { path: file, dir };
  }
  // 网页版：能跨域读取就保存为文件，否则在新标签页打开
  try {
    const res = await http(url, { responseType: 'arraybuffer', timeout: 10 * 60 * 1000 });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blobUrl = URL.createObjectURL(new Blob([res.data]));
    const a = Object.assign(document.createElement('a'), { href: blobUrl, download: `${base}.${extOf(url, res.headers['content-type'] || '')}` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    if (lrc) {
      const l = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([lrc], { type: 'text/plain' })), download: base + '.lrc' });
      document.body.append(l); l.click(); l.remove();
    }
    return { path: '浏览器下载目录' };
  } catch {
    window.open(url, '_blank', 'noopener');
    return { path: '已在新标签页打开，请右键另存为', opened: true };
  }
}

export async function fileSrc(p) {
  if (!isTauri) return p;
  const { convertFileSrc } = await import('@tauri-apps/api/core');
  return convertFileSrc(p);
}

export async function listDownloads() {
  if (!isTauri) return [];
  const fs = await import('@tauri-apps/plugin-fs');
  const path = await import('@tauri-apps/api/path');
  try {
    const dir = await saveDir();
    const entries = await fs.readDir(dir);
    const out = [];
    for (const e of entries) if (e.isFile && /\.(mp3|flac|m4a|aac|ogg|opus|wav|ape)$/i.test(e.name)) out.push({ name: e.name, path: await path.join(dir, e.name), dir });
    return out;
  } catch { return []; }
}

export async function readTextFile(p) {
  const fs = await import('@tauri-apps/plugin-fs');
  return fs.readTextFile(p);
}

/* ---------- 桌面歌词（只在桌面版） ---------- */
let lyricWin;
async function getLyricWin() {
  if (!isDesktopApp()) return null;
  if (!lyricWin) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    lyricWin = await WebviewWindow.getByLabel('lyrics');
  }
  return lyricWin;
}
export const desktopLyrics = {
  available: () => isDesktopApp(),
  async show(on) { const w = await getLyricWin(); if (w) on ? await w.show() : await w.hide(); },
  async lock(on) { const w = await getLyricWin(); if (w) await w.setIgnoreCursorEvents(on); },
  async send(payload) {
    if (!isDesktopApp()) return;
    const { emitTo } = await import('@tauri-apps/api/event');
    await emitTo('lyrics', 'lyric', payload);
  },
  async onControl(cb) {
    if (!isDesktopApp()) return;
    const { listen } = await import('@tauri-apps/api/event');
    await listen('lyric-control', e => cb(e.payload));
  }
};

/* ---------- 系统媒体控制 ---------- */
// 桌面：WebView 自带的 Media Session（Windows 媒体浮层、macOS 正在播放、Linux MPRIS）
// 安卓：自写插件，前台服务 + 通知栏控制，保证锁屏/后台继续播放
export const nativeMedia = {
  async update(state) {
    if (os !== 'android') return;
    const { invoke } = await import('@tauri-apps/api/core');
    try { await invoke('plugin:media-session|update', state); } catch (e) { console.warn('[media-session]', e); }
  },
  async stop() {
    if (os !== 'android') return;
    const { invoke } = await import('@tauri-apps/api/core');
    try { await invoke('plugin:media-session|stop'); } catch { /* 忽略 */ }
  },
  async onAction(cb) {
    if (os !== 'android') return;
    const { addPluginListener } = await import('@tauri-apps/api/core');
    try { await addPluginListener('media-session', 'action', e => cb(e)); } catch (e) { console.warn('[media-session]', e); }
  }
};
