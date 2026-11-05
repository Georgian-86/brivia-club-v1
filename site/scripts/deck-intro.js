// The deck's arrival (D-164, reworked as a shuffle in D-174): when the Connect deck first shows real people, a pack of
// card backs is shuffled in the card's place and the member's cards are dealt from it (see INTRO below). Never
// blocking: a touch, a click or a key finishes it at once. Paired with the "shuffle" sound (notify-sound.js INTRO_CUE).
//
// GSAP drives it (one timeline, transforms and opacity only, so it stays on the compositor). Every property it sets is
// cleared at the end, so deck-swipe.js and the stack's CSS (D-082) own the cards again exactly as before.
// prefers-reduced-motion: no travel, no rotation, no gloss and no sound; the cards fade in over 150 ms instead.

import { gsap } from 'gsap';

// A frame longer than 100 ms (a busy main thread on a low-end phone) counts as one 33 ms step, so the deal slows
// down for a moment instead of skipping ahead. GSAP's default is 500 ms, too loose for a one-second intro.
gsap.ticker.lagSmoothing(100, 33);

// The choreography, in seconds. Unit-tested (tests/unit/deck-intro.test.mjs) so the sound and the motion stay in step.
// D-174: a solitaire-style shuffle before the deal (founder: "more lengthy and better, kinda like shuffle in
// solitaire"). Five beats, about 3.6 s in all, any tap or key skips to the resting stack:
//   1. pack     the pack rises into the card's place, fanned, the front card reading "Shuffling Your Matches"
//               (D-187, the founder's design), holds a moment, then gathers square
//   2. split    it splits into two halves that lean apart
//   3. riffle   the halves riffle back together, one card at a time, alternating sides (a tick per card)
//   4. square   the pack is squared up with a small tap
//   5. deal     the back two cards slide out behind it to their places, the pack's top card turns edge-on and the
//               member's card flips face up in its place; the stack takes the weight, the gloss crosses, Pass / Pitch rise
export const INTRO_PERSPECTIVE = 1200;   // px; the 3D depth of the turning cards (set once, never tweened)
export const INTRO = Object.freeze({
  pack: Object.freeze({ count: 8, at: 0, dur: 0.46, from: Object.freeze({ y: 150, scale: 0.86, rotation: -5 }) }),
  // D-187: the pack rises fanned (two cards each side, like a hand of cards) under a front card that reads
  // "Shuffling Your Matches", holds a moment so it can be read, then gathers into a squared pack for the split.
  fan: Object.freeze({ angles: Object.freeze([-10, 10, -5, 5]), xPercent: Object.freeze([-4, 4, -2, 2]), yPercent: Object.freeze([9, 9, 4.5, 4.5]), scale: 0.93, origin: '50% 100%' }),
  gather: Object.freeze({ at: 0.86, dur: 0.2 }),
  split: Object.freeze({ at: 1.1, dur: 0.26, x: 36, narrowX: 22, rotation: 7, lift: -12 }),
  riffle: Object.freeze({ at: 1.4, gap: 0.056, drop: 0.17 }),
  square: Object.freeze({ at: 1.97, dur: 0.22 }),
  // back, next, top: when each is dealt, where it comes from, how long. The top card flips (rotationY) instead.
  layers: Object.freeze([
    Object.freeze({ at: 2.22, from: Object.freeze({ x: -26, y: 30, rotation: -5, scale: 0.95 }), dur: 0.52 }),
    Object.freeze({ at: 2.32, from: Object.freeze({ x: 24, y: 34, rotation: 4, scale: 0.95 }), dur: 0.52 }),
    Object.freeze({ at: 2.46, from: Object.freeze({ rotationY: -88, scale: 0.97 }), dur: 0.6 }),
  ]),
  flip: Object.freeze({ at: 2.34, dur: 0.12 }),   // the pack's top card turns edge-on just before the real one turns up
  packOut: Object.freeze({ at: 2.36, dur: 0.12 }),
  land: 2.8,         // the top card has visually arrived: the stack takes the weight
  settle: 0.3,       // the landing's squash and recovery
  gloss: Object.freeze({ at: 2.86, dur: 0.72 }),
  controls: Object.freeze({ at: 2.78, dur: 0.44, stagger: 0.06 }),
  reducedFade: 0.15,
});

// Riffle order: as in a real riffle, the bottom cards of the two halves fall first, alternating right, left, right...
// Returns, for the k-th card to land, which pack card it is (0 = bottom of the left half), its half, and when it drops.
export const riffleOrder = (intro = INTRO) => {
  const n = intro.pack.count;
  const half = Math.ceil(n / 2);
  const order = [];
  for (let i = 0; i < half; i += 1) {
    if (half + i < n) order.push(half + i);
    order.push(i);
  }
  return order.map((card, k) => ({ card, side: card < half ? 0 : 1, at: +(intro.riffle.at + k * intro.riffle.gap).toFixed(3) }));
};
export const riffleLandings = (intro = INTRO) => riffleOrder(intro).map((r) => +(r.at + intro.riffle.drop).toFixed(3));

// D-192: how much smaller the shuffling hand is than the card (the founder: the cards looked too big).
export const HAND = Object.freeze({ narrow: 0.74, targetWidth: 330, max: 0.86, min: 0.62 });
export const handScaleFor = ({ narrow = false, width = 0 } = {}, hand = HAND) => {
  if (narrow) return hand.narrow;
  if (!width) return hand.max;
  return Math.min(hand.max, Math.max(hand.min, hand.targetWidth / width));
};

// When the whole intro is over (the last tween's end).
export const introLength = (intro = INTRO) => Math.max(
  intro.pack.at + intro.pack.dur,
  ...riffleLandings(intro),
  intro.square.at + intro.square.dur,
  ...intro.layers.map((l) => l.at + l.dur),
  intro.land + intro.settle,
  intro.gloss.at + intro.gloss.dur,
  intro.controls.at + intro.controls.dur + intro.controls.stagger * 2,
);

// Plays only when it can be seen: the deck view is on screen, the tab is visible and there is a card to show.
export const introAllowed = ({ played = false, cardShown = false, viewShown = false, pageVisible = true } = {}) =>
  !played && cardShown && viewShown && pageVisible;

const CLEARED = 'transform,opacity,visibility,transition,willChange';

// The shuffle's pack: card backs laid in the card's place, above the stack, gone when the deal ends.
const buildPack = (doc, stack, count) => {
  if (!doc?.createElement || !stack?.appendChild) return null;
  const wrap = doc.createElement('div');
  wrap.className = 'deck-shuffle';
  wrap.setAttribute('aria-hidden', 'true');
  // The hand: holds the cards, so a phone can show the fanned pack smaller while it reads "Shuffling" (D-187).
  const hand = doc.createElement('div');
  hand.className = 'deck-shuffle-hand';
  wrap.appendChild(hand);
  const cards = Array.from({ length: count }, () => {
    const c = doc.createElement('span');
    c.className = 'deck-shuffle-card';
    hand.appendChild(c);
    return c;
  });
  // D-187: the front card's face: two cards with a heart, "Shuffling / Your Matches", three dots that pulse in turn.
  const front = cards[count - 1];
  front.classList.add('is-face');
  front.innerHTML = `<span class="deck-shuffle-face"><svg class="deck-shuffle-icon" viewBox="0 0 48 48" aria-hidden="true">`
    + `<rect x="7" y="9" width="17" height="25" rx="2.5" transform="rotate(-16 15.5 21.5)"/>`
    + `<rect x="21" y="12" width="17" height="25" rx="2.5" transform="rotate(12 29.5 24.5)" class="deck-shuffle-icon-front"/>`
    + `<path d="M29.6 28.2c-2.6-1.7-4.2-3.2-4.2-5a2.2 2.2 0 0 1 4.1-1.1 2.2 2.2 0 0 1 4.1 1.1c0 1.8-1.6 3.3-4 5Z" transform="rotate(12 29.5 24.5)"/>`
    + `</svg><span class="deck-shuffle-title">Shuffling<br />Your <em>Matches</em></span>`
    + `<span class="deck-shuffle-dots"><i></i><i></i><i></i></span></span>`;
  stack.appendChild(wrap);
  return { wrap, hand, cards, front };
};

// playDeckIntro({ stack, card, next, back, controls, reduced, onStart }): runs the timeline; returns { finish }.
// controls: the Pass / Pitch row and the hint (any that are shown). onStart() is called on the first frame (the sound).
export const playDeckIntro = ({ stack, card, next, back, controls = [], reduced = false, onStart, onDone, doc = globalThis.document } = {}) => {
  if (!stack || !card) { onDone?.(); return { finish: () => {} }; }
  const shown = (el) => el && !el.hidden;
  const layers = [back, next, card].map((el, i) => (shown(el) ? { el, spec: INTRO.layers[i] } : null)).filter(Boolean);
  const rows = controls.filter(shown);
  let gloss = null;
  let shuffle = null;
  let ended = false;
  const cleanup = () => {
    if (ended) return;
    ended = true;
    gloss?.remove();
    shuffle?.remove();
    gsap.set([stack, ...layers.map((l) => l.el), ...rows], { clearProps: CLEARED });
    stack.classList.remove('is-intro');
    listeners.forEach(([type, fn]) => doc?.removeEventListener?.(type, fn, true));
    onDone?.();
  };
  // Paused until the next frame: the render that showed the deck (cover decode, layout) can take a long frame, and a
  // timeline that is already running would jump past the first cards' flight. The first painted frame is the start pose.
  const tl = gsap.timeline({ paused: true, onComplete: cleanup, onInterrupt: cleanup });
  // Any interaction with the page skips straight to the resting stack, so the deck never makes anyone wait. A press on
  // a button or link skips on release, not on press: jumping the cards under a pointer that is going down would move
  // the button away and lose the click. A press anywhere else (a drag starting on the card) skips at once.
  function skip() { if (!ended) tl.progress(1); }
  const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
  const onDown = (e) => { if (!e.target?.closest?.(INTERACTIVE)) skip(); };
  const listeners = [['pointerdown', onDown], ['pointerup', skip], ['keydown', skip]];
  stack.classList.add('is-intro');
  // D-205: decode the dealt cards' photos now, off the main thread, so none is decoded on the frame it turns up.
  [card, next, back].forEach((el) => el?.querySelectorAll?.('img').forEach((img) => {
    if (img.loading === 'lazy') img.loading = 'eager';
    img.decode?.().catch(() => {});
  }));
  // The cards carry CSS transitions on transform (app.css, deck.css); they would fight the timeline.
  gsap.set(layers.map((l) => l.el), { transition: 'none' });

  if (reduced) {
    tl.from([...layers.map((l) => l.el), ...rows], { opacity: 0, duration: INTRO.reducedFade, ease: 'none' });
  } else {
    if (onStart) tl.call(onStart, [], 0);
    const pack = buildPack(doc, stack, INTRO.pack.count);
    if (pack) {
      shuffle = pack.wrap;
      const { wrap, cards } = pack;
      const half = Math.ceil(cards.length / 2);
      // On a phone the card nearly fills the screen: the halves part less, so they stay on screen.
      const room = (doc.documentElement?.clientWidth || 1000) - (stack.offsetWidth || 0);
      const splitX = room < 120 ? INTRO.split.narrowX : INTRO.split.x;
      // 1. The pack rises into the card's place (each card a hair above the one under it: a thick, squared pack),
      // the bottom four fanned out behind the front card (D-187).
      const F = INTRO.fan;
      cards.forEach((c, i) => gsap.set(c, { y: -i * 1.4, zIndex: i }));
      // On a phone the card nearly fills the screen, so the fanned hand is shown smaller until it gathers.
      // D-192: the hand is shown smaller than the card while it reads and riffles (a phone: 74%; elsewhere a card about
      // 330 px wide, at most 86%), and grows into the card's place as the pack is squared, just before the deal.
      const handScale = handScaleFor({ narrow: room < 120, width: stack.offsetWidth || 0 });
      if (handScale < 1) {
        gsap.set(pack.hand, { scale: handScale, transformOrigin: '50% 42%' });
        tl.to(pack.hand, { scale: 1, duration: INTRO.square.dur, ease: 'power2.inOut' }, INTRO.square.at);
      }
      F.angles.forEach((angle, i) => gsap.set(cards[i], { rotation: angle, xPercent: F.xPercent[i], yPercent: F.yPercent[i], scale: F.scale, transformOrigin: F.origin }));
      tl.from(wrap, { ...INTRO.pack.from, duration: INTRO.pack.dur, ease: 'power3.out', transformOrigin: '50% 100%', force3D: true, immediateRender: true }, INTRO.pack.at)
        .from(wrap, { opacity: 0, duration: 0.18, ease: 'power1.out', immediateRender: true }, INTRO.pack.at);
      // 1b. The fan gathers into a squared pack and the face's words fade, ready for the split.
      tl.to(cards.slice(0, F.angles.length), { rotation: 0, xPercent: 0, yPercent: 0, scale: 1, duration: INTRO.gather.dur, ease: 'power2.inOut' }, INTRO.gather.at)
        .to(pack.front.querySelector('.deck-shuffle-face'), { opacity: 0, duration: INTRO.gather.dur * 0.8, ease: 'power1.in' }, INTRO.gather.at)
        .set(cards, { transformOrigin: '50% 50%' }, INTRO.gather.at + INTRO.gather.dur);
      // 2. Split: the two halves lean apart (left half to the left, right half to the right).
      cards.forEach((c, i) => {
        const side = i < half ? -1 : 1;
        tl.to(c, { xPercent: side * splitX, y: INTRO.split.lift - (i % half) * 1.4, rotation: side * INTRO.split.rotation,
          duration: INTRO.split.dur, ease: 'power2.inOut' }, INTRO.split.at + (i % half) * 0.012);
      });
      // 3. Riffle: one card at a time, alternating halves, drops into the middle and onto the pile.
      riffleOrder().forEach(({ card, at }, k) => {
        const c = cards[card];
        tl.set(c, { zIndex: 20 + k }, at)
          .to(c, { xPercent: 0, y: -k * 1.4, rotation: (k % 2 ? 1 : -1) * 1.6, duration: INTRO.riffle.drop, ease: 'power2.in' }, at);
      });
      // 4. Square up: the pile is tapped square (rotations out) and gives a little.
      tl.to(cards, { rotation: 0, duration: INTRO.square.dur, ease: 'power3.out' }, INTRO.square.at)
        .to(wrap, { scaleX: 0.975, scaleY: 0.985, duration: INTRO.square.dur * 0.35, ease: 'power2.out', transformOrigin: '50% 100%' }, INTRO.square.at)
        .to(wrap, { scaleX: 1, scaleY: 1, duration: INTRO.square.dur * 0.65, ease: 'power3.out' }, INTRO.square.at + INTRO.square.dur * 0.35);
      // 5. The pack's top card turns edge-on (the member's card finishes the turn), and the rest of the pack goes.
      const last = cards[riffleOrder().at(-1).card];
      // D-205: the perspective is set, not tweened (tweened, it grew from nothing and warped the start of the turn).
      gsap.set(last, { transformPerspective: INTRO_PERSPECTIVE });
      tl.to(last, { rotationY: 88, duration: INTRO.flip.dur, ease: 'power1.in' }, INTRO.flip.at)
        .to(cards.filter((c) => c !== last), { opacity: 0, duration: INTRO.packOut.dur, ease: 'power1.in' }, INTRO.packOut.at)
        .set(wrap, { autoAlpha: 0 }, INTRO.flip.at + INTRO.flip.dur);
    }
    layers.forEach(({ el, spec }, i) => {
      const top = i === layers.length - 1;
      // D-205: the top card's perspective is fixed for the whole turn. Inside the from() it was tweened with the angle,
      // from 1200 px down to none: near the end the perspective was a few pixels, which blew a 3-degree angle up into a
      // steep tilt that held, then snapped flat when both reached zero. That was the card "getting stuck".
      if (top) gsap.set(el, { transformPerspective: INTRO_PERSPECTIVE });
      tl.from(el, {
        ...spec.from,
        duration: spec.dur,
        // D-205: the top card turns with no overshoot (back.out swung it past flat and back, a lurch at the end).
        ease: 'power3.out',
        transformOrigin: top ? '50% 50%' : '50% 100%',
        force3D: true,
        immediateRender: true,
      }, spec.at);
      // Hidden until dealt (set now, so the first painted frame never shows a card early); the top card shows the
      // moment it turns up, when it is edge-on.
      // D-205: the top card waits at 1% opacity, not 0: a fully transparent layer is not painted ahead (Safari), so its
      // photo was decoded and the whole card rasterised in 3D on the first frames of the turn, which stalled it
      // mid-turn on a phone. At 1%, edge-on and under the pack, it is painted during the shuffle and never seen.
      gsap.set(el, { opacity: top ? 0.01 : 0 });
      tl.to(el, { opacity: 1, duration: top ? 0.01 : 0.2, ease: 'power1.out' }, spec.at);
    });
    // The landing: the stack gives a little under the top card, then recovers (weight, not bounce).
    // D-196: a 4 px dip only (translate, no scale): scaling the whole stack re-rasterised the card and its photo on every
    // frame of the landing, which is where the shuffle hitched at the very end.
    tl.to(stack, { y: 4, duration: INTRO.settle * 0.35, ease: 'power2.out', force3D: true }, INTRO.land)
      .to(stack, { y: 0, duration: INTRO.settle * 0.65, ease: 'power3.out', force3D: true }, INTRO.land + INTRO.settle * 0.35);
    // One gloss across the top card: a soft light band, like a fresh card catching the light.
    gloss = doc?.createElement?.('span') || null;
    if (gloss) {
      gloss.className = 'deck-intro-gloss';
      gloss.setAttribute('aria-hidden', 'true');
      card.appendChild(gloss);
      tl.fromTo(gloss, { xPercent: -130, opacity: 1 }, { xPercent: 130, duration: INTRO.gloss.dur, ease: 'power2.inOut' }, INTRO.gloss.at);
    }
    if (rows.length) {
      gsap.set(rows, { y: 14, opacity: 0 });
      tl.to(rows, { y: 0, opacity: 1, duration: INTRO.controls.dur, ease: 'power3.out', stagger: INTRO.controls.stagger }, INTRO.controls.at);
    }
  }
  listeners.forEach(([type, fn]) => doc?.addEventListener?.(type, fn, true));
  const raf = globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
  raf(() => raf(() => { if (!ended) tl.play(0); }));
  return { finish: skip, timeline: tl };
};
