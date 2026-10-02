// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { buildTopology } from '../src/topology.js';
import { passionWeights, rarity, directedResonance, resonance, semScale } from '../src/resonance.js';

const cfg = loadConfig();
const topology = buildTopology(['X', 'Y', 'Z', 'W', 'Guitar'].map((id) => ({ id, parentId: null, level: 'domain' })));
const ctx = (extra = {}) => ({ topology, rarityOf: () => 1, cfg, ...extra });
const mem = (id, spec, mode = 'play') => ({
  id,
  interests: Object.entries(spec).map(([k, points]) => ({ id: k, points, mode })),
});

test('passionWeights sums to 1; empty when total 0', () => {
  const w = passionWeights([{ id: 'a', points: 15, mode: 'play' }, { id: 'b', points: 5, mode: 'play' }]);
  assert.equal(w.get('a'), 0.75);
  assert.equal(w.get('b'), 0.25);
  assert.equal(passionWeights([]).size, 0);
  assert.equal(passionWeights([{ id: 'a', points: 0, mode: 'play' }]).size, 0);
});

test('rarity formula', () => {
  assert.ok(Math.abs(rarity(0, 100, cfg) - 1.0) < 1e-4);
  assert.ok(Math.abs(rarity(99, 100, cfg) - 0.4476) < 1e-4);
});

test('Golden 3: concentrated one-sided passion scores below balanced', () => {
  const low = resonance(mem('A', { X: 18, Y: 2 }), mem('B', { X: 1, Z: 19 }), ctx());
  const high = resonance(mem('A2', { X: 10, Y: 10 }), mem('B2', { X: 10, W: 10 }), ctx());
  assert.ok(low.R < high.R);
});

test('Golden 4: teach+learn beats play+play', () => {
  const tl = resonance(mem('A', { Guitar: 20 }, 'teach'), mem('B', { Guitar: 20 }, 'learn'), ctx());
  const pp = resonance(mem('A', { Guitar: 20 }, 'play'), mem('B', { Guitar: 20 }, 'play'), ctx());
  assert.ok(tl.R > pp.R);
});

test('harmonic: zero in one direction gives R 0', () => {
  const a = mem('A', { X: 20 });
  const b = mem('B', { Z: 20 });
  assert.equal(directedResonance(b, a, ctx()).value, 0);
  assert.equal(resonance(a, b, ctx({ aboutCos: 1 })).Rstruct, 0);
  assert.equal(resonance(a, b, ctx()).R, 0);
  assert.equal(resonance(a, b, ctx({ aboutCos: 1 })).R, 0); // R8
});

test('semantic cap', () => {
  const a = mem('A', { X: 10, Y: 10 });
  const b = mem('B', { X: 10, W: 10 });
  const base = resonance(a, b, ctx());
  const sem = resonance(a, b, ctx({ aboutCos: 1 }));
  assert.equal(sem.Rstruct, base.Rstruct);
  assert.ok(sem.R - base.R <= 0.25 * semScale(1) + 1e-12);
  assert.ok(Math.abs(sem.R - (0.75 * (1 - Math.exp(-3 * base.Rstruct)) + 0.25)) < 1e-12);
  assert.equal(resonance(a, b, ctx({ aboutCos: null })).R, base.R);
});

test('semScale clamps', () => {
  assert.equal(semScale(0.05), 0);
  assert.equal(semScale(1), 1);
  assert.ok(Math.abs(semScale(0.375) - 0.5) < 1e-12);
});

test('empty interests: R 0, no throw', () => {
  const r = resonance({ id: 'A', interests: [] }, mem('B', { X: 20 }), ctx());
  assert.equal(r.R, 0);
  assert.equal(resonance({ id: 'A', interests: [] }, mem('B', { X: 20 }), ctx({ aboutCos: 1 })).R, 0);
  assert.equal(r.Rstruct, 0);
  assert.deepEqual(r.hits, []);
});

test('hits shape (R2)', () => {
  const d = directedResonance(mem('A', { X: 20 }, 'teach'), mem('B', { X: 20 }, 'learn'), ctx());
  assert.equal(d.hits.length, 1);
  const h = d.hits[0];
  assert.deepEqual(h.mine, { id: 'X', points: 20, mode: 'teach' });
  assert.deepEqual(h.theirs, { id: 'X', points: 20, mode: 'learn' });
  assert.equal(h.topo, 1);
  assert.equal(h.rarity, 1);
  assert.ok(Math.abs(h.score - 1.15) < 1e-12);
  assert.ok(Math.abs(d.value - 1.15) < 1e-12);
});

test('I4: semScale reads cfg.semantic (defaults unchanged)', () => {
  assert.ok(Math.abs(semScale(0.375, cfg) - 0.5) < 1e-12);
  const c2 = loadConfig({ semantic: { cosFloor: 0, cosSpan: 1 } });
  assert.ok(Math.abs(semScale(0.375, c2) - 0.375) < 1e-12);
  const a = mem('A', { X: 10, Y: 10 }), b = mem('B', { X: 10, W: 10 });
  const r = resonance(a, b, { topology, rarityOf: () => 1, cfg: c2, aboutCos: 0.375 });
  assert.ok(Math.abs(r.R - (0.75 * (1 - Math.exp(-3 * r.Rstruct)) + 0.25 * 0.375)) < 1e-12);
});
