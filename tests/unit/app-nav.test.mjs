// One member navigation (Phase C, Task 2): the shared nav model for the header and the mobile tab bar.
// Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV_ITEMS, navMarkup } from '../../site/scripts/app-nav.js';

const items = (html) => [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0]);
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];

test('NAV_ITEMS: Connect, Explore, Posts, Chat, Profile on explore, events, posts, chat, profile (D-117)', () => {
  assert.deepEqual(NAV_ITEMS.map((i) => i.label), ['Connect', 'Explore', 'Posts', 'Chat', 'Profile']);
  assert.deepEqual(NAV_ITEMS.map((i) => i.view), ['explore', 'events', 'posts', 'chat', 'profile']);
  NAV_ITEMS.forEach((i) => assert.match(i.icon, /^<svg\b/));
});

test('navMarkup header and tabbar list the same five views in the same order', () => {
  const header = items(navMarkup('header', 'explore'));
  const tabbar = items(navMarkup('tabbar', 'explore'));
  assert.equal(header.length, 5);
  assert.deepEqual(header.map((a) => attr(a, 'data-nav')), ['explore', 'events', 'posts', 'chat', 'profile']);
  assert.deepEqual(tabbar.map((a) => attr(a, 'data-nav')), header.map((a) => attr(a, 'data-nav')));
  header.forEach((a) => {
    const view = attr(a, 'data-nav');
    assert.equal(attr(a, 'href'), `/app.html?view=${view}`);
    assert.match(attr(a, 'class'), /\bapp-nav-button\b/);
  });
});

test('the active item alone has aria-current="page"', () => {
  for (const variant of ['header', 'tabbar']) {
    for (const view of ['explore', 'events', 'posts', 'chat', 'profile']) {
      const current = items(navMarkup(variant, view)).filter((a) => attr(a, 'aria-current') === 'page');
      assert.equal(current.length, 1, `${variant} ${view}`);
      assert.equal(attr(current[0], 'data-nav'), view);
    }
    assert.equal(items(navMarkup(variant, 'nowhere')).filter((a) => /aria-current/.test(a)).length, 0);
  }
});

test('home is treated as explore', () => {
  const current = items(navMarkup('tabbar', 'home')).filter((a) => attr(a, 'aria-current') === 'page');
  assert.deepEqual(current.map((a) => attr(a, 'data-nav')), ['explore']);
});

test('every icon svg is aria-hidden', () => {
  for (const variant of ['header', 'tabbar']) {
    const svgs = [...navMarkup(variant, 'chat').matchAll(/<svg\b[^>]*>/g)].map((m) => m[0]);
    assert.ok(svgs.length >= 5, `${variant} has ${svgs.length} icons`);
    svgs.forEach((svg) => assert.equal(attr(svg, 'aria-hidden'), 'true'));
  }
});

test('the chat item carries the hidden chat badge; labels are visible text', () => {
  const html = navMarkup('header', 'explore');
  const chat = items(html).find((a) => attr(a, 'data-nav') === 'chat');
  assert.match(chat, /<i class="nav-badge" data-chat-badge hidden><\/i>/);
  assert.equal((html.match(/data-chat-badge/g) || []).length, 1);
  items(html).forEach((a, index) => assert.ok(a.includes(`>${NAV_ITEMS[index].label}<`)));
});

test('navMarkup rejects an unknown variant', () => {
  assert.throws(() => navMarkup('sidebar', 'explore'), /variant/);
});
