#!/usr/bin/env node
// Installs every bundled LX Music source into a local LX Music (落雪音乐) profile,
// so the sources are there on first launch instead of being imported by hand.
//
//   node scripts/install.mjs                 # auto-detect the LX Music data dir
//   node scripts/install.mjs --dry-run       # show what would change
//   node scripts/install.mjs --lx-dir <dir>  # explicit data dir (portable install)
//   node scripts/install.mjs --restore       # roll back to the newest backup
//   node scripts/install.mjs --print-urls    # just print the MusicFree subscription URL
//
// Only `LxDatas/user_api.json` is touched, and a timestamped backup is written first.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  LX_DIR, listFiles, parseLxHeader, deflateScript, inflateScript, sha256,
  fastly, jsdelivr, raw,
} from './lib.mjs';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const DRY = has('--dry-run');
const RESTORE = has('--restore');

function candidateDataDirs() {
  const explicit = valueOf('--lx-dir');
  if (explicit) return [path.resolve(explicit)];
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [
      path.join(appData, 'lx-music-desktop'),
      // portable build: <exe dir>\portable\userData
      path.join(path.dirname(process.execPath), 'portable', 'userData'),
    ];
  }
  if (process.platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'lx-music-desktop')];
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return [path.join(configHome, 'lx-music-desktop')];
}

const storeFile = (dataDir) => path.join(dataDir, 'LxDatas', 'user_api.json');
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

function readStore(file) {
  if (!fs.existsSync(file)) return { userApis: [] };
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return { userApis: [] };
  const parsed = JSON.parse(raw); // a malformed store is never overwritten blindly
  if (!Array.isArray(parsed.userApis)) parsed.userApis = [];
  return parsed;
}

function writeStore(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, '\t'), 'utf8');
  fs.renameSync(tmp, file);
}

function newestBackup(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) return null;
  const backups = fs.readdirSync(dir)
    .filter((f) => f.startsWith('user_api.json.bak.'))
    .sort()
    .map((f) => path.join(dir, f));
  return backups.length ? backups[backups.length - 1] : null;
}

function buildEntry(file) {
  const script = fs.readFileSync(file, 'utf8');
  const header = parseLxHeader(script);
  const slug = path.basename(file, '.js');
  return {
    id: `user_api_sp_${slug}`,
    name: header.name || slug,
    description: header.description || '',
    author: header.author || '',
    homepage: header.homepage || '',
    version: header.version || '',
    allowShowUpdateAlert: true,
    script: deflateScript(script),
    _slug: slug,
    _digest: sha256(script),
  };
}

function main() {
  if (has('--print-urls')) {
    console.log('MusicFree 订阅地址（设置 → 插件管理 → 从网络安装）:');
    console.log('  ' + fastly('sources/musicfree/plugins.json'));
    console.log('备用（cdn.jsdelivr.net / raw.githubusercontent.com）:');
    console.log('  ' + jsdelivr('sources/musicfree/plugins-cdn.json'));
    console.log('  ' + raw('sources/musicfree/plugins-raw.json'));
    console.log('落雪音源索引:');
    console.log('  ' + fastly('sources/lx/index.json'));
    return;
  }

  const dirs = candidateDataDirs();
  const target = dirs.map(storeFile).find((f) => fs.existsSync(f))
    || storeFile(dirs[0]);
  const dataDir = path.dirname(path.dirname(target));

  if (RESTORE) {
    const backup = newestBackup(target);
    if (!backup) {
      console.error(`没有找到备份：${path.dirname(target)}`);
      process.exit(1);
    }
    fs.copyFileSync(backup, target);
    console.log(`已从备份恢复：${backup}\n  →  ${target}`);
    return;
  }

  console.log(`LX Music 数据目录: ${dataDir}`);
  console.log(`目标文件: ${target}${fs.existsSync(target) ? '' : '（尚未存在，将新建）'}`);

  let store;
  try {
    store = readStore(target);
  } catch (e) {
    console.error(`读取 ${target} 失败：${e.message}\n为避免覆盖你的配置，本次不做任何写入。`);
    process.exit(1);
  }

  const existingDigests = new Set();
  const existingNames = new Map();
  for (const api of store.userApis) {
    try {
      existingDigests.add(sha256(inflateScript(api.script)));
    } catch { /* 损坏条目无视即可 */ }
    if (api.name) existingNames.set(api.name, api);
  }

  const added = [];
  const updated = [];
  const skipped = [];

  for (const f of listFiles(LX_DIR)) {
    const entry = buildEntry(path.join(LX_DIR, f));
    if (existingDigests.has(entry._digest)) { skipped.push([entry.name, '内容已存在']); continue; }
    const byId = store.userApis.find((a) => a.id === entry.id);
    const byName = existingNames.get(entry.name);
    const { _slug, _digest, ...clean } = entry;
    if (byId) {
      Object.assign(byId, clean);
      updated.push(entry.name);
    } else if (byName) {
      skipped.push([entry.name, '同名音源已存在（未覆盖）']);
    } else {
      store.userApis.push(clean);
      added.push(entry.name);
    }
  }

  console.log(`\n新增 ${added.length} 个，更新 ${updated.length} 个，跳过 ${skipped.length} 个`);
  for (const n of added) console.log('  + ' + n);
  for (const n of updated) console.log('  ~ ' + n);
  for (const [n, why] of skipped) console.log('  = ' + n + '（' + why + '）');

  if (DRY) {
    console.log('\n--dry-run：未写入任何文件。');
    return;
  }
  if (!added.length && !updated.length) {
    console.log('\n无需变更。');
    return;
  }

  if (fs.existsSync(target)) {
    const backup = `${target}.bak.${stamp()}`;
    fs.copyFileSync(target, backup);
    console.log(`\n已备份原配置: ${backup}`);
  }
  writeStore(target, store);
  console.log(`已写入 ${store.userApis.length} 个自定义源。重启 LX Music 后在「设置 → 自定义源」中启用。`);
  console.log('提示：若 LX Music 正在运行，请先退出再执行本脚本，否则应用退出时会覆盖写入。');
}

main();
