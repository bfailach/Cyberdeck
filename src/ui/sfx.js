// Interface sound effects, synthesized with WebAudio.
// Aimed at a "netrunner HUD" feel rather than arcade beeps: short filtered-noise ticks, soft sine
// blips, sub-bass thumps, band-pass data sweeps and stuttering glitches, with light saturation.

export function createSfx(ctx, out, clock = () => ctx.currentTime) {
  const noiseBuf = (() => {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();

  // Gentle saturation for grit.
  const shaper = ctx.createWaveShaper();
  shaper.curve = (() => {
    const n = 1024; const c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    return c;
  })();
  shaper.connect(out);

  // Short metallic room for tails.
  const verb = ctx.createConvolver();
  verb.buffer = (() => {
    const len = Math.floor(ctx.sampleRate * 0.6);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    }
    return b;
  })();
  const verbGain = ctx.createGain(); verbGain.gain.value = 0.18;
  verb.connect(verbGain).connect(out);

  const now = clock;

  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** Band-passed noise burst. */
  function noise({ at = 0, dur = 0.03, freq = 4000, q = 1.5, vol = 0.2, type = 'bandpass', sweepTo = null, wet = false }) {
    const t = now() + at;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); env(g, t, vol, 0.002, dur);
    src.connect(f).connect(g).connect(shaper);
    if (wet) g.connect(verb);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  /** Soft oscillator blip. */
  function blip({ at = 0, freq = 2000, to = null, dur = 0.05, vol = 0.1, type = 'sine', wet = false }) {
    const t = now() + at;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); env(g, t, vol, 0.003, dur);
    o.connect(g).connect(shaper);
    if (wet) g.connect(verb);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** Sub-bass thump. */
  function thump({ at = 0, from = 140, to = 45, dur = 0.25, vol = 0.45 }) {
    const t = now() + at;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
    const g = ctx.createGain(); env(g, t, vol, 0.004, dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** Stuttering glitch: several tiny gated noise/tone slices. */
  function glitch({ at = 0, slices = 5, spacing = 0.028, base = 900, vol = 0.14 }) {
    for (let i = 0; i < slices; i++) {
      const f = base * (0.6 + Math.random() * 1.6);
      if (i % 2) noise({ at: at + i * spacing, dur: 0.018, freq: f * 3, q: 4, vol });
      else blip({ at: at + i * spacing, freq: f, dur: 0.018, vol: vol * 0.7, type: 'square' });
    }
  }

  /** Quick digital chatter: random soft blips like data being read. */
  function chatter({ at = 0, count = 6, spacing = 0.022, vol = 0.05 }) {
    for (let i = 0; i < count; i++) {
      blip({ at: at + i * spacing, freq: 1800 + Math.random() * 2600, dur: 0.012, vol });
    }
  }

  return {
    // Cursor moves onto a cell or menu option: tiny high tick.
    hover() {
      noise({ dur: 0.012, freq: 6500, q: 3, vol: 0.12 });
      blip({ freq: 3300, dur: 0.015, vol: 0.025 });
    },
    // Code picked: tactile click + low thump + data chirp.
    select() {
      noise({ dur: 0.02, freq: 3000, q: 1.2, vol: 0.28 });
      thump({ from: 180, to: 70, dur: 0.12, vol: 0.32 });
      blip({ at: 0.015, freq: 1400, to: 2600, dur: 0.05, vol: 0.06, wet: true });
      chatter({ at: 0.03, count: 3, vol: 0.03 });
    },
    // Not allowed: short low buzz with a stutter.
    denied() {
      blip({ freq: 95, dur: 0.14, vol: 0.18, type: 'sawtooth' });
      noise({ dur: 0.06, freq: 500, q: 2, vol: 0.12 });
      noise({ at: 0.07, dur: 0.05, freq: 420, q: 2, vol: 0.1 });
    },
    // Daemon installed: rising band-pass data sweep + soft confirmation tones.
    upload() {
      noise({ dur: 0.32, freq: 700, sweepTo: 6000, q: 6, vol: 0.16, wet: true });
      chatter({ at: 0.05, count: 8, spacing: 0.025, vol: 0.035 });
      blip({ at: 0.22, freq: 1318, dur: 0.18, vol: 0.06, wet: true });
      blip({ at: 0.28, freq: 1975, dur: 0.24, vol: 0.05, wet: true });
    },
    // Daemon can no longer fit: glitch stutter + falling tone.
    daemonFail() {
      glitch({ slices: 6, base: 700, vol: 0.13 });
      blip({ at: 0.04, freq: 520, to: 140, dur: 0.3, vol: 0.09, type: 'sawtooth' });
      thump({ at: 0.02, from: 90, to: 40, dur: 0.25, vol: 0.25 });
    },
    // Breach complete: sub boom, airy rise and a soft synth chord.
    success() {
      thump({ from: 120, to: 38, dur: 0.6, vol: 0.5 });
      noise({ dur: 0.7, freq: 400, sweepTo: 8000, q: 1.5, vol: 0.1, wet: true });
      [659, 988, 1318].forEach((f, i) => blip({ at: 0.18 + i * 0.07, freq: f, dur: 0.6, vol: 0.05, type: 'triangle', wet: true }));
      chatter({ at: 0.05, count: 10, spacing: 0.03, vol: 0.03 });
    },
    // Breach failed: heavy glitch, distorted downward sweep.
    fail() {
      glitch({ slices: 9, spacing: 0.03, base: 500, vol: 0.16 });
      blip({ freq: 300, to: 55, dur: 0.7, vol: 0.14, type: 'sawtooth' });
      thump({ at: 0.05, from: 80, to: 30, dur: 0.6, vol: 0.45 });
      noise({ at: 0.1, dur: 0.5, freq: 2000, sweepTo: 200, q: 1, vol: 0.12, type: 'lowpass' });
    },
    // Last 10 seconds: muted clock tick.
    tick() {
      noise({ dur: 0.015, freq: 2200, q: 6, vol: 0.12 });
      blip({ freq: 880, dur: 0.03, vol: 0.04 });
    },
    // Hint / undo: short scanning chirp.
    assist() {
      chatter({ count: 5, spacing: 0.03, vol: 0.05 });
      blip({ at: 0.12, freq: 1600, to: 2400, dur: 0.12, vol: 0.06, wet: true });
    },
    // Timer frozen: downward filtered whoosh with a glassy ping.
    freeze() {
      noise({ dur: 0.6, freq: 9000, sweepTo: 300, q: 2, vol: 0.14, type: 'lowpass', wet: true });
      blip({ freq: 3520, dur: 0.5, vol: 0.04, wet: true });
      blip({ at: 0.05, freq: 2637, dur: 0.6, vol: 0.03, wet: true });
    },
    // Breach opens: connection handshake.
    start() {
      noise({ dur: 0.25, freq: 5000, sweepTo: 600, q: 3, vol: 0.14 });
      thump({ at: 0.05, from: 160, to: 45, dur: 0.4, vol: 0.4 });
      chatter({ at: 0.1, count: 12, spacing: 0.02, vol: 0.035 });
      glitch({ at: 0.32, slices: 3, base: 1500, vol: 0.07 });
    },
    // Perk unlocked: two-step confirm.
    buy() {
      noise({ dur: 0.02, freq: 3500, vol: 0.2 });
      blip({ freq: 988, dur: 0.12, vol: 0.07, type: 'triangle', wet: true });
      blip({ at: 0.08, freq: 1480, dur: 0.22, vol: 0.07, type: 'triangle', wet: true });
      thump({ from: 150, to: 60, dur: 0.15, vol: 0.25 });
    },
  };
}
