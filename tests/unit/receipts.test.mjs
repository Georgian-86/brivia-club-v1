import test from 'node:test';
import assert from 'node:assert/strict';
import { receiptState, receiptMarkup, lastOwnMessageId, applyReceipt, needsReadReceipt, needsDeliveredReceipt, lastActiveLabel } from '../../site/scripts/receipts.js';

test('receiptState: only my messages, read beats delivered beats sent', () => {
  assert.equal(receiptState({ from: 'them', readAt: 'x' }), '');
  assert.equal(receiptState({ from: 'me' }), 'sent');
  assert.equal(receiptState({ from: 'me', deliveredAt: '2026-11-03T10:00:00Z' }), 'delivered');
  assert.equal(receiptState({ from: 'me', deliveredAt: 'a', readAt: 'b' }), 'read');
  assert.equal(receiptState(null), '');
});

test('receiptMarkup: one tick for sent, two for delivered and read, labelled', () => {
  assert.equal(receiptMarkup(''), '');
  assert.match(receiptMarkup('sent'), /is-sent.*aria-label="Sent"/);
  assert.equal((receiptMarkup('sent').match(/<path/g) || []).length, 1);
  assert.equal((receiptMarkup('delivered').match(/<path/g) || []).length, 2);
  assert.match(receiptMarkup('read'), /is-read.*aria-label="Read"/);
});

test('lastOwnMessageId: the newest message I sent', () => {
  assert.equal(lastOwnMessageId([{ id: 1, from: 'me' }, { id: 2, from: 'me' }, { id: 3, from: 'them' }]), '2');
  assert.equal(lastOwnMessageId([{ id: 3, from: 'them' }]), '');
  assert.equal(lastOwnMessageId(null), '');
});

test('applyReceipt: copies the server times, same array when nothing changed, never clears', () => {
  const list = [{ id: 'a', from: 'me' }, { id: 'b', from: 'me', deliveredAt: 'd1' }];
  assert.equal(applyReceipt(list, { id: 'zz', read_at: 'r' }), list);
  assert.equal(applyReceipt(list, { id: 'b', delivered_at: 'd1', read_at: null }), list);
  const next = applyReceipt(list, { id: 'a', delivered_at: 'd2', read_at: 'r2' });
  assert.notEqual(next, list);
  assert.deepEqual(next[0], { id: 'a', from: 'me', deliveredAt: 'd2', readAt: 'r2' });
  assert.equal(list[0].readAt, undefined);
  assert.equal(applyReceipt(next, { id: 'a', delivered_at: null, read_at: null })[0].readAt, 'r2');
});

test('needsReadReceipt / needsDeliveredReceipt', () => {
  assert.equal(needsReadReceipt([{ from: 'me' }, { from: 'them', readAt: 'x' }]), false);
  assert.equal(needsReadReceipt([{ from: 'them' }]), true);
  assert.equal(needsDeliveredReceipt([{ recipient_id: 'u1', delivered_at: 'x' }], 'u1'), false);
  assert.equal(needsDeliveredReceipt([{ recipient_id: 'u1', delivered_at: null }], 'u1'), true);
  assert.equal(needsDeliveredReceipt([{ recipient_id: 'u2', delivered_at: null }], 'u1'), false);
});

test('lastActiveLabel: now, minutes, hours, yesterday, a date', () => {
  const now = new Date(2026, 10, 3, 15, 0).getTime();
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.equal(lastActiveLabel(true, ''), 'Active now');
  assert.equal(lastActiveLabel(false, ''), '');
  assert.equal(lastActiveLabel(false, 'nonsense', now), '');
  assert.equal(lastActiveLabel(false, ago(60000), now), 'Active now');
  assert.equal(lastActiveLabel(false, ago(5 * 60000), now), 'Active 5 min ago');
  assert.equal(lastActiveLabel(false, ago(2 * 3600000), now), 'Active 2 h ago');
  assert.equal(lastActiveLabel(false, new Date(2026, 10, 2, 9, 0).toISOString(), now), 'Active yesterday');
  assert.equal(lastActiveLabel(false, new Date(2026, 9, 28, 9, 0).toISOString(), now), 'Active 28 Oct');
  assert.equal(lastActiveLabel(false, new Date(2025, 9, 28, 9, 0).toISOString(), now), 'Active 28 Oct 2025');
});
