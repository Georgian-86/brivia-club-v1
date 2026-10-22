// The profile photo "portion selector" (photo-crop-math.js): pure maths only, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN_ZOOM, MAX_ZOOM, clampZoom, baseScale, clampOffset, zoomAbout, panBy, cropRect, initialCrop, wheelZoom, pinchZoom } from '../../site/scripts/photo-crop-math.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
// A 2000 x 1000 landscape photo framed by a 300 px circle.
const dims = { width: 2000, height: 1000, diameter: 300 };

test('zoom is clamped to 1x-4x, and junk becomes 1x', () => {
  assert.equal(MIN_ZOOM, 1); assert.equal(MAX_ZOOM, 4);
  assert.equal(clampZoom(0.2), 1); assert.equal(clampZoom(9), 4); assert.equal(clampZoom(2.5), 2.5);
  assert.equal(clampZoom(NaN), 1); assert.equal(clampZoom(undefined), 1);
});

test('at 1x the short side of the photo exactly fills the circle', () => {
  near(baseScale(2000, 1000, 300), 0.3);
  near(baseScale(1000, 2000, 300), 0.3);
  near(baseScale(500, 500, 300), 0.6);
});

test('initialCrop centres the photo at 1x', () => {
  assert.deepEqual(initialCrop(), { x: 0, y: 0, zoom: 1 });
});

test('the photo can never be dragged so the circle shows empty space', () => {
  // 1x: displayed 600 x 300. Horizontal slack (600 - 300) / 2 = 150; vertical slack 0.
  assert.deepEqual(clampOffset({ x: 500, y: 40, zoom: 1 }, dims), { x: 150, y: 0, zoom: 1 });
  assert.deepEqual(clampOffset({ x: -500, y: -40, zoom: 1 }, dims), { x: -150, y: 0, zoom: 1 });
  // 2x: displayed 1200 x 600: slack 450 and 150.
  assert.deepEqual(clampOffset({ x: 999, y: -999, zoom: 2 }, dims), { x: 450, y: -150, zoom: 2 });
  // Inside the slack nothing moves.
  assert.deepEqual(clampOffset({ x: 10, y: 0, zoom: 1 }, dims), { x: 10, y: 0, zoom: 1 });
});

test('panBy moves and clamps', () => {
  assert.deepEqual(panBy({ x: 0, y: 0, zoom: 1 }, 40, 25, dims), { x: 40, y: 0, zoom: 1 });
  assert.deepEqual(panBy({ x: 140, y: 0, zoom: 1 }, 40, 0, dims), { x: 150, y: 0, zoom: 1 });
});

test('zoomAbout keeps the point under the cursor fixed and clamps the result', () => {
  // Zoom 1 -> 2 about the centre: offsets double (0 stays 0).
  assert.deepEqual(zoomAbout({ x: 0, y: 0, zoom: 1 }, 2, { x: 0, y: 0 }, dims), { x: 0, y: 0, zoom: 2 });
  // About a point 100 px right of centre: the image point under it stays there: x' = p - (p - x) * 2 = -100.
  const s = zoomAbout({ x: 0, y: 0, zoom: 1 }, 2, { x: 100, y: 0 }, dims);
  near(s.x, -100); near(s.y, 0); assert.equal(s.zoom, 2);
  // Beyond 4x it stops at 4x; below 1x at 1x, and the offset is re-clamped to the smaller slack.
  assert.equal(zoomAbout({ x: 0, y: 0, zoom: 3 }, 10, { x: 0, y: 0 }, dims).zoom, 4);
  assert.deepEqual(zoomAbout({ x: 450, y: 150, zoom: 2 }, 0.5, { x: 0, y: 0 }, dims), { x: 150, y: 0, zoom: 1 });
});

test('wheel and pinch zoom factors', () => {
  assert.ok(wheelZoom(1, -100) > 1); assert.ok(wheelZoom(2, 100) < 2);
  assert.equal(wheelZoom(4, -1000), 4); assert.equal(wheelZoom(1, 1000), 1);
  near(pinchZoom(1, 100, 200), 2); near(pinchZoom(2, 200, 100), 1);
  assert.equal(pinchZoom(2, 0, 100), 2); // a zero start distance is ignored
});

test('cropRect maps the circle to a square of natural pixels', () => {
  // 1x centred: the circle covers the full height (1000 px) in the middle of the width.
  assert.deepEqual(cropRect({ x: 0, y: 0, zoom: 1 }, dims), { sx: 500, sy: 0, size: 1000 });
  // Dragged fully right (x = +150): the left edge of the photo shows.
  assert.deepEqual(cropRect({ x: 150, y: 0, zoom: 1 }, dims), { sx: 0, sy: 0, size: 1000 });
  assert.deepEqual(cropRect({ x: -150, y: 0, zoom: 1 }, dims), { sx: 1000, sy: 0, size: 1000 });
  // 2x centred: half the side, centred.
  assert.deepEqual(cropRect({ x: 0, y: 0, zoom: 2 }, dims), { sx: 750, sy: 250, size: 500 });
  // An out-of-range state is clamped first, so the rect always lies inside the photo.
  const r = cropRect({ x: 9999, y: -9999, zoom: 4 }, dims);
  assert.ok(r.sx >= 0 && r.sy >= 0 && r.sx + r.size <= 2000 && r.sy + r.size <= 1000, JSON.stringify(r));
});

test('portrait photos and tiny photos stay inside', () => {
  const p = { width: 900, height: 1600, diameter: 280 };
  assert.deepEqual(cropRect({ x: 0, y: 0, zoom: 1 }, p), { sx: 0, sy: 350, size: 900 });
  const tiny = { width: 1, height: 1, diameter: 300 };
  assert.deepEqual(cropRect({ x: 30, y: 30, zoom: 3 }, tiny), { sx: 0, sy: 0, size: 1 });
});
