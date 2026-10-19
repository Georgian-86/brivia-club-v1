// Preset covers only (D-070): the list members choose from in Edit profile. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { COVER_PRESETS } from '../../site/scripts/cover-presets.js';
import { isPresetCoverUrl } from '../../site/scripts/preset-cover.js';
import { resolveCoverKey } from '../../site/scripts/cover-name.js';

test('18 preset covers, each with a label, none repeated', () => {
  assert.equal(COVER_PRESETS.length, 18);
  assert.equal(new Set(COVER_PRESETS.map((p) => p.key)).size, 18);
  for (const p of COVER_PRESETS) assert.ok(p.label.trim(), p.key);
});

test('each stored value is a preset path the database accepts and that resolves back to its key', () => {
  const keys = COVER_PRESETS.map((p) => p.key);
  for (const p of COVER_PRESETS) {
    assert.equal(isPresetCoverUrl(p.stored), true, p.stored);
    assert.equal(resolveCoverKey(p.stored, keys), p.key);
  }
});

test('the first preset is the signup default', () => {
  assert.equal(COVER_PRESETS[0].stored, '/Images/Cover%20images/163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG');
});
