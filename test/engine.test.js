import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableCells, daemonStatuses } from '../src/engine/rules.js';
import { solve } from '../src/engine/solver.js';
import { generatePuzzle } from '../src/engine/generator.js';
import { Breach } from '../src/engine/breach.js';
import { MAX_LEVEL } from '../src/engine/levels.js';

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

test('timer only starts after the first pick; freeze pauses it', () => {
  const b = new Breach(reference);
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
