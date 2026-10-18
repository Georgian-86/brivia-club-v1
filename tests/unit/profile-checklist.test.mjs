// "Complete your profile" (Phase C, Task 5): the pure checklist behind the profile card. Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { profileChecklist } from '../../site/scripts/profile-checklist.js';

// The default cover as cover-assets.js resolves it: the dev path, and the hashed optimized build URL.
const DEFAULT_DEV = '/media/Images/Cover images/163BDB0C-64AC-44E7-8663-55C323ADB4FE.webp';
const DEFAULT_BUILD = '/assets/163BDB0C-64AC-44E7-8663-55C323ADB4FE-Ab12_-Cd.webp';
const three = [
  { interest_id: 'a', label: 'Badminton', points: 10, mode: 'play' },
  { interest_id: 'b', label: 'Chess', points: 6, mode: 'learn' },
  { interest_id: 'c', label: 'Poetry', points: 4, mode: 'play' },
];
const complete = {
  photoUrl: 'https://stub.supabase.local/storage/v1/object/public/profile-photos/me/p.jpg',
  coverUrl: '/Images/Cover%20images/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG',
  lookingFor: 'Friends, Mentor',
  experience: 'Product designer',
};
const doneKeys = (result) => result.items.filter((item) => item.done).map((item) => item.key);

test('a new member is 1/5', () => {
  const result = profileChecklist({ name: 'Alex' }, three, DEFAULT_DEV);
  assert.equal(result.done, 1);
  assert.equal(result.total, 5);
  assert.equal(result.complete, false);
  assert.deepEqual(doneKeys(result), ['interests']);
});

test('the default cover does not count, a legacy hashed default cover does not count', () => {
  assert.deepEqual(doneKeys(profileChecklist({ coverUrl: DEFAULT_DEV }, [], DEFAULT_DEV)), []);
  assert.deepEqual(doneKeys(profileChecklist({ coverUrl: DEFAULT_BUILD }, [], DEFAULT_BUILD)), []);
  // Stored values from older builds and the original preset path all name the same default preset.
  for (const stored of [
    '/assets/163BDB0C-64AC-44E7-8663-55C323ADB4FE-Bcr88PbJ.PNG',
    '/Images/Cover%20images/163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG',
    '/assets/163BDB0C-64AC-44E7-8663-55C323ADB4FE-Ab12_-Cd.webp',
  ]) {
    assert.deepEqual(doneKeys(profileChecklist({ coverUrl: stored }, [], DEFAULT_DEV)), [], stored);
    assert.deepEqual(doneKeys(profileChecklist({ coverUrl: stored }, [], DEFAULT_BUILD)), [], stored);
  }
  // The injected normalizer (cover-assets.js normalizeCoverUrl in the app) is applied to both sides.
  const normalize = (url) => (url === 'legacy-default' ? DEFAULT_DEV : url);
  assert.deepEqual(doneKeys(profileChecklist({ coverUrl: 'legacy-default' }, [], DEFAULT_DEV, normalize)), []);
  // Another preset or an uploaded cover counts.
  assert.deepEqual(doneKeys(profileChecklist({ coverUrl: complete.coverUrl }, [], DEFAULT_DEV)), ['cover']);
  assert.deepEqual(doneKeys(profileChecklist({ cover_url: 'https://stub.supabase.local/storage/v1/object/public/profile-covers/me/c.jpg' }, [], DEFAULT_DEV)), ['cover']);
});

test('a complete member is 5/5 and complete', () => {
  const result = profileChecklist(complete, three, DEFAULT_DEV);
  assert.equal(result.done, 5);
  assert.equal(result.total, 5);
  assert.equal(result.complete, true);
  assert.ok(result.items.every((item) => item.done));
});

test('whitespace-only lookingFor is not done', () => {
  const result = profileChecklist({ ...complete, lookingFor: '   ', experience: ' \n ' }, three, DEFAULT_DEV);
  assert.deepEqual(doneKeys(result), ['photo', 'cover', 'interests']);
  assert.equal(profileChecklist({ ...complete, lookingFor: ['  ', ''] }, three, DEFAULT_DEV).items[3].done, false);
  assert.equal(profileChecklist({ ...complete, lookingFor: ['Friends'] }, three, DEFAULT_DEV).items[3].done, true);
});

test('order is photo, cover, interests, looking, experience', () => {
  const result = profileChecklist({}, [], DEFAULT_DEV);
  assert.deepEqual(result.items.map((item) => item.key), ['photo', 'cover', 'interests', 'looking', 'experience']);
  assert.deepEqual(result.items.map((item) => item.label), ['Add a profile photo', 'Choose a cover', 'Pick 3 or more interests', "Say what you're looking for", 'Add your experience']);
  assert.ok(result.items.every((item) => item.action === 'editor'));
  assert.equal(result.done, 0);
  assert.equal(result.complete, false);
});

test('two interests are not enough; missing inputs never throw', () => {
  assert.equal(profileChecklist({}, three.slice(0, 2), DEFAULT_DEV).items[2].done, false);
  const result = profileChecklist(undefined, undefined, undefined);
  assert.equal(result.done, 0);
  assert.equal(result.total, 5);
});
