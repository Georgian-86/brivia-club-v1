// Loading skeletons and busy buttons (Phase C, Task 6): pure markup helpers and setBusy.
// Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { skeletonMarkup, setBusy } from '../../app-skeletons.js';

const blocks = (html) => (html.match(/class="skeleton(?: [^"]*)?"/g) || []).length;
const root = (html) => (html.match(/^<div\b[^>]*>/) || [''])[0];

test('deck skeleton has one card block', () => {
  assert.equal(blocks(skeletonMarkup('deck')), 1);
  assert.equal(blocks(skeletonMarkup('deck', 5)), 1);
  assert.match(skeletonMarkup('deck'), /skeleton-deck/);
});

test('list skeleton has count rows', () => {
  assert.equal(blocks(skeletonMarkup('list')), 3);
  assert.equal(blocks(skeletonMarkup('list', 5)), 5);
  assert.equal(blocks(skeletonMarkup('posts', 2)), 2);
  assert.equal(blocks(skeletonMarkup('chips', 4)), 4);
});

test('skeleton group is aria-hidden', () => {
  for (const kind of ['deck', 'list', 'posts', 'chips']) {
    const head = root(skeletonMarkup(kind));
    assert.match(head, /class="skeleton-group[ "]/, kind);
    assert.match(head, /aria-hidden="true"/, kind);
  }
});

test('an unknown kind or count falls back to a safe list', () => {
  assert.equal(blocks(skeletonMarkup('nope')), 3);
  assert.equal(blocks(skeletonMarkup('list', 0)), 1);
  assert.equal(blocks(skeletonMarkup('list', 99)), 12);
});

const fakeButton = (width = 120) => {
  const attrs = new Map();
  return {
    disabled: false,
    style: { minWidth: '' },
    getBoundingClientRect: () => ({ width }),
    setAttribute: (name, value) => attrs.set(name, String(value)),
    removeAttribute: (name) => attrs.delete(name),
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
    hasAttribute: (name) => attrs.has(name),
  };
};

test('setBusy toggles aria-busy and disabled and restores both', () => {
  const button = fakeButton(132.4);
  setBusy(button, true);
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(button.disabled, true);
  assert.equal(button.style.minWidth, '132.4px');
  setBusy(button, false);
  assert.equal(button.hasAttribute('aria-busy'), false);
  assert.equal(button.disabled, false);
  assert.equal(button.style.minWidth, '');
});

test('setBusy keeps a button that was already disabled disabled, and ignores a missing element', () => {
  const button = fakeButton();
  button.disabled = true;
  setBusy(button, true);
  setBusy(button, false);
  assert.equal(button.disabled, true);
  assert.doesNotThrow(() => setBusy(null, true));
});
