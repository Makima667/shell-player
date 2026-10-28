// 通用小工具，不依赖 DOM，方便在 node 测试里直接引用

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmt = s => {
  if (!isFinite(s) || s <= 0) return '--:--';
  s = Math.floor(s);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

export const getPath = (o, p) => (p == null || p === '')
  ? o
  : String(p).split('.').reduce((a, k) => a == null ? undefined : a[k], o);

export const parseDur = v => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\d+:\d{1,2}(:\d{1,2})?$/.test(v)) return v.split(':').reduce((a, x) => a * 60 + +x, 0);
  return Number(v) || 0;
};

export const toInterval = s => {
  s = Math.max(0, Math.round(s || 0));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

// {name} 模板替换：rawKeys 里的变量原样替换，其余做 URL 编码
export function fill(tpl, vars, rawKeys = new Set(), enc = true) {
  return String(tpl).replace(/\{([\w.\-]+)\}/g, (_, k) => {
    const v = getPath(vars, k);
    if (v == null) return '';
    return (!enc || rawKeys.has(k.split('.')[0])) ? String(v) : encodeURIComponent(v);
  });
}

export function hue(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.codePointAt(0)) % 360;
  return h;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function withTimeout(p, ms, msg) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg || '超时')), ms); })]).finally(() => clearTimeout(t));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const safeFileName = s => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'untitled';

// 解析脚本开头的 /** @name xxx */ 注释
export function parseHeader(code) {
  const meta = {};
  const m = String(code).match(/^\s*\/\*[*!]?([\s\S]*?)\*\//);
  if (m) for (const line of m[1].split('\n')) {
    const r = line.match(/@(\w+)\s+(.+)/);
    if (r) meta[r[1]] = r[2].trim();
  }
  return meta;
}
