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
