// D-163: the moments after the deck's arrival (D-162), from "Where motion fits next" (N1-N10). GSAP for the
// choreographed ones, CSS (site/styles/motion.css) for the small ones. Every one respects prefers-reduced-motion:
// no travel, no rotation, a short fade at most. Nothing here decides anything: mutual consent, signals and chat stay
// where they were (app.js); these only show what already happened.
//
//   N1 mutualMoment      "It's mutual": both avatars glide in and meet, one wine ring, the shared interests pop in.
//   N2 pitchSentFlight   a small letter flies from the card to the bell, which gives a little ring.
//   N3 flipIn            the "You're caught up" box turns in like the back of the last card.
//   N5 attachCardTilt    desktop only: the top card leans a few degrees towards the cursor, with a soft light.
//   N6 shimmerShared     a new card's "You both" chips catch the light once.
//   N7 slideModePill     the Curated / Nearby pill slides from the old option to the new one.
//   N9 markArrivals      a new chat bubble rises in (only bubbles that were not on screen before).
//   N10 revealOnScroll   event covers settle in as they scroll into view (first 8, once).
// (N4, the Passion Budget fill, waits for the profile redesign; N8's Nearby radar is CSS only.)

import { gsap } from 'gsap';

const prefersReduced = (win = globalThis.window) => Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const finePointer = (win = globalThis.window) => Boolean(win?.matchMedia?.('(hover: hover) and (pointer: fine)').matches);

// Timings, unit-tested (tests/unit/motion-moments.test.mjs).
export const MOMENTS = Object.freeze({
  mutual: Object.freeze({ backdrop: 0.22, meet: 0.62, meetAt: 0.12, ring: 1.0, ringAt: 0.6, title: 0.5, titleAt: 0.5, chipAt: 0.78, chipStagger: 0.08, actionsAt: 0.95 }),
  letter: Object.freeze({ pop: 0.16, fly: 0.62, ring: 0.42 }),
  flip: 0.55,
  tilt: Object.freeze({ max: 4 }),   // degrees, reached at the card's edge
  reveal: Object.freeze({ max: 8, from: 1.06, dur: 0.7 }),
});

// The tilt for a pointer at (px, py), each 0..1 across the card: the axis to rotate about and the angle (degrees).
// Leaning towards the cursor: a point on the right comes forward (rotate about y), the top comes forward (about x).
export const tiltFor = (px, py, max = MOMENTS.tilt.max) => {
  const clamp = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5));
  const x = (clamp(px) - 0.5) * 2;
  const y = (clamp(py) - 0.5) * 2;
  const ax = -y * max;
  const ay = x * max;
  const angle = Math.round(Math.hypot(ax, ay) * 100) / 100;
  return { ax: Math.round(ax * 100) / 100 || 0, ay: Math.round(ay * 100) / 100 || 0, angle };
};

// Which bubbles are new since the last render of the same chat. First render of a chat: none (no replay).
export const arrivalsBetween = (previous, current, sameChat) => (sameChat && previous ? current.filter((id) => !previous.has(id)) : []);

const initials = (name = '') => String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '·';
const avatar = (doc, { name, photoUrl }, side) => {
  const el = doc.createElement('span');
  el.className = `mutual-avatar is-${side}`;
  if (photoUrl) {
    const img = doc.createElement('img');
    img.src = photoUrl;
    img.alt = '';
    img.decoding = 'async';
    el.append(img);
  } else el.textContent = initials(name);
  return el;
};

// N1. Resolves 'chat' (Say hi) or 'close'. The sound is the caller's (it knows the member's sound switches).
export const mutualMoment = ({ me = {}, person = {}, shared = [], doc = globalThis.document, reduced = prefersReduced(), onSound } = {}) => new Promise((resolve) => {
  if (!doc?.body) { resolve('close'); return; }
  const returnFocus = doc.activeElement;
  const root = doc.createElement('div');
  root.className = 'mutual-moment';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'mutual-moment-title');
  const backdrop = doc.createElement('div');
  backdrop.className = 'mutual-backdrop';
  const panel = doc.createElement('div');
  panel.className = 'mutual-panel';
  const pair = doc.createElement('div');
  pair.className = 'mutual-pair';
  const ring = doc.createElement('span');
  ring.className = 'mutual-ring';
  ring.setAttribute('aria-hidden', 'true');
  const left = avatar(doc, me, 'me');
  const right = avatar(doc, person, 'them');
  pair.append(ring, left, right);
  const eyebrow = doc.createElement('p');
  eyebrow.className = 'app-eyebrow mutual-eyebrow';
  eyebrow.textContent = "IT'S MUTUAL";
  const title = doc.createElement('h2');
  title.id = 'mutual-moment-title';
  title.className = 'mutual-title';
  title.append(`You and ${person.name || 'your new connection'}`, doc.createElement('br'));
  const em = doc.createElement('em');
  em.textContent = 'both said yes.';
  title.append(em);
  const chips = doc.createElement('div');
  chips.className = 'mutual-chips';
  shared.filter((s) => typeof s === 'string' && s.trim()).slice(0, 3).forEach((label) => {
    const chip = doc.createElement('span');
    chip.textContent = label.trim();
    chips.append(chip);
  });
  const actions = doc.createElement('div');
  actions.className = 'mutual-actions';
  const hi = doc.createElement('button');
  hi.type = 'button';
  hi.className = 'mutual-hi';
  hi.textContent = 'Say hi';
  const later = doc.createElement('button');
  later.type = 'button';
  later.className = 'mutual-later';
  later.textContent = 'Keep exploring';
  actions.append(hi, later);
  panel.append(pair, eyebrow, title, ...(chips.childElementCount ? [chips] : []), actions);
  root.append(backdrop, panel);
  doc.body.append(root);

  let done = false;
  const close = (result) => {
    if (done) return;
    done = true;
    (doc.defaultView || doc).removeEventListener('keydown', onKey, true);
    const finish = () => { root.remove(); if (result !== 'chat') returnFocus?.focus?.({ preventScroll: true }); resolve(result); };
    if (reduced) finish();
    else gsap.to(root, { opacity: 0, duration: 0.18, ease: 'power1.in', onComplete: finish });
  };
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close('close'); return; }
    if (e.key === 'Tab') {   // keep focus inside the two buttons
      const items = [hi, later];
      const i = items.indexOf(doc.activeElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
    }
  }
  (doc.defaultView || doc).addEventListener('keydown', onKey, true);   // window capture: before any app-level Escape handler
  hi.addEventListener('click', () => close('chat'));
  later.addEventListener('click', () => close('close'));
  backdrop.addEventListener('click', () => close('close'));
  hi.focus({ preventScroll: true });

  const m = MOMENTS.mutual;
  if (reduced) { gsap.from(root, { opacity: 0, duration: 0.15, ease: 'none' }); return; }
  onSound?.();
  const tl = gsap.timeline();
  tl.from(backdrop, { opacity: 0, duration: m.backdrop, ease: 'power1.out' }, 0)
    .from(panel, { y: 24, scale: 0.96, opacity: 0, duration: 0.42, ease: 'power3.out' }, 0.02)
    .from(left, { x: -120, rotation: -10, opacity: 0, duration: m.meet, ease: 'power3.out' }, m.meetAt)
    .from(right, { x: 120, rotation: 10, opacity: 0, duration: m.meet, ease: 'power3.out' }, m.meetAt)
    // the touch: both lean in, then settle
    .to([left, right], { scale: 1.06, duration: 0.14, ease: 'power2.out' }, m.ringAt - 0.04)
    .to([left, right], { scale: 1, duration: 0.36, ease: 'back.out(2)' }, m.ringAt + 0.1)
    .fromTo(ring, { scale: 0.55, opacity: 0.7 }, { scale: 1.9, opacity: 0, duration: m.ring, ease: 'power2.out' }, m.ringAt)
    .from([eyebrow, title], { y: 14, opacity: 0, duration: m.title, ease: 'power3.out', stagger: 0.06 }, m.titleAt);
  if (chips.childElementCount) tl.from(chips.children, { scale: 0.6, opacity: 0, duration: 0.36, ease: 'back.out(2.2)', stagger: m.chipStagger }, m.chipAt);
  tl.from(actions.children, { y: 10, opacity: 0, duration: 0.36, ease: 'power3.out', stagger: 0.06 }, m.actionsAt);
  tl.eventCallback('onComplete', () => gsap.set([left, right, ring, panel, eyebrow, title, ...actions.children, ...chips.children], { clearProps: 'transform,opacity' }));
});

// N2. from: an element or DOMRect where the pitch left (the card); to: the bell. Fire and forget.
export const pitchSentFlight = ({ from, to, doc = globalThis.document, reduced = prefersReduced() } = {}) => {
  if (reduced || !doc?.body || !from || !to) return Promise.resolve(false);
  const a = typeof from.getBoundingClientRect === 'function' ? from.getBoundingClientRect() : from;
  const b = to.getBoundingClientRect();
  if (!a?.width || !b?.width) return Promise.resolve(false);
  const letter = doc.createElement('span');
  letter.className = 'pitch-letter';
  letter.setAttribute('aria-hidden', 'true');
  letter.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.2"/><path d="m4 7 8 6 8-6"/></svg>';
  doc.body.append(letter);
  const size = 34;
  const x0 = a.left + a.width / 2 - size / 2;
  const y0 = a.top + a.height * 0.42 - size / 2;
  const x1 = b.left + b.width / 2 - size / 2;
  const y1 = b.top + b.height / 2 - size / 2;
  const peak = Math.min(y0, y1) - Math.max(60, Math.abs(x1 - x0) * 0.18);   // an arc, up and over
  const L = MOMENTS.letter;
  return new Promise((resolve) => {
    gsap.set(letter, { x: x0, y: y0, scale: 0.4, opacity: 0, rotation: -12 });
    gsap.timeline({ onComplete: () => { letter.remove(); resolve(true); } })
      .to(letter, { scale: 1, opacity: 1, rotation: 0, duration: L.pop, ease: 'back.out(2)' })
      .to(letter, { keyframes: { x: [x0, (x0 + x1) / 2, x1], y: [y0, peak, y1], easeEach: 'sine.inOut' }, duration: L.fly, ease: 'power1.inOut' })
      .to(letter, { scale: 0.3, opacity: 0, rotation: 18, duration: L.fly * 0.35, ease: 'power2.in' }, `-=${L.fly * 0.35}`)
      .to(to, { keyframes: { rotation: [0, -14, 11, -6, 3, 0] }, duration: L.ring, ease: 'none', transformOrigin: '50% 8%', clearProps: 'transform' }, '-=0.06');
  });
};

// N3. The caught-up box turns in, as if the last card flipped over.
export const flipIn = (el, { reduced = prefersReduced() } = {}) => {
  if (!el) return null;
  if (reduced) return gsap.from(el, { opacity: 0, duration: 0.15, clearProps: 'opacity' });
  return gsap.from(el, { rotationY: -78, transformPerspective: 1000, transformOrigin: '50% 50%', opacity: 0, scale: 0.96, duration: MOMENTS.flip, ease: 'power3.out', clearProps: 'transform,opacity' });
};

// N5. Desktop only (a fine pointer that can hover). Never while dragging, during the intro, or under reduced motion.
// The lean uses the CSS `rotate` property, which composes with deck-swipe.js's inline `transform` instead of fighting it.
export const attachCardTilt = ({ card, stack, win = globalThis.window, enabled = () => true } = {}) => {
  if (!card || !stack || !finePointer(win) || prefersReduced(win)) return () => {};
  const light = card.ownerDocument.createElement('span');
  light.className = 'deck-tilt-light';
  light.setAttribute('aria-hidden', 'true');
  card.append(light);
  // A proxy eased by GSAP, so the lean glides even though deck-swipe.js owns the card's inline transition.
  const lean = { ax: 0, ay: 0 };
  const paint = () => {
    const angle = Math.round(Math.hypot(lean.ax, lean.ay) * 100) / 100;
    if (angle < 0.02) { card.style.removeProperty('rotate'); return; }
    card.style.setProperty('rotate', `${lean.ax.toFixed(3)} ${lean.ay.toFixed(3)} 0 ${angle}deg`);
  };
  const go = (ax, ay, duration = 0.35) => gsap.to(lean, { ax, ay, duration, ease: 'power2.out', overwrite: true, onUpdate: paint });
  const reset = (instant) => {
    card.classList.remove('is-tilting');
    if (instant === true) { gsap.killTweensOf(lean); lean.ax = 0; lean.ay = 0; paint(); return; }
    go(0, 0, 0.5);
  };
  const blocked = () => !enabled() || stack.classList.contains('is-intro') || stack.classList.contains('is-dragging')
    || stack.classList.contains('is-flying') || card.classList.contains('is-held') || card.classList.contains('is-parked');
  const onMove = (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    if (blocked()) { reset(true); return; }
    const r = card.getBoundingClientRect();
    if (!r.width) return;
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const t = tiltFor(px, py);
    card.classList.add('is-tilting');
    go(t.ax, t.ay);
    light.style.setProperty('--tilt-lx', `${Math.round(px * 100)}%`);
    light.style.setProperty('--tilt-ly', `${Math.round(py * 100)}%`);
  };
  const onDown = () => reset(true);
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerleave', reset);
  card.addEventListener('pointerdown', onDown, true);
  return () => { reset(true); light.remove(); card.removeEventListener('pointermove', onMove); card.removeEventListener('pointerleave', reset); card.removeEventListener('pointerdown', onDown, true); };
};

// N6. Once per card: the shared chips catch the light (CSS animation; reduced motion turns it off in CSS).
export const shimmerShared = (container) => {
  container?.querySelectorAll('.chip-shared').forEach((chip, i) => {
    chip.classList.remove('is-shimmer');
    chip.style.setProperty('--shimmer-delay', `${0.35 + i * 0.14}s`);
    void chip.offsetWidth;   // restart the animation
    chip.classList.add('is-shimmer');
  });
};

// N7. Adds a sliding pill to a Curated / Nearby group (once) and moves it under the active option. fromIndex: the
// option the member left (the pill starts there and slides); without it the pill just sits under the active one.
export const slideModePill = (group, { fromIndex = null, reduced = prefersReduced() } = {}) => {
  if (!group) return;
  const buttons = [...group.querySelectorAll('[data-connect-mode]')];
  const active = buttons.findIndex((b) => b.classList.contains('is-active'));
  if (active < 0 || !buttons[active].offsetWidth) return;
  let pill = group.querySelector('.connect-mode-pill');
  if (!pill) {
    pill = group.ownerDocument.createElement('span');
    pill.className = 'connect-mode-pill';
    pill.setAttribute('aria-hidden', 'true');
    group.prepend(pill);
    group.classList.add('has-pill');
  }
  const place = (b) => ({ x: b.offsetLeft, width: b.offsetWidth });
  const to = place(buttons[active]);
  gsap.killTweensOf(pill);
  if (reduced || fromIndex === null || fromIndex === active || !buttons[fromIndex]) { gsap.set(pill, to); return; }
  gsap.fromTo(pill, place(buttons[fromIndex]), { ...to, duration: 0.42, ease: 'power3.inOut' });
};

// N9. Tags bubbles that were not on screen in the last render of this chat; CSS lifts them in.
const lastRender = { chat: null, ids: null };
export const markArrivals = (messagesEl, chatId) => {
  if (!messagesEl) return [];
  const nodes = [...messagesEl.querySelectorAll('.message[data-message-id]')];
  const ids = nodes.map((n) => n.dataset.messageId);
  const fresh = new Set(arrivalsBetween(lastRender.ids, ids, lastRender.chat === String(chatId)));
  nodes.forEach((n) => { if (fresh.has(n.dataset.messageId)) n.classList.add('is-arriving'); });
  lastRender.chat = String(chatId);
  lastRender.ids = new Set(ids);
  return [...fresh];
};

// N10. Event covers settle in (scale 1.06 to 1 and fade) as each of the first 8 cards scrolls into view, once.
export const revealOnScroll = (root, { selector = '.event-card', win = globalThis.window, reduced = prefersReduced(win) } = {}) => {
  if (!root || reduced || typeof win?.IntersectionObserver !== 'function') return () => {};
  const cards = [...root.querySelectorAll(selector)].filter((c) => !c.dataset.revealed).slice(0, MOMENTS.reveal.max);
  if (!cards.length) return () => {};
  const io = new win.IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      const media = entry.target.querySelector('.event-card-media img, .event-card-media');
      gsap.fromTo(entry.target, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', clearProps: 'transform,opacity' });
      if (media) gsap.fromTo(media, { scale: MOMENTS.reveal.from }, { scale: 1, duration: MOMENTS.reveal.dur, ease: 'power3.out', clearProps: 'transform' });
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  cards.forEach((c) => { c.dataset.revealed = '1'; io.observe(c); });
  return () => io.disconnect();
};
