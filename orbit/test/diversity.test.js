// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { seededFloat } from '../src/diversity.js';

test('minor: seededFloat is u32 / 2**32, so it lies in [0, 1) and can never be 1.0', () => {
  for (const parts of [['a'], ['s1', 'eps'], ['seed7', 'pick'], ['x', 'slot']]) {
    const u = createHash('md5').update(parts.join('|')).digest().readUInt32BE(0);
    assert.equal(seededFloat(...parts), u / 2 ** 32, parts.join('|'));
  }
  assert.ok(0xffffffff / 2 ** 32 < 1); // the largest u32 maps strictly below 1
  for (let i = 0; i < 2000; i++) { const v = seededFloat('k', i); assert.ok(v >= 0 && v < 1); }
});
