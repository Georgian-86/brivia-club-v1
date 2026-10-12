// Preset cover name resolution (cover-assets.js), incl. legacy Vite-hashed stored values. Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCoverKey } from '../../cover-name.js';

const keys = [
  '163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG',
  '13DB55C5-4630-4EDC-8094-56FD22BD6331.PNG',
  '2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg',
  'b66eff76-068e-4f2a-b789-a27051a11f5a.png',
];

test('resolves the stored original path (URL-encoded space)', () => {
  assert.equal(resolveCoverKey('/Images/Cover%20images/163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG', keys), '163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG');
});

test('resolves a legacy Vite-hashed stored value from a live profile row', () => {
  assert.equal(resolveCoverKey('/assets/163BDB0C-64AC-44E7-8663-55C323ADB4FE-Bcr88PbJ.PNG', keys), '163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG');
});

test('resolves hashes that contain - and _', () => {
  assert.equal(resolveCoverKey('/assets/13DB55C5-4630-4EDC-8094-56FD22BD6331-rU8-vS88.PNG', keys), '13DB55C5-4630-4EDC-8094-56FD22BD6331.PNG');
  assert.equal(resolveCoverKey('/assets/b66eff76-068e-4f2a-b789-a27051a11f5a-_8bEOSUy.png', keys), 'b66eff76-068e-4f2a-b789-a27051a11f5a.png');
  assert.equal(resolveCoverKey('/assets/2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg-BhBlO2OP.jpeg', keys), '2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg');
});

test('resolves a hashed optimized .webp build URL to the same preset', () => {
  assert.equal(resolveCoverKey('/assets/163BDB0C-64AC-44E7-8663-55C323ADB4FE-Ab12_-Cd.webp', keys), '163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG');
  assert.equal(resolveCoverKey('/assets/2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg-Ab12Cd34.webp', keys), '2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg');
});

test('matches case-sensitively and returns null for unknown names', () => {
  assert.equal(resolveCoverKey('/assets/163bdb0c-64ac-44e7-8663-55c323adb4fe-Bcr88PbJ.png', keys), null);
  assert.equal(resolveCoverKey('/assets/other-Bcr88PbJ.PNG', keys), null);
  assert.equal(resolveCoverKey('', keys), null);
});
