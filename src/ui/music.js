// "Neon Uplink" — an original synthwave track for Cyberdeck, sequenced live with WebAudio.
// 100 BPM, A minor, progression Am – F – Dm – E, 32-bar loop:
//   bars  0–7   intro      pad, pulsing bass, hats come in
//   bars  8–23  drive      four-on-the-floor, snare, 16th hats, bass, arpeggio (+ lead from bar 16)
//   bars 24–31  breakdown  pad, lead melody, filtered bass, no kick

const BPM = 100;
const STEP = 60 / BPM / 4; // 16th note
const BARS = 32;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const CHORDS = [
  { root: 33, tones: [57, 60, 64] }, // Am
  { root: 29, tones: [57, 60, 65] }, // F
  { root: 38, tones: [57, 62, 65] }, // Dm
  { root: 40, tones: [56, 59, 64] }, // E
];
// Lead melody: two half notes per bar.
const LEAD = [[76, 72], [77, 72], [74, 77], [76, 71]];
const ARP = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 4, 3];
const BASS = [0, 12, 0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 7, 12];

export function createTrack(ctx, out) {
  // ---- shared effects ----
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 2.4);
  const reverbGain = ctx.createGain(); reverbGain.gain.value = 0.35;
  reverb.connect(reverbGain).connect(out);

  const delay = ctx.createDelay(1);
  delay.delayTime.value = STEP * 3; // dotted 8th
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const delayTone = ctx.createBiquadFilter(); delayTone.type = 'lowpass'; delayTone.frequency.value = 2600;
  delay.connect(delayTone).connect(fb).connect(delay);
  const delayOut = ctx.createGain(); delayOut.gain.value = 0.45;
  delayTone.connect(delayOut).connect(out);

  const noiseBuf = (() => {
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();

  // ---- instruments ----
  function kick(t) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.4);
  }
  function snare(t, vol = 0.45) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    n.connect(f).connect(g); g.connect(out); g.connect(reverb);
    n.start(t); n.stop(t + 0.22);
    const o = ctx.createOscillator(); const og = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
    og.gain.setValueAtTime(0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(og).connect(out); o.start(t); o.stop(t + 0.14);
  }
  function hat(t, open, vol) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ctx.createGain();
    const len = open ? 0.22 : 0.045;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random() * 0.5); n.stop(t + len + 0.01);
  }
  function bass(t, note, cutoff) {
    const o = ctx.createOscillator(); const o2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.value = midi(note); o2.frequency.value = midi(note) * 0.5;
    f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(cutoff * 2.4, t); f.frequency.exponentialRampToValueAtTime(cutoff, t + 0.11);
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 0.95);
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    o.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(out);
    o.start(t); o2.start(t); o.stop(t + STEP); o2.stop(t + STEP);
  }
  function pad(t, tones, dur) {
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.6);
    g.gain.setValueAtTime(0.09, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.4);
    f.connect(g); g.connect(out); g.connect(reverb);
    for (const n of tones) {
      for (const det of [-9, 0, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = midi(n - 12); o.detune.value = det;
        o.connect(f); o.start(t); o.stop(t + dur + 0.5);
      }
    }
  }
  function arp(t, note, vol) {
    const o = ctx.createOscillator(); const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    o.type = 'square'; o.frequency.value = midi(note);
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(f).connect(g); g.connect(out); g.connect(delay);
    o.start(t); o.stop(t + 0.16);
  }
  function lead(t, note, dur) {
    const o = ctx.createOscillator(); const o2 = ctx.createOscillator();
    const lfo = ctx.createOscillator(); const lfoG = ctx.createGain();
    const f = ctx.createBiquadFilter(); const g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = 7;
    o.frequency.value = midi(note); o2.frequency.value = midi(note);
    lfo.frequency.value = 5.5; lfoG.gain.value = 9;
    lfo.connect(lfoG); lfoG.connect(o.detune); lfoG.connect(o2.detune);
    f.type = 'lowpass'; f.frequency.value = 2200; f.Q.value = 2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.06);
    g.gain.setValueAtTime(0.08, t + dur - 0.08); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(out); g.connect(delay); g.connect(reverb);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + dur + 0.05); }
  }

  // ---- sequencer ----
  let step = 0;
  let nextTime = 0;
  let timer = null;

  function scheduleStep(s, t) {
    const bar = Math.floor(s / 16) % BARS;
    const i = s % 16;
    const chord = CHORDS[bar % 4];
    const intro = bar < 8;
    const drive = bar >= 8 && bar < 24;
    const breakdown = bar >= 24;

    if (i === 0) pad(t, chord.tones, STEP * 16);

    // drums
    if (drive && i % 4 === 0) kick(t);
    if (drive && (i === 4 || i === 12)) snare(t);
    if (drive && bar % 8 === 7 && i >= 13) snare(t, 0.22 + (i - 13) * 0.05); // fill
    if ((drive || (intro && bar >= 4)) && i % 2 === 0) hat(t, i % 4 === 2 && drive, i % 4 === 0 ? 0.12 : 0.07);
    if (drive && i % 2 === 1) hat(t, false, 0.04);

    // bass
    const bassOn = intro ? i % 2 === 0 : true;
    if (bassOn) bass(t, chord.root + BASS[i], breakdown ? 220 : intro ? 300 : 420);

    // arpeggio
    if (drive || (breakdown && bar >= 28)) {
      const tones = [...chord.tones, ...chord.tones.map((n) => n + 12)];
      arp(t, tones[ARP[i]], breakdown ? 0.04 : 0.055);
    }

    // lead melody
    if ((bar >= 16 && bar < 24) || breakdown) {
      if (i === 0 || i === 8) lead(t, LEAD[bar % 4][i === 0 ? 0 : 1] + (bar >= 20 && bar < 24 ? 12 : 0), STEP * 8);
    }
  }

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

function impulse(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}
