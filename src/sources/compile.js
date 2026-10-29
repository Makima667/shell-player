// 识别音源格式并编译成统一接口：
// { kind, name, version, description, canSearch, canUrl, lxKey?, lxKeys?, search(), getUrl() -> {url, headers?}, getLyric?() -> {lrc, trans}, importSheet?(url) -> [track] }
import { compileJson } from './json.js';
import { compileLx, looksLikeLx } from './lx.js';
import { runCommonJs, isMusicFreePlugin, adaptMusicFree, isSubscription } from './musicfree.js';
import { request } from '../core/http.js';
import { getPath, fill, parseDur, sleep, parseHeader } from '../core/util.js';

export class SubscriptionError extends Error {
  constructor(plugins) { super('这是一个 MusicFree 订阅，包含 ' + plugins.length + ' 个插件'); this.plugins = plugins; }
}

const scriptUtils = { getPath, fill, parseDur, sleep };

function adaptNative(obj, code) {
  const meta = parseHeader(code);
  return {
    kind: 'script',
    name: obj.name || meta.name || '未命名脚本源',
    version: obj.version || meta.version || '',
    author: obj.author || meta.author || '',
    description: obj.description || meta.description || '',
    id: obj.id || meta.id,
    canSearch: typeof obj.search === 'function',
    canUrl: typeof obj.getUrl === 'function',
    lxKey: obj.lxKey || null,
    async search(keyword, page = 1) {
      const r = await obj.search(keyword, page);
      return Array.isArray(r) ? { list: r, hasMore: false } : { list: (r && r.list) || [], hasMore: !!(r && r.hasMore) };
    },
    async getUrl(track, quality) {
      const r = await obj.getUrl(track, quality);
      if (!r) throw new Error('脚本没有返回播放地址');
      return typeof r === 'string' ? { url: r } : r;
    },
    importSheet: typeof obj.importSheet === 'function' ? async url => {
      const r = await obj.importSheet(url);
      return Array.isArray(r) ? r : (r && r.list) || [];
    } : undefined,
    getLyric: typeof obj.getLyric === 'function' ? async track => {
      const r = await obj.getLyric(track);
      return typeof r === 'string' ? { lrc: r } : { lrc: (r && (r.lrc || r.lyric)) || '', trans: (r && (r.trans || r.tlyric)) || '' };
    } : undefined
  };
}

export function detectKind(code) {
  const t = String(code).trim();
  if (t.startsWith('{')) return 'json';
  if (looksLikeLx(t)) return 'lx';
  return 'script';
}

// 某些播放器专用的“线路列表”：只写了接口函数名（searchApi / detailApi），没有地址也没有代码，别的播放器用不了
function lineConfig(cfg) {
  const lines = cfg && Array.isArray(cfg.lines) ? cfg.lines : null;
  if (!lines || !lines.some(l => l && typeof l === 'object' && (typeof l.searchApi === 'string' || typeof l.detailApi === 'string'))) return;
  const e = new Error(`这是某个播放器专用的线路列表（${lines.length} 条线路），里面只有接口名字，没有接口地址和代码，只能在它对应的那个播放器里用，这里导入不了。请换 MusicFree 插件（.js 或订阅链接）或洛雪自定义源（.js）。`);
  e.lineConfig = true;
  throw e;
}

/** @param {{ userVars?: () => object, onUpdateAlert?: Function, env?: string }} opts */
export async function compileSource(code, opts = {}) {
  const t = String(code || '').trim();
  if (!t) throw new Error('内容是空的');
  // 有的文件在 JSON 前面加了一段 /* @name … */ 注释
  const body = t.replace(/^(\s*(\/\*[\s\S]*?\*\/|\/\/[^\n]*))+\s*/, '');
  if (body !== t && body.startsWith('{')) { try { lineConfig(JSON.parse(body)); } catch (e) { if (e.lineConfig) throw e; } }
  if (t.startsWith('{')) {
    let cfg;
    try { cfg = JSON.parse(t); } catch (e) { throw new Error('JSON 格式不正确：' + e.message); }
    if (isSubscription(cfg)) throw new SubscriptionError(cfg.plugins);
    lineConfig(cfg);
    return compileJson(cfg);
  }
  if (looksLikeLx(t)) return compileLx(t, opts);
  let obj;
  try {
    obj = await runCommonJs(t, { userVars: opts.userVars, globals: { request, utils: scriptUtils } });
  } catch (e) {
    if (/unsafe-eval|Content Security Policy|EvalError/i.test(String(e))) throw new Error('当前运行环境禁止执行脚本。请改用 JSON 配置源，或使用桌面 / 安卓版。');
    throw new Error('脚本执行出错：' + e.message);
  }
  if (isMusicFreePlugin(obj)) return adaptMusicFree(obj, { userVars: opts.userVars });
  if (obj && (typeof obj.search === 'function' || typeof obj.getUrl === 'function')) return adaptNative(obj, t);
  throw new Error('认不出这个音源的格式。支持：JSON 配置、空壳脚本（导出 search / getUrl）、MusicFree 插件、洛雪自定义源。');
}
