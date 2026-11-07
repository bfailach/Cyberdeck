// Local save: unlocked level and best results per level.
const KEY = 'cyberdeck.save.v1';

const blank = () => ({ unlocked: 1, best: {} });

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    return { ...blank(), ...JSON.parse(raw) };
  } catch {
    return blank();
  }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage unavailable */ }
}

/** Records a result; returns { isBest, unlockedNew }. */
export function recordResult(save, level, result) {
  const prev = save.best[level];
  const isBest = !prev || result.total > prev.score;
  if (isBest) save.best[level] = { score: result.total, stars: Math.max(result.stars, prev?.stars ?? 0) };
  else if (result.stars > prev.stars) prev.stars = result.stars;
  let unlockedNew = false;
  if (result.all && save.unlocked <= level) {
    save.unlocked = level + 1;
    unlockedNew = true;
  }
  writeSave(save);
  return { isBest, unlockedNew };
}
