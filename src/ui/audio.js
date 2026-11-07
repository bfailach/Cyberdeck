// All sounds are synthesized with WebAudio — no audio files needed.
let ctx = null;
let master = null;
let musicGain = null;
let musicNodes = null;
let muted = false;

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq = 440, type = 'square', dur = 0.08, vol = 0.15, at = 0, slide = 0 }) {
  if (muted) return;
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
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.15, vol = 0.12, at = 0, cutoff = 1200 }) {
  if (muted) return;
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
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  hover: () => tone({ freq: 2100, type: 'sine', dur: 0.025, vol: 0.04 }),
  select: () => { tone({ freq: 880, dur: 0.05, vol: 0.08 }); tone({ freq: 1320, dur: 0.06, vol: 0.07, at: 0.04 }); },
  denied: () => tone({ freq: 160, type: 'sawtooth', dur: 0.12, vol: 0.08 }),
  upload: () => [660, 880, 1100, 1320].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.1, at: i * 0.06 })),
  daemonFail: () => { tone({ freq: 220, type: 'sawtooth', dur: 0.3, vol: 0.1, slide: -140 }); noise({ dur: 0.2, vol: 0.06 }); },
  success: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.35, vol: 0.09, at: i * 0.08 })),
  fail: () => { [392, 311, 233].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.3, vol: 0.09, at: i * 0.14 })); noise({ dur: 0.5, vol: 0.08, at: 0.1 }); },
  tick: () => tone({ freq: 1500, type: 'square', dur: 0.03, vol: 0.05 }),
  assist: () => { tone({ freq: 1000, type: 'sine', dur: 0.2, vol: 0.08, slide: 800 }); },
  freeze: () => { tone({ freq: 2400, type: 'sine', dur: 0.5, vol: 0.06, slide: -1800 }); noise({ dur: 0.4, vol: 0.04, cutoff: 6000 }); },
  start: () => { noise({ dur: 0.25, vol: 0.07, cutoff: 3000 }); tone({ freq: 110, type: 'sawtooth', dur: 0.4, vol: 0.08, slide: 220 }); },
};

/** Low ambient pad + sparse arpeggio, generated live. */
export function startMusic() {
  const c = ensure();
  if (musicNodes) return;
  musicGain = c.createGain();
  musicGain.gain.value = muted ? 0 : 0.18;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 520; filter.Q.value = 4;
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 0.07; lfoGain.gain.value = 260;
  lfo.connect(lfoGain).connect(filter.frequency);
  filter.connect(musicGain).connect(master);

  const oscs = [55, 55.4, 82.4, 110.3].map((f, i) => {
    const o = c.createOscillator();
    o.type = i < 2 ? 'sawtooth' : 'triangle';
    o.frequency.value = f;
    const g = c.createGain(); g.gain.value = i < 2 ? 0.35 : 0.2;
    o.connect(g).connect(filter);
    o.start();
    return o;
  });
  lfo.start();

  // Arpeggio: A minor-ish pentatonic pattern, one note every 0.375s.
  const notes = [220, 261.6, 329.6, 392, 440, 392, 329.6, 293.7];
  let step = 0;
  const arp = setInterval(() => {
    if (muted || !musicGain) return;
    if (Math.random() < 0.35) { step++; return; }
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1400;
    o.type = 'square';
    o.frequency.value = notes[step % notes.length] * (step % 16 < 8 ? 1 : 1.5);
    g.gain.setValueAtTime(0.035, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(f).connect(g).connect(musicGain);
    o.start(t); o.stop(t + 0.32);
    step++;
  }, 375);
  musicNodes = { oscs, lfo, arp };
}

export function toggleMute() {
  muted = !muted;
  if (musicGain) musicGain.gain.value = muted ? 0 : 0.18;
  return muted;
}

export const isMuted = () => muted;
