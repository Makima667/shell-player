// 动态效果：封面取色、频谱动画
import { hue } from '../core/util.js';

// 从封面取两三个主色（色相 + 饱和度），失败时按歌名生成
export async function extractColors(track) {
  const fallback = () => { const h = hue((track && (track.album || track.title)) || '空'); return [h, (h + 40) % 360, (h + 200) % 360]; };
  if (!track || !track.cover) return fallback();
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      if (!/^(data|blob):/.test(track.cover)) i.crossOrigin = 'anonymous';
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = track.cover;
      setTimeout(rej, 5000);
    });
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 24, 24);
    const d = g.getImageData(0, 0, 24, 24).data;
    const buckets = new Array(12).fill(0).map(() => ({ n: 0, h: 0 }));
    for (let i = 0; i < d.length; i += 4) {
      const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      if (s < 0.18 || l < 0.12 || l > 0.9) continue;
      const b = buckets[Math.floor(h / 30) % 12];
      b.n += s; b.h += h * s;
    }
    const top = buckets.map(b => ({ n: b.n, h: b.n ? b.h / b.n : 0 })).sort((a, b) => b.n - a.n).filter(b => b.n > 0);
    if (!top.length) return fallback();
    const h1 = Math.round(top[0].h);
    const h2 = Math.round((top[1] || { h: (h1 + 40) % 360 }).h);
    const h3 = Math.round((top[2] || { h: (h1 + 180) % 360 }).h);
    return [h1, h2, h3];
  } catch { return fallback(); }
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

// 频谱动画：远程音频大多不允许跨域分析，这里用平滑噪声模拟律动，随播放/暂停起伏
export class Visualizer {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.level = 0;
    this.playing = false;
    this.bars = 48;
    this.seed = Array.from({ length: this.bars }, () => Math.random() * 1000);
    this.vals = new Float32Array(this.bars);
    this.raf = 0;
    this.color = 'rgba(255,255,255,.7)';
    this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  start() { if (!this.raf && !this.reduce) this.loop(performance.now()); }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  loop(now) {
    this.raf = requestAnimationFrame(t => this.loop(t));
    const { c, g } = this;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    this.level += ((this.playing ? 1 : 0) - this.level) * 0.05;
    const t = now / 1000, beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.05)), 6);
    const bw = w / this.bars;
    g.fillStyle = this.color;
    for (let i = 0; i < this.bars; i++) {
      const s = this.seed[i];
      const n = (Math.sin(t * (1.3 + (i % 7) * 0.21) + s) + Math.sin(t * (2.7 + (i % 5) * 0.33) + s * 1.7) + 2) / 4;
      const shape = Math.sin((i / this.bars) * Math.PI) * 0.65 + 0.35;
      const target = this.level * (n * shape * 0.85 + beat * 0.25 * shape) + 0.03;
      this.vals[i] += (target - this.vals[i]) * 0.25;
      const bh = Math.max(2, this.vals[i] * h);
      const x = i * bw + bw * 0.2, rw = bw * 0.6;
      g.beginPath();
      g.roundRect ? g.roundRect(x, h - bh, rw, bh, rw / 2) : g.rect(x, h - bh, rw, bh);
      g.fill();
    }
  }
}
