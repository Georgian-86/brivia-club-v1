// Which image a community post shows (Phase D Task 2, post-image.js). Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { postImageSrc } from '../../site/scripts/post-image.js';
import { isPresetCoverUrl } from '../../site/scripts/preset-cover.js';
import { resolveCoverKey } from '../../site/scripts/cover-name.js';

const AUTHOR = 'a7e57000-0000-4000-8000-000000000025';
const ORIGIN = 'https://proj.supabase.co';
const KEYS = ['163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG', '3453059c-4864-46f7-ae45-6f7049939b9f.png'];
// Stand-ins for the browser-only helpers: Storage files of this project's origin, and the shipped preset assets
// (cover-assets.js maps each preset to its optimized /media or hashed /assets URL).
const deps = {
  isStorageImageUrl: (url, bucket, owner) => String(url).startsWith(`${ORIGIN}/storage/v1/object/public/${bucket}/${owner}/`),
  isPresetCoverUrl,
  normalizeCoverUrl: (url) => { const key = resolveCoverKey(url, KEYS); return key ? `/media/Images/Cover images/${key.replace(/\.[^.]+$/, '')}.webp` : url; },
};
const post = (image_url) => ({ author_id: AUTHOR, image_url });

test('a preset illustration identifier renders the shipped asset', () => {
  assert.equal(postImageSrc(post('/Images/Cover%20images/163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG'), deps),
    '/media/Images/Cover images/163BDB0C-64AC-44E7-8663-55C323ADB4FE.webp');
  assert.equal(postImageSrc(post('/Images/Cover images/3453059c-4864-46f7-ae45-6f7049939b9f.png'), deps),
    '/media/Images/Cover images/3453059c-4864-46f7-ae45-6f7049939b9f.webp');
});

test('the author\'s own Storage file still renders as stored', () => {
  const url = `${ORIGIN}/storage/v1/object/public/community-posts/${AUTHOR}/p.jpg`;
  assert.equal(postImageSrc(post(url), deps), url);
});

test('anything else shows the placeholder (empty src)', () => {
  for (const url of [
    'https://tracker.example/p.jpg',
    '//tracker.example/Images/Cover%20images/163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG',
    '/Images/Cover%20images/NOT-A-PRESET.PNG',          // the right shape, but no shipped asset
    '/assets/../../x.png',
    `${ORIGIN}/storage/v1/object/public/community-posts/someone-else/p.jpg`,
    '', null, undefined,
  ]) assert.equal(postImageSrc(post(url), deps), '', String(url));
  assert.equal(postImageSrc(null, deps), '');
});

test('isPresetCoverUrl keeps the 0003 shape (brivia_is_preset_cover)', () => {
  assert.equal(isPresetCoverUrl('/Images/Cover%20images/a.PNG'), true);
  assert.equal(isPresetCoverUrl('/assets/a-Bx1a.PNG'), true);
  assert.equal(isPresetCoverUrl('https://x.example/Images/Cover%20images/a.PNG'), false);
  assert.equal(isPresetCoverUrl('/Images/Cover%20images/../a.PNG'), false);
});
