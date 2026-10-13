// "Why this person?" (Phase D, Task 3): the tester-only panel's markup from one rpc/deck_why row. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { whyPanelMarkup, whyRow } from '../../why-panel.js';

const row = {
  shared_interests: ['Badminton', 'Chess'],
  distance_band: '~3 km',
  rank_keys: { has_shared: true, shared_count: 2, ring: 0, overlap_level: 3, tie_break: 'daily' },
};

test('whyPanelMarkup shows "You both: …" with the shared interests', () => {
  assert.match(whyPanelMarkup(row), /<p class="why-shared">You both: Badminton, Chess<\/p>/);
});

test('whyPanelMarkup shows the band label only', () => {
  const html = whyPanelMarkup(row);
  assert.match(html, /<p class="why-band">Distance: ~3 km<\/p>/);
  const place = whyPanelMarkup({ ...row, distance_band: 'Bengaluru', rank_keys: { ...row.rank_keys, ring: 2 } });
  assert.match(place, /Distance: Bengaluru/);
  // no km figure other than the band's own, whatever the ring
  assert.doesNotMatch(place.replace('Distance: Bengaluru', ''), /\d+\s*km/);
  assert.doesNotMatch(html.replace('Distance: ~3 km', ''), /\d+\s*km/);
});

test('whyPanelMarkup lists the rank keys as a small definition list with plain labels, in deck order', () => {
  const html = whyPanelMarkup(row);
  assert.match(html, /<dl class="why-keys">/);
  const pairs = [...html.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(pairs, [
    ['Shares an interest', 'Yes, 2 in common'],
    ['Distance tier', 'Closest'],
    ['Interest overlap', 'High'],
    ['Tie-break', 'Daily rotation'],
  ]);
  const other = whyPanelMarkup({ shared_interests: [], distance_band: 'Pune', rank_keys: { has_shared: false, shared_count: 0, ring: 1, overlap_level: 0, tie_break: 'daily' } });
  const otherPairs = [...other.matchAll(/<dt>([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map((m) => m[2]);
  assert.deepEqual(otherPairs, ['No', 'Near', 'None', 'Daily rotation']);
  assert.match(other, /<p class="why-shared">No shared interests yet\.<\/p>/);
  const mid = whyPanelMarkup({ ...row, rank_keys: { ...row.rank_keys, ring: 2, overlap_level: 2 } });
  assert.match(mid, /<dt>Distance tier<\/dt><dd>Same area<\/dd>/);
  assert.match(mid, /<dt>Interest overlap<\/dt><dd>Medium<\/dd>/);
  assert.match(whyPanelMarkup({ ...row, rank_keys: { ...row.rank_keys, overlap_level: 1 } }), /<dd>Low<\/dd>/);
});

test('whyPanelMarkup escapes every value', () => {
  const evil = '<img src=x onerror=alert(1)>&"\'';
  const html = whyPanelMarkup({ shared_interests: [evil], distance_band: evil, rank_keys: { has_shared: true, shared_count: '<b>', ring: '<i>', overlap_level: evil, tie_break: evil } });
  assert.doesNotMatch(html, /<img|<b>|<i>|onerror=alert\(1\)>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;&amp;&quot;&#39;/);
});

test('whyPanelMarkup never throws on missing or malformed fields', () => {
  for (const bad of [null, undefined, {}, { shared_interests: 'Chess', distance_band: 3, rank_keys: 'x' }, { rank_keys: null }]) {
    const html = whyPanelMarkup(bad);
    assert.equal(typeof html, 'string');
    assert.match(html, /No shared interests yet\./);
    assert.doesNotMatch(html, /why-band/);
  }
  const unknown = whyPanelMarkup({ ...row, rank_keys: { ring: 7, overlap_level: -1 } });
  assert.match(unknown, /<dt>Distance tier<\/dt><dd>Not known<\/dd>/);
  assert.match(unknown, /<dt>Interest overlap<\/dt><dd>Not known<\/dd>/);
});

test('whyRow picks the first row of an rpc answer, or null', () => {
  assert.equal(whyRow([]), null);
  assert.equal(whyRow(null), null);
  assert.equal(whyRow({}), null);
  assert.equal(whyRow([null]), null);
  assert.deepEqual(whyRow([row, { ...row, distance_band: 'x' }]), row);
  assert.deepEqual(whyRow(row), row);   // a single-object answer
});
