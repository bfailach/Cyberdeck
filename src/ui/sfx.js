// Interface sound effects, synthesized with WebAudio.
// Deliberately non-melodic: no beeps, no arpeggios, no square waves. Everything is built from
// filtered noise (clicks, whooshes, data grains), resonant "thock" transients and sub-bass,
// with a short room reverb and stereo spread — closer to a netrunner HUD than to an arcade cabinet.

export function createSfx(ctx, out, clock = () => ctx.currentTime) {
  const now = clock;

  const noiseBuf = (() => {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();

  // Crushed noise for digital-sounding glitches (sample-and-hold every few samples).
  const crushBuf = (() => {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    let v = 0;
    for (let i = 0; i < d.length; i++) { if (i % 9 === 0) v = Math.round((Math.random() * 2 - 1) * 4) / 4; d[i] = v; }
    return b;
  })();

  const verb = ctx.createConvolver();
  verb.buffer = (() => {
    const len = Math.floor(ctx.sampleRate * 0.9);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
    }
    return b;
  })();
  const verbGain = ctx.createGain(); verbGain.gain.value = 0.22;
  const verbTone = ctx.createBiquadFilter(); verbTone.type = 'lowpass'; verbTone.frequency.value = 5000;
  verb.connect(verbTone).connect(verbGain).connect(out);

  function route(node, { pan = 0, wet = 0 }) {
    let last = node;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; last.connect(p); last = p; }
    last.connect(out);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; last.connect(w).connect(verb); }
  }

  /** Filtered noise with an attack/decay envelope; optional filter sweep. */
  function noise({ at = 0, dur = 0.03, attack = 0.002, freq = 3000, to = null, q = 1, type = 'bandpass', vol = 0.2, pan = 0, wet = 0, buf = noiseBuf }) {
    const t = now() + at;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    src.connect(f).connect(g);
    route(g, { pan, wet });
    src.start(t, Math.random() * 0.8); src.stop(t + attack + dur + 0.05);
  }

  /** Sub-bass body (felt more than heard). */
  function sub({ at = 0, from = 110, to = 40, dur = 0.25, attack = 0.004, vol = 0.4 }) {
    const t = now() + at;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + attack + dur + 0.05);
  }

  /** Short resonant click: a damped "thock" with no recognisable pitch. */
  function thock({ at = 0, freq = 1800, vol = 0.25, pan = 0 }) {
    noise({ at, dur: 0.018, freq, q: 9, vol, pan });
    noise({ at, dur: 0.01, freq: 6000, q: 0.7, type: 'highpass', vol: vol * 0.35, pan });
  }

  /** Cloud of tiny noise grains, like data being read. */
  function grains({ at = 0, count = 12, spread = 0.25, lo = 2500, hi = 9000, vol = 0.07, wet = 0.2 }) {
    for (let i = 0; i < count; i++) {
      noise({
        at: at + Math.random() * spread, dur: 0.004 + Math.random() * 0.008,
        freq: lo + Math.random() * (hi - lo), q: 6, vol: vol * (0.5 + Math.random() * 0.5),
        pan: Math.random() * 1.4 - 0.7, wet,
      });
    }
  }

  /** Digital stutter made of crushed-noise slices. */
  function stutter({ at = 0, slices = 6, gap = 0.032, vol = 0.16, freq = 1800 }) {
    for (let i = 0; i < slices; i++) {
      noise({ at: at + i * gap, dur: 0.016, freq: freq * (0.6 + Math.random() * 0.9), q: 1.4, vol: vol * (1 - i / (slices * 1.6)), buf: crushBuf, pan: (i % 2 ? 0.3 : -0.3) });
    }
  }

  return {
    // Cursor moves onto a cell or option: barely-there tick.
    hover() {
      noise({ dur: 0.008, freq: 7500, q: 2.5, vol: 0.1 });
    },
    // Code picked: tactile thock with low body and a puff of data.
    select() {
      thock({ freq: 1600, vol: 0.3 });
      sub({ from: 130, to: 55, dur: 0.1, vol: 0.32 });
      grains({ at: 0.012, count: 5, spread: 0.06, vol: 0.05, wet: 0.15 });
    },
    // Not allowed: two dull low knocks.
    denied() {
      noise({ dur: 0.05, freq: 420, q: 1.2, type: 'lowpass', vol: 0.3 });
      sub({ from: 75, to: 50, dur: 0.08, vol: 0.3 });
      noise({ at: 0.085, dur: 0.05, freq: 380, q: 1.2, type: 'lowpass', vol: 0.24 });
      sub({ at: 0.085, from: 70, to: 45, dur: 0.08, vol: 0.24 });
    },
    // Daemon installed: rising whoosh through data grains, landing on a soft lock-in.
    upload() {
      noise({ dur: 0.28, attack: 0.12, freq: 500, to: 7000, q: 3, vol: 0.13, wet: 0.35 });
      grains({ at: 0.04, count: 18, spread: 0.3, vol: 0.06, wet: 0.3 });
      thock({ at: 0.36, freq: 2400, vol: 0.2 });
      sub({ at: 0.36, from: 90, to: 50, dur: 0.22, vol: 0.28 });
    },
    // Daemon lost: crushed stutter falling into a sub drop.
    daemonFail() {
      stutter({ slices: 6, vol: 0.17 });
      noise({ at: 0.05, dur: 0.35, freq: 2500, to: 180, q: 1, type: 'lowpass', vol: 0.14, wet: 0.2 });
      sub({ at: 0.03, from: 85, to: 32, dur: 0.35, vol: 0.32 });
    },
    // Breach complete: deep swell, airy rise, wide shimmer tail.
    success() {
      sub({ from: 48, to: 62, dur: 0.9, attack: 0.25, vol: 0.4 });
      noise({ dur: 0.55, attack: 0.3, freq: 300, to: 9000, q: 1.2, vol: 0.13, wet: 0.4 });
      grains({ at: 0.1, count: 28, spread: 0.6, vol: 0.05, wet: 0.45 });
      thock({ at: 0.62, freq: 2000, vol: 0.22 });
      noise({ at: 0.62, dur: 0.9, freq: 7000, q: 0.7, type: 'highpass', vol: 0.05, wet: 0.6 });
    },
    // Breach failed: heavy crushed burst, collapsing filter, long sub drop.
    fail() {
      stutter({ slices: 9, gap: 0.03, vol: 0.2, freq: 1200 });
      noise({ dur: 0.8, freq: 3000, to: 90, q: 1.5, type: 'lowpass', vol: 0.2, buf: crushBuf, wet: 0.3 });
      sub({ at: 0.02, from: 70, to: 28, dur: 0.8, vol: 0.45 });
    },
    // Last 10 seconds: muted mechanical tick.
    tick() {
      noise({ dur: 0.012, freq: 1400, q: 5, vol: 0.2 });
      sub({ from: 95, to: 70, dur: 0.04, vol: 0.12 });
    },
    // Hint / undo: a quick scan of data grains sweeping across the stereo field.
    assist() {
      for (let i = 0; i < 10; i++) {
        noise({ at: i * 0.018, dur: 0.008, freq: 2500 + i * 550, q: 7, vol: 0.07, pan: -0.8 + i * 0.16, wet: 0.2 });
      }
      thock({ at: 0.2, freq: 2200, vol: 0.14 });
    },
    // Timer frozen: cold downward whoosh with a long airy tail.
    freeze() {
      noise({ dur: 0.7, attack: 0.04, freq: 10000, to: 400, q: 1.8, type: 'lowpass', vol: 0.16, wet: 0.5 });
      noise({ at: 0.05, dur: 1.0, freq: 8000, q: 0.7, type: 'highpass', vol: 0.04, wet: 0.6 });
      sub({ from: 60, to: 40, dur: 0.4, vol: 0.2 });
    },
    // Breach opens: power-up thump, downward sweep and a burst of data.
    start() {
      sub({ from: 140, to: 38, dur: 0.45, vol: 0.45 });
      noise({ dur: 0.35, freq: 6000, to: 500, q: 2.5, vol: 0.13, wet: 0.3 });
      grains({ at: 0.08, count: 22, spread: 0.35, vol: 0.05, wet: 0.3 });
      stutter({ at: 0.38, slices: 3, vol: 0.08, freq: 2600 });
    },
    // Perk unlocked: firm thock and a short swell.
    buy() {
      thock({ freq: 1900, vol: 0.28 });
      sub({ from: 70, to: 55, dur: 0.3, attack: 0.03, vol: 0.32 });
      noise({ dur: 0.25, attack: 0.05, freq: 800, to: 5000, q: 2, vol: 0.08, wet: 0.35 });
    },
  };
}
