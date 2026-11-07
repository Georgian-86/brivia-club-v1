// D-223: every public page wears the same footer as the landing; about and privacy also its nav and menu (careers
// keeps its own hero header).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (page) => readFileSync(new URL(`../../site/${page}.html`, import.meta.url), 'utf8');
const block = (html, re) => html.match(re)?.[0] ?? '';
const FOOTER = /<footer class="site-footer" id="site-footer">[\s\S]*?<\/footer>/;
const MENU = /<div class="menu-overlay"[^>]*>[\s\S]*?<\/div><\/div><\/div><\/div>/;
const HEADER = /<header class="hero-nav"[^>]*>[\s\S]*?<\/header>/;
const labels = (html) => [...html.matchAll(/<a [^>]*>([^<]+)/g)].map((m) => m[1].trim());
const SUBPAGES = ['about', 'privacy', 'careers'];

test('the footer on about, privacy and careers is the same markup', () => {
  const [first, ...rest] = SUBPAGES.map((p) => block(read(p), FOOTER));
  assert.ok(first, 'about has the site footer');
  for (const footer of rest) assert.equal(footer, first);
});

test('the subpage footer has the landing footer links, in order, with the same labels', () => {
  const landing = labels(block(read('index'), FOOTER));
  assert.deepEqual(labels(block(read('about'), FOOTER)), landing);
  assert.ok(landing.includes('ABOUT') && landing.includes('PRIVACY'));
});

test('about and privacy share the nav and menu; the menu matches the landing labels', () => {
  assert.equal(block(read('about'), HEADER), block(read('privacy'), HEADER));
  assert.ok(block(read('about'), HEADER).includes('menu-trigger'));
  assert.equal(block(read('privacy'), MENU), block(read('about'), MENU));
  const text = (html) => block(html, MENU).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  assert.equal(text(read('about')), text(read('index')));
});

test('the closed menu is inert, so its links are out of the tab order', () => {
  for (const p of ['index', 'about', 'privacy']) assert.match(block(read(p), MENU), /aria-hidden="true" inert/, p);
});
