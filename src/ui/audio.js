// All audio is synthesized live with WebAudio: no audio files, no licensing questions.
// Sound effects go to sfxBus, the soundtrack to musicBus; both have their own volume.
import { createTrack } from './music.js';
import { createSfx } from './sfx.js';

let ctx = null;
let master, sfxBus, musicBus, musicFilter;
let track = null;
let customEl = null; // <audio> element for a player-supplied track
let useCustom = false;
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
    connectCustom();
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

let fx = null;
const play = (name) => () => {
  if (muted || volumes.sfx === 0) return;
  ensure();
  if (!fx) fx = createSfx(ctx, sfxBus);
  fx[name]();
};

export const sfx = Object.fromEntries(
  ['hover', 'select', 'denied', 'upload', 'daemonFail', 'success', 'fail', 'tick', 'assist', 'freeze', 'start', 'buy']
    .map((n) => [n, play(n)]),
);

/** Starts the soundtrack (call from a user gesture; browsers block audio before one). */
export function startMusic() {
  const c = ensure();
  if (useCustom && customEl) {
    if (track) { track.stop(); track = null; }
    if (customEl.paused) customEl.play().catch(() => {});
    return;
  }
  if (customEl) customEl.pause();
  if (!track) {
    track = createTrack(c, musicBus);
    track.start();
  }
}

/** Sets (or clears) a player-supplied music file. It plays on a loop through the same volume/filter chain. */
export function setCustomMusic(blob) {
  if (customEl) { customEl.pause(); URL.revokeObjectURL(customEl.src); customEl = null; }
  if (!blob) return;
  customEl = new Audio(URL.createObjectURL(blob));
  customEl.loop = true;
  if (ctx) connectCustom();
}

function connectCustom() {
  if (customEl && !customEl._wired) {
    ctx.createMediaElementSource(customEl).connect(musicBus);
    customEl._wired = true;
  }
}

/** Chooses between the built-in track and the custom file; restarts music if it was playing. */
export function useCustomMusic(on) {
  useCustom = !!on && !!customEl;
  if (!ctx) return;
  connectCustom();
  startMusic();
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
