// 音源质量体检：把 sources/musicfree/plugins 里每个插件真跑一遍——
// 编译 → 搜索 → 取第一条的播放地址 → 用 Range 请求确认真的能播。
// 结果写进 sources/health.json（带时间戳，所以不参与 build 的确定性校验）。
//
//   node scripts/health.mjs            体检全部
//   node scripts/health.mjs --kw 晴天   换关键词
//   node scripts/health.mjs wy qq      只体检 slug 里包含这些词的插件
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { ROOT, MF_DIR, listFiles } from './lib.mjs';

const nodeRequire = createRequire(import.meta.url);
// 插件常用到的 npm 包：仓库里装了就直接给真包，没装就退化成下面的最小实现
const OPTIONAL = ['crypto-js', 'cheerio', 'he', 'dayjs', 'big-integer', 'pako', 'qs', 'buffer'];
const realModules = {};
for (const name of OPTIONAL) {
  try { realModules[name] = nodeRequire(name); } catch { /* 没装就算了 */ }
}

const args = process.argv.slice(2);
const kwIdx = args.indexOf('--kw');
const KEYWORD = kwIdx >= 0 ? args[kwIdx + 1] : '起风了';
const FILTERS = args.filter((a, i) => !a.startsWith('--') && i !== kwIdx + 1);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/* ---------- 最小宿主：只提供插件真正会用到的东西 ---------- */
function makeAxios() {
  const build = (defaults = {}) => {
    const call = async (method, url, body, cfg = {}) => {
      const opts = { ...defaults, ...cfg };
      const target = new URL(url, opts.baseURL);
      if (opts.params) for (const [k, v] of Object.entries(opts.params)) target.searchParams.set(k, v);
      const headers = { 'User-Agent': UA, ...(opts.headers || {}) };
      let payload;
      if (body !== undefined && body !== null) {
        if (typeof body === 'string') payload = body;
        else { payload = JSON.stringify(body); headers['Content-Type'] = headers['Content-Type'] || 'application/json'; }
      }
      const res = await fetch(target, { method: method.toUpperCase(), headers, body: payload });
      const text = await res.text();
      let data = text;
      try { data = JSON.parse(text); } catch { /* 保留文本 */ }
      return { status: res.status, data, headers: Object.fromEntries(res.headers) };
    };
    const inst = {
      get: (u, cfg) => call('GET', u, undefined, cfg),
      post: (u, b, cfg) => call('POST', u, b, cfg),
      request: (cfg) => call(cfg.method || 'GET', cfg.url, cfg.data, cfg),
      defaults,
    };
    return inst;
  };
  const axios = build();
  axios.create = (cfg) => build(cfg);
  return axios;
}

const qs = {
  stringify: (o) => new URLSearchParams(Object.entries(o || {}).flatMap(([k, v]) => (Array.isArray(v) ? v.map(x => [k, x]) : [[k, v]]))).toString(),
  parse: (s) => Object.fromEntries(new URLSearchParams(s)),
};

function loadPlugin(file) {
  const code = fs.readFileSync(file, 'utf8');
  const module = { exports: {} };
  const sandbox = {
    module, exports: module.exports,
    require: (name) => {
      if (realModules[name]) return realModules[name].default ?? realModules[name];
      if (name === 'axios') return makeAxios();
      if (name === 'qs') return qs;
      if (name === 'buffer') return { Buffer };
      throw new Error(`依赖「${name}」未提供（体检跳过）`);
    },
    console: { log() {}, warn() {}, error() {}, info() {} },
    Buffer, URL, URLSearchParams, TextEncoder, TextDecoder,
    setTimeout, clearTimeout, setInterval, clearInterval,
    env: { getUserVariables: () => ({}), userVariables: {}, os: 'desktop', appVersion: 'health' },
    process: { platform: 'desktop', env: {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file, timeout: 8000 });
  let exp = module.exports;
  if (exp && exp.default && !exp.platform && !exp.search) exp = exp.default;
  return exp;
}

const timed = async (fn, ms = 15000) => {
  const t = Date.now();
  let timer;
  try {
    const v = await Promise.race([fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('超过 ' + Math.round(ms / 1000) + ' 秒没有响应')), ms); })]);
    return { ok: true, v, ms: Date.now() - t };
  } catch (e) {
    return { ok: false, err: e?.message || String(e), ms: Date.now() - t };
  } finally { clearTimeout(timer); }
};

const files = listFiles(MF_DIR).filter(f => !FILTERS.length || FILTERS.some(k => f.includes(k)));
const rows = [];

for (const file of files) {
  const slug = file.replace(/\.js$/, '');
  const row = { slug, platform: '', version: '', keyword: KEYWORD, search: null, url: null, play: null, verdict: '' };
  let plugin;
  try { plugin = loadPlugin(path.join(MF_DIR, file)); }
  catch (e) { row.verdict = 'skip'; row.error = e.message; rows.push(row); continue; }

  row.platform = plugin.platform || '';
  row.version = plugin.version || '';
  if (typeof plugin.search !== 'function') { row.verdict = 'skip'; row.error = '没有 search'; rows.push(row); continue; }

  const s = await timed(() => plugin.search(KEYWORD, 1));
  row.search = s.ok ? { ok: true, ms: s.ms, count: (s.v?.data || s.v?.list || []).length } : { ok: false, ms: s.ms, err: s.err };
  if (!s.ok) { row.verdict = 'down'; rows.push(row); continue; }

  const list = s.v?.data || s.v?.list || [];
  const first = list[0];
  if (!first) { row.verdict = 'empty'; rows.push(row); continue; }
  row.sample = `${first.title} / ${first.artist}`;

  if (typeof plugin.getMediaSource !== 'function') { row.verdict = 'no-url-api'; rows.push(row); continue; }
  const u = await timed(() => plugin.getMediaSource(first, 'high'));
  if (!u.ok || !u.v?.url) {
    row.url = { ok: false, ms: u.ms, err: u.err || '没有返回地址' };
    row.verdict = 'no-url';
    rows.push(row);
    continue;
  }
  row.url = { ok: true, ms: u.ms, quality: u.v.quality || '' };

  const p = await timed(async () => {
    const r = await fetch(u.v.url, { headers: { 'User-Agent': UA, Range: 'bytes=0-1023', Referer: 'https://y.qq.com/' } });
    return { status: r.status, type: r.headers.get('content-type') };
  }, 20000);
  row.play = p.ok ? { ok: p.v.status === 206 || p.v.status === 200, status: p.v.status, type: p.v.type, ms: p.ms } : { ok: false, ms: p.ms, err: p.err };
  row.verdict = row.play.ok ? 'ok' : 'unplayable';
  rows.push(row);
}

const summary = rows.reduce((a, r) => { a[r.verdict] = (a[r.verdict] || 0) + 1; return a; }, {});
const out = { checkedAt: new Date().toISOString(), keyword: KEYWORD, summary, results: rows };
fs.writeFileSync(path.join(ROOT, 'sources/health.json'), JSON.stringify(out, null, 2) + '\n');

for (const r of rows) {
  const mark = { ok: '✔', unplayable: '✖', 'no-url': '✖', down: '✖', empty: '·', skip: '·', 'no-url-api': '·' }[r.verdict] || '?';
  const parts = [
    `${mark} ${r.slug.padEnd(18)}`,
    String(r.platform).padEnd(10),
  ];
  if (r.search) parts.push(r.search.ok ? `搜索 ${r.search.ms}ms/${r.search.count}条` : `搜索✖ ${String(r.search.err).slice(0, 30)}`);
  if (r.url) parts.push(r.url.ok ? `地址 ${r.url.ms}ms ${r.url.quality}` : `地址✖ ${String(r.url.err).slice(0, 34)}`);
  if (r.play) parts.push(r.play.ok ? `播放 ${r.play.status}` : `播放✖ ${r.play.status || String(r.play.err).slice(0, 20)}`);
  if (r.error) parts.push(r.error.slice(0, 30));
  console.log(parts.join('  '));
}
console.log('\n汇总:', JSON.stringify(summary));
console.log('已写入 sources/health.json');
