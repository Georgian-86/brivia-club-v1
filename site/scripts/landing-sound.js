// Landing sound rules (D-063). Pure helpers, no DOM, no audio; script.js wires them to the Web Audio API.
//
// The music used to wait for a pointerdown / touchstart / keydown, once. Scrolling never unlocks audio in a browser,
// and on phones touchstart does not either, so a visitor who only scrolled heard nothing, and on a phone the one-shot
// listener was spent on a touchstart that could not start it. Now the page listens for every gesture a browser
// accepts until the sound has really started, and tries to start at load (some browsers allow it at once).

export const SOUND_LIMIT_MS = 5 * 60 * 1000;
export const SOUND_STORAGE_KEY = 'brivia-landing-sound';

// The visitor's saved choice: 'off' only when they turned the sound off; anything else is 'on'.
export const soundPreference = (stored) => (stored === 'off' ? 'off' : 'on');

// What the music should do now: 'off' (muted by the visitor), 'ended' (played its 5 minutes), 'wait' (no gesture yet)
// or 'play'.
export const soundPlan = ({ preference = 'on', unlocked = false, playedMs = 0 } = {}) => {
  if (preference === 'off') return 'off';
  if (playedMs >= SOUND_LIMIT_MS) return 'ended';
  return unlocked ? 'play' : 'wait';
};

// The gestures that let a page start audio (HTML "activation-triggering input events"): keydown except Escape,
// mousedown, a mouse pointerdown, a touch or pen pointerup, touchend and click. Never touchstart, wheel or scroll.
export const isUnlockEvent = (event) => {
  if (!event) return false;
  switch (event.type) {
    case 'keydown': return event.key !== 'Escape';
    case 'mousedown':
    case 'touchend':
    case 'click': return true;
    case 'pointerdown': return event.pointerType === 'mouse';
    case 'pointerup': return event.pointerType === 'touch' || event.pointerType === 'pen';
    default: return false;
  }
};

// Bar start times to queue now, on the audio clock: every bar starting before now + lookahead. A late queue (a
// throttled tab) restarts from now instead of playing the missed bars in a burst.
export const barsToSchedule = ({ now, nextBarAt, barLength, lookahead }) => {
  let at = nextBarAt < now ? now + 0.05 : nextBarAt;
  const bars = [];
  while (at < now + lookahead) { bars.push(Math.round(at * 1000) / 1000); at += barLength; }
  return bars;
};

// ---- D-220: one music control that always tells the truth ----

// The mute choice lives for the tab (sessionStorage), not forever: moving between the landing and the auth pages keeps
// it, a reload or a new visit starts with the music on again (founder: "on by default whenever the browser permits").
export const initialPreference = ({ stored = null, navigationType = 'navigate' } = {}) => (
  navigationType === 'reload' ? 'on' : soundPreference(stored)
);

// What the button says. `playing` is the real state: the music is wanted AND the audio clock is running.
// The label names the action a press will take, so it is never a "pressed" toggle with a changing name.
export const soundButtonView = (playing) => (playing
  ? { state: 'playing', label: 'Stop music' }
  : { state: 'stopped', label: 'Play music' });

// How far into the soundtrack the current pass is (s), to carry the position across an internal page change.
export const trackOffset = ({ now, passStart, duration }) => {
  if (!(duration > 0) || !(now >= passStart)) return 0;
  const offset = now - passStart;
  return offset >= duration - 0.5 ? 0 : Math.round(offset * 100) / 100;
};

// A missing or blocked soundtrack is retried a few times with a growing pause, never in a tight loop.
export const MAX_LOAD_ATTEMPTS = 3;
export const loadRetryDelayMs = (failures) => Math.min(8000, 1000 * 2 ** Math.max(0, failures - 1));

// A tiny silent WAV (0.05 s, 8 kHz, 8-bit) as a data: URI. Asking it to play, unmuted, tells the page whether the
// browser allows sound before a gesture without creating an AudioContext the browser would refuse (Chrome warns in
// the console for those). On older iPhones, looping it during the music moves the page into the "playback" audio
// session, so the music is heard with the ring switch on silent (iOS 17+ does this with navigator.audioSession).
export const silentWavDataUri = () => {
  const samples = 400;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (at, text) => { for (let i = 0; i < text.length; i += 1) bytes[at + i] = text.charCodeAt(i); };
  ascii(0, 'RIFF'); view.setUint32(4, 36 + samples, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  ascii(36, 'data'); view.setUint32(40, samples, true);
  bytes.fill(128, 44); // 8-bit PCM silence is the midpoint
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return `data:audio/wav;base64,${btoa(binary)}`;
};
