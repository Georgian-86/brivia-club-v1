import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RADIUS, DEFAULT_LOCATION, normalizeLocation, isDefaultLocation, locationParams, radiusLabel, locationSummary, fallbackSummary } from '../../site/scripts/discovery-location.js';

test('the default is near me, 50 km, not anywhere, and it leaves the deck alone', () => {
  assert.deepEqual(normalizeLocation(null), { ...DEFAULT_LOCATION });
  assert.equal(isDefaultLocation(null), true);
  assert.equal(isDefaultLocation({ radiusKm: 75 }), false);
  assert.equal(isDefaultLocation({ anywhere: true }), false);
});

test('the radius snaps to 25 km steps between 25 and 500', () => {
  assert.deepEqual([10, 37, 38, 260, 900, 'x'].map((km) => normalizeLocation({ radiusKm: km }).radiusKm), [25, 25, 50, 250, 500, RADIUS.fallback]);
  assert.equal(radiusLabel(240), '250 km');
});

test('Custom needs a city; without one it is near me', () => {
  assert.equal(normalizeLocation({ mode: 'custom' }).mode, 'near');
  assert.deepEqual(normalizeLocation({ mode: 'custom', place: { id: 'in-delhi', name: 'Delhi', lat: 1 } }).place, { id: 'in-delhi', name: 'Delhi' });
  assert.equal(normalizeLocation({ mode: 'near', place: { id: 'in-delhi', name: 'Delhi' } }).place, null);
});

test('locationParams: anywhere has no radius; a custom city is the centre', () => {
  assert.deepEqual(locationParams({ radiusKm: 200 }), { p_radius_km: 200, p_place_id: null });
  assert.deepEqual(locationParams({ anywhere: true, radiusKm: 200 }), { p_radius_km: null, p_place_id: null });
  assert.deepEqual(locationParams({ mode: 'custom', place: { id: 'in-delhi', name: 'Delhi' }, radiusKm: 100 }), { p_radius_km: 100, p_place_id: 'in-delhi' });
  assert.deepEqual(locationParams({ anywhere: true, mode: 'custom', place: { id: 'in-delhi', name: 'Delhi' } }), { p_radius_km: null, p_place_id: 'in-delhi' });
});

test('summaries', () => {
  assert.equal(locationSummary({ anywhere: true }), 'Showing people from anywhere');
  assert.equal(locationSummary({ radiusKm: 200 }, 'Bengaluru'), 'Within 200 km of Bengaluru');
  assert.equal(locationSummary({ radiusKm: 75 }), 'Within 75 km of you');
  assert.equal(locationSummary({ mode: 'custom', place: { id: 'in-delhi', name: 'Delhi' }, radiusKm: 100 }, 'Bengaluru'), 'Within 100 km of Delhi');
  assert.equal(fallbackSummary(['Chess']), 'No one nearby with Chess. Showing people from everywhere, nearest first.');
  assert.equal(fallbackSummary(['A', 'B', 'C', 'D', 'E']), 'No one nearby with A, B, C and 2 more. Showing people from everywhere, nearest first.');
});
