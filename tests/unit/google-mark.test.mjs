// Phase E Task 3 review (I3): one source for Google's four-colour "G" on a white disc, decorative only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GOOGLE_MARK_SVG } from '../../google-mark.js';

test('the Google mark is the four-colour G on a white disc, hidden from assistive tech', () => {
  for (const colour of ['#4285F4', '#34A853', '#FBBC05', '#EA4335']) assert.ok(GOOGLE_MARK_SVG.includes(`fill="${colour}"`), colour);
  assert.match(GOOGLE_MARK_SVG, /<circle [^>]*fill="#FFFFFF"/);
  assert.match(GOOGLE_MARK_SVG, /^<svg [^>]*aria-hidden="true"[^>]*focusable="false"/);
  assert.equal((GOOGLE_MARK_SVG.match(/<path /g) || []).length, 4);
  assert.ok(!/>G</.test(GOOGLE_MARK_SVG), 'no text G');
});
