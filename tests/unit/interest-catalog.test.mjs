// The founder's A-Z interest catalogue in the pickers, and "Other" (D-109). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogGroups, normalizeInterestLabel, hasCatalog } from '../../site/scripts/signup-flow.js';

const node = (id, label, catalog_order, extra = {}) => ({ id, label, level: 3, sensitive: false, catalog_order, ...extra });

test('catalogGroups: catalogue nodes only, in catalogue order, under their first letter', () => {
  const groups = catalogGroups([
    node('b.x.badminton', 'Badminton', 3),
    node('a.x.abstract', 'Abstract Art', 1),
    node('a.x.accounting', 'Accounting', 2),
    node('z.x.zumba', 'Zumba', 5),
    node('o.x.old', 'Old interest', null),
    node('s.x.secret', 'Secret', 4, { sensitive: true }),
    node('c.x', 'Category', 6, { level: 2 }),
  ]);
  assert.deepEqual(groups.map((g) => g.label), ['A', 'B', 'Z']);
  assert.deepEqual(groups[0].items.map((n) => n.label), ['Abstract Art', 'Accounting']);
  assert.equal(groups.flatMap((g) => g.items).some((n) => /Old|Secret|Category/.test(n.label)), false);
});

test('catalogGroups: accents fold to their letter; anything else goes under "#", last', () => {
  const groups = catalogGroups([node('x.1', '3D Printing', 1), node('x.2', 'Éclair Baking', 2), node('x.3', 'Yoga', 3)]);
  assert.deepEqual(groups.map((g) => g.label), ['E', 'Y', '#']);
  assert.deepEqual(groups[2].items.map((n) => n.label), ['3D Printing']);
});

test('hasCatalog: true only when some node carries catalog_order', () => {
  assert.equal(hasCatalog([node('a', 'A', null)]), false);
  assert.equal(hasCatalog([node('a', 'A', 1)]), true);
  assert.equal(hasCatalog(null), false);
});

test('normalizeInterestLabel: trims and collapses spaces; 2-40 characters; letters in any script', () => {
  assert.equal(normalizeInterestLabel('  Kite   Surfing  Club '), 'Kite Surfing Club');
  assert.equal(normalizeInterestLabel('मधुबनी कला'), 'मधुबनी कला');
  assert.equal(normalizeInterestLabel("Rock 'n' Roll / Blues & Jazz+"), "Rock 'n' Roll / Blues & Jazz+");
  assert.equal(normalizeInterestLabel('a'), '');
  assert.equal(normalizeInterestLabel('x'.repeat(41)), '');
  assert.equal(normalizeInterestLabel('x'.repeat(40)), 'x'.repeat(40));
});

test('normalizeInterestLabel: symbols, emoji, links and digits-only are refused', () => {
  for (const bad of ['<script>', 'buy now!!', '🎸 Guitar', 'www.spam.com', 'site.com', '12345', 'a_b', 'C:\\x']) {
    assert.equal(normalizeInterestLabel(bad), '', bad);
  }
});
