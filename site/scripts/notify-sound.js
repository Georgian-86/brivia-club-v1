// The Brivia notification chime (D-134): an original two-note bell made with the Web Audio API (no audio file). A soft
// fifth (A5 then E6) with a quick attack, a long gentle decay and a quiet octave shimmer, about 0.9 s, low volume.
// It plays only after the member has interacted with the page (browsers block audio before that), only when sound is
// on for this device, and never twice for the same notification id.

export const SOUND_KEY = 'brivia-notify-sound';
export const CHIME_NOTES = Object.freeze([
  { freq: 880, at: 0, gain: 0.11, decay: 0.85 },
  { freq: 1318.51, at: 0.13, gain: 0.08, decay: 0.75 },
  { freq: 1760, at: 0.13, gain: 0.018, decay: 0.45 },
]);

export const soundEnabled = (storage = globalThis.localStorage) => {
  try { return storage?.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
};
export const setSoundEnabled = (on, storage = globalThis.localStorage) => {
  try { storage?.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* memory only */ }
};

export const createChime = ({ win = globalThis.window, doc = globalThis.document, enabled = () => soundEnabled() } = {}) => {
  let ctx = null;
  let unlocked = false;
  const played = new Set();
  const AudioCtx = win?.AudioContext || win?.webkitAudioContext;
  // The first real interaction unlocks audio (autoplay rules); nothing is created before it.
  const unlock = () => {
    unlocked = true;
    if (AudioCtx && !ctx) { try { ctx = new AudioCtx(); } catch { ctx = null; } }
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach((type) => doc?.addEventListener?.(type, unlock, { once: true, passive: true }));

  // play(id): true when it played. Never before an interaction, never with sound off, never twice for one id.
  const play = (id = '') => {
    if (!enabled() || !unlocked || !ctx) return false;
    if (id && played.has(id)) return false;
    if (id) played.add(id);
    const now = ctx.currentTime + 0.02;
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(ctx.destination);
    CHIME_NOTES.forEach(({ freq, at, gain, decay }) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      env.gain.setValueAtTime(0.0001, now + at);
      env.gain.exponentialRampToValueAtTime(gain, now + at + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, now + at + decay);
      osc.connect(env).connect(out);
      osc.start(now + at);
      osc.stop(now + at + decay + 0.05);
    });
    return true;
  };
  return { play, unlock, isUnlocked: () => unlocked };
};
