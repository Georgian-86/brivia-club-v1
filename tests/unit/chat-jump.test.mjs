// D-277: the jump-to-latest button's count of messages that arrived while the member was scrolled up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextUnread, badgeText, distanceFromBottom } from '../../site/scripts/chat-jump.js';

test('chat jump: a new chat starts at zero; messages that arrive while scrolled up are counted; at the bottom it clears', () => {
  let s = nextUnread({ chatId: 'a', theirCount: 5, nearBottom: false }, { chatId: null, seen: 0, unread: 0 });
  assert.deepEqual(s, { chatId: 'a', seen: 5, unread: 0 });              // the old messages are not "new"
  s = nextUnread({ chatId: 'a', theirCount: 7, nearBottom: false }, s);
  assert.equal(s.unread, 2);
  s = nextUnread({ chatId: 'a', theirCount: 7, nearBottom: false }, s);  // a redraw with nothing new keeps the count
  assert.equal(s.unread, 2);
  s = nextUnread({ chatId: 'a', theirCount: 6, nearBottom: false }, s);  // an unsent message never makes it negative
  assert.equal(s.unread, 2);
  assert.equal(nextUnread({ chatId: 'a', theirCount: 8, nearBottom: true }, s).unread, 0);
  assert.equal(nextUnread({ chatId: 'b', theirCount: 3, nearBottom: false }, s).unread, 0);  // another chat starts fresh
});

test('chat jump: badge text and distance', () => {
  assert.equal(badgeText(4), '4');
  assert.equal(badgeText(120), '99+');
  assert.equal(distanceFromBottom({ scrollHeight: 1000, scrollTop: 300, clientHeight: 400 }), 300);
  assert.equal(distanceFromBottom({ scrollHeight: 1000, scrollTop: 700, clientHeight: 400 }), 0);
});
