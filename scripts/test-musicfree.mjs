#!/usr/bin/env node
// MusicFree 插件体检：用播放器自己的插件运行环境（src/sources/musicfree.js + shims），
// 逐个检查「能否加载 → 能否搜索 → 能否拿到播放地址 → 地址能否真的出声 → 有没有歌词」。
//
// 用法：
//   node scripts/test-musicfree.mjs                         # 测内置的 MusicFree 插件
//   node scripts/test-musicfree.mjs 目录/ 文件.js 订阅URL     # 测指定的插件（可混用）
//   选项：--keyword 晴天  --quality 320k  --tracks 2  --parallel 3  --md 报告.md  --json 报告.json
//
// 注意：网络环境会影响结果。海外机器（例如 GitHub Actions）上，很多国内平台会拒绝给播放地址，
// 这类失败不代表插件在国内用不了。
import { readFile, readdir, stat, writeFile, appendFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommonJs, adaptMusicFree, isMusicFreePlugin, isSubscription } from '../src/sources/musicfree.js';
import { setFetch, nativeLikeFetch, BROWSER_UA } from '../src/core/http.js';

// 和 App 里一样的默认请求头（Node 本来就不带 Origin）
setFetch(nativeLikeFetch(globalThis.fetch, { dropOrigin: false }));

const args = process.argv.slice(2);
const opt = { keyword: '晴天', quality: '320k', tracks: 2, md: '', json: '', timeout: 20000, parallel: 3 };
const targets = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  else targets.push(a);
}
opt.tracks = Number(opt.tracks) || 2;
if (!targets.length) targets.push(fileURLToPath(new URL('../src/sources/bundled/musicfree/', import.meta.url)));

const withTimeout = (p, ms, what) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + '超时')), ms))
]);
const errText = e => String(e?.message || e).replace(/\s+/g, ' ').slice(0, 140);

async function getText(url) {
  const r = await withTimeout(fetch(url), opt.timeout, '下载');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

// 收集要测的插件：{ name, code } 或 { name, error }
async function collect(target) {
  if (/^https?:/i.test(target)) {
    const text = await getText(target);
    let obj = null;
    try { obj = JSON.parse(text); } catch { /* 不是订阅，是插件本身 */ }
    if (obj && isSubscription(obj)) {
      const out = [];
      for (const p of obj.plugins) {
        try { out.push({ name: p.name || basename(p.url), code: await getText(p.url) }); }
        catch (e) { out.push({ name: p.name || basename(p.url), error: '下载失败：' + errText(e) }); }
      }
      return out;
    }
    return [{ name: basename(new URL(target).pathname), code: text }];
  }
  const s = await stat(target);
  if (s.isDirectory()) {
    const files = (await readdir(target)).filter(f => f.endsWith('.js')).sort();
    return Promise.all(files.map(async f => ({ name: f.replace(/\.js$/, ''), code: await readFile(join(target, f), 'utf8') })));
  }
  return [{ name: basename(target).replace(/\.js$/, ''), code: await readFile(target, 'utf8') }];
}

const MAGIC = [
  [b => b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33, 'mp3'],
  [b => b[0] === 0xff && (b[1] & 0xe0) === 0xe0, 'mp3/aac'],
  [b => b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43, 'flac'],
  [b => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70, 'm4a'],
  [b => b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53, 'ogg'],
  [b => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46, 'wav'],
  [b => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3, 'webm']
];

// 只取开头一小段，看服务器是不是真的回了音频
async function probe(url, headers = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opt.timeout);
  try {
    // 真正播放时是 audio 元素去拉，带的是浏览器 UA
    const r = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, ...headers, Range: 'bytes=0-4095' }, signal: ctl.signal, redirect: 'follow' });
    const type = r.headers.get('content-type') || '';
    const reader = r.body?.getReader();
    let buf = new Uint8Array(0);
    while (reader && buf.length < 16) {
      const { value, done } = await reader.read();
      if (done) break;
      const n = new Uint8Array(buf.length + value.length); n.set(buf); n.set(value, buf.length); buf = n;
    }
    reader?.cancel().catch(() => {});
    const fmt = MAGIC.find(([f]) => buf.length >= 8 && f(buf))?.[1];
    const total = (r.headers.get('content-range') || '').split('/')[1] || r.headers.get('content-length') || '';
    const ok = (r.status === 200 || r.status === 206) && (!!fmt || /^audio\//i.test(type));
    if (/\.m3u8(\?|$)/i.test(url) || /mpegurl/i.test(type)) return { ok: r.ok, note: 'HLS 流' };
    return { ok, note: ok ? `${fmt || type}${total ? ' · ' + (Number(total) / 1048576).toFixed(1) + 'MB' : ''}` : `HTTP ${r.status} ${type}`.trim() };
  } catch (e) {
    return { ok: false, note: errText(e) };
  } finally { clearTimeout(timer); }
}

async function check({ name, code, error }) {
  const row = { name, platform: '', version: '', load: '', search: '', url: '', play: '', lyric: '', notes: [] };
  if (error) { row.load = '✗'; row.notes.push(error); return row; }
  const t0 = Date.now();
  let plugin;
  try {
    plugin = await withTimeout(runCommonJs(code), opt.timeout, '加载');
    if (!isMusicFreePlugin(plugin)) throw new Error('不是 MusicFree 插件（缺 platform 或 search/getMediaSource）');
  } catch (e) { row.load = '✗'; row.notes.push('加载：' + errText(e)); return row; }
  const src = adaptMusicFree(plugin);
  row.platform = plugin.platform; row.version = plugin.version || '';
  row.load = `✓ ${Date.now() - t0}ms`;

  if (!src.canSearch) { row.search = '—'; row.notes.push('插件不支持搜索单曲，没法单独测取地址'); return row; }
  let list = [];
  try {
    const t1 = Date.now();
    list = (await withTimeout(src.search(opt.keyword, 1), opt.timeout, '搜索')).list;
    row.search = list.length ? `✓ ${list.length} 首 · ${Date.now() - t1}ms` : '✗ 0 首';
    if (!list.length) { row.notes.push('搜索没有结果'); return row; }
  } catch (e) { row.search = '✗'; row.notes.push('搜索：' + errText(e)); return row; }

  if (!src.canUrl) row.notes.push('插件不提供播放地址（要靠洛雪源或其他插件取地址）');
  let got = 0, played = 0;
  const why = new Set();
  const quality = new Set();
  for (const t of list.slice(0, opt.tracks)) {
    try {
      const r = await withTimeout(src.getUrl(t, opt.quality), opt.timeout, '取地址');
      got++;
      if (r.quality) quality.add(r.quality);
      const p = await probe(r.url, r.headers);
      if (p.ok) played++; else why.add('出声：' + p.note);
      if (p.ok && !row.sample) row.sample = p.note;
    } catch (e) { why.add('取地址：' + errText(e)); }
  }
  const n = Math.min(opt.tracks, list.length);
  row.url = src.canUrl || got ? `${got ? '✓' : '✗'} ${got}/${n}${quality.size ? ' · ' + [...quality].join('/') : ''}` : '—';
  row.play = got ? `${played ? '✓' : '✗'} ${played}/${got}${row.sample ? ' · ' + row.sample : ''}` : '—';
  row.notes.push(...why);

  if (src.getLyric) {
    try {
      const r = await withTimeout(src.getLyric(list[0]), opt.timeout, '歌词');
      const lines = (r.lrc || '').split('\n').filter(l => /\[\d+:\d+/.test(l)).length;
      row.lyric = lines ? `✓ ${lines} 行${r.trans ? ' + 翻译' : ''}` : '✗ 空';
    } catch (e) { row.lyric = '✗'; row.notes.push('歌词：' + errText(e)); }
  } else row.lyric = '—';
  return row;
}

const plugins = [];
for (const t of targets) {
  try { plugins.push(...await collect(t)); }
  catch (e) { plugins.push({ name: t, error: '读取失败：' + errText(e) }); }
}

// 插件之间互不影响，并发跑，结果按原顺序输出
const rows = new Array(plugins.length);
let next = 0;
await Promise.all(Array.from({ length: Math.max(1, Number(opt.parallel) || 3) }, async () => {
  while (next < plugins.length) {
    const i = next++;
    const row = rows[i] = await check(plugins[i]);
    console.error(`${row.play.startsWith('✓') ? '✓' : row.load.startsWith('✓') ? '·' : '✗'} ${row.name}`);
  }
}));

const cell = s => String(s || '').replace(/\|/g, '\\|');
const usable = rows.filter(r => r.play.startsWith('✓')).length;
const md = [
  `## MusicFree 插件体检`,
  ``,
  `关键词「${opt.keyword}」，音质 ${opt.quality}，每个插件试前 ${opt.tracks} 首。${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  ``,
  `**${rows.length} 个插件，${usable} 个能直接出声。**`,
  ``,
  `| 插件 | 平台 | 版本 | 加载 | 搜索 | 取地址 | 出声 | 歌词 | 备注 |`,
  `| --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  ...rows.map(r => `| ${cell(r.name)} | ${cell(r.platform)} | ${cell(r.version)} | ${r.load} | ${r.search} | ${r.url} | ${cell(r.play)} | ${r.lyric} | ${cell(r.notes.join('；'))} |`)
].join('\n');

console.log(md);
if (opt.md) await appendFile(opt.md, md + '\n');
if (opt.json) await writeFile(opt.json, JSON.stringify({ keyword: opt.keyword, quality: opt.quality, rows }, null, 2));
process.exit(0);
