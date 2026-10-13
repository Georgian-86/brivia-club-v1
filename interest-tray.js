// Interest picking for the guided signup (Phase E Task 4, D-056): the "Your picks" tray. A tapped chip is cloned and
// flown (FLIP: first and last rects, transform and opacity, 220 ms, --ease) into its slot in the tray; removing a pick
// flies it back. Under reduced motion only opacity changes. The pure parts at the top are unit-tested; the DOM helpers
// below touch only the elements they are given and never run at import time.
import { MAX_INTERESTS } from './passion-budget.js';

export const MAX_PICKS = MAX_INTERESTS;
// 220 ms is the D-056 brief's flight; tokens.css has 150/200/250 and no 220, so it stays a literal.
export const FLY_MS = 220;
// The other durations come from tokens.css (the literals are only the fallback when a token cannot be read).
const BUMP_TOKEN = ['--motion-fast', 150];
const FADE_TOKEN = ['--motion-fade', 200];  // stays on under reduced motion (fades are allowed)
const SLIDE_TOKEN = ['--motion-base', 200];

// "150ms" / "0.15s" -> 150; anything else -> fallback.
export const parseMs = (value, fallback) => {
  const text = String(value ?? '').trim();
  const match = text.match(/^(-?\d*\.?\d+)(ms|s)$/);
  if (!match) return fallback;
  const n = Number(match[1]) * (match[2] === 's' ? 1000 : 1);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// The phone tray's collapsed row: how many of the newest picks fit whole in `available` px. widths are in pick order
// (oldest first); gap is the space between items; moreWidth the "+n more" button, needed only when some do not fit.
// Returns { visible, hidden }: the last `visible` picks show, the first `hidden` sit behind "+n more".
export const fitNewest = (widths, available, gap, moreWidth) => {
  const list = Array.isArray(widths) ? widths : [];
  const total = list.reduce((sum, w, i) => sum + w + (i ? gap : 0), 0);
  if (total <= available) return { visible: list.length, hidden: 0 };
  let used = 0;
  let visible = 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const next = used + list[i] + (visible ? gap : 0);
    if (next + gap + moreWidth > available) break;
    used = next;
    visible += 1;
  }
  return { visible, hidden: list.length - visible };
};

export const pickedText = (count) => `${count} picked`;
export const trayAnnouncement = (label, change) => `${label} ${change === 'removed' ? 'removed' : 'added'}`;

// Picks are [{ id, label, sensitive }] in pick order. Returns { picks, result: 'added' | 'removed' | 'full' } and never
// mutates its input (a refused 13th pick returns the same array).
export const togglePick = (picks, item) => {
  const list = Array.isArray(picks) ? picks : [];
  if (list.some((pick) => pick.id === item.id)) return { picks: list.filter((pick) => pick.id !== item.id), result: 'removed' };
  if (list.length >= MAX_PICKS) return { picks: list, result: 'full' };
  return { picks: [...list, { id: item.id, label: item.label, sensitive: Boolean(item.sensitive) }], result: 'added' };
};

// The server floor: at least one interest that is not private.
export const canContinue = (picks) => (Array.isArray(picks) ? picks : []).some((pick) => !pick.sensitive);

// The transform (origin top left) that moves and scales rect `from` onto rect `to`.
export const flipTransform = (from, to) => {
  const round = (n) => Math.round(n * 1000) / 1000;
  const sx = from.width > 0 && to.width > 0 ? to.width / from.width : 1;
  const sy = from.height > 0 && to.height > 0 ? to.height / from.height : 1;
  return `translate(${round(to.left - from.left)}px, ${round(to.top - from.top)}px) scale(${round(sx)}, ${round(sy)})`;
};

// ---- DOM helpers ---------------------------------------------------------------------------------------------------

export const prefersReducedMotion = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const easing = () => (globalThis.getComputedStyle?.(document.documentElement).getPropertyValue('--ease').trim()) || 'cubic-bezier(.2, .7, .2, 1)';
const visible = (rect) => rect && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < globalThis.innerHeight;
const settled = (animation) => animation?.finished?.catch(() => {}) || Promise.resolve();
const tokenMs = ([name, fallback]) => parseMs(globalThis.getComputedStyle?.(document.documentElement).getPropertyValue(name), fallback);

// Flights in progress: { animation, clone, to }. settleFlights() ends them at once (clone gone, target shown), so a
// tap that changes the tray never measures a target that is still hidden or about to move.
const flights = new Set();
export const settleFlights = () => {
  for (const flight of flights) {
    flight.animation.cancel();
    flight.clone.remove();
    if (flight.to) flight.to.style.visibility = '';
  }
  flights.clear();
};

// A light tap on phones that support it.
export const buzz = () => { try { globalThis.navigator?.vibrate?.(8); } catch { /* not supported */ } };

// The count pill bumps (scale 1 -> 1.12 -> 1). Nothing under reduced motion.
export const bump = (node, reduced = prefersReducedMotion()) => {
  if (!node?.animate || reduced) return;
  node.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: tokenMs(BUMP_TOKEN), easing: easing() });
};

// Flies a clone of `from` onto `to` inside `host` (an untransformed ancestor, so position: fixed is the viewport).
// `to` stays hidden until the clone lands. With no visible target the clone fades out where it is (a pick removed
// while its chip is scrolled away or filtered out). `fade` (a removal) lets the clone dissolve into its target.
// Under reduced motion: no clone; `to` fades in.
export const flyChip = ({ from, to = null, host, reduced = prefersReducedMotion(), duration = FLY_MS, fade = false }) => {
  const first = from?.getBoundingClientRect?.();
  if (reduced || !host || !from?.isConnected || !visible(first) || typeof from.animate !== 'function') {
    if (to?.animate) return settled(to.animate([{ opacity: 0 }, { opacity: 1 }], { duration: tokenMs(FADE_TOKEN), easing: 'linear' }));
    return Promise.resolve();
  }
  const last = to?.getBoundingClientRect?.();
  const clone = from.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  // Not a real chip or pick: no data-* hooks (queries for [data-interest-id] / [data-pick-id] must never match it).
  [clone, ...clone.querySelectorAll('*')].forEach((node) => Object.keys(node.dataset || {}).forEach((key) => { delete node.dataset[key]; }));
  clone.classList.add('it-fly');
  clone.setAttribute('aria-hidden', 'true');
  clone.setAttribute('tabindex', '-1');
  clone.inert = true;
  // A pick tapped again mid-flight is still hidden (it was the target); its clone must not copy that.
  clone.style.visibility = '';
  Object.assign(clone.style, {
    position: 'fixed', left: `${first.left}px`, top: `${first.top}px`, width: `${first.width}px`, height: `${first.height}px`,
    margin: '0', transformOrigin: '0 0', pointerEvents: 'none', zIndex: '60',
  });
  host.append(clone);
  if (to) to.style.visibility = 'hidden';
  const frames = visible(last)
    ? [{ transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1 }, { transform: flipTransform(first, last), opacity: fade ? 0.2 : 0.92 }]
    : [{ transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1 }, { transform: 'translate(0px, 8px) scale(0.92, 0.92)', opacity: 0 }];
  const animation = clone.animate(frames, { duration, easing: easing(), fill: 'forwards' });
  const flight = { animation, clone, to };
  flights.add(flight);
  return settled(animation).then(() => {
    if (!flights.delete(flight)) return;  // settleFlights() already cleaned up
    clone.remove();
    if (to) to.style.visibility = '';
  });
};

// FLIP for a list whose order changes (the tray's other picks close the gap when one leaves): records each node's
// rect, runs `mutate`, then slides every node that moved from its old place. A node that was not laid out before (a
// pick coming back from behind "+n more") just appears. Nothing moves under reduced motion.
export const flipList = (nodes, mutate, { reduced = prefersReducedMotion(), duration = tokenMs(SLIDE_TOKEN) } = {}) => {
  const list = [...nodes];
  const before = new Map(list.map((node) => [node, node.getBoundingClientRect()]));
  mutate();
  if (reduced) return;
  list.forEach((node) => {
    if (!node.isConnected || typeof node.animate !== 'function') return;
    const was = before.get(node);
    const now = node.getBoundingClientRect();
    if (!was.width || !now.width) return;
    const dx = was.left - now.left;
    const dy = was.top - now.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }], { duration, easing: easing() });
  });
};
