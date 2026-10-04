// Pending onboarding (email confirmation) minimisation. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { PENDING_MAX_AGE_MS, buildPendingOnboarding, isPendingExpired } from '../../pending-profile.js';

const state = { items: [
  { id: 'games.board.chess', label: 'Chess', points: 10, mode: 'teach' },
  { id: 'wellbeing.spirituality.scripture_study', label: 'Scripture study', points: 6, mode: 'play' },
  { id: 'sports.racket.tennis', label: 'Tennis', points: 4 },
] };
const sensitive = new Set(['wellbeing.spirituality.scripture_study']);

test('pending interests keep only { id, points, mode }: no labels', () => {
  const pending = buildPendingOnboarding(state, (id) => sensitive.has(id), { kind: 'city', placeId: 'in-pune' }, 1000);
  pending.interests.forEach((item) => assert.deepEqual(Object.keys(item).sort(), ['id', 'mode', 'points']));
  assert.ok(!JSON.stringify(pending).includes('Chess'));
});

test('sensitive interests are left out and flagged', () => {
  const pending = buildPendingOnboarding(state, (id) => sensitive.has(id), { kind: 'geo' }, 1000);
  assert.deepEqual(pending.interests, [
    { id: 'games.board.chess', points: 10, mode: 'teach' },
    { id: 'sports.racket.tennis', points: 4, mode: 'play' },
  ]);
  assert.equal(pending.privateOmitted, true);
  const none = buildPendingOnboarding({ items: [state.items[0]] }, () => false, { kind: 'geo' }, 1000);
  assert.equal(none.privateOmitted, false);
});

test('orbit keeps only the kind (and a city id), never coordinates', () => {
  assert.deepEqual(buildPendingOnboarding(state, () => false, { kind: 'geo', lat: 12.97, lng: 77.59 }, 1).orbit, { kind: 'geo' });
  assert.deepEqual(buildPendingOnboarding(state, () => false, { kind: 'city', placeId: 'in-pune', label: 'Pune' }, 1).orbit, { kind: 'city', placeId: 'in-pune' });
  assert.deepEqual(buildPendingOnboarding(state, () => false, null, 1).orbit, { kind: 'geo' });
  assert.ok(!/12\.97|77\.59|lat|lng/.test(JSON.stringify(buildPendingOnboarding(state, () => false, { kind: 'geo', lat: 12.97, lng: 77.59 }, 1))));
});

test('savedAt is stored and the pending profile expires after 7 days', () => {
  assert.equal(PENDING_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1000);
  const now = Date.UTC(2026, 9, 4);
  const pending = buildPendingOnboarding(state, () => false, { kind: 'geo' }, now);
  assert.equal(pending.savedAt, now);
  assert.equal(isPendingExpired(pending, now + PENDING_MAX_AGE_MS - 1), false);
  assert.equal(isPendingExpired(pending, now + PENDING_MAX_AGE_MS + 1), true);
  assert.equal(isPendingExpired({ email: 'x' }, now), true); // no savedAt (an older build): treat as expired
  assert.equal(isPendingExpired({ savedAt: now + 60 * 60 * 1000 }, now), true); // from the future: not trusted
  assert.equal(isPendingExpired(null, now), true);
});
