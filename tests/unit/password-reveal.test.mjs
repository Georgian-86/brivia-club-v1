// Show / hide password (D-091). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { revealState, REVEAL_LABEL } from '../../site/scripts/password-reveal.js';

test('revealState: hidden is a password field with a "Show password" button, not pressed', () => {
  assert.deepEqual(revealState(false), { type: 'password', pressed: 'false', label: REVEAL_LABEL.show });
});

test('revealState: shown is a text field with a "Hide password" button, pressed', () => {
  assert.deepEqual(revealState(true), { type: 'text', pressed: 'true', label: REVEAL_LABEL.hide });
});

test('REVEAL_LABEL: plain copy', () => {
  assert.equal(REVEAL_LABEL.show, 'Show password');
  assert.equal(REVEAL_LABEL.hide, 'Hide password');
});
