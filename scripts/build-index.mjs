// Rebuilds every generated index from the source files themselves:
//   sources/lx/index.json
//   sources/musicfree/plugins.json      (jsDelivr, default subscription)
//   sources/musicfree/plugins-fastly.json
//   sources/musicfree/plugins-raw.json
//   sources/manifest.json
//   docs/SOURCES.md
// The output is deterministic, so `npm run validate` can detect a stale index.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ROOT, OWNER, REPO, BRANCH, LX_DIR, MF_DIR,
  SOURCE_KEYS, jsdelivr, fastly, raw, sha256,
  probeLx, probePlugin, hasCoreApi, readCatalog, listFiles,
} from './lib.mjs';

const PLATFORM_LABEL = {
  kw: '酷我', kg: '酷狗', tx: 'QQ音乐', wy: '网易云', mg: '咪咕', local: '本地',
};
const TIER_LABEL = { primary: '主推', backup: '备用' };

function buildLx(catalog) {
  const meta = new Map(catalog.lx.map((e) => [e.slug, e]));
  const files = listFiles(LX_DIR);
  return files.map((file) => {
    const slug = file.replace(/\.js$/, '');
    const full = path.join(LX_DIR, file);
    const buf = fs.readFileSync(full);
    const probe = probeLx(full);
    const entry = meta.get(slug) || {};
    const rel = `sources/lx/${file}`;
    return {
      slug,
      name: probe.name || slug,
      version: probe.version,
      author: probe.author,
      homepage: probe.homepage,
      description: probe.description,
      tier: entry.tier || 'backup',
      note: entry.note || '',
      platforms: probe.platforms.filter((k) => k !== 'local'),
      platformNames: probe.platformNames || {},
      qualitys: probe.qualitys,
      inited: probe.inited,
      initMode: probe.initMode,
      obfuscated: probe.obfuscated,
      bytes: buf.length,
      sha256: sha256(buf),
      urls: { jsdelivr: jsdelivr(rel), raw: raw(rel) },
    };
  });
}

function buildMusicFree(catalog) {
  const meta = new Map(catalog.musicfree.map((e) => [e.slug, e]));
  const files = listFiles(MF_DIR);
  return files.map((file) => {
    const slug = file.replace(/\.js$/, '');
    const full = path.join(MF_DIR, file);
    const buf = fs.readFileSync(full);
    const probe = probePlugin(full);
    const entry = meta.get(slug) || {};
    const rel = `sources/musicfree/plugins/${file}`;
    return {
      slug,
      name: entry.name || probe.platform || slug,
      label: entry.note || probe.platform || slug,
      platform: probe.platform,
      version: probe.version,
      author: probe.author,
      tier: entry.tier || 'backup',
      obfuscated: probe.obfuscated,
      exportStyle: probe.exportStyle,
      methods: probe.methods,
      valid: hasCoreApi(probe),
      bytes: buf.length,
      sha256: sha256(buf),
      urls: { jsdelivr: jsdelivr(rel), fastly: fastly(rel), raw: raw(rel) },
    };
  });
}

export function buildModel() {
  const catalog = readCatalog();
  // 体检结果（sources/health.json，由 npm run health 生成）决定订阅里的排序与标注：
  // 能出声的排前面，用户点开的第一个音源就不会是死的。
  const healthPath = path.join(ROOT, 'sources/health.json');
  const health = fs.existsSync(healthPath) ? JSON.parse(fs.readFileSync(healthPath, 'utf8')) : null;
  const healthOf = new Map((health?.results || []).map((r) => [r.slug, r]));
  const RANK = { ok: 0, 'no-url': 1, unplayable: 1, empty: 2, down: 3, broken: 3, 'no-search': 2, 'no-url-api': 2 };

  const lx = buildLx(catalog);
  const musicfree = buildMusicFree(catalog).map((p) => {
    const h = healthOf.get(p.slug);
    return h
      ? { ...p, health: { verdict: h.verdict, searchMs: h.search?.ms ?? null, urlMs: h.url?.ms ?? null, playStatus: h.play?.status ?? null } }
      : p;
  });
  if (health) {
    const rank = (p) => RANK[p.health?.verdict] ?? 2;
    const tierRank = (p) => (p.tier === 'primary' ? 0 : 1);
    musicfree.sort((a, b) => rank(a) - rank(b) || tierRank(a) - tierRank(b) || a.slug.localeCompare(b.slug));
  }

  const subscriptionOf = (key) => ({
    desc: `Shell Player 音源库 · MusicFree 插件订阅（${musicfree.length} 个）`,
    plugins: musicfree.map((p) => ({ name: p.label, url: p.urls[key], version: p.version || '1.0.0' })),
  });

  const endpoints = {
    lxIndex: fastly('sources/lx/index.json'),
    lxIndexRaw: raw('sources/lx/index.json'),
    // fastly is the default CDN host: measured reachable where cdn.jsdelivr.net timed out.
    musicfreeSubscription: fastly('sources/musicfree/plugins.json'),
    musicfreeSubscriptionCdn: jsdelivr('sources/musicfree/plugins-cdn.json'),
    musicfreeSubscriptionRaw: raw('sources/musicfree/plugins-raw.json'),
    manifest: fastly('sources/manifest.json'),
    lxZip: `https://github.com/${OWNER}/${REPO}/releases/download/sources/lx-sources.zip`,
  };

  const manifest = {
    name: 'Shell Player 音源库',
    description: '落雪音乐（LX Music）自定义音源 + MusicFree 插件订阅，安装即用。',
    repository: `https://github.com/${OWNER}/${REPO}`,
    branch: BRANCH,
    generator: 'scripts/build-index.mjs',
    counts: { lx: lx.length, musicfree: musicfree.length },
    endpoints,
    platformLabels: PLATFORM_LABEL,
    lx,
    musicfree,
  };

  const lxIndex = {
    name: manifest.name,
    description: 'LX Music 自定义音源索引：直接导入仓库内 sources/lx/*.js 文件，或用 install 脚本写入桌面版。',
    repository: manifest.repository,
    endpoints: { zip: endpoints.lxZip, indexJson: endpoints.lxIndex },
    sources: lx.map((s) => ({
      slug: s.slug, name: s.name, version: s.version, author: s.author, tier: s.tier,
      platforms: s.platforms, qualitys: s.qualitys, note: s.note,
      obfuscated: s.obfuscated, sha256: s.sha256, urls: s.urls,
    })),
  };

  return {
    manifest,
    lxIndex,
    subscriptions: {
      'plugins.json': subscriptionOf('fastly'),
      'plugins-cdn.json': subscriptionOf('jsdelivr'),
      'plugins-raw.json': subscriptionOf('raw'),
    },
  };
}

function renderDocs(model) {
  const { manifest } = model;
  const lines = [];
  lines.push('# 音源清单', '');
  lines.push('> 本文件由 `npm run build` 自动生成，请勿手工编辑。', '');
  lines.push(`共 **${manifest.counts.lx}** 个落雪音源、**${manifest.counts.musicfree}** 个 MusicFree 插件。`, '');

  lines.push('## 落雪音乐（LX Music）', '');
  lines.push('| 文件 | 名称 | 版本 | 平台 | 等级 | 说明 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const s of manifest.lx) {
    const platforms = s.platforms.map((k) => PLATFORM_LABEL[k] || k).join('/')
      || (s.inited ? '未声明' : '未验证（联网初始化）');
    const flag = s.obfuscated ? '（混淆）' : '';
    lines.push(`| \`sources/lx/${s.slug}.js\` | ${s.name}${flag} | ${s.version || '-'} | ${platforms} | ${TIER_LABEL[s.tier]} | ${s.note} |`);
  }

  lines.push('', '## MusicFree 插件', '');
  lines.push('| 文件 | 订阅名 | platform | 版本 | 等级 | 说明 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const p of manifest.musicfree) {
    const flag = p.obfuscated ? '（混淆）' : '';
    lines.push(`| \`sources/musicfree/plugins/${p.slug}.js\` | ${p.name} | ${p.platform}${flag} | ${p.version || '-'} | ${TIER_LABEL[p.tier]} | ${p.label} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function write(rel, content) {
  const full = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return rel;
}

export function writeModel(model) {
  const written = [];
  written.push(write('sources/manifest.json', JSON.stringify(model.manifest, null, 2) + '\n'));
  written.push(write('sources/lx/index.json', JSON.stringify(model.lxIndex, null, 2) + '\n'));
  for (const [name, data] of Object.entries(model.subscriptions)) {
    written.push(write(`sources/musicfree/${name}`, JSON.stringify(data, null, 2) + '\n'));
  }
  written.push(write('docs/SOURCES.md', renderDocs(model)));
  return written;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const model = buildModel();
  for (const f of writeModel(model)) console.log('wrote', f);
  const bad = model.manifest.lx.filter((s) => !s.inited);
  const invalid = model.manifest.musicfree.filter((p) => !p.valid);
  if (bad.length) console.warn('警告：以下音源未能在离线沙箱中完成 inited 初始化：', bad.map((s) => s.slug).join(', '));
  if (invalid.length) console.warn('警告：以下插件缺少 search/getMediaSource：', invalid.map((p) => p.slug).join(', '));
}
