// "See who wants to collaborate with you" (D-108): the notification section summary and the review card. Pure helpers.
// Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { collabSummary, reviewCardModel, reviewCardMarkup, keyDecision } from '../../site/scripts/collab-requests.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const renderAvatar = (person, cls = 'mini-avatar') => `<div class="${cls}">${escapeHtml((person?.name || '?')[0])}</div>`;
const req = (n, person = { id: `p${n}`, name: `Person ${n}` }) => ({ fromId: `p${n}`, note: '', createdAt: '2026-10-29T10:00:00Z', person });

test('collabSummary: nothing, one, many (avatars capped at 3)', () => {
  assert.equal(collabSummary([]), null);
  assert.deepEqual(collabSummary([req(1)]).text, '1 person wants to connect');
  const many = collabSummary([req(1), req(2), req(3), req(4)]);
  assert.equal(many.text, '4 people want to connect');
  assert.deepEqual(many.avatars.map((p) => p.name), ['Person 1', 'Person 2', 'Person 3']);
});

test('reviewCardModel: a sender whose profile did not load still gets a full card', () => {
  const m = reviewCardModel({ fromId: 'x', note: 'Hi', person: null }, ['Chess']);
  assert.equal(m.name, 'A Brivia member');
  assert.equal(m.role, '');
  assert.equal(m.band, '');
  assert.deepEqual(m.shared, []);
  assert.equal(m.note, 'Hi');
  assert.equal(m.initials, 'AB');
});

test('reviewCardModel: shared interests come from the server, else a case-insensitive overlap, capped at 3', () => {
  const server = reviewCardModel(req(1, { name: 'Asha Band', role: 'Designer', distanceBand: '~3 km', shared: ['Chess', 'Running'] }), []);
  assert.deepEqual(server.shared, ['Chess', 'Running']);
  assert.equal(server.role, 'Designer');
  assert.equal(server.band, '~3 km');
  const overlap = reviewCardModel(req(1, { name: 'Asha', tags: ['chess', 'Python', 'Running', 'Yoga', 'Golf'] }), ['Chess', 'python', 'running', 'yoga']);
  assert.deepEqual(overlap.shared, ['chess', 'Python', 'Running']);
});

test('reviewCardMarkup escapes, shows the counter and the note, and never uses dating words', () => {
  const m = reviewCardModel({ fromId: 'p', note: 'Let’s <b>build</b> a chess club', person: { name: 'Asha <i>B</i>', role: 'Designer', distanceBand: '~3 km', shared: ['Chess'] } }, []);
  const html = reviewCardMarkup(m, { index: 0, total: 3 }, { escapeHtml, renderAvatar });
  assert.doesNotMatch(html, /<b>build<\/b>|<i>B<\/i>/);
  assert.match(html, /1 of 3/);
  assert.match(html, /Their note/);
  assert.match(html, /Connect/);
  assert.match(html, /Not now/);
  assert.match(html, /NOT NOW/);
  assert.match(html, /CONNECT/);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /\b(match|like|pass|swipe|crush|heart)/i);
  const quiet = reviewCardMarkup(reviewCardModel({ fromId: 'p', note: '', person: null }, []), { index: 1, total: 2 }, { escapeHtml, renderAvatar });
  assert.doesNotMatch(quiet, /Their note/);
  assert.match(quiet, /2 of 2/);
});

test('reviewCardMarkup: swipe only, no Connect / Not now pills; a focusable card, a cue, dots and keyboard-only keys', () => {
  const m = reviewCardModel(req(1, { name: 'Asha' }), []);
  const html = reviewCardMarkup(m, { index: 1, total: 4 }, { escapeHtml, renderAvatar });
  assert.doesNotMatch(html, /collab-button|collab-actions/, 'no visible pill buttons');
  assert.match(html, /<article class="collab-card"[^>]*tabindex="0"[^>]*aria-describedby="collab-review-keys"/);
  assert.match(html, /class="collab-cue" aria-hidden="true"/);
  assert.equal((html.match(/data-collab-decide=/g) || []).length, 2, 'the two keyboard keys');
  assert.match(html, /class="collab-keys"/);
  const dots = html.match(/<ol class="collab-dots" aria-hidden="true">(.*?)<\/ol>/)[1];
  assert.equal((dots.match(/<li/g) || []).length, 4);
  assert.match(dots, /^<li class="is-done"><\/li><li class="is-current"><\/li><li><\/li><li><\/li>$/);
  assert.doesNotMatch(reviewCardMarkup(m, { index: 0, total: 1 }, { escapeHtml, renderAvatar }), /collab-dots/, 'no dots for one request');
  assert.doesNotMatch(reviewCardMarkup(m, { index: 0, total: 12 }, { escapeHtml, renderAvatar }), /collab-dots/, 'no dots past eight');
});

test('keyDecision: arrows decide, everything else does not', () => {
  assert.equal(keyDecision('ArrowRight'), true);
  assert.equal(keyDecision('ArrowLeft'), false);
  assert.equal(keyDecision('Enter'), null);
});
