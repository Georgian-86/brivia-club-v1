// The Brivia ignition (D-186): the club's opening title, drawn live instead of played from a video. A point of crimson
// light breathes in on black, ignites, stretches into a hairline streak, and THE BRIVIA CLUB opens out of it from the
// centre, letter by letter. It replaces the landing's 58 kbps intro video (soft and banded, and scaled 1.55x on
// phones) and is also the "Opening your club" loading screen (handoff.css). Vector text and CSS gradients, so it is
// sharp at every size and pixel density, and it weighs nothing to download.
//
// The motion is CSS (ignition.css: it runs before any script and stays on the compositor). This file holds the timings
// both share (unit-tested against the CSS), the markup, and the music: "the ignition", a short cinematic cue in the
// sound kit's key (B-flat): a low swell and a rising air that draw in towards the light, a spark as it ignites, then a
// soft low hit and a warm open chord (B-flat add 9) with a bell arpeggio as the name appears, ringing out in a hall.
// Browsers only allow sound after a gesture, so the landing plays it when the page may (or from the first tap during
// the intro); the loading screen after "Log in" always may.

export const IGNITION = Object.freeze({
  total: 1.8,        // s: one pass of the title (ignition.css --ign-total); the landing's 2.5 s cap leaves room for it
  ignite: 0.4,       // the point flares and the streak starts
  reveal: 0.8,       // the streak is full width; the hit and the chord
  letters: Object.freeze({ at: 0.68, step: 0.035, dur: 0.5 }), // centre letter first, then outwards
});

export const IGNITION_WORD = 'THE BRIVIA CLUB';

// The title's markup: one span per letter with its distance from the centre (--d) and side (--s), for the CSS.
export const ignitionMarkup = (word = IGNITION_WORD) => {
  const chars = [...word];
  const mid = (chars.length - 1) / 2;
  const letters = chars.map((ch, i) => {
    const d = Math.round(Math.abs(i - mid));
    const s = Math.sign(i - mid);
    return ch === ' '
      ? '<span class="ignition-gap"></span>'
      : `<span class="ignition-letter" style="--d:${d};--s:${s}">${ch}</span>`;
  }).join('');
  return `<div class="ignition" aria-hidden="true"><span class="ignition-flare"></span><span class="ignition-streak"></span><span class="ignition-core"></span><p class="ignition-word">${letters}</p></div>`;
};

// When the last letter has fully arrived.
export const lettersDone = (word = IGNITION_WORD, l = IGNITION.letters) => {
  const half = Math.round(([...word].length - 1) / 2);
  return l.at + half * l.step + l.dur;
};

// The cue, in seconds from its start. Unit-tested so the hit lands on the reveal.
export const IGNITION_CUE = Object.freeze({
  length: 4.6,
  level: 0.62,
  swell: Object.freeze({ notes: Object.freeze([34, 41, 46]), peak: 0.76, gain: 0.15 }),
  riser: Object.freeze({ from: 0.08, to: 0.78, gain: 0.2 }),
  spark: Object.freeze({ at: 0.4, midi: 98, gain: 0.05 }),
  hit: Object.freeze({ at: 0.8, gain: 0.42 }),
  chord: Object.freeze({ at: 0.8, notes: Object.freeze([58, 62, 65, 72, 77]), gain: 0.065, decay: 3.2 }),
  bells: Object.freeze([
    Object.freeze({ midi: 82, at: 0.88 }),
    Object.freeze({ midi: 89, at: 0.96 }),
    Object.freeze({ midi: 94, at: 1.04 }),
    Object.freeze({ midi: 98, at: 1.14 }),
  ]),
  reverb: Object.freeze({ seconds: 2.8, wet: 0.38 }),
});

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const noiseBuffer = (ctx, seconds, seed = 23) => {
  if (!ctx.createBuffer) return null;
  const rate = ctx.sampleRate || 44100;
  const buf = ctx.createBuffer(1, Math.ceil(rate * seconds), rate);
  const data = buf.getChannelData(0);
  let s = seed;
  for (let i = 0; i < data.length; i += 1) { s = (s * 16807) % 2147483647; data[i] = (s / 2147483647) * 2 - 1; }
  return buf;
};
// A hall: stereo noise with an exponential tail (a little darker as it decays).
const hall = (ctx, seconds) => {
  if (!ctx.createConvolver || !ctx.createBuffer) return null;
  const rate = ctx.sampleRate || 44100;
  const len = Math.ceil(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buf.getChannelData(ch);
    let s = 97 + ch * 31;
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      s = (s * 16807) % 2147483647;
      const t = i / len;
      const white = (s / 2147483647) * 2 - 1;
      last += (white - last) * (0.9 - 0.6 * t); // one-pole lowpass that closes as the tail fades
      data[i] = last * (1 - t) ** 2.4;
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
};
const env = (ctx, start, attack, release, level) => {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(level, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);
  return g;
};
const tone = (ctx, out, { freq, start, attack = 0.01, release = 1, level = 0.1, type = 'sine', detune = 0 }) => {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  if (detune && osc.detune) osc.detune.value = detune;
  const g = env(ctx, start, attack, release, level);
  osc.connect(g).connect(out);
  osc.start(start);
  osc.stop(start + attack + release + 0.05);
};

// Renders the cue into dest, starting at t0 on ctx's clock.
export const renderIgnitionCue = (ctx, dest, t0 = 0, cue = IGNITION_CUE) => {
  const bus = ctx.createGain();
  bus.gain.value = cue.level;
  let out = dest;
  if (ctx.createDynamicsCompressor) {
    const comp = ctx.createDynamicsCompressor();
    [['threshold', -10], ['knee', 8], ['ratio', 4], ['attack', 0.004], ['release', 0.2]].forEach(([k, v]) => { if (comp[k]) comp[k].value = v; });
    comp.connect(dest);
    out = comp;
  }
  bus.connect(out);
  const dry = ctx.createGain();
  dry.gain.value = 1;
  dry.connect(bus);
  const room = hall(ctx, cue.reverb.seconds);
  const wet = ctx.createGain();
  wet.gain.value = room ? cue.reverb.wet : 0;
  if (room) { wet.connect(room).connect(bus); }
  const send = (node, amount = 1) => {
    node.connect(dry);
    if (room && amount) { const g = ctx.createGain(); g.gain.value = amount; node.connect(g).connect(wet); }
  };

  // 1. The swell: a low B-flat drone that draws in towards the light, then rings away under the chord.
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 520;
  send(low, 0.5);
  cue.swell.notes.forEach((m, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz(m);
    const g = ctx.createGain();
    const start = t0;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(cue.swell.gain * (1 - i * 0.25), start + cue.swell.peak);
    g.gain.exponentialRampToValueAtTime(0.0001, start + cue.length - 0.4);
    osc.connect(g).connect(low);
    osc.start(start);
    osc.stop(start + cue.length);
  });

  // 2. The riser: air through a band that opens upwards, cut just before the hit (a breath in).
  const noise = noiseBuffer(ctx, cue.riser.to - cue.riser.from + 0.2);
  if (noise && ctx.createBufferSource) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    const a = t0 + cue.riser.from;
    const b = t0 + cue.riser.to;
    band.frequency.setValueAtTime(380, a);
    band.frequency.exponentialRampToValueAtTime(5200, b);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, a);
    g.gain.exponentialRampToValueAtTime(cue.riser.gain, b - 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, b + 0.06);
    src.connect(band).connect(g);
    send(g, 0.6);
    src.start(a);
    src.stop(b + 0.12);
  }

  // 3. The spark: a high glint as the point ignites.
  tone(ctx, (() => { const g = ctx.createGain(); g.gain.value = 1; send(g, 1.2); return g; })(), { freq: hz(cue.spark.midi), start: t0 + cue.spark.at, attack: 0.004, release: 0.35, level: cue.spark.gain });

  // 4. The hit: a soft, low pitch-falling thump under the name (felt more than heard).
  {
    const start = t0 + cue.hit.at;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(96, start);
    osc.frequency.exponentialRampToValueAtTime(41, start + 0.55);
    const g = env(ctx, start, 0.008, 1.3, cue.hit.gain);
    osc.connect(g);
    send(g, 0.25);
    osc.start(start);
    osc.stop(start + 1.4);
  }

  // 5. The chord: B-flat add 9, two slightly detuned voices per note (a warm, wide pad with a piano-like decay).
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 4200;
  send(warm, 1);
  cue.chord.notes.forEach((m, i) => {
    const start = t0 + cue.chord.at + i * 0.012; // a whisper of a strum
    [-4, 4].forEach((cents) => tone(ctx, warm, { freq: hz(m), start, attack: 0.018, release: cue.chord.decay - i * 0.15, level: cue.chord.gain, detune: cents }));
    tone(ctx, warm, { freq: hz(m) * 2, start, attack: 0.01, release: 0.9, level: cue.chord.gain * 0.18 });
  });

  // 6. The bells: an arpeggio up the chord, a struck-bar partial on each, mostly in the hall.
  const bells = ctx.createGain();
  bells.gain.value = 1;
  send(bells, 1.6);
  cue.bells.forEach(({ midi, at }, i) => {
    const start = t0 + at;
    tone(ctx, bells, { freq: hz(midi), start, attack: 0.006, release: 1.5, level: 0.05 - i * 0.006 });
    tone(ctx, bells, { freq: hz(midi) * 2.76, start, attack: 0.004, release: 0.5, level: 0.012 });
  });
  return bus;
};

// Pre-renders the cue once per AudioContext (so the landing can start it part-way, from the first tap) and plays it.
export const createIgnitionSound = ({ win = globalThis.window } = {}) => {
  let buffer = null;
  let rendering = null;
  const prime = (ctx) => {
    const Offline = win?.OfflineAudioContext || win?.webkitOfflineAudioContext;
    if (!ctx || !Offline || rendering) return rendering;
    const rate = ctx.sampleRate || 44100;
    try {
      const off = new Offline(2, Math.ceil(rate * IGNITION_CUE.length), rate);
      renderIgnitionCue(off, off.destination, 0.01);
      rendering = Promise.resolve(off.startRendering()).then((b) => { buffer = b; return b; }, () => null);
    } catch { rendering = Promise.resolve(null); }
    return rendering;
  };
  // offset: how far into the title the page already is (s). Past the reveal, nothing plays (a late hit sounds wrong).
  const play = (ctx, dest, { offset = 0, volume = 1 } = {}) => {
    if (!ctx || ctx.state !== 'running' || offset > IGNITION.reveal - 0.12) return false;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(dest || ctx.destination);
    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      src.start(ctx.currentTime + 0.02, Math.max(0, offset));
    } else {
      renderIgnitionCue(ctx, gain, ctx.currentTime + 0.03 - Math.max(0, offset));
    }
    return true;
  };
  return { prime, play, ready: () => Boolean(buffer) };
};
