// The honest signal quota copy (UX_SPEC §B "Signal counter", D-026, D-032). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { quotaLabel, quotaErrorText, quotaBlocked, resetTimeLabel, quotaNotice } from '../../site/scripts/signal-quota.js';

const RESETS = '2026-10-03T15:00:00Z';
// R7 (iteration 3): the reset time is local, "3 PM" on the hour and "8:30 PM" otherwise. The server rounds to the UTC hour, so
// in Asia/Kolkata (+5:30) 15:00Z is 8:30 PM. The expectation uses the same Intl formatting, so the suite passes in any TZ
// (run it under TZ=UTC and TZ=Asia/Kolkata to see both branches).
const localFormat = (iso) => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], d.getMinutes() === 0 ? { hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' });
};
const localTime = localFormat(RESETS);

test('the local time keeps its minutes only when the zone is off the hour', () => {
  const off = new Date(RESETS).getMinutes() !== 0;
  assert.equal(/:\d\d/.test(localTime), off);
  if (process.env.TZ === 'Asia/Kolkata') assert.match(localTime, /^8:30\s?PM$/i);
  if (process.env.TZ === 'UTC') assert.match(localTime, /^3\s?PM$/i);
});

test('quotaLabel: normal state reads "N of 10 swipes left today" (10 = the quota\'s daily_limit, D-156)', () => {
  assert.equal(quotaLabel({ remaining: 10, daily_limit: 10, resets_at: null }), '10 of 10 swipes left today');
  assert.equal(quotaLabel({ remaining: 4, daily_limit: 10, resets_at: RESETS }), '4 of 10 swipes left today');
  assert.equal(quotaLabel({ remaining: 7, daily_limit: 20, resets_at: RESETS }), '7 of 20 swipes left today', 'the limit comes from the quota object');
});

test('quotaLabel: a quota without daily_limit (send_signal result merged early) falls back to 10', () => {
  assert.equal(quotaLabel({ remaining: 9, resets_at: RESETS }), '9 of 10 swipes left today');
});

test('quotaLabel: 0 left says "Your next swipe frees up at 3 PM" in local time, hour numeric', () => {
  const label = quotaLabel({ remaining: 0, daily_limit: 10, resets_at: RESETS });
  assert.equal(label, `Your next swipe frees up at ${localTime}`);
});

test('quotaLabel: 0 left without a reset time never invents one', () => {
  assert.equal(quotaLabel({ remaining: 0, daily_limit: 10, resets_at: null }), '0 of 10 swipes left today');
});

test('quotaNotice: the zero-quota notice beside the deck (passes count too, D-156)', () => {
  assert.equal(quotaNotice({ remaining: 0, daily_limit: 10, resets_at: RESETS }), `You've used your 10 free swipes for today. More at ${localTime}.`);
  assert.equal(quotaNotice({ remaining: 0, resets_at: null }), "You've used your free swipes for today.");
  assert.equal(quotaNotice({ remaining: 4, live_unanswered: 100, live_limit: 100 }), 'You have 100 signals waiting for an answer. Passing is always free.');
  assert.equal(quotaNotice({ remaining: 4, live_unanswered: 2, live_limit: 100 }), '');
  assert.equal(quotaNotice(null), '');
});

test('quotaLabel: at the live cap it shows the waiting count from live_limit', () => {
  assert.equal(quotaLabel({ remaining: 12, resets_at: RESETS, live_unanswered: 100, live_limit: 100 }), 'You have 100 signals waiting for an answer');
});

test('quotaLabel: an unknown quota (not loaded yet) is an empty string', () => {
  assert.equal(quotaLabel(null), '');
  assert.equal(quotaLabel({}), '');
});

test('quotaErrorText: signal_quota_exhausted and swipe_quota_exhausted (a refused pass, D-156)', () => {
  const text = quotaErrorText({ code: 'PT429', message: 'signal_quota_exhausted' }, { remaining: 0, resets_at: RESETS });
  assert.equal(text, `You've used today's swipes. More at ${localTime}.`);
  assert.equal(quotaErrorText({ code: 'PT429', message: 'swipe_quota_exhausted' }, { remaining: 0, resets_at: RESETS }), text);
});

test('quotaErrorText: signal_quota_exhausted without a known reset time', () => {
  assert.equal(quotaErrorText({ code: 'PT429', message: 'signal_quota_exhausted' }, null), "You've used today's swipes.");
  assert.equal(quotaErrorText({ code: 'PT429', message: 'try again later' }, null), null, 'a PT429 without a cap message is not a quota text');
});

test('quotaErrorText: signal_live_cap', () => {
  assert.equal(quotaErrorText({ code: 'PT429', message: 'signal_live_cap' }, { live_limit: 100 }), 'You have 100 signals waiting for an answer.');
  assert.equal(quotaErrorText({ code: 'PT429', message: 'signal_live_cap' }), 'You have 100 signals waiting for an answer.');
});

test('quotaErrorText: a cap message counts only with PT429 or HTTP 429', () => {
  assert.equal(quotaErrorText({ code: '22023', message: 'signal_quota_exhausted' }, { remaining: 0, resets_at: RESETS }), null);
  assert.equal(quotaErrorText({ message: 'signal_live_cap' }, { live_limit: 100 }), null);
  assert.equal(quotaErrorText({ message: 'signal_live_cap' }, { live_limit: 100 }, 429), 'You have 100 signals waiting for an answer.');
  assert.equal(quotaErrorText({ code: 'XX000', message: 'signal_quota_exhausted' }, null, 500), null);
});

test('quotaErrorText: an unrelated error is null', () => {
  assert.equal(quotaErrorText({ code: '22023', message: 'invalid signal' }, { remaining: 3 }), null);
  assert.equal(quotaErrorText(new Error('network'), null), null);
  assert.equal(quotaErrorText(null, null), null);
});

test('quotaBlocked: daily at 0, live at the live cap, otherwise null', () => {
  assert.equal(quotaBlocked({ remaining: 0, resets_at: RESETS, live_unanswered: 3, live_limit: 100 }), 'daily');
  assert.equal(quotaBlocked({ remaining: 5, live_unanswered: 100, live_limit: 100 }), 'live');
  assert.equal(quotaBlocked({ remaining: 5, live_unanswered: 99, live_limit: 100 }), null);
  assert.equal(quotaBlocked(null), null, 'an unknown quota never blocks: the server decides');
});

test('resetTimeLabel: local hour ("3 PM"), minutes only when not on the hour, empty for a missing or bad value', () => {
  assert.equal(resetTimeLabel(RESETS), localTime);
  for (const iso of ['2026-10-03T15:30:00Z', '2026-10-03T15:45:00Z', '2026-10-03T00:00:00Z']) assert.equal(resetTimeLabel(iso), localFormat(iso));
  assert.equal(resetTimeLabel(null), '');
  assert.equal(resetTimeLabel('not a date'), '');
});
