import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSelfId, selfChatPerson, selfMatchesQuery, SELF_STATUS, SELF_ROLE } from '../../site/scripts/chat-self.js';

const me = { id: 'u-1', name: 'Yashika', full_name: 'Yashika Bansal', photoUrl: 'https://x.supabase.co/storage/v1/object/public/avatars/u-1/p.webp' };

test('isSelfId compares ids as strings and is false without a member id', () => {
  assert.equal(isSelfId('u-1', 'u-1'), true);
  assert.equal(isSelfId(1, '1'), true);
  assert.equal(isSelfId('u-2', 'u-1'), false);
  assert.equal(isSelfId('', ''), false);
  assert.equal(isSelfId(undefined, undefined), false);
  assert.equal(isSelfId('u-1', ''), false);
});

test('selfChatPerson is the member as a chat partner, marked as self, never with contact details', () => {
  const p = selfChatPerson({ ...me, email: 'a@b.c', phone: '99' });
  assert.equal(p.id, 'u-1');
  assert.equal(p.isSelf, true);
  assert.equal(p.name, 'Yashika (You)');
  assert.equal(p.avatarName, 'Yashika');
  assert.equal(p.image, me.photoUrl);
  assert.equal(p.role, SELF_ROLE);
  assert.deepEqual(p.tags, []);
  assert.equal('email' in p, false);
  assert.equal('phone' in p, false);
});

test('selfChatPerson falls back to full name, then a plain "You"', () => {
  assert.equal(selfChatPerson({ id: 'a', full_name: 'Ria Sen' }).name, 'Ria Sen (You)');
  assert.equal(selfChatPerson({ id: 'a', name: '  ' }).name, 'You');
  assert.equal(selfChatPerson({ id: 'a', name: '  ' }).avatarName, 'You');
  assert.equal(selfChatPerson({ id: 'a', image: 'i.webp' }).image, 'i.webp');
});

test('selfMatchesQuery finds the member by the start of any name word', () => {
  assert.equal(selfMatchesQuery(me, 'yashika'), true);
  assert.equal(selfMatchesQuery(me, 'Yas'), true);
  assert.equal(selfMatchesQuery(me, 'bansal'), true);
  assert.equal(selfMatchesQuery(me, 'yashika bansal'), true);
  assert.equal(selfMatchesQuery(me, '  YASHIKA  '), true);
  assert.equal(selfMatchesQuery(me, 'ika'), false);
  assert.equal(selfMatchesQuery(me, 'karthik'), false);
  assert.equal(selfMatchesQuery(me, 'yashika karthik'), false);
});

test('selfMatchesQuery also answers to you, me, myself and self', () => {
  for (const q of ['you', 'Me', 'myself', 'self', 'message myself', 'note to self']) assert.equal(selfMatchesQuery(me, q), true, q);
  assert.equal(selfMatchesQuery(me, 'yo'), false);
  assert.equal(selfMatchesQuery(me, 'mentor'), false);
});

test('selfMatchesQuery is false for an empty query or a member without an id', () => {
  assert.equal(selfMatchesQuery(me, ''), false);
  assert.equal(selfMatchesQuery(me, '   '), false);
  assert.equal(selfMatchesQuery({ name: 'Yashika' }, 'yashika'), false);
});

test('SELF_STATUS is the header line', () => {
  assert.equal(SELF_STATUS, 'Message yourself');
});
