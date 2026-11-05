// The Brivia deck ritual (D-179, founder 2026-11-04: "the signature card deck experience").
//   intro     Connect opens: card backs glide in from different directions, settle into a Solitaire-style stack, and the
//             top one rises into the live profile card. Once per visit (a browser session), not on every return.
//   complete  the daily free swipes are used (the server's quota, never a timer): the deck spreads, gathers back in a
//             riffle, squares up, and the top card back reads "That's your deck for today."
// Purely visual: it never counts, resets or grants a swipe. The profile card is never restyled; it is only hidden while
// the backs move and shown again. Motion is Web Animations on transforms and opacity (GPU), with a spring easing; with
// reduced motion every step is a short cross-fade. The pure choreography below is unit-tested
// (tests/unit/deck-ritual.test.mjs); the controller at the bottom is the only DOM code.

import { resetTimeLabel } from './signal-quota.js';

export const RITUAL = Object.freeze({
  backs: 5,             // card backs in the deck
  introStagger: 120,    // ms between backs landing
  introDur: 680,        // ms per back's flight
  riseGap: 70,          // ms after the last back lands before the top one rises
  riseDur: 460,         // ms: the top back becomes the live card
  // D-180 (founder: "shuffle fast, just like Solitaire"): a quick fan, two fast riffles with a cut between, a snap square.
  completeSpread: 200,  // ms: the deck fans out
  gatherStagger: 30,    // ms between backs dropping in, riffled
  gatherDur: 260,       // ms per back's flight to the centre
  riffles: 2,           // riffle passes (the deck is cut between them)
  cutDur: 150,          // ms: the deck is cut into two halves
  squareDur: 220,       // ms: the deck squares up
  messageDur: 280,      // ms: the message fades in
  reducedFade: 220,     // ms: every step with reduced motion
});

// When each back of the intro lands (ms from the start), deepest first, so the top card lands last.
export const introLandings = (count = RITUAL.backs) => Array.from({ length: count }, (_, i) => i * RITUAL.introStagger + RITUAL.introDur);
export const introRiseAt = (count = RITUAL.backs) => (count - 1) * RITUAL.introStagger + RITUAL.introDur + RITUAL.riseGap;
export const introTotal = (count = RITUAL.backs) => introRiseAt(count) + RITUAL.riseDur;

// The riffle: the two halves of the deck interleave (left, right, left, ...). order[k] = which back lands k-th.
export const riffleOrder = (count = RITUAL.backs) => {
  const left = []; const right = [];
  for (let i = 0; i < count; i += 1) (i < count / 2 ? left : right).push(i);
  const out = [];
  while (left.length || right.length) { if (left.length) out.push(left.shift()); if (right.length) out.push(right.shift()); }
  return out;
};
const riffleSpan = (count) => (count - 1) * RITUAL.gatherStagger + RITUAL.gatherDur;
// When each back lands, riffle after riffle (ms from the start of the completion).
export const completeLandings = (count = RITUAL.backs) => Array.from({ length: RITUAL.riffles }, (_, pass) => {
  const start = RITUAL.completeSpread + pass * (riffleSpan(count) + RITUAL.cutDur);
  return Array.from({ length: count }, (__, k) => start + k * RITUAL.gatherStagger + RITUAL.gatherDur);
}).flat();
export const completeSquareAt = (count = RITUAL.backs) => RITUAL.completeSpread + RITUAL.riffles * riffleSpan(count) + (RITUAL.riffles - 1) * RITUAL.cutDur;
export const completeTotal = (count = RITUAL.backs) => completeSquareAt(count) + RITUAL.squareDur + RITUAL.messageDur;

// A back's resting pose in the stack: depth 0 is the top. Small, deliberate offsets and turns (a hand-squared deck,
// not a random pile), each deeper card a little lower and further back.
const OFFSET_X = [0, -3, 4, -2, 3, -4, 2];
const TURN = [0, -1.6, 1.8, -1.1, 2.2, -2.4, 1.2];
export const stackPose = (depth) => {
  const d = Math.max(0, Math.round(depth));
  return { x: OFFSET_X[d % OFFSET_X.length], y: d * 7, z: -d * 10, r: TURN[d % TURN.length], s: 1 - d * 0.012 };
};
export const poseTransform = ({ x = 0, y = 0, z = 0, r = 0, s = 1 }) => `translate3d(${x}px, ${y}px, ${z}px) rotate(${r}deg) scale(${s})`;

// Where each intro back starts (w, h: the card's size): from a different side each time, turned, a little small.
const ARRIVALS = [
  { x: -0.78, y: 0.32, r: -16 }, { x: 0.74, y: -0.26, r: 14 }, { x: -0.62, y: -0.34, r: -11 },
  { x: 0.7, y: 0.36, r: 17 }, { x: 0.04, y: 0.62, r: -6 }, { x: -0.5, y: 0.5, r: 9 },
];
export const introFrom = (index, w, h) => {
  const a = ARRIVALS[index % ARRIVALS.length];
  return { x: Math.round(a.x * w), y: Math.round(a.y * h), z: 40, r: a.r, s: 0.94 };
};

// How wide the fan opens (a share of the card's width): 0.42 with room beside the card, narrower on a phone so the
// outer cards stay on screen (vw: the viewport width).
export const spreadReach = (w, vw = Infinity) => {
  const room = ((vw - w) / 2 + w * 0.2) / (w || 1);
  return Math.round(Math.min(0.42, Math.max(0.16, room)) * 1000) / 1000;
};
// The fan of the completion: symmetric around the centre, with a slight arc.
export const spreadPose = (index, count, w, h, reach = 0.42) => {
  const mid = (count - 1) / 2;
  const k = count > 1 ? (index - mid) / mid : 0;
  return { x: Math.round(k * w * reach), y: Math.round(Math.abs(k) * h * 0.05 - h * 0.03), z: 20, r: Math.round(k * 12 * 10) / 10, s: 0.98 };
};

// The cut between riffles: the top half to one side, the bottom half to the other, lifted a little (i: place in half).
export const cutPose = (side, i, w, reach = 0.42) => ({ x: Math.round(side * w * reach * 0.62), y: -10 - i * 4, z: 20 + i * 4, r: side * 5, s: 0.99 });

// A gentle spring as a CSS linear() easing (about 3% overshoot, settled): no bounce, no robotic stop. Older engines get
// a close cubic-bezier.
export const springEasing = (damping = 0.74, samples = 40) => {
  const omega = 2 * Math.PI * 1.15;
  const wd = omega * Math.sqrt(1 - damping * damping);
  const points = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = (i / samples) * 1.6;
    const v = 1 - Math.exp(-damping * omega * t) * (Math.cos(wd * t) + ((damping * omega) / wd) * Math.sin(wd * t));
    points.push(i === samples ? 1 : Math.round(v * 1000) / 1000);
  }
  return `linear(${points.join(', ')})`;
};
export const SPRING_FALLBACK = 'cubic-bezier(.22, 1.12, .36, 1)';
export const GLIDE = 'cubic-bezier(.2, .7, .2, 1)';
export const SNAP = 'cubic-bezier(.25, .9, .3, 1)';      // the riffle: fast out, crisp landing, no overshoot

// The words on the finished deck. quota as my_signal_quota returns it; the refresh time only when the server gave one.
export const completionCopy = (quota) => {
  const time = resetTimeLabel(quota?.resets_at);
  return {
    title: "That's your deck for today.",
    copy: "You've met everyone waiting in your deck. Good things take a little time.",
    refresh: time ? `Fresh swipes at ${time}` : 'Fresh swipes arrive within 24 hours',
  };
};

// Once per visit: the intro plays the first time Connect shows in this browser session.
export const INTRO_KEY = 'brivia-deck-ritual';
export const introDue = (storage = globalThis.sessionStorage) => { try { return storage?.getItem(INTRO_KEY) !== 'played'; } catch { return true; } };
export const markIntroPlayed = (storage = globalThis.sessionStorage) => { try { storage?.setItem(INTRO_KEY, 'played'); } catch { /* memory only */ } };

// ---- DOM controller -----------------------------------------------------------------------------------------------
// stack: #swipe-stack (holds #swipe-card and the peek layers). cue(name): the sound kit's ritual cue ('deal' |
// 'complete'); it is never awaited. Returns { intro, complete, clear, busy, isComplete }.
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BACK_FACE = '<span class="deck-back-frame" aria-hidden="true"></span><span class="deck-back-mark" aria-hidden="true"><i>the</i> Brivia Club</span>';

export const createDeckRitual = ({ stack, cue = () => {}, win = globalThis.window, doc = globalThis.document } = {}) => {
  if (!stack || !doc) return { intro: async () => {}, complete: async () => {}, clear() {}, busy: () => false, isComplete: () => false };
  let layer = null;
  let running = null;      // 'intro' | 'complete' | null
  let complete = false;
  let animations = [];
  let token = 0;
  const reduced = () => Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const canAnimate = () => typeof doc.body?.animate === 'function';
  const springSupported = () => { try { return Boolean(win?.CSS?.supports?.('transition-timing-function', 'linear(0, 1)')); } catch { return false; } };
  const SPRING = () => (springSupported() ? springEasing() : SPRING_FALLBACK);
  const sound = (name) => { try { cue(name); } catch { /* sound never breaks the deck */ } };

  const ensureLayer = (count) => {
    if (!layer) {
      layer = doc.createElement('div');
      layer.className = 'deck-ritual';
      layer.setAttribute('aria-hidden', 'true');
      stack.append(layer);
    }
    while (layer.children.length < count) {
      const back = doc.createElement('div');
      back.className = 'deck-back';
      back.innerHTML = BACK_FACE;
      layer.append(back);
    }
    while (layer.children.length > count) layer.lastElementChild.remove();
    return [...layer.children];
  };
  const size = () => {
    const r = stack.getBoundingClientRect();
    return { w: r.width || 360, h: r.height || 540 };
  };
  const stopAll = () => { animations.forEach((a) => { try { a.cancel(); } catch { /* done */ } }); animations = []; };
  const run = (el, keyframes, options) => {
    if (!canAnimate()) return Promise.resolve();
    const a = el.animate(keyframes, { fill: 'both', ...options });
    animations.push(a);
    return a.finished.catch(() => {});
  };
  // backs[d] sits at depth d (0 = top, painted last).
  const rest = (backs) => backs.forEach((b, d) => { b.style.zIndex = String(backs.length - d); b.style.transform = poseTransform(stackPose(d)); b.style.opacity = '1'; });

  // Once squared, only the top card's face shows (the backs under it keep their edges, not a second wordmark).
  const markTop = (byDepth) => byDepth.forEach((b, d) => b.classList.toggle('is-under', d > 0));

  const clear = () => {
    token += 1;
    stopAll();
    running = null;
    complete = false;
    stack.classList.remove('is-ritual-intro', 'is-ritual-rising', 'is-deck-complete');
    layer?.remove();
    layer = null;
  };

  const intro = async () => {
    if (running || complete) return;
    const my = ++token;
    running = 'intro';
    const backs = ensureLayer(RITUAL.backs);
    const { w, h } = size();
    stack.classList.add('is-ritual-intro');
    layer.classList.remove('is-complete');
    rest(backs);
    sound('deal');
    if (reduced() || !canAnimate()) {
      await run(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: RITUAL.reducedFade, easing: 'linear' });
      if (my !== token) return;
      stack.classList.remove('is-ritual-intro');
      await run(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: RITUAL.reducedFade, delay: 120, easing: 'linear' });
      if (my !== token) return;
      layer.remove(); layer = null; running = null;
      return;
    }
    const easing = SPRING();
    // Deepest first: back at depth d lands (count - 1 - d)-th.
    const flights = backs.map((back, d) => {
      const order = backs.length - 1 - d;
      const from = introFrom(order, w, h);
      return run(back, [
        { transform: poseTransform(from), opacity: 0, offset: 0 },
        { opacity: 1, offset: 0.12 },
        { transform: poseTransform(stackPose(d)), opacity: 1, offset: 1 },
      ], { duration: RITUAL.introDur, delay: order * RITUAL.introStagger, easing });
    });
    await Promise.all(flights);
    if (my !== token) return;
    markTop(backs);
    await new Promise((resolve) => win.setTimeout(resolve, RITUAL.riseGap));
    if (my !== token) return;
    // The top back lifts and gives way to the live card; the others hand over to the peek layers.
    stack.classList.remove('is-ritual-intro');
    stack.classList.add('is-ritual-rising');
    const top = backs[0];
    await Promise.all([
      // The back lifts clear and is gone in the first half; the card comes up under it (CSS, 140 ms later).
      run(top, [
        { transform: poseTransform(stackPose(0)), opacity: 1 },
        { transform: 'translate3d(0, -18px, 30px) scale(1.03)', opacity: 0, offset: 0.55 },
        { transform: 'translate3d(0, -18px, 30px) scale(1.03)', opacity: 0 },
      ], { duration: RITUAL.riseDur, easing: GLIDE }),
      ...backs.slice(1).map((b, i) => run(b, [{ opacity: 1 }, { opacity: 0 }], { duration: RITUAL.riseDur - 80, delay: 60 + i * 20, easing: 'linear' })),
    ]);
    if (my !== token) return;
    stack.classList.remove('is-ritual-rising');
    stopAll();
    layer?.remove(); layer = null;
    running = null;
  };

  const message = (quota) => {
    const words = completionCopy(quota);
    return `<div class="deck-complete-face" role="status" aria-live="polite"><span class="deck-complete-eyebrow">The Brivia Club</span>`
      + `<h2 class="deck-complete-title">${escapeHtml(words.title)}</h2><p class="deck-complete-copy">${escapeHtml(words.copy)}</p>`
      + `<p class="deck-complete-refresh">${escapeHtml(words.refresh)}</p></div>`;
  };
  const showMessage = (backs, quota) => {
    const top = backs[0];
    top.classList.add('is-message');
    top.innerHTML = BACK_FACE + message(quota);
    layer.removeAttribute('aria-hidden');
    backs.slice(1).forEach((b) => b.setAttribute('aria-hidden', 'true'));
    return top.querySelector('.deck-complete-face');
  };

  // animate: false shows the finished deck at once (the page opened with the swipes already used).
  const finish = async ({ quota = null, animate = true } = {}) => {
    if (complete && running !== 'complete') { // already finished: only the refresh time may have changed
      const refresh = layer?.querySelector('.deck-complete-refresh');
      if (refresh) refresh.textContent = completionCopy(quota).refresh;
      return;
    }
    if (running === 'complete') return;
    if (running === 'intro') { stopAll(); stack.classList.remove('is-ritual-intro', 'is-ritual-rising'); }
    const my = ++token;
    running = 'complete';
    complete = true;
    const backs = ensureLayer(RITUAL.backs);
    backs.forEach((b) => { b.classList.remove('is-message', 'is-under'); b.innerHTML = BACK_FACE; });
    stack.classList.add('is-deck-complete');
    layer.classList.add('is-complete');
    rest(backs);
    if (!animate || reduced() || !canAnimate()) {
      markTop(backs);
      const face = showMessage(backs, quota);
      if (animate) sound('complete');
      await run(layer, [{ opacity: 0 }, { opacity: 1 }], { duration: animate ? RITUAL.reducedFade * 2 : RITUAL.reducedFade, easing: 'linear' });
      if (face && my === token) face.style.opacity = '1';
      if (my === token) running = null;
      return;
    }
    const { w, h } = size();
    const n = backs.length;
    const reach = spreadReach(w, win?.innerWidth || Infinity);
    sound('complete');
    // 1. Fan out from where the last card was: quick.
    await Promise.all(backs.map((b, d) => run(b, [
      { transform: poseTransform(stackPose(d)), opacity: d === 0 ? 0.6 : 1 },
      { transform: poseTransform(spreadPose(n - 1 - d, n, w, h, reach)), opacity: 1 },
    ], { duration: RITUAL.completeSpread, delay: d * 12, easing: GLIDE })));
    if (my !== token) return;
    // A riffle: the cards drop in one after another, each lifting over the one before; the first to land ends deepest.
    const riffleIn = async (sequence) => {
      const flights = sequence.map(({ back, from }, k) => {
        const depth = n - 1 - k;
        const lift = { x: Math.round(-from.x * 0.18), y: -16 - (k % 2) * 6, z: 50, r: Math.round(-from.r * 0.3 * 10) / 10, s: 1.01 };
        back.style.zIndex = String(n - depth);
        return run(back, [
          { transform: poseTransform(from), offset: 0 },
          { transform: poseTransform(lift), offset: 0.5 },
          { transform: poseTransform(stackPose(depth)), offset: 1 },
        ], { duration: RITUAL.gatherDur, delay: k * RITUAL.gatherStagger, easing: SNAP }).then(() => ({ back, depth }));
      });
      const landed = await Promise.all(flights);
      return landed.sort((a, b) => a.depth - b.depth).map((l) => l.back);
    };
    // 2. First riffle, from the fan: the halves cross over each other.
    let byDepth = await riffleIn(riffleOrder(n).map((fanIndex) => ({ back: backs[n - 1 - fanIndex], from: spreadPose(fanIndex, n, w, h, reach) })));
    if (my !== token) return;
    // 3. Cut and riffle again, as many times as RITUAL.riffles asks: the top half goes right, the bottom half left,
    //    then they riffle together from the bottom of each half.
    for (let pass = 1; pass < RITUAL.riffles; pass += 1) {
      const half = Math.ceil(n / 2);
      const top = byDepth.slice(0, half);                // right
      const bottom = byDepth.slice(half);                // left
      const cut = new Map();
      top.forEach((b, i) => cut.set(b, cutPose(1, top.length - 1 - i, w, reach)));
      bottom.forEach((b, i) => cut.set(b, cutPose(-1, bottom.length - 1 - i, w, reach)));
      await Promise.all(byDepth.map((b, d) => run(b, [
        { transform: poseTransform(stackPose(d)) },
        { transform: poseTransform(cut.get(b)) },
      ], { duration: RITUAL.cutDur, easing: GLIDE })));
      if (my !== token) return;
      const left = [...bottom].reverse();                // deepest of each half drops first
      const right = [...top].reverse();
      const sequence = [];
      while (left.length || right.length) {
        if (left.length) { const b = left.shift(); sequence.push({ back: b, from: cut.get(b) }); }
        if (right.length) { const b = right.shift(); sequence.push({ back: b, from: cut.get(b) }); }
      }
      byDepth = await riffleIn(sequence);
      if (my !== token) return;
    }
    markTop(byDepth);
    // 3. Square up: the whole deck settles as one, as if tapped on the table.
    await run(layer, [
      { transform: 'translate3d(0, 0, 0) scale(1)' },
      { transform: 'translate3d(0, -6px, 0) scale(1.012)', offset: 0.4 },
      { transform: 'translate3d(0, 0, 0) scale(1)' },
    ], { duration: RITUAL.squareDur, easing: GLIDE });
    if (my !== token) return;
    // 4. The words appear on the top card.
    const face = showMessage(byDepth, quota);
    if (face) await run(face, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: RITUAL.messageDur, easing: GLIDE });
    if (my === token) running = null;
  };

  return {
    intro,
    complete: finish,
    clear,
    busy: () => Boolean(running),
    isComplete: () => complete,
  };
};
