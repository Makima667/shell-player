// 手势：拖动排序、左右滑动

// 按住把手拖动列表行。拖动时其他行让位，松手后回调 onDrop(from, to)
export function enableReorder(root, { handle, row, onDrop }) {
  root.addEventListener('pointerdown', e => {
    const h = e.target.closest(handle);
    if (!h || e.button > 0) return;
    const el = h.closest(row);
    if (!el) return;
    e.preventDefault();
    const rows = [...el.parentElement.querySelectorAll(row)];
    const from = rows.indexOf(el);
    const rects = rows.map(r => r.getBoundingClientRect());
    const startY = e.clientY;
    const scroller = el.closest('.main') || document.scrollingElement;
    const startScroll = scroller.scrollTop;
    let to = from, raf = 0, lastY = e.clientY;
    el.classList.add('dragging');
    document.body.classList.add('is-dragging');
    h.setPointerCapture?.(e.pointerId);

    const layout = () => {
      const dy = lastY - startY + (scroller.scrollTop - startScroll);
      el.style.transform = `translateY(${dy}px)`;
      const mid = rects[from].top + rects[from].height / 2 + dy;
      to = from;
      for (let i = 0; i < rects.length; i++) {
        const c = rects[i].top + rects[i].height / 2;
        if (i < from && mid < c) { to = i; break; }
        if (i > from && mid > c) to = i;
      }
      const shift = rects[from].height;
      rows.forEach((r, i) => {
        if (i === from) return;
        const move = (from < to && i > from && i <= to) ? -shift : (from > to && i >= to && i < from) ? shift : 0;
        r.style.transform = move ? `translateY(${move}px)` : '';
      });
      // 拖到边缘时自动滚动
      const sr = scroller.getBoundingClientRect();
      if (lastY < sr.top + 50) scroller.scrollTop -= 8;
      else if (lastY > sr.bottom - 50) scroller.scrollTop += 8;
    };
    const tick = () => { layout(); raf = requestAnimationFrame(tick); };
    tick();
    const move = ev => { lastY = ev.clientY; };
    const up = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-dragging');
      rows.forEach(r => { r.style.transform = ''; });
      el.classList.remove('dragging');
      if (to !== from) onDrop(from, to);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

// 横向滑动：跟手位移，超过阈值触发 onLeft / onRight，否则弹回
export function enableSwipe(el, { target = () => el, onLeft, onRight, threshold = 64 }) {
  let x0 = null, y0 = 0, dx = 0, locked = null, moved = false;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; locked = null; moved = false; }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (x0 == null) return;
    const t = e.touches[0];
    dx = t.clientX - x0;
    const dy = t.clientY - y0;
    if (locked == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (locked !== 'x') return;
    moved = true;
    const tg = target();
    if (tg) { tg.style.transition = 'none'; tg.style.transform = `translateX(${dx * 0.6}px)`; tg.style.opacity = String(1 - Math.min(0.6, Math.abs(dx) / 260)); }
  }, { passive: true });
  el.addEventListener('touchend', () => {
    if (x0 == null) return;
    x0 = null;
    const tg = target();
    if (tg) { tg.style.transition = ''; tg.style.transform = ''; tg.style.opacity = ''; }
    if (locked === 'x' && Math.abs(dx) > threshold) (dx < 0 ? onLeft : onRight)?.();
  });
  // 滑动过就吞掉随后的 click，避免误触打开全屏
  el.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
}
