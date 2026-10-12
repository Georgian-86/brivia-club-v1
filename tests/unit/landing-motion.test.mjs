// Landing motion helpers (Phase B landing speed). Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { motionAllowed, introPlan, INTRO_CAP_MS, INTRO_START_GRACE_MS } from '../../landing-motion.js';

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
