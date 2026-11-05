// The deck's arrival (D-164, reworked D-185): a Solitaire deal. A small face-down pile (wine card backs with the club's
// mark) rises in beside the stack; the three layers are dealt from it one after another, each on a short arc with a
// little spin, landing face-down in their places; then the top card lifts and flips over to show the person, the stack
// takes its weight, a gloss crosses the fresh card and Pass / Pitch rise in. About 1.7 s, never blocking: a touch, a
// click or a key on the deck finishes it at once. Paired with the "deal" sound (notify-sound.js INTRO_CUE): a tap as
// each card lands and a bell on the flip.
//
// GSAP drives it (one timeline, transforms and opacity only, so it stays on the compositor). The cards stay opaque the
// whole time (D-164's fade let one person's name show through another's); only the stack fades in, for 0.16 s. Every
// property it sets is cleared at the end and the card backs are removed, so deck-swipe.js and the stack's CSS (D-082)
// own the cards again exactly as before.
// prefers-reduced-motion: no travel, no flip, no gloss and no sound; the cards fade in over 150 ms instead.

import { gsap } from 'gsap';

// A frame longer than 100 ms (a busy main thread on a low-end phone) counts as one 33 ms step, so the deal slows
// down for a moment instead of skipping ahead. GSAP's default is 500 ms, too loose for a one-second intro.
gsap.ticker.lagSmoothing(100, 33);

// The choreography, in seconds. Unit-tested (tests/unit/deck-intro.test.mjs) so the sound and the motion stay in step.
export const INTRO = Object.freeze({
  pile: Object.freeze({ dur: 0.16 }),   // the stack (the face-down pile) fades in
  // back, next, top: when each layer leaves the pile, where the pile sits for it (a fanned edge), how long it flies.
  layers: Object.freeze([
    Object.freeze({ at: 0.16, from: Object.freeze({ x: -46, y: 118, rotation: -9, scale: 0.84 }), dur: 0.38 }),
    Object.freeze({ at: 0.28, from: Object.freeze({ x: -42, y: 114, rotation: -6.5, scale: 0.84 }), dur: 0.38 }),
    Object.freeze({ at: 0.4, from: Object.freeze({ x: -38, y: 110, rotation: -4, scale: 0.84 }), dur: 0.42 }),
  ]),
  flip: Object.freeze({ at: 0.86, up: 0.17, down: 0.3, lift: 12, scale: 1.045 }),  // the top card turns face-up
  reveal: Object.freeze({ at: 0.98, dur: 0.22 }),   // the cards behind turn face-up (their edges, under the top card)
  land: 1.3,         // the flipped card settles: the stack takes the weight
  settle: 0.26,      // the landing's squash and recovery
  gloss: Object.freeze({ at: 1.1, dur: 0.62 }),
  controls: Object.freeze({ at: 1.16, dur: 0.4, stagger: 0.06 }),
  reducedFade: 0.15,
});

// The moment the top card is edge-on and swaps its back for its face.
export const flipMidpoint = (intro = INTRO) => intro.flip.at + intro.flip.up;

// When the whole intro is over (the last tween's end).
export const introLength = (intro = INTRO) => Math.max(
  ...intro.layers.map((l) => l.at + l.dur),
  intro.flip.at + intro.flip.up + intro.flip.down,
  intro.reveal.at + intro.reveal.dur,
  intro.land + intro.settle,
  intro.gloss.at + intro.gloss.dur,
  intro.controls.at + intro.controls.dur + intro.controls.stagger * 2,
);

// Plays only when it can be seen: the deck view is on screen, the tab is visible and there is a card to show.
export const introAllowed = ({ played = false, cardShown = false, viewShown = false, pageVisible = true } = {}) =>
  !played && cardShown && viewShown && pageVisible;

const CLEARED = 'transform,opacity,visibility,transition,willChange';

// playDeckIntro({ stack, card, next, back, controls, reduced, onStart }): runs the timeline; returns { finish }.
// controls: the Pass / Pitch row and the hint (any that are shown). onStart() is called on the first frame (the sound).
export const playDeckIntro = ({ stack, card, next, back, controls = [], reduced = false, onStart, onDone, doc = globalThis.document } = {}) => {
  if (!stack || !card) { onDone?.(); return { finish: () => {} }; }
  const shown = (el) => el && !el.hidden;
  const layers = [back, next, card].map((el, i) => (shown(el) ? { el, spec: INTRO.layers[i] } : null)).filter(Boolean);
  const rows = controls.filter(shown);
  let gloss = null;
  let backs = [];
  let ended = false;
  const cleanup = () => {
    if (ended) return;
    ended = true;
    gloss?.remove();
    backs.forEach((b) => b.remove());
    gsap.set([stack, ...layers.map((l) => l.el), ...rows], { clearProps: `${CLEARED},transformOrigin,transformPerspective` });
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
  // The cards carry CSS transitions on transform (app.css, deck.css); they would fight the timeline.
  gsap.set(layers.map((l) => l.el), { transition: 'none' });

  if (reduced) {
    tl.from([...layers.map((l) => l.el), ...rows], { opacity: 0, duration: INTRO.reducedFade, ease: 'none' });
  } else {
    if (onStart) tl.call(onStart, [], 0);
    // Every card starts face-down: a wine back with the club's mark, laid over the face for the deal only.
    backs = doc?.createElement ? layers.map(({ el }) => {
      const back = doc.createElement('span');
      back.className = 'deck-intro-back';
      back.setAttribute('aria-hidden', 'true');
      back.innerHTML = '<span class="deck-intro-back-mark"><span><i>the</i>B</span></span>';
      el.appendChild(back);
      return back;
    }) : [];
    // The pile appears: only the stack fades, so no card is ever see-through over another.
    tl.from(stack, { opacity: 0, duration: INTRO.pile.dur, ease: 'power1.out', immediateRender: true }, 0);
    layers.forEach(({ el, spec }, i) => {
      const top = i === layers.length - 1;
      // Where the card rests in the stack (the CSS fan of the cards behind, D-082), read before the pile pose is set.
      const rest = { x: gsap.getProperty(el, 'x'), y: gsap.getProperty(el, 'y'), rotation: gsap.getProperty(el, 'rotation'), scale: gsap.getProperty(el, 'scaleX') };
      // The pile pose, at once: every card waits there until it is dealt. The cards behind keep their CSS origin (the
      // bottom edge), so they land exactly where the stack holds them; the top card turns about its middle for the flip.
      tl.set(el, { ...spec.from, ...(top ? { transformOrigin: '50% 60%' } : {}), force3D: true, immediateRender: true }, 0);
      // The deal: x and y on different curves, so the card travels on an arc (out first, then up and in), turning as it
      // goes and landing with a small overshoot.
      tl.to(el, { x: rest.x, duration: spec.dur, ease: 'power2.out' }, spec.at)
        .to(el, { y: rest.y, duration: spec.dur, ease: 'power3.out' }, spec.at)
        .to(el, { rotation: rest.rotation, scale: rest.scale, duration: spec.dur + 0.06, ease: top ? 'back.out(1.7)' : 'back.out(1.4)' }, spec.at);
    });
    // The flip: the top card lifts and turns edge-on, its back goes, and it turns the rest of the way face-up.
    const top = layers.at(-1);
    const topBack = backs.at(-1);
    const F = INTRO.flip;
    tl.set(top.el, { transformPerspective: 1100 }, F.at)
      .to(top.el, { rotationY: 90, y: -F.lift, scale: F.scale, duration: F.up, ease: 'power2.in' }, F.at)
      .set(topBack, { opacity: 0 }, flipMidpoint())
      .fromTo(top.el, { rotationY: -90 }, { rotationY: 0, duration: F.down, ease: 'back.out(1.5)', immediateRender: false }, flipMidpoint())
      .to(top.el, { y: 0, scale: 1, duration: F.down + 0.08, ease: 'power3.out' }, flipMidpoint());
    // The cards behind turn face-up under it (only their edges show).
    if (backs.length > 1) tl.to(backs.slice(0, -1), { opacity: 0, duration: INTRO.reveal.dur, ease: 'power1.inOut', stagger: 0.05 }, INTRO.reveal.at);
    // The landing: the stack gives a little under the top card, then recovers (weight, not bounce).
    tl.to(stack, { y: 4, scaleY: 0.988, transformOrigin: '50% 100%', duration: INTRO.settle * 0.35, ease: 'power2.out' }, INTRO.land)
      .to(stack, { y: 0, scaleY: 1, duration: INTRO.settle * 0.65, ease: 'power3.out' }, INTRO.land + INTRO.settle * 0.35);
    // One gloss across the top card: a soft light band, like a fresh card catching the light.
    gloss = doc?.createElement?.('span') || null;
    if (gloss) {
      gloss.className = 'deck-intro-gloss';
      gloss.setAttribute('aria-hidden', 'true');
      card.appendChild(gloss);
      tl.fromTo(gloss, { xPercent: -130, opacity: 1 }, { xPercent: 130, duration: INTRO.gloss.dur, ease: 'power2.inOut' }, INTRO.gloss.at);
    }
    if (rows.length) {
      tl.from(rows, { y: 14, opacity: 0, duration: INTRO.controls.dur, ease: 'power3.out', stagger: INTRO.controls.stagger, immediateRender: true }, INTRO.controls.at);
    }
  }
  listeners.forEach(([type, fn]) => doc?.addEventListener?.(type, fn, true));
  const raf = globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
  raf(() => raf(() => { if (!ended) tl.play(0); }));
  return { finish: skip, timeline: tl };
};
