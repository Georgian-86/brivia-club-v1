// Change your area from Edit profile (D-092). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { areaChangeMessage, AREA_CHANGED, AREA_LIMIT, AREA_FAILED, AREA_HELPER } from '../../site/scripts/area-change.js';

test('areaChangeMessage: success names the new area', () => {
  assert.equal(areaChangeMessage({ data: 'Thane' }), AREA_CHANGED('Thane'));
  assert.equal(AREA_CHANGED('Thane'), 'Your area is now Thane.');
});

test('areaChangeMessage: the 3-a-day cap (HTTP 429 / PT429) says when to try again', () => {
  assert.equal(areaChangeMessage({ error: { code: 'PT429', message: 'try again later' }, status: 429 }), AREA_LIMIT);
  assert.equal(areaChangeMessage({ error: { message: 'x' }, status: 429 }), AREA_LIMIT);
  assert.match(AREA_LIMIT, /3 times/);
});

test('areaChangeMessage: any other failure is a plain retry line, never a raw error', () => {
  assert.equal(areaChangeMessage({ error: { code: '22023', message: 'invalid place' }, status: 400 }), AREA_FAILED);
  assert.equal(areaChangeMessage({ error: new Error('network') }), AREA_FAILED);
  assert.equal(areaChangeMessage({ data: null }), AREA_FAILED);
});

test('AREA_HELPER: honest about what other members see', () => {
  assert.match(AREA_HELPER, /never your exact location/);
  assert.doesNotMatch(AREA_HELPER, /coming soon/i);
});
