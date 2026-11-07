import { availableCells, activeAxis, activeIndex, daemonStatuses, isBreachOver } from './rules.js';
import { solve } from './solver.js';
import { scoreBreach } from './scoring.js';
import { DEFAULT_MODS } from './perks.js';

/**
 * One breach attempt. Pure game state; the UI drives the clock by calling tick().
 * timerMode 'immediate': the clock runs as soon as the breach opens.
 * timerMode 'firstPick': the clock waits for the first pick (patch 2.0 behaviour).
 * Perk modifiers (mods) add time, buffer slots and assist charges.
 */
export class Breach {
  constructor(basePuzzle, { mods = DEFAULT_MODS, timerMode = 'immediate' } = {}) {
    const puzzle = {
      ...basePuzzle,
      bufferSize: basePuzzle.bufferSize + mods.extraBuffer,
      time: basePuzzle.time + mods.extraTime,
      assists: {
        hint: basePuzzle.assists.hint + mods.extraHint,
        undo: basePuzzle.assists.undo + mods.extraUndo,
        freeze: basePuzzle.assists.freeze + mods.extraFreeze,
      },
    };
    this.puzzle = puzzle;
    this.mods = mods;
    this.timerMode = timerMode;
    this.picks = [];
    this.timeLeft = puzzle.time;
    this.started = timerMode === 'immediate';
    this.over = false;
    this.endReason = null;
    this.frozenFor = 0;
    this.assists = { ...puzzle.assists };
    this.assistsUsed = 0;
    this.hint = null;
    this.statuses = daemonStatuses([], puzzle.bufferSize, puzzle.daemons);
  }

  get buffer() { return this.picks.map((p) => this.puzzle.grid[p.r][p.c]); }
  get axis() { return activeAxis(this.picks.length); }
  get lineIndex() { return activeIndex(this.picks); }
  available() { return this.over ? [] : availableCells(this.puzzle.size, this.picks); }
  isAvailable(r, c) { return this.available().some((p) => p.r === r && p.c === c); }
  isUsed(r, c) { return this.picks.some((p) => p.r === r && p.c === c); }

  pick(r, c) {
    if (this.over || !this.isAvailable(r, c)) return null;
    const before = this.statuses;
    this.picks.push({ r, c });
    this.started = true;
    this.hint = null;
    this.statuses = daemonStatuses(this.buffer, this.puzzle.bufferSize, this.puzzle.daemons);
    const changes = this.statuses.map((s, i) => (s.state !== before[i].state ? { index: i, state: s.state } : null))
      .filter(Boolean);
    if (isBreachOver(this.puzzle.size, this.picks, this.puzzle.bufferSize, this.statuses)) this.finish('complete');
    return { code: this.puzzle.grid[r][c], changes };
  }

  tick(dt) {
    if (!this.started || this.over) return;
    if (this.frozenFor > 0) {
      const used = Math.min(this.frozenFor, dt);
      this.frozenFor -= used;
      dt -= used;
      if (dt <= 0) return;
    }
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft === 0) this.finish('timeout');
  }

  // ---- Assists (practice helpers; each use costs 10% of the final score) ----
  useHint() {
    if (this.over || this.assists.hint <= 0) return null;
    const res = solve(this.puzzle, this.picks);
    if (!res.path.length) return null;
    this.assists.hint--; this.assistsUsed++;
    this.hint = res.path[0];
    return this.hint;
  }

  useUndo() {
    if (this.over || this.assists.undo <= 0 || this.picks.length === 0) return false;
    this.assists.undo--; this.assistsUsed++;
    this.picks.pop();
    this.hint = null;
    this.statuses = daemonStatuses(this.buffer, this.puzzle.bufferSize, this.puzzle.daemons);
    return true;
  }

  useFreeze(seconds = this.mods.freezeSeconds) {
    if (this.over || this.assists.freeze <= 0) return false;
    this.assists.freeze--; this.assistsUsed++;
    this.frozenFor += seconds;
    return true;
  }

  /** Cells on the active line whose code is the next code some pending daemon needs. */
  advancingCells() {
    const needed = new Set();
    this.statuses.forEach((s, i) => { if (s.state === 'pending') needed.add(this.puzzle.daemons[i].seq[s.matched]); });
    return this.available().filter((p) => needed.has(this.puzzle.grid[p.r][p.c]));
  }

  abort() { this.finish('aborted'); }

  finish(reason) {
    if (this.over) return;
    this.over = true;
    this.endReason = reason;
    // Anything still pending at the end did not upload.
    this.statuses = this.statuses.map((s) => (s.state === 'pending' ? { state: 'failed', matched: 0 } : s));
    this.result = scoreBreach({
      puzzle: this.puzzle,
      statuses: this.statuses,
      picks: this.picks,
      timeLeft: reason === 'timeout' || reason === 'aborted' ? 0 : this.timeLeft,
      assistsUsed: this.assistsUsed,
      mods: this.mods,
    });
  }
}
