// Difficulty curve. Each level grows the matrix, tightens time and buffer,
// lengthens daemons and hands out fewer assists.

const DAEMON_NAMES = ['DATAMINE_V1', 'DATAMINE_V2', 'DATAMINE_V3', 'ICEPICK'];
const DAEMON_DESCRIPTIONS = [
  'Extracts a small amount of eurodollars and components.',
  'Extracts a moderate amount of eurodollars and components.',
  'Extracts a large amount of eurodollars and components.',
  'Lowers the RAM cost of quickhacks by 1.',
];

export const MAX_LEVEL = 20;

export function levelConfig(level) {
  const L = Math.max(1, Math.min(MAX_LEVEL, level));

  let size, codeCount, lengths, planted;
  if (L <= 4) {
    size = 5; codeCount = 5; lengths = [2, 3, 3]; planted = L <= 2 ? 5 : 6;
  } else if (L <= 9) {
    size = 6; codeCount = 5; lengths = [2, 3, 4]; planted = L <= 7 ? 6 : 7;
  } else if (L <= 14) {
    size = 7; codeCount = 6; lengths = [3, 3, 4]; planted = L <= 12 ? 7 : 8;
  } else {
    size = 7; codeCount = 6; lengths = [3, 3, 4, 4]; planted = 8;
  }

  const slack = L <= 6 ? 1 : 0; // spare buffer slots beyond the planted solution
  const bufferSize = Math.min(8, planted + slack);
  const time = Math.max(25, Math.round(60 - (L - 1) * 2.5));

  const assists = {
    hint: Math.max(0, 3 - Math.floor((L - 1) / 4)),
    undo: Math.max(0, 3 - Math.floor((L - 1) / 5)),
    freeze: Math.max(0, 2 - Math.floor((L - 1) / 6)),
  };

  const daemons = lengths.map((len, i) => ({
    name: DAEMON_NAMES[i],
    description: DAEMON_DESCRIPTIONS[i],
    length: len,
    value: daemonValue(i, len),
  }));

  return { level: L, size, codeCount, bufferSize, planted, time, daemons, assists };
}

/** V1 = 100, V2 = 200, V3 = 300, ICEPICK = 300; +50 for each code beyond 3. */
export function daemonValue(index, length) {
  const base = [100, 200, 300, 300][index] ?? 300;
  return base + Math.max(0, length - 3) * 50;
}
