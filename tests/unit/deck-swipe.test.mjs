// The deck's heavy swipe: pure gesture maths (deck-swipe.js). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { SWIPE, rotationFor, stampOpacity, commitDecision, flyDuration, axisFor, velocityFrom, flyDistance, stackProgress } from '../../deck-swipe.js';

test('constants: max 12 deg, 30% commit, 0.6 px/ms fling, 8 px axis lock, 260-420 ms fly', () => {
  assert.equal(SWIPE.maxRotate, 12);
  assert.equal(SWIPE.commitRatio, 0.3);
  assert.equal(SWIPE.flingVelocity, 0.6);
  assert.equal(SWIPE.axisLock, 8);
  assert.deepEqual([SWIPE.minFly, SWIPE.maxFly], [260, 420]);
});

test('rotationFor: proportional to the horizontal offset, signed, capped at 12 deg', () => {
  assert.equal(rotationFor(0, 400), 0);
  assert.equal(rotationFor(100, 400), 6);
  assert.equal(rotationFor(-100, 400), -6);
  assert.equal(rotationFor(200, 400), 12);
  assert.equal(rotationFor(5000, 400), 12);
  assert.equal(rotationFor(-5000, 400), -12);
  assert.equal(rotationFor(50, 0), 0, 'no width: no rotation, never NaN');
});

test('stampOpacity: 0 at rest, 1 at the commit distance, clamped', () => {
  assert.equal(stampOpacity(0, 400), 0);
  assert.equal(stampOpacity(60, 400), 0.5);
  assert.equal(stampOpacity(-60, 400), 0.5);
  assert.equal(stampOpacity(120, 400), 1);
  assert.equal(stampOpacity(900, 400), 1);
  assert.equal(stampOpacity(10, 0), 0);
});

test('commitDecision: past 30% of the card width commits in the drag direction', () => {
  assert.equal(commitDecision({ dx: 121, vx: 0, width: 400 }), 'pitch');
  assert.equal(commitDecision({ dx: -121, vx: 0, width: 400 }), 'pass');
  assert.equal(commitDecision({ dx: 119, vx: 0, width: 400 }), null, 'just short of 30%: springs back');
  assert.equal(commitDecision({ dx: 0, vx: 0, width: 400 }), null);
});

test('commitDecision: a fling over 0.6 px/ms commits even when short, in the same direction only', () => {
  assert.equal(commitDecision({ dx: 40, vx: 0.9, width: 400 }), 'pitch');
  assert.equal(commitDecision({ dx: -40, vx: -0.9, width: 400 }), 'pass');
  assert.equal(commitDecision({ dx: 40, vx: 0.5, width: 400 }), null, 'too slow');
  assert.equal(commitDecision({ dx: 40, vx: -0.9, width: 400 }), null, 'flung back towards the centre');
  assert.equal(commitDecision({ dx: 4, vx: 2, width: 400 }), null, 'a tap-sized jitter never commits');
});

test('commitDecision: a far drag flung back past the centre does not commit the wrong way', () => {
  assert.equal(commitDecision({ dx: 150, vx: -1.2, width: 400 }), null);
});

test('flyDuration: faster flings fly shorter, always within 260-420 ms', () => {
  assert.equal(flyDuration(0, 900), 420);
  assert.equal(flyDuration(10, 900), 260);
  const mid = flyDuration(3, 900);
  assert.ok(mid > 260 && mid < 420, `mid ${mid}`);
  assert.ok(flyDuration(-3, 900) === mid, 'direction does not matter');
  assert.ok(flyDuration(2, 900) > flyDuration(3, 900));
  assert.ok(Number.isInteger(flyDuration(2.2, 777)));
});

test('axisFor: undecided until 8 px, then the dominant axis', () => {
  assert.equal(axisFor(3, 4), null);
  assert.equal(axisFor(7, -7), null);
  assert.equal(axisFor(9, 2), 'x');
  assert.equal(axisFor(-9, 2), 'x');
  assert.equal(axisFor(2, 9), 'y');
  assert.equal(axisFor(8, 8), 'y', 'a tie is a scroll: vertical page scroll wins');
});

test('velocityFrom: px/ms over the recent samples (last ~100 ms), 0 when unknown', () => {
  assert.equal(velocityFrom([]), 0);
  assert.equal(velocityFrom([{ x: 0, t: 0 }]), 0);
  assert.equal(velocityFrom([{ x: 0, t: 0 }, { x: 100, t: 100 }]), 1);
  assert.equal(velocityFrom([{ x: 0, t: 0 }, { x: 0, t: 400 }, { x: 50, t: 450 }, { x: 100, t: 500 }]), 1, 'old samples ignored');
  assert.equal(velocityFrom([{ x: 0, t: 10 }, { x: 0, t: 10 }]), 0, 'no elapsed time');
});

test('flyDistance: far enough for the whole (rotated) card to leave the viewport, signed', () => {
  // A card at 400-800 px in a 1200 px viewport: right needs 800 px plus a margin, left 800 px plus a margin.
  assert.equal(flyDistance('pitch', { left: 400, right: 800, viewport: 1200 }), 880);
  assert.equal(flyDistance('pass', { left: 400, right: 800, viewport: 1200 }), -880);
  // A card on the right of a wide screen has further to go to the left.
  assert.equal(flyDistance('pass', { left: 1158, right: 1633, viewport: 1920 }), -1713);
  assert.equal(flyDistance('pitch', { left: 1158, right: 1633, viewport: 1920 }), 842);
});

test('stackProgress: the card underneath rises as the top card leaves', () => {
  assert.equal(stackProgress(0, 400), 0);
  assert.equal(stackProgress(-60, 400), 0.5);
  assert.equal(stackProgress(500, 400), 1);
});

test('releaseVelocity: the move samples\' speed, or 0 when the pointer was held still before letting go', async () => {
  const { releaseVelocity } = await import('../../deck-swipe.js');
  const moves = [{ x: 0, t: 0 }, { x: 40, t: 20 }, { x: 80, t: 40 }];
  assert.equal(releaseVelocity(moves, 45), 2, 'let go mid-fling: the fling speed');
  assert.equal(releaseVelocity(moves, 200), 0, 'held still 160 ms: no momentum');
  assert.equal(releaseVelocity([], 10), 0);
});
