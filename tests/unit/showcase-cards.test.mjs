import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const authHtml = readFileSync('site/auth.html', 'utf8');
const manifestText = readFileSync('site/media/manifest.json', 'utf8');
const track = authHtml.match(/<div class="community-track">([\s\S]*?)<p class="community-preview-note"/)?.[1] ?? '';
const cards = [...track.matchAll(/<article class="community-card[^"]*"( aria-hidden="true")?>[\s\S]*?<img src="([^"]+)"/g)]
  .map(([, hidden, src]) => ({ src, ariaHidden: hidden ? 'true' : null }));

test('no Yugansh or Keshav anywhere shipped', () => {
  assert.doesNotMatch(authHtml, /Yugansh|Keshav/i);
  assert.doesNotMatch(manifestText, /Yugansh|Keshav/i);
  for (const path of ['site/media/assets/Keshav-Jha.webp', 'site/media/assets/Yugansh-Tyagi.webp',
    'source-media/assets/Keshav-Jha.jpeg', 'source-media/assets/Yugansh-Tyagi.PNG']) {
    assert.equal(existsSync(path), false, path);
  }
});

test('the marquee is two identical halves; the second is aria-hidden', () => {
  assert.equal(cards.length, 18);
  const first9 = cards.slice(0, 9);
  const second9 = cards.slice(9);
  assert.deepEqual(first9.map((c) => c.src), second9.map((c) => c.src));
  assert.ok(first9.every((c) => c.ariaHidden === null));
  assert.ok(second9.every((c) => c.ariaHidden === 'true'));
});

test('the marquee keeps the same speed per card (38s for 11 cards becomes 31s for 9)', () => {
  const css = readFileSync('site/styles/auth-polish.css', 'utf8');
  assert.match(css, /\.community-track\{[^}]*animation:community-cards-slide 31s linear infinite/);
});

test('the marquee caption carries no head count (founder ruling)', () => {
  const note = authHtml.match(/<p class="community-preview-note">([^<]*)<\/p>/)?.[1];
  assert.equal(note, 'PEOPLE LIKE YOU · OPEN POSSIBILITIES');
  assert.doesNotMatch(authHtml, /THREE PEOPLE/i);
});
