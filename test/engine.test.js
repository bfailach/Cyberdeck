import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableCells, daemonStatuses } from '../src/engine/rules.js';
import { solve } from '../src/engine/solver.js';
import { generatePuzzle } from '../src/engine/generator.js';
import { Breach } from '../src/engine/breach.js';
import { MAX_LEVEL } from '../src/engine/levels.js';
import { computeMods, pointsAvailable, pointsSpent, pointsEarned, xpForLevel, netrunnerLevel, requirements, perksAreValid, TREE_COST } from '../src/engine/perks.js';

// Reference puzzle from an in-game screenshot.
const reference = {
  size: 5,
  bufferSize: 6,
  time: 63,
  assists: { hint: 3, undo: 3, freeze: 2 },
  grid: [
    ['BD', 'E9', '1C', 'BD', 'BD'],
    ['1C', '1C', 'BD', 'BD', '55'],
    ['BD', 'BD', '55', 'BD', 'BD'],
    ['1C', '55', '55', 'E9', 'BD'],
    ['55', '1C', 'BD', '55', '55'],
  ],
  daemons: [
    { name: 'DATAMINE_V1', seq: ['55', '1C'], value: 100 },
    { name: 'DATAMINE_V2', seq: ['1C', 'E9', 'BD'], value: 200 },
    { name: 'DATAMINE_V3', seq: ['BD', 'BD', '55'], value: 300 },
  ],
  optimal: { length: 6 },
};

test('first pick comes from the top row, then alternates column/row', () => {
  assert.deepEqual(availableCells(5, []).map((p) => p.r), [0, 0, 0, 0, 0]);
  const afterOne = availableCells(5, [{ r: 0, c: 4 }]);
  assert.ok(afterOne.every((p) => p.c === 4) && afterOne.length === 4);
  const afterTwo = availableCells(5, [{ r: 0, c: 4 }, { r: 3, c: 4 }]);
  assert.ok(afterTwo.every((p) => p.r === 3) && afterTwo.length === 4);
});

test('screenshot path uploads all three daemons', () => {
  const b = new Breach(reference);
  for (const [r, c] of [[0, 4], [3, 4], [3, 2], [0, 2], [0, 1], [2, 1]]) assert.ok(b.pick(r, c));
  assert.equal(b.over, true);
  assert.deepEqual(b.statuses.map((s) => s.state), ['uploaded', 'uploaded', 'uploaded']);
  assert.equal(b.result.stars, 3);
});

test('daemon fails when it can no longer fit', () => {
  const st = daemonStatuses(['1C', '1C', '1C', '55'], 6, reference.daemons);
  assert.equal(st[2].state, 'failed'); // BD BD 55 needs 3 slots, 2 left
  assert.deepEqual(st[0], { state: 'pending', matched: 1 }); // 55 already in place, needs 1C
});

test('solver finds a 6-pick full solution for the reference puzzle', () => {
  const res = solve(reference);
  assert.equal(res.value, 600);
  assert.equal(res.total, 6);
});

test('generated puzzles are solvable at every level', () => {
  for (let level = 1; level <= MAX_LEVEL; level++) {
    for (let seed = 1; seed <= 3; seed++) {
      const p = generatePuzzle(level, seed * 7919 + level);
      const max = p.daemons.reduce((s, d) => s + d.value, 0);
      assert.equal(p.optimal.value, max, `level ${level} seed ${seed}`);
      assert.ok(p.optimal.length <= p.bufferSize);
      // Replaying the optimal path must upload everything.
      const b = new Breach(p);
      for (const cell of p.optimal.path) assert.ok(b.pick(cell.r, cell.c));
      assert.ok(b.statuses.every((s) => s.state === 'uploaded'));
    }
  }
});

test('same seed gives the same puzzle', () => {
  assert.deepEqual(generatePuzzle(3, 42).grid, generatePuzzle(3, 42).grid);
});

test('timer runs immediately by default', () => {
  const b = new Breach(reference);
  b.tick(3);
  assert.equal(b.timeLeft, 60);
});

test('first-pick timer mode waits for the first pick; freeze pauses it', () => {
  const b = new Breach(reference, { timerMode: 'firstPick' });
  b.tick(10);
  assert.equal(b.timeLeft, 63);
  b.pick(0, 4);
  b.useFreeze(5);
  b.tick(3);
  assert.equal(b.timeLeft, 63);
  b.tick(4);
  assert.equal(b.timeLeft, 61);
});

test('hint points at the next optimal cell; assists reduce score', () => {
  const b = new Breach(reference);
  const h = b.useHint();
  assert.ok(h && h.r === 0);
  assert.equal(b.assistsUsed, 1);
});

test('perks change time, buffer, assists and scoring', () => {
  const mods = computeMods({ breach_time: 2, buffer: 1, hint_cache: 1, cryo: 2, light_touch: 1, datamine: 3, overload: 1 });
  const b = new Breach(reference, { mods });
  assert.equal(b.timeLeft, 73);
  assert.equal(b.puzzle.bufferSize, 7);
  assert.equal(b.assists.hint, 4);
  assert.equal(b.assists.freeze, 3);
  b.useFreeze();
  assert.equal(b.frozenFor, 8);
  for (const [r, c] of [[0, 4], [3, 4], [3, 2], [0, 2], [0, 1], [2, 1]]) b.pick(r, c);
  b.finish('complete');
  assert.equal(b.result.daemonPoints, 780); // 600 * 1.3
  assert.equal(b.result.allBonus, 500); // Daemon Overload
  assert.equal(b.result.multiplier, 0.95);
});

test('time dilation slows the breach clock', () => {
  const b = new Breach(reference, { mods: computeMods({ time_dilation: 1 }) });
  b.tick(10);
  assert.equal(b.timeLeft, 55);
});

test('XP is the sum of best scores; levels get more expensive', () => {
  assert.equal(xpForLevel(1), 0);
  assert.ok(xpForLevel(3) - xpForLevel(2) < xpForLevel(30) - xpForLevel(29));
  assert.equal(netrunnerLevel(0), 1);
  assert.equal(netrunnerLevel(xpForLevel(10)), 10);
  assert.equal(netrunnerLevel(xpForLevel(10) - 1), 9);
  const save = { best: { 1: { score: xpForLevel(5), stars: 3 } }, perks: {} };
  assert.equal(pointsEarned(save), 4);
});

test('perks need the perk before them, a Netrunner level and (capstones) stars', () => {
  const rich = { best: { 1: { score: xpForLevel(40), stars: 3 } }, perks: {} };
  // chained: Overclocked Uplink needs Extended Uplink tier 2
  assert.equal(requirements(rich, 'overclock').unlocked, false);
  rich.perks = { breach_time: 2 };
  assert.equal(requirements(rich, 'overclock').unlocked, true);
  // level gate
  const poor = { best: { 1: { score: xpForLevel(4), stars: 3 } }, perks: { breach_time: 2 } };
  assert.equal(requirements(poor, 'overclock').unlocked, false);
  // capstone needs stars
  rich.perks = { breach_time: 3, overclock: 1, buffer: 1 };
  const r = requirements(rich, 'time_dilation');
  assert.equal(r.list.find((x) => x.label.includes('stars')).met, false);
});

test('old or invalid perk sets are detected', () => {
  const save = { best: { 1: { score: 900, stars: 3 } }, perks: { buffer: 2, scanner: 1 } };
  assert.equal(perksAreValid(save), false);
  assert.equal(perksAreValid({ best: {}, perks: {} }), true);
  assert.ok(TREE_COST > 60);
});

test('points come from levels and are spent on tiers', () => {
  const save = { best: { 1: { score: xpForLevel(4), stars: 3 } }, perks: { breach_time: 1, hint_cache: 1 } };
  assert.equal(pointsSpent(save.perks), 3);
  assert.equal(pointsAvailable(save), 0);
});

test('scanner marks cells that advance a daemon', () => {
  const b = new Breach(reference);
  const cells = b.advancingCells();
  // top row: needs 55 (V1), 1C (V2), BD (V3) -> BD at c0, c3, c4 and 1C at c2
  assert.deepEqual(cells.map((p) => p.c).sort(), [0, 2, 3, 4]);
});
