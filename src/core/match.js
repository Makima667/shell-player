// 换源匹配：在别的音源的搜索结果里找"同一首歌"

const BRACKETS = /[（(【\[].*?[）)】\]]/g;
const PUNCT = /[\s·・\-_'"‘’“”,，.。!！?？&、/\\|:：;；~～]+/g;

export const norm = s => String(s || '').toLowerCase().replace(BRACKETS, '').replace(PUNCT, '');

const artists = s => String(s || '').toLowerCase().split(/\s*(?:\/|、|,|，|&|;|；|\bfeat\.?|\bft\.?|和)\s*/).map(norm).filter(Boolean);

export function matchScore(want, got) {
  const a = norm(want.title), b = norm(got.title);
  if (!a || !b) return 0;
  let score = 0;
  if (a === b) score += 3;
  else if (a.includes(b) || b.includes(a)) score += 2;
  else return 0;
  const wa = artists(want.artist), ga = artists(got.artist);
  if (wa.length && ga.length) {
    if (wa.some(x => ga.some(y => x === y || x.includes(y) || y.includes(x)))) score += 2;
    else score -= 2;
  }
  if (want.duration > 0 && got.duration > 0) {
    const d = Math.abs(want.duration - got.duration);
    if (d <= 3) score += 1;
    else if (d > 20) score -= 2;
  }
  return score;
}

export function pickMatches(want, list, min = 4) {
  return list.map(t => ({ t, s: matchScore(want, t) }))
    .filter(x => x.s >= min)
    .sort((x, y) => y.s - x.s)
    .map(x => x.t);
}

// ---- 搜索结果合并：不同音源搜到的同一首歌只显示一行 ----
// 比 norm 更严格：括号里的 Live / 伴奏 / DJ 版等信息要保留，不能把现场版并进原版
const normStrict = s => String(s || '').toLowerCase().replace(/[（【[]/g, '(').replace(/[）】\]]/g, ')').replace(PUNCT, '');
export const songKey = t => normStrict(t.title) + '|' + (artists(t.artist)[0] || '');
export function sameSong(a, b) {
  if (songKey(a) !== songKey(b)) return false;
  // 时长都知道且差很多，多半是不同版本
  return !(a.duration > 0 && b.duration > 0 && Math.abs(a.duration - b.duration) > 5);
}

/**
 * 把一批新结果并进 results（原地修改）。同一首歌第一次出现的那条留在列表里，
 * 其他音源的同一首挂在它的 alts 上，播放失败时先换这些来源。
 * 同一个音源自己的多条结果不合并（可能是不同专辑、不同版本）。
 * @param {Map<string, number[]>} index 跨批次复用，记录 songKey → 行号
 * @returns {{ added: object[], touched: number[] }} 新增的行，以及多了来源的行号
 */
export function mergeInto(results, incoming, index, maxAlts = 5) {
  const added = [], touched = new Set();
  for (const t of incoming) {
    const k = songKey(t);
    const rows = index.get(k) || [];
    const i = rows.find(i => {
      const h = results[i];
      return h.sourceId !== t.sourceId && !(h.alts || []).some(a => a.sourceId === t.sourceId) && sameSong(h, t);
    });
    if (i !== undefined) {
      const h = results[i];
      h.alts = h.alts || [];
      if (h.alts.length < maxAlts) { h.alts.push(t); touched.add(i); }
      continue;
    }
    index.set(k, [...rows, results.length]);
    results.push(t);
    added.push(t);
  }
  return { added, touched: [...touched] };
}
