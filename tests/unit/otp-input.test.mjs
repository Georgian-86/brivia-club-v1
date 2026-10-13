// Six-box code input helper. Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { otpBoxesAfterInput } from '../../otp-input.js';

const E = () => ['', '', '', '', '', ''];

test('a digit fills the box and moves focus on', () => {
  assert.deepEqual(otpBoxesAfterInput(E(), 0, '4'), { boxes: ['4', '', '', '', '', ''], focus: 1 });
  assert.deepEqual(otpBoxesAfterInput(E(), 5, '9'), { boxes: ['', '', '', '', '', '9'], focus: 5 });
});
test('a non-digit is ignored', () => {
  const b = ['1', '', '', '', '', ''];
  assert.deepEqual(otpBoxesAfterInput(b, 1, 'x'), { boxes: b, focus: 1 });
});
test('pasting six digits fills all and focuses the last', () => {
  assert.deepEqual(otpBoxesAfterInput(E(), 2, '123 456'), { boxes: ['1', '2', '3', '4', '5', '6'], focus: 5 });
  assert.deepEqual(otpBoxesAfterInput(E(), 0, 'Your code is 654321.'), { boxes: ['6', '5', '4', '3', '2', '1'], focus: 5 });
});
test('a partial multi-character value fills from the index', () => {
  assert.deepEqual(otpBoxesAfterInput(E(), 1, '12'), { boxes: ['', '1', '2', '', '', ''], focus: 3 });
  assert.deepEqual(otpBoxesAfterInput(E(), 4, '789'), { boxes: ['', '', '', '', '7', '8'], focus: 5 });
});
test('backspace on an empty box moves back and clears that box', () => {
  assert.deepEqual(otpBoxesAfterInput(['1', '2', '', '', '', ''], 2, ''), { boxes: ['1', '', '', '', '', ''], focus: 1 });
  assert.deepEqual(otpBoxesAfterInput(E(), 0, ''), { boxes: E(), focus: 0 });
});
test('backspace on a filled box clears it and keeps focus', () => {
  assert.deepEqual(otpBoxesAfterInput(['1', '2', '', '', '', ''], 1, ''), { boxes: ['1', '', '', '', '', ''], focus: 1 });
});
test('never mutates its input', () => {
  const b = ['1', '2', '', '', '', ''];
  const frozen = JSON.stringify(b);
  otpBoxesAfterInput(b, 2, '5'); otpBoxesAfterInput(b, 1, ''); otpBoxesAfterInput(b, 0, '123456'); otpBoxesAfterInput(b, 2, '');
  assert.equal(JSON.stringify(b), frozen);
});
// Phase E Task 3: typing over a filled box replaces its digit. The caller passes only the new character, but an IME
// (Android) can ignore maxlength and hand over the old and the new digit together; either way the new digit wins.
test('typing over a filled box replaces it with the new digit', () => {
  assert.deepEqual(otpBoxesAfterInput(['1', '2', '', '', '', ''], 0, '7'), { boxes: ['7', '2', '', '', '', ''], focus: 1 });
  assert.deepEqual(otpBoxesAfterInput(['1', '2', '', '', '', ''], 0, '17'), { boxes: ['7', '2', '', '', '', ''], focus: 1 });
  assert.deepEqual(otpBoxesAfterInput(['1', '2', '', '', '', ''], 0, '71'), { boxes: ['7', '2', '', '', '', ''], focus: 1 });
  assert.deepEqual(otpBoxesAfterInput(['1', '2', '3', '4', '5', '6'], 5, '69'), { boxes: ['1', '2', '3', '4', '5', '9'], focus: 5 });
});
