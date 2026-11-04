// D-165: pure parts of the motion moments (site/scripts/motion-moments.js). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOMENTS, tiltFor, arrivalsBetween } from '../../site/scripts/motion-moments.js';

test('tilt: flat at the centre, at most 4 degrees per axis at the edges, leaning towards the pointer', () => {
  assert.deepEqual(tiltFor(0.5, 0.5), { ax: 0, ay: 0, angle: 0 });
  const right = tiltFor(1, 0.5);
  assert.equal(right.ay, MOMENTS.tilt.max);
  assert.equal(right.ax, 0);
  const top = tiltFor(0.5, 0);
  assert.equal(top.ax, MOMENTS.tilt.max, 'the top edge comes forward');
  const corner = tiltFor(1, 1);
  assert.ok(corner.angle <= MOMENTS.tilt.max * Math.SQRT2 + 0.01);
  assert.deepEqual(tiltFor(5, -3), tiltFor(1, 0), 'outside the card is clamped');
  assert.deepEqual(tiltFor(NaN, undefined), { ax: 0, ay: 0, angle: 0 });
});

test('chat arrivals: only bubbles new since the last render of the same chat', () => {
  assert.deepEqual(arrivalsBetween(null, ['a', 'b'], true), [], 'first render: nothing replays');
  assert.deepEqual(arrivalsBetween(new Set(['a']), ['a', 'b'], false), [], 'another chat: nothing replays');
  assert.deepEqual(arrivalsBetween(new Set(['a']), ['a', 'b', 'c'], true), ['b', 'c']);
  assert.deepEqual(arrivalsBetween(new Set(['a', 'b']), ['a', 'b'], true), []);
});

test('the moments stay brief', () => {
  const m = MOMENTS.mutual;
  assert.ok(m.actionsAt + 0.4 <= 1.5, 'mutual moment settles within 1.5 s');
  assert.ok(m.ringAt >= m.meetAt + m.meet * 0.6, 'the ring fires as the avatars touch');
  assert.ok(MOMENTS.letter.pop + MOMENTS.letter.fly + MOMENTS.letter.ring <= 1.3);
  assert.ok(MOMENTS.flip <= 0.6 && MOMENTS.reveal.max === 8);
});
