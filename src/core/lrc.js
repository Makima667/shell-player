// LRC 歌词解析：支持多时间戳、[offset:]、翻译歌词合并、纯文本歌词

export function parseLrc(text) {
  const out = [];
  let offset = 0;
  for (const line of String(text || '').split(/\r?\n/)) {
    const off = line.match(/^\[offset:\s*(-?\d+)\]/i);
    if (off) { offset = +off[1] / 1000; continue; }
    const tags = [...line.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (!tags.length) continue;
    const txt = line.replace(/\[[^\]]*\]/g, '').replace(/<\d+,\d+(,\d+)?>/g, '').trim();
    for (const m of tags) { const t = +m[1] * 60 + parseFloat(m[2].replace(':', '.')); out.push({ t, t0: t, txt }); }
  }
  out.sort((a, b) => a.t - b.t);
  out.forEach(l => { l.t = Math.max(0, l.t - offset); });
  if (!out.length && String(text || '').trim()) {
    return String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(txt => ({ t: -1, txt }));
  }
  return out;
}

// 把翻译歌词按时间挂到原文对应行上
export function mergeTranslation(lines, transText) {
  if (!transText) return lines;
  const tr = parseLrc(transText).filter(l => l.t >= 0 && l.txt);
  if (!tr.length) return lines;
  // 按未加 offset 的原始时间对齐，两份歌词各自的 offset 不影响匹配
  const map = new Map(tr.map(l => [l.t0.toFixed(1), l.txt]));
  return lines.map(l => {
    const sub = l.t0 != null && map.get(l.t0.toFixed(1));
    return sub && sub !== l.txt ? { ...l, sub } : l;
  });
}

// 二分查找当前行
export function lineAt(lines, t) {
  if (!lines.length || lines[0].t < 0) return -1;
  let lo = 0, hi = lines.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= t + 0.15) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return idx;
}
