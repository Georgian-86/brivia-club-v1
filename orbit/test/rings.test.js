// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { toCell, distanceKm, ringOf, distanceBand } from '../src/rings.js';

const cfg = loadConfig();

test('ringOf boundaries are inclusive upper bounds', () => {
  const cases = [[0, 0], [3, 0], [3.01, 1], [15, 1], [60, 2], [350, 3], [2500, 4], [2501, 5]];
  for (const [km, ring] of cases) assert.equal(ringOf(km, cfg), ring, `ringOf(${km})`);
});

test('distanceKm of a cell to itself is exactly 0', () => {
  const c = toCell(12.9716, 77.5946, cfg);
  assert.equal(distanceKm(c, c), 0);
});

test('Bengaluru to Mysuru is ring 3', () => {
  const a = toCell(12.9716, 77.5946, cfg);
  const b = toCell(12.2958, 76.6394, cfg);
  assert.equal(typeof a, 'string');
  const d = distanceKm(a, b);
  assert.ok(d > 120 && d < 130, `d=${d}`);
  assert.equal(ringOf(d, cfg), 3);
});

test('distanceBand per ring', () => {
  assert.equal(distanceBand(2.1, 0), '< 3 km');
  assert.equal(distanceBand(8.4, 1), '~8 km');
  assert.equal(distanceBand(40, 2, 'Mumbai'), 'Mumbai');
  assert.equal(distanceBand(40, 2), '~40 km');
  assert.equal(distanceBand(125, 3), '~125 km');
  assert.equal(distanceBand(800, 4), 'India');
  assert.equal(distanceBand(800, 4, 'Karnataka'), 'Karnataka');
  assert.equal(distanceBand(3000, 5), 'Abroad');
});
