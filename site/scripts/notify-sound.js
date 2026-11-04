// The Brivia sound kit (D-137; replaces the D-134 two-note bell). Three original cues, all played by one synthesized
// voice, "the Brivia horn": a soft saxophone-like tone (sawtooth and square through a breathing low-pass filter, a
// scoop into each note, late vibrato, a little breath noise and a short warm room). All three sit in B-flat major so
// they sound like one identity:
//   notify  a smooth rising B-flat major 7 line that settles on a long A with vibrato (about 1.4 s)
//   pass    a soft "aww": D falling to B-flat, the last note drooping a semitone (about 0.8 s, darker, quieter)
//   pitch   a bright quick F-B-flat-D run up to a scooped F with a sparkle on top (about 0.8 s)
// No audio files and no recordings: the notes below are rendered once with the Web Audio API.
//
// Rules: nothing plays before the member's first real interaction (browser autoplay rules; the gesture list is the
// landing page's, landing-sound.js); every cue is pre-rendered into a buffer as soon as audio unlocks, so a swipe
// starts its sound instantly and never waits for it; one cue at a time (a new one fades the last out); a notification
// id plays once; the same swipe cue within 180 ms plays once. One on/off switch and one volume for this device.

import { isUnlockEvent } from './landing-sound.js';

export const SOUND_KEY = 'brivia-notify-sound';
export const VOLUME_KEY = 'brivia-sound-volume';
export const DEFAULT_VOLUME = 80;

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
// midi: pitch; at/dur: seconds; gain: 0..1; scoop: cents the note starts below (or above) its pitch; fall: cents it
// droops by at its end; vib: vibrato depth in cents; bright: filter opening (multiple of the pitch).
export const CUES = Object.freeze({
  notify: Object.freeze({
    length: 2.0, level: 0.72, room: 0.32,
    pad: { midi: 58, at: 0, dur: 1.35, gain: 0.08 },
    notes: [
      { midi: 70, at: 0.0, dur: 0.17, gain: 0.7, scoop: -70, bright: 4.2 },
      { midi: 74, at: 0.15, dur: 0.16, gain: 0.72, scoop: -30, bright: 4.4 },
      { midi: 77, at: 0.29, dur: 0.17, gain: 0.76, scoop: -30, bright: 4.6 },
      { midi: 81, at: 0.44, dur: 0.78, gain: 0.82, scoop: -60, vib: 16, bright: 4.8 },
    ],
  }),
  pass: Object.freeze({
    length: 1.3, level: 0.88, room: 0.26,
    notes: [
      { midi: 74, at: 0.0, dur: 0.15, gain: 0.62, scoop: -40, bright: 3.0 },
      { midi: 70, at: 0.15, dur: 0.5, gain: 0.66, scoop: 30, fall: -100, vib: 10, bright: 2.6 },
    ],
  }),
  pitch: Object.freeze({
    length: 1.2, level: 0.77, room: 0.24,
    sparkle: { midi: 89, at: 0.22, dur: 0.32, gain: 0.05 },
    notes: [
      { midi: 65, at: 0.0, dur: 0.075, gain: 0.66, scoop: -50, bright: 5.0 },
      { midi: 70, at: 0.07, dur: 0.075, gain: 0.7, bright: 5.2 },
      { midi: 74, at: 0.14, dur: 0.075, gain: 0.74, bright: 5.4 },
      { midi: 77, at: 0.21, dur: 0.36, gain: 0.86, scoop: -90, vib: 14, bright: 5.8 },
    ],
  }),
});
// Kept for D-134 callers and tests: the notification cue's pitches.
export const CHIME_NOTES = Object.freeze(CUES.notify.notes.map((n) => ({ freq: hz(n.midi), at: n.at, gain: n.gain, decay: n.dur })));

const read = (storage, key) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
const write = (storage, key, value) => { try { storage?.setItem(key, value); } catch { /* memory only */ } };
// D-138: separate choices per device. SOUND_KEY: the notification chime in the app. INTERACTION_KEY: the swipe notes.
// PUSH_SOUND_KEY: whether system (push) notifications make the device's sound; mirrored into Cache Storage for the
// service worker (pushSoundPrefs).
export const INTERACTION_KEY = 'brivia-interaction-sound';
export const PUSH_SOUND_KEY = 'brivia-push-sound';
export const soundEnabled = (storage = globalThis.localStorage) => read(storage, SOUND_KEY) !== 'off';
export const setSoundEnabled = (on, storage = globalThis.localStorage) => write(storage, SOUND_KEY, on ? 'on' : 'off');
export const interactionSoundEnabled = (storage = globalThis.localStorage) => read(storage, INTERACTION_KEY) !== 'off';
export const setInteractionSoundEnabled = (on, storage = globalThis.localStorage) => write(storage, INTERACTION_KEY, on ? 'on' : 'off');
export const pushSoundEnabled = (storage = globalThis.localStorage) => read(storage, PUSH_SOUND_KEY) !== 'off';
export const setPushSoundEnabled = async (on, storage = globalThis.localStorage, cachesApi = globalThis.caches) => {
  write(storage, PUSH_SOUND_KEY, on ? 'on' : 'off');
  try {
    const cache = await cachesApi?.open?.('brivia-prefs');
    await cache?.put?.('/__brivia-prefs', new Response(JSON.stringify({ pushSilent: !on }), { headers: { 'content-type': 'application/json' } }));
  } catch { /* the worker then uses the device's default sound */ }
};
export const soundVolume = (storage = globalThis.localStorage) => {
  const v = Number(read(storage, VOLUME_KEY));
  return read(storage, VOLUME_KEY) === null || !Number.isFinite(v) ? DEFAULT_VOLUME : Math.min(100, Math.max(0, Math.round(v)));
};
export const setSoundVolume = (v, storage = globalThis.localStorage) => write(storage, VOLUME_KEY, String(Math.min(100, Math.max(0, Math.round(Number(v) || 0)))));
// 0..100 to a gain that sounds even across the slider (ears are logarithmic). Each cue peaks near full scale at 100,
// about -3 dB at the default 80 (laptop speakers need it: the first mix was about 10 dB too quiet to hear).
export const volumeGain = (v) => (Math.min(100, Math.max(0, Number(v) || 0)) / 100) ** 1.5;

// The Brivia horn: one note into dest, starting at t0 (seconds on ctx's clock).
const hornNote = (ctx, dest, n, t0, noise) => {
  const f = hz(n.midi);
  const start = t0 + n.at;
  const end = start + n.dur;
  const release = 0.14;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(n.gain, start + 0.035);          // a soft, breathy onset
  amp.gain.setValueAtTime(n.gain, Math.max(start + 0.036, end - 0.04));
  amp.gain.exponentialRampToValueAtTime(0.0001, end + release);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.4;
  const open = Math.min(5200, f * (n.bright || 4));
  filter.frequency.setValueAtTime(f * 1.6, start);
  filter.frequency.exponentialRampToValueAtTime(open, start + 0.06);    // the reed opening up
  filter.frequency.exponentialRampToValueAtTime(Math.max(f * 2, open * 0.6), end + release);
  filter.connect(amp).connect(dest);
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = 5.3;
  depth.gain.setValueAtTime(0, start);
  if (n.vib && n.dur > 0.2) depth.gain.linearRampToValueAtTime(f * (2 ** (n.vib / 1200) - 1), start + Math.min(0.3, n.dur * 0.6));
  lfo.connect(depth);
  [['sawtooth', 1, 1], ['square', 1.003, 0.32]].forEach(([type, detune, level]) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    const target = f * detune;
    osc.frequency.setValueAtTime(target * 2 ** ((n.scoop || 0) / 1200), start);
    osc.frequency.exponentialRampToValueAtTime(target, start + 0.07);    // the scoop into the note
    if (n.fall) {
      osc.frequency.setValueAtTime(target, end - n.dur * 0.55);
      osc.frequency.exponentialRampToValueAtTime(target * 2 ** (n.fall / 1200), end + release);
    }
    depth.connect(osc.frequency);
    g.gain.value = level;
    osc.connect(g).connect(filter);
    osc.start(start);
    osc.stop(end + release + 0.05);
  });
  lfo.start(start);
  lfo.stop(end + release + 0.05);
  // Breath: a little filtered noise at the start of each note.
  if (noise) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = Math.min(6000, f * 3);
    band.Q.value = 0.9;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, start);
    bg.gain.exponentialRampToValueAtTime(n.gain * 0.16, start + 0.02);
    bg.gain.exponentialRampToValueAtTime(n.gain * 0.03, start + 0.12);
    bg.gain.exponentialRampToValueAtTime(0.0001, end + release);
    src.connect(band).connect(bg).connect(dest);
    src.start(start);
    src.stop(end + release + 0.05);
  }
};

// A pure sine (the warm pad under the notification, the sparkle over the pitch).
const sine = (ctx, dest, { midi, at, dur, gain }, t0) => {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = hz(midi);
  g.gain.setValueAtTime(0.0001, t0 + at);
  g.gain.exponentialRampToValueAtTime(gain, t0 + at + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
  osc.connect(g).connect(dest);
  osc.start(t0 + at);
  osc.stop(t0 + at + dur + 0.05);
};

// A whole cue into dest: the notes, then a short warm room (a filtered echo) under them.
export const renderCue = (ctx, dest, cue, t0 = 0) => {
  const bus = ctx.createGain();
  bus.gain.value = cue.level;
  bus.connect(dest);
  if (cue.room && ctx.createDelay) {
    const delay = ctx.createDelay(0.5);
    const fb = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    const wet = ctx.createGain();
    delay.delayTime.value = 0.085;
    fb.gain.value = 0.3;
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    wet.gain.value = cue.room;
    bus.connect(delay);
    delay.connect(tone).connect(fb).connect(delay);
    tone.connect(wet).connect(dest);
  }
  let noise = null;
  if (ctx.createBuffer) {
    const rate = ctx.sampleRate || 44100;
    noise = ctx.createBuffer(1, Math.ceil(rate * 0.8), rate);
    const data = noise.getChannelData(0);
    let seed = 7;
    for (let i = 0; i < data.length; i += 1) { seed = (seed * 16807) % 2147483647; data[i] = (seed / 2147483647) * 2 - 1; }
  }
  if (cue.pad) sine(ctx, bus, cue.pad, t0);
  cue.notes.forEach((n) => hornNote(ctx, bus, n, t0, noise));
  if (cue.sparkle) sine(ctx, bus, cue.sparkle, t0);
};

// D-164 / D-174: the deck's arrival cue, "the shuffle". Not the horn: a soft swish as the pack splits, a quick run of
// light card ticks as the halves riffle together (one per card), a muffled tap as the pack is squared, three soft
// card taps as the cards are dealt (a felt-tipped click of filtered noise over a small low thump), then a warm
// two-note bell, B-flat up to F (the kit's key), on the landing. Quieter than the swipe cues. Times match
// deck-intro.js INTRO (unit-tested).
export const INTRO_CUE = Object.freeze({
  length: 3.4, level: 0.58,
  swish: Object.freeze({ at: 0.5, dur: 0.24 }),
  ticks: Object.freeze([0.97, 1.026, 1.082, 1.138, 1.194, 1.25, 1.306, 1.362]),
  square: 1.4,
  taps: Object.freeze([1.72, 1.82, 1.98]),
  bells: Object.freeze([
    Object.freeze({ midi: 82, at: 2.2, dur: 0.9, gain: 0.2 }),
    Object.freeze({ midi: 89, at: 2.3, dur: 0.8, gain: 0.14 }),
  ]),
});
const noiseBuffer = (ctx, seconds, seed0) => {
  if (!ctx.createBuffer) return null;
  const rate = ctx.sampleRate || 44100;
  const buf = ctx.createBuffer(1, Math.ceil(rate * seconds), rate);
  const data = buf.getChannelData(0);
  let seed = seed0;
  for (let i = 0; i < data.length; i += 1) { seed = (seed * 16807) % 2147483647; data[i] = (seed / 2147483647) * 2 - 1; }
  return buf;
};
// One burst of filtered noise: type/freq/Q shape it, level and decay its envelope.
const burst = (ctx, bus, noise, { start, type = 'bandpass', freq, q = 1, level, decay, sweepTo = 0 }) => {
  if (!noise || !ctx.createBufferSource) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = type;
  band.frequency.setValueAtTime(freq, start);
  if (sweepTo) band.frequency.exponentialRampToValueAtTime(sweepTo, start + decay);
  band.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(level, start + Math.min(0.004, decay / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, start + decay);
  src.connect(band).connect(g).connect(bus);
  src.start(start);
  src.stop(start + decay + 0.02);
};
const thump = (ctx, bus, start, from, level) => {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(90, start + 0.08);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(level, start + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
  osc.connect(g).connect(bus);
  osc.start(start);
  osc.stop(start + 0.12);
};
export const renderIntroCue = (ctx, dest, t0 = 0, cue = INTRO_CUE) => {
  const bus = ctx.createGain();
  bus.gain.value = cue.level;
  bus.connect(dest);
  const noise = noiseBuffer(ctx, 0.3, 11);
  // The split: air moving as the two halves part (a quiet band of noise sweeping down).
  if (cue.swish) burst(ctx, bus, noise, { start: t0 + cue.swish.at, freq: 3200, sweepTo: 900, q: 0.7, level: 0.12, decay: cue.swish.dur });
  // The riffle: short bright ticks, each card a touch different, slightly louder towards the end of the run.
  (cue.ticks || []).forEach((at, i) => burst(ctx, bus, noise, { start: t0 + at, type: 'highpass', freq: 3600 + (i % 3) * 420, q: 0.8, level: 0.16 + i * 0.012, decay: 0.022 }));
  // The square-up: a muffled tap of the whole pack.
  if (cue.square) { burst(ctx, bus, noise, { start: t0 + cue.square, freq: 900, q: 0.9, level: 0.3, decay: 0.05 }); thump(ctx, bus, t0 + cue.square, 160, 0.3); }
  cue.taps.forEach((at, i) => {
    const start = t0 + at;
    const level = 0.5 + i * 0.12;                        // the top card lands a touch firmer
    burst(ctx, bus, noise, { start, freq: 2600 - i * 300, q: 1.1, level, decay: 0.05 });
    thump(ctx, bus, start, 190 - i * 12, level * 0.55);
  });
  // A soft bell: a sine with a quiet inharmonic partial (2.76x, a struck bar) that dies faster than the fundamental.
  cue.bells.forEach(({ midi, at, dur, gain }) => {
    const start = t0 + at;
    [[1, gain, dur], [2.76, gain * 0.18, dur * 0.35]].forEach(([ratio, level, length]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz(midi) * ratio;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(level, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + length);
      osc.connect(g).connect(bus);
      osc.start(start);
      osc.stop(start + length + 0.05);
    });
  });
};

// createSoundKit(): { notify(id), swipe(direction), preview(), unlock(), isUnlocked(), ready(), intro(), unlockIfAllowed() }.
export const createSoundKit = ({
  win = globalThis.window, doc = globalThis.document, nav = globalThis.navigator,
  enabled = () => soundEnabled(), interactions = () => interactionSoundEnabled(), volume = () => soundVolume(), now = () => Date.now(),
} = {}) => {
  const AudioCtx = win?.AudioContext || win?.webkitAudioContext;
  const OfflineCtx = win?.OfflineAudioContext || win?.webkitOfflineAudioContext;
  let ctx = null;
  let unlocked = false;
  let current = null;
  let limiter = null;
  const buffers = {};
  let rendering = null;
  const playedIds = new Set();
  const lastCue = {};

  // Pre-render each cue once into a buffer, so playback is one buffer start (no synthesis at swipe time).
  const prerender = () => {
    if (rendering || !OfflineCtx || !ctx) return rendering;
    rendering = Promise.all([...Object.entries(CUES), ['intro', INTRO_CUE]].map(async ([name, cue]) => {
      try {
        const rate = ctx.sampleRate || 44100;
        const off = new OfflineCtx(1, Math.ceil(rate * cue.length), rate);
        if (name === 'intro') renderIntroCue(off, off.destination, 0.01); else renderCue(off, off.destination, cue, 0.01);
        const done = off.startRendering();
        buffers[name] = await (done && typeof done.then === 'function' ? done : new Promise((resolve) => { off.oncomplete = (e) => resolve(e.renderedBuffer); }));
      } catch { /* live synthesis instead */ }
    }));
    return rendering;
  };

  const unlock = (event) => {
    if (event && !isUnlockEvent(event)) return;
    if (!AudioCtx) return;
    if (!ctx) {
      try { ctx = new AudioCtx(); } catch { ctx = null; return; }
      // iOS: UI sounds mix with the member's music and follow the ring/silent switch.
      try { if (nav?.audioSession) nav.audioSession.type = 'ambient'; } catch { /* older Safari */ }
    }
    if (ctx.state !== 'running') {
      ctx.resume?.().catch?.(() => {});
      // iOS needs a sound started inside the gesture: one silent sample.
      try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100); s.connect(ctx.destination); s.start(0); } catch { /* fine */ }
    }
    unlocked = true;
    prerender();
  };
  // Every gesture a browser accepts, until audio runs (iOS can suspend it again later: the next gesture resumes it).
  ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'click', 'keydown']
    .forEach((type) => doc?.addEventListener?.(type, (e) => { if (!ctx || ctx.state !== 'running') unlock(e); }, { capture: true, passive: true }));

  const stopCurrent = () => {
    if (!current) return;
    const { src, gain } = current;
    current = null;
    try {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues?.(t);
      gain.gain.setValueAtTime?.(gain.gain.value, t);
      gain.gain.linearRampToValueAtTime?.(0.0001, t + 0.04);
      src?.stop?.(t + 0.05);
    } catch { /* already stopped */ }
  };

  const play = (name) => {
    const allowed = name === 'notify' ? enabled() : interactions();
    if (!allowed || !unlocked || !ctx) return false;
    const level = volumeGain(volume());
    if (level <= 0) return false;
    if (ctx.state !== 'running') ctx.resume?.().catch?.(() => {});
    stopCurrent();
    const gain = ctx.createGain();
    gain.gain.value = level;
    // A soft limiter: loud enough on laptop and phone speakers, never distorted at 100%.
    let out = ctx.destination;
    if (ctx.createDynamicsCompressor) {
      if (!limiter) {
        limiter = ctx.createDynamicsCompressor();
        [['threshold', -4], ['knee', 4], ['ratio', 12], ['attack', 0.002], ['release', 0.12]].forEach(([k, v]) => { if (limiter[k]) limiter[k].value = v; });
        limiter.connect(ctx.destination);
      }
      out = limiter;
    }
    gain.connect(out);
    let src = null;
    if (buffers[name] && ctx.createBufferSource) {
      src = ctx.createBufferSource();
      src.buffer = buffers[name];
      src.connect(gain);
      src.start();
    } else {
      const at = (ctx.currentTime || 0) + 0.01;            // not rendered yet: synthesize live
      if (name === 'intro') renderIntroCue(ctx, gain, at); else renderCue(ctx, gain, CUES[name], at);
    }
    const entry = { src, gain };
    current = entry;
    if (src) src.onended = () => { if (current === entry) current = null; };
    return true;
  };

  // A genuinely new notification: once per id, ever, in this tab.
  const notify = (id = '') => {
    if (id && playedIds.has(id)) return false;
    const ok = play('notify');
    if (ok && id) playedIds.add(id);
    return ok;
  };
  // A committed swipe: 'pass' (left) or 'pitch' (right). One per swipe; a repeat within 180 ms is the same swipe.
  const swipe = (direction) => {
    const name = direction === 'pitch' ? 'pitch' : direction === 'pass' ? 'pass' : null;
    if (!name) return false;
    const t = now();
    if (t - (lastCue[name] || 0) < 180) return false;
    lastCue[name] = t;
    return play(name);
  };
  // D-164: the deck's arrival. Follows the swipe-sounds switch and the volume. Browsers only let a page make sound
  // after the member's first tap, click or key on it, so on a fresh reload the arrival is silent unless this page was
  // already allowed (unlockIfAllowed); after any tap (Curated / Nearby, Try again, sign-in on this page) it plays.
  const intro = () => play('intro');
  const unlockIfAllowed = () => {
    if (unlocked) return true;
    let allowed = false;
    try { allowed = Boolean(nav?.userActivation?.hasBeenActive) || nav?.getAutoplayPolicy?.('audiocontext') === 'allowed'; } catch { allowed = false; }
    if (allowed) unlock();
    return unlocked;
  };
  return {
    notify, swipe, unlock, intro, unlockIfAllowed, preview: () => play('notify'),
    play: notify,                                    // D-134 name
    isUnlocked: () => unlocked, ready: () => rendering || Promise.resolve(),
  };
};

// D-134 name.
export const createChime = createSoundKit;
