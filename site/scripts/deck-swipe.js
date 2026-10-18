// The deck's heavy, physical swipe (founder live test, 2026-10-14). Pure gesture maths, unit-tested in
// tests/unit/deck-swipe.test.mjs, plus a small DOM controller that app.js wires to the deck card.
//
// Left = Pass, right = Pitch. A right swipe only opens the pitch sheet (the card parks to the right); it never sends a
// signal or makes a match by itself (mutual consent, CLAUDE.md). The buttons and the arrow keys use the same motion.
// Only horizontal drags are captured (touch-action: pan-y and an 8 px axis lock), so vertical page scroll still works.

export const SWIPE = Object.freeze({
  maxRotate: 12,        // deg, reached at half the card width
  commitRatio: 0.3,     // |dx| past 30% of the card width commits
  flingVelocity: 0.6,   // px/ms: a faster fling commits even when short
  minFlingDx: 16,       // px: a tap-sized jitter never commits
  axisLock: 8,          // px before the drag axis is decided
  minFly: 260,          // ms
  maxFly: 420,          // ms
  buttonFly: 280,       // ms: Pass / Pitch buttons and arrow keys
  sampleWindow: 100,    // ms of pointer samples used for the release velocity
  restBeforeRelease: 80, // ms: held still this long before letting go means no fling
  flyMargin: 80,        // px past the viewport edge, so the rotated corners leave too
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const sign = (value) => (value < 0 ? -1 : 1);

// Rotation follows the horizontal offset: 0 at rest, +-12 deg at half the card width and beyond.
export const rotationFor = (dx, width) => {
  if (!(width > 0)) return 0;
  const turn = clamp(dx / (width / 2), -1, 1) * SWIPE.maxRotate;
  return Math.round(turn * 100) / 100 || 0;
};

// The PASS / PITCH stamp: 0 at rest, fully shown at the commit distance.
export const stampOpacity = (dx, width) => {
  if (!(width > 0)) return 0;
  return Math.round(clamp(Math.abs(dx) / (width * SWIPE.commitRatio), 0, 1) * 1000) / 1000;
};

// How far the card underneath has risen (0 = resting small behind, 1 = in place).
export const stackProgress = stampOpacity;

// 'pass' | 'pitch' | null (spring back). Distance past 30% of the width, or a fling in the drag's own direction.
export const commitDecision = ({ dx = 0, vx = 0, width = 0 } = {}) => {
  if (width > 0 && Math.abs(dx) > width * SWIPE.commitRatio) {
    // Flung hard back towards the centre: the member changed their mind.
    if (Math.abs(vx) > SWIPE.flingVelocity && sign(vx) !== sign(dx)) return null;
    return dx > 0 ? 'pitch' : 'pass';
  }
  if (Math.abs(dx) >= SWIPE.minFlingDx && Math.abs(vx) > SWIPE.flingVelocity && sign(vx) === sign(dx)) {
    return dx > 0 ? 'pitch' : 'pass';
  }
  return null;
};

// Fly-off time from the release speed: momentum carries a fast fling off quickly; a slow push glides, 260-420 ms.
export const flyDuration = (vx, distance) => {
  const speed = Math.abs(vx);
  if (!(speed > 0)) return SWIPE.maxFly;
  return Math.round(clamp(Math.abs(distance) / speed, SWIPE.minFly, SWIPE.maxFly));
};

// null until the pointer has moved 8 px; then 'x' only when clearly horizontal (a tie scrolls the page).
export const axisFor = (dx, dy) => {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE.axisLock) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
};

// px/ms over the samples in the last 100 ms ([{ x, t }], oldest first).
export const velocityFrom = (samples) => {
  if (!Array.isArray(samples) || samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const recent = samples.filter((sample) => last.t - sample.t <= SWIPE.sampleWindow);
  const first = recent[0];
  const elapsed = last.t - first.t;
  return elapsed > 0 ? (last.x - first.x) / elapsed : 0;
};

// The speed at release: the recent moves' velocity, or 0 when the pointer rested (> 80 ms) before letting go.
export const releaseVelocity = (moves, releaseT) => {
  if (!Array.isArray(moves) || !moves.length) return 0;
  if (releaseT - moves[moves.length - 1].t > SWIPE.restBeforeRelease) return 0;
  return velocityFrom(moves);
};

// Signed px the card travels from where it is now to fully outside the viewport.
export const flyDistance = (direction, { left, right, viewport }) => (direction === 'pitch'
  ? viewport - left + SWIPE.flyMargin
  : -(right + SWIPE.flyMargin));

// ---- DOM controller ----------------------------------------------------------------------------------------------
// card: the swipe card element; stack: its wrapper (holds the card underneath).
// canDrag(): whether a drag may start now. onCommit(direction, { vx }): the app's action; return false to refuse
// (the card springs back). Returns { flyOut, park, settle, reset, enter }.
const SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';   // overshoot, then settle
const GLIDE = 'cubic-bezier(.2, .7, .2, 1)';        // the --ease token's curve
const wait = (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); });

export const createDeckSwipe = ({ card, stack, canDrag = () => true, onCommit = () => false } = {}) => {
  if (!card) return null;
  const reduced = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const host = stack || card;
  let drag = null;
  let suppressClickUntil = 0;
  let pose = { x: 0, y: 0, r: 0 };

  const setVars = ({ pass = 0, pitch = 0, rise = 0 } = {}) => {
    card.style.setProperty('--swipe-pass', String(pass));
    card.style.setProperty('--swipe-pitch', String(pitch));
    host.style.setProperty('--swipe-rise', String(rise));
  };
  const place = (x, y, r, transition = 'none') => {
    pose = { x, y, r };
    card.style.transition = transition;
    card.style.transform = x || y || r ? `translate3d(${x}px, ${y}px, 0) rotate(${r}deg)` : '';
  };
  const stampsFor = (dx, width) => {
    const amount = stampOpacity(dx, width);
    return { pass: dx < 0 ? amount : 0, pitch: dx > 0 ? amount : 0, rise: stackProgress(dx, width) };
  };
  const vibrate = () => { try { navigator.vibrate?.(10); } catch { /* not supported */ } };

  // Back to the centre with an overshoot (a short drag, a refused commit, a cancelled or failed pitch).
  const settle = () => {
    host.classList.remove('is-flying');
    card.classList.remove('is-held', 'is-parked');
    const motion = reduced() ? 'none' : `transform 420ms ${SPRING}`;
    host.style.setProperty('--swipe-rise-speed', reduced() ? '0ms' : '420ms');
    place(0, 0, 0, motion);
    card.style.opacity = '';
    setVars();
  };

  // Off-screen in the swipe direction with momentum. Resolves when the card is gone.
  const flyOut = (direction, { vx = 0, duration } = {}) => {
    card.classList.remove('is-held', 'is-parked');
    host.classList.add('is-flying');
    vibrate();
    if (reduced()) {
      setVars({ pass: direction === 'pass' ? 1 : 0, pitch: direction === 'pitch' ? 1 : 0, rise: 1 });
      host.style.setProperty('--swipe-rise-speed', '0ms');
      place(0, 0, 0, 'opacity 140ms linear');
      card.style.opacity = '0';
      return wait(150);
    }
    const rect = card.getBoundingClientRect();
    const distance = flyDistance(direction, { left: rect.left, right: rect.right, viewport: window.innerWidth });
    const ms = duration || flyDuration(vx, distance);
    const turn = (direction === 'pitch' ? 1 : -1) * (SWIPE.maxRotate + 6);
    host.style.setProperty('--swipe-rise-speed', `${ms}ms`);
    setVars({ pass: direction === 'pass' ? 1 : 0, pitch: direction === 'pitch' ? 1 : 0, rise: 1 });
    place(pose.x + distance, pose.y + 24, turn, `transform ${ms}ms ${GLIDE}`);
    return wait(ms + 20);
  };

  // A pitch keeps its card on screen, parked a little to the right with the PITCH stamp, until the sheet resolves.
  const park = () => {
    card.classList.remove('is-held');
    card.classList.add('is-parked');
    host.classList.remove('is-flying');
    host.style.setProperty('--swipe-rise-speed', reduced() ? '0ms' : '360ms');
    setVars({ pitch: 1, rise: 0.35 });
    if (reduced()) { place(0, 0, 0, 'none'); return; }
    const width = card.offsetWidth || 400;
    place(Math.min(width * 0.08, 40), 4, 3, `transform 360ms ${SPRING}`);
  };

  // Snap back to the resting pose with no motion (the card now shows a different member).
  const reset = () => {
    host.classList.remove('is-flying');
    card.classList.remove('is-held', 'is-parked', 'is-entering');
    host.style.setProperty('--swipe-rise-speed', '0ms');
    place(0, 0, 0, 'none');
    card.style.opacity = '';
    setVars();
  };

  // The next member's card was already risen underneath; the top card takes its place with a short cross-fade.
  const enter = () => {
    reset();
    card.classList.add('is-entering');
    host.classList.add('is-restacking');
    window.setTimeout(() => {
      card.classList.remove('is-entering');
      host.classList.remove('is-restacking');
    }, 260);
  };

  const onPointerDown = (event) => {
    if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target.closest?.('input, textarea, select, [data-no-swipe], .card-more-menu')) return;
    if (!canDrag()) return;
    drag = { id: event.pointerId, x0: event.clientX, y0: event.clientY, axis: null, samples: [{ x: event.clientX, t: event.timeStamp }], width: card.offsetWidth || 1 };
  };
  const onPointerMove = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x0;
    const dy = event.clientY - drag.y0;
    if (!drag.axis) {
      drag.axis = axisFor(dx, dy);
      if (drag.axis === 'y') { drag = null; return; }       // a scroll: the page keeps it
      if (drag.axis !== 'x') return;
      try { card.setPointerCapture(event.pointerId); } catch { /* the pointer is gone */ }
      card.classList.add('is-held');
      host.classList.add('is-dragging');
    }
    event.preventDefault();
    drag.samples.push({ x: event.clientX, t: event.timeStamp });
    if (drag.samples.length > 12) drag.samples.shift();
    const still = reduced();
    place(dx, still ? 0 : dy * 0.12, still ? 0 : rotationFor(dx, drag.width));
    setVars(stampsFor(dx, drag.width));
  };
  const finish = (event, cancelled) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { axis, width } = drag;
    const dx = event.clientX - drag.x0;
    const vx = releaseVelocity(drag.samples, event.timeStamp);
    drag = null;
    host.classList.remove('is-dragging');
    try { card.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    if (axis !== 'x') return;
    suppressClickUntil = Math.abs(dx) > SWIPE.axisLock ? performance.now() + 450 : 0;
    card.classList.remove('is-held');
    const direction = cancelled ? null : commitDecision({ dx, vx, width });
    if (!direction || onCommit(direction, { vx }) === false) settle();
  };
  // No click-through: a drag never opens "View profile" or "Why this person?".
  const onClickCapture = (event) => {
    if (performance.now() < suppressClickUntil) {
      suppressClickUntil = 0;
      event.preventDefault();
      event.stopPropagation();
    }
  };

  card.addEventListener('pointerdown', onPointerDown);
  card.addEventListener('pointermove', onPointerMove);
  card.addEventListener('pointerup', (event) => finish(event, false));
  card.addEventListener('pointercancel', (event) => finish(event, true));
  // Touch pointers start captured by the touched child; moving the capture to the card fires lostpointercapture on
  // that child first (it bubbles here), which is not the end of the drag.
  card.addEventListener('lostpointercapture', (event) => { if (event.target === card && drag && event.pointerId === drag.id && drag.axis === 'x') finish(event, true); });
  card.addEventListener('click', onClickCapture, true);
  card.addEventListener('dragstart', (event) => event.preventDefault());
  setVars();

  return { flyOut, park, settle, reset, enter, isDragging: () => Boolean(drag?.axis === 'x') };
};
