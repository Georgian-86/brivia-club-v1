// The interim deck's card copy (UX_SPEC §B, Iteration 3 Task 10). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchLine, deckChips, deckEmptyState, deckFields } from '../../deck-view.js';

test('pitchLine: a shared interest is named, lowercased', () => {
  assert.equal(pitchLine({ name: 'Asha', shared: ['Badminton', 'Chess'], tags: ['Running'] }),
    'Hey Asha, I noticed we both care about badminton. Would love to connect and exchange ideas.');
});

test('pitchLine: no shared interest gives the neutral line (tags are not used)', () => {
  assert.equal(pitchLine({ name: 'Dana', shared: [], tags: ['Poetry'] }), "Hey Dana, I'd love to connect and exchange ideas.");
});

test('pitchLine never throws for missing tags, shared or name (A5)', () => {
  assert.equal(pitchLine({}), "Hey there, I'd love to connect and exchange ideas.");
  assert.equal(pitchLine(null), "Hey there, I'd love to connect and exchange ideas.");
  assert.equal(pitchLine({ name: '  ', shared: [null, ''] }), "Hey there, I'd love to connect and exchange ideas.");
  assert.equal(pitchLine({ name: 'Ravi', shared: 'Chess' }), "Hey Ravi, I'd love to connect and exchange ideas.");
});

test('deckChips: up to 2 "You both" chips, then up to 3 profile tags without repeating a shared label', () => {
  const chips = deckChips({ shared: ['Badminton', 'Chess', 'Tennis'], tags: ['badminton', 'Running', 'Poetry', 'Jazz', 'Friends'] });
  assert.deepEqual(chips, [
    { kind: 'shared', label: 'You both: Badminton' },
    { kind: 'shared', label: 'You both: Chess' },
    { kind: 'tag', label: 'Running' },
    { kind: 'tag', label: 'Poetry' },
    { kind: 'tag', label: 'Jazz' },
  ]);
});

test('deckChips: missing arrays give no chips', () => {
  assert.deepEqual(deckChips({}), []);
  assert.deepEqual(deckChips(null), []);
});

test('deckFields: keeps only the band and up to 2 shared labels; never city, state, cell or km', () => {
  const fields = deckFields({ distance_band: '~3 km', shared_interests: ['Badminton', 'Chess', 'Tennis', 7], city: 'Pune', state: 'MH' });
  assert.deepEqual(fields, { distanceBand: '~3 km', shared: ['Badminton', 'Chess'] });
  assert.deepEqual(deckFields({}), { distanceBand: '', shared: [] });
  assert.deepEqual(deckFields({ distance_band: '  ', shared_interests: null }), { distanceBand: '', shared: [] });
});

test('deckEmptyState: every cause has a title, a reason and exactly one action', () => {
  assert.deepEqual(deckEmptyState('filters'), { title: 'No one in this deck matches these filters.', copy: 'Clear them to see everyone in your deck again.', action: 'Clear filters', kind: 'clear-filters' });
  const caught = deckEmptyState('caught_up');
  assert.equal(caught.title, "You're caught up.");
  assert.match(caught.copy, /New people near you show up as they join\./);
  assert.match(caught.copy, /search/i, 'caught_up also covers "members exist but only far away"');
  assert.deepEqual([caught.action, caught.kind], ['Search members', 'search']);
  assert.deepEqual([deckEmptyState('no_members_yet').title, deckEmptyState('no_members_yet').action, deckEmptyState('no_members_yet').kind], ['Your area is just opening.', 'Invite a friend', 'invite']);
  assert.deepEqual([deckEmptyState('complete_profile').title, deckEmptyState('complete_profile').action, deckEmptyState('complete_profile').kind], ['Finish your orbit to see people near you.', 'Finish profile', 'finish-profile']);
  assert.deepEqual([deckEmptyState('error').action, deckEmptyState('error').kind], ['Try again', 'retry']);
  assert.equal(deckEmptyState('something-new').kind, 'search', 'an unknown status falls back to caught_up');
});
