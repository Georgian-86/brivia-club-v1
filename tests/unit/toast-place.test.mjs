// Toast placement (VFIX 3): the toast moves to the top when it would land on the control just used. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { toastSide } from '../../site/scripts/toast-place.js';

const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
const toast = rect(12, 683, 363, 724);

test('no anchor: stays at the bottom', () => assert.equal(toastSide(toast, null), 'bottom'));
test('an anchor far above the toast: bottom', () => assert.equal(toastSide(toast, rect(14, 200, 361, 268)), 'bottom'));
test('an anchor under the toast: top', () => assert.equal(toastSide(toast, rect(14, 654, 361, 722)), 'top'));
test('an anchor within the gap above the toast counts as touching', () => assert.equal(toastSide(toast, rect(14, 600, 361, 675)), 'top'));
test('an anchor beside the toast (no horizontal overlap): bottom', () => assert.equal(toastSide(rect(300, 683, 363, 724), rect(14, 654, 200, 722)), 'bottom'));
