// 洛雪音乐（LX Music）自定义源运行时
// 规范参考：https://lxmusic.toside.cn/desktop/custom-source
// 洛雪源只提供"取播放地址 / 歌词 / 封面"，不提供搜索；歌曲需要来自能搜索的音源，并带上平台代号 lxKey
import { loadShims } from './shims.js';
import { http } from '../core/http.js';
import { parseHeader, withTimeout } from '../core/util.js';
import { toLxMusicInfo, LX_NAMES } from './platforms.js';

const EVENT_NAMES = { request: 'request', inited: 'inited', updateAlert: 'updateAlert' };
const QUALITY_ORDER = ['flac24bit', 'flac', '320k', '192k', '128k'];

export function looksLikeLx(code) {
  return /\blx\.(EVENT_NAMES|send|on|request)\b|globalThis\.lx\b|EVENT_NAMES\.(request|inited)/.test(code);
}

function makeUtils({ Buffer, pako, forge, CryptoJS }) {
  const bin = b => Buffer.from(b).toString('binary');
  return {
    crypto: {
      aesEncrypt(buffer, mode, key, iv) {
        const m = String(mode || 'aes-128-cbc').toLowerCase().match(/aes-\d+-(\w+)/);
        const cipher = forge.cipher.createCipher('AES-' + (m ? m[1].toUpperCase() : 'CBC'), bin(key));
        cipher.start(iv != null && iv !== '' ? { iv: bin(iv) } : {});
        cipher.update(forge.util.createBuffer(bin(buffer)));
        cipher.finish();
        return Buffer.from(cipher.output.getBytes(), 'binary');
      },
      rsaEncrypt(buffer, key) {
        const pub = forge.pki.publicKeyFromPem(String(key));
        const size = Math.ceil(pub.n.bitLength() / 8);
        const data = Buffer.from(buffer);
        const padded = Buffer.concat([Buffer.alloc(Math.max(0, size - data.length)), data]);
        return Buffer.from(pub.encrypt(padded.toString('binary'), 'RAW'), 'binary');
      },
      randomBytes(size) {
        const a = new Uint8Array(size);
        globalThis.crypto.getRandomValues(a);
        return Buffer.from(a);
      },
      md5: str => CryptoJS.MD5(typeof str === 'string' ? str : CryptoJS.enc.Latin1.parse(bin(str))).toString()
    },
    buffer: {
      from: (...a) => Buffer.from(...a),
      bufToString: (buf, format) => Buffer.from(buf).toString(format)
    },
    zlib: {
      inflate: buf => new Promise((res, rej) => { try { res(Buffer.from(pako.inflate(Buffer.from(buf)))); } catch (e) { rej(e); } }),
      deflate: buf => new Promise((res, rej) => { try { res(Buffer.from(pako.deflate(Buffer.from(buf)))); } catch (e) { rej(e); } })
    }
  };
}

export async function compileLx(code, { onUpdateAlert, env = 'desktop' } = {}) {
  const shims = await loadShims();
  const { Buffer } = shims;
  const meta = parseHeader(code);
  const handlers = {};
  let resolveInit;
  const inited = new Promise(r => { resolveInit = r; });

  const lx = {
    version: '2.0.0',
    env,
    EVENT_NAMES,
    currentScriptInfo: { name: meta.name || '', description: meta.description || '', version: meta.version || '', author: meta.author || '', homepage: meta.homepage || '', rawScript: code },
    request(url, opts = {}, callback = () => {}) {
      const { method = 'get', timeout, headers = {}, body, form, formData } = opts || {};
      let canceled = false;
      let payload = body;
      if (form) payload = new URLSearchParams(form);
      else if (formData) { payload = new FormData(); for (const [k, v] of Object.entries(formData)) payload.append(k, v); }
      http(url, { method, headers, body: payload, timeout: timeout || 15000, responseType: 'arraybuffer' })
        .then(res => {
          if (canceled) return;
          const raw = Buffer.from(res.data);
          let parsed = raw.toString();
          try { parsed = JSON.parse(parsed); } catch { /* 保持文本 */ }
          const resp = { statusCode: res.status, statusMessage: res.statusText, headers: res.headers, bytes: raw.length, raw, body: parsed };
          try { callback.call(this, null, resp, parsed); } catch (e) { console.error('[lx 源回调出错]', e); }
        })
        .catch(err => { if (!canceled) { try { callback.call(this, err, null, null); } catch (e) { console.error(e); } } });
      return () => { canceled = true; };
    },
    send(name, data) {
      if (name === EVENT_NAMES.inited) resolveInit(data || {});
      else if (name === EVENT_NAMES.updateAlert && onUpdateAlert) onUpdateAlert(data || {});
      return Promise.resolve();
    },
    on(name, handler) {
      handlers[name] = handler;
      return Promise.resolve();
    },
    utils: makeUtils(shims)
  };

  const sandbox = new Proxy({ lx }, {
    get(t, k) {
      if (k in t) return t[k];
      const v = globalThis[k];
      return typeof v === 'function' && typeof k === 'string' && /^[a-z]/.test(k) ? v.bind(globalThis) : v;
    },
    set(t, k, v) { t[k] = v; return true; }
  });

  try {
    new Function('globalThis', 'window', 'self', 'lx', code)(sandbox, sandbox, sandbox, lx);
  } catch (e) {
    throw new Error('洛雪源脚本执行出错：' + e.message);
  }
  const init = await withTimeout(inited, 10000, '洛雪源 10 秒内没有完成初始化（没有调用 lx.send(inited)）');
  if (typeof handlers[EVENT_NAMES.request] !== 'function') throw new Error('洛雪源没有注册 request 事件处理函数');

  const sources = init.sources || {};
  const caps = {};
  for (const [key, s] of Object.entries(sources)) {
    if (!s || (s.type && s.type !== 'music')) continue;
    caps[key] = { actions: s.actions || ['musicUrl'], qualitys: s.qualitys || ['128k'] };
  }
  const keys = Object.keys(caps).filter(k => caps[k].actions.includes('musicUrl'));
  const call = (source, action, info) => Promise.resolve(handlers[EVENT_NAMES.request]({ source, action, info }));

  const src = {
    kind: 'lx',
    name: meta.name || '洛雪自定义源',
    version: meta.version || '',
    author: meta.author || '',
    homepage: meta.homepage || '',
    description: (meta.description ? meta.description + '。' : '') + '支持：' + (keys.map(k => LX_NAMES[k] || k).join('、') || '无'),
    canSearch: false,
    canUrl: keys.length > 0,
    lxKeys: keys,
    async search() { return { list: [], hasMore: false }; },
    async getUrl(track, quality) {
      const key = track.lxKey;
      if (!key || !caps[key]) throw new Error(`这个洛雪源不支持「${LX_NAMES[key] || key || '未知'}」平台的歌曲`);
      const supported = caps[key].qualitys;
      const want = quality === 'hires' ? 'flac24bit' : quality;
      const start = Math.max(0, QUALITY_ORDER.indexOf(want));
      const order = [...QUALITY_ORDER.slice(start), ...QUALITY_ORDER.slice(0, start).reverse()].filter(q => supported.includes(q));
      const musicInfo = toLxMusicInfo(track, key);
      let lastErr;
      for (const q of order.length ? order : ['128k']) {
        try {
          const url = await withTimeout(call(key, 'musicUrl', { type: q, musicInfo }), 20000, '洛雪源取地址超时');
          if (typeof url === 'string' && /^https?:/i.test(url)) return { url, quality: q };
          lastErr = new Error('洛雪源返回的不是有效地址');
        } catch (e) { lastErr = e; }
      }
      throw lastErr || new Error('洛雪源没有返回播放地址');
    }
  };
  if (Object.values(caps).some(c => c.actions.includes('lyric'))) {
    src.getLyric = async track => {
      const key = track.lxKey;
      if (!key || !caps[key] || !caps[key].actions.includes('lyric')) return { lrc: '' };
      const r = await call(key, 'lyric', { musicInfo: toLxMusicInfo(track, key) });
      return { lrc: (r && r.lyric) || '', trans: (r && r.tlyric) || '' };
    };
  }
  return src;
}
