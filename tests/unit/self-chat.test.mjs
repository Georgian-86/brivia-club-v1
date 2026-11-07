// D-224: "You · Message yourself". Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { selfChatPerson, isSelfChat, selfChatMatches, SELF_CHAT_LABEL } from '../../site/scripts/self-chat.js';

test('selfChatPerson: your own card, named "(You)", flagged isSelf', () => {
  const p = selfChatPerson({ id: 'u1', name: 'Radhika Sharma', photoUrl: 'https://x/p.jpg' });
  assert.equal(p.id, 'u1');
  assert.equal(p.name, 'Radhika Sharma (You)');
  assert.equal(p.fullName, 'Radhika Sharma');
  assert.equal(p.image, 'https://x/p.jpg');
  assert.equal(p.role, SELF_CHAT_LABEL);
  assert.equal(p.isSelf, true);
  assert.equal(selfChatPerson({ id: 'u2' }).name, 'You');
  assert.equal(selfChatPerson({ id: 'u3', name: 'A', photo: 'p.png' }).image, 'p.png');
});

test('isSelfChat: by id, as strings', () => {
  assert.equal(isSelfChat({ id: 7 }, '7'), true);
  assert.equal(isSelfChat({ id: 'a' }, 'b'), false);
  assert.equal(isSelfChat(null, 'a'), false);
  assert.equal(isSelfChat({ id: 'a' }, ''), false);
});

test('selfChatMatches: your own name, "you", "me", "notes"; not other names', () => {
  const me = { name: 'Radhika Sharma' };
  for (const q of ['', 'radh', 'RADHIKA', 'sharma', 'radhika sh', 'you', 'yo', 'me', 'myself', 'notes', 'message yourself']) {
    assert.equal(selfChatMatches(q, me), true, q);
  }
  for (const q of ['priya', 'adh', 'xyz', 'radhikas', 'y', 'saanvi']) assert.equal(selfChatMatches(q, me), false, q);
  assert.equal(selfChatMatches('radh', {}), false);
});
