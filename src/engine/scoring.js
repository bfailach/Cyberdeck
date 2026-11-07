// Score for a finished breach.
export const SCORE_RULES = {
  perSecond: 5,
  perUnusedSlot: 50,
  allDaemonsBonus: 250,
  optimalPathBonus: 150,
  assistPenalty: 0.1, // each assist use cuts the final score by 10%
};

export function scoreBreach({ puzzle, statuses, picks, timeLeft, assistsUsed }) {
  const daemonPoints = statuses.reduce(
    (sum, s, i) => (s.state === 'uploaded' ? sum + puzzle.daemons[i].value : sum), 0);
  const uploaded = statuses.filter((s) => s.state === 'uploaded').length;
  const all = uploaded === puzzle.daemons.length;

  // Time and efficiency only count if at least one daemon made it.
  const anySuccess = uploaded > 0;
  const timeBonus = anySuccess ? Math.round(Math.max(0, timeLeft) * SCORE_RULES.perSecond) : 0;
  const unused = puzzle.bufferSize - picks.length;
  const efficiency = anySuccess ? unused * SCORE_RULES.perUnusedSlot : 0;
  const allBonus = all ? SCORE_RULES.allDaemonsBonus : 0;
  const optimal = all && picks.length <= puzzle.optimal.length;
  const optimalBonus = optimal ? SCORE_RULES.optimalPathBonus : 0;

  const subtotal = daemonPoints + timeBonus + efficiency + allBonus + optimalBonus;
  const multiplier = Math.max(0, 1 - assistsUsed * SCORE_RULES.assistPenalty);
  const total = Math.round(subtotal * multiplier);

  let stars = 0;
  if (uploaded > 0) stars = 1;
  if (all) stars = 2;
  if (all && optimal && assistsUsed === 0) stars = 3;

  return {
    daemonPoints, timeBonus, efficiency, allBonus, optimalBonus,
    subtotal, multiplier, total, stars, uploaded, all, optimal,
  };
}
