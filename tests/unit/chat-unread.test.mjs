import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReadState, serializeReadState, lastReadAt, unreadCount, markRead, lastContactAt, sortByLastContact, unreadTotal } from '../../site/scripts/chat-unread.js';

const T = (m) => new Date(Date.UTC(2026, 9, 28, 10, m)).toISOString();
const msgs = [
  { from: 'them', createdAt: T(1) },
  { from: 'me', createdAt: T(2) },
  { from: 'them', createdAt: T(3) },
  { from: 'them', createdAt: T(4) },
];

test('a first run starts from a baseline: older messages count as read', () => {
  const state = parseReadState(null, T(2));
  assert.equal(state.baseline, T(2));
  assert.equal(lastReadAt(state, 'p'), T(2));
  assert.equal(unreadCount(msgs, lastReadAt(state, 'p')), 2);
  assert.equal(unreadCount([{ from: 'them', createdAt: T(1) }], lastReadAt(state, 'p')), 0);
});

test('a stored state round-trips and ignores junk', () => {
  const state = markRead(parseReadState(null, T(0)), 'p', msgs);
  const back = parseReadState(serializeReadState(state), T(9));
  assert.equal(back.baseline, T(0));
  assert.equal(lastReadAt(back, 'p'), T(4));
  assert.deepEqual(parseReadState('{oops', T(5)), { baseline: T(5), read: {} });
  assert.deepEqual(parseReadState(JSON.stringify({ baseline: 'nope', read: { a: 'bad', b: T(1) } }), T(5)), { baseline: T(5), read: { b: T(1) } });
});

test('unread counts only their messages after the last read time and after my own latest reply', () => {
  assert.equal(unreadCount(msgs, T(0)), 2, 'the message before my reply at T(2) is read');
  assert.equal(unreadCount([{ from: 'them', createdAt: T(1) }, { from: 'them', createdAt: T(2) }], T(0)), 2);
  assert.equal(unreadCount(msgs, T(3)), 1);
  assert.equal(unreadCount(msgs, T(4)), 0);
  assert.equal(unreadCount([{ from: 'them' }], T(0)), 0, 'a message without a time is never counted');
  assert.equal(unreadCount([], T(0)), 0);
  assert.equal(unreadCount(undefined, T(0)), 0);
});

test('markRead moves forward only', () => {
  let state = parseReadState(null, T(0));
  state = markRead(state, 'p', msgs);
  assert.equal(lastReadAt(state, 'p'), T(4));
  state = markRead(state, 'p', [{ from: 'them', createdAt: T(2) }]);
  assert.equal(lastReadAt(state, 'p'), T(4));
  assert.equal(markRead(state, 'q', []).read.q, undefined, 'nothing to read keeps the baseline');
});

test('conversations sort by their last message, newest first; silent ones keep their order at the end', () => {
  const people = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const byId = { a: [{ createdAt: T(1) }], b: [], c: [{ createdAt: T(9) }, { createdAt: T(5) }], d: undefined };
  assert.equal(lastContactAt(byId.c), Date.parse(T(9)));
  assert.equal(lastContactAt([]), 0);
  assert.deepEqual(sortByLastContact(people, (id) => byId[id]).map((p) => p.id), ['c', 'a', 'b', 'd']);
});

test('the badge total adds every conversation\'s unread messages', () => {
  const state = parseReadState(null, T(0));
  const byId = { a: msgs, b: [{ from: 'them', createdAt: T(7) }], c: [{ from: 'me', createdAt: T(8) }] };
  assert.equal(unreadTotal(['a', 'b', 'c'], (id) => byId[id], (id) => lastReadAt(state, id)), 3);
});
