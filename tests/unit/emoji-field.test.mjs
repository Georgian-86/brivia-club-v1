// D-113: inserting an emoji into a bio field at the cursor, never past its maxlength.
// Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { insertAt } from '../../site/scripts/emoji-field.js';

test('insertAt puts the emoji at the caret or over the selection', () => {
  assert.deepEqual(insertAt('Hi there', 2, 2, '😀'), { value: 'Hi😀 there', caret: 4 });
  assert.deepEqual(insertAt('Hi there', 3, 8, '🔥'), { value: 'Hi 🔥', caret: 5 });
  assert.deepEqual(insertAt('', 0, 0, '✨'), { value: '✨', caret: 1 });
});

test('insertAt appends when the caret is unknown and clamps out-of-range positions', () => {
  assert.deepEqual(insertAt('abc', null, null, '😀'), { value: 'abc😀', caret: 5 });
  assert.deepEqual(insertAt('abc', 99, 99, '😀'), { value: 'abc😀', caret: 5 });
  assert.deepEqual(insertAt('abc', 2, 1, '😀'), { value: 'ab😀c', caret: 4 });
});

test('insertAt refuses an emoji that would pass the field maxlength', () => {
  assert.equal(insertAt('x'.repeat(299), 299, 299, '😀', 300), null, 'a two-unit emoji does not fit in one');
  assert.equal(insertAt('x'.repeat(298), 298, 298, '😀', 300).value.length, 300);
  assert.equal(insertAt('x'.repeat(300), 0, 2, '😀', 300).value.length, 300, 'replacing a selection frees room');
});
