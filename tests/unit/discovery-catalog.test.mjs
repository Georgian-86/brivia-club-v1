// The discovery filter catalog (D-062): every interest a member can filter by, not only the ones on loaded cards.
// Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { POPULAR_INTERESTS, INTEREST_CATALOG, LOOKING_FOR_CATALOG, taxonomyLabels, catalogValues, matchOptions } from '../../discovery-catalog.js';

const has = (list, label) => list.some((value) => value.toLowerCase() === label.toLowerCase());

test('the interest catalog has the everyday options the founder named', () => {
  for (const label of ['Chess', 'Music', 'Guitar', 'Hackathons', 'Badminton', 'Coding', 'Photography', 'Startups', 'Travel']) {
    assert.ok(has(INTEREST_CATALOG, label), `${label} missing`);
  }
  assert.ok(has(LOOKING_FOR_CATALOG, 'Hackathon Buddy'));
  assert.ok(has(LOOKING_FOR_CATALOG, 'Co-founder'));
});

test('popular options are all in the catalog, unique, and a short row', () => {
  assert.ok(POPULAR_INTERESTS.length >= 8 && POPULAR_INTERESTS.length <= 16);
  assert.equal(new Set(POPULAR_INTERESTS.map((v) => v.toLowerCase())).size, POPULAR_INTERESTS.length);
  for (const label of POPULAR_INTERESTS) assert.ok(has(INTEREST_CATALOG, label), `${label} not in catalog`);
});

test('the catalogs hold no duplicates (case-insensitive)', () => {
  for (const list of [INTEREST_CATALOG, LOOKING_FOR_CATALOG]) {
    assert.equal(new Set(list.map((v) => v.trim().toLowerCase())).size, list.length);
  }
});

test('taxonomyLabels keeps selectable, non-sensitive nodes only', () => {
  const nodes = [
    { id: 'music', level: 1, label: 'Music', sensitive: false },
    { id: 'music.instruments', level: 2, label: 'Instruments', sensitive: false },
    { id: 'music.instruments.guitar', level: 3, label: 'Guitar', sensitive: false },
    { id: 'music.instruments.guitar.fingerstyle', level: 4, label: 'Fingerstyle guitar', sensitive: false },
    { id: 'beliefs.faith.x', level: 3, label: 'A private belief', sensitive: true },
    { id: 'bad', level: 3, label: '   ', sensitive: false },
    null,
  ];
  assert.deepEqual(taxonomyLabels(nodes), ['Guitar', 'Fingerstyle guitar']);
  assert.deepEqual(taxonomyLabels(undefined), []);
});

test('catalogValues merges members, the standard list and the taxonomy; a member label wins; sorted', () => {
  const values = catalogValues({ members: ['chess', 'Kabaddi'], standard: ['Chess', 'Music'], taxonomy: ['music', 'Guitar'] });
  assert.deepEqual(values, ['chess', 'Guitar', 'Kabaddi', 'Music']);
});

test('matchOptions: empty query lists everything not selected; a query puts prefix matches first', () => {
  const values = ['Board games', 'Chess', 'Guitar', 'Music', 'Music production', 'Sports music'];
  assert.deepEqual(matchOptions(values, '', new Set(['chess'])), ['Board games', 'Guitar', 'Music', 'Music production', 'Sports music']);
  assert.deepEqual(matchOptions(values, 'mus'), ['Music', 'Music production', 'Sports music']);
  assert.deepEqual(matchOptions(values, '  MUSIC ', new Set(['music'])), ['Music production', 'Sports music']);
  assert.deepEqual(matchOptions(values, 'mus', new Set(), 1), ['Music']);
  assert.deepEqual(matchOptions(values, 'zzz'), []);
});
