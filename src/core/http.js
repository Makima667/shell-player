// 统一的网络请求。桌面/安卓里会被替换成 Tauri 的 HTTP 插件（没有跨域限制，可以设置 Referer、User-Agent 等请求头）

let fetchImpl = (...a) => globalThis.fetch(...a);
export function setFetch(f) { fetchImpl = f; }

const hasHeader = (h, name) => Object.keys(h).some(k => k.toLowerCase() === name);
const isPlainBody = b => b != null && typeof b === 'object'
  && !(b instanceof ArrayBuffer) && !ArrayBuffer.isView(b)
  && !(typeof FormData !== 'undefined' && b instanceof FormData)
  && !(typeof Blob !== 'undefined' && b instanceof Blob)
  && !(b instanceof URLSearchParams);

/**
 * @returns {Promise<{status:number,statusText:string,headers:Record<string,string>,data:any,ok:boolean,url:string}>}
 * responseType: json（解析失败时返回文本）| text | arraybuffer
 */
export async function http(url, opt = {}) {
  const { method = 'GET', headers = {}, body, timeout = 15000, responseType = 'json' } = opt;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  const h = { ...headers };
  let payload = body;
  if (isPlainBody(body)) {
    payload = JSON.stringify(body);
    if (!hasHeader(h, 'content-type')) h['Content-Type'] = 'application/json';
  } else if (body instanceof URLSearchParams) {
    payload = body.toString();
    if (!hasHeader(h, 'content-type')) h['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  try {
    const res = await fetchImpl(url, { method: method.toUpperCase(), headers: h, body: payload, signal: ctl.signal });
    const hdrs = {};
    res.headers.forEach((v, k) => { hdrs[k.toLowerCase()] = v; });
    let data;
    if (responseType === 'arraybuffer') data = await res.arrayBuffer();
    else {
      const text = await res.text();
      data = text;
      if (responseType === 'json') { try { data = JSON.parse(text); } catch { /* 保持文本 */ } }
    }
    return { status: res.status, statusText: res.statusText || '', headers: hdrs, data, ok: res.ok, url: res.url || url };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('请求超时：' + url);
    if (e instanceof TypeError) throw new Error('无法访问 ' + url + '（可能是跨域限制或网络不通）');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// 给"原生脚本源"用的简化版：直接返回数据，非 2xx 抛错
export async function request(url, opt = {}) {
  const { type = 'json', ...rest } = opt;
  const responseType = type === 'blob' || type === 'arraybuffer' ? 'arraybuffer' : type === 'text' ? 'text' : 'json';
  const res = await http(url, { ...rest, responseType });
  if (!res.ok) throw new Error('接口返回 HTTP ' + res.status);
  if (type === 'blob') return new Blob([res.data]);
  if (type === 'raw') return res;
  return res.data;
}
