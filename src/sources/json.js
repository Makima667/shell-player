// JSON 配置源：不用写代码，把一个返回 JSON 的接口映射成音源
import { http } from '../core/http.js';
import { fill, getPath, parseDur } from '../core/util.js';

export function compileJson(cfg) {
  if (!cfg.search || !cfg.search.url) throw new Error('JSON 配置缺少 search.url');
  if (!cfg.url || !(cfg.url.url || cfg.url.template)) throw new Error('JSON 配置缺少 url.url 或 url.template（告诉播放器怎么拿到播放地址）');
  const V = cfg.vars || {}, rawKeys = new Set(Object.keys(V)), H = cfg.headers || {};

  const call = async (c, vars) => {
    const url = fill(c.url, vars, rawKeys);
    const body = c.body != null ? fill(typeof c.body === 'string' ? c.body : JSON.stringify(c.body), vars, rawKeys, false) : undefined;
    const headers = { ...H, ...(c.headers || {}) };
    if (body && !Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
    const res = await http(url, { method: c.method || (body ? 'POST' : 'GET'), headers, body, responseType: c.type === 'text' ? 'text' : 'json' });
    if (!res.ok) throw new Error('接口返回 HTTP ' + res.status);
    return res.data;
  };

  const src = {
    kind: 'json',
    name: cfg.name || '未命名 JSON 源',
    version: cfg.version || '',
    description: cfg.description || '',
    author: cfg.author || '',
    id: cfg.id,
    canSearch: true,
    canUrl: true,
    lxKey: cfg.lxKey || null,
    async search(keyword, page = 1) {
      const s = cfg.search, pageSize = s.pageSize || 30;
      const res = await call(s, { ...V, keyword, page, pageSize, offset: (page - 1) * pageSize });
      const arr = getPath(res, s.list);
      if (!Array.isArray(arr)) throw new Error(`search.list「${s.list || '(根)'}」没有指向一个数组，请检查接口返回结构`);
      const f = s.fields || {};
      const list = arr.map(it => {
        const o = { raw: it };
        for (const k of ['id', 'title', 'artist', 'album', 'duration', 'cover', 'lyric']) {
          let v = getPath(it, f[k] ?? k);
          if (Array.isArray(v)) v = v.map(a => (a && typeof a === 'object') ? (a.name ?? a.title ?? '') : a).join(' / ');
          o[k] = v;
        }
        o.duration = parseDur(o.duration);
        if (s.durationUnit === 'ms') o.duration /= 1000;
        if (s.coverTemplate) o.cover = fill(s.coverTemplate, { ...V, ...it }, rawKeys);
        if (cfg.lxKey) o.lxKey = cfg.lxKey;
        return o;
      });
      const total = s.total ? Number(getPath(res, s.total)) : NaN;
      return { list, hasMore: isFinite(total) ? page * pageSize < total : list.length >= pageSize };
    },
    async getUrl(track, quality) {
      const u = cfg.url, vars = { ...V, ...track, quality };
      if (u.template) return { url: fill(u.template, vars, rawKeys) };
      const res = await call(u, vars);
      const url = typeof res === 'string' ? res.trim() : getPath(res, u.path);
      if (!url) throw new Error('接口没有返回播放地址（url.path 是否写对？）');
      return { url };
    }
  };
  if (cfg.lyric && (cfg.lyric.url || cfg.lyric.template)) {
    src.getLyric = async track => {
      const l = cfg.lyric, vars = { ...V, ...track };
      const res = await call(l, vars);
      return { lrc: typeof res === 'string' ? res : (getPath(res, l.path) || ''), trans: l.transPath ? getPath(res, l.transPath) : '' };
    };
  }
  return src;
}
