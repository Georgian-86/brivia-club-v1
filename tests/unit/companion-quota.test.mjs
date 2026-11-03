// D-156 (0045): 10 companion swipes a day. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { companionQuotaLabel, companionQuotaBlocked } from '../../site/scripts/companions-page.js';

test('companionQuotaLabel counts down "N of 10 swipes left today"', () => {
  assert.equal(companionQuotaLabel({ daily_limit: 10, remaining: 10, resets_at: null }), '10 of 10 swipes left today');
  assert.equal(companionQuotaLabel({ daily_limit: 10, remaining: 1, resets_at: '2026-11-04T10:00:00Z' }), '1 of 10 swipes left today');
});

test('companionQuotaLabel at 0 says when swipes come back, never inventing a time', () => {
  assert.match(companionQuotaLabel({ daily_limit: 10, remaining: 0, resets_at: '2026-11-04T10:00:00Z' }), /^No swipes left today\. More at .+\.$/);
  assert.equal(companionQuotaLabel({ daily_limit: 10, remaining: 0, resets_at: null }), 'No swipes left today.');
});

test('an unknown quota (not loaded, or before 0045) shows nothing and never blocks', () => {
  assert.equal(companionQuotaLabel(null), '');
  assert.equal(companionQuotaBlocked(null), false);
  assert.equal(companionQuotaBlocked({}), false);
  assert.equal(companionQuotaBlocked({ remaining: 3 }), false);
  assert.equal(companionQuotaBlocked({ remaining: 0 }), true);
});
