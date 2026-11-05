// D-157 (0046): edit, unsend and delete for me; D-191 (0055): reply. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { messageActions, canEditMessage, applyMessageUpdate, unsentLabel, previewForUnsent, EDIT_WINDOW_MS, replyQuote, QUOTE_MAX } from '../../site/scripts/message-actions.js';

const ID = '0e460000-0000-4000-8000-0000000000a1';
const NOW = Date.parse('2026-11-04T10:00:00Z');
const mine = (over = {}) => ({ id: ID, from: 'me', text: 'Hello', createdAt: new Date(NOW - 60_000).toISOString(), attachment: null, ...over });

test('my fresh text message offers Copy, Edit, Unsend and Delete for me', () => {
  assert.deepEqual(messageActions(mine(), { now: NOW }), ['reply', 'copy', 'edit', 'unsend', 'delete']);
});

test('Edit closes 15 minutes after sending; Unsend stays', () => {
  const old = mine({ createdAt: new Date(NOW - EDIT_WINDOW_MS - 1).toISOString() });
  assert.equal(canEditMessage(old, { now: NOW }), false);
  assert.deepEqual(messageActions(old, { now: NOW }), ['reply', 'copy', 'unsend', 'delete']);
});

test('their message: Reply, Copy and Delete for me only', () => {
  assert.deepEqual(messageActions(mine({ from: 'them' }), { now: NOW }), ['reply', 'copy', 'delete']);
});

test('attachments and shared cards cannot be edited or copied, but can be unsent', () => {
  assert.deepEqual(messageActions(mine({ text: '', attachment: { kind: 'image' } }), { now: NOW }), ['reply', 'unsend', 'delete']);
  assert.deepEqual(messageActions(mine(), { now: NOW, special: true }), ['reply', 'unsend', 'delete']);
});

test('an unsent message can only be deleted for me (no reply to it); a local (non-server) id offers nothing', () => {
  assert.deepEqual(messageActions(mine({ text: '', unsentAt: '2026-11-04T09:59:00Z' }), { now: NOW }), ['delete']);
  assert.deepEqual(messageActions(mine({ id: 'local-1' }), { now: NOW }), []);
});

test('applyMessageUpdate applies an edit, then an unsend; unchanged rows keep the same array', () => {
  const thread = [mine(), { ...mine(), id: 'other' }];
  const edited = applyMessageUpdate(thread, { id: ID, body: 'Hello there', edited_at: '2026-11-04T10:01:00Z', unsent_at: null });
  assert.notEqual(edited, thread);
  assert.equal(edited[0].text, 'Hello there');
  assert.equal(edited[0].editedAt, '2026-11-04T10:01:00Z');
  assert.equal(edited[1], thread[1]);
  assert.equal(applyMessageUpdate(edited, { id: ID, body: 'Hello there', edited_at: '2026-11-04T10:01:00Z', unsent_at: null }), edited);
  const unsent = applyMessageUpdate(edited, { id: ID, body: '', edited_at: null, unsent_at: '2026-11-04T10:02:00Z' });
  assert.equal(unsent[0].text, '');
  assert.equal(unsent[0].unsentAt, '2026-11-04T10:02:00Z');
  assert.equal(unsent[0].editedAt, '');
  assert.equal(applyMessageUpdate(unsent, { id: 'missing', body: 'x' }), unsent);
});

test('unsent copy differs for the sender and the recipient; the inbox preview uses it', () => {
  assert.equal(unsentLabel('me'), 'You unsent a message');
  assert.equal(unsentLabel('them'), 'This message was unsent');
  assert.equal(previewForUnsent({ from: 'them', unsentAt: 'x' }), 'This message was unsent');
  assert.equal(previewForUnsent({ from: 'me', text: 'hi' }), null);
});

test('replyQuote: who said it and a short line, from the thread I hold (D-191)', () => {
  const thread = [mine({ id: 'a', text: 'I love mountains' }), mine({ id: 'b', from: 'them', text: '  Been   to Manali? ' })];
  assert.deepEqual(replyQuote(thread, 'a', { themName: 'Vinayak Mehta' }), { id: 'a', who: 'You', text: 'I love mountains' });
  assert.deepEqual(replyQuote(thread, 'b', { themName: 'Vinayak Mehta' }), { id: 'b', who: 'Vinayak', text: 'Been to Manali?' });
  assert.equal(replyQuote(thread, null), null);
});
test('replyQuote: unsent, missing, cards and long lines', () => {
  const thread = [mine({ id: 'u', text: '', unsentAt: 'x', from: 'them' }), mine({ id: 'p', text: '', attachment: { kind: 'image' } }), mine({ id: 'l', text: 'x'.repeat(200) })];
  assert.equal(replyQuote(thread, 'u', { themName: 'Asha' }).text, 'This message was unsent');
  const gone = replyQuote(thread, 'zz');
  assert.equal(gone.missing, true);
  assert.equal(gone.text, 'Original message unavailable');
  assert.equal(replyQuote(thread, 'p', { kindLabel: (m) => (m.attachment ? 'Photo' : '') }).text, 'Photo');
  const long = replyQuote(thread, 'l').text;
  assert.equal(long.length, QUOTE_MAX);
  assert.ok(long.endsWith('…'));
});
