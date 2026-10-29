import './styles.css';
import { esc, fmt, hue, uid } from './core/util.js';
import { parseLrc, mergeTranslation, lineAt } from './core/lrc.js';
import { http } from './core/http.js';
import { store } from './core/store.js';
import { SourceManager } from './sources/manager.js';
import { SubscriptionError, detectKind, compileSource } from './sources/compile.js';
import { demoSource, DEMO_SONGS } from './sources/demo.js';
import { localSource } from './sources/local.js';
import { LX_NAMES } from './sources/platforms.js';
import { seedBundledSources, rememberBundledRemoved } from './sources/bundled/seed.js';
import { TEMPLATES, DOC_HTML } from './ui/docs.js';
import { extractColors, Visualizer } from './ui/fx.js';
import { enableRipple, burst, flyCover, Spinner, moveIndicator, fadeVolume } from './ui/anim.js';
import { enableReorder, enableSwipe } from './ui/gestures.js';
import { initPlatform, isTauri, isMobile, isDesktopApp, platformName, downloadTrack, fileSrc, readTextFile, desktopLyrics, nativeMedia, nativeLyric, desktopApp, localMusic, appUpdate, openExternal, globalKeys } from './platform.js';

const VERSION = '0.2.1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const audio = $('#audio');

/* ================= 图标 ================= */
const svg = d => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const IC = {
  play: svg('M8 5.5v13l11-6.5z'),
  heart: svg('M12 21 10.6 19.7C5.4 15 2 11.9 2 8.1 2 5 4.4 2.6 7.5 2.6c1.7 0 3.4.8 4.5 2.1a6 6 0 0 1 4.5-2.1C19.6 2.6 22 5 22 8.1c0 3.8-3.4 6.9-8.6 11.6z'),
  more: svg('M12 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z'),
  del: svg('M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z'),
  add: svg('M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z'),
  loop: svg('M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z'),
  one: svg('M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2zm-4-2V9h-1l-2 1v1h1.5v4z'),
  shuffle: svg('M14.8 4H20v5.2l-1.9-1.9L5.4 20 4 18.6 16.7 5.9zM4 5.4 5.4 4l5.2 5.2-1.4 1.4zm11.2 9.8 1.4-1.4 1.5 1.5L20 13.4V20h-6.6l1.9-1.9z'),
  next: svg('M3 5h12v2H3zm0 4h12v2H3zm0 4h8v2H3zm13-4 6 4.5-6 4.5z'),
  queue: svg('M3 5h14v2H3zm0 6h14v2H3zm0 6h9v2H3zm14-2.5V7h4v2h-2v8.5a2.5 2.5 0 1 1-2-2.45z'),
  list: svg('M3 5h12v2H3zm0 4h12v2H3zm0 4h8v2H3zm13 0v-3h2v3h3v2h-3v3h-2v-3h-3v-2z'),
  dl: svg('M11 3h2v9.2l3.6-3.6L18 10l-6 6-6-6 1.4-1.4 3.6 3.6zM4 18h16v2H4z'),
  trash: svg('M8 3h8l1 2h4v2H3V5h4zm-2 6h12l-1 12H7z'),
  grip: svg('M8 5h3v3H8zm5 0h3v3h-3zM8 10.5h3v3H8zm5 0h3v3h-3zM8 16h3v3H8zm5 0h3v3h-3z'),
  clock: svg('M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm-1 3h2v4.6l3.4 2-1 1.7L11 12.7z'),
  moon: svg('M14.5 2.5A9.5 9.5 0 1 0 21.5 15 7.5 7.5 0 0 1 14.5 2.5z'),
  history: svg('M13 3a9 9 0 1 1-8.5 12h2.1A7 7 0 1 0 6 9.3L8.7 12H2V5.3l2.6 2.6A9 9 0 0 1 13 3zm-1 5h2v4.6l3.4 2-1 1.7-4.4-2.6z'),
  plug: svg('M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm12 0h2v3h3v2h-3v3h-2v-3h-3v-2h3z'),
  doc: svg('M6 2h9l5 5v15H6zm8 1.5V8h4.5zM8 12h8v2H8zm0 4h8v2H8z'),
  folder: svg('M3 5h7l2 2h9v12H3zm2 4v8h14V9z'),
  disk: svg('M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z'),
  link: svg('M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a3 3 0 0 1 4.2 4.2l-2.1 2.1-1.4-1.4 2.1-2.1a1 1 0 0 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0zm2.8-2.8a1 1 0 0 1 0 1.4l-3.5 3.5a3 3 0 0 1-4.2-4.2l2.1-2.1 1.4 1.4-2.1 2.1a1 1 0 0 0 1.4 1.4l3.5-3.5a1 1 0 0 1 1.4 0z')
};
const MODES = { loop: '列表循环', one: '单曲循环', shuffle: '随机播放' };
const QUALITIES = [['128k', '标准'], ['320k', '高品'], ['flac', '无损']];
// 桌面歌词颜色：跟随封面取色，或固定的色相
const DL_COLORS = [['cover', '跟随封面'], ['200', '青蓝'], ['330', '樱粉'], ['145', '薄荷'], ['42', '琥珀']];

/* ================= 状态 ================= */
const S = {
  queue: store.get('queue', null),
  cur: store.get('cur', -1),
  mode: store.get('mode', 'loop'),
  settings: Object.assign({
    quality: '320k', dlQuality: 'same', failover: true, skipOnError: true, theme: 'system', motion: true, fade: true,
    lyricTrans: true, lyricSize: 'm', dlyric: false, dlyricLock: false, dlyricSize: 34, dlyricColor: 'cover', closeToTray: true,
    autoUpdateSources: true, autoCheckUpdate: true, localMinDur: 30,
    mlyric: false, mlyricLock: false, mlyricSize: 17, tickerLyric: true, globalKeys: true
  }, store.get('settings', {})),
  history: store.get('history', []),
  searchHist: store.get('searchHist', []),
  resume: store.get('resume', null),
  playlists: store.get('playlists', [{ id: 'fav', name: '我喜欢', tracks: [] }]),
  downloads: store.get('downloads', []),
  view: 'search', plId: 'fav',
  results: [], kw: '', page: 1, hasMore: false, searching: false, searchSel: '*',
  lyric: [], lyricIdx: -1, playedVia: null, token: 0, failStreak: 0, failed: new Set(),
  plannedNext: -1, prefetch: new Map(), fromCache: false, pendingSeek: null, sleep: null,
  localList: [], localShown: 300, lyricShift: store.get('lyricShift', {})
};
const keyOf = t => t ? t.sourceId + '::' + t.id : '';
// 保存时去掉歌词正文和内嵌封面（本地歌曲的封面是现读的 data URL，体积大）
const lean = t => { const { lyric, ...rest } = t; if (String(rest.cover || '').startsWith('data:')) delete rest.cover; return rest; };
const saveQueue = () => { store.set('queue', S.queue.map(lean)); store.set('cur', S.cur); };
const savePlaylists = () => store.set('playlists', S.playlists);
const saveSettings = () => store.set('settings', S.settings);
const curTrack = () => S.queue[S.cur];
const playlist = id => S.playlists.find(p => p.id === id);
const isLiked = t => !!t && playlist('fav').tracks.some(x => keyOf(x) === keyOf(t));
const motionOK = () => S.settings.motion && !matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = () => isMobile() || matchMedia('(pointer: coarse)').matches;

/* ================= 已下载（桌面/安卓） ================= */
const downloadedSource = {
  kind: 'builtin', name: '已下载', version: '1.0.0',
  description: '下载到本机的歌曲，可离线播放。',
  canSearch: true, canUrl: true,
  async search(keyword) {
    const k = keyword.trim().toLowerCase();
    return { list: S.downloads.filter(d => d.path && (!k || (d.track.title + d.track.artist).toLowerCase().includes(k))).map(d => ({ ...d.track, id: d.path, path: d.path, lyricPath: d.lyricPath })), hasMore: false };
  },
  async getUrl(track) { return { url: await fileSrc(track.path || track.id) }; },
  async getLyric(track) { try { return { lrc: track.lyricPath ? await readTextFile(track.lyricPath) : '' }; } catch { return { lrc: '' }; } }
};

let sources;
let toastTimer;
function toast(msg, ms = 2800) {
  const el = $('#toast');
  el.hidden = true; void el.offsetWidth;
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/* ================= 返回键 ================= */
// 打开全屏播放、弹窗、菜单或切到其他页面时压一条历史记录，
// 安卓返回键 / 浏览器后退先关浮层、再回到搜索页，而不是直接退出
// history.back() 是异步的，退栈没完成前的入栈先排队，保证顺序
const Back = {
  skip: 0, busy: false, queue: [],
  push(state) {
    if (typeof state === 'string') state = { layer: state };
    if (this.busy) this.queue.push(state); else history.pushState(state, '');
  },
  // 用界面按钮关掉浮层时，把对应的历史记录也退掉
  pop(match) {
    const st = history.state || {};
    if (this.busy || !(typeof match === 'string' ? st.layer === match : match(st))) return;
    this.busy = true; this.skip++;
    history.back();
  }
};
window.addEventListener('popstate', () => {
  if (Back.skip) {
    Back.skip--; Back.busy = false;
    Back.queue.splice(0).forEach(st => history.pushState(st, ''));
    return;
  }
  if (!$('#menu').hidden) return closeMenu(true);
  if (!$('#modal').hidden) return closeDialog(true);
  if (!$('#full').hidden) return closeFull(true);
  if (S.view !== 'search') switchView('search', null, true);
});

/* ================= 封面与取色 ================= */
// 没有封面时的占位：柔和底色上一个音符
const NOTE = '<svg class="ph-note" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3h9v4h-6v10.5A3.5 3.5 0 1 1 10 14.3z"/></svg>';
function coverHTML(t, cls = 'cover') {
  const h = hue((t && (t.album || t.title)) || '空');
  // 扫描出来的本地歌曲：列表里滚动到时再读小封面
  const thumb = t && !t.cover && t.path && t.sourceId === 'local' && isTauri ? thumbCache.get(t.path) : undefined;
  const src = (t && t.cover) || thumb;
  const img = src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  const lazy = t && !src && thumb === undefined && t.path && t.sourceId === 'local' && isTauri ? ` data-lc="${esc(t.path)}"` : '';
  return `<div class="${cls}" style="--ch:${h}"${lazy}>${NOTE}${img}</div>`;
}
const thumbCache = new Map();
const thumbIO = typeof IntersectionObserver === 'function' && new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const el = e.target, path = el.dataset.lc;
    thumbIO.unobserve(el); el.removeAttribute('data-lc');
    const p = thumbCache.has(path) ? Promise.resolve(thumbCache.get(path)) : localMusic.cover(path, 160).then(c => { thumbCache.set(path, c || null); return c; });
    p.then(c => { if (c && el.isConnected && !el.querySelector('img')) el.insertAdjacentHTML('beforeend', `<img src="${c}" alt="">`); });
  }
}, { rootMargin: '200px' });
// 列表重画后把新出现的本地封面交给观察器
if (thumbIO) new MutationObserver(() => $$('[data-lc]:not([data-lo])').forEach(el => { el.dataset.lo = '1'; thumbIO.observe(el); })).observe(document.body, { childList: true, subtree: true });
let colorToken = 0;
async function applyColors(t) {
  const my = ++colorToken;
  const [h1, h2, h3] = await extractColors(t);
  if (my !== colorToken) return;
  const r = document.documentElement.style;
  r.setProperty('--h', h1); r.setProperty('--h2', h2); r.setProperty('--h3', h3);
  viz.color = `hsl(${h1} 90% 75% / .8)`;
  if (S.settings.dlyricColor === 'cover') desktopLyrics.send({ hue: h1 });
}

/* ================= 歌曲列表 ================= */
function rowHTML(t, i, ctx) {
  const playing = keyOf(t) === keyOf(curTrack());
  const failed = S.failed.has(keyOf(t));
  const liked = isLiked(t);
  const extra = ctx === 'q'
    ? `<button class="icon-btn" data-act="remove" aria-label="从播放列表移除" title="移除">${IC.del}</button><span class="icon-btn drag" title="拖动排序" aria-hidden="true">${IC.grip}</span>`
    : `<button class="icon-btn" data-act="more" aria-label="更多操作" title="更多">${IC.more}</button>`;
  return `<div class="trk${playing ? ' playing' : ''}${failed ? ' failed' : ''}" data-i="${i}" style="--i:${i}">
    <span class="idx mono">${playing ? '<span class="eq"><i></i><i></i><i></i></span>' : i + 1}</span>${coverHTML(t)}
    <div class="t-main"><div class="t-title" title="${esc(t.title)}">${esc(t.title)}</div><div class="t-sub">${esc(t.artist)}${t.lxKey ? ` · ${esc(LX_NAMES[t.lxKey] || t.lxKey)}` : ''}</div></div>
    <div class="t-album" title="${esc(t.album)}">${esc(t.album)}</div>
    <span class="chip chip-cell${t.sourceId === 'demo' ? ' accent' : ''}" title="${esc(sources.name(t.sourceId))}">${esc(sources.name(t.sourceId))}</span>
    <span class="t-dur mono">${fmt(t.duration)}</span>
    <div class="t-act"><button class="icon-btn heart${liked ? ' on' : ''}" data-act="like" aria-label="${liked ? '取消喜欢' : '喜欢'}" title="喜欢">${IC.heart}</button>${extra}</div>
  </div>`;
}
const listHead = `<div class="trk list-head"><span class="idx">#</span><span></span><span>歌曲</span><span class="t-album">专辑</span><span class="chip-cell">音源</span><span class="t-dur">时长</span><span></span></div>`;
const tracksHTML = (list, ctx, quiet) => `<div class="tracks${quiet ? ' quiet' : ''}" data-ctx="${ctx}">${listHead}${list.map((t, i) => rowHTML(t, i, ctx)).join('')}</div>`;

function listFor(ctx) {
  if (ctx === 'r') return S.results;
  if (ctx === 'q') return S.queue;
  if (ctx === 'p') return playlist(S.plId)?.tracks || [];
  if (ctx === 'h') return S.history;
  if (ctx === 'l') return S.localList;
  if (ctx === 'd') return S.downloads.map(d => d.path ? { ...d.track, id: d.path, path: d.path, lyricPath: d.lyricPath, sourceId: 'downloaded' } : d.track);
  return [];
}

function markPlaying() {
  $$('.tracks').forEach(box => {
    const list = listFor(box.dataset.ctx);
    $$('.trk[data-i]', box).forEach(el => {
      const t = list[+el.dataset.i];
      const on = !!t && keyOf(t) === keyOf(curTrack());
      if (on !== el.classList.contains('playing')) {
        el.classList.toggle('playing', on);
        $('.idx', el).innerHTML = on ? '<span class="eq"><i></i><i></i><i></i></span>' : +el.dataset.i + 1;
      }
      el.classList.toggle('failed', !!t && S.failed.has(keyOf(t)));
    });
  });
}
function refreshHearts() {
  $$('.tracks').forEach(box => {
    const list = listFor(box.dataset.ctx);
    $$('.trk[data-i]', box).forEach(el => { const b = $('[data-act="like"]', el); if (b) b.classList.toggle('on', isLiked(list[+el.dataset.i])); });
  });
  const on = isLiked(curTrack());
  $$('#barLike, [data-now="like"]').forEach(b => b.classList.toggle('on', on));
  $('#favCount').textContent = playlist('fav').tracks.length || '';
}

function playFromList(list, i) {
  const t = list[i];
  const qi = S.queue.findIndex(q => keyOf(q) === keyOf(t));
  if (qi >= 0) return playIndex(qi);
  S.queue.splice(S.cur + 1, 0, t);
  renderQueue();
  playIndex(S.cur + 1);
}
// 随机播放：切到随机模式再从列表里随便挑一首开始
function playShuffled(list) {
  if (!list.length) return;
  if (S.mode !== 'shuffle') { S.mode = 'shuffle'; store.set('mode', S.mode); renderMode(); toast('随机播放'); }
  playAll(list);
}
const shuffleBtn = id => `<button class="btn" id="${id}">${IC.shuffle}随机播放</button>`;
function playAll(list) {
  if (!list.length) return;
  S.queue = list.slice();
  renderQueue();
  playIndex(S.mode === 'shuffle' ? Math.floor(Math.random() * list.length) : 0);
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  const row = e.target.closest('.trk[data-i]');
  const box = e.target.closest('.tracks');
  if (!row || !box) return;
  const ctx = box.dataset.ctx, list = listFor(ctx), i = +row.dataset.i, t = list[i];
  if (!t) return;
  const act = btn?.dataset.act;
  if (act === 'like') { toggleLike(t, btn); }
  else if (act === 'more') { trackMenu(t, btn, ctx, i); }
  else if (act === 'remove') { removeFromQueue(i); }
  else if (!btn && coarse()) { ctx === 'q' ? playIndex(i) : playFromList(list, i); }
});
// 右键（手机上长按）弹出歌曲菜单
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.trk[data-i]'), box = e.target.closest('.tracks');
  if (!row || !box || e.target.closest('input, textarea')) return;
  const ctx = box.dataset.ctx, i = +row.dataset.i, t = listFor(ctx)[i];
  if (!t) return;
  e.preventDefault();
  navigator.vibrate?.(8);
  trackMenu(t, { x: e.clientX, y: e.clientY }, ctx, i);
});
// 空状态里的快捷按钮
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (!g) return;
  const go = g.dataset.go;
  if (go === 'addsrc') { switchView('sources'); sourceDialog(); }
  else if (go === 'demo') demoSource.search('').then(r => playAll(r.list.map(t => sources.normTrack(t, 'demo'))));
  else if (go === 'local') { if (localMusic.available()) switchView('local'); else { switchView('sources'); $('#localPick').click(); } }
  else if (go === 'importpl') importSheetDialog();
  else switchView(go, g.dataset.pl);
});
document.addEventListener('dblclick', e => {
  const row = e.target.closest('.trk[data-i]'), box = e.target.closest('.tracks');
  if (!row || !box || e.target.closest('button')) return;
  const ctx = box.dataset.ctx;
  ctx === 'q' ? playIndex(+row.dataset.i) : playFromList(listFor(ctx), +row.dataset.i);
});

function toggleLike(t, btn) {
  const fav = playlist('fav');
  const i = fav.tracks.findIndex(x => keyOf(x) === keyOf(t));
  if (i >= 0) { fav.tracks.splice(i, 1); toast('已取消喜欢'); }
  else {
    fav.tracks.unshift(lean(t));
    if (btn) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); burst(btn); }
    navigator.vibrate?.(12);
  }
  savePlaylists(); refreshHearts();
  if (S.view === 'pl' && S.plId === 'fav') renderPlaylist();
  if (S.view === 'lib') renderLib();
}
function addToPlaylist(id, tracks) {
  const pl = playlist(id);
  let n = 0;
  for (const t of tracks) if (!pl.tracks.some(x => keyOf(x) === keyOf(t))) { pl.tracks.push(lean(t)); n++; }
  savePlaylists(); renderPlNav(); refreshHearts();
  toast(n ? `已添加 ${n} 首到「${pl.name}」` : `「${pl.name}」里已经有了`);
}
function removeFromQueue(i) {
  S.queue.splice(i, 1);
  if (i === S.cur) { stopPlayback(); S.cur = -1; }
  else if (i < S.cur) S.cur--;
  S.plannedNext = -1;
  saveQueue(); renderQueue(true); renderNow();
}
function moveInQueue(from, to) {
  const cur = curTrack();
  const [t] = S.queue.splice(from, 1);
  S.queue.splice(to, 0, t);
  S.cur = S.queue.indexOf(cur);
  S.plannedNext = -1;
  saveQueue(); renderQueue(true);
}

/* ================= 菜单 ================= */
function openMenu(anchor, items) {
  const m = $('#menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : it.title ? `<div class="menu-title">${esc(it.title)}</div>` : `<button role="menuitem" data-mi="${i}">${it.icon || ''}<span>${esc(it.label)}</span></button>`).join('');
  m.hidden = false;
  // anchor 可以是按钮，也可以是右键位置 { x, y }
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  const mw = m.offsetWidth, mh = m.offsetHeight, atPoint = !anchor.getBoundingClientRect;
  const left = atPoint ? r.left : r.right - mw;
  m.style.left = Math.max(12, Math.min(innerWidth - mw - 12, left)) + 'px';
  const below = r.bottom + mh + 8 <= innerHeight;
  m.style.top = (below ? r.bottom + 6 : Math.max(12, r.top - mh - 6)) + 'px';
  m.style.transformOrigin = `${atPoint ? 'left' : 'right'} ${below ? 'top' : 'bottom'}`;
  m.onclick = e => { const b = e.target.closest('[data-mi]'); if (b) { closeMenu(); items[+b.dataset.mi].action(); } };
  if (!coarse()) $('button', m)?.focus();
  if (!menuOpen) { menuOpen = true; Back.push('menu'); }
}
let menuOpen = false;
function closeMenu(fromPop) {
  if (!menuOpen) return;
  $('#menu').hidden = true; menuOpen = false;
  if (!fromPop) Back.pop('menu');
}
document.addEventListener('pointerdown', e => { if (menuOpen && !e.target.closest('#menu') && !e.target.closest('[data-menu-anchor]')) closeMenu(); });

function playlistItems(tracks) {
  return [
    { title: '添加到歌单' },
    ...S.playlists.map(p => ({ label: p.name, icon: IC.list, action: () => addToPlaylist(p.id, tracks) })),
    { label: '新建歌单…', icon: IC.add, action: () => newPlaylist(tracks) }
  ];
}
function trackMenu(t, anchor, ctx, i) {
  const items = [
    { label: '播放', icon: IC.play, action: () => ctx === 'q' ? playIndex(i) : playFromList(listFor(ctx), i) },
    { label: '下一首播放', icon: IC.next, action: () => { const qi = S.queue.findIndex(q => keyOf(q) === keyOf(t)); if (qi >= 0) { S.queue.splice(qi, 1); if (qi < S.cur) S.cur--; } S.queue.splice(S.cur + 1, 0, t); saveQueue(); renderQueue(); toast('下一首播放：' + t.title); } },
    { label: '加入播放列表', icon: IC.queue, action: () => { if (S.queue.some(q => keyOf(q) === keyOf(t))) return toast('已经在播放列表里了'); S.queue.push(t); saveQueue(); renderQueue(); toast('已加入播放列表'); } },
    { label: '下载', icon: IC.dl, action: () => download(t) },
    '-', ...playlistItems([t])
  ];
  if (ctx === 'p') items.push('-', { label: '从歌单移除', icon: IC.trash, action: () => { const pl = playlist(S.plId); pl.tracks.splice(i, 1); savePlaylists(); renderPlaylist(); renderPlNav(); refreshHearts(); } });
  if (ctx === 'q') items.splice(1, 2, { label: '从播放列表移除', icon: IC.trash, action: () => removeFromQueue(i) });
  if (ctx === 'h') items.push('-', { label: '从最近播放移除', icon: IC.trash, action: () => { S.history.splice(i, 1); store.set('history', S.history); renderHistory(true); } });
  openMenu(anchor, items);
}

/* ================= 弹窗 ================= */
function openDialog({ title, body, foot = '', narrow = false }) {
  $('#dlgTitle').textContent = title;
  $('#dlgBody').innerHTML = body;
  $('#dlgFoot').innerHTML = foot;
  $('.dialog').classList.toggle('narrow', narrow);
  const m = $('#modal');
  m.classList.remove('closing');
  if (m.hidden) { m.hidden = false; Back.push('modal'); }
  if (!coarse()) setTimeout(() => $('#dlgBody input, #dlgBody textarea')?.focus(), 50);
  return $('.dialog');
}
function closeDialog(fromPop) {
  const m = $('#modal');
  if (m.hidden) return;
  if (fromPop !== true) Back.pop('modal');
  if (!motionOK()) { m.hidden = true; return; }
  m.classList.add('closing');
  setTimeout(() => { if (m.classList.contains('closing')) { m.hidden = true; m.classList.remove('closing'); } }, 200);
}
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeDialog(); });
$('#modal').addEventListener('click', e => { if (e.target.closest('#dlgBody [data-go]')) closeDialog(); }, true);

function askText(title, label, value = '') {
  return new Promise(resolve => {
    openDialog({ title, narrow: true, body: `<label class="field">${esc(label)}<input class="input" id="askInput" value="${esc(value)}" maxlength="60"></label>`, foot: `<button class="btn" data-close>取消</button><button class="btn primary" id="askOk">确定</button>` });
    const done = () => { const v = $('#askInput').value.trim(); closeDialog(); resolve(v || null); };
    $('#askOk').onclick = done;
    $('#askInput').onkeydown = e => { if (e.key === 'Enter') done(); };
  });
}

/* ================= 歌单 ================= */
async function newPlaylist(tracks = []) {
  const name = await askText('新建歌单', '歌单名称', '新歌单 ' + (S.playlists.length));
  if (!name) return;
  const pl = { id: 'pl:' + uid(), name, tracks: [] };
  S.playlists.push(pl);
  savePlaylists(); renderPlNav();
  if (tracks.length) addToPlaylist(pl.id, tracks); else toast('已创建歌单「' + name + '」');
  return pl;
}
function renderPlNav() {
  $('#plNav').innerHTML = S.playlists.filter(p => p.id !== 'fav').map(p =>
    `<button data-view="pl" data-pl="${esc(p.id)}" aria-current="${S.view === 'pl' && S.plId === p.id}"><span class="pl-dot" style="background:hsl(${hue(p.name)} 60% 55%)"></span><span>${esc(p.name)}</span><em class="count mono">${p.tracks.length || ''}</em></button>`).join('')
    || '<p class="small muted" style="padding:4px 12px;margin:0">还没有歌单</p>';
  $('#favCount').textContent = playlist('fav').tracks.length || '';
  requestAnimationFrame(placeIndicator);
}
function renderPlaylist() {
  const pl = playlist(S.plId) || playlist('fav');
  S.plId = pl.id;
  const first = pl.tracks.find(t => t.cover);
  const dur = pl.tracks.reduce((a, t) => a + (t.duration || 0), 0);
  const isFav = pl.id === 'fav';
  $('#plHead').innerHTML = `<div class="pl-cover${isFav ? ' fav' : ''}" style="--ch:${hue(pl.name)}">${isFav ? IC.heart.replace('<svg', '<svg class="ph-note"') : NOTE}${first ? `<img src="${esc(first.cover)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>
    <div class="grow"><div class="kicker">${isFav ? '收藏' : '歌单'}</div><h2>${esc(pl.name)}</h2>
      <p class="muted small">${pl.tracks.length} 首${dur ? ' · ' + Math.round(dur / 60) + ' 分钟' : ''}</p>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="plPlay" ${pl.tracks.length ? '' : 'disabled'}>${IC.play}播放全部</button>${pl.tracks.length > 1 ? shuffleBtn('plShuffle') : ''}
      ${isFav ? '' : `<button class="btn" id="plRename">重命名</button><button class="btn danger" id="plDelete">删除歌单</button>`}</div></div>`;
  $('#plList').innerHTML = pl.tracks.length ? tracksHTML(pl.tracks, 'p') : emptyHTML(isFav ? '♡' : '♪', isFav ? '点歌曲旁边的爱心，就会收藏到这里。' : '在歌曲的「更多」菜单里选择「添加到歌单」。', [['search', '去搜索', true]]);
  $('#plPlay').onclick = () => playAll(pl.tracks);
  $('#plShuffle')?.addEventListener('click', () => playShuffled(pl.tracks));
  if (!isFav) {
    $('#plRename').onclick = async () => { const n = await askText('重命名歌单', '歌单名称', pl.name); if (n) { pl.name = n; savePlaylists(); renderPlaylist(); renderPlNav(); } };
    armButton($('#plDelete'), '再点一次删除', () => { S.playlists = S.playlists.filter(p => p.id !== pl.id); savePlaylists(); renderPlNav(); switchView('pl', 'fav'); toast('已删除歌单'); });
  }
}
// 需要确认的按钮：第一次点变红，三秒内再点才执行
function armButton(btn, armedText, fn) {
  const text = btn.textContent;
  btn.onclick = () => {
    if (btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.textContent = text; fn(); return; }
    btn.classList.add('armed'); btn.textContent = armedText;
    setTimeout(() => { if (btn.isConnected) { btn.classList.remove('armed'); btn.textContent = text; } }, 3000);
  };
}
$('#newPl').addEventListener('click', () => newPlaylist());

// 空状态：图标 + 说明 + 直达按钮 [[data-go, 文字, 主按钮?]]
function emptyHTML(icon, text, actions = []) {
  return `<div class="empty"><span class="big">${icon}</span><div>${text}</div>${actions.length ? `<div class="row empty-acts">${actions.map(([go, label, primary]) => `<button class="btn${primary ? ' primary' : ''}" data-go="${go}">${label}</button>`).join('')}</div>` : ''}</div>`;
}

/* ================= 最近播放 ================= */
function pushHistory(t) {
  S.history = S.history.filter(x => keyOf(x) !== keyOf(t));
  S.history.unshift({ ...lean(t), playedAt: Date.now() });
  if (S.history.length > 300) S.history.length = 300;
  store.set('history', S.history);
  if (S.view === 'history') renderHistory(true);
}
function ago(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return '刚刚';
  if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  if (d < 86400 * 2) return '昨天';
  return Math.floor(d / 86400) + ' 天前';
}
function renderHistory(quiet) {
  const list = S.history;
  $('#histList').innerHTML = list.length
    ? `<div class="row" style="margin-bottom:4px"><span class="muted small grow">${list.length} 首 · 最近一次 ${ago(list[0].playedAt)}</span><button class="btn primary" id="histPlay">${IC.play}播放全部</button>${shuffleBtn('histShuffle')}<button class="btn danger" id="histClear">清空记录</button></div>` + tracksHTML(list, 'h', quiet)
    : emptyHTML('◷', '还没有播放记录。听过的歌会出现在这里。', [['search', '去搜索', true]]);
  $('#histPlay')?.addEventListener('click', () => playAll(list));
  $('#histShuffle')?.addEventListener('click', () => playShuffled(list));
  if ($('#histClear')) armButton($('#histClear'), '再点一次清空', () => { S.history = []; store.set('history', []); renderHistory(); });
}

/* ================= 我的（手机） ================= */
function renderLib() {
  const card = (go, pl, icon, name, sub, style = '') => `<button class="lib-card" data-go="${go}" ${pl ? `data-pl="${esc(pl)}"` : ''} style="--i:${libI++};${style}"><span class="lib-ic">${icon}</span><span class="grow"><b>${esc(name)}</b><span class="small muted">${sub}</span></span></button>`;
  let libI = 0;
  const fav = playlist('fav');
  $('#libBody').innerHTML = `<div class="lib-grid">
      ${card('pl', 'fav', IC.heart, '我喜欢', `${fav.tracks.length} 首`, '--c:#ff4d6d')}
      ${card('history', '', IC.history, '最近播放', `${S.history.length} 首`)}
      ${card('downloads', '', IC.dl, '下载', `${S.downloads.length} 首`)}
      ${card('local', '', IC.disk, '本地音乐', localMusic.available() ? `${localSource.library.length} 首` : '选择文件播放')}
      ${card('docs', '', IC.doc, '接入说明', '怎么添加音源')}
    </div>
    <div class="row" style="margin-top:8px"><h3 class="grow" style="margin:0;font-size:16px">歌单</h3><button class="btn" data-go="importpl">${IC.link}导入</button><button class="btn" id="libNewPl">${IC.add}新建</button></div>
    ${S.playlists.filter(p => p.id !== 'fav').map(p => card('pl', p.id, `<span class="pl-dot" style="background:hsl(${hue(p.name)} 60% 55%)"></span>`, p.name, `${p.tracks.length} 首`)).join('') || '<p class="muted small">还没有歌单。在歌曲的「更多」菜单里可以直接新建。</p>'}`;
  $('#libNewPl').onclick = async () => { if (await newPlaylist()) renderLib(); };
}

/* ================= 本地音乐 ================= */
// 桌面扫描音乐文件夹，安卓读系统媒体库；扫描结果保存下来，下次打开直接显示
function setLocalLibrary(list) {
  const byName = (a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh') || (a.title || '').localeCompare(b.title || '', 'zh');
  localSource.setLibrary(list.slice().sort(byName));
  S.localList = localSource.libraryTracks().map(t => sources.normTrack(t, 'local'));
}
async function renderLocal() {
  const box = $('#localBody');
  if (!localMusic.available()) {
    box.innerHTML = `<p class="muted small">网页版不能扫描文件夹。可以手动选择音乐文件或整个文件夹，关掉页面后需要重新选择。</p>
      <div class="row"><button class="btn primary" data-lm="pick">${IC.add}选择文件</button><button class="btn" data-lm="dir">${IC.folder}选择文件夹</button></div>`;
    return;
  }
  const scanned = store.get('localScannedAt', 0);
  const folders = localMusic.usesFolders() ? await localMusic.folders().catch(() => []) : [];
  const list = S.localList, shown = list.slice(0, S.localShown);
  box.innerHTML = `<div class="row local-acts">
      <button class="btn primary" data-lm="scan" id="lmScan">${IC.loop}${scanned ? '重新扫描' : '开始扫描'}</button>
      ${localMusic.usesFolders() ? `<button class="btn" data-lm="add">${IC.folder}添加文件夹</button>` : ''}
      ${list.length ? `<button class="btn" data-lm="play">${IC.play}播放全部</button><button class="btn" data-lm="shuffle">${IC.shuffle}随机播放</button>` : ''}
    </div>
    ${localMusic.usesFolders() ? `<div class="folder-list">${folders.map((f, i) => `<span class="folder-chip" style="--i:${i}" title="${esc(f)}">${IC.folder}<span>${esc(f)}</span><button class="mini-btn" data-lm="rm" data-path="${esc(f)}" aria-label="移除文件夹" title="不再扫描这个文件夹">${IC.del}</button></span>`).join('') || '<span class="small muted">还没有音乐文件夹，点「添加文件夹」选一个</span>'}</div>` : ''}
    <p class="small muted">${list.length ? `${list.length} 首` : '还没有扫描到歌曲'}${scanned ? ` · 上次扫描 ${ago(scanned)}` : ''} · 短于 ${S.settings.localMinDur} 秒的文件会被跳过（可在设置里改）</p>
    ${list.length ? tracksHTML(shown, 'l') + (list.length > shown.length ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" data-lm="more">再显示 ${Math.min(500, list.length - shown.length)} 首（共 ${list.length} 首）</button></div>` : '')
      : emptyHTML('♫', isMobile() ? '点「开始扫描」读取手机里的音乐，第一次会请求读取音乐的权限。' : '点「开始扫描」查找音乐文件夹里的歌曲，支持 mp3、flac、m4a、ogg、wav 等格式。')}`;
}
async function scanLocal() {
  const btn = $('#lmScan');
  if (btn) { btn.disabled = true; btn.innerHTML = `${IC.loop}正在扫描…`; btn.classList.add('spin-ic'); }
  try {
    const list = await localMusic.scan(S.settings.localMinDur);
    store.set('localLib', list); store.set('localScannedAt', Date.now());
    setLocalLibrary(list);
    S.localShown = 300;
    sources.setEnabled('local', true);
    toast(list.length ? `找到 ${list.length} 首歌` : '没有找到音乐文件', 3000);
  } catch (e) { toast('扫描失败：' + (e?.message || e), 5000); }
  if (S.view === 'local') renderLocal();
}
$('#localBody').addEventListener('click', async e => {
  const b = e.target.closest('[data-lm]');
  if (!b) return;
  const a = b.dataset.lm;
  if (a === 'scan') scanLocal();
  else if (a === 'pick') $('#localPick').click();
  else if (a === 'dir') $('#localDir').click();
  else if (a === 'play') playAll(S.localList);
  else if (a === 'shuffle') playShuffled(S.localList);
  else if (a === 'more') { S.localShown += 500; renderLocal(); }
  else if (a === 'add') {
    try { const dir = await localMusic.addFolder(); if (dir) { toast('已添加，开始扫描'); await renderLocal(); scanLocal(); } }
    catch (err) { toast('添加失败：' + (err?.message || err)); }
  } else if (a === 'rm') {
    await localMusic.removeFolder(b.dataset.path);
    const dir = b.dataset.path;
    const inDir = p => p === dir || p.startsWith(dir + '/') || p.startsWith(dir + '\\');
    const rest = localSource.library.filter(x => !inDir(x.path));
    store.set('localLib', rest); setLocalLibrary(rest);
    renderLocal(); toast('已移除这个文件夹');
  }
});

/* ================= 导入歌单 ================= */
// 粘贴平台歌单链接，交给支持导入的音源（MusicFree 插件的 importMusicSheet）解析
function importSheetDialog() {
  const ids = sources.sheetSources();
  openDialog({
    title: '导入歌单', narrow: true,
    body: ids.length
      ? `<label class="field">歌单链接<input class="input" id="sheetUrl" placeholder="粘贴歌单的分享链接或 id"></label>
        <label class="field">保存为<input class="input" id="sheetName" placeholder="导入的歌单" maxlength="60"></label>
        <p class="small muted">能解析链接的音源：${ids.map(id => esc(sources.name(id))).join('、')}。歌曲仍然从这些音源播放。</p>
        <div class="msg" id="sheetMsg"></div>`
      : `<p>当前启用的音源都不支持导入歌单。</p><p class="small muted">需要提供歌单导入功能的音源，例如带 <code>importMusicSheet</code> 的 MusicFree 插件。添加后这里就能用了。</p>`,
    foot: ids.length ? `<button class="btn" data-close>取消</button><button class="btn primary" id="sheetGo">导入</button>` : `<button class="btn" data-close>知道了</button><button class="btn primary" data-close data-go="addsrc">添加音源</button>`
  });
  if (!ids.length) return;
  const msg = (t, cls = 'err') => { const m = $('#sheetMsg'); m.className = 'msg ' + cls; m.textContent = t; };
  $('#sheetUrl').onkeydown = e => { if (e.key === 'Enter') $('#sheetGo').click(); };
  $('#sheetGo').onclick = async () => {
    const url = $('#sheetUrl').value.trim();
    if (!url) return msg('先粘贴歌单链接');
    const btn = $('#sheetGo'); btn.disabled = true;
    msg('正在解析…', 'info');
    try {
      const r = await sources.importSheet(url);
      const pl = { id: 'pl:' + uid(), name: $('#sheetName').value.trim() || `导入的歌单 ${new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`, tracks: [] };
      const seen = new Set();
      for (const t of r.tracks) if (!seen.has(keyOf(t))) { seen.add(keyOf(t)); pl.tracks.push(lean(t)); }
      S.playlists.push(pl);
      savePlaylists(); renderPlNav();
      closeDialog();
      switchView('pl', pl.id);
      toast(`已从「${sources.name(r.via)}」导入 ${pl.tracks.length} 首`);
    } catch (e) { msg(e.message); btn.disabled = false; }
  };
}
$('#importPl').addEventListener('click', importSheetDialog);

/* ================= 搜索 ================= */
function renderSrcSelect() {
  const sel = $('#srcSelect');
  const ids = sources.searchable();
  sel.innerHTML = `<option value="*">全部音源（${ids.length}）</option>` + ids.map(id => `<option value="${esc(id)}">${esc(sources.name(id))}</option>`).join('');
  sel.value = ids.includes(S.searchSel) ? S.searchSel : '*';
  const lxOnly = sources.enabled().filter(id => sources.get(id).kind === 'lx');
  $('#searchHint').textContent = lxOnly.length ? `另有 ${lxOnly.length} 个洛雪源负责取播放地址` : '';
}
let searchToken = 0;
async function doSearch(more = false) {
  const which = $('#srcSelect').value;
  S.searchSel = which;
  if (!more) { S.kw = $('#kw').value.trim(); S.page = 1; }
  else S.page++;
  let ids = which === '*' ? sources.searchable() : [which];
  // 没输入关键词时只列出内置音源（示例、本地、已下载），网络音源需要关键词
  if (!S.kw && which === '*') ids = ids.filter(id => sources.get(id).builtin);
  if (S.kw && !more) rememberSearch(S.kw);
  renderSearchHist();
  const my = ++searchToken;
  if (!ids.length) { S.results = []; S.hasMore = false; renderResults(); return; }
  S.searching = true;
  const pending = new Set(ids), errors = [];
  if (!more) { S.results = []; renderResults({ loading: true }); }
  else $('#moreBtn')?.setAttribute('disabled', '');
  // 每个音源返回就立刻显示，不等最慢的那个
  const r = await sources.search(ids, S.kw, S.page, {
    onPartial: p => {
      if (my !== searchToken) return;
      pending.delete(p.id);
      if (p.error) { errors.push([p.id, p.error]); return renderResultsMeta(errors, pending); }
      const seen = new Set(S.results.map(keyOf));
      const add = p.list.filter(t => !seen.has(keyOf(t)));
      if (!add.length) return renderResultsMeta(errors, pending);
      const start = S.results.length;
      S.results = S.results.concat(add);
      if (!$('#results .tracks')) renderResults({ errors, pending });
      else { $('#results .tracks').insertAdjacentHTML('beforeend', add.map((t, k) => rowHTML(t, start + k, 'r').replace(/style="--i:\d+"/, `style="--i:${k}"`)).join('')); renderResultsMeta(errors, pending); }
    }
  });
  if (my !== searchToken) return;
  S.searching = false;
  S.hasMore = ids.length === 1 && r.hasMore;
  if (!S.results.length || !$('#results .tracks')) renderResults({ errors });
  else renderResultsMeta(errors, new Set());
}
function renderResults(state = {}) {
  const box = $('#results');
  if (state.loading) { box.innerHTML = '<div class="skeleton"></div>'.repeat(6); return; }
  if (!S.results.length) {
    const none = !sources.searchable().filter(id => !sources.get(id).builtin).length;
    box.innerHTML = `<div id="resErr"></div>` + (none && !S.kw
      ? emptyHTML('◌', '还没有能联网搜索的音源。<br>添加一个音源，或者先听听内置的示例歌曲。', [['addsrc', '添加音源', true], ['demo', '播放示例'], ['docs', '接入说明']])
      : emptyHTML('⌕', S.kw ? `没有找到「${esc(S.kw)}」，换个关键词，或者换个音源试试。` : '输入关键词开始搜索。', none ? [['addsrc', '添加音源', true]] : []));
    renderResultsMeta(state.errors || [], new Set());
    return;
  }
  box.innerHTML = `<div id="resErr"></div><div class="row res-head" style="margin-bottom:4px"><span class="muted small grow" id="resCount"></span>
    <button class="btn" id="addAllPl" data-menu-anchor>${IC.list}添加到歌单</button>${shuffleBtn('shufAllBtn')}<button class="btn" id="playAllBtn">${IC.play}播放全部</button></div>`
    + tracksHTML(S.results, 'r') + `<div id="resMore"></div>`;
  $('#playAllBtn').onclick = () => playAll(S.results);
  $('#shufAllBtn').onclick = () => playShuffled(S.results);
  $('#addAllPl').onclick = e => openMenu(e.currentTarget, playlistItems(S.results));
  renderResultsMeta(state.errors || [], state.pending || new Set());
}
// 只更新结果数量、失败提示、"还在等哪些音源"和"加载更多"，不重画列表
function renderResultsMeta(errors, pending) {
  const err = $('#resErr');
  if (err) err.innerHTML = errors.map(([id, msg]) => `<div class="note small"><b>${esc(sources.name(id))}</b> 搜索失败：<span class="muted">${esc(msg)}</span></div>`).join('');
  const c = $('#resCount');
  if (c) c.innerHTML = `${S.results.length} 首${S.kw ? `，关键词「${esc(S.kw)}」` : ''}` + (pending.size ? ` <span class="waiting"><i></i><i></i><i></i> 还在等 ${[...pending].map(id => esc(sources.name(id))).join('、')}</span>` : '');
  const m = $('#resMore');
  if (m) {
    m.innerHTML = S.hasMore && !pending.size ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" id="moreBtn">加载更多</button></div>` : '';
    $('#moreBtn')?.addEventListener('click', () => doSearch(true));
  }
}
$('#searchForm').addEventListener('submit', e => { e.preventDefault(); $('#kw').blur(); doSearch(); });
$('#srcSelect').addEventListener('change', () => { S.searchSel = $('#srcSelect').value; doSearch(); });

/* ---------- 搜索历史 ---------- */
function rememberSearch(kw) {
  S.searchHist = [kw, ...S.searchHist.filter(k => k !== kw)].slice(0, 12);
  store.set('searchHist', S.searchHist);
}
function renderSearchHist() {
  const box = $('#searchHist');
  const show = S.searchHist.length && !$('#kw').value.trim();
  box.hidden = !show;
  if (!show) return;
  box.innerHTML = `<span class="small muted">最近搜过</span>` + S.searchHist.map((k, i) => `<button class="chip-btn" data-kw="${esc(k)}" style="--i:${i}">${esc(k)}</button>`).join('') + `<button class="chip-btn ghost" data-kw-clear title="清空搜索历史">清空</button>`;
}
$('#searchHist').addEventListener('click', e => {
  const b = e.target.closest('[data-kw]');
  if (b) { $('#kw').value = b.dataset.kw; doSearch(); return; }
  if (e.target.closest('[data-kw-clear]')) { S.searchHist = []; store.set('searchHist', []); renderSearchHist(); }
});
$('#kw').addEventListener('input', renderSearchHist);

/* ================= 播放列表 ================= */
function renderQueue(quiet) {
  $('#qCount').textContent = S.queue.length || '';
  const n = S.queue.length, left = S.cur >= 0 ? S.queue.slice(S.cur).reduce((a, t) => a + (t.duration || 0), 0) : 0;
  $('#qMeta').textContent = n ? `${n} 首${left >= 60 ? ` · 还剩约 ${Math.round(left / 60)} 分钟` : ''} · 拖动右侧把手可以排序` : '';
  $('#queueList').innerHTML = n ? tracksHTML(S.queue, 'q', quiet) : emptyHTML('≡', `播放列表是空的。${coarse() ? '点一下' : '双击'}搜索结果里的歌曲，或用「更多」菜单加入。`, [['search', '去搜索', true], ['demo', '播放示例']]);
}
enableReorder($('#queueList'), { handle: '.drag', row: '.trk[data-i]', onDrop: moveInQueue });
// 打开播放列表时滚到正在播放的那首
function revealPlaying() {
  const el = $('#queueList .trk.playing');
  if (el) el.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' });
}
armButton($('#clearQ'), '再点一次清空', () => { S.queue = []; S.cur = -1; stopPlayback(); saveQueue(); renderQueue(); renderNow(); });
$('#locateQ').addEventListener('click', revealPlaying);
$('#saveQ').addEventListener('click', async () => { if (!S.queue.length) return toast('播放列表是空的'); const pl = await newPlaylist(); if (pl) addToPlaylist(pl.id, S.queue); });

/* ================= 下载 ================= */
async function download(t) {
  toast('正在获取下载地址：' + t.title);
  try {
    const q = S.settings.dlQuality === 'same' ? S.settings.quality : S.settings.dlQuality;
    const r = await sources.resolveUrl(t, q, { failover: S.settings.failover });
    if (/^(blob|data|asset|https?:\/\/asset\.localhost)/.test(r.url) && t.sourceId !== 'demo') return toast('这首歌已经在本机了');
    let lrc = '';
    try { lrc = (await sources.resolveLyric(t, r)).lrc; } catch { /* 没有歌词也能下载 */ }
    toast('开始下载：' + t.title);
    const saved = await downloadTrack({ url: r.url, headers: r.headers, track: t, lrc });
    if (saved.opened) return toast(saved.path, 4000);
    const lyricPath = isTauri && lrc ? saved.path.replace(/\.[^.]+$/, '.lrc') : undefined;
    S.downloads = S.downloads.filter(d => keyOf(d.track) !== keyOf(t));
    S.downloads.unshift({ track: lean(t), path: isTauri ? saved.path : '', lyricPath, at: Date.now() });
    store.set('downloads', S.downloads);
    if (S.view === 'downloads') renderDownloads();
    toast(isTauri ? '已下载到 ' + saved.path : '已保存到浏览器下载目录', 4000);
  } catch (e) { toast('下载失败：' + e.message, 4500); }
}
function renderDownloads() {
  $('#dlHint').textContent = isTauri ? '保存在「下载/ShellPlayer」文件夹（安卓可能在应用数据目录），可以离线播放。' : '网页版会保存到浏览器的下载目录，这里只记录下载历史。';
  const list = listFor('d');
  $('#dlList').innerHTML = list.length
    ? `<div class="row" style="margin-bottom:4px"><span class="muted small grow">${list.length} 首</span>${isTauri ? `<button class="btn primary" id="dlPlay">${IC.play}播放全部</button>${shuffleBtn('dlShuffle')}` : ''}<button class="btn danger" id="dlClear">清空记录</button></div>` + tracksHTML(list, 'd')
    : emptyHTML('↓', '还没有下载过歌曲。在歌曲的「更多」菜单里选择「下载」。', [['search', '去搜索', true]]);
  $('#dlPlay')?.addEventListener('click', () => playAll(list));
  $('#dlShuffle')?.addEventListener('click', () => playShuffled(list));
  if ($('#dlClear')) armButton($('#dlClear'), '再点一次清空', () => { S.downloads = []; store.set('downloads', []); renderDownloads(); });
}

/* ================= 音源页 ================= */
const KIND = { builtin: '内置', json: 'JSON', script: '脚本', musicfree: 'MusicFree', lx: '洛雪' };
function renderSources() {
  const cards = [...sources.runtime.entries()].filter(([id]) => id !== 'downloaded').map(([id, r], i) => {
    const on = !sources.disabled.has(id);
    let extra = '';
    if (id === 'local') extra = (localMusic.available() ? `<button class="btn" data-go="local">${IC.disk}本地音乐</button>` : '') + `<button class="btn" data-sa="pick">选择文件</button><button class="btn" data-sa="dir">选择文件夹</button><span class="small muted">${localSource.count ? `共 ${localSource.count} 首` : '也可以把文件拖进窗口'}</span>`;
    else if (!r.builtin) {
      const entry = sources.entries.find(e => e.id === id);
      extra = (r.userVariables?.length ? `<button class="btn" data-sa="vars">插件设置</button>` : '')
        + (entry?.url ? `<button class="btn" data-sa="update">更新</button>` : '')
        + `<button class="btn" data-sa="edit">编辑</button><button class="btn danger" data-sa="del">删除</button>`;
    }
    const caps = r.error ? '' : [r.canSearch && '搜索', r.canUrl && '播放', r.getLyric && '歌词', r.importSheet && '导入歌单'].filter(Boolean).join(' · ');
    const h = !r.builtin && sources.health(id);
    const healthChip = h ? `<span class="chip ${h.rate >= 0.8 ? 'ok' : h.rate < 0.5 ? 'err' : ''}" title="最近 ${h.n} 次请求">成功率 ${Math.round(h.rate * 100)}%${h.ms ? ` · ${(h.ms / 1000).toFixed(1)} 秒` : ''}</span>` : '';
    return `<div class="src${on ? '' : ' off'}" data-id="${esc(id)}" style="--i:${i}">
      <div class="src-head"><div class="grow"><div class="src-name">${esc(r.name)}</div>
        <div class="row small" style="margin-top:6px"><span class="chip${r.kind === 'builtin' ? ' accent' : ''}">${KIND[r.kind] || r.kind}</span>${r.version ? `<span class="chip mono">v${esc(r.version)}</span>` : ''}${r.error ? '<span class="chip err">加载失败</span>' : caps ? `<span class="chip">${caps}</span>` : ''}${healthChip}</div></div>
        <label class="switch" title="${on ? '停用' : '启用'}"><input type="checkbox" data-sa="toggle" ${on ? 'checked' : ''} ${r.error ? 'disabled' : ''} aria-label="启用 ${esc(r.name)}"><span></span></label></div>
      <div class="src-desc">${r.error ? `<span style="color:var(--danger)">${esc(r.error)}</span>` : esc(r.description || '没有描述')}${r.author ? `<br>作者：${esc(r.author)}` : ''}</div>
      ${extra ? `<div class="row">${extra}</div>` : ''}</div>`;
  });
  $('#sourceList').innerHTML = cards.join('');
  $('#sCount').textContent = sources.enabled().filter(id => !sources.get(id).builtin).length || '';
  renderSrcSelect();
  renderStarter();
}
$('#sourceList').addEventListener('click', e => {
  const b = e.target.closest('[data-sa]'), card = e.target.closest('.src[data-id]');
  if (!b || !card || b.dataset.sa === 'toggle') return;
  const id = card.dataset.id, a = b.dataset.sa;
  if (a === 'pick') $('#localPick').click();
  else if (a === 'dir') $('#localDir').click();
  else if (a === 'edit') sourceDialog(id);
  else if (a === 'vars') varsDialog(id);
  else if (a === 'update') updateSource(id, b);
  else if (a === 'del') {
    if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = '确认删除'; setTimeout(() => { if (b.isConnected) { b.classList.remove('armed'); b.textContent = '删除'; } }, 3000); return; }
    // 来自订阅的音源删掉后，自动更新订阅时不再加回来
    const url = sources.entries.find(e => e.id === id)?.url;
    if (url) store.set('subRemoved', [...new Set([...store.get('subRemoved', []), url])]);
    rememberBundledRemoved(store, id);
    sources.remove(id); renderSources(); toast('已删除音源');
  }
});
$('#sourceList').addEventListener('change', e => {
  const cb = e.target.closest('[data-sa="toggle"]'); if (!cb) return;
  sources.setEnabled(cb.closest('.src').dataset.id, cb.checked);
  renderSources();
});
$('#bundledRestore')?.addEventListener('click', async e => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const r = await seedBundledSources(sources, { store, force: true });
    renderSources();
    const n = r.added.length + r.updated.length;
    toast(n ? `内置音源已就绪（${n} 个）` : '内置音源都已经在了');
    if (r.failed.length) toast(`${r.failed.length} 个内置音源加载失败：${r.failed[0].item.name}`, 6000);
  } catch (err) {
    toast('恢复内置音源失败：' + (err?.message || err), 6000);
  } finally {
    btn.disabled = false;
  }
});
async function importLocal(files) {
  const ids = localSource.import(files);
  if (!ids.length) return toast('没有找到可以播放的音频文件');
  sources.setEnabled('local', true);
  // 先读标签再显示，歌名、歌手、封面和内嵌歌词都以标签为准
  await localSource.readTags(ids, (done, total) => { if (total > 8 && (done % 10 === 0 || done === total)) toast(`正在读取歌曲信息 ${done} / ${total}`, 1500); });
  renderSources();
  toast(`已导入 ${ids.length} 首本地歌曲`);
  switchView('search');
  S.searchSel = 'local'; renderSrcSelect(); $('#kw').value = ''; doSearch();
}
$('#localPick').addEventListener('change', e => { importLocal(e.target.files); e.target.value = ''; });
$('#localDir').addEventListener('change', e => { importLocal(e.target.files); e.target.value = ''; });

/* ---------- 拖入 / 粘贴导入 ---------- */
// 音频文件 → 本地音乐；.js / .json → 音源；网址 → 打开添加音源并自动下载
const isSourceFile = f => /\.(js|json|txt)$/i.test(f.name) && f.size < 5 * 1024 * 1024;
let dragDepth = 0;
const dragKinds = e => [...(e.dataTransfer?.types || [])];
document.addEventListener('dragenter', e => {
  const k = dragKinds(e);
  if (!k.includes('Files') && !k.includes('text/uri-list')) return;
  dragDepth++;
  $('#dropZone').hidden = false;
});
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropZone').hidden = true; } });
document.addEventListener('dragover', e => { const k = dragKinds(e); if (k.includes('Files') || k.includes('text/uri-list')) e.preventDefault(); });
document.addEventListener('drop', async e => {
  dragDepth = 0; $('#dropZone').hidden = true;
  const files = [...e.dataTransfer.files];
  const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  if (!files.length && !/^https?:\/\//.test(url || '')) return;
  e.preventDefault();
  if (!files.length) return sourceDialog(null, { url: url.trim().split('\n')[0] });
  const srcFiles = files.filter(isSourceFile), audioFiles = files.filter(f => !isSourceFile(f));
  if (audioFiles.length) importLocal(audioFiles);
  if (srcFiles.length === 1) sourceDialog(null, { code: await srcFiles[0].text(), name: srcFiles[0].name });
  else if (srcFiles.length > 1) {
    let ok = 0; const fails = [];
    for (const f of srcFiles) {
      try { await saveSourceCode(await f.text(), {}); ok++; } catch (err) { fails.push(f.name + '：' + err.message.split('\n')[0]); }
    }
    toast(`已导入 ${ok} 个音源` + (fails.length ? `，${fails.length} 个失败\n${fails.slice(0, 2).join('\n')}` : ''), 5000);
    if (ok) switchView('sources');
  }
});
// 不在输入框里时粘贴：网址或音源代码直接进入「添加音源」
document.addEventListener('paste', e => {
  if (e.target.closest?.('input, textarea, [contenteditable]') || !$('#modal').hidden) return;
  const text = (e.clipboardData?.getData('text') || '').trim();
  if (!text) return;
  if (/^https?:\/\/\S+$/.test(text)) { e.preventDefault(); sourceDialog(null, { url: text }); }
  else if (text.length > 40 && /module\.exports|lx\.on|EVENT_NAMES|"search"\s*:/.test(text)) { e.preventDefault(); sourceDialog(null, { code: text }); }
});

async function fetchText(url) {
  const r = await http(url, { responseType: 'text', timeout: 20000 });
  if (!r.ok) throw new Error('下载失败：HTTP ' + r.status);
  return r.data;
}
async function saveSourceCode(code, { id, url, msg }) {
  try {
    const r = await sources.add(code, { id, url });
    renderSources();
    return r;
  } catch (e) {
    if (e instanceof SubscriptionError) {
      msg?.('正在导入订阅里的 ' + e.plugins.length + ' 个插件…', 'info');
      if (url) store.set('subscriptions', [...new Set([...store.get('subscriptions', []), url])]);
      store.set('subRemoved', store.get('subRemoved', []).filter(u => !e.plugins.some(p => p.url === u)));
      let ok = 0; const fails = [];
      for (const p of e.plugins) {
        try { await sources.add(await fetchText(p.url), { url: p.url }); ok++; }
        catch (err) { fails.push(`${p.name || p.url}：${err.message}`); }
      }
      renderSources();
      if (!ok) throw new Error('订阅里的插件都没能导入：\n' + fails.join('\n'));
      return { subscription: true, ok, fails };
    }
    throw e;
  }
}
// 自动更新：按网址导入的音源和订阅，每天检查一次，有变化才替换
async function refreshSources({ force = false, quiet = false } = {}) {
  const checked = store.get('sourceChecked', {}), now = Date.now(), DAY = 86400000;
  let updated = 0, added = 0, failed = 0;
  for (const e of sources.entries.filter(e => e.url && (force || now - (checked[e.id] || 0) > DAY))) {
    try {
      const code = await fetchText(e.url);
      checked[e.id] = now;
      if (code.trim() !== e.code.trim()) { await sources.add(code, { id: e.id, url: e.url }); updated++; }
    } catch { failed++; }
  }
  const removed = new Set(store.get('subRemoved', []));
  for (const sub of store.get('subscriptions', [])) {
    if (!force && now - (checked['sub:' + sub] || 0) <= DAY) continue;
    try {
      const d = JSON.parse(await fetchText(sub));
      checked['sub:' + sub] = now;
      for (const p of d.plugins || []) {
        if (!p.url || removed.has(p.url) || sources.entries.some(e => e.url === p.url)) continue;
        try { await sources.add(await fetchText(p.url), { url: p.url }); added++; } catch { failed++; }
      }
    } catch { failed++; }
  }
  store.set('sourceChecked', checked);
  if (updated || added) renderSources();
  if (!quiet || updated || added) toast(updated || added ? `音源已更新：${[updated && `${updated} 个有新版本`, added && `订阅里新增 ${added} 个`].filter(Boolean).join('，')}` : failed ? `检查完成，${failed} 个音源暂时连不上` : '音源都是最新的', 3500);
}
$('#updateAll').addEventListener('click', async e => {
  const b = e.currentTarget; b.disabled = true;
  await refreshSources({ force: true });
  b.disabled = false;
});
async function updateSource(id, btn) {
  const entry = sources.entries.find(e => e.id === id);
  btn.disabled = true; btn.textContent = '更新中…';
  try { await sources.add(await fetchText(entry.url), { id, url: entry.url }); renderSources(); toast('已更新到最新版本'); }
  catch (e) { toast('更新失败：' + e.message, 4000); btn.disabled = false; btn.textContent = '更新'; }
}
function varsDialog(id) {
  const r = sources.get(id), cur = sources.vars[id] || {};
  openDialog({
    title: '插件设置：' + r.name, narrow: true,
    body: r.userVariables.map(v => `<label class="field">${esc(v.name || v.key)}<input class="input" data-var="${esc(v.key)}" value="${esc(cur[v.key] ?? '')}" placeholder="${esc(v.hint || '')}"></label>`).join(''),
    foot: `<button class="btn" data-close>取消</button><button class="btn primary" id="varsSave">保存</button>`
  });
  $('#varsSave').onclick = () => {
    const v = {}; $$('[data-var]').forEach(i => { v[i.dataset.var] = i.value; });
    sources.setVars(id, v); closeDialog(); toast('已保存插件设置');
  };
}
$('#addSrc').addEventListener('click', () => sourceDialog());
function sourceDialog(editId, prefill = {}) {
  const entry = editId && sources.entries.find(e => e.id === editId);
  // 粘贴进来的单行 JSON 排一下版，方便检查
  if (prefill.code && /^\s*\{/.test(prefill.code)) { try { prefill.code = JSON.stringify(JSON.parse(prefill.code), null, 2); } catch { /* 不是 JSON，原样显示 */ } }
  openDialog({
    title: entry ? '编辑音源：' + sources.name(editId) : '添加音源',
    body: `<div class="row"><input class="input grow" id="importUrl" type="url" placeholder="音源网址：MusicFree 插件 / 订阅、洛雪源 .js、JSON 配置"><button class="btn primary" id="importUrlBtn">从网址导入</button></div>
      <div class="row small"><span class="muted">或者</span><button class="btn" id="importFileBtn">选择本地文件</button><span class="muted">，或粘贴到下面。模板：</span>
        <button class="btn" data-tpl="http">HTTP API</button><button class="btn" data-tpl="subsonic">Navidrome</button><button class="btn" data-tpl="script">JS 脚本</button></div>
      <input type="file" id="importFile" accept=".js,.json,.txt" hidden>
      <textarea class="input code-area" id="code" spellcheck="false" aria-label="音源内容" placeholder="粘贴 MusicFree 插件、洛雪自定义源、JSON 配置或脚本。&#10;也可以直接把 .js / .json 文件拖进窗口。">${esc(entry ? entry.code : prefill.code || '')}</textarea>
      <div class="msg" id="dlgMsg"></div>`,
    foot: `<span class="small muted grow" id="kindHint"></span><button class="btn" id="dlgTest">测试搜索</button><button class="btn primary" id="dlgSave">保存音源</button>`
  });
  const msg = (t, cls = 'err') => { const m = $('#dlgMsg'); m.className = 'msg ' + cls; m.textContent = t; };
  const hint = () => { const c = $('#code').value.trim(); $('#kindHint').textContent = c ? '识别为：' + ({ json: 'JSON 配置', lx: '洛雪自定义源', script: 'MusicFree 插件或脚本' }[detectKind(c)]) : ''; };
  $('#code').addEventListener('input', hint); hint();
  let fromUrl = entry?.url;
  $$('[data-tpl]').forEach(b => b.onclick = () => { $('#code').value = TEMPLATES[b.dataset.tpl]; fromUrl = undefined; msg(''); hint(); });
  $('#importFileBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async e => { const f = e.target.files[0]; if (f) { $('#code').value = await f.text(); fromUrl = undefined; msg(''); hint(); } };
  $('#importUrlBtn').onclick = async () => {
    const url = $('#importUrl').value.trim();
    if (!url) return msg('先填一个网址');
    msg('正在下载…', 'info');
    try { $('#code').value = await fetchText(url); fromUrl = url; hint(); msg('已下载，点「保存音源」完成导入', 'ok'); }
    catch (e) { msg(e.message + (isTauri ? '' : '\n网页版受跨域限制，可以把文件下载后用「选择本地文件」导入。')); }
  };
  $('#importUrl').onkeydown = e => { if (e.key === 'Enter') $('#importUrlBtn').click(); };
  if (prefill.url) { $('#importUrl').value = prefill.url; $('#importUrlBtn').click(); }
  else if (prefill.code) msg(`已读取${prefill.name ? '「' + prefill.name + '」' : '粘贴的内容'}，可以先「测试搜索」，确认后点「保存音源」`, 'info');
  $('#dlgTest').onclick = async () => {
    try {
      msg('正在解析…', 'info');
      const c = await compileSource($('#code').value, {});
      if (!c.canSearch) return msg(`解析成功：${c.name}（${KIND[c.kind]}）。这个音源不提供搜索，只负责取播放地址${c.lxKeys ? '，支持：' + c.lxKeys.map(k => LX_NAMES[k] || k).join('、') : ''}。`, 'ok');
      msg(`解析成功：${c.name}，正在用「周杰伦」测试搜索…`, 'info');
      const r = await c.search('周杰伦', 1);
      msg(`搜索成功，返回 ${r.list.length} 条。` + (r.list[0] ? `第一条：${r.list[0].title || r.list[0].name} - ${r.list[0].artist || ''}` : ''), 'ok');
    } catch (e) { msg(e instanceof SubscriptionError ? e.message + '，保存时会逐个导入。' : e.message, e instanceof SubscriptionError ? 'info' : 'err'); }
  };
  $('#dlgSave').onclick = async () => {
    const btn = $('#dlgSave'); btn.disabled = true;
    try {
      const r = await saveSourceCode($('#code').value, { id: editId, url: fromUrl, msg });
      closeDialog();
      if (r.subscription) toast(`已从订阅导入 ${r.ok} 个插件` + (r.fails.length ? `，${r.fails.length} 个失败` : ''), 4000);
      else toast(`已${r.updated || editId ? '更新' : '添加'}音源「${r.adapter.name}」`);
    } catch (e) { msg(e.message); btn.disabled = false; }
  };
}

/* ================= 设置 ================= */
function renderSettings() {
  const st = S.settings;
  const seg = (key, opts) => `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${st[key] === v}">${l}</button>`).join('')}</div>`;
  const sw = (key) => `<label class="switch"><input type="checkbox" data-sw="${key}" ${st[key] ? 'checked' : ''} aria-label="${key}"><span></span></label>`;
  const row = (title, desc, ctrl) => `<div class="set-row"><div class="grow"><b>${title}</b><span>${desc}</span></div>${ctrl}</div>`;
  $('#settings').innerHTML = [
    row('首选音质', '音源不支持时会自动降级', seg('quality', QUALITIES)),
    row('下载音质', '下载时用的音质', seg('dlQuality', [['same', '同上'], ...QUALITIES])),
    row('失败自动换源', '取不到播放地址时，去其他音源搜同名同歌手的歌', sw('failover')),
    row('出错时跳到下一首', '连续失败超过 5 首会停下', sw('skipOnError')),
    row('外观', '深色、浅色或跟随系统', seg('theme', [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']])),
    row('动态效果', '封面取色的流动背景、律动条、转场和粒子动画', sw('motion')),
    row('淡入淡出', '暂停和继续时音量平滑过渡', sw('fade')),
    row('显示翻译歌词', '有翻译时显示在原文下面，桌面歌词也一样', sw('lyricTrans')),
    row('歌词字号', '正在播放页的歌词大小', seg('lyricSize', [['s', '小'], ['m', '中'], ['l', '大']])),
    isDesktopApp() ? row('关闭时最小化到托盘', '点窗口的关闭按钮后继续在后台播放，从托盘图标打开', sw('closeToTray')) : '',
    isDesktopApp() ? row('全局快捷键', 'Ctrl + Alt + P 播放暂停，Ctrl + Alt + ← / → 切歌，其他组合见快捷键表（按 ?）。窗口不在前台也能用', sw('globalKeys')) : '',
    isDesktopApp() ? row('桌面歌词', '置顶显示的透明歌词窗口，可拖动', sw('dlyric')) : '',
    isDesktopApp() ? row('锁定桌面歌词', '锁定后鼠标可以穿透歌词窗口', sw('dlyricLock')) : '',
    isDesktopApp() ? row('桌面歌词字号', `${st.dlyricSize}px`, `<input type="range" id="dlSize" min="20" max="64" value="${st.dlyricSize}" style="width:140px;--p:${(st.dlyricSize - 20) / 44 * 100}%">`) : '',
    isDesktopApp() ? row('桌面歌词颜色', '唱过部分的颜色', `<div class="swatches" data-seg="dlyricColor">${DL_COLORS.map(([v, l]) => `<button data-v="${v}" aria-pressed="${st.dlyricColor === v}" title="${l}" style="--c:${v === 'cover' ? 'conic-gradient(hsl(0 90% 70%),hsl(120 90% 70%),hsl(240 90% 70%),hsl(360 90% 70%))' : `hsl(${v} 95% 72%)`}"><span class="sr">${l}</span></button>`).join('')}</div>`) : '',
    nativeLyric.available() ? row('悬浮歌词', '一行歌词贴在状态栏下方，切到其他应用也能看到。第一次打开要允许「悬浮窗」权限', sw('mlyric')) : '',
    nativeLyric.available() ? row('锁定悬浮歌词', '没锁定时可以上下拖动位置；锁定后手指点到歌词会穿透', sw('mlyricLock')) : '',
    nativeLyric.available() ? row('悬浮歌词字号', '', seg('mlyricSize', [[14, '小'], [17, '中'], [21, '大']])) : '',
    nativeLyric.available() ? row('歌词颜色', '悬浮歌词唱到的这一行', `<div class="swatches" data-seg="dlyricColor">${DL_COLORS.map(([v, l]) => `<button data-v="${v}" aria-pressed="${st.dlyricColor === v}" title="${l}" style="--c:${v === 'cover' ? 'conic-gradient(hsl(0 90% 70%),hsl(120 90% 70%),hsl(240 90% 70%),hsl(360 90% 70%))' : `hsl(${v} 95% 72%)`}"><span class="sr">${l}</span></button>`).join('')}</div>`) : '',
    nativeLyric.available() ? row('通知栏滚动歌词', '每句歌词写进播放通知。魅族手机和装了状态栏歌词模块的手机会显示在状态栏里', sw('tickerLyric')) : '',
    localMusic.available() ? row('本地音乐最短时长', '扫描时跳过更短的文件，避免把提示音和录音扫进来', seg('localMinDur', [[0, '不限'], [30, '30 秒'], [60, '1 分钟']])) : '',
    row('自动更新音源', '按网址或订阅导入的音源，每天检查一次新版本', sw('autoUpdateSources')),
    appUpdate.available() ? row('检查新版本', `当前 v${VERSION}${isMobile() ? '。安卓版会打开下载页，下载后覆盖安装' : '。桌面版下载完自动安装并重启'}`, `<div class="row">${sw('autoCheckUpdate')}<button class="btn" id="checkUpd">现在检查</button></div>`) : '',
    !coarse() ? row('快捷键', '空格播放暂停、/ 搜索、L 喜欢……', `<button class="btn" id="showKeys">查看</button>`) : '',
    row('接入说明', '各种音源格式怎么写、怎么添加', `<button class="btn" data-go="docs">打开</button>`),
    row('最近播放', `${S.history.length} 首`, `<button class="btn" data-go="history">查看</button>`),
    row('备份', '导出或导入音源、歌单和设置', `<div class="row"><button class="btn" id="bkExport">导出</button><button class="btn" id="bkImport">导入</button><input type="file" id="bkFile" accept=".json" hidden></div>`),
    row('关于', `空壳播放器 v${VERSION} · ${isTauri ? (isMobile() ? '安卓版' : '桌面版') + '（' + platformName() + '）' : '网页版'}`, '<a class="btn" href="https://github.com/Makima667/shell-player" target="_blank" rel="noopener">源代码</a>')
  ].join('');
  $$('#settings [data-seg] button').forEach(b => b.onclick = () => { const k = b.closest('[data-seg]').dataset.seg; st[k] = typeof st[k] === 'number' ? +b.dataset.v : b.dataset.v; saveSettings(); applySettings(); renderSettings(); });
  $('#checkUpd')?.addEventListener('click', e => checkUpdate({ manual: true, btn: e.currentTarget }));
  $$('#settings [data-sw]').forEach(i => i.onchange = () => { st[i.dataset.sw] = i.checked; saveSettings(); applySettings(); });
  $('#dlSize')?.addEventListener('input', e => { st.dlyricSize = +e.target.value; e.target.style.setProperty('--p', (st.dlyricSize - 20) / 44 * 100 + '%'); e.target.closest('.set-row').querySelector('span').textContent = st.dlyricSize + 'px'; saveSettings(); desktopLyrics.send({ size: st.dlyricSize }); });
  $('#showKeys')?.addEventListener('click', showKeys);
  $('#bkExport').onclick = exportBackup;
  $('#bkImport').onclick = () => $('#bkFile').click();
  $('#bkFile').onchange = importBackup;
}
function applySettings() {
  const st = S.settings;
  if (st.theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = st.theme;
  document.body.classList.toggle('calm', !st.motion);
  $('#lyrics').dataset.size = st.lyricSize;
  if (S.lyric.length) { renderLyrics(); S.lyricIdx = -2; syncLyric(audio.currentTime); pushNativeLyrics(); }
  $('#viz').hidden = !st.motion;
  if (nativeLyric.available()) pushNativeLyricConfig();
  if (isDesktopApp()) {
    desktopApp.closeToTray(st.closeToTray);
    desktopLyrics.show(st.dlyric);
    desktopLyrics.lock(st.dlyricLock);
    if (st.dlyricColor !== 'cover') desktopLyrics.send({ hue: +st.dlyricColor });
    else desktopLyrics.send({ hue: getComputedStyle(document.documentElement).getPropertyValue('--h').trim() || 228 });
    $('[data-now="dlyric"]').classList.toggle('on', st.dlyric);
    pushDesktopLyric(true);
    applyGlobalKeys();
  }
}
// 全局快捷键（和网易云一样的组合，窗口不在前台也能用）
const GLOBAL_KEYS = [
  ['Control+Alt+P', '播放 / 暂停', () => togglePlay()],
  ['Control+Alt+Left', '上一首', () => playPrev()],
  ['Control+Alt+Right', '下一首', () => playNext()],
  ['Control+Alt+Up', '音量加', () => setVolume(userVol() + 0.05)],
  ['Control+Alt+Down', '音量减', () => setVolume(userVol() - 0.05)],
  ['Control+Alt+L', '喜欢 / 取消喜欢', () => { const t = curTrack(); if (t) toggleLike(t, $('#full').hidden ? $('#barLike') : $('[data-now="like"]')); }],
  ['Control+Alt+D', '桌面歌词开 / 关', () => { S.settings.dlyric = !S.settings.dlyric; saveSettings(); applySettings(); }]
];
let globalKeysOn = null;
async function applyGlobalKeys() {
  const on = !!S.settings.globalKeys;
  if (on === globalKeysOn) return;
  globalKeysOn = on;
  const failed = await globalKeys.set(on ? Object.fromEntries(GLOBAL_KEYS.map(([k, , f]) => [k, f])) : {}).catch(() => []);
  if (failed.length) toast('这些全局快捷键被别的软件占用了：' + failed.map(keyLabel).join('、'), 5000);
}
const keyLabel = k => k.replace('Control', 'Ctrl').replace('Left', '←').replace('Right', '→').replace('Up', '↑').replace('Down', '↓');
async function exportBackup() {
  const data = { app: 'shell-player', version: VERSION, at: new Date().toISOString(), sources: sources.entries, disabled: [...sources.disabled], sourceVars: sources.vars, playlists: S.playlists, settings: S.settings, history: S.history };
  const text = JSON.stringify(data, null, 2);
  const name = `shell-player-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (isTauri) {
    try {
      const path = await import('@tauri-apps/api/path'), fs = await import('@tauri-apps/plugin-fs');
      let dir; try { dir = await path.downloadDir(); } catch { dir = await path.appLocalDataDir(); }
      const file = await path.join(dir, name);
      await fs.writeTextFile(file, text);
      return toast('已导出到 ' + file, 4000);
    } catch (e) { return toast('导出失败：' + e.message); }
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
}
async function importBackup(e) {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.app !== 'shell-player') throw new Error('不是空壳播放器的备份文件');
    store.set('sources', d.sources || []); store.set('disabled', d.disabled || []); store.set('sourceVars', d.sourceVars || {});
    store.set('playlists', d.playlists || S.playlists); store.set('settings', d.settings || S.settings);
    if (d.history) store.set('history', d.history);
    toast('已导入，正在重新加载…');
    setTimeout(() => location.reload(), 800);
  } catch (err) { toast('导入失败：' + err.message, 4000); }
}

/* ================= 导航 ================= */
const VIEW_ORDER = ['search', 'queue', 'lib', 'pl', 'history', 'downloads', 'local', 'sources', 'settings', 'docs'];
function switchView(view, plId, fromPop) {
  const prev = S.view, prevPl = S.plId;
  if (plId) S.plId = plId;
  const same = prev === view && (view !== 'pl' || prevPl === S.plId);
  S.view = view;
  // 往下面的页面走时内容从下往上进，往回走时反过来
  $('#main').dataset.dir = VIEW_ORDER.indexOf(view) >= VIEW_ORDER.indexOf(prev) ? 'down' : 'up';
  const cur = b => b.dataset.view === view && (view !== 'pl' || b.dataset.pl === S.plId);
  $$('.nav button[data-view]').forEach(b => b.setAttribute('aria-current', String(cur(b))));
  // 手机底部标签：歌单、最近播放、下载、说明都归在「我的」下面
  const tab = ['pl', 'history', 'downloads', 'local', 'docs', 'lib'].includes(view) ? 'lib' : view;
  $$('.tabbar button').forEach(b => b.setAttribute('aria-current', String(b.dataset.view === tab)));
  $$('.view').forEach(v => {
    const show = v.dataset.view === view;
    if (show && !same) { v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); }
    v.hidden = !show;
  });
  if (view === 'pl') renderPlaylist();
  if (view === 'downloads') renderDownloads();
  if (view === 'settings') renderSettings();
  if (view === 'sources') renderSources();
  if (view === 'history') renderHistory();
  if (view === 'lib') renderLib();
  if (view === 'local') renderLocal();
  if (view === 'queue') requestAnimationFrame(revealPlaying);
  if (!same) $('#main').scrollTop = 0;
  placeIndicator();
  // 历史记录：搜索页是底，其他页面在它上面压一层，返回键回到搜索页
  if (!fromPop) {
    if (prev === 'search' && view !== 'search') Back.push({ view });
    else if (view === 'search' && prev !== 'search') Back.pop(st => !!st.view);
  }
}
$('.nav').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) switchView(b.dataset.view, b.dataset.pl); });
$('.tabbar').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) switchView(b.dataset.view); });
// 侧边导航里跟着走的高亮块
function placeIndicator() {
  const nav = $('.nav'), btn = $('.nav button[aria-current="true"]');
  moveIndicator($('.nav-ind'), btn, nav);
  moveIndicator($('.tab-ind'), $('.tabbar button[aria-current="true"]'), $('.tabbar'));
}
$('#plNav').addEventListener('scroll', placeIndicator, { passive: true });
window.addEventListener('resize', placeIndicator);

/* ================= 正在播放 ================= */
let shownKey = null, slideDir = 0;
function renderNow() {
  const t = curTrack();
  const changed = keyOf(t) !== shownKey;
  shownKey = keyOf(t);
  // 切歌时播放条里的歌名朝切换方向滑入
  const cls = changed && slideDir ? (slideDir > 0 ? ' from-right' : ' from-left') : '';
  slideDir = 0;
  $('#barTrack').innerHTML = coverHTML(t) + (t
    ? `<div class="t-main${cls}"><div class="t-title">${esc(t.title)}</div><div class="t-sub">${esc(t.artist)}</div></div>`
    : `<div class="t-main"><div class="t-title muted">未在播放</div><div class="t-sub">挑一首歌开始吧</div></div>`);
  if (changed || !$('#discCover').childElementCount) {
    $('#discCover').outerHTML = coverHTML(t, 'disc-cover' + (changed ? ' swap' : '')).replace('<div class="disc-cover', '<div id="discCover" class="disc-cover');
    setBackdrop(t);
  }
  desktopApp.tooltip(t ? `${t.title} - ${t.artist}` : '空壳播放器');
  $('#fullTitle').textContent = t ? t.title : '未在播放';
  $('#fullArtist').textContent = t ? [t.artist, t.album].filter(Boolean).join(' · ') : '';
  $('#fullVia').textContent = t ? '音源：' + sources.name(t.sourceId) : '';
  $('#tDur').textContent = fmt(t?.duration);
  document.title = t ? `${t.title} - ${t.artist} · 空壳播放器` : '空壳播放器';
  refreshHearts();
  applyColors(t);
}
// 全屏页背后的模糊封面：新旧两层交叉淡入
function setBackdrop(t) {
  const box = $('#fullArt');
  const old = [...box.children];
  if (t?.cover) {
    const img = new Image();
    img.alt = ''; img.referrerPolicy = 'no-referrer';
    img.onload = () => { box.append(img); requestAnimationFrame(() => img.classList.add('on')); old.forEach(o => { o.classList.remove('on'); setTimeout(() => o.remove(), 1300); }); };
    img.onerror = () => old.forEach(o => { o.classList.remove('on'); setTimeout(() => o.remove(), 1300); });
    img.src = t.cover;
  } else old.forEach(o => { o.classList.remove('on'); setTimeout(() => o.remove(), 1300); });
}
function setLoading(on) { $('#playBtn').classList.toggle('loading', on); }
function renderPlayBtn() {
  const p = !audio.paused;
  $('#playBtn').classList.toggle('is-playing', p);
  $('#playBtn').setAttribute('aria-label', p ? '暂停' : '播放');
  document.body.classList.toggle('playing', p);
  viz.playing = p;
  discSpin?.set(p);
}
function renderMode() {
  $$('#modeBtn, [data-now="mode"]').forEach(b => { b.innerHTML = IC[S.mode]; b.title = MODES[S.mode]; b.setAttribute('aria-label', '播放模式：' + MODES[S.mode]); b.classList.toggle('on', S.mode !== 'loop'); });
}
function cycleMode() { const ks = Object.keys(MODES); S.mode = ks[(ks.indexOf(S.mode) + 1) % ks.length]; S.plannedNext = -1; store.set('mode', S.mode); renderMode(); toast(MODES[S.mode]); }

/* ---------- 歌词 ---------- */
function renderLyrics(msg) {
  S.lyricIdx = -1;
  const box = $('#lyrics');
  renderLyricTools();
  if (!S.lyric.length) { box.innerHTML = `<div class="empty">${esc(msg || '暂无歌词')}</div>`; return; }
  const trans = S.settings.lyricTrans;
  box.innerHTML = S.lyric.map((l, i) => `<p data-li="${i}">${esc(l.txt) || '♪'}${l.sub && trans ? `<small>${esc(l.sub)}</small>` : ''}</p>`).join('');
  box.scrollTop = 0;
}
// 歌词工具：翻译开关、字号、时间微调（按歌曲记住）
const lyricShift = () => S.lyricShift[keyOf(curTrack())] || 0;
function renderLyricTools() {
  const box = $('#lyricTools');
  const timed = S.lyric.length && S.lyric[0].t >= 0, hasTrans = S.lyric.some(l => l.sub), sh = lyricShift();
  box.hidden = !timed;
  if (!timed) return;
  box.innerHTML = `${hasTrans ? `<button class="lt-btn${S.settings.lyricTrans ? ' on' : ''}" data-lt="trans" title="显示 / 隐藏翻译">译</button>` : ''}
    <button class="lt-btn" data-lt="size" title="歌词字号">Aa</button>
    <button class="lt-btn" data-lt="slow" title="歌词比歌声快：推后 0.5 秒">−</button>
    <span class="lt-shift mono" title="歌词时间偏移，点一下归零" data-lt="reset">${sh ? (sh > 0 ? '提前 ' : '推后 ') + Math.abs(sh).toFixed(1) + 's' : '对齐'}</span>
    <button class="lt-btn" data-lt="fast" title="歌词比歌声慢：提前 0.5 秒">+</button>`;
}
$('#lyricTools').addEventListener('click', e => {
  const b = e.target.closest('[data-lt]');
  if (!b) return;
  const a = b.dataset.lt, k = keyOf(curTrack());
  if (a === 'trans') { S.settings.lyricTrans = !S.settings.lyricTrans; saveSettings(); applySettings(); return; }
  if (a === 'size') { const order = ['s', 'm', 'l']; S.settings.lyricSize = order[(order.indexOf(S.settings.lyricSize) + 1) % 3]; saveSettings(); applySettings(); return; }
  if (!k) return;
  const v = a === 'reset' ? 0 : Math.round((lyricShift() + (a === 'fast' ? 0.5 : -0.5)) * 10) / 10;
  if (v) S.lyricShift[k] = v; else delete S.lyricShift[k];
  store.set('lyricShift', S.lyricShift);
  renderLyricTools(); S.lyricIdx = -2; syncLyric(audio.currentTime);
  pushNativeLyrics();
});
function syncLyric(t) {
  t += lyricShift();
  const idx = lineAt(S.lyric, t);
  const box = $('#lyrics');
  if (idx !== S.lyricIdx) {
    box.querySelector('p.cur')?.classList.remove('cur');
    $$('p.near', box).forEach(p => p.classList.remove('near'));
    S.lyricIdx = idx;
    const el = box.querySelector(`p[data-li="${idx}"]`);
    if (el) {
      el.classList.add('cur');
      el.previousElementSibling?.classList.add('near'); el.nextElementSibling?.classList.add('near');
      if (!lyricUserScroll && !$('#full').hidden) box.scrollTo({ top: el.offsetTop - box.clientHeight * 0.42 + el.clientHeight / 2, behavior: S.settings.motion ? 'smooth' : 'auto' });
    }
    pushDesktopLyric(true);
  }
  if (idx >= 0) {
    const cur = S.lyric[idx], nxt = S.lyric[idx + 1];
    const end = nxt ? nxt.t : (audio.duration || cur.t + 5);
    const p = Math.max(0, Math.min(1, (t - cur.t) / Math.max(0.3, end - cur.t)));
    box.querySelector('p.cur')?.style.setProperty('--lp', (p * 100).toFixed(1) + '%');
    lyricProgress = p;
  }
}
let lyricUserScroll = false, lyricScrollTimer, lyricProgress = 0, lastDlPush = 0;
$('#lyrics').addEventListener('wheel', () => { lyricUserScroll = true; clearTimeout(lyricScrollTimer); lyricScrollTimer = setTimeout(() => { lyricUserScroll = false; }, 3000); }, { passive: true });
$('#lyrics').addEventListener('touchmove', () => { lyricUserScroll = true; clearTimeout(lyricScrollTimer); lyricScrollTimer = setTimeout(() => { lyricUserScroll = false; }, 3000); }, { passive: true });
$('#lyrics').addEventListener('click', e => { const p = e.target.closest('p[data-li]'); const l = p && S.lyric[+p.dataset.li]; if (l && l.t >= 0 && audio.src) { audio.currentTime = l.t; lyricUserScroll = false; } });

function pushDesktopLyric(force) {
  if (!isDesktopApp() || !S.settings.dlyric) return;
  const now = performance.now();
  if (!force && now - lastDlPush < 120) return;
  lastDlPush = now;
  const t = curTrack(), l = S.lyric[S.lyricIdx], n = S.lyric[S.lyricIdx + 1];
  desktopLyrics.send({
    text: l ? l.txt : (t ? `${t.title} - ${t.artist}` : '空壳播放器'),
    sub: (S.settings.lyricTrans && l?.sub) || '', next: n ? n.txt : '', progress: l ? lyricProgress : 0,
    playing: !audio.paused, size: S.settings.dlyricSize, locked: S.settings.dlyricLock
  });
}

// 安卓悬浮歌词：颜色用 hsl 算成 ARGB 整数
function hslArgb(h, s = 0.95, l = 0.72) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return ((0xff << 24) | (f(0) << 16) | (f(8) << 8) | f(4)) >>> 0;
}
let overlayAsked = false;
async function pushNativeLyricConfig() {
  const st = S.settings;
  const h = st.dlyricColor === 'cover' ? +getComputedStyle(document.documentElement).getPropertyValue('--h').trim() || 228 : +st.dlyricColor;
  const r = await nativeLyric.config({ show: st.mlyric, locked: st.mlyricLock, ticker: st.tickerLyric, size: st.mlyricSize, color: hslArgb(h) });
  if (st.mlyric && !r.granted && !overlayAsked) { overlayAsked = true; toast('请在打开的设置页里允许「悬浮窗」，回到播放器后就会显示', 5000); }
  if (r.granted) overlayAsked = false;
}
function pushNativeLyrics() {
  if (!nativeLyric.available()) return;
  const sh = lyricShift(), trans = S.settings.lyricTrans;
  nativeLyric.lines(S.lyric.filter(l => l.t >= 0).map(l => ({ t: Math.max(0, l.t - sh), text: l.txt, sub: trans ? l.sub || '' : '' })));
}
// 从系统设置页回来时，悬浮窗权限可能刚给上
document.addEventListener('visibilitychange', () => { if (!document.hidden && nativeLyric.available() && S.settings.mlyric) pushNativeLyricConfig(); });

/* ---------- 播放核心 ---------- */
function stopPlayback() {
  audio.pause(); audio.removeAttribute('src'); audio.load();
  S.lyric = []; renderLyrics(); renderPlayBtn();
  nativeMedia.stop();
}
async function playIndex(i, { fresh = false, resumeAt = null } = {}) {
  if (i < 0 || i >= S.queue.length) return;
  if (!slideDir && i !== S.cur) slideDir = 1;
  S.cur = i; S.plannedNext = -1; saveQueue();
  const t = S.queue[i], token = ++S.token;
  S.playedVia = null;
  S.pendingSeek = resumeAt;
  if (!resumeAt) { S.resume = null; store.set('resume', null); }
  renderNow(); markPlaying(); setLoading(true);
  S.lyric = []; renderLyrics('正在获取歌词…'); pushNativeLyrics();
  audio.pause();
  fadeVolume(audio, userVol(), 0);
  let r;
  try {
    // 预取过的地址几分钟内直接用，省掉等待
    const pre = !fresh && S.prefetch.get(keyOf(t));
    S.prefetch.delete(keyOf(t));
    S.fromCache = !!(pre && Date.now() - pre.at < 4 * 60 * 1000);
    r = S.fromCache ? pre.r : await sources.resolveUrl(t, S.settings.quality, { failover: S.settings.failover });
    if (token !== S.token) return;
    S.playedVia = r;
    if (r.switched) toast(`原音源取不到，已换到「${sources.name(r.via)}」`);
    $('#fullVia').textContent = '音源：' + sources.name(r.via) + (r.quality ? ' · ' + r.quality : '');
    audio.src = r.url;
    await audio.play().catch(e => { if (e.name !== 'AbortError') throw e; });
    S.failStreak = 0; S.failed.delete(keyOf(t));
    pushHistory(t);
    schedulePrefetch(token);
  } catch (e) {
    if (token !== S.token) return;
    if (S.fromCache) { S.fromCache = false; return playIndex(i, { fresh: true }); }
    if (token !== S.token) return;
    setLoading(false);
    S.failed.add(keyOf(t)); markPlaying();
    S.failStreak++;
    const canSkip = S.settings.skipOnError && S.queue.length > 1 && S.failStreak < Math.min(5, S.queue.length);
    toast(`《${t.title}》播放失败\n${e.message.split('\n')[0]}${canSkip ? '\n即将播放下一首' : ''}`, 4200);
    renderPlayBtn();
    if (canSkip) setTimeout(() => { if (token === S.token) playIndex(nextIndex(1, true)); }, 1600);
    return;
  }
  updateMediaSession(t);
  if (!t.cover && ['local', 'downloaded'].includes(t.sourceId)) loadLocalCover(t, token);
  try {
    const L = await sources.resolveLyric(t, r);
    if (token !== S.token) return;
    S.lyric = mergeTranslation(parseLrc(L.lrc), L.trans);
    renderLyrics(); syncLyric(audio.currentTime);
    pushNativeLyrics();
  } catch { if (token === S.token) { S.lyric = []; renderLyrics('歌词获取失败'); } }
}
// 本地歌曲的封面：先读内嵌封面和文件夹里的封面图，没有就借联网音源里同一首歌的封面
const coverCache = new Map();
async function loadLocalCover(t, token) {
  const key = t.path || keyOf(t);
  if (!coverCache.has(key)) {
    let c = t.path && isTauri ? await localMusic.cover(t.path, 640) : null;
    if (!c) c = (await sources.lookupOnline(t).catch(() => null))?.cover || null;
    coverCache.set(key, c);
  }
  const c = coverCache.get(key);
  if (!c || token !== S.token) return;
  t.cover = c;
  shownKey = null; renderNow(); markPlaying(); updateMediaSession(t);
}
function nextIndex(dir, auto) {
  const n = S.queue.length;
  if (!n) return -1;
  if (auto && S.mode === 'one' && !S.failed.has(keyOf(curTrack()))) return S.cur;
  if (S.mode === 'shuffle' && n > 1) {
    // 随机模式提前定好下一首，这样也能预取
    if (dir > 0 && S.plannedNext >= 0 && S.plannedNext < n && S.plannedNext !== S.cur) return S.plannedNext;
    let j; do j = Math.floor(Math.random() * n); while (j === S.cur);
    if (dir > 0) S.plannedNext = j;
    return j;
  }
  return ((S.cur < 0 ? 0 : S.cur + dir) + n) % n;
}
// 当前歌开始播放几秒后，悄悄把下一首的播放地址取好
let prefetchTimer;
function schedulePrefetch(token) {
  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(async () => {
    if (token !== S.token || S.queue.length < 2) return;
    const j = nextIndex(1, true);
    const t = S.queue[j];
    if (!t || j === S.cur || S.prefetch.has(keyOf(t))) return;
    try {
      const r = await sources.resolveUrl(t, S.settings.quality, { failover: S.settings.failover });
      S.prefetch.clear();
      S.prefetch.set(keyOf(t), { r, at: Date.now() });
    } catch { /* 轮到它时再正常处理 */ }
  }, 8000);
}
const playNext = () => { slideDir = 1; playIndex(nextIndex(1)); };
const playPrev = () => { slideDir = -1; playIndex(nextIndex(-1)); };
// 暂停 / 继续时音量淡出淡入。被打断的渐变直接作废，音量以用户设置为准
const userVol = () => store.get('volume', 0.8);
async function togglePlay() {
  if (!curTrack()) { if (S.queue.length) playIndex(0); else toast('播放列表是空的，先去搜索吧'); return; }
  if (!audio.getAttribute('src')) { playIndex(S.cur, { resumeAt: S.resume?.key === keyOf(curTrack()) ? S.resume.t : null }); return; }
  const fade = S.settings.fade && !audio.muted;
  if (audio.paused) {
    if (fade) audio.volume = 0;
    try { await audio.play(); } catch (e) { audio.volume = userVol(); return toast('播放失败：' + e.message); }
    if (fade) fadeVolume(audio, userVol(), 260);
  } else if (fade) {
    await fadeVolume(audio, 0, 200);
    audio.pause();
    audio.volume = userVol();
  } else audio.pause();
}

/* ---------- 定时关闭 ---------- */
const SLEEP_OPTS = [[15, '15 分钟'], [30, '30 分钟'], [45, '45 分钟'], [60, '1 小时'], [90, '1 个半小时'], ['track', '播完这首']];
function sleepMenu(anchor) {
  openMenu(anchor, [
    { title: S.sleep ? '定时关闭：' + sleepLabel() : '定时关闭' },
    ...SLEEP_OPTS.map(([v, l]) => ({ label: l, icon: IC.clock, action: () => setSleep(v) })),
    ...(S.sleep ? ['-', { label: '取消定时', icon: IC.del, action: () => setSleep(0) }] : [])
  ]);
}
function sleepLabel() {
  if (!S.sleep) return '';
  if (S.sleep.track) return '播完这首';
  const left = Math.max(0, Math.round((S.sleep.end - Date.now()) / 1000));
  return fmt(left) === '--:--' ? '0:00' : fmt(left);
}
let sleepTick;
function setSleep(v) {
  clearInterval(sleepTick);
  S.sleep = !v ? null : v === 'track' ? { track: true } : { end: Date.now() + v * 60000 };
  if (S.sleep && !S.sleep.track) sleepTick = setInterval(() => { if (Date.now() >= S.sleep.end) sleepNow(); else renderSleep(); }, 1000);
  renderSleep();
  toast(!v ? '已取消定时关闭' : v === 'track' ? '这首播完后暂停' : `${v} 分钟后暂停播放`);
}
async function sleepNow() {
  clearInterval(sleepTick);
  S.sleep = null; renderSleep();
  if (audio.paused) return;
  await fadeVolume(audio, 0, 8000);
  audio.pause(); audio.volume = userVol();
  toast('定时结束，已暂停播放', 5000);
}
function renderSleep() {
  const on = !!S.sleep, label = sleepLabel();
  $$('[data-now="sleep"], #sleepBtn').forEach(b => { b.classList.toggle('on', on); b.title = on ? '定时关闭：' + label : '定时关闭'; });
  const chip = $('#sleepChip');
  chip.hidden = !on;
  chip.innerHTML = on ? `${IC.moon}<span class="mono">${label}</span>` : '';
}

function updateMediaSession(t) {
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album || '', artwork: t.cover && !t.cover.startsWith('data:') ? [{ src: t.cover, sizes: '300x300' }] : [] }); } catch { /* 部分 WebView 不支持 */ }
  }
  pushNativeMedia();
}
function pushNativeMedia() {
  const t = curTrack();
  if (!t) return;
  const cover = /^https?:/.test(t.cover || '') || (String(t.cover || '').startsWith('data:') && t.cover.length < 400000) ? t.cover : '';
  nativeMedia.update({ title: t.title, artist: t.artist, album: t.album || '', cover, playing: !audio.paused, position: audio.currentTime || 0, duration: isFinite(audio.duration) ? audio.duration : (t.duration || 0) });
}
const mediaActions = {
  play: () => { if (audio.paused) togglePlay(); },
  pause: () => { if (!audio.paused) audio.pause(); },
  toggle: togglePlay,
  next: playNext,
  prev: playPrev,
  seek: p => { if (isFinite(p) && audio.src) audio.currentTime = p; }
};
if ('mediaSession' in navigator) {
  const h = { play: mediaActions.play, pause: mediaActions.pause, previoustrack: mediaActions.prev, nexttrack: mediaActions.next, seekto: d => mediaActions.seek(d.seekTime) };
  for (const [k, f] of Object.entries(h)) { try { navigator.mediaSession.setActionHandler(k, f); } catch { /* 不支持 */ } }
}

/* ---------- 进度、音量、按键 ---------- */
const seek = $('#seek'), vol = $('#vol');
let seeking = false, raf = 0, lastResumeSave = 0;
const setP = (el, p) => el.style.setProperty('--p', (p * 100).toFixed(2) + '%');
function tick() {
  raf = requestAnimationFrame(tick);
  const d = audio.duration, c = audio.currentTime;
  if (!seeking && isFinite(d) && d > 0) { seek.value = Math.round(c / d * 1000); setP(seek, c / d); }
  $('#tCur').textContent = fmt(c) === '--:--' ? '0:00' : fmt(c);
  syncLyric(c);
  pushDesktopLyric(false);
  // 每隔几秒记下进度，下次打开能接着听
  const now = performance.now();
  if (now - lastResumeSave > 4000) { lastResumeSave = now; saveResume(); }
}
function saveResume() {
  const t = curTrack();
  if (!t || !audio.getAttribute('src') || !isFinite(audio.duration)) return;
  const c = audio.currentTime;
  S.resume = c > 5 && audio.duration - c > 10 ? { key: keyOf(t), t: Math.floor(c) } : null;
  store.set('resume', S.resume);
}
window.addEventListener('pagehide', saveResume);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveResume(); });
audio.addEventListener('play', () => { renderPlayBtn(); setLoading(false); cancelAnimationFrame(raf); tick(); pushNativeMedia(); pushDesktopLyric(true); });
audio.addEventListener('pause', () => { renderPlayBtn(); cancelAnimationFrame(raf); pushNativeMedia(); pushDesktopLyric(true); saveResume(); });
audio.addEventListener('waiting', () => setLoading(true));
audio.addEventListener('playing', () => setLoading(false));
audio.addEventListener('progress', () => { if (audio.buffered.length && isFinite(audio.duration)) $('#buffered').style.width = (audio.buffered.end(audio.buffered.length - 1) / audio.duration * 100) + '%'; });
audio.addEventListener('loadedmetadata', () => {
  $('#tDur').textContent = fmt(audio.duration);
  const t = curTrack();
  if (t && isFinite(audio.duration) && Math.abs((t.duration || 0) - audio.duration) > 1) {
    t.duration = audio.duration;
    if (t.sourceId === 'local') localSource.setDuration(t.id, audio.duration);
    saveQueue();
  }
  if (S.pendingSeek && S.pendingSeek < audio.duration - 5) { audio.currentTime = S.pendingSeek; toast('从 ' + fmt(S.pendingSeek) + ' 继续播放'); }
  S.pendingSeek = null;
  try { navigator.mediaSession?.setPositionState?.({ duration: audio.duration, position: audio.currentTime, playbackRate: 1 }); } catch { /* 忽略 */ }
  pushNativeMedia();
});
audio.addEventListener('seeked', pushNativeMedia);
audio.addEventListener('ended', () => {
  if (S.sleep?.track) { S.sleep = null; renderSleep(); toast('定时结束，已暂停播放', 5000); return; }
  const j = nextIndex(1, true);
  if (j === S.cur) { audio.currentTime = 0; audio.play(); } else playIndex(j);
});
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src')) return;
  // 预取的地址可能已经过期，重新取一次
  if (S.fromCache) { S.fromCache = false; return playIndex(S.cur, { fresh: true }); }
  setLoading(false);
  const t = curTrack();
  if (t) { S.failed.add(keyOf(t)); markPlaying(); }
  toast('音频加载失败：地址无效、已过期，或格式不受支持', 4000);
  renderPlayBtn();
});
seek.addEventListener('input', () => { seeking = true; setP(seek, seek.value / 1000); if (isFinite(audio.duration)) $('#tCur').textContent = fmt(seek.value / 1000 * audio.duration); });
seek.addEventListener('change', () => {
  if (isFinite(audio.duration)) audio.currentTime = seek.value / 1000 * audio.duration;
  else if (S.resume && curTrack()?.duration) { S.resume.t = seek.value / 1000 * curTrack().duration; togglePlay(); }
  seeking = false;
});
// 鼠标悬停在进度条上时显示对应时间
const seekTip = $('#seekTip');
seek.addEventListener('pointermove', e => {
  const d = isFinite(audio.duration) ? audio.duration : curTrack()?.duration;
  if (!d) return;
  const r = seek.getBoundingClientRect(), p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  seekTip.textContent = fmt(p * d) === '--:--' ? '0:00' : fmt(p * d);
  seekTip.style.left = (e.clientX - r.left) + 'px';
  seekTip.hidden = false;
});
seek.addEventListener('pointerleave', () => { seekTip.hidden = true; });
audio.volume = userVol();
vol.value = Math.round(audio.volume * 100); setP(vol, audio.volume);
function setVolume(v) {
  v = Math.max(0, Math.min(1, v));
  audio.volume = v; audio.muted = false;
  vol.value = Math.round(v * 100); setP(vol, v);
  store.set('volume', v);
  $('#muteBtn').classList.remove('on');
}
vol.addEventListener('input', () => setVolume(vol.value / 100));
$('.bar-right').addEventListener('wheel', e => { if (e.target.closest('#vol, #muteBtn')) { e.preventDefault(); setVolume(userVol() - Math.sign(e.deltaY) * 0.05); } }, { passive: false });
const toggleMute = () => { audio.muted = !audio.muted; $('#muteBtn').classList.toggle('on', audio.muted); setP(vol, audio.muted ? 0 : audio.volume); };
$('#muteBtn').addEventListener('click', toggleMute);
$('#playBtn').addEventListener('click', togglePlay);
$('#prevBtn').addEventListener('click', () => { if (audio.currentTime > 4) audio.currentTime = 0; else playPrev(); });
$('#nextBtn').addEventListener('click', playNext);
$('#modeBtn').addEventListener('click', cycleMode);
$('#barLike').addEventListener('click', e => { const t = curTrack(); if (t) toggleLike(t, e.currentTarget); });
$('#barTrack').addEventListener('click', () => openFull());
$('#lyricBtn').addEventListener('click', () => $('#full').hidden ? openFull('lyric') : closeFull());
$('#sleepBtn').addEventListener('click', e => sleepMenu(e.currentTarget));
// 手机上在播放条左右滑动切歌
enableSwipe($('#barTrack'), { target: () => $('#barTrack .t-main'), onLeft: playNext, onRight: playPrev });

/* ---------- 全屏播放页 ---------- */
const viz = new Visualizer($('#viz'));
let discSpin = null;
const discShown = () => !matchMedia('(max-width: 860px)').matches || $('.full-body').dataset.ft === 'disc';
function openFull(tab) {
  const f = $('#full');
  if (!f.hidden && !f.classList.contains('closing')) { if (tab) setFullTab(tab); return; }
  f.classList.remove('closing');
  if (tab) setFullTab(tab);
  // 唱片可见时，封面从播放条飞到唱片中央；否则整页从下往上滑入
  const fly = motionOK() && discShown() && curTrack();
  f.classList.toggle('fly-in', !!fly);
  f.hidden = false;
  if (fly) flyCover($('#barTrack .cover'), $('#discCover'));
  if (S.settings.motion) viz.start();
  $('#lyricBtn').classList.add('on');
  Back.push('full');
  requestAnimationFrame(() => { S.lyricIdx = -2; syncLyric(audio.currentTime); });
}
function closeFull(fromPop) {
  const f = $('#full');
  if (f.hidden || f.classList.contains('closing')) return;
  if (fromPop !== true) Back.pop('full');
  $('#lyricBtn').classList.remove('on');
  if (!motionOK()) { f.hidden = true; viz.stop(); return; }
  const fly = discShown() && curTrack();
  f.classList.toggle('fly-out', !!fly);
  f.classList.add('closing');
  if (fly) flyCover($('#discCover'), $('#barTrack .cover'), { duration: 420, toRadius: '10px' });
  setTimeout(() => { if (f.classList.contains('closing')) { f.hidden = true; f.classList.remove('closing', 'fly-out'); viz.stop(); } }, fly ? 420 : 350);
}
function setFullTab(tab) {
  $('.full-body').dataset.ft = tab;
  $$('.full-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.ft === tab)));
  if (tab === 'lyric') requestAnimationFrame(() => { S.lyricIdx = -2; syncLyric(audio.currentTime); });
}
$('#fullClose').addEventListener('click', () => closeFull());
$$('.full-tabs button').forEach(b => b.addEventListener('click', () => setFullTab(b.dataset.ft)));
$('#disc').addEventListener('click', () => { if (matchMedia('(max-width: 860px)').matches) setFullTab('lyric'); });
$('.full-acts').addEventListener('click', e => {
  const b = e.target.closest('[data-now]'), t = curTrack();
  if (!b) return;
  if (b.dataset.now === 'dlyric') { S.settings.dlyric = !S.settings.dlyric; saveSettings(); applySettings(); toast(S.settings.dlyric ? '已打开桌面歌词' : '已关闭桌面歌词'); return; }
  if (b.dataset.now === 'sleep') return sleepMenu(b);
  if (b.dataset.now === 'mode') return cycleMode();
  if (!t) return;
  if (b.dataset.now === 'like') toggleLike(t, b);
  else if (b.dataset.now === 'addto') openMenu(b, playlistItems([t]));
  else if (b.dataset.now === 'download') download(t);
});
// 手机上下滑收起，在唱片上左右滑切歌
let touchY = null;
$('#full').addEventListener('touchstart', e => { touchY = e.target.closest('.lyrics') ? null : e.touches[0].clientY; }, { passive: true });
$('#full').addEventListener('touchend', e => { if (touchY != null && e.changedTouches[0].clientY - touchY > 90) closeFull(); touchY = null; });
enableSwipe($('.disc-wrap'), { target: () => $('#disc'), onLeft: playNext, onRight: playPrev, threshold: 70 });

/* ---------- 快捷键 ---------- */
const KEYS = [
  ['空格', '播放 / 暂停'], ['← / →', '后退 / 前进 5 秒'], ['Ctrl + ← / →', '上一首 / 下一首'], ['↑ / ↓', '音量加 / 减'],
  ['/ 或 Ctrl + K', '搜索'], ['L', '喜欢 / 取消喜欢'], ['M', '静音'], ['F', '打开 / 收起正在播放'], ['Esc', '关闭弹窗、菜单、正在播放'], ['?', '显示这张表']
];
function showKeys() {
  const keys = isDesktopApp() && S.settings.globalKeys ? [...KEYS, ...GLOBAL_KEYS.map(([k, d]) => [keyLabel(k).replace(/\+/g, ' + '), d + '（全局）'])] : KEYS;
  openDialog({ title: '快捷键', narrow: true, body: `<div class="keys">${keys.map(([k, d]) => `<div><span>${k.split(' ').map(x => /^[/+]$|^或$/.test(x) ? `<i>${x}</i>` : `<kbd>${esc(x)}</kbd>`).join(' ')}</span><span class="muted">${d}</span></div>`).join('')}</div>` });
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (menuOpen) return closeMenu(); if (!$('#modal').hidden) return closeDialog(); if (!$('#full').hidden) return closeFull(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); closeFull(); switchView('search'); $('#kw').focus(); $('#kw').select(); return; }
  if (e.target.closest('input, textarea, select, [contenteditable]') || !$('#modal').hidden) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') playNext();
  else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') playPrev();
  else if (e.ctrlKey || e.metaKey || e.altKey) return;
  else if (e.key === 'ArrowRight' && audio.src) audio.currentTime += 5;
  else if (e.key === 'ArrowLeft' && audio.src) audio.currentTime -= 5;
  else if (e.key === 'ArrowUp') { e.preventDefault(); setVolume(userVol() + 0.05); toast('音量 ' + Math.round(userVol() * 100) + '%', 900); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); setVolume(userVol() - 0.05); toast('音量 ' + Math.round(userVol() * 100) + '%', 900); }
  else if (e.key === '/') { e.preventDefault(); closeFull(); switchView('search'); $('#kw').focus(); $('#kw').select(); }
  else if (k === 'l') { const t = curTrack(); if (t) toggleLike(t, $('#full').hidden ? $('#barLike') : $('[data-now="like"]')); }
  else if (k === 'm') toggleMute();
  else if (k === 'f') $('#full').hidden ? openFull() : closeFull();
  else if (e.key === '?') showKeys();
});

/* ================= 检查更新 ================= */
async function checkUpdate({ manual = false, btn } = {}) {
  if (btn) { btn.disabled = true; btn.textContent = '检查中…'; }
  try {
    const u = await appUpdate.check(VERSION);
    const snooze = store.get('updateSnooze', null);
    if (!u) { if (manual) toast('已经是最新版本 v' + VERSION); return; }
    if (!manual && snooze && snooze.version === u.version && Date.now() < snooze.until) return;
    openDialog({
      title: `发现新版本 v${u.version}`, narrow: true,
      body: `<p class="small muted">当前 v${VERSION}</p>${u.notes ? `<div class="note small upd-notes">${esc(u.notes.slice(0, 1200))}</div>` : ''}
        ${u.install ? '<div class="upd-bar" id="updBar" hidden><i></i></div>' : '<p class="small muted">会在浏览器里打开安装包下载，下载完成后点开覆盖安装。</p>'}`,
      foot: `<button class="btn" id="updLater">以后再说</button><button class="btn primary" id="updGo">${u.install ? '更新并重启' : '去下载'}</button>`
    });
    $('#updLater').onclick = () => { store.set('updateSnooze', { version: u.version, until: Date.now() + 3 * 86400000 }); closeDialog(); };
    $('#updGo').onclick = async () => {
      if (!u.install) { openExternal(u.url).catch(e => toast('打不开浏览器：' + e.message)); closeDialog(); return; }
      const go = $('#updGo'), bar = $('#updBar');
      go.disabled = true; go.textContent = '正在下载…'; $('#updLater').disabled = true; bar.hidden = false;
      try { await u.install(p => { bar.style.setProperty('--p', Math.round(p * 100) + '%'); go.textContent = `正在下载 ${Math.round(p * 100)}%`; }); }
      catch (e) { toast('更新失败：' + (e?.message || e), 5000); go.disabled = false; go.textContent = '重试'; $('#updLater').disabled = false; }
    };
  } catch (e) { if (manual) toast('检查更新失败：' + (e?.message || e), 4000); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '现在检查'; } }
}

/* ================= 首次使用 ================= */
function welcome() {
  openDialog({
    title: '欢迎使用空壳播放器', narrow: true,
    body: `<div class="welcome">
      <div class="welcome-disc" aria-hidden="true"><span></span></div>
      <p>这是一个<b>「空壳」</b>：它负责播放、歌词、歌单和下载，但本身不带任何曲库。歌从哪里来，由你添加的<b>音源</b>决定。</p>
      <ol class="steps">
        <li style="--i:0"><b>添加音源</b><span>支持 MusicFree 插件、洛雪自定义源、JSON 配置和脚本；可以填网址、选文件${coarse() ? '' : '，或者直接把文件拖进窗口'}</span></li>
        <li style="--i:1"><b>搜索</b><span>多个音源同时搜，谁先返回先显示谁</span></li>
        <li style="--i:2"><b>播放</b><span>某个音源取不到地址时，会自动去其他音源找同一首歌</span></li>
      </ol>
      <p class="small muted">还没准备好音源？先用内置的三首公版示例曲试试播放器。</p></div>`,
    foot: `<button class="btn" data-close data-go="demo">先听听示例</button><button class="btn primary" data-close data-go="addsrc">添加音源</button>`
  });
  store.set('welcomed', VERSION);
}
// 搜索页顶部的上手提示：还没有任何自己的音源时显示
function renderStarter() {
  const show = !sources.entries.length && !store.get('starterHidden', false);
  const box = $('#starter');
  box.hidden = !show;
  if (!show) return;
  box.innerHTML = `<div class="starter-text"><b>第一步：添加一个音源</b><span class="small muted">播放器本身没有曲库，添加音源后就能搜索和播放。现在能搜到的只有示例曲和本地音乐。</span></div>
    <div class="row"><button class="btn primary" data-go="addsrc">${IC.add}添加音源</button><button class="btn" data-go="local">导入本地音乐</button><button class="icon-btn" id="starterClose" aria-label="不再显示" title="不再显示">${IC.del}</button></div>`;
  $('#starterClose').onclick = () => { store.set('starterHidden', true); renderStarter(); };
}

/* ================= 启动 ================= */
async function boot() {
  await initPlatform();
  document.body.classList.toggle('touch', coarse());
  const builtins = [['demo', demoSource], ['local', localSource]];
  if (isTauri) builtins.push(['downloaded', downloadedSource]);
  sources = new SourceManager({
    store, builtins, env: isMobile() ? 'mobile' : 'desktop',
    onUpdateAlert: (id, d) => toast(`「${sources.name(id)}」有新版本${d.log ? '：\n' + String(d.log).slice(0, 120) : ''}`, 6000)
  });
  // 首次启动就把内置音源装好，省掉"装完了还得自己找音源"这一步
  await seedBundledSources(sources, { store }).catch(err => console.warn('内置音源加载失败', err));
  await sources.loadAll();
  localSource.setHooks({ fileUrl: fileSrc, lyric: localMusic.lyric, readTags: f => import('./core/tags.js').then(m => m.readTags(f)) });
  if (localMusic.available()) {
    const lib = store.get('localLib', []);
    setLocalLibrary(lib);
    localMusic.allow(lib.map(x => x.path)).catch(() => {});
  }

  if (!Array.isArray(S.queue)) {
    const { list } = await demoSource.search('');
    S.queue = list.map(t => sources.normTrack(t, 'demo'));
    S.cur = 0; saveQueue();
  }
  // 示例歌曲的封面是现场画的，不保存
  S.queue.forEach(t => { if (t.sourceId === 'demo') { const s = DEMO_SONGS.find(x => x.id === t.id); if (s && !t.cover) demoSource.search(s.title).then(r => { t.cover = r.list[0]?.cover; if (t === curTrack()) { shownKey = null; renderNow(); } markPlaying(); }); } });
  if (S.cur >= S.queue.length) S.cur = S.queue.length - 1;

  if (isDesktopApp()) {
    $('[data-now="dlyric"]').hidden = false;
    desktopLyrics.onControl(c => {
      if (c === 'toggle') togglePlay();
      else if (c === 'next') playNext();
      else if (c === 'prev') playPrev();
      else if (c === 'close') { S.settings.dlyric = false; saveSettings(); applySettings(); }
      else if (c === 'lock') { S.settings.dlyricLock = true; saveSettings(); applySettings(); toast('桌面歌词已锁定，可在托盘菜单或设置里解锁', 4000); }
      else if (c === 'ready') pushDesktopLyric(true);
    });
    desktopApp.onTray(c => {
      if (c === 'toggle') togglePlay();
      else if (c === 'next') playNext();
      else if (c === 'prev') playPrev();
      else if (c === 'dlyric') { S.settings.dlyric = !S.settings.dlyric; saveSettings(); applySettings(); }
      else if (c === 'dlyric-unlock') { S.settings.dlyric = true; S.settings.dlyricLock = false; saveSettings(); applySettings(); toast('桌面歌词已解锁'); }
    });
  }
  nativeMedia.onAction(e => { const f = mediaActions[e.action]; if (f) f(e.position); });
  window.addEventListener('offline', () => toast('网络断开了，联网音源暂时用不了', 4000));
  window.addEventListener('online', () => toast('网络已恢复'));

  discSpin = new Spinner($('#disc'));
  enableRipple('.btn, .icon-btn, .nav button[data-view], .tabbar button, .seg button, .lib-card, .chip-btn');
  $('#docBody').innerHTML = DOC_HTML();
  applySettings();
  renderSources(); renderQueue(); renderPlNav(); renderNow(); renderMode(); renderPlayBtn(); renderSleep(); renderStarter(); renderSearchHist();
  renderLyrics(curTrack() ? '点播放后显示歌词' : '暂无歌词');
  // 上次听到一半的歌：进度条停在上次的位置，点播放接着听
  const t = curTrack();
  if (S.resume && t && S.resume.key === keyOf(t) && t.duration) { setP(seek, S.resume.t / t.duration); seek.value = Math.round(S.resume.t / t.duration * 1000); $('#tCur').textContent = fmt(S.resume.t); }
  history.replaceState({ root: true }, '');
  placeIndicator();
  document.fonts?.ready.then(placeIndicator);
  if (!store.get('welcomed', null)) setTimeout(welcome, 400);
  // 启动后稍等再做后台检查，不和首屏抢网络
  setTimeout(() => {
    if (S.settings.autoUpdateSources && navigator.onLine) refreshSources({ quiet: true });
    if (S.settings.autoCheckUpdate && appUpdate.available() && navigator.onLine) checkUpdate();
  }, 8000);
  await doSearch();
}
boot().catch(e => { console.error(e); toast('启动出错：' + e.message, 6000); });
