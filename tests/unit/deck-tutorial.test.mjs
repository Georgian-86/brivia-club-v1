import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowTutorial, TUTORIAL_HIDDEN, TUTORIAL_KEY } from '../../site/scripts/deck-tutorial.js';

test('the deck tutorial shows on a first visit', () => {
  assert.equal(shouldShowTutorial(null, null), true);
});
test('it stays away for the rest of a visit once seen', () => {
  assert.equal(shouldShowTutorial(null, '1'), false);
});
test('"Don\'t show this again" keeps it away on later visits', () => {
  assert.equal(shouldShowTutorial(TUTORIAL_HIDDEN, null), false);
  assert.equal(shouldShowTutorial(TUTORIAL_HIDDEN, '1'), false);
});
test('any other stored value still shows it', () => {
  assert.equal(shouldShowTutorial('', null), true);
  assert.equal(shouldShowTutorial('shown', null), true);
});
test('its key is a brivia- key, so sign-out and account deletion clear it', () => {
  assert.match(TUTORIAL_KEY, /^brivia-/);
});
