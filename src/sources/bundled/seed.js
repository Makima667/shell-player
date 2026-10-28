// 把内置音源并入 SourceManager。只在首次启动、或用户点「恢复内置音源」时执行：
// 用户删掉的不会被偷偷加回来，设置和变量也不会被覆盖。
import { BUNDLED_SOURCES, BUNDLE_VERSION, bundledId } from './index.js';

const REMOVED_KEY = 'bundledRemoved';
const VERSION_KEY = 'bundledVersion';

/**
 * @param {import('../manager.js').SourceManager} mgr
 * @param {{ store: { get(k,d): any, set(k,v): void }, force?: boolean }} opts
 */
export async function seedBundledSources(mgr, { store, force = false } = {}) {
  const done = store.get(VERSION_KEY, 0) || 0;
  if (!force && done >= BUNDLE_VERSION) return { added: 0, updated: 0, failed: [], skipped: true };

  const removed = new Set(store.get(REMOVED_KEY, []));
  const added = [];
  const updated = [];
  const failed = [];

  for (const item of BUNDLED_SOURCES) {
    const id = bundledId(item);
    if (!force && removed.has(id)) continue;
    const existed = mgr.entries.some(e => e.id === id) || mgr.runtime.has(id);
    try {
      await mgr.add(item.code, { id });
      (existed ? updated : added).push(item);
    } catch (e) {
      failed.push({ item, error: e?.message || String(e) });
    }
  }

  if (failed.length < BUNDLED_SOURCES.length) {
    store.set(VERSION_KEY, BUNDLE_VERSION);
    if (force) store.set(REMOVED_KEY, [...removed].filter(id => !BUNDLED_SOURCES.some(i => bundledId(i) === id)));
  }
  return { added, updated, failed, skipped: false };
}

/** 用户删掉内置音源时记一笔，避免以后自动加回来 */
export function rememberBundledRemoved(store, id) {
  if (!String(id).startsWith('b:')) return;
  const list = new Set(store.get(REMOVED_KEY, []));
  list.add(id);
  store.set(REMOVED_KEY, [...list]);
}
