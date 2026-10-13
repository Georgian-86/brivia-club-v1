// Phase E Task 4: the shared interest catalogue (interest-catalog.js). Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInterestCatalog, searchCatalog, normalizeSearch } from '../../interest-catalog.js';

const nodes = [
  { id: 'sports', parent_id: null, level: 1, label: 'Sports and fitness', sensitive: false },
  { id: 'sports.racket', parent_id: 'sports', level: 2, label: 'Racket sports', sensitive: false },
  { id: 'sports.racket.tennis', parent_id: 'sports.racket', level: 3, label: 'Tennis', sensitive: false },
  { id: 'games', parent_id: null, level: 1, label: 'Games and puzzles', sensitive: false },
  { id: 'games.board', parent_id: 'games', level: 2, label: 'Board games', sensitive: false },
  { id: 'games.board.chess', parent_id: 'games.board', level: 3, label: 'Chess', sensitive: false },
  { id: 'games.board.chess.blitz', parent_id: 'games.board.chess', level: 4, label: 'Blitz chess', sensitive: false },
  { id: 'wellbeing', parent_id: null, level: 1, label: 'Wellbeing', sensitive: false },
  { id: 'wellbeing.spirituality', parent_id: 'wellbeing', level: 2, label: 'Spirituality', sensitive: false },
  { id: 'wellbeing.spirituality.scripture_study', parent_id: 'wellbeing.spirituality', level: 3, label: 'Scripture study', sensitive: true },
];

test('groups by category with domains, private items included when unlocked', () => {
  const cat = buildInterestCatalog(nodes);
  assert.deepEqual(cat.domains, [{ id: 'sports', label: 'Sports and fitness' }, { id: 'games', label: 'Games and puzzles' }, { id: 'wellbeing', label: 'Wellbeing' }]);
  assert.deepEqual(cat.groups.map((g) => [g.id, g.domainId, g.items.map((i) => i.label)]), [
    ['sports.racket', 'sports', ['Tennis']],
    ['games.board', 'games', ['Chess', 'Blitz chess']],
    ['wellbeing.spirituality', 'wellbeing', ['Scripture study']],
  ]);
  assert.equal(cat.groups[2].items[0].sensitive, true);
  assert.deepEqual(cat.hidden, []);
});

test('locked: private items are hidden and their empty group and domain drop out', () => {
  const cat = buildInterestCatalog(nodes, { unlocked: false });
  assert.deepEqual(cat.hidden.map((i) => i.id), ['wellbeing.spirituality.scripture_study']);
  assert.deepEqual(cat.domains.map((d) => d.id), ['sports', 'games']);
});

test('search matches the label, its parent and its category, accent-insensitive', () => {
  const cat = buildInterestCatalog(nodes);
  assert.deepEqual(searchCatalog(cat, 'chess').flatMap((g) => g.items.map((i) => i.label)), ['Chess', 'Blitz chess']);
  assert.deepEqual(searchCatalog(cat, 'RACKET').flatMap((g) => g.items.map((i) => i.label)), ['Tennis']);
  assert.deepEqual(searchCatalog(cat, ''), []);
  assert.equal(normalizeSearch(' Café '), 'cafe');
  assert.equal(searchCatalog(cat, 'chess', 1).flatMap((g) => g.items).length, 1);
});
