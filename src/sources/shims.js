// 给 MusicFree 插件和洛雪源准备的运行环境：它们常用的 npm 包和 Node 风格 API
import { http } from '../core/http.js';

let cache;

export async function loadShims() {
  if (cache) return cache;
  const [CryptoJS, dayjs, qs, he, bigInt, cheerio, { Buffer }, pako, forge] = await Promise.all([
    import('crypto-js').then(m => m.default || m),
    import('dayjs').then(m => m.default || m),
    import('qs').then(m => m.default || m),
    import('he').then(m => m.default || m),
    import('big-integer').then(m => m.default || m),
    import('cheerio/slim').catch(() => null),
    import('buffer'),
    import('pako').then(m => m.default || m),
    import('node-forge').then(m => m.default || m)
  ]);
  const axios = createAxios(qs);
  const cookies = { get: async () => ({}), set: async () => true, flush: async () => true, clearAll: async () => true };
  const modules = {
    axios, 'crypto-js': CryptoJS, dayjs, qs, he, 'big-integer': bigInt, cheerio, buffer: { Buffer },
    '@react-native-cookies/cookies': cookies, pako
  };
  cache = { modules, Buffer, pako, forge, CryptoJS };
  return cache;
}

// 精简版 axios：覆盖插件里常见的用法（get/post/实例/params/headers/responseType）
export function createAxios(qs, defaults = {}) {
  const buildURL = (url, params) => {
    if (!params || (typeof params === 'object' && !Object.keys(params).length)) return url;
    const q = typeof params === 'string' ? params : qs.stringify(params);
    return url + (url.includes('?') ? '&' : '?') + q;
  };
  async function request(config) {
    const c = { ...defaults, ...config, headers: { ...(defaults.headers || {}), ...(config.headers || {}) } };
    let url = c.url || '';
    if (c.baseURL && !/^https?:/i.test(url)) url = c.baseURL.replace(/\/$/, '') + '/' + url.replace(/^\//, '');
    url = buildURL(url, c.params);
    let body = c.data;
    const ct = Object.entries(c.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] || '';
    if (body && typeof body === 'object' && /x-www-form-urlencoded/i.test(ct)) body = qs.stringify(body);
    const rt = c.responseType === 'arraybuffer' ? 'arraybuffer' : c.responseType === 'text' ? 'text' : 'json';
    const res = await http(url, { method: c.method || 'get', headers: c.headers, body, timeout: c.timeout || 20000, responseType: rt });
    const response = { data: res.data, status: res.status, statusText: res.statusText, headers: res.headers, config: c, request: { responseURL: res.url } };
    const ok = c.validateStatus ? c.validateStatus(res.status) : res.status >= 200 && res.status < 300;
    if (!ok) {
      const err = new Error('Request failed with status code ' + res.status);
      err.response = response; err.config = c;
      throw err;
    }
    return response;
  }
  const axios = (urlOrConfig, config) => typeof urlOrConfig === 'string' ? request({ ...config, url: urlOrConfig }) : request(urlOrConfig);
  axios.request = request;
  for (const m of ['get', 'delete', 'head', 'options']) axios[m] = (url, config = {}) => request({ ...config, url, method: m });
  for (const m of ['post', 'put', 'patch']) axios[m] = (url, data, config = {}) => request({ ...config, url, data, method: m });
  axios.create = (d = {}) => createAxios(qs, { ...defaults, ...d, headers: { ...(defaults.headers || {}), ...(d.headers || {}) } });
  axios.defaults = defaults;
  axios.interceptors = { request: { use() {} }, response: { use() {} } };
  axios.isAxiosError = e => !!(e && e.config);
  axios.default = axios;
  return axios;
}
