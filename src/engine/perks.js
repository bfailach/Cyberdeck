// Netrunner skill tree. Points come from stars (1 per star, best per level).
// Each perk has tiers; each tier has a cost and an effect description.

export const BRANCHES = [
  {
    id: 'breach',
    name: 'BREACH',
    blurb: 'Time and buffer for the breach itself.',
    perks: [
      { id: 'breach_time', name: 'Extended Uplink', tiers: [
        { cost: 1, text: '+5 s breach time.' },
        { cost: 2, text: '+10 s breach time.' },
        { cost: 3, text: '+15 s breach time.' },
      ] },
      { id: 'buffer', name: 'Buffer Expansion', tiers: [
        { cost: 3, text: '+1 buffer slot.' },
        { cost: 4, text: '+2 buffer slots.' },
      ] },
      { id: 'overclock', name: 'Overclocked Uplink', tiers: [
        { cost: 2, text: 'Time bonus is worth 50% more.' },
      ] },
    ],
  },
  {
    id: 'daemons',
    name: 'DAEMONS',
    blurb: 'Bigger payouts and better reads on the matrix.',
    perks: [
      { id: 'datamine', name: 'Datamine Mastery', tiers: [
        { cost: 1, text: 'Daemon points +10%.' },
        { cost: 2, text: 'Daemon points +20%.' },
        { cost: 3, text: 'Daemon points +30%.' },
      ] },
      { id: 'perfectionist', name: 'Clean Execution', tiers: [
        { cost: 2, text: 'Optimal path bonus doubled (150 → 300).' },
      ] },
      { id: 'scanner', name: 'Sequence Scanner', tiers: [
        { cost: 2, text: 'Codes on the active line that advance a daemon are marked.' },
      ] },
    ],
  },
  {
    id: 'assists',
    name: 'ASSISTS',
    blurb: 'More helpers, and cheaper ones.',
    perks: [
      { id: 'hint_cache', name: 'Hint Cache', tiers: [
        { cost: 1, text: '+1 hint per breach.' },
        { cost: 2, text: '+2 hints per breach.' },
      ] },
      { id: 'undo_cache', name: 'Rollback Buffer', tiers: [
        { cost: 1, text: '+1 undo per breach.' },
        { cost: 2, text: '+2 undos per breach.' },
      ] },
      { id: 'cryo', name: 'Cryo Loop', tiers: [
        { cost: 1, text: '+1 freeze per breach.' },
        { cost: 2, text: '+1 freeze, and freeze lasts 8 s.' },
      ] },
      { id: 'light_touch', name: 'Light Touch', tiers: [
        { cost: 3, text: 'Each assist costs 5% of the score instead of 10%.' },
      ] },
    ],
  },
];

export const ALL_PERKS = BRANCHES.flatMap((b) => b.perks.map((p) => ({ ...p, branch: b.id })));
export const perkById = (id) => ALL_PERKS.find((p) => p.id === id);

/** Points earned so far: the best star count of every level. */
export function pointsEarned(save) {
  return Object.values(save.best || {}).reduce((s, b) => s + (b.stars || 0), 0);
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

/** Turns owned perks into numbers the breach and scoring use. */
export function computeMods(perks = {}) {
  const t = (id) => perks[id] || 0;
  return {
    extraTime: [0, 5, 10, 15][t('breach_time')],
    extraBuffer: t('buffer'),
    timeBonusMult: t('overclock') ? 1.5 : 1,
    daemonMult: 1 + 0.1 * t('datamine'),
    optimalBonus: t('perfectionist') ? 300 : 150,
    scanner: t('scanner') > 0,
    extraHint: t('hint_cache'),
    extraUndo: t('undo_cache'),
    extraFreeze: t('cryo') > 0 ? 1 : 0,
    freezeSeconds: t('cryo') >= 2 ? 8 : 5,
    assistPenalty: t('light_touch') ? 0.05 : 0.1,
  };
}

export const DEFAULT_MODS = computeMods({});
