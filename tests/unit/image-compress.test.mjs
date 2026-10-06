// compressImage fails closed (R12): never returns the original (with its EXIF/GPS) on a failure. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { compressImage, ImageProcessingError, PHOTO_ERROR_MESSAGE, replacedObjectPath } from '../../image-compress.js';

const MESSAGE = "We couldn't process this photo. Try a JPG or PNG.";
const file = (name = 'holiday.HEIC.png', type = 'image/png') => ({ name, type, size: 10 });

const makeDeps = (over = {}) => {
  const calls = { revoked: [], canvas: null };
  const deps = {
    createObjectURL: () => 'blob:x',
    revokeObjectURL: (url) => calls.revoked.push(url),
    loadImage: async () => ({ naturalWidth: 4000, naturalHeight: 2000, image: {} }),
    createCanvas: (w, h) => {
      calls.canvas = { w, h };
      return { width: w, height: h, getContext: () => ({ drawImage() {} }) };
    },
    toBlob: async () => ({ size: 5, type: 'image/jpeg' }),
    makeFile: (blob, name, type) => ({ blob, name, type }),
    ...over,
  };
  return { deps, calls };
};

test('message constant is the exact copy', () => {
  assert.equal(PHOTO_ERROR_MESSAGE, MESSAGE);
  assert.equal(new ImageProcessingError().message, MESSAGE);
  assert.equal(new ImageProcessingError().name, 'ImageProcessingError');
});

test('decode failure throws ImageProcessingError and still revokes the URL', async () => {
  const { deps, calls } = makeDeps({ loadImage: async () => { throw new Error('decode'); } });
  await assert.rejects(() => compressImage(file(), deps), (e) => e instanceof ImageProcessingError && e.message === MESSAGE);
  assert.deepEqual(calls.revoked, ['blob:x']);
});

test('null 2d context throws ImageProcessingError', async () => {
  const { deps } = makeDeps({ createCanvas: (w, h) => ({ width: w, height: h, getContext: () => null }) });
  await assert.rejects(() => compressImage(file(), deps), ImageProcessingError);
});

test('null blob throws ImageProcessingError', async () => {
  const { deps } = makeDeps({ toBlob: async () => null });
  await assert.rejects(() => compressImage(file(), deps), ImageProcessingError);
});

test('success: JPEG named <base>.jpg, scaled to <= 1280', async () => {
  const { deps, calls } = makeDeps();
  const out = await compressImage(file('holiday.HEIC.png'), deps);
  assert.equal(out.type, 'image/jpeg');
  assert.equal(out.name, 'holiday.HEIC.jpg');
  assert.deepEqual(calls.canvas, { w: 1280, h: 640 });
});

test('small images are not upscaled', async () => {
  const { deps, calls } = makeDeps({ loadImage: async () => ({ naturalWidth: 100, naturalHeight: 50, image: {} }) });
  await compressImage(file(), deps);
  assert.deepEqual(calls.canvas, { w: 100, h: 50 });
});

test('non-images and missing files pass through unchanged', async () => {
  const { deps } = makeDeps({ loadImage: async () => { throw new Error('must not run'); } });
  const pdf = file('a.pdf', 'application/pdf');
  assert.equal(await compressImage(pdf, deps), pdf);
  assert.equal(await compressImage(null, deps), null);
});

test('replacedObjectPath: removes only the previous own-bucket object; preset covers and foreign paths never', () => {
  const own = (url) => /^https:\/\/s\.test\/storage\/v1\/object\/public\/profile-covers\/me\/[^/]+$/.test(url);
  assert.equal(replacedObjectPath('https://s.test/storage/v1/object/public/profile-covers/me/old.jpg', 'https://s.test/storage/v1/object/public/profile-covers/me/new.jpg', own), 'me/old.jpg');
  assert.equal(replacedObjectPath('/assets/cover-1.jpg', 'https://s.test/x', own), '', 'a preset cover is never removed');
  assert.equal(replacedObjectPath('/Images/Cover%20images/a.jpg', 'https://s.test/x', own), '');
  assert.equal(replacedObjectPath('https://s.test/storage/v1/object/public/profile-covers/other/old.jpg', 'n', own), '', "another member's path");
  assert.equal(replacedObjectPath('', 'n', own), '');
  const same = 'https://s.test/storage/v1/object/public/profile-covers/me/same.jpg';
  assert.equal(replacedObjectPath(same, same, own), '', 'never removes the file just uploaded');
});
