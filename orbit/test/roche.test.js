// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { qualifiedLoad, headroom, exposure, deckSize, resolveOrbit, effectiveK } from '../src/roche.js';

const cfg = loadConfig();
const close = (a, b, e = 1e-3) => assert.ok(Math.abs(a - b) < e, `${a} !≈ ${b}`);
const like = (id, o = {}) => ({ likerId: id, likerAgeDays: 10, clearsGate: true, ageDays: 1, ...o });

test('headroom and exposure', () => {
  assert.equal(headroom(5, 5, cfg), 0.5);
  close(exposure(0.5, cfg), 0.7501);
  assert.equal(exposure(1, cfg), 1);
  assert.equal(exposure(0, cfg), 0.35);
  assert.equal(headroom(12, 5, cfg), 0);
});

test('qualifiedLoad weights likes and orbits', () => {
  assert.equal(qualifiedLoad({ inbound: [like('a'), like('b')], openOrbits: 2 }, cfg), 3);
});

test('golden 8: unqualified likes add no load', () => {
  for (const o of [{ clearsGate: false }, { likerAgeDays: 1 }]) {
    const inbound = Array.from({ length: 50 }, (_, i) => like('u' + i, o));
    const load = qualifiedLoad({ inbound, openOrbits: 0 }, cfg);
    assert.equal(load, 0);
    assert.equal(exposure(headroom(load, 5, cfg), cfg), 1);
  }
});

test('duplicate liker counts once; stale like counts zero', () => {
  assert.equal(qualifiedLoad({ inbound: [like('a'), like('a')], openOrbits: 0 }, cfg), 0.5);
  assert.equal(qualifiedLoad({ inbound: [like('a', { ageDays: 11 })], openOrbits: 0 }, cfg), 0);
  assert.equal(qualifiedLoad({ inbound: [like('a', { ageDays: 10 })], openOrbits: 0 }, cfg), 0.5);
});

test('golden 10: deck size', () => {
  assert.equal(deckSize(0, cfg), 8);
  assert.equal(deckSize(1, cfg), 12);
  assert.equal(deckSize(0.5, cfg), 8);
  assert.equal(deckSize(0.9, cfg), 11);
});

test('resolveOrbit', () => {
  const now = Date.UTC(2026, 9, 2);
  const day = 86400000;
  const recent = new Date(now - day);
  assert.equal(resolveOrbit({ mine: 'met', theirs: 'met', lastMessageAt: recent }, now, cfg), 'closed-met');
  assert.equal(resolveOrbit({ mine: 'ongoing', theirs: 'letgo', lastMessageAt: recent }, now, cfg), 'closed-letgo');
  assert.equal(resolveOrbit({ mine: 'letgo', theirs: 'met', lastMessageAt: recent }, now, cfg), 'closed-letgo');
  assert.equal(resolveOrbit({ mine: null, theirs: null, lastMessageAt: now - 22 * day }, new Date(now), cfg), 'closed-idle');
  assert.equal(resolveOrbit({ mine: null, theirs: null, lastMessageAt: now - 21 * day }, now, cfg), 'open');
  assert.equal(resolveOrbit({ mine: 'met', theirs: 'ongoing', lastMessageAt: recent }, now, cfg), 'open');
  assert.equal(resolveOrbit({ mine: 'met', theirs: 'met', lastMessageAt: now - 30 * day }, now, cfg), 'closed-met');
});

test('effectiveK capacity gaming', () => {
  assert.equal(effectiveK(8, { qualifiedInbound: 20, likeBacks: 1 }, cfg), 5);
  assert.equal(effectiveK(8, { qualifiedInbound: 19, likeBacks: 0 }, cfg), 8);
  assert.equal(effectiveK(8, { qualifiedInbound: 20, likeBacks: 2 }, cfg), 8);
  assert.equal(effectiveK(2, { qualifiedInbound: 30, likeBacks: 0 }, cfg), 2);
  assert.equal(effectiveK(3, { qualifiedInbound: 30, likeBacks: 0 }, cfg), 2);
  assert.equal(effectiveK(6, { qualifiedInbound: 5, likeBacks: 0 }, cfg), 5);
});
