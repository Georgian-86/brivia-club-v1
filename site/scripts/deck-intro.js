// The deck's arrival (D-164): when the Connect deck first shows real people, the three layers of the stack are dealt
// in from below, one after the other, and settle into the stack with a soft landing; a single gloss crosses the top
// card and Pass / Pitch rise in under it. About 0.9 s of motion (the gloss trails to 1.2 s), never blocking: a touch,
// a click or a key on the deck finishes it at once. Paired with the "deal" sound (notify-sound.js INTRO_CUE).
//
// GSAP drives it (one timeline, transforms and opacity only, so it stays on the compositor). Every property it sets is
// cleared at the end, so deck-swipe.js and the stack's CSS (D-082) own the cards again exactly as before.
// prefers-reduced-motion: no travel, no rotation, no gloss and no sound; the cards fade in over 150 ms instead.

import { gsap } from 'gsap';

// A frame longer than 100 ms (a busy main thread on a low-end phone) counts as one 33 ms step, so the deal slows
// down for a moment instead of skipping ahead. GSAP's default is 500 ms, too loose for a one-second intro.
gsap.ticker.lagSmoothing(100, 33);

// The choreography, in seconds. Unit-tested (tests/unit/deck-intro.test.mjs) so the sound and the motion stay in step.
export const INTRO = Object.freeze({
  // back, next, top: when each layer is dealt, where it comes from, how long its flight is.
  layers: Object.freeze([
    Object.freeze({ at: 0, from: Object.freeze({ x: -64, y: 84, rotation: -13, scale: 0.86 }), dur: 0.62 }),
    Object.freeze({ at: 0.09, from: Object.freeze({ x: 58, y: 104, rotation: 11, scale: 0.88 }), dur: 0.62 }),
    Object.freeze({ at: 0.18, from: Object.freeze({ x: 0, y: 150, rotation: -3.5, scale: 0.92 }), dur: 0.7 }),
  ]),
  land: 0.42,        // the top card has visually arrived: the stack takes the weight
  settle: 0.3,       // the landing's squash and recovery
  gloss: Object.freeze({ at: 0.5, dur: 0.72 }),
  controls: Object.freeze({ at: 0.52, dur: 0.44, stagger: 0.06 }),
  reducedFade: 0.15,
});

// When the whole intro is over (the last tween's end).
export const introLength = (intro = INTRO) => Math.max(
  ...intro.layers.map((l) => l.at + l.dur),
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
  let ended = false;
  const cleanup = () => {
    if (ended) return;
    ended = true;
    gloss?.remove();
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
  // The cards carry CSS transitions on transform (app.css, deck.css); they would fight the timeline.
  gsap.set(layers.map((l) => l.el), { transition: 'none' });

  if (reduced) {
    tl.from([...layers.map((l) => l.el), ...rows], { opacity: 0, duration: INTRO.reducedFade, ease: 'none' });
  } else {
    if (onStart) tl.call(onStart, [], 0);
    layers.forEach(({ el, spec }, i) => {
      const top = i === layers.length - 1;
      tl.from(el, {
        ...spec.from,
        duration: spec.dur,
        ease: top ? 'back.out(1.35)' : 'power3.out',
        transformOrigin: '50% 100%',
        force3D: true,
        immediateRender: true,
      }, spec.at);
      // Opacity on its own short curve: an overshooting ease would push it past 1.
      tl.from(el, { opacity: 0, duration: 0.2, ease: 'power1.out', immediateRender: true }, spec.at);
    });
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
