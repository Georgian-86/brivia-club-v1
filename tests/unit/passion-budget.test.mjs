// Passion Budget client helpers (spec §3.2, Review Focus 5, client side). Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUDGET, MAX_INTERESTS, MODES, emptyBudget, addInterest, removeInterest, stepPoints, setMode,
  pointsLeft, isComplete, toPayload, counterText, budgetFromRows,
} from '../../passion-budget.js';

const node = (n) => ({ id: `d.c.i${n}`, label: `Interest ${n}` });
const withItems = (n) => { let s = emptyBudget(); for (let i = 1; i <= n; i += 1) s = addInterest(s, node(i)); return s; };
const total = (s) => s.items.reduce((sum, item) => sum + item.points, 0);

test('constants match the spec', () => {
  assert.equal(BUDGET, 20);
  assert.equal(MAX_INTERESTS, 12);
  assert.deepEqual(MODES, ['learn', 'play', 'teach', 'build']);
});

test('a new interest gets 1 point and the default mode play', () => {
  const s = addInterest(emptyBudget(), node(1));
  assert.deepEqual(s.items, [{ id: 'd.c.i1', label: 'Interest 1', points: 1, mode: 'play' }]);
  assert.equal(pointsLeft(s), 19);
});

test('helpers never mutate their input', () => {
  const s = withItems(2);
  const frozen = JSON.stringify(s);
  addInterest(s, node(3)); removeInterest(s, 'd.c.i1'); stepPoints(s, 'd.c.i1', 1); setMode(s, 'd.c.i1', 'teach');
  assert.equal(JSON.stringify(s), frozen);
});

test('a duplicate interest is refused', () => {
  const s = withItems(1);
  const again = addInterest(s, node(1));
  assert.equal(again.items.length, 1);
  assert.equal(total(again), 1);
});

test('a 13th interest is refused', () => {
  const s = withItems(12);
  assert.equal(s.items.length, 12);
  const more = addInterest(s, node(13));
  assert.equal(more.items.length, 12);
  assert.ok(!more.items.some((item) => item.id === 'd.c.i13'));
});

test('removing an interest refunds its points', () => {
  let s = withItems(2);
  s = stepPoints(s, 'd.c.i1', 5); // 6 + 1
  assert.equal(pointsLeft(s), 13);
  s = removeInterest(s, 'd.c.i1');
  assert.equal(s.items.length, 1);
  assert.equal(pointsLeft(s), 19);
});

test('a stepper never takes the total over 20', () => {
  let s = withItems(2);
  s = stepPoints(s, 'd.c.i1', 100);
  assert.equal(total(s), 20);
  assert.equal(s.items[0].points, 19);
  const same = stepPoints(s, 'd.c.i2', 1);
  assert.equal(total(same), 20);
  assert.equal(same.items[1].points, 1);
});

test('a stepper never takes a single interest below 1', () => {
  let s = withItems(1);
  s = stepPoints(s, 'd.c.i1', -1);
  assert.equal(s.items[0].points, 1);
  s = stepPoints(s, 'd.c.i1', 4);
  s = stepPoints(s, 'd.c.i1', -10);
  assert.equal(s.items[0].points, 1);
});

test('stepping an unknown id changes nothing', () => {
  const s = withItems(1);
  assert.deepEqual(stepPoints(s, 'nope', 1), s);
});

test('with 0 points left, a new interest takes 1 point from the largest one', () => {
  let s = withItems(3);
  s = stepPoints(s, 'd.c.i2', 10); // 1 + 11 + 1 = 13
  s = stepPoints(s, 'd.c.i1', 3);  // 4 + 11 + 1 = 16
  s = stepPoints(s, 'd.c.i3', 4);  // 4 + 11 + 5 = 20
  assert.equal(pointsLeft(s), 0);
  s = addInterest(s, node(4));
  assert.equal(total(s), 20);
  assert.equal(s.items.find((item) => item.id === 'd.c.i2').points, 10);
  assert.equal(s.items.find((item) => item.id === 'd.c.i4').points, 1);
  assert.equal(s.items.find((item) => item.id === 'd.c.i1').points, 4);
});

test('the largest-item tie goes to the first chosen', () => {
  let s = withItems(2);
  s = stepPoints(s, 'd.c.i1', 9);
  s = stepPoints(s, 'd.c.i2', 9); // 10 + 10
  s = addInterest(s, node(3));
  assert.deepEqual(s.items.map((item) => item.points), [9, 10, 1]);
});

test('setMode accepts the four modes and refuses anything else', () => {
  let s = withItems(1);
  for (const mode of MODES) { s = setMode(s, 'd.c.i1', mode); assert.equal(s.items[0].mode, mode); }
  const bad = setMode(s, 'd.c.i1', 'lead');
  assert.equal(bad.items[0].mode, 'build');
});

test('isComplete needs at least 1 interest and exactly 20 points', () => {
  assert.equal(isComplete(emptyBudget()), false);
  let s = withItems(2);
  assert.equal(isComplete(s), false);
  s = stepPoints(s, 'd.c.i1', 17); // 18 + 1 = 19
  assert.equal(isComplete(s), false);
  s = stepPoints(s, 'd.c.i2', 1);
  assert.equal(isComplete(s), true);
  assert.equal(isComplete(stepPoints(withItems(1), 'd.c.i1', 19)), true);
});

test('counterText for 20, 14 and 0 points left', () => {
  assert.equal(counterText(emptyBudget()), '20 of 20 points left');
  let s = withItems(2);
  s = stepPoints(s, 'd.c.i1', 4);
  assert.equal(counterText(s), '14 of 20 points left');
  s = stepPoints(s, 'd.c.i2', 50);
  assert.equal(counterText(s), '0 of 20 points left');
});

test('toPayload maps to the RPC shape and defaults mode to play', () => {
  const s = { items: [
    { id: 'a.b.c', label: 'C', points: 12, mode: 'teach' },
    { id: 'a.b.d', label: 'D', points: 8 },
    { id: 'a.b.e', label: 'E', points: 0, mode: 'nonsense' },
  ] };
  assert.deepEqual(toPayload(s), [
    { interest_id: 'a.b.c', points: 12, mode: 'teach' },
    { interest_id: 'a.b.d', points: 8, mode: 'play' },
    { interest_id: 'a.b.e', points: 0, mode: 'play' },
  ]);
});

test('budgetFromRows rebuilds a state from my_interests rows or a stored pending list', () => {
  const s = budgetFromRows([
    { interest_id: 'a.b.c', label: 'C', points: 12, mode: 'teach' },
    { id: 'a.b.d', label: 'D', points: 8, mode: 'zzz' },
    { interest_id: 'a.b.c', label: 'dup', points: 3, mode: 'play' },
    { label: 'no id', points: 2 },
  ]);
  assert.deepEqual(s.items, [
    { id: 'a.b.c', label: 'C', points: 12, mode: 'teach' },
    { id: 'a.b.d', label: 'D', points: 8, mode: 'play' },
  ]);
  assert.equal(isComplete(s), true);
  assert.deepEqual(budgetFromRows(null).items, []);
});

test('budgetFromRows trims the largest items until the total is at most 20', () => {
  const s = budgetFromRows([
    { id: 'a', label: 'A', points: 15 },
    { id: 'b', label: 'B', points: 9 },
    { id: 'c', label: 'C', points: 1 },
  ]); // 25 -> trim 5 from the largest at each step
  assert.equal(s.items.reduce((sum, item) => sum + item.points, 0), 20);
  assert.ok(s.items.every((item) => item.points >= 1));
  assert.deepEqual(s.items.map((item) => item.points), [10, 9, 1]);
  const huge = budgetFromRows(Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, points: 50 })));
  assert.equal(huge.items.reduce((sum, item) => sum + item.points, 0), 20);
  assert.ok(huge.items.every((item) => item.points >= 1));
  assert.equal(isComplete(huge), true);
});
