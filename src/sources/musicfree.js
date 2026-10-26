// MusicFree 插件适配：https://musicfree.catcat.work/plugin/introduction.html
import { loadShims } from './shims.js';
import { lxKeyOf } from './platforms.js';
import { http } from '../core/http.js';
import { parseDur } from '../core/util.js';

const QUALITY = { '128k': 'standard', '320k': 'high', flac: 'super', hires: 'super' };
const FALLBACK = ['super', 'high', 'standard', 'low'];

export function looksLikeMusicFree(code) {
  return /module\.exports|exports\.\w+\s*=/.test(code) && /getMediaSource|platform\s*:/.test(code);
}

// 执行 CommonJS 代码。userVars 由界面上的"插件设置"维护
export async function runCommonJs(code, { userVars = () => ({}), globals = {} } = {}) {
  const { modules, Buffer } = await loadShims();
  const module = { exports: {} };
  const require = name => {
    const key = String(name).replace(/^node:/, '');
    if (key in modules && modules[key]) return modules[key];
    throw new Error(`插件依赖的模块「${name}」不受支持`);
  };
  const env = { getUserVariables: () => userVars() || {}, appVersion: '0.5.0', os: 'android', lang: 'zh-CN', userVariables: {} };
  const process = { platform: 'android', env: { ...env } };
  const names = ['module', 'exports', 'require', 'env', 'process', 'Buffer', ...Object.keys(globals)];
  const fn = new Function(...names, code + '\n;return module.exports;');
  let out = fn(module, module.exports, require, env, process, Buffer, ...Object.values(globals));
  if (out && out.default && !out.platform && !out.search && !out.getUrl) out = out.default;
  if (out && typeof out.then === 'function') out = await out;
  return out && typeof out === 'object' ? out : module.exports;
}

export function isMusicFreePlugin(obj) {
  return !!obj && typeof obj === 'object' && typeof obj.platform === 'string' && (typeof obj.search === 'function' || typeof obj.getMediaSource === 'function');
}

const toTrack = (it, platform) => ({
  id: String(it.id ?? it.songmid ?? it.hash ?? it.title),
  title: it.title || it.name || '未知歌曲',
  artist: it.artist || it.singer || '未知歌手',
  album: it.album || '',
  duration: parseDur(it.duration),
  cover: it.artwork || it.cover || '',
  lyric: it.rawLrc || undefined,
  lxKey: lxKeyOf(platform),
  mf: it
});

export function adaptMusicFree(plugin, { userVars } = {}) {
  const platform = plugin.platform;
  const itemOf = track => ({ ...(track.mf || {}), id: track.mf?.id ?? track.id, platform });
  const src = {
    kind: 'musicfree',
    name: platform,
    version: plugin.version || '',
    author: plugin.author || '',
    description: plugin.description || `MusicFree 插件${plugin.author ? ' · 作者 ' + plugin.author : ''}`,
    homepage: plugin.srcUrl || '',
    id: 'mf:' + platform,
    userVariables: Array.isArray(plugin.userVariables) ? plugin.userVariables : [],
    canSearch: typeof plugin.search === 'function' && (!plugin.supportedSearchType || plugin.supportedSearchType.includes('music')),
    canUrl: typeof plugin.getMediaSource === 'function',
    lxKey: lxKeyOf(platform),
    async search(keyword, page = 1) {
      if (!src.canSearch) return { list: [], hasMore: false };
      const r = await plugin.search(keyword, page, 'music');
      const data = (r && r.data) || [];
      return { list: data.map(it => toTrack(it, platform)), hasMore: r ? !r.isEnd : false };
    },
    async getUrl(track, quality) {
      const item = itemOf(track);
      if (!src.canUrl) {
        if (item.url) return { url: item.url };
        throw new Error('插件不提供播放地址');
      }
      const want = QUALITY[quality] || 'standard';
      const order = [want, ...FALLBACK.filter(q => q !== want)];
      let lastErr;
      for (const q of order) {
        try {
          const r = await plugin.getMediaSource(item, q);
          if (r && r.url) {
            const headers = { ...(r.headers || {}) };
            if (r.userAgent) headers['User-Agent'] = r.userAgent;
            return { url: r.url, headers, quality: q };
          }
        } catch (e) { lastErr = e; }
      }
      if (item.url) return { url: item.url };
      throw lastErr || new Error('插件没有返回播放地址');
    }
  };
  if (typeof plugin.getLyric === 'function') {
    src.getLyric = async track => {
      const r = await plugin.getLyric(itemOf(track));
      if (!r) return { lrc: '' };
      let lrc = r.rawLrc || '';
      if (!lrc && r.lrc) {
        try { lrc = (await http(r.lrc, { responseType: 'text' })).data; } catch { /* 忽略 */ }
      }
      return { lrc, trans: r.translation || '' };
    };
  }
  return src;
}

// MusicFree 订阅格式：{ "plugins": [{ "name", "url", "version" }] }
export function isSubscription(obj) {
  return !!obj && Array.isArray(obj.plugins) && obj.plugins.every(p => p && typeof p.url === 'string');
}
