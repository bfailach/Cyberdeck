import '@fontsource/rajdhani/400.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import './ui/styles.css';

import { generatePuzzle } from './engine/generator.js';
import { Breach } from './engine/breach.js';
import { levelConfig, MAX_LEVEL } from './engine/levels.js';
import { randomSeed } from './engine/rng.js';
import { loadSave, recordResult } from './storage.js';
import { sfx, startMusic, toggleMute, isMuted } from './ui/audio.js';

const PITCH = 53.5; // distance between matrix cells (matches the in-game layout at 1600x900)
const SLOT = 35; // distance between daemon code columns
const PANEL_W = 476;

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

const app = {
  save: loadSave(),
  mode: 'menu', // 'menu' | 'breach' | 'result'
  level: 1,
  seed: 0,
  puzzle: null,
  breach: null,
  cursor: 0,
  cursorActive: false,
  menuSel: 0,
  resultFocus: 0,
  lastSecond: null,
  lastFrame: 0,
  resultInfo: null,
};

// ---------------------------------------------------------------- setup
function fitStage() {
  const s = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
  $('stage').style.transform = `scale(${s})`;
}
window.addEventListener('resize', fitStage);

function paintBackground() {
  const host = $('bgCodes');
  const codes = ['1C', '55', 'BD', 'E9', '7A', 'FF', '0F', 'A3', '9D', '42'];
  const spots = [[570, 630], [1015, 610], [740, 660], [1180, 700], [140, 640], [1250, 120], [580, 0]];
  host.innerHTML = '';
  spots.forEach(([x, y], i) => {
    let txt = '';
    for (let r = 0; r < 6; r++) {
      txt += Array.from({ length: 8 }, () => codes[Math.floor(Math.random() * codes.length)]).join(' ') + '\n';
    }
    const b = el('div', 'blk', txt);
    b.style.left = `${x}px`; b.style.top = `${y}px`; b.style.animationDelay = `${i * 1.3}s`;
    host.append(b);
  });
}

// ---------------------------------------------------------------- menu
function showMenu() {
  app.mode = 'menu';
  app.breach = null;
  $('menu').classList.remove('hidden');
  app.menuSel = Math.min(app.save.unlocked, MAX_LEVEL) - 1;
  renderMenu();
  renderPrompts();
}

function renderMenu() {
  const grid = $('levelGrid');
  grid.innerHTML = '';
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const locked = L > app.save.unlocked;
    const best = app.save.best[L];
    const stars = best ? '★'.repeat(best.stars) + '☆'.repeat(3 - best.stars) : locked ? 'LOCKED' : '☆☆☆';
    const cell = el('div', `lvl${locked ? ' locked' : ''}${app.menuSel === L - 1 ? ' sel' : ''}`,
      `${String(L).padStart(2, '0')}<small>${stars}</small>`);
    cell.addEventListener('mouseenter', () => { if (!locked) { app.menuSel = L - 1; renderMenu(); sfx.hover(); } });
    cell.addEventListener('click', () => { if (!locked) startLevel(L); });
    grid.append(cell);
  }
  const L = app.menuSel + 1;
  const c = levelConfig(L);
  const best = app.save.best[L];
  $('menuDetail').innerHTML =
    `LEVEL <b>${L}</b> — matrix <b>${c.size}×${c.size}</b> · buffer <b>${c.bufferSize}</b> · time <b>${c.time}s</b> · ` +
    `daemons <b>${c.daemons.map((d) => d.length).join('/')}</b><br/>` +
    `Assists: hint <b>${c.assists.hint}</b> · undo <b>${c.assists.undo}</b> · freeze <b>${c.assists.freeze}</b>` +
    (best ? ` &nbsp;|&nbsp; best score <b>${best.score}</b>` : '');
}

// ---------------------------------------------------------------- breach
function startLevel(level, seed = randomSeed()) {
  startMusic();
  sfx.start();
  app.level = level;
  app.seed = seed;
  app.puzzle = generatePuzzle(level, seed);
  app.breach = new Breach(app.puzzle);
  app.mode = 'breach';
  app.cursorActive = false;
  app.cursor = firstAvailableIndex();
  app.lastSecond = null;
  app.resultInfo = null;
  $('menu').classList.add('hidden');
  $('terminal').classList.add('hidden');
  $('matrix').classList.remove('hidden');
  $('matrixFoot').classList.remove('hidden');
  $('scorePanel').classList.add('hidden');
  $('exitWrap').classList.add('hidden');
  $('assistPanel').classList.remove('hidden');
  $('matrixPanel').classList.remove('success', 'fail');
  $('matrixTitle').textContent = 'CODE MATRIX';
  $('levelLabel').textContent = String(level).padStart(2, '0');
  $('seedLabel').textContent = seed.toString(16).toUpperCase();
  $('bannerId').textContent = `CDK-${seed.toString(16).toUpperCase().padStart(8, '0').replace(/(.{4})/, '$1-')}-L${level}`;
  layoutPanels();
  renderAll();
}

function lineCells() {
  const b = app.breach;
  const n = app.puzzle.size;
  return Array.from({ length: n }, (_, i) => (b.axis === 'row' ? { r: b.lineIndex, c: i } : { r: i, c: b.lineIndex }));
}

function firstAvailableIndex(from = 0) {
  const cells = lineCells();
  for (let d = 0; d < cells.length; d++) {
    for (const i of [from + d, from - d]) {
      if (i >= 0 && i < cells.length && app.breach.isAvailable(cells[i].r, cells[i].c)) return i;
    }
  }
  return 0;
}

function cursorCell() {
  if (!app.breach || app.breach.over || !app.cursorActive) return null;
  const c = lineCells()[app.cursor];
  return c && app.breach.isAvailable(c.r, c.c) ? c : null;
}

function moveCursor(dir) {
  const cells = lineCells();
  if (!app.cursorActive) { app.cursorActive = true; renderBreach(); return; }
  let i = app.cursor;
  for (let k = 0; k < cells.length; k++) {
    i = (i + dir + cells.length) % cells.length;
    if (app.breach.isAvailable(cells[i].r, cells[i].c)) break;
  }
  if (i !== app.cursor) { app.cursor = i; sfx.hover(); }
  renderBreach();
}

function pickCell(r, c) {
  const b = app.breach;
  if (!b || b.over) return;
  const res = b.pick(r, c);
  if (!res) { sfx.denied(); return; }
  sfx.select();
  for (const ch of res.changes) {
    if (ch.state === 'uploaded') sfx.upload();
    if (ch.state === 'failed') sfx.daemonFail();
  }
  // Cursor continues on the new line, starting from the picked cell's position.
  const pos = b.axis === 'row' ? c : r;
  app.cursor = b.over ? 0 : firstAvailableIndex(pos);
  renderAll();
  $('bufferBox').classList.remove('flash'); void $('bufferBox').offsetWidth; $('bufferBox').classList.add('flash');
  if (b.over) endBreach();
}

function useAssist(kind) {
  const b = app.breach;
  if (!b || b.over) return;
  let ok = false;
  if (kind === 'hint') {
    const h = b.useHint();
    if (h) {
      ok = true;
      const cells = lineCells();
      app.cursor = cells.findIndex((p) => p.r === h.r && p.c === h.c);
      app.cursorActive = true;
    }
  } else if (kind === 'undo') {
    ok = b.useUndo();
    if (ok) { app.cursor = firstAvailableIndex(app.cursor); }
  } else if (kind === 'freeze') {
    ok = b.useFreeze(5);
    if (ok) sfx.freeze();
  }
  if (ok && kind !== 'freeze') sfx.assist();
  if (!ok) sfx.denied();
  renderAll();
}

// ---------------------------------------------------------------- layout & render
function layoutPanels() {
  const p = app.puzzle;
  const mSize = p.size * PITCH;
  const m = $('matrix');
  m.style.width = `${mSize}px`;
  m.style.height = `${mSize}px`;
  m.style.margin = `8px auto 18px`;
  const matrixBottom = 242 + 39 + 8 + mSize + 18 + 2;
  $('matrixFoot').style.top = `${matrixBottom + 8}px`;
  const daemonBottom = 240 + 36 + 22 + p.daemons.length * 59 + 2;
  $('assistPanel').style.top = `${daemonBottom + 26}px`;
  $('scorePanel').style.top = `${daemonBottom + 20}px`;
  $('exitWrap').style.top = `698px`;
  $('exitWrap').style.left = `171px`;
}

function renderAll() {
  renderBreach();
  renderTimer();
}

function renderBreach() {
  const b = app.breach;
  if (!b) return;
  renderMatrix();
  renderBuffer();
  renderDaemons();
  renderAssists();
  renderPrompts();
}

function renderMatrix() {
  const b = app.breach;
  const p = app.puzzle;
  const m = $('matrix');
  m.innerHTML = '';
  const cur = cursorCell();
  const extra = (PANEL_W - p.size * PITCH) / 2;

  if (!b.over) {
    const band = el('div', 'line-band');
    if (b.axis === 'row') Object.assign(band.style, { left: `${-extra}px`, width: `${PANEL_W - 2}px`, top: `${b.lineIndex * PITCH}px`, height: `${PITCH}px` });
    else Object.assign(band.style, { left: `${b.lineIndex * PITCH}px`, width: `${PITCH}px`, top: `-8px`, height: `${p.size * PITCH + 26}px` });
    m.append(band);
    // Preview of the line that the cursor cell would open next.
    if (cur) {
      const pv = el('div', 'line-band preview');
      if (b.axis === 'row') Object.assign(pv.style, { left: `${cur.c * PITCH}px`, width: `${PITCH}px`, top: `-8px`, height: `${p.size * PITCH + 26}px` });
      else Object.assign(pv.style, { left: `${-extra}px`, width: `${PANEL_W - 2}px`, top: `${cur.r * PITCH}px`, height: `${PITCH}px` });
      m.append(pv);
    }
  }

  const avail = new Set(b.available().map((q) => q.r * p.size + q.c));
  for (let r = 0; r < p.size; r++) {
    for (let c = 0; c < p.size; c++) {
      const code = p.grid[r][c];
      const cls = ['cell'];
      if (b.isUsed(r, c)) cls.push('used');
      else if (avail.has(r * p.size + c)) cls.push('avail');
      else if (!b.over) cls.push('off');
      if (cur && cur.r === r && cur.c === c) cls.push('cursor');
      if (b.hint && b.hint.r === r && b.hint.c === c) cls.push('hint');
      const cell = el('div', cls.join(' '), code);
      cell.style.left = `${c * PITCH + (PITCH - 50) / 2}px`;
      cell.style.top = `${r * PITCH + (PITCH - 50) / 2}px`;
      cell.addEventListener('mouseenter', () => {
        if (app.mode !== 'breach' || !b.isAvailable(r, c)) return;
        const idx = lineCells().findIndex((q) => q.r === r && q.c === c);
        if (idx !== app.cursor || !app.cursorActive) { app.cursor = idx; app.cursorActive = true; sfx.hover(); renderBreach(); }
      });
      cell.addEventListener('click', () => { if (app.mode === 'breach') pickCell(r, c); });
      m.append(cell);
    }
  }
}

function renderBuffer() {
  const b = app.breach;
  const box = $('bufferBox');
  box.innerHTML = '';
  const buf = b.buffer;
  const cur = cursorCell();
  for (let i = 0; i < app.puzzle.bufferSize; i++) {
    let s;
    if (i < buf.length) s = el('div', 'slot filled', buf[i]);
    else if (i === buf.length && cur) s = el('div', 'slot ghost', app.puzzle.grid[cur.r][cur.c]);
    else s = el('div', 'slot');
    box.append(s);
  }
}

const DAEMON_ICON = `<svg viewBox="0 0 50 50"><g fill="none" stroke="currentColor" stroke-width="2.4">
  <path d="M25 4 L43 14 L43 36 L25 46 L7 36 L7 14 Z" opacity=".5"/>
  <path d="M25 13 V31 M17 24 L25 32 L33 24" stroke-width="3.2"/><path d="M15 37 H35"/></g>
  <g fill="currentColor"><rect x="23" y="7" width="4" height="3"/><rect x="11" y="16" width="3" height="3"/><rect x="36" y="16" width="3" height="3"/></g></svg>`;

function renderDaemons() {
  const b = app.breach;
  const host = $('daemons');
  host.innerHTML = '';
  const cur = cursorCell();
  const curCode = cur ? app.puzzle.grid[cur.r][cur.c] : null;
  app.puzzle.daemons.forEach((d, i) => {
    const st = b.statuses[i];
    const row = el('div', `daemon state-${st.state}`);
    const codes = el('div', 'd-codes');
    if (st.state === 'pending') {
      const start = b.picks.length - st.matched;
      d.seq.forEach((code, j) => {
        const cls = ['d-code'];
        if (j < st.matched) cls.push('done');
        if (j === st.matched) cls.push(curCode === code ? 'hover' : 'next');
        const c = el('div', cls.join(' '), code);
        c.style.left = `${(start + j) * SLOT}px`;
        codes.append(c);
      });
    } else {
      codes.append(el('div', 'd-status', st.state === 'uploaded' ? 'INSTALLED' : 'FAILED'));
    }
    row.append(codes, el('div', 'd-icon', DAEMON_ICON), el('div', 'd-name', d.name), el('div', 'd-desc', d.description));
    host.append(row);
  });
}

function renderAssists() {
  const b = app.breach;
  const host = $('assistPanel');
  host.innerHTML = '';
  if (b.over) { host.classList.add('hidden'); return; }
  const items = [
    ['hint', 'HINT', '1', 'Shows the next best cell'],
    ['undo', 'UNDO', '2', 'Takes back the last pick'],
    ['freeze', 'FREEZE', '3', 'Stops the timer for 5s'],
  ];
  for (const [key, label, k, help] of items) {
    const n = b.assists[key];
    const a = el('div', `assist${n <= 0 ? ' empty' : ''}`,
      `<span class="count">${n}</span><div>${label}<kbd>${k}</kbd><small>${help}</small></div>`);
    a.addEventListener('click', () => useAssist(key));
    host.append(a);
  }
  host.append(el('div', 'assist-note', `Each assist used lowers the score by 10%.${b.assistsUsed ? ` Used: <b>${b.assistsUsed}</b>` : ''}`));
}

function renderTimer() {
  const b = app.breach;
  if (!b) return;
  const panel = document.querySelector('.timer-panel');
  $('timerBox').textContent = b.timeLeft.toFixed(2);
  $('timerFill').style.width = `${(b.timeLeft / app.puzzle.time) * 100}%`;
  panel.classList.toggle('frozen', b.frozenFor > 0 && !b.over);
  panel.classList.toggle('urgent', b.started && !b.over && b.timeLeft <= 10 && b.frozenFor <= 0);
  panel.classList.toggle('dimmed', b.over);
}

function renderPrompts() {
  const host = $('prompts');
  const P = (keys, label) => `<span class="p">${keys.map((k) => `<kbd>${k}</kbd>`).join('')} ${label}</span>`;
  let html = '';
  if (app.mode === 'breach') {
    html = P(['←', '→', '↑', '↓'], 'NAVIGATION') + P(['ENTER', 'F'], 'SELECT CODE') + P(['1', '2', '3'], 'ASSISTS') +
      P(['M'], isMuted() ? 'SOUND OFF' : 'SOUND') + P(['ESC'], 'CLOSE');
  } else if (app.mode === 'result') {
    html = P(['R'], 'RETRY') + P(['N'], 'NEW PUZZLE') + P(['ENTER'], 'CONFIRM') + P(['M'], isMuted() ? 'SOUND OFF' : 'SOUND') + P(['ESC'], 'MENU');
  } else {
    html = P(['←', '→', '↑', '↓'], 'SELECT LEVEL') + P(['ENTER'], 'INITIATE BREACH') + P(['M'], isMuted() ? 'SOUND OFF' : 'SOUND');
  }
  host.innerHTML = html;
}

// ---------------------------------------------------------------- results
function endBreach() {
  const b = app.breach;
  app.mode = 'result';
  const r = b.result;
  app.resultInfo = recordResult(app.save, app.level, r);
  const good = r.uploaded > 0;
  good ? sfx.success() : sfx.fail();

  const panel = $('matrixPanel');
  panel.classList.add(good ? 'success' : 'fail');
  panel.classList.add('glitch');
  setTimeout(() => panel.classList.remove('glitch'), 320);
  $('matrixTitle').textContent = good ? 'BREACH SUCCESSFUL' : 'BREACH FAILED';
  $('matrix').classList.add('hidden');
  $('matrixFoot').classList.add('hidden');

  const term = $('terminal');
  term.classList.remove('hidden');
  term.innerHTML = '';
  const dots = (s) => s + ' ' + '.'.repeat(Math.max(3, 40 - s.length));
  const lines = good
    ? ['//ROOT', '//ACCESS_REQUEST', '//ACCESS_REQUEST_SUCCESS',
      ...[1, 2, 3, 4].map((i) => `${dots(`//COLLECTING PACKET_${i}`)}<span class="ok">COMPLETE</span>`),
      '//LOGIN', '//LOGIN_SUCCESS', '//', '//UPLOAD_IN_PROGRESS', '//UPLOAD_COMPLETE!']
    : ['//ROOT', '//ACCESS_REQUEST',
      b.endReason === 'timeout' ? '//ERROR: BREACH_TIME_EXPIRED' : b.endReason === 'aborted' ? '//CONNECTION_TERMINATED_BY_USER' : '//ERROR: NO_VALID_SEQUENCE',
      '//ICE_COUNTERMEASURES_ENGAGED', '//TRACE_INITIATED', '//', '//UPLOAD_FAILED'];
  lines.forEach((ln, i) => setTimeout(() => { if (app.mode === 'result') term.append(el('div', '', ln)); }, 40 + i * 55));
  const banner = r.all ? 'ALL DAEMONS UPLOADED' : good ? `${r.uploaded} OF ${app.puzzle.daemons.length} DAEMONS UPLOADED` : 'NO DAEMONS UPLOADED';
  setTimeout(() => { if (app.mode === 'result') term.append(el('div', 'result-banner', banner)); }, 40 + lines.length * 55);

  renderBreach();
  renderTimer();
  renderScore();
  renderExitButtons();
}

function renderScore() {
  const b = app.breach;
  const r = b.result;
  const host = $('scorePanel');
  host.classList.remove('hidden');
  const row = (k, v, cls = '') => `<div class="score-row ${cls}"><span>${k}</span><span>${v}</span></div>`;
  const stars = [0, 1, 2].map((i) => `<span class="${i < r.stars ? 'on' : 'off'}">★</span>`).join('');
  const best = app.save.best[app.level];
  host.innerHTML =
    `<div class="score-row"><span class="stars">${stars}</span><span class="best">${app.resultInfo.isBest && r.total > 0 ? 'NEW BEST' : `BEST ${best?.score ?? 0}`}${app.resultInfo.unlockedNew ? ' · LEVEL ' + (app.level + 1) + ' UNLOCKED' : ''}</span></div>` +
    row('Daemons uploaded', `${r.uploaded}/${app.puzzle.daemons.length} · +${r.daemonPoints}`) +
    row(`Time bonus (${b.result.timeBonus / 5}s left)`, `+${r.timeBonus}`) +
    row(`Efficiency (${app.puzzle.bufferSize - b.picks.length} unused slots)`, `+${r.efficiency}`) +
    row('All daemons bonus', `+${r.allBonus}`) +
    row(`Optimal path (${b.picks.length} picks vs best ${app.puzzle.optimal.length})`, `+${r.optimalBonus}`) +
    (b.assistsUsed ? row(`Assists used (${b.assistsUsed})`, `×${r.multiplier.toFixed(1)}`) : '') +
    row('SCORE', r.total, 'total');
}

function resultButtons() {
  const canNext = app.save.unlocked > app.level && app.level < MAX_LEVEL;
  return [
    { label: 'RETRY', act: () => startLevel(app.level, app.seed) },
    { label: 'NEW PUZZLE', act: () => startLevel(app.level) },
    { label: 'NEXT LEVEL', act: () => startLevel(app.level + 1), disabled: !canNext, green: true },
    { label: 'EXIT INTERFACE', act: showMenu },
  ];
}

function renderExitButtons() {
  const host = $('exitWrap');
  host.classList.remove('hidden');
  host.innerHTML = '';
  const btns = resultButtons();
  if (btns[app.resultFocus]?.disabled) app.resultFocus = btns.findIndex((x) => !x.disabled);
  btns.forEach((bt, i) => {
    const e = el('button', `cp-btn${bt.green ? ' green' : ''}${i === app.resultFocus ? ' focus' : ''}`, bt.label);
    if (bt.disabled) e.disabled = true;
    e.addEventListener('mouseenter', () => { app.resultFocus = i; renderExitButtons(); });
    e.addEventListener('click', bt.act);
    host.append(e);
  });
}

// ---------------------------------------------------------------- input
window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'm' || k === 'M') { toggleMute(); renderPrompts(); return; }

  if (app.mode === 'menu') {
    const cols = 10;
    let s = app.menuSel;
    if (k === 'ArrowRight' || k === 'd') s++;
    else if (k === 'ArrowLeft' || k === 'a') s--;
    else if (k === 'ArrowDown' || k === 's') s += cols;
    else if (k === 'ArrowUp' || k === 'w') s -= cols;
    else if (k === 'Enter' || k === ' ' || k === 'f') { startLevel(app.menuSel + 1); return; }
    else return;
    e.preventDefault();
    s = Math.max(0, Math.min(Math.min(app.save.unlocked, MAX_LEVEL) - 1, s));
    if (s !== app.menuSel) { app.menuSel = s; sfx.hover(); renderMenu(); }
    return;
  }

  if (app.mode === 'breach') {
    const b = app.breach;
    const along = b.axis === 'row' ? ['ArrowLeft', 'ArrowRight', 'a', 'd'] : ['ArrowUp', 'ArrowDown', 'w', 's'];
    const across = b.axis === 'row' ? ['ArrowUp', 'ArrowDown', 'w', 's'] : ['ArrowLeft', 'ArrowRight', 'a', 'd'];
    if (along.includes(k) || across.includes(k)) {
      e.preventDefault();
      const back = [along[0], along[2], across[0], across[2]].includes(k);
      moveCursor(back ? -1 : 1);
    } else if (k === 'Enter' || k === 'f' || k === 'F' || k === ' ') {
      e.preventDefault();
      if (!app.cursorActive) { app.cursorActive = true; renderBreach(); return; }
      const c = cursorCell();
      if (c) pickCell(c.r, c.c);
    } else if (k === '1') useAssist('hint');
    else if (k === '2' || k === 'Backspace') useAssist('undo');
    else if (k === '3') useAssist('freeze');
    else if (k === 'Escape') { b.abort(); endBreach(); }
    return;
  }

  if (app.mode === 'result') {
    const btns = resultButtons();
    if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'd' || k === 'a') {
      const dir = k === 'ArrowRight' || k === 'd' ? 1 : -1;
      let i = app.resultFocus;
      do { i = (i + dir + btns.length) % btns.length; } while (btns[i].disabled);
      app.resultFocus = i; sfx.hover(); renderExitButtons();
    } else if (k === 'Enter' || k === 'f' || k === ' ') { e.preventDefault(); btns[app.resultFocus].act(); }
    else if (k === 'r' || k === 'R') startLevel(app.level, app.seed);
    else if (k === 'n' || k === 'N') startLevel(app.level);
    else if (k === 'Escape') showMenu();
  }
});

$('startBtn').addEventListener('click', () => startLevel(app.menuSel + 1));

// ---------------------------------------------------------------- loop
function frame(t) {
  const dt = app.lastFrame ? Math.min(0.1, (t - app.lastFrame) / 1000) : 0;
  app.lastFrame = t;
  const b = app.breach;
  if (app.mode === 'breach' && b) {
    const wasFrozen = b.frozenFor > 0;
    b.tick(dt);
    renderTimer();
    if (b.started && b.timeLeft <= 10 && b.frozenFor <= 0) {
      const s = Math.ceil(b.timeLeft);
      if (s !== app.lastSecond) { app.lastSecond = s; sfx.tick(); }
    }
    if (wasFrozen && b.frozenFor <= 0) renderTimer();
    if (b.over) endBreach();
  }
  requestAnimationFrame(frame);
}

fitStage();
paintBackground();
// Show a sample puzzle behind the menu so the interface is visible from the start.
app.puzzle = generatePuzzle(1, 1);
app.breach = new Breach(app.puzzle);
layoutPanels();
renderAll();
showMenu();
requestAnimationFrame(frame);

// Exposed for automated UI checks.
window.__cyberdeck = app;
