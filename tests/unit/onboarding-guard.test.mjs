// Under-review detection and the consent rollback rule (final fix F2). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnderReview, shouldWithdrawConsent, UNDER_REVIEW_COPY } from '../../onboarding-guard.js';

const row = { name: 'Nia New', adult_declared_at: '2026-10-05T00:00:00Z' };
const status = { interests: 3, points: 20, has_cell: true, place_label: 'Pune', completed: false };

test('F2a: every client-visible step done but completed = false -> under review', () => {
  assert.equal(isUnderReview(status, row), true);
});

test('F2a: a member with a missing step is not under review (they finish onboarding)', () => {
  assert.equal(isUnderReview({ ...status, completed: true }, row), false);
  assert.equal(isUnderReview(status, { ...row, name: 'New Member' }), false);
  assert.equal(isUnderReview(status, { ...row, name: '  ' }), false);
  assert.equal(isUnderReview(status, { ...row, adult_declared_at: null }), false);
  assert.equal(isUnderReview({ ...status, has_cell: false }, row), false);
  assert.equal(isUnderReview({ ...status, interests: 0, points: 0 }, row), false);
  assert.equal(isUnderReview({ ...status, points: 19 }, row), false);
  assert.equal(isUnderReview(null, row), false);
  assert.equal(isUnderReview(status, null), false);
});

test('F2a: the notice copy is exact and names no reporter', () => {
  assert.equal(UNDER_REVIEW_COPY, 'Your profile is being reviewed. This usually takes up to 72 hours. Questions? Email thebrivia.club@gmail.com.');
});

test('F2b: consent is withdrawn after a failed save only when it was null before this submit', () => {
  assert.equal(shouldWithdrawConsent({ gaveConsent: true, consentBefore: null }), true);
  assert.equal(shouldWithdrawConsent({ gaveConsent: true, consentBefore: '2026-10-01T00:00:00Z' }), false);
  assert.equal(shouldWithdrawConsent({ gaveConsent: true, consentBefore: undefined }), false, 'unknown prior state: never withdraw');
  assert.equal(shouldWithdrawConsent({ gaveConsent: false, consentBefore: null }), false);
});
