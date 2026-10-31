// Pitch threads (D-112): a pitch shows in Chat as a message request. Pure model and markup. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchThreadModel, pitchRowsFromRpc, pitchThreadMarkup, PITCH_COPY } from '../../site/scripts/pitch-chat.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const row = (o = {}) => ({ otherId: 'u1', direction: 'in', note: 'Fancy a chess club?', createdAt: '2026-10-30T10:00:00Z', chatOpen: false, ...o });
const person = { id: 'u1', name: 'Asha Band' };
const DATING = /\b(date|dating|match|swipe|crush|flirt|single|romance|romantic|love)\b/i;

test('pitchThreadModel: the three states', () => {
  assert.equal(pitchThreadModel(row(), person).state, 'request');
  assert.equal(pitchThreadModel(row({ direction: 'out' }), person).state, 'waiting');
  assert.equal(pitchThreadModel(row({ chatOpen: true }), person).state, 'open');
  assert.equal(pitchThreadModel(row({ direction: 'out', chatOpen: true }), person).state, 'open');
  const m = pitchThreadModel(row(), person);
  assert.deepEqual([m.otherId, m.direction, m.note, m.chatOpen, m.name], ['u1', 'in', 'Fancy a chess club?', false, 'Asha Band']);
});

test('pitchThreadModel: null person falls back to "A Brivia member"', () => {
  assert.equal(pitchThreadModel(row(), null).name, 'A Brivia member');
  assert.equal(pitchThreadModel(row(), { name: '  ' }).name, 'A Brivia member');
});

test('pitchRowsFromRpc: maps snake_case, drops rows without other_id or a blank note', () => {
  const rows = pitchRowsFromRpc([
    { other_id: 'a', direction: 'in', note: ' Hi ', created_at: 't', chat_open: true },
    { other_id: null, direction: 'in', note: 'x', created_at: 't', chat_open: false },
    { other_id: 'b', direction: 'in', note: '   ', created_at: 't', chat_open: false },
    { other_id: 'c', direction: 'out', created_at: 't', chat_open: false },
  ]);
  assert.deepEqual(rows, [{ otherId: 'a', direction: 'in', note: 'Hi', createdAt: 't', chatOpen: true }]);
  assert.deepEqual(pitchRowsFromRpc(null), []);
});

test('request markup: left bubble, Not connected yet, Accept and Decline', () => {
  const html = pitchThreadMarkup(pitchThreadModel(row(), person), { escapeHtml });
  assert.match(html, /pitch-bubble--them/);
  assert.ok(html.includes('Not connected yet'));
  assert.match(html, /<button type="button"[^>]*data-pitch-action="accept"[^>]*>Accept<\/button>/);
  assert.match(html, /<button type="button"[^>]*data-pitch-action="decline"[^>]*>Decline<\/button>/);
});

test('waiting markup: right bubble, waiting line, no buttons', () => {
  const html = pitchThreadMarkup(pitchThreadModel(row({ direction: 'out' }), person), { escapeHtml });
  assert.match(html, /pitch-bubble--me/);
  assert.ok(html.includes('Waiting for them to accept'));
  assert.ok(!html.includes('data-pitch-action'));
});

test('open markup: bubble only, side by direction, no buttons or status', () => {
  const inn = pitchThreadMarkup(pitchThreadModel(row({ chatOpen: true }), person), { escapeHtml });
  const out = pitchThreadMarkup(pitchThreadModel(row({ chatOpen: true, direction: 'out' }), person), { escapeHtml });
  assert.match(inn, /pitch-bubble--them/);
  assert.match(out, /pitch-bubble--me/);
  for (const html of [inn, out]) {
    assert.ok(!html.includes('data-pitch-action'));
    assert.ok(!html.includes('Not connected'));
    assert.ok(!html.includes('Waiting'));
  }
});

test('the note is escaped', () => {
  const html = pitchThreadMarkup(pitchThreadModel(row({ note: '<img src=x onerror=1>' }), person), { escapeHtml });
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=1&gt;'));
});

test('Accept / Decline exist only for the request state', () => {
  for (const [r, expected] of [[row(), true], [row({ direction: 'out' }), false], [row({ chatOpen: true }), false]]) {
    assert.equal(pitchThreadMarkup(pitchThreadModel(r, person), { escapeHtml }).includes('data-pitch-action'), expected);
  }
});

test('copy is exact and has no dating words', () => {
  assert.deepEqual(PITCH_COPY, {
    sectionTitle: 'Message requests', label: 'Message request', notConnectedYet: 'Not connected yet',
    waiting: 'Waiting for them to accept', accept: 'Accept', decline: 'Decline', endChat: 'End chat',
    notConnected: 'Not connected', noLongerOpen: 'That request is no longer open.',
    updateFailed: 'That request could not be updated. Please try again.',
  });
  for (const s of Object.values(PITCH_COPY)) assert.ok(!DATING.test(s), s);
  for (const r of [row(), row({ direction: 'out' }), row({ chatOpen: true })]) {
    assert.ok(!DATING.test(pitchThreadMarkup(pitchThreadModel(r, person), { escapeHtml }).replace(/class="[^"]*"/g, '')));
  }
});
