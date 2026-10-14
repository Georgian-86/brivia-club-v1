// The old pending profile (kept for one release after Phase E): expiry. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { PENDING_MAX_AGE_MS, isPendingExpired } from '../../pending-profile.js';

test('a pending profile expires after 7 days, without savedAt, or dated in the future', () => {
  assert.equal(PENDING_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1000);
  const now = Date.UTC(2026, 9, 4);
  const pending = { savedAt: now };
  assert.equal(isPendingExpired(pending, now + PENDING_MAX_AGE_MS - 1), false);
  assert.equal(isPendingExpired(pending, now + PENDING_MAX_AGE_MS + 1), true);
  assert.equal(isPendingExpired({ email: 'x' }, now), true); // no savedAt (an older build): treat as expired
  assert.equal(isPendingExpired({ savedAt: now + 60 * 60 * 1000 }, now), true); // from the future: not trusted
  assert.equal(isPendingExpired(null, now), true);
});
