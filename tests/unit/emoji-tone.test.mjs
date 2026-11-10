import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTone, TONES, DEFAULT_TONE, isTone } from '../../site/scripts/emoji-tone.js';

test('the default tone is light', () => {
  assert.equal(DEFAULT_TONE, 'light');
  assert.equal(withTone('🙌'), '🙌🏻');
  assert.equal(withTone('👏'), '👏🏻');
});

test('every tone, and default leaves the yellow emoji', () => {
  assert.deepEqual(TONES.map((t) => withTone('👍', t.key)), ['👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿']);
});

test('only hands and people change; hearts, fire and faces do not', () => {
  for (const e of ['❤️', '🔥', '😂', '😮', '✨']) assert.equal(withTone(e, 'dark'), e, e);
});

test('a VS16 after the base goes; ZWJ sequences keep their tail; a toned emoji is re-toned', () => {
  assert.equal(withTone('✌️', 'medium'), '✌🏽');
  assert.equal(withTone('🧑‍💻', 'dark'), '🧑🏿‍💻');
  assert.equal(withTone('👍🏾', 'light'), '👍🏻');   // the chosen tone replaces any tone
  assert.equal(withTone('👍🏾', 'default'), '👍');
  assert.equal(withTone('', 'light'), '');
  assert.equal(withTone('🙌', 'nonsense'), '🙌');
});

test('isTone knows the six keys', () => {
  assert.equal(isTone('medium-dark'), true);
  assert.equal(isTone('purple'), false);
});

test('HTML entity input (the emoji lists) is decoded, toned or not', () => {
  assert.equal(withTone('&#x1F44B;', 'dark'), '👋🏿');
  assert.equal(withTone('&#x2764;&#xFE0F;', 'dark'), '❤️');
  assert.equal(withTone('&#x1F44B;', 'default'), '👋');
});
