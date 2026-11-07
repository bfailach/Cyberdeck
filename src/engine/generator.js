import { createRng } from './rng.js';
import { ALL_CODES, containsSequence } from './rules.js';
import { levelConfig } from './levels.js';
import { solve } from './solver.js';

/**
 * Builds a puzzle that is always fully solvable:
 * 1. Make a random "solution string" S (length = config.planted).
 * 2. Cut each daemon out of S, so the daemons overlap the way S chains them.
 * 3. Plant S along a random legal path in the matrix and fill the rest randomly.
 * 4. Run the solver to confirm and to record the optimal (shortest) solution.
 */
export function generatePuzzle(level, seed) {
  const config = levelConfig(level);
  const rng = createRng(seed);

  for (let attempt = 0; attempt < 200; attempt++) {
    const codes = rng.shuffle(ALL_CODES).slice(0, config.codeCount);
    const S = Array.from({ length: config.planted }, () => rng.pick(codes));
    const seqs = carveDaemons(rng, S, config.daemons.map((d) => d.length));
    if (!seqs) continue;

    const path = randomPath(rng, config.size, config.planted);
    if (!path) continue;

    const grid = Array.from({ length: config.size }, () =>
      Array.from({ length: config.size }, () => rng.pick(codes)),
    );
    path.forEach((p, i) => { grid[p.r][p.c] = S[i]; });

    const puzzle = {
      seed,
      level: config.level,
      size: config.size,
      grid,
      codes,
      bufferSize: config.bufferSize,
      time: config.time,
      assists: { ...config.assists },
      daemons: config.daemons.map((d, i) => ({
        name: d.name,
        description: d.description,
        value: d.value,
        seq: seqs[i],
      })),
    };

    const best = solve(puzzle);
    const maxValue = puzzle.daemons.reduce((s, d) => s + d.value, 0);
    if (best.value !== maxValue) continue;
    // Avoid puzzles the solver can shortcut a lot: keep them close to the planted length.
    if (best.total < config.planted - 1) continue;

    puzzle.optimal = { path: best.path, length: best.total, value: best.value };
    return puzzle;
  }
  throw new Error(`Could not generate a puzzle for level ${level} (seed ${seed})`);
}

/** Cuts daemons out of S so that together they cover all of S, all distinct, none inside another. */
function carveDaemons(rng, S, lengths) {
  const n = S.length;
  for (let tries = 0; tries < 50; tries++) {
    const offsets = lengths.map((len) => rng.int(n - len + 1));
    // Force coverage of both ends so the full string is needed.
    const iFirst = rng.int(lengths.length);
    offsets[iFirst] = 0;
    let iLast = rng.int(lengths.length);
    if (iLast === iFirst) iLast = (iLast + 1) % lengths.length;
    offsets[iLast] = n - lengths[iLast];

    const covered = new Array(n).fill(false);
    lengths.forEach((len, i) => { for (let j = 0; j < len; j++) covered[offsets[i] + j] = true; });
    if (!covered.every(Boolean)) continue;

    const seqs = lengths.map((len, i) => S.slice(offsets[i], offsets[i] + len));
    let ok = true;
    for (let a = 0; a < seqs.length && ok; a++) {
      for (let b = 0; b < seqs.length && ok; b++) {
        if (a !== b && containsSequence(seqs[b], seqs[a])) ok = false;
      }
    }
    if (ok) return seqs;
  }
  return null;
}

/** Random legal pick path of the given length (row 0 first, then alternating column/row). */
function randomPath(rng, size, length) {
  const used = new Set();
  const path = [];
  const step = () => {
    if (path.length === length) return true;
    let options;
    if (path.length === 0) {
      options = Array.from({ length: size }, (_, c) => ({ r: 0, c }));
    } else {
      const last = path[path.length - 1];
      const byColumn = path.length % 2 === 1;
      options = Array.from({ length: size }, (_, i) => (byColumn ? { r: i, c: last.c } : { r: last.r, c: i }));
    }
    options = rng.shuffle(options.filter((p) => !used.has(p.r * size + p.c)));
    for (const p of options) {
      used.add(p.r * size + p.c);
      path.push(p);
      if (step()) return true;
      path.pop();
      used.delete(p.r * size + p.c);
    }
    return false;
  };
  return step() ? path : null;
}
