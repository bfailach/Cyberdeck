import { availableCells, daemonStatuses } from './rules.js';

const daemonValueSum = (daemons, statuses, states) =>
  statuses.reduce((sum, s, i) => (states.includes(s.state) ? sum + daemons[i].value : sum), 0);

/**
 * Finds the best continuation from the given picks:
 * the most daemon value, and among those the fewest picks.
 * Returns { path: [{r,c}...] (new picks only), value, total }.
 */
export function solve(puzzle, startPicks = []) {
  const { size, grid, bufferSize, daemons } = puzzle;
  const remaining = bufferSize - startPicks.length;
  const startBuffer = startPicks.map((p) => grid[p.r][p.c]);
  const startStatuses = daemonStatuses(startBuffer, bufferSize, daemons);
  const startValue = daemonValueSum(daemons, startStatuses, ['uploaded']);
  const target = daemonValueSum(daemons, startStatuses, ['uploaded', 'pending']);

  if (target === startValue || remaining <= 0) {
    return { path: [], value: startValue, total: startPicks.length };
  }

  const picks = startPicks.slice();
  const buffer = startBuffer.slice();

  // Iterative deepening: shortest path that reaches the best possible value.
  for (let depth = 1; depth <= remaining; depth++) {
    const limit = startPicks.length + depth;
    const found = dfsTarget(limit);
    if (found) return { path: found, value: target, total: limit };
  }

  // Target unreachable (should not happen for generated puzzles): best effort search.
  let best = { path: [], value: startValue, total: startPicks.length };
  dfsBest();
  return best;

  function dfsTarget(limit) {
    const st = daemonStatuses(buffer, limit, daemons);
    const value = daemonValueSum(daemons, st, ['uploaded']);
    if (value === target) return picks.slice(startPicks.length);
    if (picks.length >= limit) return null;
    if (daemonValueSum(daemons, st, ['uploaded', 'pending']) < target) return null;
    for (const cell of availableCells(size, picks)) {
      picks.push(cell);
      buffer.push(grid[cell.r][cell.c]);
      const res = dfsTarget(limit);
      picks.pop();
      buffer.pop();
      if (res) return res;
    }
    return null;
  }

  function dfsBest() {
    const st = daemonStatuses(buffer, bufferSize, daemons);
    const value = daemonValueSum(daemons, st, ['uploaded']);
    if (value > best.value || (value === best.value && picks.length < best.total)) {
      best = { path: picks.slice(startPicks.length), value, total: picks.length };
    }
    if (picks.length >= bufferSize) return;
    if (daemonValueSum(daemons, st, ['uploaded', 'pending']) <= best.value) return;
    for (const cell of availableCells(size, picks)) {
      picks.push(cell);
      buffer.push(grid[cell.r][cell.c]);
      dfsBest();
      picks.pop();
      buffer.pop();
    }
  }
}
