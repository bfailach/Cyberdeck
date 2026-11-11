// "Black ICE" — an original dark industrial / cyberpunk track for Cyberdeck, sequenced live with WebAudio.
// 148 BPM, E Phrygian. Distorted kick, detuned "reese" bass with a moving filter, metallic percussion,
// low "braam" hits and palm-muted power-chord chugs through a cabinet-style EQ. 32-bar loop:
//   bars  0–3   intro      filtered bass, ticking hats, riser
//   bars  4–11  drop 1     full kit, rolling offbeat bass, braam hits
//   bars 12–15  breakdown  drone, filtered bass, snare roll into the drop
//   bars 16–27  drop 2     everything + distorted power-chord chugs
//   bars 28–31  outro      kit and bass, filter closing back down

const BPM = 148;
const STEP = 60 / BPM / 4; // 16th note
const BARS = 32;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Bass roots per bar (E1 = 28): E E F E | E E G F#
const ROOTS = [28, 28, 29, 28, 28, 28, 31, 30];
// Rolling bass: offbeat 16ths, octave jumps on accents (0 = rest, n = semitones above root + 1).
const BASS = [0, 1, 1, 0, 0, 1, 13, 1, 0, 1, 1, 0, 0, 13, 1, 1];
// Guitar rhythm (1 = palm-muted chug, 2 = open accent, 0 = rest).
const CHUG = [2, 0, 1, 1, 0, 1, 1, 0, 1, 1, 2, 0, 1, 0, 1, 1];

export function createTrack(ctx, out) {
  // ---------- shared processing ----------
  const curve = (amount) => {
    const n = 2048; const c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
    return c;
  };

  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16; glue.ratio.value = 4; glue.attack.value = 0.005; glue.release.value = 0.12;
  glue.connect(out);

  // Sidechain-style ducking for everything except the kick.
  const duck = ctx.createGain(); duck.connect(glue);

  const reverb = ctx.createConvolver();
  reverb.buffer = (() => {
    const len = Math.floor(ctx.sampleRate * 2.2);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return b;
  })();
  const revTone = ctx.createBiquadFilter(); revTone.type = 'lowpass'; revTone.frequency.value = 3200;
  const revGain = ctx.createGain(); revGain.gain.value = 0.28;
  reverb.connect(revTone).connect(revGain).connect(duck);

  const delay = ctx.createDelay(1); delay.delayTime.value = STEP * 3;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const dTone = ctx.createBiquadFilter(); dTone.type = 'lowpass'; dTone.frequency.value = 2200;
  delay.connect(dTone).connect(fb).connect(delay);
  const dOut = ctx.createGain(); dOut.gain.value = 0.3; dTone.connect(dOut).connect(duck);

  const noiseBuf = (() => {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();

  // Kick bus: hard saturation.
  const kickDrive = ctx.createWaveShaper(); kickDrive.curve = curve(3.2);
  const kickGain = ctx.createGain(); kickGain.gain.value = 0.62;
  kickDrive.connect(kickGain).connect(glue);

  // Bass bus: reese oscillators -> filter (LFO-modulated) -> distortion.
  const bassFilter = ctx.createBiquadFilter(); bassFilter.type = 'lowpass'; bassFilter.Q.value = 7; bassFilter.frequency.value = 380;
  const bassDrive = ctx.createWaveShaper(); bassDrive.curve = curve(4);
  const bassPost = ctx.createBiquadFilter(); bassPost.type = 'lowpass'; bassPost.frequency.value = 3800;
  const bassGain = ctx.createGain(); bassGain.gain.value = 0.3;
  bassFilter.connect(bassDrive).connect(bassPost).connect(bassGain).connect(duck);
  const lfo = ctx.createOscillator(); lfo.frequency.value = BPM / 60 / 2; // one sweep per half note
  const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 260;
  lfo.connect(lfoAmt).connect(bassFilter.frequency);
  lfo.start();

  // Guitar bus: heavy distortion into a speaker-cabinet style EQ (no raw synth edge).
  const gtrDrive = ctx.createWaveShaper(); gtrDrive.curve = curve(9); gtrDrive.oversample = '4x';
  const gtrHp = ctx.createBiquadFilter(); gtrHp.type = 'highpass'; gtrHp.frequency.value = 95;
  const gtrMid = ctx.createBiquadFilter(); gtrMid.type = 'peaking'; gtrMid.frequency.value = 900; gtrMid.Q.value = 0.9; gtrMid.gain.value = 4;
  const gtrScoop = ctx.createBiquadFilter(); gtrScoop.type = 'peaking'; gtrScoop.frequency.value = 450; gtrScoop.Q.value = 1.2; gtrScoop.gain.value = -3;
  const gtrCab1 = ctx.createBiquadFilter(); gtrCab1.type = 'lowpass'; gtrCab1.frequency.value = 3400; gtrCab1.Q.value = 0.7;
  const gtrCab2 = ctx.createBiquadFilter(); gtrCab2.type = 'lowpass'; gtrCab2.frequency.value = 4200; gtrCab2.Q.value = 0.5;
  const gtrGain = ctx.createGain(); gtrGain.gain.value = 0.085;
  gtrDrive.connect(gtrHp).connect(gtrScoop).connect(gtrMid).connect(gtrCab1).connect(gtrCab2).connect(gtrGain);
  gtrGain.connect(duck); gtrGain.connect(reverb);

  // Drone for the breakdown.
  const drone = ctx.createGain(); drone.gain.value = 0;
  const droneFilter = ctx.createBiquadFilter(); droneFilter.type = 'lowpass'; droneFilter.frequency.value = 500; droneFilter.Q.value = 4;
  drone.connect(droneFilter); droneFilter.connect(duck); droneFilter.connect(reverb);
  [40, 40.1, 47, 52].forEach((n, i) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = i * 7 - 10;
    const g = ctx.createGain(); g.gain.value = 0.1; o.connect(g).connect(drone); o.start();
  });

  // ---------- instruments ----------
  function kick(t) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    o.connect(g).connect(kickDrive); o.start(t); o.stop(t + 0.38);
    // click
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.25, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    n.connect(f).connect(ng).connect(kickDrive); n.start(t); n.stop(t + 0.02);
    // duck the rest of the mix
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(0.35, t);
    duck.gain.linearRampToValueAtTime(1, t + STEP * 2.6);
  }
  // Snare: layered clap transients + body + saturated noise, no tonal oscillator.
  const snareDrive = ctx.createWaveShaper(); snareDrive.curve = curve(2.2);
  const snareBus = ctx.createGain(); snareBus.gain.value = 1;
  snareDrive.connect(snareBus); snareBus.connect(duck); snareBus.connect(reverb);
  function snare(t, vol = 0.5) {
    // three quick clap transients
    [0, 0.009, 0.019].forEach((o, i) => {
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.1;
      const g = ctx.createGain();
      const len = i === 2 ? 0.2 : 0.012;
      g.gain.setValueAtTime(vol * (i === 2 ? 0.9 : 0.7), t + o); g.gain.exponentialRampToValueAtTime(0.001, t + o + len);
      n.connect(f).connect(g).connect(snareDrive); n.start(t + o, Math.random() * 0.5); n.stop(t + o + len + 0.02);
    });
    // body
    const b = ctx.createBufferSource(); b.buffer = noiseBuf;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 230; bf.Q.value = 1.4;
    const bg = ctx.createGain(); bg.gain.setValueAtTime(vol * 1.1, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    b.connect(bf).connect(bg).connect(snareDrive); b.start(t, Math.random() * 0.5); b.stop(t + 0.1);
  }
  // Hats: darker band-passed noise with human-ish velocity variation.
  function hat(t, open, vol) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = open ? 6200 : 7400; f.Q.value = 0.9;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
    const g = ctx.createGain(); const len = open ? 0.14 : 0.022 + Math.random() * 0.012;
    const v = vol * 0.75 * (0.75 + Math.random() * 0.4);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(f).connect(hp).connect(g).connect(duck); n.start(t, Math.random() * 0.5); n.stop(t + len + 0.01);
  }
  // Industrial clank: struck metal pipe (low-Q, low-mid resonances, saturated, roomy).
  const clankDrive = ctx.createWaveShaper(); clankDrive.curve = curve(3);
  const clankBus = ctx.createGain(); clankBus.gain.value = 1;
  clankDrive.connect(clankBus); clankBus.connect(duck); clankBus.connect(reverb);
  function metal(t, vol) {
    [430, 610, 880, 1330].forEach((fq, i) => {
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq * (0.97 + Math.random() * 0.06); f.Q.value = 9;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol * 2.2 * (1 - i * 0.18), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12 - i * 0.015);
      n.connect(f).connect(g).connect(clankDrive);
      n.start(t, Math.random() * 0.5); n.stop(t + 0.14);
    });
  }
  function bass(t, note, len) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.004);
    g.gain.setValueAtTime(1, t + len * 0.75); g.gain.linearRampToValueAtTime(0, t + len);
    g.connect(bassFilter);
    for (const det of [-14, 14]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(note); o.detune.value = det;
      o.connect(g); o.start(t); o.stop(t + len + 0.01);
    }
    const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = midi(note);
    const sg = ctx.createGain(); sg.gain.value = 0.9; s.connect(sg).connect(g);
    s.start(t); s.stop(t + len + 0.01);
  }
  // Cinematic "braam": low, swelling, dark — replaces bright synth stabs.
  function braam(t, root, len) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(380, t); f.frequency.exponentialRampToValueAtTime(1500, t + 0.25); f.frequency.exponentialRampToValueAtTime(420, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const d = ctx.createWaveShaper(); d.curve = curve(3);
    f.connect(d).connect(g); g.connect(duck); g.connect(reverb);
    for (const [iv, det] of [[12, -9], [12, 9], [19, -5], [24, 4]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(root + iv); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + len + 0.02);
    }
  }
  // Power chord (root, fifth, octave) through the guitar bus. Muted = short, darker chug.
  function chord(t, root, len, muted) {
    const g = ctx.createGain();
    const pm = ctx.createBiquadFilter(); pm.type = 'lowpass'; pm.frequency.value = muted ? 1300 : 5000;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.004);
    g.gain.setValueAtTime(1, t + len * 0.7); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    pm.connect(g).connect(gtrDrive);
    for (const iv of [0, 7, 12]) {
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(root + iv); o.detune.value = det + Math.random() * 3;
        const og = ctx.createGain(); og.gain.value = iv === 12 ? 0.5 : 0.8;
        o.connect(og).connect(pm); o.start(t); o.stop(t + len + 0.02);
      }
    }
  }
  function riser(t, bars) {
    const dur = bars * 16 * STEP;
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.12, t + dur);
    n.connect(f).connect(g); g.connect(duck); g.connect(reverb);
    n.start(t); n.stop(t + dur);
  }
  function impact(t) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.connect(g).connect(kickDrive); o.start(t); o.stop(t + 1.15);
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(6000, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.8);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.18, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    n.connect(f).connect(ng); ng.connect(glue); ng.connect(reverb); n.start(t); n.stop(t + 0.85);
  }

  // ---------- sequencer ----------
  function scheduleStep(s, t) {
    const bar = Math.floor(s / 16) % BARS;
    const i = s % 16;
    const root = ROOTS[bar % ROOTS.length];
    const intro = bar < 4;
    const drop1 = bar >= 4 && bar < 12;
    const brk = bar >= 12 && bar < 16;
    const drop2 = bar >= 16 && bar < 28;
    const outro = bar >= 28;
    const full = drop1 || drop2 || outro;

    // Section changes.
    if (i === 0) {
      const cutoff = intro ? 240 + bar * 60 : brk ? 260 : outro ? 600 - (bar - 28) * 90 : 520;
      bassFilter.frequency.setTargetAtTime(cutoff, t, 0.08);
      drone.gain.setTargetAtTime(brk ? 1 : 0, t, brk ? 0.6 : 0.15);
      if (bar === 2 || bar === 14) riser(t, 2);
      if (bar === 4 || bar === 16) impact(t);
    }

    // Drums.
    if (full && i % 4 === 0) kick(t);
    if (full && (i === 4 || i === 12)) snare(t);
    if (brk && bar === 15) {
      if (i % 2 === 0 || i >= 8) snare(t, 0.12 + (i / 16) * 0.38);
    }
    if (full || intro) {
      if (i % 2 === 0) hat(t, false, i % 4 === 2 ? 0.12 : 0.06);
      else if (full) hat(t, false, 0.035);
      if (full && i % 4 === 2) hat(t, true, 0.07);
    }
    if (full && (i === 3 || i === 11 || (bar % 2 === 1 && i === 14))) metal(t, 0.09);

    // Bass.
    if (!brk || i % 4 === 0) {
      const step = BASS[i];
      if (step) bass(t, root + (step - 1), STEP * (brk ? 3.5 : 0.95));
    }

    // Braam hits on the downbeat every two bars.
    if ((drop1 || drop2) && i === 0 && bar % 2 === 0) braam(t, root, STEP * 14);

    // Guitar: palm-muted chugs locked to the kick, open power chords on accents (drop 2).
    if (drop2) {
      const gr = root + 12; // E2 range
      const hit = CHUG[i];
      if (hit === 1) chord(t, gr, STEP * 0.85, true);
      else if (hit === 2) chord(t, gr, STEP * (bar >= 24 ? 3.8 : 1.8), false);
    }
  }

  let step = 0;
  let nextTime = 0;
  let timer = null;

  function tick() {
    while (nextTime < ctx.currentTime + 0.15) {
      scheduleStep(step, nextTime);
      step++;
      nextTime += STEP;
    }
  }

  return {
    start() {
      if (timer) return;
      nextTime = ctx.currentTime + 0.1;
      timer = setInterval(tick, 25);
    },
    stop() { clearInterval(timer); timer = null; },
    /** Schedules a number of bars up front (used for offline rendering). */
    renderBars(bars, startTime = 0) {
      for (let s = 0; s < bars * 16; s++) scheduleStep(s, startTime + s * STEP);
      return bars * 16 * STEP;
    },
  };
}
