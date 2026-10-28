// Shared helpers for reading LX / MusicFree source files out of this repo.
//
// Third-party source scripts are untrusted code, so every probe runs in a child
// process: a script that spins or allocates without bound is killed by the OS
// instead of taking the whole build down. Inside that child the script only sees
// a stubbed host: no fs, no network, no environment.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OWNER = 'Makima667';
export const REPO = 'shell-player';
export const BRANCH = 'main';

export const LX_DIR = path.join(ROOT, 'sources/lx');
export const MF_DIR = path.join(ROOT, 'sources/musicfree/plugins');
export const CATALOG_PATH = path.join(ROOT, 'sources/catalog.json');

export const SOURCE_KEYS = ['kw', 'kg', 'tx', 'wy', 'mg'];
const QUALITY_KEYS = ['128k', '320k', 'flac', 'flac24bit'];

export const jsdelivr = (p) => `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/${p}`;
export const fastly = (p) => `https://fastly.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/${p}`;
export const raw = (p) => `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${p}`;

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Gzip-in-base64 envelope that LX Music itself uses for stored source scripts. */
export const deflateScript = (script) =>
  'gz_' + zlib.deflateSync(Buffer.from(script, 'utf8')).toString('base64');

/** Inverse of deflateScript; LX also accepts a plain script string. */
export function inflateScript(script) {
  if (typeof script !== 'string') return '';
  if (!script.startsWith('gz_')) return script;
  return zlib.inflateSync(Buffer.from(script.slice(3), 'base64')).toString('utf8');
}

/** Deep callable stub used to satisfy `require()` of host-provided modules. */
export function stub(name) {
  const fn = function () { return proxy; };
  const proxy = new Proxy(fn, {
    get(_t, k) {
      if (k === 'then') return undefined;
      if (k === 'toString' || k === Symbol.toPrimitive) return () => `[stub:${name}]`;
      return stub(`${name}.${String(k)}`);
    },
    apply() { return proxy; },
    construct() { return proxy; },
  });
  return proxy;
}

function baseContext() {
  const sandbox = {
    console: { log() {}, info() {}, warn() {}, error() {}, debug() {}, group() {}, groupEnd() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    Buffer, URL, TextDecoder, TextEncoder,
  };
  sandbox.global = sandbox;
  sandbox.window = undefined;
  return sandbox;
}

const drain = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseLxHeader(code) {
  const out = { name: '', description: '', version: '', author: '', homepage: '' };
  const header = /^\/\*[\s\S]+?\*\//.exec(code);
  if (!header) return out;
  for (const key of Object.keys(out)) {
    const m = new RegExp(`^\\s?\\*\\s?@${key}\\s+(.+)$`, 'm').exec(header[0]);
    if (m) out[key] = m[1].trim();
  }
  return out;
}

/**
 * Execute an LX custom-source script with a fake `globalThis.lx`.
 *
 * `lx.request` answers with a synthetic transport error: that is enough for
 * offline-init sources to report their platforms, and it keeps network-init
 * sources from waiting forever on a callback that will never arrive.
 */
export async function probeLxInProcess(file, { timeout = 8000 } = {}) {
  const code = fs.readFileSync(file, 'utf8');
  const header = parseLxHeader(code);
  const result = {
    ...header,
    platforms: [], qualitys: {}, platformNames: {},
    inited: false, error: '', syntax: 'ok', hasRequestHandler: false,
    obfuscated: /_0x[0-9a-f]{4,}/i.test(code),
    initMode: 'unknown',
  };

  try {
    new vm.Script(code, { filename: file });
  } catch (e) {
    result.syntax = 'ERR: ' + e.message;
    result.initMode = 'broken';
    return result;
  }

  const sandbox = baseContext();
  const stubApi = stub('lx');
  sandbox.lx = {
    version: '2.0.0',
    env: 'desktop',
    // LX hands the parsed header plus the raw code to the script; several sources
    // verify these fields and refuse to initialise when one is missing.
    currentScriptInfo: { ...header, rawScript: code },
    EVENT_NAMES: { request: 'request', inited: 'inited', updateAlert: 'updateAlert' },
    on(event, handler) {
      if (event === 'request') result.hasRequestHandler = typeof handler === 'function';
    },
    request(_url, _options, callback) {
      if (typeof callback === 'function') {
        setImmediate(() => {
          try {
            callback(new Error('probe-offline'), { statusCode: 503, body: '' }, '');
          } catch { /* a throwing callback is the source's own problem */ }
        });
      }
      return () => {};
    },
    send(event, data) {
      if (event !== 'inited' || !data || typeof data !== 'object') return;
      result.inited = true;
      const sources = data.sources || {};
      for (const key of Object.keys(sources)) {
        if (key !== 'local' && !SOURCE_KEYS.includes(key)) continue;
        const info = sources[key] || {};
        result.platforms.push(key);
        if (Array.isArray(info.qualitys)) {
          result.qualitys[key] = info.qualitys.filter((q) => QUALITY_KEYS.includes(q));
        }
        if (typeof info.name === 'string') (result.platformNames[key] ??= info.name);
      }
    },
    utils: {
      buffer: { from: (...a) => Buffer.from(...a), bufToString: (b) => String(b) },
      crypto: stubApi,
      zlib: stubApi,
    },
  };
  sandbox.globalThis = sandbox;

  const swallow = () => {};
  process.on('unhandledRejection', swallow);
  process.on('uncaughtException', swallow);
  try {
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: file, timeout });
    await drain();
  } catch (e) {
    result.error = e && e.message ? e.message : String(e);
  } finally {
    process.off('unhandledRejection', swallow);
    process.off('uncaughtException', swallow);
  }

  if (result.inited) result.initMode = 'offline';
  else if (result.error) result.initMode = 'broken';
  else if (/request\s*\(/.test(code) || result.hasRequestHandler) result.initMode = 'network';
  return result;
}

const CORE_METHODS = ['search', 'getMediaSource'];

/**
 * Load a MusicFree plugin in a bare context with stubbed `require()`. MusicFree
 * discovers a plugin by executing it and reading `module.exports`, so a plugin
 * that throws here throws inside the app too.
 */
export function probePluginInProcess(file, { timeout = 8000 } = {}) {
  const code = fs.readFileSync(file, 'utf8');
  const result = {
    platform: '', version: '', author: '', methods: [], exportStyle: '', load: 'ok', error: '',
    syntax: 'ok', requires: [...new Set([...code.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]))],
    obfuscated: /_0x[0-9a-f]{4,}/i.test(code),
  };

  try {
    new vm.Script(code, { filename: file });
  } catch (e) {
    result.syntax = 'ERR: ' + e.message;
    result.load = 'failed';
    return result;
  }

  const sandbox = baseContext();
  const module = { exports: {} };
  sandbox.module = module;
  sandbox.exports = module.exports;
  sandbox.require = (n) => stub(n);
  sandbox.globalThis = sandbox;

  try {
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: file, timeout });
    let exp = module.exports;
    if (exp && typeof exp === 'object' && exp.default && typeof exp.default === 'object'
      && ('search' in exp.default || 'getMediaSource' in exp.default)) {
      result.exportStyle = 'default';
      exp = exp.default;
    } else {
      result.exportStyle = 'named';
    }
    if (!exp || typeof exp !== 'object') {
      result.load = 'failed';
      result.error = 'module.exports is not an object';
      return result;
    }
    result.methods = Object.keys(exp);
    result.platform = typeof exp.platform === 'string' ? exp.platform : '';
    result.version = typeof exp.version === 'string' ? exp.version : '';
    result.author = typeof exp.author === 'string' ? exp.author : '';
  } catch (e) {
    result.load = 'failed';
    result.error = e && e.message ? e.message : String(e);
  }
  return result;
}

const WORKER = path.join(ROOT, 'scripts/probe-worker.mjs');

/** Run one probe in an isolated child process with a hard memory and time cap. */
function runIsolated(kind, file, fallback) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'shellplayer-probe-')), 'result.json');
  const child = spawnSync(
    process.execPath,
    ['--max-old-space-size=256', WORKER, kind, file, out],
    { timeout: 30000, killSignal: 'SIGKILL', stdio: 'ignore' },
  );
  try {
    if (!fs.existsSync(out)) return { ...fallback, error: `probe worker exited (${child.status}${child.signal ? '/' + child.signal : ''})` };
    return JSON.parse(fs.readFileSync(out, 'utf8'));
  } catch (e) {
    return { ...fallback, error: 'probe worker produced unreadable output: ' + e.message };
  } finally {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
}

export function probeLx(file) {
  return runIsolated('lx', file, {
    name: '', description: '', version: '', author: '', homepage: '',
    platforms: [], qualitys: {}, platformNames: {}, inited: false,
    syntax: 'ok', hasRequestHandler: false, obfuscated: false, initMode: 'worker-failed',
  });
}

export function probePlugin(file) {
  return runIsolated('mf', file, {
    platform: '', version: '', author: '', methods: [], exportStyle: '',
    load: 'failed', syntax: 'ok', requires: [], obfuscated: false,
  });
}

export const hasCoreApi = (p) =>
  p.load === 'ok' && !!p.platform && CORE_METHODS.every((m) => p.methods.includes(m));

export function readCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

export function listFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
}
