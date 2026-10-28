import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPERIENCE_OPTIONS, experienceChoices, cleanBio, BIO_MAX, areaInputValue, planInterestSave } from '../../site/scripts/profile-edit.js';

test('experience: the signup choices, plus an older free-text value kept as it is', () => {
  assert.deepEqual(experienceChoices(''), [...EXPERIENCE_OPTIONS]);
  assert.deepEqual(experienceChoices('3–7 years'), [...EXPERIENCE_OPTIONS]);
  assert.deepEqual(experienceChoices(' Founder '), [...EXPERIENCE_OPTIONS, 'Founder']);
});

test('cleanBio trims, keeps short paragraphs and caps the length', () => {
  assert.equal(cleanBio('  Hi there \r\n\r\n\r\n\r\nI cook.  '), 'Hi there\n\nI cook.');
  assert.equal(cleanBio('x'.repeat(BIO_MAX + 20)).length, BIO_MAX);
  assert.equal(cleanBio(null), '');
});

test('areaInputValue drops the city-wide note', () => {
  assert.equal(areaInputValue('Ludhiana (city-wide)'), 'Ludhiana');
  assert.equal(areaInputValue('Thane'), 'Thane');
  assert.equal(areaInputValue(''), '');
});

test('planInterestSave: unchanged sets send nothing; a change shares 20 points and keeps modes', () => {
  const saved = [{ interest_id: 'a', points: 15, mode: 'teach' }, { interest_id: 'b', points: 5, mode: 'learn' }];
  assert.deepEqual(planInterestSave(saved, ['b', 'a']), { unchanged: true });
  const plan = planInterestSave(saved, ['a', 'c']);
  assert.equal(plan.unchanged, false);
  assert.deepEqual(plan.payload, [{ interest_id: 'a', points: 10, mode: 'teach' }, { interest_id: 'c', points: 10, mode: 'play' }]);
  assert.equal(planInterestSave(saved, []).error, 'none');
  assert.equal(planInterestSave(saved, Array.from({ length: 13 }, (_, i) => `i${i}`)).error, 'too_many');
});
