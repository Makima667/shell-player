// 示例音源：在本地现场合成三首公版旋律（小星星、欢乐颂、两只老虎），带同步歌词，不联网
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function parseMel(str) {
  return str.trim().split(/\s+/).map(tok => {
    const [n, d] = tok.split(':');
    const m = n.match(/^([A-G])(#?)(\d)$/);
    const midi = 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] ? 1 : 0);
    return { f: 440 * Math.pow(2, (midi - 69) / 12), d: d ? +d : 1 };
  });
}

const TIGERS = [
  ['两只老虎 两只老虎', 'C4 D4 E4 C4 C4 D4 E4 C4'], ['跑得快 跑得快', 'E4 F4 G4:2 E4 F4 G4:2'],
  ['一只没有耳朵 一只没有尾巴', 'G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4'],
  ['真奇怪 真奇怪', 'C4 G3 C4:2 C4 G3 C4:2']
];

export const DEMO_SONGS = [
  { id: 'twinkle', title: '小星星', artist: '法国民谣', album: '公版旋律 · 示例', beat: 0.46, hue: 228, phrases: [
    ['一闪一闪亮晶晶', 'C4 C4 G4 G4 A4 A4 G4:2'], ['满天都是小星星', 'F4 F4 E4 E4 D4 D4 C4:2'],
    ['挂在天上放光明', 'G4 G4 F4 F4 E4 E4 D4:2'], ['好像许多小眼睛', 'G4 G4 F4 F4 E4 E4 D4:2'],
    ['一闪一闪亮晶晶', 'C4 C4 G4 G4 A4 A4 G4:2'], ['满天都是小星星', 'F4 F4 E4 E4 D4 D4 C4:2']] },
  { id: 'ode', title: '欢乐颂', artist: '贝多芬 / 席勒', album: '公版旋律 · 示例', beat: 0.42, hue: 18, phrases: [
    ['Freude, schöner Götterfunken, Tochter aus Elysium,', 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2'],
    ['Wir betreten feuertrunken, Himmlische, dein Heiligtum!', 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2'],
    ['Deine Zauber binden wieder, was die Mode streng geteilt;', 'D4 D4 E4 C4 D4 E4:0.5 F4:0.5 E4 C4 D4 E4:0.5 F4:0.5 E4 D4 C4 D4 G3:2'],
    ['Alle Menschen werden Brüder, wo dein sanfter Flügel weilt.', 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2']] },
  { id: 'tigers', title: '两只老虎', artist: '传统儿歌', album: '公版旋律 · 示例', beat: 0.4, hue: 140, phrases: [...TIGERS, ...TIGERS] }
];

function plan(song) {
  const lead = 0.6;
  let t = lead;
  const notes = [], lrc = [];
  for (const [line, mel] of song.phrases) {
    lrc.push([t, line]);
    for (const n of parseMel(mel)) { notes.push({ f: n.f, t, dur: n.d * song.beat }); t += n.d * song.beat; }
  }
  return { notes, lrc, total: t + 1.4 };
}

// 用 canvas 画一张简单的封面，给"封面取色"和动画用
function drawCover(song) {
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = c.height = 300;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 300, 300);
  grad.addColorStop(0, `hsl(${song.hue} 42% 62%)`);
  grad.addColorStop(1, `hsl(${(song.hue + 50) % 360} 36% 38%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 300, 300);
  g.globalAlpha = 0.18;
  g.fillStyle = '#fff';
  for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(150, 150, 22 + i * 16, 0, Math.PI * 2); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke(); }
  g.globalAlpha = 0.85;
  g.setTransform(4, 0, 0, 4, 102, 96);
  g.fill(new Path2D('M10 3h9v4h-6v10.5A3.5 3.5 0 1 1 10 14.3z'));
  return c.toDataURL('image/jpeg', 0.85);
}

const cache = new Map();
function render(id) {
  if (cache.has(id)) return cache.get(id);
  const song = DEMO_SONGS.find(s => s.id === id);
  if (!song) throw new Error('示例里没有这首歌');
  const { notes, lrc, total } = plan(song);
  const sr = 22050, N = Math.ceil(total * sr), buf = new Float32Array(N);
  for (const n of notes) {
    const start = Math.floor(n.t * sr), len = Math.floor((n.dur + 0.7) * sr), decay = 2.6 / Math.max(0.35, n.dur);
    for (let i = 0; i < len && start + i < N; i++) {
      const x = i / sr, w = 2 * Math.PI * n.f * x;
      const env = Math.min(1, x / 0.006) * Math.exp(-x * decay);
      buf[start + i] += env * (Math.sin(w) + 0.32 * Math.sin(2 * w) + 0.1 * Math.sin(3 * w) + 0.04 * Math.sin(5 * w)) * 0.3
        + env * Math.sin(w / 2) * 0.08;
    }
  }
  const dv = new DataView(new ArrayBuffer(44 + N * 2));
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + N * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, N * 2, true);
  for (let i = 0; i < N; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, buf[i])) * 0x7fff, true);
  const ts = s => { const m = Math.floor(s / 60); return `[${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(2).padStart(5, '0')}]`; };
  const out = {
    url: URL.createObjectURL(new Blob([dv.buffer], { type: 'audio/wav' })),
    lrc: `[ti:${song.title}]\n[ar:${song.artist}]\n` + lrc.map(([t, l]) => ts(t) + l).join('\n') + `\n${ts(total - 1)}`
  };
  cache.set(id, out);
  return out;
}

const covers = new Map();
const coverOf = s => { if (!covers.has(s.id)) covers.set(s.id, drawCover(s)); return covers.get(s.id); };

export const demoSource = {
  kind: 'builtin',
  name: '示例音源',
  version: '1.0.0',
  description: '在本地现场合成的三首公版旋律（小星星、欢乐颂、两只老虎），带同步歌词。用来体验播放器，不联网。',
  canSearch: true,
  canUrl: true,
  async search(keyword) {
    const k = keyword.trim().toLowerCase();
    const list = DEMO_SONGS.filter(s => !k || (s.title + s.artist + s.album).toLowerCase().includes(k))
      .map(s => ({ id: s.id, title: s.title, artist: s.artist, album: s.album, duration: plan(s).total, cover: coverOf(s) }));
    return { list, hasMore: false };
  },
  async getUrl(track) { return { url: render(track.id).url }; },
  async getLyric(track) { return { lrc: render(track.id).lrc }; }
};
