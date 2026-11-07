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
// D-221: music is ON by default. While it is wanted but the browser still waits for a first touch (iPhone and most
// phones never allow sound before one), the button shows ON ("Music on", lit, inviting a tap), not "Play music",
// which read as off. Any tap on the page, or on the button, then starts it.
export const soundButtonView = ({ audible = false, waiting = false } = {}) => {
  if (audible) return { state: 'playing', label: 'Stop music', text: 'Stop music' };
  if (waiting) return { state: 'armed', label: 'Music on: tap anywhere to hear it', text: 'Music on' };
  return { state: 'stopped', label: 'Play music', text: 'Play music' };
};

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

// ---- D-222: Safari plays the landing's sound through media elements, not Web Audio ----

// Safari (Mac) and every iPhone/iPad browser (all WebKit) can leave a Web Audio context "running" while nothing
// reaches the speakers (WebKit bugs 276687, 231105: another tab's audio closing, a route change, an interruption), so
// the button said "Stop music" in silence. An <audio> element is WebKit's most reliable path, so there the soundtrack
// is a looping <audio> (the crossfade baked into the file) and the intro's cue a pre-rendered WAV. Chrome, Edge and
// Firefox keep Web Audio.
export const prefersMediaElementAudio = ({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) => {
  if (/iP(hone|ad|od)/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)) return true;
  return /Macintosh/.test(userAgent) && /Version\/[\d.]+.*Safari\//.test(userAgent)
    && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(userAgent);
};

// 16-bit PCM WAV bytes from Float32 channel data (-1..1), for a rendered cue an <audio> element can play.
export const wavBytes = (channels, rate) => {
  const count = channels.length;
  const frames = count ? channels[0].length : 0;
  const bytes = new Uint8Array(44 + frames * count * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at, text) => { for (let i = 0; i < text.length; i += 1) bytes[at + i] = text.charCodeAt(i); };
  ascii(0, 'RIFF'); view.setUint32(4, 36 + frames * count * 2, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, count, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * count * 2, true); view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, frames * count * 2, true);
  let at = 44;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < count; c += 1) {
      const s = Math.max(-1, Math.min(1, channels[c][i] || 0));
      view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      at += 2;
    }
  }
  return bytes;
};

// One step of a volume fade on an element (the media path's equivalent of a gain ramp), clamped to 0..1.
export const fadeVolume = ({ from, to, elapsed, duration }) => {
  if (!(duration > 0) || elapsed >= duration) return Math.max(0, Math.min(1, to));
  const t = Math.max(0, elapsed) / duration;
  return Math.max(0, Math.min(1, from + (to - from) * t));
};
