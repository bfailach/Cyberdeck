// Local save: progress, perks and settings.
const KEY = 'cyberdeck.save.v1';

export const DEFAULT_SETTINGS = {
  music: 6, // 0-10
  sfx: 8, // 0-10
  timerMode: 'immediate', // 'immediate' | 'firstPick'
  musicSource: 'original', // 'original' | 'custom'
};

const blank = () => ({ unlocked: 1, best: {}, perks: {}, settings: { ...DEFAULT_SETTINGS } });

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const data = JSON.parse(raw);
    return { ...blank(), ...data, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) }, perks: data.perks || {} };
  } catch {
    return blank();
  }
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage unavailable */ }
}

export function resetProgress(save) {
  const settings = save.settings;
  Object.assign(save, blank(), { settings });
  writeSave(save);
}

/** Records a result; returns { isBest, unlockedNew, newStars }. */
export function recordResult(save, level, result) {
  const prev = save.best[level];
  const prevStars = prev?.stars ?? 0;
  const isBest = !prev || result.total > prev.score;
  if (isBest) save.best[level] = { score: result.total, stars: Math.max(result.stars, prevStars) };
  else if (result.stars > prev.stars) prev.stars = result.stars;
  const newStars = Math.max(0, result.stars - prevStars);
  let unlockedNew = false;
  if (result.all && save.unlocked <= level) {
    save.unlocked = level + 1;
    unlockedNew = true;
  }
  writeSave(save);
  return { isBest, unlockedNew, newStars };
}
