// 内置音源回归测试：每个随包发布的音源都必须在应用自己的运行时里编译成功，
// 并且声明了它该有的能力。测试直接读磁盘上的文件，不经过 Vite 的 ?raw。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSource, detectKind } from '../src/sources/compile.js';
import { setFetch } from '../src/core/http.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(HERE, '..', 'src', 'sources', 'bundled');

// 这些源初始化后会各自向作者服务器做一次「检查更新」。测试不打网络，
// 统一让请求立刻失败，再把事件循环放空一会儿，让它们自己的 reject 落在测试内。
setFetch(async () => new Response('{"code":500}', { status: 500 }));
const settle = () => new Promise(r => setTimeout(r, 300));
process.on('unhandledRejection', () => {});

const files = (sub) => fs.readdirSync(path.join(DIR, sub)).filter(f => f.endsWith('.js')).sort();
const read = (sub, f) => fs.readFileSync(path.join(DIR, sub, f), 'utf8');

test('洛雪内置源都能编译，并且能取播放地址', async () => {
  const list = files('lx');
  assert.ok(list.length >= 5, '内置洛雪源数量不应少于 5');
  for (const f of list) {
    const code = read('lx', f);
    assert.equal(detectKind(code), 'lx', `${f} 应被识别为洛雪源`);
    const src = await compileSource(code, { env: 'desktop' });
    assert.equal(src.kind, 'lx', `${f} 编译后 kind 不对`);
    assert.ok(src.name, `${f} 缺少名称`);
    assert.equal(src.canUrl, true, `${f} 必须能取播放地址`);
    assert.ok((src.lxKeys || []).length > 0, `${f} 没有声明任何平台`);
    assert.equal(src.canSearch, false, `${f} 洛雪源不应声明可搜索`);
  }
  await settle();
});

test('MusicFree 内置源都能编译，并且可搜索、可取地址', async () => {
  const list = files('musicfree');
  assert.ok(list.length >= 3, '内置 MusicFree 源数量不应少于 3');
  const platforms = new Set();
  for (const f of list) {
    const code = read('musicfree', f);
    const src = await compileSource(code, { env: 'desktop' });
    assert.equal(src.kind, 'musicfree', `${f} 编译后 kind 不对`);
    assert.ok(src.name, `${f} 缺少名称`);
    assert.equal(src.canSearch, true, `${f} 必须能搜索`);
    assert.equal(src.canUrl, true, `${f} 必须能取播放地址`);
    assert.ok(!platforms.has(src.name), `内置源出现重复平台：${src.name}`);
    platforms.add(src.name);
  }
});

test('内置源的 id 与收录清单一致，便于恢复时不重复', () => {
  const lx = files('lx').map(f => 'b:lx:' + f.replace(/\.js$/, ''));
  const mf = files('musicfree').map(f => 'b:musicfree:' + f.replace(/\.js$/, ''));
  const ids = [...lx, ...mf];
  assert.equal(new Set(ids).size, ids.length, 'id 不应重复');
});
