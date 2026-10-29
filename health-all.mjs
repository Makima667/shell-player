// 用应用自己的音源运行时批量体检仓库里的全部插件（并发 4，逐个限时）。
import fs from 'node:fs';
import path from 'node:path';
import { compileSource } from './src/sources/compile.js';

const DIR = 'C:/Users/q1763/Documents/shell-player/sources/musicfree/plugins';
const KEYWORD = process.argv[2] || '起风了';
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.js')).sort();

const withTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} 超过 ${ms / 1000}s`)), ms)),
]);

async function check(file) {
  const slug = file.replace(/\.js$/, '');
  const row = { slug, platform: '', version: '', keyword: KEYWORD, search: null, url: null, play: null, verdict: '' };
  const t0 = Date.now();
  try {
    const src = await withTimeout(compileSource(fs.readFileSync(path.join(DIR, file), 'utf8'), { env: 'desktop' }), 8000, '编译');
    row.platform = src.name || '';
    row.version = src.version || '';
    if (!src.canSearch) { row.verdict = 'no-search'; return row; }

    const s0 = Date.now();
    let res;
    try {
      res = await withTimeout(src.search(KEYWORD, 1), 12000, '搜索');
    } catch (e) {
      row.search = { ok: false, ms: Date.now() - s0, err: String(e.message).slice(0, 90) };
      row.verdict = 'down';
      return row;
    }
    const list = res?.list || [];
    row.search = { ok: true, ms: Date.now() - s0, count: list.length };
    if (!list.length) { row.verdict = 'empty'; return row; }

    const first = list[0];
    row.sample = `${first.title} / ${first.artist}`;
    if (!src.canUrl) { row.verdict = 'no-url-api'; return row; }

    const u0 = Date.now();
    let got;
    try {
      got = await withTimeout(src.getUrl(first, 'high'), 12000, '取地址');
    } catch (e) {
      row.url = { ok: false, ms: Date.now() - u0, err: String(e.message).slice(0, 90) };
      row.verdict = 'no-url';
      return row;
    }
    row.url = { ok: !!got?.url, ms: Date.now() - u0, quality: got?.quality || '' };
    if (!got?.url) { row.verdict = 'no-url'; return row; }

    const p0 = Date.now();
    try {
      const r = await withTimeout(fetch(got.url, { headers: { Range: 'bytes=0-1023', Referer: 'https://y.qq.com/', 'User-Agent': 'Mozilla/5.0 Chrome/126.0' } }), 10000, '播放');
      row.play = { ok: r.status === 206 || r.status === 200, status: r.status, type: r.headers.get('content-type'), ms: Date.now() - p0 };
      row.verdict = row.play.ok ? 'ok' : 'unplayable';
    } catch (e) {
      row.play = { ok: false, ms: Date.now() - p0, err: String(e.message).slice(0, 60) };
      row.verdict = 'unplayable';
    }
    return row;
  } catch (e) {
    row.verdict = 'broken';
    row.error = String(e.message).slice(0, 90);
    return row;
  } finally {
    row.totalMs = Date.now() - t0;
  }
}

const rows = [];
const queue = [...files];
const workers = Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const f = queue.shift();
    const r = await check(f);
    rows.push(r);
    const mark = { ok: '✔', unplayable: '✖', 'no-url': '✖', down: '✖', empty: '·', broken: '✖', 'no-search': '·', 'no-url-api': '·' }[r.verdict] || '?';
    console.log(`${mark} ${r.slug.padEnd(17)} ${String(r.platform).padEnd(11)} ${r.verdict.padEnd(10)} ${r.search ? (r.search.ok ? `${r.search.ms}ms/${r.search.count}条` : `搜索✖${r.search.err}`) : ''} ${r.url ? (r.url.ok ? `地址${r.url.ms}ms${r.url.quality}` : `地址✖${r.url.err}`) : ''} ${r.play?.ok ? '播放' + r.play.status : ''}`);
  }
});
await Promise.all(workers);

rows.sort((a, b) => a.slug.localeCompare(b.slug));
const summary = rows.reduce((a, r) => { a[r.verdict] = (a[r.verdict] || 0) + 1; return a; }, {});
const out = { checkedAt: new Date().toISOString(), keyword: KEYWORD, runtime: 'shell-player app (compileSource)', summary, results: rows };
fs.writeFileSync('C:/Users/q1763/Documents/shell-player/sources/health.json', JSON.stringify(out, null, 2) + '\n');
console.log('\n汇总:', JSON.stringify(summary));
