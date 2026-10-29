// 上游音源体检：把「青听/元力 → 海棠」这条链路的每一环单独打一遍，
// 用来判断是配置死了、分发死了，还是解析后端死了。
//
//   node scripts/check-upstream.mjs
//
// 只做 GET，不改任何东西；全挂时退出码为 1，方便塞进 cron / CI 报警。
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const PROBES = [
  ['青听·线路配置', 'https://13413.kstore.vip/QingMusic/music.json'],
  ['海棠·配置(用户给的第 2 条)', 'https://musicapi.haitangw.net/music.json'],
  ['海棠·解析后端(实际在用)', 'https://yinyue.haitangw.net/'],
  ['海棠·网易解析', 'https://yinyue.haitangw.net/wy/wy.php?id=186016&level=standard'],
  ['海棠·酷狗解析', 'https://yinyue.haitangw.net/kg/kg_song_kw.php?id=B3A52A7A958BF0AED0EBFBA2E9A818B7&type=json&level=standard'],
  ['元力·分发 wy.js', 'https://13413.kstore.vip/yuanli/wy.js'],
  ['元力·分发 kg.js', 'https://13413.kstore.vip/yuanli/kg.js'],
  ['元力·分发 kw.js', 'https://13413.kstore.vip/yuanli/kw.js'],
  ['元力·分发 qq.js', 'https://13413.kstore.vip/yuanli/qq.js'],
  ['元力·备胎中转 duanx', 'https://share.duanx.cn/url/wy/186016/128k'],
  ['自建·网易官方接口', 'https://interface3.music.163.com/api/search/get?type=1&limit=1&offset=0&s=%E6%99%B4%E5%A4%A9'],
];

const probe = async (url, timeout = 10000) => {
  const t = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' }, signal: ac.signal });
    const body = await r.text();
    return { ms: Date.now() - t, status: r.status, bytes: body.length, body };
  } catch (e) {
    return { ms: Date.now() - t, error: e.name === 'AbortError' ? 'timeout' : (e.cause?.code || e.message) };
  } finally {
    clearTimeout(timer);
  }
};

const verdictOf = (name, r) => {
  if (r.error) return ['不可达', r.error];
  if (r.status >= 400) return ['失效', 'HTTP ' + r.status];
  const body = (r.body || '').trim();
  if (!body) return ['空回包', 'HTTP ' + r.status];
  if (body.startsWith('<')) return ['返回 HTML（多半是错误页）', 'HTTP ' + r.status];
  if (name.includes('解析') && /"url"\s*:\s*""/.test(body)) return ['活着但没给地址', '接口可达'];
  return ['可用', 'HTTP ' + r.status];
};

console.log('上游音源体检 · ' + new Date().toLocaleString('zh-CN'));
console.log('');

let alive = 0;
for (const [name, url] of PROBES) {
  const r = await probe(url);
  const [verdict, detail] = verdictOf(name, r);
  const ok = verdict === '可用';
  if (ok) alive++;
  console.log(`${ok ? '✔' : '✖'} ${name.padEnd(26)} ${String(r.ms + 'ms').padEnd(8)} ${verdict.padEnd(12)} ${detail}`);
}

console.log('');
console.log(`链路 ${alive}/${PROBES.length} 环可用`);
if (alive < PROBES.length) {
  console.log('提示：配置与分发都活着、只有「解析」不可用时，说明这套源只是后端挂了；');
  console.log('      解析层挂掉期间，用 sources/musicfree/plugins/wy-official.js（官方直连）兜底。');
}
process.exit(alive === PROBES.length ? 0 : 1);
