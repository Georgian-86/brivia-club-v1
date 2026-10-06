// compressImage fails closed (R12): never returns the original (with its EXIF/GPS) on a failure. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { compressImage, ImageProcessingError, PHOTO_ERROR_MESSAGE, replacedObjectPath, isImageLike, compressImageOnly, attachmentKind, compressAttachmentFiles } from '../../image-compress.js';

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

test('isImageLike: MIME image/* or an image extension (case-insensitive), e.g. HEIC with an empty type', () => {
  assert.equal(isImageLike({ type: '', name: 'x.HEIC' }), true);
  assert.equal(isImageLike({ type: '', name: 'x.tiff' }), true);
  assert.equal(isImageLike({ type: 'image/png', name: 'noext' }), true);
  assert.equal(isImageLike({ type: '', name: 'x.pdf' }), false);
  assert.equal(isImageLike({ type: 'video/mp4', name: 'x.mp4' }), false);
});

test('an empty-type .heic that fails to decode throws (original with GPS never returned)', async () => {
  const { deps } = makeDeps({ loadImage: async () => { throw new Error('decode'); } });
  await assert.rejects(() => compressImage({ type: '', name: 'x.heic', size: 3 }, deps), ImageProcessingError);
});

test('an empty-type .jpg that decodes returns a JPEG', async () => {
  const { deps } = makeDeps();
  const out = await compressImage({ type: '', name: 'x.jpg', size: 3 }, deps);
  assert.equal(out.type, 'image/jpeg');
  assert.equal(out.name, 'x.jpg');
});

test('compressImageOnly refuses a non-image for an image-only destination', async () => {
  const { deps } = makeDeps();
  await assert.rejects(() => compressImageOnly({ type: 'application/pdf', name: 'a.pdf' }, deps), ImageProcessingError);
  await assert.rejects(() => compressImageOnly(null, deps), ImageProcessingError);
});

test('an already compressed file is not re-encoded (second failure cannot surface)', async () => {
  const { deps } = makeDeps();
  const once = await compressImageOnly(file(), deps);
  const { deps: failing } = makeDeps({ loadImage: async () => { throw new Error('boom'); } });
  assert.equal(await compressImageOnly(once, failing), once);
});

test('attachmentKind: MIME then extension; gif stays gif', () => {
  assert.equal(attachmentKind({ type: 'image/gif', name: 'a.gif' }), 'gif');
  assert.equal(attachmentKind({ type: '', name: 'a.heic' }), 'image');
  assert.equal(attachmentKind({ type: 'video/quicktime', name: 'a.mov' }), 'video');
  assert.equal(attachmentKind({ type: '', name: 'a.pdf' }), 'document');
});

test('compressAttachmentFiles: any failure rejects the whole batch before anything is returned', async () => {
  let n = 0;
  const { deps } = makeDeps({ loadImage: async () => { n += 1; if (n === 2) throw new Error('bad'); return { naturalWidth: 10, naturalHeight: 10, image: {} }; } });
  const files = [file('a.png'), file('b.png'), { type: 'application/pdf', name: 'c.pdf' }];
  await assert.rejects(() => compressAttachmentFiles(files, deps), ImageProcessingError);
  n = 99;
  const ok = await compressAttachmentFiles([file('a.png'), { type: 'image/gif', name: 'g.gif' }, { type: 'application/pdf', name: 'c.pdf' }], deps);
  assert.equal(ok[0].type, 'image/jpeg');
  assert.equal(ok[1].name, 'g.gif');
  assert.equal(ok[2].name, 'c.pdf');
});
