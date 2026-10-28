// Round-trip test for the LX installer: the file it writes must be exactly what
// LX Music itself would have written, and re-running it must change nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LX_DIR, listFiles, inflateScript, parseLxHeader } from '../scripts/lib.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(REPO, 'scripts/install.mjs');

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shellplayer-install-'));
  fs.mkdirSync(path.join(dir, 'LxDatas'), { recursive: true });
  return dir;
}

const runInstall = (dir, ...extra) =>
  spawnSync(process.execPath, [INSTALL, '--lx-dir', dir, ...extra], { cwd: REPO, encoding: 'utf8' });

test('安装脚本写入的每个音源都能还原为仓库里的原始脚本', () => {
  const dir = sandbox();
  const result = runInstall(dir);
  assert.equal(result.status, 0, result.stderr);

  const store = JSON.parse(fs.readFileSync(path.join(dir, 'LxDatas', 'user_api.json'), 'utf8'));
  assert.equal(store.userApis.length, listFiles(LX_DIR).length);

  const ids = new Set();
  for (const api of store.userApis) {
    assert.ok(api.id && !ids.has(api.id), `id 重复: ${api.id}`);
    ids.add(api.id);
    assert.ok(api.name, '缺少 name');
    assert.equal(typeof api.description, 'string');
    assert.equal(api.allowShowUpdateAlert, true);
    assert.match(api.script, /^gz_/, 'script 必须是 LX 使用的 gz_ 压缩格式');

    const slug = api.id.replace('user_api_sp_', '');
    const original = fs.readFileSync(path.join(LX_DIR, slug + '.js'), 'utf8');
    assert.equal(inflateScript(api.script), original, `${slug} 往返后内容不一致`);
    assert.equal(parseLxHeader(original).name, api.name, `${slug} 的 @name 解析结果不一致`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('重复执行保持幂等，且首次运行会留下备份', () => {
  const dir = sandbox();
  const storePath = path.join(dir, 'LxDatas', 'user_api.json');
  fs.writeFileSync(storePath, JSON.stringify({ userApis: [] }), 'utf8');

  const first = runInstall(dir);
  assert.equal(first.status, 0, first.stderr);
  const before = fs.readFileSync(storePath, 'utf8');

  const second = runInstall(dir);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(fs.readFileSync(storePath, 'utf8'), before, '第二次运行不应修改文件');
  assert.match(second.stdout, /无需变更/);

  const backups = fs.readdirSync(path.join(dir, 'LxDatas')).filter((f) => f.includes('.bak.'));
  assert.equal(backups.length, 1, '应恰好生成一个备份');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('已有同源时不会重复写入', () => {
  const dir = sandbox();
  runInstall(dir);
  const storePath = path.join(dir, 'LxDatas', 'user_api.json');
  const count = JSON.parse(fs.readFileSync(storePath, 'utf8')).userApis.length;

  // 模拟用户手工再导入一次同样的脚本：内容相同，应被识别为已存在。
  const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  store.userApis.push({ ...store.userApis[0], id: 'user_api_manual_1' });
  fs.writeFileSync(storePath, JSON.stringify(store), 'utf8');

  const result = runInstall(dir);
  assert.equal(result.status, 0, result.stderr);
  const after = JSON.parse(fs.readFileSync(storePath, 'utf8')).userApis.length;
  assert.equal(after, count + 1, '不应新增条目');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('配置损坏时拒绝写入', () => {
  const dir = sandbox();
  const storePath = path.join(dir, 'LxDatas', 'user_api.json');
  fs.writeFileSync(storePath, '{ this is not json', 'utf8');
  const result = runInstall(dir);
  assert.equal(result.status, 1);
  assert.equal(fs.readFileSync(storePath, 'utf8'), '{ this is not json', '损坏文件必须原样保留');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('--dry-run 不落盘', () => {
  const dir = sandbox();
  const result = runInstall(dir, '--dry-run');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(dir, 'LxDatas', 'user_api.json')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
