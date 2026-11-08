// Interface sound effects, synthesized with WebAudio.
// Direction: serious, dark, cinematic. No melody, no bit-crushing, no bright chirps.
// Built from muffled mechanical clicks, low filtered-noise swells, metallic resonances
// (high-Q noise at inharmonic frequencies, so they read as material rather than notes),
// warm sub-bass and a dark reverb tail.

export function createSfx(ctx, out, clock = () => ctx.currentTime) {
  const now = clock;

  const noiseBuf = (() => {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();

  // Gentle warmth on the low end.
  const warm = ctx.createWaveShaper();
  warm.curve = (() => {
    const n = 1024; const c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); }
    return c;
  })();
  warm.connect(out);

  // Dark, fairly long room.
  const verb = ctx.createConvolver();
  verb.buffer = (() => {
    const len = Math.floor(ctx.sampleRate * 1.6);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    }
    return b;
  })();
  const verbTone = ctx.createBiquadFilter(); verbTone.type = 'lowpass'; verbTone.frequency.value = 2600;
  const verbGain = ctx.createGain(); verbGain.gain.value = 0.3;
  verb.connect(verbTone).connect(verbGain).connect(out);

  function route(node, { pan = 0, wet = 0, toWarm = false }) {
    let last = node;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; last.connect(p); last = p; }
    last.connect(toWarm ? warm : out);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; last.connect(w).connect(verb); }
  }

  function shape(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  }

  /** Filtered noise with envelope and optional sweep. */
  function noise({ at = 0, dur = 0.03, attack = 0.002, freq = 1500, to = null, q = 0.8, type = 'lowpass', vol = 0.2, pan = 0, wet = 0 }) {
    const t = now() + at;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
    const g = ctx.createGain(); shape(g, t, vol, attack, dur);
    src.connect(f).connect(g);
    route(g, { pan, wet });
    src.start(t, Math.random() * 0.8); src.stop(t + attack + dur + 0.05);
  }

  /** Sub-bass body through the warm saturator. */
  function sub({ at = 0, from = 90, to = 40, dur = 0.25, attack = 0.005, vol = 0.4 }) {
    const t = now() + at;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
    const g = ctx.createGain(); shape(g, t, vol, attack, dur);
    o.connect(g);
    route(g, { toWarm: true });
    o.start(t); o.stop(t + attack + dur + 0.05);
  }

  /** Metallic resonance: noise excites a few high-Q band-passes at inharmonic frequencies. */
  function metal({ at = 0, base = 620, dur = 0.25, vol = 0.12, wet = 0.4, pan = 0 }) {
    [1, 1.47, 2.09, 2.83].forEach((r, i) => {
      noise({ at, dur: dur * (1 - i * 0.18), attack: 0.002, freq: base * r, q: 38, type: 'bandpass', vol: vol * (1 - i * 0.2) * 3.2, pan, wet });
    });
  }

  /** Muffled mechanical click. */
  function clunk({ at = 0, vol = 0.3, freq = 1100 }) {
    noise({ at, dur: 0.028, freq, q: 1.2, vol });
    noise({ at, dur: 0.008, freq: 3200, q: 0.7, vol: vol * 0.25 });
  }

  return {
    // Cursor moves: soft, dark tick.
    hover() {
      noise({ dur: 0.007, freq: 2400, q: 1, vol: 0.13 });
    },
    // Code picked: mechanical clunk with weight and a faint metallic ring.
    select() {
      clunk({ vol: 0.34 });
      sub({ from: 95, to: 48, dur: 0.14, vol: 0.34 });
      metal({ at: 0.004, base: 780, dur: 0.14, vol: 0.035, wet: 0.25 });
    },
    // Not allowed: dull, muffled double knock.
    denied() {
      noise({ dur: 0.06, freq: 260, q: 1, vol: 0.32 });
      sub({ from: 62, to: 44, dur: 0.1, vol: 0.3 });
      noise({ at: 0.1, dur: 0.06, freq: 230, q: 1, vol: 0.26 });
      sub({ at: 0.1, from: 58, to: 40, dur: 0.1, vol: 0.24 });
    },
    // Daemon installed: low airy swell that locks in with a metallic latch.
    upload() {
      noise({ dur: 0.3, attack: 0.18, freq: 280, to: 2600, q: 2.2, type: 'bandpass', vol: 0.16, wet: 0.45 });
      clunk({ at: 0.42, vol: 0.28, freq: 900 });
      metal({ at: 0.42, base: 540, dur: 0.45, vol: 0.05, wet: 0.5 });
      sub({ at: 0.42, from: 70, to: 42, dur: 0.35, vol: 0.34 });
    },
    // Daemon lost: signal drops out and powers down.
    daemonFail() {
      [0, 0.06, 0.13].forEach((a, i) => noise({ at: a, dur: 0.04, freq: 700 - i * 150, q: 1.5, vol: 0.2 - i * 0.04 }));
      noise({ at: 0.05, dur: 0.6, freq: 1400, to: 70, q: 1.8, vol: 0.16, wet: 0.3 });
      sub({ at: 0.03, from: 70, to: 26, dur: 0.6, vol: 0.38 });
    },
    // Breach complete: deep swell rising into a heavy lock with a long dark tail.
    success() {
      sub({ from: 38, to: 55, dur: 0.75, attack: 0.35, vol: 0.38 });
      noise({ dur: 0.45, attack: 0.4, freq: 200, to: 3500, q: 1.6, type: 'bandpass', vol: 0.15, wet: 0.5 });
      clunk({ at: 0.8, vol: 0.36, freq: 950 });
      sub({ at: 0.8, from: 85, to: 36, dur: 0.6, vol: 0.45 });
      metal({ at: 0.8, base: 470, dur: 0.9, vol: 0.06, wet: 0.6 });
    },
    // Breach failed: heavy low impact and a long collapsing rumble.
    fail() {
      noise({ dur: 0.12, freq: 900, q: 1, vol: 0.38 });
      sub({ from: 75, to: 22, dur: 1.1, vol: 0.5 });
      noise({ at: 0.04, dur: 1.2, freq: 900, to: 50, q: 2.5, vol: 0.2, wet: 0.45 });
      metal({ at: 0.02, base: 330, dur: 0.6, vol: 0.04, wet: 0.6 });
    },
    // Last 10 seconds: low, restrained clock tick.
    tick() {
      noise({ dur: 0.012, freq: 1100, q: 2, type: 'bandpass', vol: 0.22 });
      sub({ from: 70, to: 55, dur: 0.05, vol: 0.14 });
    },
    // Hint / undo: a slow dark scan sweeping across the stereo field.
    assist() {
      for (let i = 0; i < 6; i++) {
        noise({ at: i * 0.035, dur: 0.02, freq: 700 + i * 260, q: 4, type: 'bandpass', vol: 0.1, pan: -0.6 + i * 0.24, wet: 0.3 });
      }
      clunk({ at: 0.24, vol: 0.2, freq: 1000 });
    },
    // Timer frozen: cold, low whoosh and a long hiss tail.
    freeze() {
      noise({ dur: 0.8, attack: 0.06, freq: 4000, to: 180, q: 1.6, vol: 0.2, wet: 0.55 });
      sub({ from: 55, to: 35, dur: 0.6, vol: 0.24 });
      metal({ at: 0.05, base: 900, dur: 0.7, vol: 0.025, wet: 0.7 });
    },
    // Breach opens: heavy power-on with a falling sweep.
    start() {
      sub({ from: 110, to: 32, dur: 0.6, vol: 0.48 });
      noise({ dur: 0.5, freq: 3000, to: 120, q: 2, vol: 0.18, wet: 0.4 });
      clunk({ at: 0.02, vol: 0.3, freq: 800 });
      metal({ at: 0.02, base: 410, dur: 0.6, vol: 0.045, wet: 0.6 });
    },
    // Perk unlocked: firm latch with a low swell.
    buy() {
      clunk({ vol: 0.34, freq: 1000 });
      sub({ from: 65, to: 45, dur: 0.4, attack: 0.02, vol: 0.36 });
      metal({ base: 600, dur: 0.4, vol: 0.05, wet: 0.5 });
    },
  };
}
