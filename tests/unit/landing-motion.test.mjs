// Landing motion helpers (Phase B landing speed). Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { motionAllowed, introPlan, pickHeroSource, INTRO_CAP_MS, INTRO_START_GRACE_MS } from '../../landing-motion.js';

test('motionAllowed is false for reduced motion', () => {
  assert.equal(motionAllowed({ reducedMotion: true, saveData: false }), false);
});

test('motionAllowed is false for save-data', () => {
  assert.equal(motionAllowed({ reducedMotion: false, saveData: true }), false);
});

test('motionAllowed is true otherwise', () => {
  assert.equal(motionAllowed({ reducedMotion: false, saveData: false }), true);
  assert.equal(motionAllowed({}), true);
  assert.equal(motionAllowed(), true);
});

test('introPlan skips when seen before', () => {
  assert.equal(introPlan({ seenBefore: true, fromAuth: false }), 'skip');
});

test('introPlan skips when arriving from auth', () => {
  assert.equal(introPlan({ seenBefore: false, fromAuth: true }), 'skip');
});

test('introPlan plays on a first visit', () => {
  assert.equal(introPlan({ seenBefore: false, fromAuth: false }), 'play');
});

test('intro timing constants', () => {
  assert.equal(INTRO_CAP_MS, 2500);
  assert.equal(INTRO_START_GRACE_MS, 800);
});

import { markLoaded } from '../../landing-motion.js';
const fakeImg = ({ complete = false, naturalWidth = 0 } = {}) => {
  const classes = new Set(['skeleton']);
  const handlers = {};
  const wrapper = { classList: { remove: (c) => classes.delete(c), has: (c) => classes.has(c) } };
  return { complete, naturalWidth, closest: () => wrapper, addEventListener: (t, f) => { handlers[t] = f; }, handlers, classes };
};
test('markLoaded removes .skeleton on load', () => {
  const img = fakeImg();
  markLoaded(img);
  assert.ok(img.classes.has('skeleton'));
  img.handlers.load();
  assert.ok(!img.classes.has('skeleton'));
});
test('markLoaded removes .skeleton at once for a cached image and on error', () => {
  const cached = fakeImg({ complete: true, naturalWidth: 100 });
  markLoaded(cached);
  assert.ok(!cached.classes.has('skeleton'));
  const broken = fakeImg();
  markLoaded(broken);
  broken.handlers.error();
  assert.ok(!broken.classes.has('skeleton'));
});

test('markLoaded clears .skeleton for an image that already failed (complete, naturalWidth 0)', () => {
  const failed = fakeImg({ complete: true, naturalWidth: 0 });
  markLoaded(failed);
  assert.ok(!failed.classes.has('skeleton'));
});

// D-062: the 4K hero. A slow link keeps the poster (a 4K stream would stall); the source picker prefers a smooth decode.
test('motionAllowed is false only on a 2g link; 3g, 4g and unknown play the hero', () => {
  // Chrome reports "3g" from latency alone (round trip >= 270 ms): Wi-Fi calling and many mobile networks in India
  // land there with plenty of bandwidth, and the founder's phone lost the hero video (D-064). Only 2g stays poster-only.
  for (const effectiveType of ['slow-2g', '2g']) assert.equal(motionAllowed({ effectiveType }), false, effectiveType);
  for (const effectiveType of ['3g', '4g', '', undefined]) assert.equal(motionAllowed({ effectiveType }), true, String(effectiveType));
});

test('pickHeroSource takes the first smooth decode, else the first supported one, else none', () => {
  assert.equal(pickHeroSource([{ supported: true, smooth: false }, { supported: true, smooth: true }]), 1);
  assert.equal(pickHeroSource([{ supported: false, smooth: false }, { supported: true, smooth: false }]), 1);
  assert.equal(pickHeroSource([{ supported: true, smooth: true }, { supported: true, smooth: true }]), 0);
  assert.equal(pickHeroSource([{ supported: false }, { supported: false }]), -1);
  assert.equal(pickHeroSource([]), -1);
  assert.equal(pickHeroSource(undefined), -1);
});
