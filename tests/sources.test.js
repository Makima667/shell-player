import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setFetch } from '../src/core/http.js';
import { compileSource, SubscriptionError, detectKind } from '../src/sources/compile.js';
import { SourceManager } from '../src/sources/manager.js';
import { parseLrc, mergeTranslation, lineAt } from '../src/core/lrc.js';
import { matchScore } from '../src/core/match.js';

// 假的网络：按 URL 返回固定数据，并记录请求
const calls = [];
const routes = {
  'https://api.test/search': () => ({ data: { songs: [{ id: 1, name: '晴天', artists: [{ name: '周杰伦' }], album: { name: '叶惠美' }, duration: 269000 }], total: 1 } }),
  'https://api.test/url': () => ({ data: { url: 'https://cdn.test/1.mp3' } }),
  'https://api.test/lrc': () => '[00:01.00]故事的小黄花',
  'https://mf.test/search': () => ({ list: [{ songmid: '002abc', title: '晴天', singer: '周杰伦', interval: 269 }] }),
  'https://lx.test/url': () => ({ code: 0, url: 'https://lx-cdn.test/song.mp3' })
};
setFetch(async (url, init) => {
  calls.push({ url, init });
  const key = Object.keys(routes).find(k => url.startsWith(k));
  if (!key) return new Response('not found', { status: 404 });
  const body = routes[key](url, init);
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
});

const memStore = () => { const m = new Map(); return { get: (k, d) => m.has(k) ? m.get(k) : d, set: (k, v) => m.set(k, v) }; };

const JSON_SRC = JSON.stringify({
  id: 'test-api', name: '测试 API', lxKey: 'wy',
  search: { url: 'https://api.test/search?kw={keyword}&p={page}', list: 'data.songs', total: 'data.total', durationUnit: 'ms',
    fields: { id: 'id', title: 'name', artist: 'artists', album: 'album.name', duration: 'duration' } },
  url: { url: 'https://api.test/url?id={id}&q={quality}', path: 'data.url' },
  lyric: { url: 'https://api.test/lrc?id={id}', type: 'text' }
});

const MF_PLUGIN = `
const axios = require('axios');
const CryptoJS = require('crypto-js');
module.exports = {
  platform: 'QQ音乐',
  version: '0.1.0',
  userVariables: [{ key: 'token', name: '令牌' }],
  async search(query, page, type) {
    const { data } = await axios.get('https://mf.test/search', { params: { q: query, page, sign: CryptoJS.MD5(query).toString() } });
    return { isEnd: true, data: data.list.map(s => ({ id: s.songmid, songmid: s.songmid, title: s.singer ? s.title : '', artist: s.singer, duration: s.interval, platform: 'QQ音乐' })) };
  },
  async getMediaSource(item, quality) {
    if (quality !== 'standard') throw new Error('没有这个音质');
    return { url: 'https://mf-cdn.test/' + item.songmid + '?t=' + (env.getUserVariables().token || ''), headers: { Referer: 'https://y.qq.com' } };
  }
};`;

const LX_SOURCE = `/*!
 * @name 测试洛雪源
 * @version 1.2.0
 */
const { EVENT_NAMES, request, on, send, utils } = globalThis.lx;
const sign = utils.crypto.md5('abc');
const enc = utils.crypto.aesEncrypt(utils.buffer.from('hello'), 'aes-128-cbc', '0123456789abcdef', 'abcdef0123456789');
on(EVENT_NAMES.request, ({ source, action, info }) => new Promise((resolve, reject) => {
  if (action !== 'musicUrl') return reject(new Error('action not support'));
  request('https://lx.test/url?src=' + source + '&id=' + info.musicInfo.songmid + '&q=' + info.type + '&s=' + sign + '&e=' + utils.buffer.bufToString(enc, 'hex'), { method: 'get' }, (err, resp) => {
    if (err) return reject(err);
    resolve(resp.body.url);
  });
}));
send(EVENT_NAMES.inited, { sources: { tx: { name: 'QQ', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k'] } } });
`;

test('识别格式', () => {
  assert.equal(detectKind(JSON_SRC), 'json');
  assert.equal(detectKind(LX_SOURCE), 'lx');
  assert.equal(detectKind(MF_PLUGIN), 'script');
});

test('JSON 配置源：搜索、地址、歌词', async () => {
  const s = await compileSource(JSON_SRC);
  const r = await s.search('晴天', 1);
  assert.equal(r.list.length, 1);
  assert.equal(r.list[0].artist, '周杰伦');
  assert.equal(r.list[0].duration, 269);
  assert.equal(r.hasMore, false);
  assert.match(calls.at(-1).url, /kw=%E6%99%B4%E5%A4%A9&p=1/);
  assert.equal((await s.getUrl(r.list[0], '320k')).url, 'https://cdn.test/1.mp3');
  assert.match(calls.at(-1).url, /id=1&q=320k/);
  assert.equal((await s.getLyric(r.list[0])).lrc, '[00:01.00]故事的小黄花');
});

test('MusicFree 订阅会被识别出来', async () => {
  await assert.rejects(compileSource('{"plugins":[{"name":"a","url":"https://x/a.js"}]}'), SubscriptionError);
});

test('MusicFree 插件：require、axios、音质回退、用户变量', async () => {
  const s = await compileSource(MF_PLUGIN, { userVars: () => ({ token: 'T1' }) });
  assert.equal(s.kind, 'musicfree');
  assert.equal(s.lxKey, 'tx');
  const r = await s.search('晴天', 1);
  assert.equal(r.list[0].id, '002abc');
  assert.match(calls.at(-1).url, /sign=/);
  const u = await s.getUrl(r.list[0], '320k');
  assert.equal(u.url, 'https://mf-cdn.test/002abc?t=T1');
  assert.equal(u.quality, 'standard');
  assert.equal(u.headers.Referer, 'https://y.qq.com');
});

test('洛雪源：初始化、加密工具、取地址', async () => {
  const s = await compileSource(LX_SOURCE);
  assert.equal(s.kind, 'lx');
  assert.equal(s.name, '测试洛雪源');
  assert.deepEqual(s.lxKeys, ['tx']);
  const u = await s.getUrl({ title: '晴天', artist: '周杰伦', lxKey: 'tx', songmid: '002abc', duration: 269 }, 'flac');
  assert.equal(u.url, 'https://lx-cdn.test/song.mp3');
  assert.equal(u.quality, '320k');
  const url = calls.at(-1).url;
  assert.match(url, /src=tx&id=002abc&q=320k&s=900150983cd24fb0d6963f7d28e17f72/);
  assert.match(url, /&e=[0-9a-f]{32}$/);
  await assert.rejects(s.getUrl({ lxKey: 'kw', title: 'x' }, '128k'), /不支持/);
});

test('调度：MusicFree 搜到的歌交给洛雪源取地址；失败后自动换源', async () => {
  const store = memStore();
  const broken = { kind: 'builtin', name: '坏掉的源', canSearch: true, canUrl: true,
    search: async () => ({ list: [] }), getUrl: async () => { throw new Error('版权限制'); } };
  const m = new SourceManager({ store, builtins: [['broken', broken]] });
  await m.loadAll();
  const lx = await m.add(LX_SOURCE);
  const mf = await m.add(MF_PLUGIN.replace("platform: 'QQ音乐'", "platform: 'QQ音乐'").replace("if (quality !== 'standard') throw new Error('没有这个音质');", "throw new Error('插件取不到');"));
  assert.equal(mf.id, 'u:mf-QQ音乐');

  // MusicFree 自己取不到 → 洛雪源（平台 tx）
  const track = m.normTrack({ id: '002abc', songmid: '002abc', title: '晴天', artist: '周杰伦', duration: 269, lxKey: 'tx' }, mf.id);
  const r1 = await m.resolveUrl(track, '320k');
  assert.equal(r1.via, lx.id);

  // 别的源的歌坏了 → 自动去 QQ音乐 插件搜同名歌 → 洛雪源
  const t2 = m.normTrack({ id: 'x', title: '晴天 (Live)', artist: '周杰伦', duration: 270 }, 'broken');
  const r2 = await m.resolveUrl(t2, '128k');
  assert.equal(r2.switched, true);
  assert.equal(r2.track.sourceId, mf.id);
  await assert.rejects(m.resolveUrl(t2, '128k', { failover: false }), /版权限制/);

  // 重新加载后仍然可用
  const m2 = new SourceManager({ store, builtins: [['broken', broken]] });
  await m2.loadAll();
  assert.equal(m2.enabled().length, 3);
});

test('歌词解析与翻译合并', () => {
  const lines = mergeTranslation(parseLrc('[offset:500]\n[00:01.50][00:10.00]Hello\n[00:05.00]World'), '[00:01.50]你好\n[00:05.00]世界');
  assert.deepEqual(lines.map(l => [l.t, l.txt, l.sub]), [[1, 'Hello', '你好'], [4.5, 'World', '世界'], [9.5, 'Hello', undefined]]);
  assert.equal(lineAt(lines, 5), 1);
  assert.equal(lineAt(lines, 0.2), -1);
  assert.equal(parseLrc('第一行\n第二行')[0].t, -1);
});

test('同一首歌匹配', () => {
  assert.ok(matchScore({ title: '晴天', artist: '周杰伦', duration: 269 }, { title: '晴天（Live版）', artist: '周杰伦/五月天', duration: 270 }) >= 4);
  assert.ok(matchScore({ title: '晴天', artist: '周杰伦' }, { title: '晴天', artist: '孙燕姿' }) < 4);
});

test('搜索：慢音源超时不拖累其他音源，结果边出边回调并去重', async () => {
  const slow = { name: '慢', canSearch: true, canUrl: false, search: () => new Promise(() => {}) };
  const dup = { name: '重复', canSearch: true, canUrl: false, search: async () => ({ list: [{ id: 1, title: 'A' }, { id: 1, title: 'A' }, { id: 2, title: 'B' }] }) };
  const m = new SourceManager({ store: memStore(), builtins: [['slow', slow], ['dup', dup]] });
  await m.loadAll();
  const parts = [];
  const t0 = Date.now();
  const r = await m.search(['slow', 'dup'], 'x', 1, { timeout: 300, onPartial: p => parts.push(p) });
  assert.ok(Date.now() - t0 < 2000);
  assert.deepEqual(r.results.map(t => t.id), ['1', '2']);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0][0], 'slow');
  assert.equal(parts[0].id, 'dup');
  assert.equal(parts[1].id, 'slow');
});

test('健康度：记录成功率和耗时，换源时先试表现好的音源', async () => {
  const mk = (name, fail) => [name, { name, canSearch: true, canUrl: true,
    async search() { return { list: [{ id: name, title: '晴天', artist: '周杰伦', duration: 269 }] }; },
    async getUrl() { if (fail) throw new Error('取不到'); return { url: 'https://cdn.test/' + name }; } }];
  const sm = new SourceManager({ store: memStore(), builtins: [] });
  // 用户添加的音源走 runtime，这里直接放进去模拟
  for (const [id, a] of [mk('a', true), mk('b', false), mk('c', false)]) sm.runtime.set(id, { ...a, id });
  for (let i = 0; i < 5; i++) { sm.record('b', false); sm.record('c', true, 300); }
  assert.deepEqual(sm.byHealth(['a', 'b', 'c']), ['c', 'a', 'b']);
  assert.equal(sm.health('c').rate, 1);
  assert.equal(sm.health('zzz'), null);
  const r = await sm.resolveUrl({ id: 'x', title: '晴天', artist: '周杰伦', duration: 269, sourceId: 'a' }, '320k');
  assert.equal(r.via, 'c');
  assert.equal(r.switched, true);
  assert.ok(sm.health('a').rate < 1);
});

test('导入歌单：交给认得链接的音源，结果带上音源 id', async () => {
  const code = `module.exports = { platform: '测试平台', async search() { return { isEnd: true, data: [] }; },
    async importMusicSheet(url) { if (!url.includes('sheet.test')) return; return [{ id: 1, title: '晴天', artist: '周杰伦' }, { id: 2, title: '七里香', artist: '周杰伦' }]; } };`;
  const sm = new SourceManager({ store: memStore(), builtins: [] });
  const { id } = await sm.add(code);
  assert.deepEqual(sm.sheetSources(), [id]);
  const r = await sm.importSheet('https://sheet.test/123');
  assert.equal(r.tracks.length, 2);
  assert.equal(r.tracks[1].title, '七里香');
  assert.equal(r.tracks[0].sourceId, id);
  await assert.rejects(sm.importSheet('https://other.test/1'), /不认识这个链接/);
});

test('本地歌曲没有歌词时，从联网音源里的同一首歌借歌词', async () => {
  const local = { name: '本地', builtin: true, canSearch: true, canUrl: true, async search() { return { list: [] }; }, async getUrl() { return { url: 'blob:x' }; }, async getLyric() { return { lrc: '' }; } };
  const net = { name: '网络', canSearch: true, canUrl: true,
    async search(kw) { return { list: kw.startsWith('晴天') ? [{ id: 9, title: '晴天', artist: '周杰伦', duration: 269 }] : [] }; },
    async getUrl() { return { url: 'https://x' }; }, async getLyric(t) { return { lrc: t.id === '9' ? '[00:01.00]故事的小黄花' : '' }; } };
  const sm = new SourceManager({ store: memStore(), builtins: [['local', local]] });
  await sm.loadAll();
  sm.runtime.set('net', { ...net, id: 'net' });
  const r = await sm.resolveLyric({ id: 'p:/a.mp3', title: '晴天', artist: '未知歌手', duration: 268, sourceId: 'local' });
  assert.match(r.lrc, /故事的小黄花/);
  assert.equal(r.borrowed, '网络');
  const none = await sm.resolveLyric({ id: 'p:/b.mp3', title: '没有这首', artist: '某人', sourceId: 'local' });
  assert.equal(none.lrc, '');
});

test('专用线路列表给出明确提示', async () => {
  const cfg = JSON.stringify({ lines: [{ id: 'kw', name: 'x', enabled: true, searchApi: 'fetchSearchMusic', detailApi: 'fetchMusicDetail', levels: ['standard'] }] });
  for (const code of [cfg, '/*\n * @name 示例\n */\n' + cfg]) {
    await assert.rejects(compileSource(code), /线路列表/);
  }
});
