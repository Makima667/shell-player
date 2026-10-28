// Validates every source file and proves the generated indexes are not stale.
// Exits non-zero on any hard failure, so CI fails instead of shipping a broken repo.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ROOT, LX_DIR, MF_DIR, probeLx, probePlugin, hasCoreApi,
  readCatalog, listFiles, sha256,
} from './lib.mjs';
import { buildModel } from './build-index.mjs';

const problems = [];
const warnings = [];
const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

const catalog = readCatalog();
const lxFiles = listFiles(LX_DIR);
const mfFiles = listFiles(MF_DIR);

// --- catalog coverage -------------------------------------------------------
const catLx = new Set(catalog.lx.map((e) => e.slug));
const catMf = new Set(catalog.musicfree.map((e) => e.slug));
for (const f of lxFiles) if (!catLx.has(f.replace(/\.js$/, ''))) fail(`LX 文件未登记到 catalog.json: ${f}`);
for (const f of mfFiles) if (!catMf.has(f.replace(/\.js$/, ''))) fail(`插件文件未登记到 catalog.json: ${f}`);
for (const slug of catLx) if (!lxFiles.includes(slug + '.js')) fail(`catalog.json 中的 LX 条目缺少文件: ${slug}`);
for (const slug of catMf) if (!mfFiles.includes(slug + '.js')) fail(`catalog.json 中的插件条目缺少文件: ${slug}`);

// --- duplicate payloads -----------------------------------------------------
const seen = new Map();
for (const dir of [LX_DIR, MF_DIR]) {
  for (const f of listFiles(dir)) {
    const h = sha256(fs.readFileSync(path.join(dir, f)));
    if (seen.has(h)) fail(`重复内容: ${f} 与 ${seen.get(h)} 完全相同`);
    else seen.set(h, f);
  }
}

// --- LX scripts -------------------------------------------------------------
const lxRows = [];
for (const f of lxFiles) {
  const full = path.join(LX_DIR, f);
  const code = fs.readFileSync(full, 'utf8');
  const probe = probeLx(full);
  if (!/^\/\*[\s\S]+?\*\//.test(code)) fail(`LX ${f}: 缺少文件头注释，LX 会拒绝导入`);
  if (!probe.name) fail(`LX ${f}: 缺少 @name`);
  if (probe.syntax !== 'ok') fail(`LX ${f}: ${probe.syntax}`);
  if (probe.initMode === 'worker-failed') fail(`LX ${f}: 探针进程异常（${probe.error}）`);
  if (probe.initMode === 'broken') fail(`LX ${f}: 初始化抛错 ${probe.error}`);
  if (!probe.inited) warn(`LX ${f}: 未能在离线沙箱完成初始化（${probe.initMode}），平台未知`);
  if (probe.inited && !probe.hasRequestHandler) warn(`LX ${f}: 已初始化但未注册 request 回调`);
  if (probe.inited && probe.platforms.filter((k) => k !== 'local').length === 0) warn(`LX ${f}: 未声明任何在线平台`);
  lxRows.push({ f, probe });
}

// --- MusicFree plugins ------------------------------------------------------
const mfRows = [];
for (const f of mfFiles) {
  const full = path.join(MF_DIR, f);
  const probe = probePlugin(full);
  if (probe.syntax !== 'ok') fail(`插件 ${f}: ${probe.syntax}`);
  if (!hasCoreApi(probe)) {
    fail(`插件 ${f}: 加载失败或缺少 search/getMediaSource（${probe.error || '导出不完整'}）`);
  }
  mfRows.push({ f, probe });
}

// --- generated indexes are current -----------------------------------------
const model = buildModel();
const expected = new Map();

const generated = {
  'sources/manifest.json': JSON.stringify(model.manifest, null, 2) + '\n',
  'sources/lx/index.json': JSON.stringify(model.lxIndex, null, 2) + '\n',
  ...Object.fromEntries(Object.entries(model.subscriptions)
    .map(([n, d]) => [`sources/musicfree/${n}`, JSON.stringify(d, null, 2) + '\n'])),
};
for (const [rel, content] of Object.entries(generated)) expected.set(rel, content);

for (const [rel, content] of expected) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) { fail(`缺少生成文件 ${rel}（运行 npm run build）`); continue; }
  if (fs.readFileSync(full, 'utf8') !== content) fail(`${rel} 已过期，运行 npm run build 重新生成`);
}

// --- subscription files -----------------------------------------------------
for (const name of ['plugins.json', 'plugins-cdn.json', 'plugins-raw.json']) {
  const rel = `sources/musicfree/${name}`;
  if (!fs.existsSync(path.join(ROOT, rel))) { fail(`缺少订阅文件 ${rel}`); continue; }
  const sub = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  if (!Array.isArray(sub.plugins) || sub.plugins.length !== mfFiles.length) {
    fail(`${rel}: 插件数量与目录不一致`);
  }
  for (const p of sub.plugins) {
    if (!/^https:\/\//.test(p.url)) fail(`${rel}: 非法订阅地址 ${p.url}`);
    if (!p.name) fail(`${rel}: 存在没有 name 的条目`);
  }
}

// --- report -----------------------------------------------------------------
const online = lxRows.filter((r) => r.probe.inited).length;
console.log(`LX 音源 ${lxFiles.length} 个（离线可初始化 ${online} 个），MusicFree 插件 ${mfFiles.length} 个`);
if (warnings.length) {
  console.log('\n警告:');
  for (const w of warnings) console.log('  - ' + w);
}
if (problems.length) {
  console.error('\n失败:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('\n全部校验通过。');
