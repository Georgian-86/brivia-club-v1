// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { explain } from '../src/compose.js';

const hit = (o = {}) => ({
  mine: { id: 'bouldering', label: 'Bouldering', points: 6, mode: 'play' },
  theirs: { id: 'bouldering', points: 5, mode: 'play' },
  topo: 1, rarity: 0.8, score: 0.3, ...o,
});
const sc = (o = {}) => ({ candidate: {}, R: 0.5, ring: 0, km: 1, G: 1, hits: [], coPresence: 0, worthTheDistance: false, ...o });

test('no hits, nothing else: no chips', () => {
  assert.deepEqual(explain(sc()), []);
});

test('rare deep shared interest chip', () => {
  assert.deepEqual(explain(sc({ hits: [hit()] })), ['Both deep into Bouldering, rare nearby']);
});

test('rare chip needs rarity >= 0.7 and both points >= 4', () => {
  assert.deepEqual(explain(sc({ hits: [hit({ rarity: 0.69 })] })), []);
  assert.deepEqual(explain(sc({ hits: [hit({ theirs: { id: 'b', points: 3, mode: 'play' } })] })), []);
});

test('label falls back to id', () => {
  const h = hit({ mine: { id: 'chess', points: 6, mode: 'play' } });
  assert.deepEqual(explain(sc({ hits: [h] })), ['Both deep into chess, rare nearby']);
});

test('teach/learn chips both directions', () => {
  const t = hit({ rarity: 0.1, mine: { id: 'g', label: 'Guitar', points: 5, mode: 'teach' }, theirs: { id: 'g', points: 5, mode: 'learn' } });
  assert.deepEqual(explain(sc({ hits: [t] })), ['You teach Guitar, they want to learn it']);
  const l = hit({ rarity: 0.1, mine: { id: 'g', label: 'Guitar', points: 5, mode: 'learn' }, theirs: { id: 'g', points: 5, mode: 'teach' } });
  assert.deepEqual(explain(sc({ hits: [l] })), ['They teach Guitar, you want to learn it']);
});

test('co-presence chip only for ring <= 1 and coPresence > 0', () => {
  assert.deepEqual(explain(sc({ ring: 1, km: 7.2, coPresence: 0.5 })), ['~7 km away, free at the same times']);
  assert.deepEqual(explain(sc({ ring: 0, coPresence: 0.5 })), ['< 3 km away, free at the same times']);
  assert.deepEqual(explain(sc({ ring: 2, coPresence: 0.5 })), []);
  assert.deepEqual(explain(sc({ ring: 0, coPresence: 0 })), []);
});

test('worth the distance chip first; at most 3 chips', () => {
  const t = hit({ mine: { id: 'g', label: 'Guitar', points: 5, mode: 'teach' }, theirs: { id: 'g', points: 5, mode: 'learn' } });
  const l = hit({ mine: { id: 'h', label: 'Go', points: 5, mode: 'learn' }, theirs: { id: 'h', points: 5, mode: 'teach' }, rarity: 0.1 });
  const chips = explain(sc({ ring: 0, coPresence: 1, worthTheDistance: true, R: 0.914, hits: [hit(), t, l] }));
  assert.equal(chips.length, 3);
  assert.equal(chips[0], 'Worth the distance: 91% resonance');
  assert.equal(chips[1], 'Both deep into Bouldering, rare nearby');
});
