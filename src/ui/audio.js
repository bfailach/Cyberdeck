// All audio is synthesized live with WebAudio: no audio files, no licensing questions.
// Sound effects go to sfxBus, the soundtrack to musicBus; both have their own volume.
import { createTrack } from './music.js';

let ctx = null;
let master, sfxBus, musicBus, musicFilter;
let track = null;
let muted = false;
let volumes = { music: 6, sfx: 8 };

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 3;
    master = ctx.createGain();
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass'; musicFilter.frequency.value = 1200; musicFilter.Q.value = 0.7;
    musicBus = ctx.createGain();
    musicBus.connect(musicFilter).connect(master);
    applyVolumes();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  sfxBus.gain.setTargetAtTime(muted ? 0 : (volumes.sfx / 10) * 0.6, t, 0.05);
  musicBus.gain.setTargetAtTime(muted ? 0 : (volumes.music / 10) * 0.55, t, 0.05);
}

export function setVolumes(v) {
  volumes = { ...volumes, ...v };
  applyVolumes();
}

function tone({ freq = 440, type = 'square', dur = 0.08, vol = 0.15, at = 0, slide = 0 }) {
  if (muted || volumes.sfx === 0) return;
  const c = ensure();
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.12, at = 0, cutoff = 1200 }) {
  if (muted || volumes.sfx === 0) return;
  const c = ensure();
  const t = c.currentTime + at;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t);
}

export const sfx = {
  hover: () => tone({ freq: 2100, type: 'sine', dur: 0.025, vol: 0.05 }),
  select: () => { tone({ freq: 880, dur: 0.05, vol: 0.09 }); tone({ freq: 1320, dur: 0.06, vol: 0.08, at: 0.04 }); },
  denied: () => tone({ freq: 160, type: 'sawtooth', dur: 0.12, vol: 0.1 }),
  upload: () => [660, 880, 1100, 1320].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.12, at: i * 0.06 })),
  daemonFail: () => { tone({ freq: 220, type: 'sawtooth', dur: 0.3, vol: 0.12, slide: -140 }); noise({ dur: 0.2, vol: 0.08 }); },
  success: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.35, vol: 0.1, at: i * 0.08 })),
  fail: () => { [392, 311, 233].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.3, vol: 0.1, at: i * 0.14 })); noise({ dur: 0.5, vol: 0.1, at: 0.1 }); },
  tick: () => tone({ freq: 1500, type: 'square', dur: 0.03, vol: 0.06 }),
  assist: () => tone({ freq: 1000, type: 'sine', dur: 0.2, vol: 0.1, slide: 800 }),
  freeze: () => { tone({ freq: 2400, type: 'sine', dur: 0.5, vol: 0.08, slide: -1800 }); noise({ dur: 0.4, vol: 0.05, cutoff: 6000 }); },
  start: () => { noise({ dur: 0.25, vol: 0.09, cutoff: 3000 }); tone({ freq: 110, type: 'sawtooth', dur: 0.4, vol: 0.1, slide: 220 }); },
  buy: () => [440, 660, 990].forEach((f, i) => tone({ freq: f, type: 'square', dur: 0.09, vol: 0.08, at: i * 0.05 })),
};

/** Starts the soundtrack (call from a user gesture; browsers block audio before one). */
export function startMusic() {
  const c = ensure();
  if (!track) {
    track = createTrack(c, musicBus);
    track.start();
  }
}

/** 'menu' muffles the soundtrack, 'breach' opens it up. */
export function setMusicMode(mode) {
  if (!ctx) return;
  const f = mode === 'breach' ? 16000 : mode === 'result' ? 3000 : 1100;
  musicFilter.frequency.setTargetAtTime(f, ctx.currentTime, 0.6);
}

export function toggleMute() {
  muted = !muted;
  applyVolumes();
  return muted;
}

export const isMuted = () => muted;
