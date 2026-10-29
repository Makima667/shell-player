// 用应用自己的音源运行时，对指定 MusicFree 插件做真实网络端到端测试：
// 搜索 → 取播放地址。不模拟、不桩，打的是真实接口。
import fs from 'node:fs';
import { compileSource } from './src/sources/compile.js';

const KW = process.argv[2] || '晴天';
const files = process.argv.slice(3);

const time = async (label, fn) => {
  const t = Date.now();
  try {
    const v = await fn();
    return { label, ms: Date.now() - t, ok: true, v };
  } catch (e) {
    return { label, ms: Date.now() - t, ok: false, err: e?.message || String(e) };
  }
};

for (const file of files) {
  const name = file.split(/[\\/]/).pop();
  const code = fs.readFileSync(file, 'utf8');
  const loaded = await time('compile', () => compileSource(code, { env: 'desktop' }));
  if (!loaded.ok) { console.log(`${name}  compile FAIL ${loaded.err}`); continue; }
  const src = loaded.v;
  console.log(`\n=== ${name}  platform=${src.name} v${src.version || '?'} kind=${src.kind} search=${src.canSearch} url=${src.canUrl}`);

  const s = await time('search', () => src.search(KW, 1));
  if (!s.ok) { console.log(`  search FAIL (${s.ms}ms) ${s.err}`); continue; }
  const list = s.v.list || [];
  console.log(`  search OK ${s.ms}ms, ${list.length} 首`);
  if (!list.length) { console.log('  样本:', JSON.stringify(s.v).slice(0, 300)); continue; }
  const t0 = list[0];
  console.log(`  首条: ${t0.title} / ${t0.artist} / id=${t0.id}`);

  for (const q of ['standard', 'high', 'super']) {
    const u = await time(q, () => src.getUrl(t0, q));
    if (u.ok) {
      const url = u.v?.url || '';
      console.log(`  getUrl(${q}) OK ${u.ms}ms -> ${url.slice(0, 90)}${url.length > 90 ? '…' : ''}`);
    } else {
      console.log(`  getUrl(${q}) FAIL ${u.ms}ms ${u.err}`);
    }
  }
}
