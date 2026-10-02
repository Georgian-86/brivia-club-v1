// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, DEFAULTS } from '../src/config.js';

test('defaults expose spec values', () => {
  assert.deepEqual(loadConfig().theta, [0.15, 0.25, 0.40, 0.62, 0.74, 0.82]);
  assert.equal(loadConfig().mode.learn.teach, 1.15);
  assert.equal(loadConfig().rings[5], Infinity);
  assert.equal(DEFAULTS.h3Res, 7);
});

test('overrides win and result is frozen', () => {
  assert.equal(loadConfig({ gamma: 2 }).gamma, 2);
  assert.equal(loadConfig({ deck: { base: 20 } }).deck.epsilon, 0.15);
  assert.ok(Object.isFrozen(loadConfig()));
  assert.ok(Object.isFrozen(loadConfig().deck));
});

test('ORBIT_CONFIG_PATH file overrides defaults, overrides override file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-'));
  const p = join(dir, 'c.json');
  writeFileSync(p, '{"thetaFar":0.9,"gamma":1.5}');
  process.env.ORBIT_CONFIG_PATH = p;
  try {
    assert.equal(loadConfig().thetaFar, 0.9);
    assert.equal(loadConfig({ gamma: 2 }).gamma, 2);
    assert.equal(loadConfig().gamma, 1.5);
  } finally {
    delete process.env.ORBIT_CONFIG_PATH;
  }
  assert.equal(loadConfig().thetaFar, 0.86);
});

test('I4: every scoring/explain/ring cut-off constant lives in config with the spec defaults', () => {
  const c = loadConfig();
  assert.deepEqual(c.score, { coPresenceBase: 0.85, coPresenceSpan: 0.15, coPresenceMaxRing: 2, behaviourBase: 0.8, behaviourSpan: 0.2, tasteMin: 0.75, tasteMax: 1.3 });
  assert.deepEqual(c.semantic, { cosFloor: 0.1, cosSpan: 0.55 });
  assert.deepEqual(c.explain, { rareMinRarity: 0.7, rareMinPoints: 4, coPresenceChipMaxRing: 1, maxChips: 3 });
  assert.equal(c.wtdMinRing, 3);
  assert.equal(c.deck.localMaxRing, 2);
  assert.equal(c.deck.exploreTailFactor, 4);
});
