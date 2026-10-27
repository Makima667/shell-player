// 音源管理：保存、编译、启停，以及"取播放地址"的调度（本源 → 洛雪源 → 自动换源）
// 每次搜索、取地址都会记下成功与否和耗时，换源时先试最近表现好的音源
import { compileSource } from './compile.js';
import { pickMatches } from '../core/match.js';
import { parseDur, uid, withTimeout } from '../core/util.js';
import { LX_NAMES } from './platforms.js';

export class SourceManager {
  /**
   * @param {{ store: {get(k,d):any, set(k,v):void}, builtins: [string, object][], onUpdateAlert?: Function, env?: string }} o
   */
  constructor({ store, builtins = [], onUpdateAlert, env }) {
    this.store = store;
    this.builtins = builtins;
    this.onUpdateAlert = onUpdateAlert;
    this.env = env;
    this.entries = store.get('sources', []);          // [{ id, code, kind, name, url? }]
    this.disabled = new Set(store.get('disabled', []));
    this.vars = store.get('sourceVars', {});           // { [id]: { key: value } }
    this.runtime = new Map();                          // id -> adapter | { error }
    this.stats = store.get('sourceStats', {});         // { [id]: { ok, fail, ms } }
    this.lookups = new Map();                          // 本地歌曲在联网音源里对应的歌（借歌词、封面）
    this.urlTimeout = 15000;
  }

  /* ---------- 音源健康度 ---------- */
  record(id, ok, ms) {
    if (!id || this.runtime.get(id)?.builtin) return;
    const s = this.stats[id] || (this.stats[id] = { ok: 0, fail: 0, ms: 0 });
    // 只看最近的表现：次数多了以后旧记录按比例淡出
    if (s.ok + s.fail >= 40) { s.ok *= 0.8; s.fail *= 0.8; }
    if (ok) { s.ok++; if (ms != null) s.ms = s.ms ? Math.round(s.ms * 0.7 + ms * 0.3) : Math.round(ms); }
    else s.fail++;
    clearTimeout(this.statsTimer);
    this.statsTimer = setTimeout(() => this.store.set('sourceStats', this.stats), 1500);
    this.statsTimer.unref?.();
  }
  // { rate: 0~1, ms, n }，还没用过时返回 null
  health(id) {
    const s = this.stats[id];
    const n = s ? s.ok + s.fail : 0;
    return n >= 1 ? { rate: s.ok / n, ms: s.ms, n: Math.round(n) } : null;
  }
  // 成功率为主、速度为辅；没有记录的音源按中等水平算
  score(id) {
    const s = this.stats[id] || { ok: 0, fail: 0, ms: 0 };
    return (s.ok + 1) / (s.ok + s.fail + 2) - Math.min(0.25, (s.ms || 0) / 40000);
  }
  byHealth(ids) {
    return ids.map((id, i) => [id, this.score(id), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(x => x[0]);
  }

  save() {
    this.store.set('sources', this.entries);
    this.store.set('disabled', [...this.disabled]);
    this.store.set('sourceVars', this.vars);
  }

  // ref.id 可以在编译后再确定（新加音源时），插件运行时读取的是最终 id 对应的设置
  async compile(code, ref) {
    return compileSource(code, { userVars: () => this.vars[ref.id] || {}, onUpdateAlert: d => this.onUpdateAlert?.(ref.id, d), env: this.env });
  }

  async loadAll() {
    this.runtime.clear();
    for (const [id, adapter] of this.builtins) this.runtime.set(id, { ...adapter, id, builtin: true });
    await Promise.all(this.entries.map(async e => {
      try { this.runtime.set(e.id, { ...(await this.compile(e.code, { id: e.id })), id: e.id }); }
      catch (err) { this.runtime.set(e.id, { id: e.id, name: e.name || '加载失败的音源', kind: e.kind, error: err.message }); }
    }));
    // 保持用户添加顺序
    const order = [...this.builtins.map(b => b[0]), ...this.entries.map(e => e.id)];
    this.runtime = new Map(order.filter(id => this.runtime.has(id)).map(id => [id, this.runtime.get(id)]));
  }

  async add(code, { id: editId, url } = {}) {
    // 同一个音源（相同 id / 同名 MusicFree 插件）重复导入时视为更新
    const ref = { id: editId };
    const c = await this.compile(code, ref);
    const id = ref.id = editId || 'u:' + (c.kind === 'musicfree' ? 'mf-' + c.name : (c.id || uid()));
    const entry = { id, code, kind: c.kind, name: c.name, url: url || this.entries.find(e => e.id === id)?.url };
    const i = this.entries.findIndex(e => e.id === id);
    i >= 0 ? this.entries.splice(i, 1, entry) : this.entries.push(entry);
    this.disabled.delete(id);
    this.runtime.set(id, { ...c, id });
    this.save();
    return { id, adapter: this.runtime.get(id), updated: i >= 0 };
  }

  remove(id) {
    this.entries = this.entries.filter(e => e.id !== id);
    this.disabled.delete(id);
    delete this.vars[id];
    delete this.stats[id];
    this.runtime.delete(id);
    this.save();
  }

  setEnabled(id, on) { on ? this.disabled.delete(id) : this.disabled.add(id); this.save(); }
  setVars(id, v) { this.vars[id] = v; this.save(); }
  get(id) { return this.runtime.get(id); }
  name(id) { return this.runtime.get(id)?.name || id; }
  isOn(id) { const r = this.runtime.get(id); return !!r && !r.error && !this.disabled.has(id); }
  enabled() { return [...this.runtime.keys()].filter(id => this.isOn(id)); }
  searchable() { return this.enabled().filter(id => this.runtime.get(id).canSearch); }
  lxProviders(key) { return this.byHealth(this.enabled().filter(id => (this.runtime.get(id).lxKeys || []).includes(key))); }
  sheetSources() { return this.enabled().filter(id => typeof this.runtime.get(id).importSheet === 'function'); }

  normTrack(raw, sourceId) {
    const src = this.runtime.get(sourceId);
    return {
      ...raw,
      id: String(raw.id ?? raw.title),
      title: raw.title || raw.name || '未知歌曲',
      artist: raw.artist || raw.singer || '未知歌手',
      album: raw.album || '',
      duration: parseDur(raw.duration),
      cover: raw.cover || raw.artwork || '',
      lxKey: raw.lxKey || src?.lxKey || null,
      sourceId
    };
  }

  // 每个音源单独限时，慢的不拖累快的；onPartial 在每个音源返回时回调，界面可以边搜边出
  async search(ids, keyword, page = 1, { timeout = 15000, onPartial } = {}) {
    const results = [], errors = [], seen = new Set();
    let hasMore = false;
    await Promise.all(ids.map(async id => {
      const t0 = Date.now();
      try {
        const r = await withTimeout(Promise.resolve().then(() => this.runtime.get(id).search(keyword, page)), timeout, `超过 ${Math.round(timeout / 1000)} 秒没有响应`);
        this.record(id, true, Date.now() - t0);
        const list = (r?.list || []).map(x => this.normTrack(x, id)).filter(t => {
          const k = id + '::' + t.id;
          return seen.has(k) ? false : seen.add(k);
        });
        results.push(...list);
        hasMore = hasMore || !!r?.hasMore;
        onPartial?.({ id, list });
      } catch (e) {
        this.record(id, false);
        errors.push([id, e?.message || String(e)]);
        onPartial?.({ id, error: e?.message || String(e) });
      }
    }));
    // 最终结果按音源顺序排列，保证多次搜索顺序稳定
    const order = new Map(ids.map((id, i) => [id, i]));
    results.sort((a, b) => order.get(a.sourceId) - order.get(b.sourceId));
    return { results, errors, hasMore };
  }

  // 按顺序尝试：本源 → 支持该平台的洛雪源 → （可选）在其他音源里搜同一首歌
  async resolveUrl(track, quality, { failover = true, onStep } = {}) {
    const tried = [];
    const attempt = async (id, t) => {
      const src = this.runtime.get(id);
      if (!src || !src.canUrl || !this.isOn(id)) return null;
      const t0 = Date.now();
      try {
        onStep?.(src.name);
        const r = await withTimeout(Promise.resolve().then(() => src.getUrl(t, quality)), this.urlTimeout, '获取播放地址超时');
        if (r && r.url) { this.record(id, true, Date.now() - t0); return { ...r, via: id, track: t }; }
        tried.push(`${src.name}：没有返回地址`);
      } catch (e) { tried.push(`${src.name}：${e.message}`); }
      this.record(id, false);
      return null;
    };
    const viaLx = async t => {
      if (!t.lxKey) return null;
      for (const id of this.lxProviders(t.lxKey)) { const r = await attempt(id, t); if (r) return r; }
      return null;
    };

    let r = (await attempt(track.sourceId, track)) || (await viaLx(track));
    if (r) return r;
    if (!this.isOn(track.sourceId)) tried.unshift(`${this.name(track.sourceId)}：音源已停用或不存在`);

    if (failover) {
      const kw = `${track.title} ${String(track.artist).split(/[/、,，&]/)[0]}`.trim();
      for (const id of this.byHealth(this.searchable().filter(id => id !== track.sourceId))) {
        let list;
        try { list = (await withTimeout(Promise.resolve().then(() => this.runtime.get(id).search(kw, 1)), this.urlTimeout, '搜索超时')).list.map(x => this.normTrack(x, id)); }
        catch (e) { tried.push(`${this.name(id)} 搜索：${e.message}`); continue; }
        for (const cand of pickMatches(track, list).slice(0, 2)) {
          r = (await attempt(id, cand)) || (await viaLx(cand));
          if (r) return { ...r, switched: true };
        }
      }
    }
    if (!tried.length) tried.push(track.lxKey ? `没有可以播放「${LX_NAMES[track.lxKey] || track.lxKey}」歌曲的音源` : '没有可用的音源');
    const err = new Error(tried.slice(0, 4).join('\n'));
    err.tried = tried;
    throw err;
  }

  // 导入歌单：把链接交给支持导入的音源，第一个认得这个链接的音源给出歌曲列表
  async importSheet(url, { timeout = 30000 } = {}) {
    const ids = this.byHealth(this.sheetSources());
    if (!ids.length) throw new Error('当前启用的音源都不支持导入歌单');
    const tried = [];
    for (const id of ids) {
      try {
        const list = await withTimeout(Promise.resolve().then(() => this.runtime.get(id).importSheet(url)), timeout, '导入超时');
        if (Array.isArray(list) && list.length) return { via: id, tracks: list.map(x => this.normTrack(x, id)) };
        tried.push(`${this.name(id)}：不认识这个链接`);
      } catch (e) { tried.push(`${this.name(id)}：${e.message}`); }
    }
    throw new Error(tried.slice(0, 4).join('\n'));
  }

  // 本地 / 已下载的歌没有歌词或封面时，在联网音源里找同一首歌借用。结果按歌缓存
  lookupOnline(track) {
    const key = track.sourceId + '::' + track.id;
    if (!this.lookups.has(key)) {
      this.lookups.set(key, (async () => {
        const artist = /^未知/.test(track.artist || '') ? '' : String(track.artist || '');
        const want = { ...track, artist };
        const kw = `${track.title} ${artist.split(/[/、,，&]/)[0]}`.trim();
        for (const id of this.byHealth(this.searchable().filter(id => !this.runtime.get(id).builtin))) {
          try {
            const r = await withTimeout(Promise.resolve().then(() => this.runtime.get(id).search(kw, 1)), this.urlTimeout, '搜索超时');
            const m = pickMatches(want, (r?.list || []).map(x => this.normTrack(x, id)), artist ? 4 : 3)[0];
            if (m) return m;
          } catch { /* 换下一个 */ }
        }
        return null;
      })());
    }
    return this.lookups.get(key);
  }

  async resolveLyric(track, playedVia) {
    if (track.lyric) return { lrc: track.lyric };
    const order = [track.sourceId, playedVia?.via, ...(track.lxKey ? this.lxProviders(track.lxKey) : [])].filter((v, i, a) => v && a.indexOf(v) === i);
    for (const id of order) {
      const src = this.runtime.get(id);
      if (!src || !src.getLyric || !this.isOn(id)) continue;
      const t = id === playedVia?.via && playedVia.track ? playedVia.track : track;
      try {
        const r = await withTimeout(Promise.resolve().then(() => src.getLyric(t)), this.urlTimeout, '获取歌词超时');
        if (r && r.lrc) return r;
      } catch { /* 换下一个 */ }
    }
    // 本地歌曲自己没有歌词：用联网音源里的同一首歌的歌词
    if (this.runtime.get(track.sourceId)?.builtin && track.sourceId !== 'demo') {
      const m = await this.lookupOnline(track);
      if (m) {
        const r = await this.resolveLyric(m, null);
        if (r.lrc) return { ...r, borrowed: this.name(m.sourceId) };
      }
    }
    return { lrc: '' };
  }
}
