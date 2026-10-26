// 交互动效：按钮涟漪、爱心粒子、封面飞入、唱片缓停缓起、导航滑块
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('calm');

// 按下按钮时从手指位置扩散的涟漪
export function enableRipple(selector) {
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest(selector);
    if (!b || b.disabled || reduced()) return;
    const r = b.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const wrap = document.createElement('span');
    wrap.className = 'rip';
    const dot = document.createElement('i');
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    wrap.append(dot);
    b.append(wrap);
    setTimeout(() => wrap.remove(), 650);
  });
}

// 点喜欢时迸出的小爱心
export function burst(el, color = '#ff4d6d') {
  if (!el || reduced()) return;
  const r = el.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'burst';
  box.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;color:${color}`;
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const d = 22 + Math.random() * 18;
    const p = document.createElement('i');
    p.style.setProperty('--dx', Math.cos(a) * d + 'px');
    p.style.setProperty('--dy', Math.sin(a) * d + 'px');
    p.style.setProperty('--s', (0.5 + Math.random() * 0.6).toFixed(2));
    p.style.animationDelay = Math.random() * 60 + 'ms';
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 900);
}

// 封面从 from 元素飞到 to 元素（FLIP）。飞行期间隐藏目标，落地后显示
export function flyCover(from, to, { duration = 560, toRadius = '50%' } = {}) {
  if (!from || !to || reduced()) return Promise.resolve();
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  if (!a.width || !b.width) return Promise.resolve();
  const ghost = from.cloneNode(true);
  ghost.removeAttribute('id');
  ghost.classList.add('fly');
  const fromRadius = getComputedStyle(from).borderRadius;
  Object.assign(ghost.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', borderRadius: fromRadius });
  document.body.append(ghost);
  to.style.visibility = 'hidden';
  const anim = ghost.animate([
    { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', borderRadius: fromRadius, fontSize: getComputedStyle(from).fontSize },
    { left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px', borderRadius: toRadius, fontSize: getComputedStyle(to).fontSize }
  ], { duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
  return anim.finished.catch(() => {}).then(() => { to.style.visibility = ''; ghost.remove(); });
}

// 唱片转动：暂停时慢慢停下，播放时慢慢转起来，而不是瞬间停住
export class Spinner {
  constructor(el, period = 24000) {
    this.el = el;
    this.rate = 0;
    this.target = 0;
    this.anim = el.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: period, iterations: Infinity });
    this.anim.playbackRate = 0;
    this.raf = 0;
  }
  set(on) {
    this.target = on ? 1 : 0;
    if (reduced()) { this.rate = this.target = 0; this.anim.playbackRate = 0; return; }
    if (!this.raf) this.step();
  }
  step() {
    this.raf = requestAnimationFrame(() => {
      // 起转快一点，停转像唱机一样拖一下
      const k = this.target > this.rate ? 0.06 : 0.035;
      this.rate += (this.target - this.rate) * k;
      if (Math.abs(this.target - this.rate) < 0.004) this.rate = this.target;
      this.anim.playbackRate = this.rate;
      if (this.rate !== this.target) this.step(); else this.raf = 0;
    });
  }
}

// 导航里滑动的高亮块
export function moveIndicator(ind, btn, container) {
  if (!ind || !container) return;
  if (!btn || !btn.offsetParent) { ind.style.opacity = '0'; return; }
  const c = container.getBoundingClientRect(), r = btn.getBoundingClientRect();
  const visible = r.bottom > c.top && r.top < c.bottom && r.height > 0;
  ind.style.opacity = visible ? '1' : '0';
  ind.style.transform = `translate(${r.left - c.left}px, ${r.top - c.top}px)`;
  ind.style.width = r.width + 'px';
  ind.style.height = r.height + 'px';
}

// 音量渐变（暂停/继续、定时关闭用）。用定时器而不是 rAF，窗口在后台时也能走完
let fadeTimer = 0;
export function fadeVolume(audio, to, ms) {
  clearInterval(fadeTimer);
  return new Promise(resolve => {
    const from = audio.volume, t0 = performance.now();
    if (ms <= 0) { audio.volume = to; return resolve(); }
    fadeTimer = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * p));
      if (p >= 1) { clearInterval(fadeTimer); resolve(); }
    }, 25);
  });
}
