// Asset budget checker (Phase B landing speed). Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAssetBudget } from '../../scripts/asset-budget.js';

test('flags an image over 400 KB', () => {
  const r = checkAssetBudget([{ path: 'assets/hero.png', bytes: 409601 }]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.violations, [{ path: 'assets/hero.png', bytes: 409601, limit: 409600 }]);
});

test('flags a video over 5 MB', () => {
  const r = checkAssetBudget([{ path: 'assets/intro.mp4', bytes: 5242881 }]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.violations, [{ path: 'assets/intro.mp4', bytes: 5242881, limit: 5242880 }]);
});

test('ignores js/css/fonts', () => {
  const r = checkAssetBudget([
    { path: 'assets/app.js', bytes: 99999999 },
    { path: 'assets/app.css', bytes: 99999999 },
    { path: 'assets/font.woff2', bytes: 99999999 },
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
});

test('extension match is case-insensitive (.PNG)', () => {
  const r = checkAssetBudget([{ path: 'assets/Big.PNG', bytes: 500000 }, { path: 'assets/Clip.MOV', bytes: 6000000 }]);
  assert.equal(r.violations.length, 2);
});

test('ok is true when nothing exceeds', () => {
  const r = checkAssetBudget([
    { path: 'a.png', bytes: 409600 }, { path: 'b.webm', bytes: 5242880 }, { path: 'c.jpg', bytes: 10 },
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
});
