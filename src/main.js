import '@fontsource/rajdhani/400.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import './ui/styles.css';

import { generatePuzzle } from './engine/generator.js';
import { Breach } from './engine/breach.js';
import { levelConfig, MAX_LEVEL } from './engine/levels.js';
import { randomSeed } from './engine/rng.js';
import { BRANCHES, computeMods, nextCost, perkById, pointsAvailable, pointsEarned } from './engine/perks.js';
import { loadSave, recordResult, resetProgress, writeSave } from './storage.js';
import { sfx, startMusic, setMusicMode, setVolumes, toggleMute, isMuted } from './ui/audio.js';

const PITCH = 53.5; // distance between matrix cells (matches the in-game layout at 1600x900)
const SLOT = 35; // distance between daemon code columns
const PANEL_W = 476;
const IS_DESKTOP = navigator.userAgent.includes('Electron');

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

const app = {
  save: loadSave(),
  mode: 'main', // 'main' | 'levels' | 'settings' | 'skills' | 'breach' | 'result'
  level: 1,
  seed: 0,
  puzzle: null,
  breach: null,
  cursor: 0,
  cursorActive: false,
  sel: 0, // selection index on the current menu screen
  resultFocus: 0,
  resetArmed: false,
  lastSecond: null,
  lastFrame: 0,
  resultInfo: null,
};

setVolumes(app.save.settings);

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

// Browsers only allow audio after a user gesture; start the soundtrack on the first one.
const unlockAudio = () => { startMusic(); setMusicMode(app.mode === 'breach' ? 'breach' : 'menu'); };
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

// ---------------------------------------------------------------- menus
function showScreen(mode) {
  app.mode = mode;
  app.sel = 0;
  app.resetArmed = false;
  if (mode === 'levels') app.sel = Math.min(app.save.unlocked, MAX_LEVEL) - 1;
  $('menu').classList.toggle('hidden', !['main', 'levels', 'settings'].includes(mode));
  $('skills').classList.toggle('hidden', mode !== 'skills');
  $('prompts').classList.toggle('hidden', mode === 'skills');
  setMusicMode('menu');
  renderScreen();
  renderPrompts();
}

function renderScreen() {
  if (app.mode === 'main') renderMain();
  else if (app.mode === 'levels') renderLevels();
  else if (app.mode === 'settings') renderSettings();
  else if (app.mode === 'skills') renderSkills();
}

function mainItems() {
  const next = Math.min(app.save.unlocked, MAX_LEVEL);
  const pts = pointsAvailable(app.save);
  const items = [
    { label: 'CONTINUE', sub: `LEVEL ${String(next).padStart(2, '0')}`, act: () => startLevel(next) },
    { label: 'SELECT LEVEL', sub: `${Object.keys(app.save.best).length}/${MAX_LEVEL} PLAYED`, act: () => showScreen('levels') },
    { label: 'SKILL TREE', sub: pts > 0 ? `${pts} POINT${pts > 1 ? 'S' : ''} AVAILABLE` : '', badge: pts > 0, act: () => showScreen('skills') },
    { label: 'SETTINGS', sub: '', act: () => showScreen('settings') },
  ];
  if (IS_DESKTOP) items.push({ label: 'QUIT', sub: '', act: () => window.close() });
  return items;
}

function renderMain() {
  const host = $('menuContent');
  const items = mainItems();
  const stars = pointsEarned(app.save);
  const bestTotal = Object.values(app.save.best).reduce((s, b) => s + b.score, 0);
  host.className = 'menu-wrap main-menu';
  host.innerHTML = `
    <div class="mm-left">
      <div class="menu-tag">// NETRUNNER TRAINING MODULE</div>
      <h1>BREACH<br/>PROTOCOL</h1>
      <div class="mm-list" id="mmList"></div>
    </div>
    <div class="mm-right">
      <div class="mm-stat"><span>LEVELS UNLOCKED</span><b>${Math.min(app.save.unlocked, MAX_LEVEL)}/${MAX_LEVEL}</b></div>
      <div class="mm-stat"><span>STARS</span><b>${stars}/${MAX_LEVEL * 3}</b></div>
      <div class="mm-stat"><span>PERK POINTS</span><b>${pointsAvailable(app.save)}</b></div>
      <div class="mm-stat"><span>TOTAL BEST SCORE</span><b>${bestTotal}</b></div>
      <div class="mm-note">Earn 1 perk point for every star. Spend them in the skill tree.</div>
    </div>`;
  const list = $('mmList');
  items.forEach((it, i) => {
    const row = el('div', `mm-item${i === app.sel ? ' sel' : ''}`,
      `<span class="mm-label">${it.label}</span><span class="mm-sub${it.badge ? ' badge' : ''}">${it.sub}</span>`);
    row.addEventListener('mouseenter', () => { if (app.sel !== i) { app.sel = i; sfx.hover(); renderMain(); } });
    row.addEventListener('click', () => { sfx.select(); it.act(); });
    list.append(row);
  });
}

function renderLevels() {
  const host = $('menuContent');
  host.className = 'menu-wrap';
  host.innerHTML = `
    <div class="menu-box">
      <div class="menu-tag">// SELECT LEVEL</div>
      <h1>BREACH PROTOCOL</h1>
      <div class="menu-sub">Upload every daemon to unlock the next level.</div>
      <div class="level-grid" id="levelGrid"></div>
      <div class="menu-detail" id="menuDetail"></div>
      <div class="menu-actions"><button class="cp-btn" id="startBtn">INITIATE BREACH <kbd>ENTER</kbd></button>
      <button class="cp-btn" id="backBtn">BACK <kbd>ESC</kbd></button></div>
    </div>`;
  const grid = $('levelGrid');
  for (let L = 1; L <= MAX_LEVEL; L++) {
    const locked = L > app.save.unlocked;
    const best = app.save.best[L];
    const stars = best ? '★'.repeat(best.stars) + '☆'.repeat(3 - best.stars) : locked ? 'LOCKED' : '☆☆☆';
    const cell = el('div', `lvl${locked ? ' locked' : ''}${app.sel === L - 1 ? ' sel' : ''}`,
      `${String(L).padStart(2, '0')}<small>${stars}</small>`);
    cell.addEventListener('mouseenter', () => { if (!locked && app.sel !== L - 1) { app.sel = L - 1; renderLevels(); sfx.hover(); } });
    cell.addEventListener('click', () => { if (!locked) startLevel(L); });
    grid.append(cell);
  }
  const L = app.sel + 1;
  const c = levelConfig(L);
  const m = computeMods(app.save.perks);
  const best = app.save.best[L];
  const plus = (n) => (n ? ` <span class="perk-plus">+${n}</span>` : '');
  $('menuDetail').innerHTML =
    `LEVEL <b>${L}</b> — matrix <b>${c.size}×${c.size}</b> · buffer <b>${c.bufferSize}</b>${plus(m.extraBuffer)} · time <b>${c.time}s</b>${plus(m.extraTime)} · ` +
    `daemons <b>${c.daemons.map((d) => d.length).join('/')}</b><br/>` +
    `Assists: hint <b>${c.assists.hint}</b>${plus(m.extraHint)} · undo <b>${c.assists.undo}</b>${plus(m.extraUndo)} · freeze <b>${c.assists.freeze}</b>${plus(m.extraFreeze)}` +
    (best ? ` &nbsp;|&nbsp; best score <b>${best.score}</b>` : '');
  $('startBtn').addEventListener('click', () => startLevel(L));
  $('backBtn').addEventListener('click', () => showScreen('main'));
}

function settingsRows() {
  const s = app.save.settings;
  const bar = (v) => `<span class="vol">${Array.from({ length: 10 }, (_, i) => `<i class="${i < v ? 'on' : ''}"></i>`).join('')}</span><b>${v * 10}%</b>`;
  return [
    { label: 'MUSIC VOLUME', value: bar(s.music), adjust: (d) => { s.music = clamp(s.music + d, 0, 10); } },
    { label: 'EFFECTS VOLUME', value: bar(s.sfx), adjust: (d) => { s.sfx = clamp(s.sfx + d, 0, 10); sfx.select(); } },
    {
      label: 'BREACH TIMER',
      value: s.timerMode === 'immediate' ? '◂ STARTS IMMEDIATELY ▸' : '◂ STARTS ON FIRST PICK (PATCH 2.0) ▸',
      adjust: () => { s.timerMode = s.timerMode === 'immediate' ? 'firstPick' : 'immediate'; },
    },
    {
      label: 'RESET PROGRESS',
      value: app.resetArmed ? '<span class="warn">PRESS ENTER AGAIN TO ERASE LEVELS, STARS AND PERKS</span>' : 'ENTER',
      act: () => {
        if (!app.resetArmed) { app.resetArmed = true; sfx.denied(); return; }
        resetProgress(app.save); app.resetArmed = false; sfx.daemonFail();
      },
    },
    { label: 'BACK', value: '', act: () => showScreen('main') },
  ];
}

function renderSettings() {
  const host = $('menuContent');
  host.className = 'menu-wrap';
  host.innerHTML = `<div class="menu-box settings-box"><div class="menu-tag">// CONFIGURATION</div><h1>SETTINGS</h1><div id="setList"></div></div>`;
  const list = $('setList');
  settingsRows().forEach((r, i) => {
    const row = el('div', `set-row${i === app.sel ? ' sel' : ''}`, `<span>${r.label}</span><span class="set-val">${r.value}</span>`);
    row.addEventListener('mouseenter', () => { if (app.sel !== i) { app.sel = i; sfx.hover(); renderSettings(); } });
    row.addEventListener('click', (e) => {
      if (r.adjust) {
        const rect = row.getBoundingClientRect();
        r.adjust(e.clientX > rect.left + rect.width * 0.75 ? 1 : -1);
        commitSettings();
      } else r.act();
      renderSettings();
    });
    list.append(row);
  });
}

function commitSettings() {
  writeSave(app.save);
  setVolumes(app.save.settings);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- skill tree
function skillGrid() {
  return BRANCHES.map((b) => b.perks.map((p) => p.id));
}

function renderSkills() {
  const host = $('skills');
  const grid = skillGrid();
  const flat = grid.flat();
  app.sel = clamp(app.sel, 0, flat.length - 1);
  const selId = flat[app.sel];
  const perks = app.save.perks;
  const avail = pointsAvailable(app.save);

  let rows = '';
  BRANCHES.forEach((b) => {
    const invested = b.perks.reduce((s, p) => s + (perks[p.id] || 0), 0);
    const maxTiers = b.perks.reduce((s, p) => s + p.tiers.length, 0);
    let cards = '';
    b.perks.forEach((p) => {
      const owned = perks[p.id] || 0;
      const cost = nextCost(perks, p.id);
      const pips = p.tiers.map((_, i) => `<i class="${i < owned ? 'on' : ''}"></i>`).join('');
      const state = cost == null ? 'maxed' : cost <= avail ? 'buyable' : 'locked';
      cards += `<div class="perk ${state}${p.id === selId ? ' sel' : ''}" data-id="${p.id}">
        <div class="perk-icon">${cost == null ? '✓' : '+'}</div>
        <div class="perk-name">${p.name.toUpperCase()}</div>
        <div class="perk-pips">${pips}</div>
        <div class="perk-cost">${cost == null ? 'MAXED' : `${cost} PT${cost > 1 ? 'S' : ''}`}</div>
      </div>`;
    });
    rows += `<div class="sk-row">
      <div class="sk-branch"><b>${invested}</b><span>${b.name}</span>
        <div class="sk-bar"><i style="width:${(invested / maxTiers) * 100}%"></i></div><small>${b.blurb}</small></div>
      <div class="sk-cards">${cards}</div></div>`;
  });

  const p = perkById(selId);
  const owned = perks[selId] || 0;
  const tierList = p.tiers.map((t, i) =>
    `<li class="${i < owned ? 'have' : i === owned ? 'next' : ''}">${i < owned ? '✓' : `${t.cost} PT`} &nbsp; ${t.text}</li>`).join('');

  host.innerHTML = `
    <div class="sk-top">
      <div class="sk-stat"><b>${avail}</b> PERK POINTS</div>
      <div class="sk-stat dim"><b>${pointsEarned(app.save)}</b> STARS EARNED</div>
      <div class="sk-tabs"><span class="tab">SKILL TREE</span></div>
      <div class="sk-stat right">NETRUNNER</div>
    </div>
    <div class="sk-title"><span>⊕</span> NETRUNNER PERKS</div>
    <div class="sk-head"><span>PERK BRANCH</span><span>PERKS</span></div>
    <div class="sk-rows">${rows}</div>
    <div class="sk-detail">
      <div class="sk-detail-name">${p.name.toUpperCase()}</div>
      <ul>${tierList}</ul>
    </div>
    <div class="sk-prompts">
      <span><kbd>ENTER</kbd> UNLOCK</span><span><kbd>R</kbd> REFUND ALL</span><span><kbd>ESC</kbd> BACK</span>
    </div>`;

  host.querySelectorAll('.perk').forEach((card) => {
    const idx = flat.indexOf(card.dataset.id);
    card.addEventListener('mouseenter', () => { if (app.sel !== idx) { app.sel = idx; sfx.hover(); renderSkills(); } });
    card.addEventListener('click', () => { app.sel = idx; buyPerk(); });
  });
}

function buyPerk() {
  const id = skillGrid().flat()[app.sel];
  const cost = nextCost(app.save.perks, id);
  if (cost == null || cost > pointsAvailable(app.save)) { sfx.denied(); renderSkills(); return; }
  app.save.perks[id] = (app.save.perks[id] || 0) + 1;
  writeSave(app.save);
  sfx.buy();
  renderSkills();
}

function refundPerks() {
  app.save.perks = {};
  writeSave(app.save);
  sfx.daemonFail();
  renderSkills();
}

function moveSkillSel(dr, dc) {
  const grid = skillGrid();
  let r = 0; let c = 0; let n = app.sel;
  for (r = 0; r < grid.length; r++) { if (n < grid[r].length) { c = n; break; } n -= grid[r].length; }
  r = clamp(r + dr, 0, grid.length - 1);
  c = clamp(c + dc, 0, grid[r].length - 1);
  const idx = grid.slice(0, r).reduce((s, row) => s + row.length, 0) + c;
  if (idx !== app.sel) { app.sel = idx; sfx.hover(); renderSkills(); }
}

// ---------------------------------------------------------------- breach
function startLevel(level, seed = randomSeed()) {
  startMusic();
  setMusicMode('breach');
  sfx.start();
  app.level = level;
  app.seed = seed;
  app.breach = new Breach(generatePuzzle(level, seed), {
    mods: computeMods(app.save.perks),
    timerMode: app.save.settings.timerMode,
  });
  app.puzzle = app.breach.puzzle;
  app.mode = 'breach';
  app.cursorActive = false;
  app.cursor = firstAvailableIndex();
  app.lastSecond = null;
  app.resultInfo = null;
  $('menu').classList.add('hidden');
  $('skills').classList.add('hidden');
  $('prompts').classList.remove('hidden');
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
  if (!app.breach || app.breach.over || !app.cursorActive || app.mode !== 'breach') return null;
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
      app.cursor = lineCells().findIndex((p) => p.r === h.r && p.c === h.c);
      app.cursorActive = true;
    }
  } else if (kind === 'undo') {
    ok = b.useUndo();
    if (ok) app.cursor = firstAvailableIndex(app.cursor);
  } else if (kind === 'freeze') {
    ok = b.useFreeze();
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
  if (!app.breach) return;
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
    if (cur) {
      const pv = el('div', 'line-band preview');
      if (b.axis === 'row') Object.assign(pv.style, { left: `${cur.c * PITCH}px`, width: `${PITCH}px`, top: `-8px`, height: `${p.size * PITCH + 26}px` });
      else Object.assign(pv.style, { left: `${-extra}px`, width: `${PANEL_W - 2}px`, top: `${cur.r * PITCH}px`, height: `${PITCH}px` });
      m.append(pv);
    }
  }

  const avail = new Set(b.available().map((q) => q.r * p.size + q.c));
  const scan = b.mods.scanner && !b.over ? new Set(b.advancingCells().map((q) => q.r * p.size + q.c)) : new Set();
  for (let r = 0; r < p.size; r++) {
    for (let c = 0; c < p.size; c++) {
      const code = p.grid[r][c];
      const cls = ['cell'];
      if (b.isUsed(r, c)) cls.push('used');
      else if (avail.has(r * p.size + c)) cls.push('avail');
      else if (!b.over) cls.push('off');
      if (scan.has(r * p.size + c)) cls.push('scan');
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
    ['freeze', 'FREEZE', '3', `Stops the timer for ${b.mods.freezeSeconds}s`],
  ];
  for (const [key, label, k, help] of items) {
    const n = b.assists[key];
    const a = el('div', `assist${n <= 0 ? ' empty' : ''}`,
      `<span class="count">${n}</span><div>${label}<kbd>${k}</kbd><small>${help}</small></div>`);
    a.addEventListener('click', () => useAssist(key));
    host.append(a);
  }
  const pct = Math.round(b.mods.assistPenalty * 100);
  host.append(el('div', 'assist-note', `Each assist used lowers the score by ${pct}%.${b.assistsUsed ? ` Used: <b>${b.assistsUsed}</b>` : ''}`));
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
  panel.classList.toggle('waiting', !b.started && !b.over && app.mode === 'breach');
}

function renderPrompts() {
  const host = $('prompts');
  const P = (keys, label) => `<span class="p">${keys.map((k) => `<kbd>${k}</kbd>`).join('')} ${label}</span>`;
  const sound = P(['M'], isMuted() ? 'SOUND OFF' : 'SOUND');
  let html = '';
  if (app.mode === 'breach') {
    html = P(['←', '→', '↑', '↓'], 'NAVIGATION') + P(['ENTER', 'F'], 'SELECT CODE') + P(['1', '2', '3'], 'ASSISTS') + sound + P(['ESC'], 'CLOSE');
  } else if (app.mode === 'result') {
    html = P(['R'], 'RETRY') + P(['N'], 'NEW PUZZLE') + P(['ENTER'], 'CONFIRM') + sound + P(['ESC'], 'MENU');
  } else if (app.mode === 'settings') {
    html = P(['↑', '↓'], 'SELECT') + P(['←', '→'], 'CHANGE') + P(['ESC'], 'BACK');
  } else {
    html = P(['↑', '↓'], 'SELECT') + P(['ENTER'], 'CONFIRM') + sound + P(['ESC'], 'BACK');
  }
  host.innerHTML = html;
}

// ---------------------------------------------------------------- results
function endBreach() {
  const b = app.breach;
  app.mode = 'result';
  setMusicMode('result');
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
  const info = app.resultInfo;
  const host = $('scorePanel');
  host.classList.remove('hidden');
  const row = (k, v, cls = '') => `<div class="score-row ${cls}"><span>${k}</span><span>${v}</span></div>`;
  const stars = [0, 1, 2].map((i) => `<span class="${i < r.stars ? 'on' : 'off'}">★</span>`).join('');
  const best = app.save.best[app.level];
  const notes = [];
  if (info.isBest && r.total > 0) notes.push('NEW BEST'); else notes.push(`BEST ${best?.score ?? 0}`);
  if (info.unlockedNew) notes.push(`LEVEL ${app.level + 1} UNLOCKED`);
  if (info.newStars) notes.push(`+${info.newStars} PERK POINT${info.newStars > 1 ? 'S' : ''}`);
  host.innerHTML =
    `<div class="score-row"><span class="stars">${stars}</span><span class="best">${notes.join(' · ')}</span></div>` +
    row('Daemons uploaded', `${r.uploaded}/${app.puzzle.daemons.length} · +${r.daemonPoints}`) +
    row(`Time bonus (${r.secondsLeft.toFixed(1)}s left)`, `+${r.timeBonus}`) +
    row(`Efficiency (${r.unused} unused slots)`, `+${r.efficiency}`) +
    row('All daemons bonus', `+${r.allBonus}`) +
    row(`Optimal path (${b.picks.length} picks vs best ${app.puzzle.optimal.length})`, `+${r.optimalBonus}`) +
    (b.assistsUsed ? row(`Assists used (${b.assistsUsed})`, `×${r.multiplier.toFixed(2)}`) : '') +
    row('SCORE', r.total, 'total');
}

function resultButtons() {
  const canNext = app.save.unlocked > app.level && app.level < MAX_LEVEL;
  return [
    { label: 'RETRY', act: () => startLevel(app.level, app.seed) },
    { label: 'NEW PUZZLE', act: () => startLevel(app.level) },
    { label: 'NEXT LEVEL', act: () => startLevel(app.level + 1), disabled: !canNext, green: true },
    { label: 'EXIT INTERFACE', act: () => showScreen('main') },
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
const isUp = (k) => k === 'ArrowUp' || k === 'w' || k === 'W';
const isDown = (k) => k === 'ArrowDown' || k === 's' || k === 'S';
const isLeft = (k) => k === 'ArrowLeft' || k === 'a' || k === 'A';
const isRight = (k) => k === 'ArrowRight' || k === 'd' || k === 'D';
const isOk = (k) => k === 'Enter' || k === ' ' || k === 'f' || k === 'F';

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if ((k === 'm' || k === 'M') && app.mode !== 'settings') { toggleMute(); renderPrompts(); return; }
  if (k.startsWith('Arrow') || k === ' ') e.preventDefault();

  switch (app.mode) {
    case 'main': {
      const items = mainItems();
      if (isUp(k) || isDown(k)) { app.sel = (app.sel + (isUp(k) ? -1 : 1) + items.length) % items.length; sfx.hover(); renderMain(); }
      else if (isOk(k)) { sfx.select(); items[app.sel].act(); }
      return;
    }
    case 'levels': {
      let s = app.sel;
      if (isRight(k)) s++;
      else if (isLeft(k)) s--;
      else if (isDown(k)) s += 10;
      else if (isUp(k)) s -= 10;
      else if (isOk(k)) { startLevel(app.sel + 1); return; }
      else if (k === 'Escape' || k === 'Backspace') { showScreen('main'); return; }
      else return;
      s = clamp(s, 0, Math.min(app.save.unlocked, MAX_LEVEL) - 1);
      if (s !== app.sel) { app.sel = s; sfx.hover(); renderLevels(); }
      return;
    }
    case 'settings': {
      const rows = settingsRows();
      if (isUp(k) || isDown(k)) { app.sel = (app.sel + (isUp(k) ? -1 : 1) + rows.length) % rows.length; app.resetArmed = false; sfx.hover(); }
      else if ((isLeft(k) || isRight(k)) && rows[app.sel].adjust) { rows[app.sel].adjust(isLeft(k) ? -1 : 1); commitSettings(); }
      else if (isOk(k)) { if (rows[app.sel].act) rows[app.sel].act(); else { rows[app.sel].adjust(1); commitSettings(); } }
      else if (k === 'Escape' || k === 'Backspace') { showScreen('main'); return; }
      else return;
      if (app.mode === 'settings') renderSettings();
      return;
    }
    case 'skills': {
      if (isUp(k)) moveSkillSel(-1, 0);
      else if (isDown(k)) moveSkillSel(1, 0);
      else if (isLeft(k)) moveSkillSel(0, -1);
      else if (isRight(k)) moveSkillSel(0, 1);
      else if (isOk(k)) buyPerk();
      else if (k === 'r' || k === 'R') refundPerks();
      else if (k === 'Escape' || k === 'Backspace') showScreen('main');
      return;
    }
    case 'breach': {
      const b = app.breach;
      const along = b.axis === 'row' ? [isLeft, isRight] : [isUp, isDown];
      const across = b.axis === 'row' ? [isUp, isDown] : [isLeft, isRight];
      if (along[0](k) || across[0](k)) moveCursor(-1);
      else if (along[1](k) || across[1](k)) moveCursor(1);
      else if (isOk(k)) {
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
    case 'result': {
      const btns = resultButtons();
      if (isLeft(k) || isRight(k) || isUp(k) || isDown(k)) {
        const dir = isRight(k) || isDown(k) ? 1 : -1;
        let i = app.resultFocus;
        do { i = (i + dir + btns.length) % btns.length; } while (btns[i].disabled);
        app.resultFocus = i; sfx.hover(); renderExitButtons();
      } else if (isOk(k)) { e.preventDefault(); btns[app.resultFocus].act(); }
      else if (k === 'r' || k === 'R') startLevel(app.level, app.seed);
      else if (k === 'n' || k === 'N') startLevel(app.level);
      else if (k === 'Escape') showScreen('main');
    }
  }
});

// ---------------------------------------------------------------- loop
function frame(t) {
  const dt = app.lastFrame ? Math.min(0.1, (t - app.lastFrame) / 1000) : 0;
  app.lastFrame = t;
  const b = app.breach;
  if (app.mode === 'breach' && b) {
    b.tick(dt);
    renderTimer();
    if (b.started && b.timeLeft <= 10 && b.frozenFor <= 0) {
      const s = Math.ceil(b.timeLeft);
      if (s !== app.lastSecond) { app.lastSecond = s; sfx.tick(); }
    }
    if (b.over) endBreach();
  }
  requestAnimationFrame(frame);
}

fitStage();
paintBackground();
// A sample puzzle sits behind the menus so the interface is visible from the start.
app.breach = new Breach(generatePuzzle(1, 1));
app.puzzle = app.breach.puzzle;
layoutPanels();
renderAll();
showScreen('main');
requestAnimationFrame(frame);

// Exposed for automated UI checks.
window.__cyberdeck = app;
