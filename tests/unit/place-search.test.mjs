// D-202: when the city search also asks OpenStreetMap (a place the directory does not have yet, like "South Goa").
import test from 'node:test';
import assert from 'node:assert/strict';
import { needsWiderSearch, foldName } from '../../site/scripts/place-search.js';

test('looks further only when nothing in the directory starts with the typed name', () => {
  assert.equal(needsWiderSearch('South Goa', [{ name: 'Goa Velha' }, { name: 'North Goa' }]), true);
  assert.equal(needsWiderSearch('South Goa, India', []), true, 'the part before the comma is the name');
  assert.equal(needsWiderSearch('Bangal', [{ name: 'Bangalore' }]), false);
  assert.equal(needsWiderSearch('panaji', [{ name: 'Panaji' }]), false, 'case does not matter');
  assert.equal(needsWiderSearch('Sao Paulo', [{ name: 'São Paulo' }]), false, 'accents do not matter');
  assert.equal(needsWiderSearch('Go', []), false, 'two letters: the directory alone');
  assert.equal(needsWiderSearch('560001', []), false, 'a postal code has its own lookup');
  assert.equal(foldName('  Vasco-da-Gama '), 'vasco da gama');
});
