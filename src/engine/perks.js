// Netrunner progression and skill tree.
//
// XP: the sum of your BEST score on every level. Replaying a level only adds XP when you beat
// your own best, so there is nothing to farm: progress means playing harder levels better.
// Netrunner level: each level needs more XP than the last; every level-up is worth 1 perk point.
// Perks: each branch is a chain. A perk can need a Netrunner level, a tier of the perk before it,
// and (for capstones) a number of stars. The full tree costs more than a normal run earns,
// so builds are a choice. Refunding is always allowed.

/** Cumulative XP needed to reach Netrunner level n (level 1 needs 0). */
export function xpForLevel(n) {
  const k = Math.max(0, n - 1);
  return 600 * k + 10 * k * k;
}

export const MAX_NETRUNNER_LEVEL = 80;

export function xpTotal(save) {
  return Object.values(save.best || {}).reduce((s, b) => s + Math.max(0, b.score || 0), 0);
}

export function starsTotal(save) {
  return Object.values(save.best || {}).reduce((s, b) => s + (b.stars || 0), 0);
}

export function netrunnerLevel(xp) {
  let n = 1;
  while (n < MAX_NETRUNNER_LEVEL && xpForLevel(n + 1) <= xp) n++;
  return n;
}

/** { level, xp, current, next, progress } for progress bars. */
export function levelInfo(save) {
  const xp = xpTotal(save);
  const level = netrunnerLevel(xp);
  const current = xpForLevel(level);
  const next = level >= MAX_NETRUNNER_LEVEL ? current : xpForLevel(level + 1);
  return { level, xp, current, next, progress: next > current ? (xp - current) / (next - current) : 1 };
}

export const BRANCHES = [
  {
    id: 'breach',
    name: 'BREACH',
    blurb: 'Time and buffer for the breach itself.',
    perks: [
      { id: 'breach_time', name: 'Extended Uplink', minLevel: 1, tiers: [
        { cost: 2, text: '+5 s breach time.' },
        { cost: 3, text: '+10 s breach time.' },
        { cost: 4, text: '+15 s breach time.' },
      ] },
      { id: 'overclock', name: 'Overclocked Uplink', minLevel: 6, requires: { breach_time: 2 }, tiers: [
        { cost: 3, text: 'Time bonus is worth 50% more.' },
      ] },
      { id: 'buffer', name: 'Buffer Expansion', minLevel: 12, requires: { overclock: 1 }, tiers: [
        { cost: 4, text: '+1 buffer slot.' },
        { cost: 6, text: '+2 buffer slots.' },
      ] },
      { id: 'time_dilation', name: 'Time Dilation', capstone: true, minLevel: 24, minStars: 36, requires: { buffer: 1, breach_time: 3 }, tiers: [
        { cost: 7, text: 'The breach timer runs 20% slower.' },
      ] },
    ],
  },
  {
    id: 'daemons',
    name: 'DAEMONS',
    blurb: 'Bigger payouts and better reads on the matrix.',
    perks: [
      { id: 'datamine', name: 'Datamine Mastery', minLevel: 1, tiers: [
        { cost: 2, text: 'Daemon points +10%.' },
        { cost: 3, text: 'Daemon points +20%.' },
        { cost: 4, text: 'Daemon points +30%.' },
      ] },
      { id: 'scanner', name: 'Sequence Scanner', minLevel: 5, requires: { datamine: 1 }, tiers: [
        { cost: 3, text: 'Codes on the active line that advance a daemon are marked.' },
      ] },
      { id: 'perfectionist', name: 'Clean Execution', minLevel: 10, requires: { scanner: 1 }, tiers: [
        { cost: 3, text: 'Optimal path bonus doubled (150 → 300).' },
      ] },
      { id: 'overload', name: 'Daemon Overload', capstone: true, minLevel: 22, minStars: 36, requires: { perfectionist: 1, datamine: 3 }, tiers: [
        { cost: 7, text: 'All-daemons bonus doubled (250 → 500).' },
      ] },
    ],
  },
  {
    id: 'assists',
    name: 'ASSISTS',
    blurb: 'More helpers, and cheaper ones.',
    perks: [
      { id: 'hint_cache', name: 'Hint Cache', minLevel: 1, tiers: [
        { cost: 1, text: '+1 hint per breach.' },
        { cost: 2, text: '+2 hints per breach.' },
      ] },
      { id: 'undo_cache', name: 'Rollback Buffer', minLevel: 3, requires: { hint_cache: 1 }, tiers: [
        { cost: 2, text: '+1 undo per breach.' },
        { cost: 3, text: '+2 undos per breach.' },
      ] },
      { id: 'cryo', name: 'Cryo Loop', minLevel: 8, requires: { undo_cache: 1 }, tiers: [
        { cost: 2, text: '+1 freeze per breach.' },
        { cost: 3, text: '+1 freeze, and freeze lasts 8 s.' },
      ] },
      { id: 'light_touch', name: 'Light Touch', capstone: true, minLevel: 18, minStars: 24, requires: { cryo: 1, hint_cache: 2 }, tiers: [
        { cost: 5, text: 'Each assist costs 5% of the score instead of 10%.' },
      ] },
    ],
  },
];

export const ALL_PERKS = BRANCHES.flatMap((b) => b.perks.map((p) => ({ ...p, branch: b.id })));
export const perkById = (id) => ALL_PERKS.find((p) => p.id === id);
export const TREE_COST = ALL_PERKS.reduce((s, p) => s + p.tiers.reduce((t, x) => t + x.cost, 0), 0);

/** Perk points earned: one per Netrunner level after the first. */
export function pointsEarned(save) {
  return netrunnerLevel(xpTotal(save)) - 1;
}

export function pointsSpent(perks) {
  return Object.entries(perks || {}).reduce((sum, [id, tier]) => {
    const p = perkById(id);
    if (!p) return sum;
    return sum + p.tiers.slice(0, tier).reduce((s, t) => s + t.cost, 0);
  }, 0);
}

export function pointsAvailable(save) {
  return pointsEarned(save) - pointsSpent(save.perks);
}

/** Next tier cost, or null if maxed. */
export function nextCost(perks, id) {
  const p = perkById(id);
  const owned = perks?.[id] || 0;
  return owned < p.tiers.length ? p.tiers[owned].cost : null;
}

/**
 * Everything that stands between the player and the next tier of a perk.
 * Returns a list of { label, met } and a summary { ok, maxed, cost }.
 */
export function requirements(save, id) {
  const p = perkById(id);
  const perks = save.perks || {};
  const level = netrunnerLevel(xpTotal(save));
  const stars = starsTotal(save);
  const cost = nextCost(perks, id);
  const list = [];
  list.push({ label: `Netrunner level ${p.minLevel}`, met: level >= p.minLevel });
  for (const [rid, tier] of Object.entries(p.requires || {})) {
    const rp = perkById(rid);
    list.push({ label: `${rp.name}${rp.tiers.length > 1 ? ` tier ${tier}` : ''}`, met: (perks[rid] || 0) >= tier });
  }
  if (p.minStars) list.push({ label: `${p.minStars} stars`, met: stars >= p.minStars });
  const unlocked = list.every((r) => r.met);
  const affordable = cost != null && cost <= pointsAvailable(save);
  return { list, unlocked, affordable, maxed: cost == null, cost, ok: unlocked && affordable };
}

/** Owned perks are valid if every owned perk's requirements (other than points) are met. */
export function perksAreValid(save) {
  if (pointsAvailable(save) < 0) return false;
  for (const [id, tier] of Object.entries(save.perks || {})) {
    const p = perkById(id);
    if (!p || tier > p.tiers.length) return false;
    if (tier > 0 && !requirements(save, id).unlocked) return false;
  }
  return true;
}

/** Turns owned perks into numbers the breach and scoring use. */
export function computeMods(perks = {}) {
  const t = (id) => perks[id] || 0;
  return {
    extraTime: [0, 5, 10, 15][t('breach_time')],
    extraBuffer: t('buffer'),
    timeBonusMult: t('overclock') ? 1.5 : 1,
    timeScale: t('time_dilation') ? 0.8 : 1,
    daemonMult: 1 + 0.1 * t('datamine'),
    optimalBonus: t('perfectionist') ? 300 : 150,
    allDaemonsBonus: t('overload') ? 500 : 250,
    scanner: t('scanner') > 0,
    extraHint: t('hint_cache'),
    extraUndo: t('undo_cache'),
    extraFreeze: t('cryo') > 0 ? 1 : 0,
    freezeSeconds: t('cryo') >= 2 ? 8 : 5,
    assistPenalty: t('light_touch') ? 0.05 : 0.1,
  };
}

export const DEFAULT_MODS = computeMods({});
