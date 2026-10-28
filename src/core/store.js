// localStorage 封装：读写失败（隐私模式、存储满）时不影响使用
const PREFIX = 'shell-player:';
export const store = {
  get(k, d) {
    try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { console.warn('保存失败', k, e); }
  },
  remove(k) { try { localStorage.removeItem(PREFIX + k); } catch { /* 忽略 */ } }
};
