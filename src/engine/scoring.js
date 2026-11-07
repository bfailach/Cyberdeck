import { DEFAULT_MODS } from './perks.js';

// Score for a finished breach. Perk modifiers (mods) adjust some values.
export const SCORE_RULES = {
  perSecond: 5,
  perUnusedSlot: 50,
  allDaemonsBonus: 250,
};

export function scoreBreach({ puzzle, statuses, picks, timeLeft, assistsUsed, mods = DEFAULT_MODS }) {
  const baseDaemon = statuses.reduce(
    (sum, s, i) => (s.state === 'uploaded' ? sum + puzzle.daemons[i].value : sum), 0);
  const daemonPoints = Math.round(baseDaemon * mods.daemonMult);
  const uploaded = statuses.filter((s) => s.state === 'uploaded').length;
  const all = uploaded === puzzle.daemons.length;

  // Time and efficiency only count if at least one daemon made it.
  const anySuccess = uploaded > 0;
  const secondsLeft = anySuccess ? Math.max(0, timeLeft) : 0;
  const timeBonus = Math.round(secondsLeft * SCORE_RULES.perSecond * mods.timeBonusMult);
  const unused = puzzle.bufferSize - picks.length;
  const efficiency = anySuccess ? unused * SCORE_RULES.perUnusedSlot : 0;
  const allBonus = all ? SCORE_RULES.allDaemonsBonus : 0;
  const optimal = all && picks.length <= puzzle.optimal.length;
  const optimalBonus = optimal ? mods.optimalBonus : 0;

  const subtotal = daemonPoints + timeBonus + efficiency + allBonus + optimalBonus;
  const multiplier = Math.max(0, 1 - assistsUsed * mods.assistPenalty);
  const total = Math.round(subtotal * multiplier);

  let stars = 0;
  if (uploaded > 0) stars = 1;
  if (all) stars = 2;
  if (all && optimal && assistsUsed === 0) stars = 3;

  return {
    daemonPoints, timeBonus, secondsLeft, unused, efficiency, allBonus, optimalBonus,
    subtotal, multiplier, total, stars, uploaded, all, optimal,
  };
}
