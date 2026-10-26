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
import { TEMPLATES, DOC_HTML } from './ui/docs.js';
import { extractColors, Visualizer } from './ui/fx.js';
import { initPlatform, isTauri, isMobile, isDesktopApp, platformName, downloadTrack, fileSrc, readTextFile, desktopLyrics, nativeMedia } from './platform.js';

const VERSION = '0.1.0';
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
  trash: svg('M8 3h8l1 2h4v2H3V5h4zm-2 6h12l-1 12H7z')
};
const MODES = { loop: '列表循环', one: '单曲循环', shuffle: '随机播放' };
const QUALITIES = [['128k', '标准'], ['320k', '高品'], ['flac', '无损']];

/* ================= 状态 ================= */
const S = {
  queue: store.get('queue', null),
  cur: store.get('cur', -1),
  mode: store.get('mode', 'loop'),
  settings: Object.assign({ quality: '320k', failover: true, skipOnError: true, theme: 'system', motion: true, dlyric: false, dlyricLock: false, dlyricSize: 34 }, store.get('settings', {})),
  playlists: store.get('playlists', [{ id: 'fav', name: '我喜欢', tracks: [] }]),
  downloads: store.get('downloads', []),
  view: 'search', plId: 'fav',
  results: [], kw: '', page: 1, hasMore: false, searching: false, searchSel: '*',
  lyric: [], lyricIdx: -1, playedVia: null, token: 0, failStreak: 0, failed: new Set()
};
const keyOf = t => t ? t.sourceId + '::' + t.id : '';
const lean = t => { const { lyric, ...rest } = t; return rest; };
const saveQueue = () => { store.set('queue', S.queue.map(lean)); store.set('cur', S.cur); };
const savePlaylists = () => store.set('playlists', S.playlists);
const saveSettings = () => store.set('settings', S.settings);
const curTrack = () => S.queue[S.cur];
const playlist = id => S.playlists.find(p => p.id === id);
const isLiked = t => !!t && playlist('fav').tracks.some(x => keyOf(x) === keyOf(t));

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

/* ================= 封面与取色 ================= */
function coverHTML(t, cls = 'cover') {
  const h = hue((t && (t.album || t.title)) || '空');
  const ch = ((t && t.title) || '♪').trim().charAt(0);
  const bg = `background:linear-gradient(135deg,hsl(${h} 55% 50%),hsl(${(h + 50) % 360} 60% 34%))`;
  const img = t && t.cover ? `<img src="${esc(t.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return `<div class="${cls}" style="${bg}">${esc(ch)}${img}</div>`;
}
let colorToken = 0;
async function applyColors(t) {
  const my = ++colorToken;
  const [h1, h2, h3] = await extractColors(t);
  if (my !== colorToken) return;
  const r = document.documentElement.style;
  r.setProperty('--h', h1); r.setProperty('--h2', h2); r.setProperty('--h3', h3);
  viz.color = `hsl(${h1} 90% 75% / .8)`;
  desktopLyrics.send({ hue: h1 });
}

/* ================= 歌曲列表 ================= */
function rowHTML(t, i, ctx) {
  const playing = keyOf(t) === keyOf(curTrack());
  const failed = S.failed.has(keyOf(t));
  const liked = isLiked(t);
  const extra = ctx === 'q'
    ? `<button class="icon-btn" data-act="remove" aria-label="从播放列表移除" title="移除">${IC.del}</button>`
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
const tracksHTML = (list, ctx) => `<div class="tracks" data-ctx="${ctx}">${listHead}${list.map((t, i) => rowHTML(t, i, ctx)).join('')}</div>`;

function listFor(ctx) {
  if (ctx === 'r') return S.results;
  if (ctx === 'q') return S.queue;
  if (ctx === 'p') return playlist(S.plId)?.tracks || [];
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
  else if (!btn && (isMobile() || matchMedia('(pointer: coarse)').matches)) { ctx === 'q' ? playIndex(i) : playFromList(list, i); }
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
    if (btn) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
  }
  savePlaylists(); refreshHearts();
  if (S.view === 'pl' && S.plId === 'fav') renderPlaylist();
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
  saveQueue(); renderQueue(); renderNow();
}

/* ================= 菜单 ================= */
function openMenu(anchor, items) {
  const m = $('#menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : it.title ? `<div class="menu-title">${esc(it.title)}</div>` : `<button role="menuitem" data-mi="${i}">${it.icon || ''}<span>${esc(it.label)}</span></button>`).join('');
  m.hidden = false;
  const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  m.style.left = Math.max(12, Math.min(innerWidth - mw - 12, r.right - mw)) + 'px';
  m.style.top = (r.bottom + mh + 8 > innerHeight ? Math.max(12, r.top - mh - 6) : r.bottom + 6) + 'px';
  m.onclick = e => { const b = e.target.closest('[data-mi]'); if (b) { closeMenu(); items[+b.dataset.mi].action(); } };
  $('button', m)?.focus();
}
function closeMenu() { $('#menu').hidden = true; }
document.addEventListener('pointerdown', e => { if (!e.target.closest('#menu') && !e.target.closest('[data-act="more"],[data-now="addto"]')) closeMenu(); });

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
  openMenu(anchor, items);
}

/* ================= 弹窗 ================= */
function openDialog({ title, body, foot = '', narrow = false }) {
  $('#dlgTitle').textContent = title;
  $('#dlgBody').innerHTML = body;
  $('#dlgFoot').innerHTML = foot;
  $('.dialog').classList.toggle('narrow', narrow);
  $('#modal').hidden = false;
  setTimeout(() => $('#dlgBody input, #dlgBody textarea')?.focus(), 50);
  return $('.dialog');
}
const closeDialog = () => { $('#modal').hidden = true; };
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeDialog(); });

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
}
function renderPlaylist() {
  const pl = playlist(S.plId) || playlist('fav');
  S.plId = pl.id;
  const first = pl.tracks.find(t => t.cover);
  const dur = pl.tracks.reduce((a, t) => a + (t.duration || 0), 0);
  const isFav = pl.id === 'fav';
  $('#plHead').innerHTML = `<div class="pl-cover" style="background:linear-gradient(135deg,hsl(${hue(pl.name)} 60% 52%),hsl(${(hue(pl.name) + 60) % 360} 60% 34%))">${first ? `<img src="${esc(first.cover)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : (isFav ? '♥' : '♪')}</div>
    <div class="grow"><div class="kicker">${isFav ? '收藏' : '歌单'}</div><h2>${esc(pl.name)}</h2>
      <p class="muted small">${pl.tracks.length} 首${dur ? ' · ' + Math.round(dur / 60) + ' 分钟' : ''}</p>
      <div class="row" style="margin-top:10px"><button class="btn primary" id="plPlay" ${pl.tracks.length ? '' : 'disabled'}>${IC.play}播放全部</button>
      ${isFav ? '' : `<button class="btn" id="plRename">重命名</button><button class="btn danger" id="plDelete">删除歌单</button>`}</div></div>`;
  $('#plList').innerHTML = pl.tracks.length ? tracksHTML(pl.tracks, 'p') : `<div class="empty"><span class="big">${isFav ? '♡' : '♪'}</span>${isFav ? '点歌曲旁边的爱心，就会收藏到这里。' : '在歌曲的「更多」菜单里选择「添加到歌单」。'}</div>`;
  $('#plPlay').onclick = () => playAll(pl.tracks);
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

/* ================= 搜索 ================= */
function renderSrcSelect() {
  const sel = $('#srcSelect');
  const ids = sources.searchable();
  sel.innerHTML = `<option value="*">全部音源（${ids.length}）</option>` + ids.map(id => `<option value="${esc(id)}">${esc(sources.name(id))}</option>`).join('');
  sel.value = ids.includes(S.searchSel) ? S.searchSel : '*';
  const lxOnly = sources.enabled().filter(id => sources.get(id).kind === 'lx');
  $('#searchHint').textContent = lxOnly.length ? `另有 ${lxOnly.length} 个洛雪源负责取播放地址` : '';
}
async function doSearch(more = false) {
  const which = $('#srcSelect').value;
  S.searchSel = which;
  if (!more) { S.kw = $('#kw').value.trim(); S.page = 1; }
  else S.page++;
  let ids = which === '*' ? sources.searchable() : [which];
  // 没输入关键词时只列出内置音源（示例、本地、已下载），网络音源需要关键词
  if (!S.kw && which === '*') ids = ids.filter(id => sources.get(id).builtin);
  if (!ids.length) { S.results = []; renderResults(); return; }
  S.searching = true;
  if (!more) renderResults({ loading: true });
  else $('#moreBtn')?.setAttribute('disabled', '');
  const r = await sources.search(ids, S.kw, S.page);
  S.searching = false;
  S.results = more ? S.results.concat(r.results) : r.results;
  S.hasMore = ids.length === 1 && r.hasMore;
  renderResults({ errors: r.errors });
}
function renderResults(state = {}) {
  const box = $('#results');
  if (state.loading) { box.innerHTML = '<div class="skeleton"></div>'.repeat(6); return; }
  const errs = (state.errors || []).map(([id, msg]) => `<div class="note small"><b>${esc(sources.name(id))}</b> 搜索失败：<span class="muted">${esc(msg)}</span></div>`).join('');
  if (!S.results.length) {
    const none = !sources.searchable().length;
    box.innerHTML = errs + `<div class="empty"><span class="big">${none ? '◌' : '⌕'}</span>${none ? '还没有能搜索的音源。<br>去「音源」页添加一个吧。' : S.kw ? '没有找到结果，换个关键词试试。' : '输入关键词开始搜索。'}</div>`;
    return;
  }
  box.innerHTML = errs + `<div class="row" style="margin-bottom:4px"><span class="muted small grow">${S.results.length} 首${S.kw ? `，关键词「${esc(S.kw)}」` : ''}</span>
    <button class="btn" id="addAllPl">${IC.list}添加到歌单</button><button class="btn primary" id="playAllBtn">${IC.play}播放全部</button></div>`
    + tracksHTML(S.results, 'r')
    + (S.hasMore ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" id="moreBtn">加载更多</button></div>` : '');
  $('#playAllBtn').onclick = () => playAll(S.results);
  $('#addAllPl').onclick = e => openMenu(e.currentTarget, playlistItems(S.results));
  $('#moreBtn')?.addEventListener('click', () => doSearch(true));
}
$('#searchForm').addEventListener('submit', e => { e.preventDefault(); $('#kw').blur(); doSearch(); });
$('#srcSelect').addEventListener('change', () => { if (S.kw || $('#kw').value.trim()) doSearch(); else { S.searchSel = $('#srcSelect').value; doSearch(); } });

/* ================= 播放列表 ================= */
function renderQueue() {
  $('#qCount').textContent = S.queue.length || '';
  $('#queueList').innerHTML = S.queue.length ? tracksHTML(S.queue, 'q') : `<div class="empty"><span class="big">≡</span>播放列表是空的。在搜索结果里双击歌曲，或用「更多」菜单加入。</div>`;
}
armButton($('#clearQ'), '再点一次清空', () => { S.queue = []; S.cur = -1; stopPlayback(); saveQueue(); renderQueue(); renderNow(); });
$('#saveQ').addEventListener('click', async () => { if (!S.queue.length) return toast('播放列表是空的'); const pl = await newPlaylist(); if (pl) addToPlaylist(pl.id, S.queue); });

/* ================= 下载 ================= */
async function download(t) {
  toast('正在获取下载地址：' + t.title);
  try {
    const r = await sources.resolveUrl(t, S.settings.quality, { failover: S.settings.failover });
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
    ? `<div class="row" style="margin-bottom:4px"><span class="muted small grow">${list.length} 首</span>${isTauri ? `<button class="btn primary" id="dlPlay">${IC.play}播放全部</button>` : ''}<button class="btn danger" id="dlClear">清空记录</button></div>` + tracksHTML(list, 'd')
    : `<div class="empty"><span class="big">↓</span>还没有下载过歌曲。在歌曲的「更多」菜单里选择「下载」。</div>`;
  $('#dlPlay')?.addEventListener('click', () => playAll(list));
  if ($('#dlClear')) armButton($('#dlClear'), '再点一次清空', () => { S.downloads = []; store.set('downloads', []); renderDownloads(); });
}

/* ================= 音源页 ================= */
const KIND = { builtin: '内置', json: 'JSON', script: '脚本', musicfree: 'MusicFree', lx: '洛雪' };
function renderSources() {
  const cards = [...sources.runtime.entries()].filter(([id]) => id !== 'downloaded').map(([id, r], i) => {
    const on = !sources.disabled.has(id);
    let extra = '';
    if (id === 'local') extra = `<button class="btn" data-sa="pick">选择文件</button><button class="btn" data-sa="dir">选择文件夹</button><span class="small muted">${localSource.count ? `已导入 ${localSource.count} 首` : '也可以把文件拖进窗口'}</span>`;
    else if (!r.builtin) {
      const entry = sources.entries.find(e => e.id === id);
      extra = (r.userVariables?.length ? `<button class="btn" data-sa="vars">插件设置</button>` : '')
        + (entry?.url ? `<button class="btn" data-sa="update">更新</button>` : '')
        + `<button class="btn" data-sa="edit">编辑</button><button class="btn danger" data-sa="del">删除</button>`;
    }
    const caps = r.error ? '' : [r.canSearch && '搜索', r.canUrl && '播放', r.getLyric && '歌词'].filter(Boolean).join(' · ');
    return `<div class="src${on ? '' : ' off'}" data-id="${esc(id)}" style="--i:${i}">
      <div class="src-head"><div class="grow"><div class="src-name">${esc(r.name)}</div>
        <div class="row small" style="margin-top:6px"><span class="chip${r.kind === 'builtin' ? ' accent' : ''}">${KIND[r.kind] || r.kind}</span>${r.version ? `<span class="chip mono">v${esc(r.version)}</span>` : ''}${r.error ? '<span class="chip err">加载失败</span>' : caps ? `<span class="chip">${caps}</span>` : ''}</div></div>
        <label class="switch" title="${on ? '停用' : '启用'}"><input type="checkbox" data-sa="toggle" ${on ? 'checked' : ''} ${r.error ? 'disabled' : ''} aria-label="启用 ${esc(r.name)}"><span></span></label></div>
      <div class="src-desc">${r.error ? `<span style="color:var(--danger)">${esc(r.error)}</span>` : esc(r.description || '没有描述')}${r.author ? `<br>作者：${esc(r.author)}` : ''}</div>
      ${extra ? `<div class="row">${extra}</div>` : ''}</div>`;
  });
  $('#sourceList').innerHTML = cards.join('');
  $('#sCount').textContent = sources.enabled().filter(id => !sources.get(id).builtin).length || '';
  renderSrcSelect();
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
    sources.remove(id); renderSources(); toast('已删除音源');
  }
});
$('#sourceList').addEventListener('change', e => {
  const cb = e.target.closest('[data-sa="toggle"]'); if (!cb) return;
  sources.setEnabled(cb.closest('.src').dataset.id, cb.checked);
  renderSources();
});
function importLocal(files) {
  const n = localSource.import(files);
  if (!n) return toast('没有找到可以播放的音频文件');
  sources.setEnabled('local', true);
  renderSources();
  toast(`已导入 ${n} 首本地歌曲`);
  switchView('search');
  S.searchSel = 'local'; renderSrcSelect(); $('#kw').value = ''; doSearch();
}
$('#localPick').addEventListener('change', e => { importLocal(e.target.files); e.target.value = ''; });
$('#localDir').addEventListener('change', e => { importLocal(e.target.files); e.target.value = ''; });
document.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
document.addEventListener('drop', e => { if (e.dataTransfer.files.length) { e.preventDefault(); importLocal(e.dataTransfer.files); } });

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
function sourceDialog(editId) {
  const entry = editId && sources.entries.find(e => e.id === editId);
  openDialog({
    title: entry ? '编辑音源：' + sources.name(editId) : '添加音源',
    body: `<div class="row"><input class="input grow" id="importUrl" type="url" placeholder="音源网址：MusicFree 插件 / 订阅、洛雪源 .js、JSON 配置"><button class="btn primary" id="importUrlBtn">从网址导入</button></div>
      <div class="row small"><span class="muted">或者</span><button class="btn" id="importFileBtn">选择本地文件</button><span class="muted">，或粘贴到下面。模板：</span>
        <button class="btn" data-tpl="http">HTTP API</button><button class="btn" data-tpl="subsonic">Navidrome</button><button class="btn" data-tpl="script">JS 脚本</button></div>
      <input type="file" id="importFile" accept=".js,.json,.txt" hidden>
      <textarea class="input code-area" id="code" spellcheck="false" aria-label="音源内容" placeholder="粘贴 MusicFree 插件、洛雪自定义源、JSON 配置或脚本">${esc(entry ? entry.code : '')}</textarea>
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
    row('失败自动换源', '取不到播放地址时，去其他音源搜同名同歌手的歌', sw('failover')),
    row('出错时跳到下一首', '连续失败超过 5 首会停下', sw('skipOnError')),
    row('外观', '深色、浅色或跟随系统', seg('theme', [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']])),
    row('动态背景', '封面取色的流动背景和律动条', sw('motion')),
    isDesktopApp() ? row('桌面歌词', '置顶显示的透明歌词窗口，可拖动', sw('dlyric')) : '',
    isDesktopApp() ? row('锁定桌面歌词', '锁定后鼠标可以穿透歌词窗口', sw('dlyricLock')) : '',
    isDesktopApp() ? row('桌面歌词字号', `${st.dlyricSize}px`, `<input type="range" id="dlSize" min="20" max="64" value="${st.dlyricSize}" style="width:140px;--p:${(st.dlyricSize - 20) / 44 * 100}%">`) : '',
    row('备份', '导出或导入音源、歌单和设置', `<div class="row"><button class="btn" id="bkExport">导出</button><button class="btn" id="bkImport">导入</button><input type="file" id="bkFile" accept=".json" hidden></div>`),
    row('关于', `空壳播放器 v${VERSION} · ${isTauri ? (isMobile() ? '安卓版' : '桌面版') + '（' + platformName() + '）' : '网页版'}`, '<a class="btn" href="https://github.com/Makima667/shell-player" target="_blank" rel="noopener">源代码</a>')
  ].join('');
  $$('#settings [data-seg] button').forEach(b => b.onclick = () => { const k = b.closest('[data-seg]').dataset.seg; st[k] = b.dataset.v; saveSettings(); applySettings(); renderSettings(); });
  $$('#settings [data-sw]').forEach(i => i.onchange = () => { st[i.dataset.sw] = i.checked; saveSettings(); applySettings(); });
  $('#dlSize')?.addEventListener('input', e => { st.dlyricSize = +e.target.value; e.target.style.setProperty('--p', (st.dlyricSize - 20) / 44 * 100 + '%'); e.target.closest('.set-row').querySelector('span').textContent = st.dlyricSize + 'px'; saveSettings(); desktopLyrics.send({ size: st.dlyricSize }); });
  $('#bkExport').onclick = exportBackup;
  $('#bkImport').onclick = () => $('#bkFile').click();
  $('#bkFile').onchange = importBackup;
}
function applySettings() {
  const st = S.settings;
  if (st.theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = st.theme;
  document.body.classList.toggle('calm', !st.motion);
  $('#viz').hidden = !st.motion;
  if (isDesktopApp()) {
    desktopLyrics.show(st.dlyric);
    desktopLyrics.lock(st.dlyricLock);
    $('[data-now="dlyric"]').classList.toggle('on', st.dlyric);
    pushDesktopLyric(true);
  }
}
async function exportBackup() {
  const data = { app: 'shell-player', version: VERSION, at: new Date().toISOString(), sources: sources.entries, disabled: [...sources.disabled], sourceVars: sources.vars, playlists: S.playlists, settings: S.settings };
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
    toast('已导入，正在重新加载…');
    setTimeout(() => location.reload(), 800);
  } catch (err) { toast('导入失败：' + err.message, 4000); }
}

/* ================= 导航 ================= */
function switchView(view, plId) {
  S.view = view;
  if (plId) S.plId = plId;
  $$('.nav button[data-view]').forEach(b => b.setAttribute('aria-current', String(b.dataset.view === view && (view !== 'pl' || b.dataset.pl === S.plId))));
  $$('.view').forEach(v => { v.hidden = v.dataset.view !== view; });
  if (view === 'pl') renderPlaylist();
  if (view === 'downloads') renderDownloads();
  if (view === 'settings') renderSettings();
  if (view === 'sources') renderSources();
  $('#main').scrollTop = 0;
}
$('.nav').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) switchView(b.dataset.view, b.dataset.pl); });

/* ================= 正在播放 ================= */
function renderNow() {
  const t = curTrack();
  $('#barTrack').innerHTML = coverHTML(t) + (t
    ? `<div class="t-main" key="${esc(keyOf(t))}"><div class="t-title">${esc(t.title)}</div><div class="t-sub">${esc(t.artist)}</div></div>`
    : `<div class="t-main"><div class="t-title muted">未在播放</div><div class="t-sub">挑一首歌开始吧</div></div>`);
  $('#discCover').outerHTML = coverHTML(t, 'disc-cover').replace('<div class="disc-cover"', '<div class="disc-cover" id="discCover"');
  $('#fullTitle').textContent = t ? t.title : '未在播放';
  $('#fullArtist').textContent = t ? [t.artist, t.album].filter(Boolean).join(' · ') : '';
  $('#fullVia').textContent = t ? '音源：' + sources.name(t.sourceId) : '';
  $('#tDur').textContent = fmt(t?.duration);
  document.title = t ? `${t.title} - ${t.artist} · 空壳播放器` : '空壳播放器';
  refreshHearts();
  applyColors(t);
}
function setLoading(on) { $('#playBtn').classList.toggle('loading', on); }
function renderPlayBtn() {
  const p = !audio.paused;
  $('#playBtn').classList.toggle('is-playing', p);
  $('#playBtn').setAttribute('aria-label', p ? '暂停' : '播放');
  document.body.classList.toggle('playing', p);
  viz.playing = p;
}
function renderMode() { const b = $('#modeBtn'); b.innerHTML = IC[S.mode]; b.title = MODES[S.mode]; b.setAttribute('aria-label', '播放模式：' + MODES[S.mode]); b.classList.toggle('on', S.mode !== 'loop'); }

/* ---------- 歌词 ---------- */
function renderLyrics(msg) {
  S.lyricIdx = -1;
  const box = $('#lyrics');
  if (!S.lyric.length) { box.innerHTML = `<div class="empty">${esc(msg || '暂无歌词')}</div>`; return; }
  box.innerHTML = S.lyric.map((l, i) => `<p data-li="${i}">${esc(l.txt) || '♪'}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}</p>`).join('');
  box.scrollTop = 0;
}
function syncLyric(t) {
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
    sub: l?.sub || '', next: n ? n.txt : '', progress: l ? lyricProgress : 0,
    playing: !audio.paused, size: S.settings.dlyricSize, locked: S.settings.dlyricLock
  });
}

/* ---------- 播放核心 ---------- */
function stopPlayback() {
  audio.pause(); audio.removeAttribute('src'); audio.load();
  S.lyric = []; renderLyrics(); renderPlayBtn();
  nativeMedia.stop();
}
async function playIndex(i) {
  if (i < 0 || i >= S.queue.length) return;
  S.cur = i; saveQueue();
  const t = S.queue[i], token = ++S.token;
  S.playedVia = null;
  renderNow(); markPlaying(); setLoading(true);
  S.lyric = []; renderLyrics('正在获取歌词…');
  audio.pause();
  let r;
  try {
    r = await sources.resolveUrl(t, S.settings.quality, { failover: S.settings.failover });
    if (token !== S.token) return;
    S.playedVia = r;
    if (r.switched) toast(`原音源取不到，已换到「${sources.name(r.via)}」`);
    $('#fullVia').textContent = '音源：' + sources.name(r.via) + (r.quality ? ' · ' + r.quality : '');
    audio.src = r.url;
    await audio.play().catch(e => { if (e.name !== 'AbortError') throw e; });
    S.failStreak = 0; S.failed.delete(keyOf(t));
  } catch (e) {
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
  try {
    const L = await sources.resolveLyric(t, r);
    if (token !== S.token) return;
    S.lyric = mergeTranslation(parseLrc(L.lrc), L.trans);
    renderLyrics(); syncLyric(audio.currentTime);
  } catch { if (token === S.token) { S.lyric = []; renderLyrics('歌词获取失败'); } }
}
function nextIndex(dir, auto) {
  const n = S.queue.length;
  if (!n) return -1;
  if (auto && S.mode === 'one' && !S.failed.has(keyOf(curTrack()))) return S.cur;
  if (S.mode === 'shuffle' && n > 1) { let j; do j = Math.floor(Math.random() * n); while (j === S.cur); return j; }
  return ((S.cur < 0 ? 0 : S.cur + dir) + n) % n;
}
function togglePlay() {
  if (!curTrack()) { if (S.queue.length) playIndex(0); else toast('播放列表是空的，先去搜索吧'); return; }
  if (!audio.getAttribute('src')) { playIndex(S.cur); return; }
  audio.paused ? audio.play().catch(e => toast('播放失败：' + e.message)) : audio.pause();
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
  nativeMedia.update({ title: t.title, artist: t.artist, album: t.album || '', playing: !audio.paused, position: audio.currentTime || 0, duration: isFinite(audio.duration) ? audio.duration : (t.duration || 0) });
}
const mediaActions = {
  play: () => { if (audio.paused) togglePlay(); },
  pause: () => { if (!audio.paused) audio.pause(); },
  toggle: togglePlay,
  next: () => playIndex(nextIndex(1)),
  prev: () => playIndex(nextIndex(-1)),
  seek: p => { if (isFinite(p) && audio.src) audio.currentTime = p; }
};
if ('mediaSession' in navigator) {
  const h = { play: mediaActions.play, pause: mediaActions.pause, previoustrack: mediaActions.prev, nexttrack: mediaActions.next, seekto: d => mediaActions.seek(d.seekTime) };
  for (const [k, f] of Object.entries(h)) { try { navigator.mediaSession.setActionHandler(k, f); } catch { /* 不支持 */ } }
}

/* ---------- 进度、音量、按键 ---------- */
const seek = $('#seek'), vol = $('#vol');
let seeking = false, raf = 0;
const setP = (el, p) => el.style.setProperty('--p', (p * 100).toFixed(2) + '%');
function tick() {
  raf = requestAnimationFrame(tick);
  const d = audio.duration, c = audio.currentTime;
  if (!seeking && isFinite(d) && d > 0) { seek.value = Math.round(c / d * 1000); setP(seek, c / d); }
  $('#tCur').textContent = fmt(c) === '--:--' ? '0:00' : fmt(c);
  syncLyric(c);
  pushDesktopLyric(false);
}
audio.addEventListener('play', () => { renderPlayBtn(); setLoading(false); cancelAnimationFrame(raf); tick(); pushNativeMedia(); pushDesktopLyric(true); });
audio.addEventListener('pause', () => { renderPlayBtn(); cancelAnimationFrame(raf); pushNativeMedia(); pushDesktopLyric(true); });
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
  try { navigator.mediaSession?.setPositionState?.({ duration: audio.duration, position: audio.currentTime, playbackRate: 1 }); } catch { /* 忽略 */ }
  pushNativeMedia();
});
audio.addEventListener('seeked', pushNativeMedia);
audio.addEventListener('ended', () => { const j = nextIndex(1, true); if (j === S.cur) { audio.currentTime = 0; audio.play(); } else playIndex(j); });
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src')) return;
  setLoading(false);
  const t = curTrack();
  if (t) { S.failed.add(keyOf(t)); markPlaying(); }
  toast('音频加载失败：地址无效、已过期，或格式不受支持', 4000);
  renderPlayBtn();
});
seek.addEventListener('input', () => { seeking = true; setP(seek, seek.value / 1000); if (isFinite(audio.duration)) $('#tCur').textContent = fmt(seek.value / 1000 * audio.duration); });
seek.addEventListener('change', () => { if (isFinite(audio.duration)) audio.currentTime = seek.value / 1000 * audio.duration; seeking = false; });
audio.volume = store.get('volume', 0.8);
vol.value = Math.round(audio.volume * 100); setP(vol, audio.volume);
vol.addEventListener('input', () => { audio.volume = vol.value / 100; audio.muted = false; setP(vol, audio.volume); store.set('volume', audio.volume); $('#muteBtn').classList.remove('on'); });
$('#muteBtn').addEventListener('click', () => { audio.muted = !audio.muted; $('#muteBtn').classList.toggle('on', audio.muted); setP(vol, audio.muted ? 0 : audio.volume); });
$('#playBtn').addEventListener('click', togglePlay);
$('#prevBtn').addEventListener('click', () => { if (audio.currentTime > 4) audio.currentTime = 0; else playIndex(nextIndex(-1)); });
$('#nextBtn').addEventListener('click', () => playIndex(nextIndex(1)));
$('#modeBtn').addEventListener('click', () => { const ks = Object.keys(MODES); S.mode = ks[(ks.indexOf(S.mode) + 1) % ks.length]; store.set('mode', S.mode); renderMode(); toast(MODES[S.mode]); });
$('#barLike').addEventListener('click', e => { const t = curTrack(); if (t) toggleLike(t, e.currentTarget); });
$('#barTrack').addEventListener('click', () => openFull());
$('#lyricBtn').addEventListener('click', () => $('#full').hidden ? openFull('lyric') : closeFull());

/* ---------- 全屏播放页 ---------- */
const viz = new Visualizer($('#viz'));
function openFull(tab) {
  const f = $('#full');
  f.classList.remove('closing');
  f.hidden = false;
  if (tab) setFullTab(tab);
  if (S.settings.motion) viz.start();
  $('#lyricBtn').classList.add('on');
  requestAnimationFrame(() => { S.lyricIdx = -2; syncLyric(audio.currentTime); });
}
function closeFull() {
  const f = $('#full');
  if (f.hidden) return;
  $('#lyricBtn').classList.remove('on');
  if (!S.settings.motion || matchMedia('(prefers-reduced-motion: reduce)').matches) { f.hidden = true; viz.stop(); return; }
  f.classList.add('closing');
  f.addEventListener('animationend', () => { f.hidden = true; f.classList.remove('closing'); viz.stop(); }, { once: true });
}
function setFullTab(tab) {
  $('.full-body').dataset.ft = tab;
  $$('.full-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.ft === tab)));
  if (tab === 'lyric') requestAnimationFrame(() => { S.lyricIdx = -2; syncLyric(audio.currentTime); });
}
$('#fullClose').addEventListener('click', closeFull);
$$('.full-tabs button').forEach(b => b.addEventListener('click', () => setFullTab(b.dataset.ft)));
$('#disc').addEventListener('click', () => { if (matchMedia('(max-width: 860px)').matches) setFullTab('lyric'); });
$('.full-acts').addEventListener('click', e => {
  const b = e.target.closest('[data-now]'), t = curTrack();
  if (!b) return;
  if (b.dataset.now === 'dlyric') { S.settings.dlyric = !S.settings.dlyric; saveSettings(); applySettings(); toast(S.settings.dlyric ? '已打开桌面歌词' : '已关闭桌面歌词'); return; }
  if (!t) return;
  if (b.dataset.now === 'like') toggleLike(t, b);
  else if (b.dataset.now === 'addto') openMenu(b, playlistItems([t]));
  else if (b.dataset.now === 'download') download(t);
});
// 手机上下滑收起
let touchY = null;
$('#full').addEventListener('touchstart', e => { touchY = e.target.closest('.lyrics') ? null : e.touches[0].clientY; }, { passive: true });
$('#full').addEventListener('touchend', e => { if (touchY != null && e.changedTouches[0].clientY - touchY > 90) closeFull(); touchY = null; });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#menu').hidden) return closeMenu(); if (!$('#modal').hidden) return closeDialog(); if (!$('#full').hidden) return closeFull(); }
  if (e.target.closest('input, textarea, select, [contenteditable]') || !$('#modal').hidden) return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') playIndex(nextIndex(1));
  else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') playIndex(nextIndex(-1));
  else if (e.key === 'ArrowRight' && audio.src) audio.currentTime += 5;
  else if (e.key === 'ArrowLeft' && audio.src) audio.currentTime -= 5;
});

/* ================= 启动 ================= */
async function boot() {
  await initPlatform();
  const builtins = [['demo', demoSource], ['local', localSource]];
  if (isTauri) builtins.push(['downloaded', downloadedSource]);
  sources = new SourceManager({
    store, builtins, env: isMobile() ? 'mobile' : 'desktop',
    onUpdateAlert: (id, d) => toast(`「${sources.name(id)}」有新版本${d.log ? '：\n' + String(d.log).slice(0, 120) : ''}`, 6000)
  });
  await sources.loadAll();

  if (!Array.isArray(S.queue)) {
    const { list } = await demoSource.search('');
    S.queue = list.map(t => sources.normTrack(t, 'demo'));
    S.cur = 0; saveQueue();
  }
  // 示例歌曲的封面是现场画的，不保存
  S.queue.forEach(t => { if (t.sourceId === 'demo') { const s = DEMO_SONGS.find(x => x.id === t.id); if (s && !t.cover) demoSource.search(s.title).then(r => { t.cover = r.list[0]?.cover; if (t === curTrack()) renderNow(); markPlaying(); }); } });
  if (S.cur >= S.queue.length) S.cur = S.queue.length - 1;

  if (isDesktopApp()) {
    $('[data-now="dlyric"]').hidden = false;
    desktopLyrics.onControl(c => {
      if (c === 'toggle') togglePlay();
      else if (c === 'next') playIndex(nextIndex(1));
      else if (c === 'prev') playIndex(nextIndex(-1));
      else if (c === 'close') { S.settings.dlyric = false; saveSettings(); applySettings(); }
      else if (c === 'lock') { S.settings.dlyricLock = true; saveSettings(); applySettings(); toast('桌面歌词已锁定，可在设置里解锁'); }
      else if (c === 'ready') pushDesktopLyric(true);
    });
  }
  nativeMedia.onAction(e => { const f = mediaActions[e.action]; if (f) f(e.position); });

  $('#docBody').innerHTML = DOC_HTML();
  applySettings();
  renderSources(); renderQueue(); renderPlNav(); renderNow(); renderMode(); renderPlayBtn();
  renderLyrics(curTrack() ? '点播放后显示歌词' : '暂无歌词');
  $$('.main, .bar').forEach(el => el.classList.add('glass'));
  await doSearch();
}
boot().catch(e => { console.error(e); toast('启动出错：' + e.message, 6000); });
