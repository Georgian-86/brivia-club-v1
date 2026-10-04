// The honest signal quota copy (UX_SPEC §B "Signal counter", D-026, D-032). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { quotaLabel, quotaErrorText, quotaBlocked, resetTimeLabel, quotaNotice } from '../../signal-quota.js';

const RESETS = '2026-10-03T15:00:00Z';
const localTime = new Date(RESETS).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

test('quotaLabel: 30 left reads "30 signals left today"', () => {
  assert.equal(quotaLabel({ remaining: 30, resets_at: null }), '30 signals left today');
});

test('quotaLabel: 1 left is singular', () => {
  assert.equal(quotaLabel({ remaining: 1, resets_at: RESETS }), '1 signal left today');
});

test('quotaLabel: 0 left says so plainly: "0 signals left · more at HH:MM" in local time', () => {
  const label = quotaLabel({ remaining: 0, resets_at: RESETS });
  assert.match(label, /more at/);
  assert.equal(label, `0 signals left · more at ${localTime}`);
});

test('quotaLabel: 0 left without a reset time never invents one', () => {
  assert.equal(quotaLabel({ remaining: 0, resets_at: null }), '0 signals left today');
});

test('quotaNotice: the zero-quota notice beside the deck', () => {
  assert.equal(quotaNotice({ remaining: 0, resets_at: RESETS }), `No signals left today. More at ${localTime} · Passing is always free.`);
  assert.equal(quotaNotice({ remaining: 0, resets_at: null }), 'No signals left today · Passing is always free.');
  assert.equal(quotaNotice({ remaining: 4, live_unanswered: 100, live_limit: 100 }), 'You have 100 signals waiting for an answer · Passing is always free.');
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

test('quotaErrorText: signal_quota_exhausted', () => {
  const text = quotaErrorText({ code: 'PT429', message: 'signal_quota_exhausted' }, { remaining: 0, resets_at: RESETS });
  assert.equal(text, `You've used today's signals. More at ${localTime}.`);
});

test('quotaErrorText: signal_quota_exhausted without a known reset time', () => {
  assert.equal(quotaErrorText({ code: 'PT429', message: 'signal_quota_exhausted' }, null), "You've used today's signals.");
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

test('resetTimeLabel: local HH:MM, empty for a missing or bad value', () => {
  assert.equal(resetTimeLabel(RESETS), localTime);
  assert.equal(resetTimeLabel(null), '');
  assert.equal(resetTimeLabel('not a date'), '');
});
