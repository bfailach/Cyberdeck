// Breach Protocol rules (Cyberpunk 2077, patch 2.0+ behaviour).
//
// - The first pick comes from the top row.
// - Picks then alternate: column of the last pick, row of the last pick, ...
// - A cell can be used only once.
// - A daemon uploads when its full sequence appears as consecutive codes in the buffer.
// - A daemon fails when it can no longer fit in the slots that are left.

export const ALL_CODES = ['1C', '55', 'BD', 'E9', '7A', 'FF'];

/** Axis of the line the next pick must come from: 'row' or 'col'. */
export function activeAxis(pickCount) {
  return pickCount % 2 === 0 ? 'row' : 'col';
}

/** Index of the active row/column given the picks made so far. */
export function activeIndex(picks) {
  if (picks.length === 0) return 0; // top row
  const last = picks[picks.length - 1];
  return activeAxis(picks.length) === 'row' ? last.r : last.c;
}

/** Cells that can be picked next. */
export function availableCells(size, picks) {
  const axis = activeAxis(picks.length);
  const idx = activeIndex(picks);
  const used = new Set(picks.map((p) => p.r * size + p.c));
  const out = [];
  for (let i = 0; i < size; i++) {
    const r = axis === 'row' ? idx : i;
    const c = axis === 'row' ? i : idx;
    if (!used.has(r * size + c)) out.push({ r, c });
  }
  return out;
}

/** True if `seq` appears as a contiguous run inside `buffer`. */
export function containsSequence(buffer, seq) {
  outer: for (let i = 0; i + seq.length <= buffer.length; i++) {
    for (let j = 0; j < seq.length; j++) if (buffer[i + j] !== seq[j]) continue outer;
    return true;
  }
  return false;
}

/** Longest k such that the last k codes of buffer equal the first k codes of seq (k < seq.length). */
export function matchedPrefix(buffer, seq) {
  const max = Math.min(buffer.length, seq.length - 1);
  for (let k = max; k > 0; k--) {
    let ok = true;
    for (let j = 0; j < k; j++) {
      if (buffer[buffer.length - k + j] !== seq[j]) { ok = false; break; }
    }
    if (ok) return k;
  }
  return 0;
}

/**
 * Status of each daemon: 'uploaded', 'failed' or 'pending' (+ matched prefix length).
 */
export function daemonStatuses(buffer, bufferSize, daemons) {
  const remaining = bufferSize - buffer.length;
  return daemons.map((d) => {
    if (containsSequence(buffer, d.seq)) return { state: 'uploaded', matched: d.seq.length };
    const k = matchedPrefix(buffer, d.seq);
    if (d.seq.length - k > remaining) return { state: 'failed', matched: 0 };
    return { state: 'pending', matched: k };
  });
}

export function isBreachOver(size, picks, bufferSize, statuses) {
  if (picks.length >= bufferSize) return true;
  if (statuses.every((s) => s.state !== 'pending')) return true;
  return availableCells(size, picks).length === 0;
}
