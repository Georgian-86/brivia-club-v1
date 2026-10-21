// Typing indicator (polish wave D5): the pure parts. No DOM and no Supabase here; app.js wires them to a private
// Realtime broadcast channel. The payload is only ever { typing: boolean }: never any of the draft.
export const TYPING_THROTTLE_MS = 2000;
export const TYPING_IDLE_MS = 4000;
export const TYPING_EVENT = 'typing';

// typing:<lower id>:<higher id>, lower case, in plain code-unit order: the same string from both members, and the
// shape brivia_private.brivia_typing_topic_ok (0012 D2) accepts ("C" collation order of two lower-case uuids).
export const typingTopic = (a, b) => {
  const [lo, hi] = [String(a).toLowerCase(), String(b).toLowerCase()].sort();
  return `typing:${lo}:${hi}`;
};

// At most one { typing: true } per throttleMs while the member types; stop() sends one { typing: false } if a true
// went out since the last stop, and the next keystroke after a stop sends at once.
export const createTypingSender = ({ send, now = Date.now, throttleMs = TYPING_THROTTLE_MS }) => {
  let lastSent = null;
  let active = false;
  return {
    onInput() {
      const t = now();
      if (lastSent !== null && t - lastSent < throttleMs) return;
      lastSent = t;
      active = true;
      send({ typing: true });
    },
    stop() {
      if (!active) return;
      active = false;
      lastSent = null;
      send({ typing: false });
    },
  };
};

// Shown on { typing: true } (one onChange(true) per burst), hidden on { typing: false } or after idleMs without a
// signal. reset() hides at once and clears the timer (leaving a thread, a block).
export const createTypingReceiver = ({ onChange, setTimeout: set = globalThis.setTimeout, clearTimeout: clear = globalThis.clearTimeout, idleMs = TYPING_IDLE_MS }) => {
  let shown = false;
  let timer = null;
  const stopTimer = () => { if (timer !== null) { clear(timer); timer = null; } };
  const hide = () => {
    stopTimer();
    if (!shown) return;
    shown = false;
    onChange(false);
  };
  return {
    onSignal(signal) {
      if (signal?.typing !== true) { hide(); return; }
      stopTimer();
      timer = set(() => { timer = null; hide(); }, idleMs);
      if (shown) return;
      shown = true;
      onChange(true);
    },
    reset: hide,
  };
};
