// Fixes from the live signup walkthrough (2026-10-08). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchTypedCity } from '../../area-pick.js';
import { budgetGateText, spreadRemaining, addInterest, emptyBudget, isComplete, pointsLeft } from '../../passion-budget.js';
import { dataUrlToFile } from '../../pending-profile.js';

const BLR = { id: 'in-bengaluru', name: 'Bengaluru', region: 'Karnataka' };
const BLG = { id: 'in-belagavi', name: 'Belagavi', region: 'Karnataka' };

test('a typed city that exactly names one listed option is chosen (case and spaces ignored)', () => {
  assert.equal(matchTypedCity('  bengaluru ', [BLG, BLR]), BLR);
  assert.equal(matchTypedCity('Bengaluru, Karnataka', [BLR]), BLR);
});
test('a single listed option is chosen only when its name starts with the typed text', () => {
  assert.equal(matchTypedCity('Beng', [BLR]), BLR);
  assert.equal(matchTypedCity('Karnataka', [BLR]), null);
  assert.equal(matchTypedCity('Bangalore', [BLR]), null);
});
test('no choice when several options match a partial name, or nothing is typed or listed', () => {
  assert.equal(matchTypedCity('Be', [BLG, BLR]), null);
  assert.equal(matchTypedCity('', [BLR]), null);
  assert.equal(matchTypedCity('Pune', []), null);
});

test('the step 3 gate asks for an interest first, then for the points', () => {
  assert.equal(budgetGateText(emptyBudget()), 'Pick at least one interest to continue.');
  const one = addInterest(emptyBudget(), { id: 'a', label: 'A' });
  assert.equal(budgetGateText(one), 'Place all 20 points to continue (19 left).');
});

test('spreadRemaining shares the points left evenly, earlier picks first, and completes the budget', () => {
  let s = addInterest(emptyBudget(), { id: 'a', label: 'A' });
  s = addInterest(s, { id: 'b', label: 'B' });
  s = addInterest(s, { id: 'c', label: 'C' });
  const spread = spreadRemaining(s);
  assert.deepEqual(spread.items.map((i) => i.points), [7, 7, 6]);
  assert.ok(isComplete(spread));
  assert.equal(pointsLeft(spread), 0);
  assert.notEqual(spread, s);
  assert.deepEqual(s.items.map((i) => i.points), [1, 1, 1]);
});
test('spreadRemaining keeps points already placed and leaves a full or empty budget unchanged', () => {
  let s = addInterest(emptyBudget(), { id: 'a', label: 'A' });
  s = addInterest(s, { id: 'b', label: 'B' });
  s = { items: s.items.map((i) => (i.id === 'a' ? { ...i, points: 10 } : i)) };
  assert.deepEqual(spreadRemaining(s).items.map((i) => i.points), [15, 5]);
  const empty = emptyBudget();
  assert.equal(spreadRemaining(empty), empty);
  const full = spreadRemaining(s);
  assert.equal(spreadRemaining(full), full);
});

test('dataUrlToFile turns a stored image preview back into an uploadable File', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const file = dataUrlToFile(png, 'me.png');
  assert.ok(file instanceof File);
  assert.equal(file.type, 'image/png');
  assert.equal(file.name, 'me.png');
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.deepEqual([...bytes.slice(1, 4)], [80, 78, 71]);
});
test('dataUrlToFile refuses anything that is not a base64 image data URL', () => {
  assert.equal(dataUrlToFile('https://example.com/a.png'), null);
  assert.equal(dataUrlToFile('data:text/html;base64,PGgxPg=='), null);
  assert.equal(dataUrlToFile('data:image/png;base64,***'), null);
  assert.equal(dataUrlToFile(null), null);
});
