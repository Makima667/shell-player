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
