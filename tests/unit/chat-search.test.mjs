// D-152: Chat search helpers. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanQuery, matchesQuery, normalizePerson, peopleResults, localPeople, STATUS } from '../../site/scripts/chat-search.js';

test('cleanQuery trims, folds spaces, caps at 80', () => {
  assert.equal(cleanQuery('  yas   rao '), 'yas rao');
  assert.equal(cleanQuery(null), '');
  assert.equal(cleanQuery('x'.repeat(100)).length, 80);
});

test('matchesQuery: name words from their start, other text anywhere, every word', () => {
  assert.equal(matchesQuery({ name: 'Yashika Rao' }, 'yas'), true);
  assert.equal(matchesQuery({ name: 'Yashika Rao' }, 'rao'), true);
  assert.equal(matchesQuery({ name: 'Yashika Rao' }, 'yashika r'), true);
  assert.equal(matchesQuery({ name: 'Yashika Rao' }, 'ashika'), false);
  assert.equal(matchesQuery({ name: 'Meera', text: 'Designer at Zeta Labs' }, 'zeta'), true);
  assert.equal(matchesQuery({ name: 'Meera', text: '' }, 'meera zeta'), false);
  assert.equal(matchesQuery({ name: 'Any' }, '   '), true);
});

test('normalizePerson: shape and unknown status', () => {
  const p = normalizePerson({ member_id: 'a', name: ' Asha ', photo_url: 'u', job_title: 'PM', company_name: 'Acme', bio_preview: 'Hi', status: 'weird', has_conversation: 1 });
  assert.deepEqual(p, { id: 'a', name: 'Asha', photoUrl: 'u', title: 'PM', company: 'Acme', logoPath: '', bio: 'Hi', status: 'none', hasConversation: true, lastMessageAt: null });
  assert.equal(normalizePerson({ member_id: 'b' }).name, 'Brivia member');
  assert.equal(STATUS.connected.action, 'Message');
});

test('peopleResults: drops conversations already shown and duplicates', () => {
  const rows = [{ member_id: 'a', status: 'connected' }, { member_id: 'b', status: 'none' }, { member_id: 'a', status: 'connected' }, { member_id: '' }];
  assert.deepEqual(peopleResults(rows, ['b']).map((p) => p.id), ['a']);
});

test('localPeople: connections this device knows, by name', () => {
  const people = [{ id: '1', name: 'Yashika Rao', image: 'p' }, { id: '2', name: 'Yash T' }];
  assert.deepEqual(localPeople(people, ['1'], 'yas').map((r) => r.member_id), ['1']);
  assert.equal(localPeople(people, ['1'], 'yas')[0].status, 'connected');
});
