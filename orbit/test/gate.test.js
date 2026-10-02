// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { buildTopology } from '../src/topology.js';
import { resonance } from '../src/resonance.js';
import { thresholds, isEligible, isWorthTheDistance } from '../src/gate.js';

const cfg = loadConfig();
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !≈ ${b}`);

test('thresholds equal base theta at and above L*', () => {
  assert.deepEqual(thresholds(40, cfg), cfg.theta);
  assert.deepEqual(thresholds(400, cfg), cfg.theta);
});

test('thresholds relax with low liquidity', () => {
  const t = thresholds(5, cfg);
  close(t[3], 0.4625);
  close(t[2], 0.295);
});

test('thresholds(0): rings 0-1 never relax; none below theta[0]', () => {
  const t = thresholds(0, cfg);
  assert.equal(t[0], 0.15);
  assert.equal(t[1], 0.25);
  for (const L of [0, 1, 5, 20, 39, 40, 100]) {
    for (const v of thresholds(L, cfg)) assert.ok(v >= cfg.theta[0]);
  }
});

test('Golden 1: one shared common interest is local-only', () => {
  const topology = buildTopology(['X', 'Y', 'Z', 'W', 'V'].map((id) => ({ id, parentId: null, level: 'domain' })));
  const ctx = { topology, rarityOf: () => 0.4, cfg };
  const A = { id: 'A', interests: [{ id: 'X', points: 4, mode: 'play' }, { id: 'Y', points: 8, mode: 'play' }, { id: 'Z', points: 8, mode: 'play' }] };
  const B = { id: 'B', interests: [{ id: 'X', points: 4, mode: 'play' }, { id: 'W', points: 8, mode: 'play' }, { id: 'V', points: 8, mode: 'play' }] };
  const { R } = resonance(A, B, ctx);
  assert.ok(R > 0.15 && R < 0.4, `R=${R}`);
  assert.equal(isEligible(R, 0, 40, cfg), true);
  assert.equal(isEligible(R, 3, 40, cfg), false);
});

test('Golden 2: worth-the-distance', () => {
  assert.equal(isWorthTheDistance(0.9, 4, cfg), true);
  assert.equal(isWorthTheDistance(0.85, 4, cfg), false);
  assert.equal(isWorthTheDistance(0.95, 2, cfg), false);
  assert.equal(isWorthTheDistance(0.86, 3, cfg), true);
});

test('Golden 5: thin local supply widens the circle', () => {
  assert.equal(isEligible(0.55, 3, 5, cfg), true);
  assert.equal(isEligible(0.55, 3, 40, cfg), false);
});

test('minor: L < 0 never over-relaxes (slack capped at 1)', () => {
  assert.deepEqual(thresholds(-40, cfg), thresholds(0, cfg));
  assert.deepEqual(thresholds(-1e9, cfg), thresholds(0, cfg));
});

test('I2/R12: non-finite L is treated as 0', () => {
  for (const L of [undefined, NaN, null, Infinity * 0]) assert.deepEqual(thresholds(L, cfg), thresholds(0, cfg), String(L));
  assert.equal(isEligible(0.3, 2, undefined, cfg), isEligible(0.3, 2, 0, cfg));
});
