// "Make the first move." (D-124): the composer's pure helpers. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { openerSuggestions, composerCount, suggestionsMarkup, NOTE_MAX } from '../../site/scripts/connect-composer.js';
import { reviewCardMarkup } from '../../site/scripts/collab-requests.js';

test('openers: the event first, then a shared interest, then a general line; three at most, first names only', () => {
  const s = openerSuggestions({ name: 'Aanya Rao', shared: ['Chess'], eventTitle: 'Blitz Chess Meetup' });
  assert.equal(s.length, 3);
  assert.match(s[0], /^Hi Aanya! I'm going to Blitz Chess Meetup too/);
  assert.match(s[1], /we both love chess/);
  const plain = openerSuggestions({ name: '' });
  assert.ok(plain.length >= 2 && plain.every((x) => x.startsWith('Hi there')));
});

test('counter: n / 500, near the limit from 90%', () => {
  assert.equal(NOTE_MAX, 500);
  assert.deepEqual(composerCount(12), { text: '12 / 500', nearLimit: false });
  assert.equal(composerCount(450).nearLimit, true);
});

test('suggestion pills are escaped buttons', () => {
  const html = suggestionsMarkup(['<b>hi</b>']);
  assert.match(html, /<button type="button" class="composer-suggestion" data-composer-suggestion="0">&lt;b&gt;hi&lt;\/b&gt;<\/button>/);
});

test('the request card shows their message first; answered by dragging, no buttons (D-132)', () => {
  const html = reviewCardMarkup({ fromId: 'f', name: 'Ravi', role: 'Product & AI', band: '~3 km', shared: ['Chess'], note: 'Hi! Going to the chess meetup?' },
    { index: 0, total: 1 }, { escapeHtml: (v) => String(v), renderAvatar: () => '<span></span>' });
  assert.ok(html.indexOf('Their message') < html.indexOf('You both care about'));
  assert.match(html, /Hi! Going to the chess meetup\?/);
  assert.doesNotMatch(html, /<button/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /aria-keyshortcuts="ArrowRight ArrowLeft"/);
  const none = reviewCardMarkup({ fromId: 'f', name: 'Ravi', shared: [], note: '' }, { index: 0, total: 1 }, { escapeHtml: (v) => String(v), renderAvatar: () => '' });
  assert.match(none, /No message, just a hello\./);
});

// D-154: one opener at a time.
import { nextSuggestion } from '../../site/scripts/connect-composer.js';
test('nextSuggestion: the next opener, round the list; anything typed starts from the first', () => {
  const list = ['a', 'b', 'c'];
  assert.equal(nextSuggestion(list, 'a'), 'b');
  assert.equal(nextSuggestion(list, 'c'), 'a');
  assert.equal(nextSuggestion(list, 'my own words'), 'a');
  assert.equal(nextSuggestion([], 'x'), '');
});
