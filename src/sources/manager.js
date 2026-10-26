// 音源管理：保存、编译、启停，以及"取播放地址"的调度（本源 → 洛雪源 → 自动换源）
import { compileSource } from './compile.js';
import { pickMatches } from '../core/match.js';
import { parseDur, uid } from '../core/util.js';
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
  lxProviders(key) { return this.enabled().filter(id => (this.runtime.get(id).lxKeys || []).includes(key)); }

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

  async search(ids, keyword, page = 1) {
    const settled = await Promise.allSettled(ids.map(async id => {
      const r = await this.runtime.get(id).search(keyword, page);
      return { id, list: (r.list || []).map(x => this.normTrack(x, id)), hasMore: !!r.hasMore };
    }));
    const results = [], errors = [];
    let hasMore = false;
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') { results.push(...s.value.list); hasMore = hasMore || s.value.hasMore; }
      else errors.push([ids[i], s.reason?.message || String(s.reason)]);
    });
    return { results, errors, hasMore };
  }

  // 按顺序尝试：本源 → 支持该平台的洛雪源 → （可选）在其他音源里搜同一首歌
  async resolveUrl(track, quality, { failover = true, onStep } = {}) {
    const tried = [];
    const attempt = async (id, t) => {
      const src = this.runtime.get(id);
      if (!src || !src.canUrl || !this.isOn(id)) return null;
      try {
        onStep?.(src.name);
        const r = await src.getUrl(t, quality);
        if (r && r.url) return { ...r, via: id, track: t };
        tried.push(`${src.name}：没有返回地址`);
      } catch (e) { tried.push(`${src.name}：${e.message}`); }
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
      for (const id of this.searchable().filter(id => id !== track.sourceId)) {
        let list;
        try { list = (await this.runtime.get(id).search(kw, 1)).list.map(x => this.normTrack(x, id)); }
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

  async resolveLyric(track, playedVia) {
    if (track.lyric) return { lrc: track.lyric };
    const order = [track.sourceId, playedVia?.via, ...(track.lxKey ? this.lxProviders(track.lxKey) : [])].filter((v, i, a) => v && a.indexOf(v) === i);
    for (const id of order) {
      const src = this.runtime.get(id);
      if (!src || !src.getLyric || !this.isOn(id)) continue;
      const t = id === playedVia?.via && playedVia.track ? playedVia.track : track;
      try {
        const r = await src.getLyric(t);
        if (r && r.lrc) return r;
      } catch { /* 换下一个 */ }
    }
    return { lrc: '' };
  }
}
