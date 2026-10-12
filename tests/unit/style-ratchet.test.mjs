// Style ratchet (Phase C): raw hex colours and font-family declarations may only go down per CSS file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { countStyleDebt, compareToBaseline } from '../../scripts/style-ratchet.js';

test('counts 6- and 3-digit hex, ignores hex inside comments', () => {
  const css = '/* #abc #123456 */ a{color:#fff;background:#5e0b28;border:1px solid #abcd;x:#11223344} b{color:var(--color-wine)}';
  assert.deepEqual(countStyleDebt(css), { hex: 4, fontFamily: 0 });
});

test('counts font-family but not font-family: var(--font-body) or inherit', () => {
  const css = "a{font-family:'Bodoni Moda',serif} b{font-family: var(--font-body)} c{font-family:inherit} d{font-family:Arial}";
  assert.deepEqual(countStyleDebt(css), { hex: 0, fontFamily: 2 });
});

test('a rise in one file fails with that file named', () => {
  const r = compareToBaseline(
    { 'a.css': { hex: 3, fontFamily: 0 }, 'b.css': { hex: 5, fontFamily: 1 } },
    { 'a.css': { hex: 3, fontFamily: 0 }, 'b.css': { hex: 4, fontFamily: 1 } },
  );
  assert.equal(r.ok, false);
  assert.deepEqual(r.increases, [{ file: 'b.css', kind: 'hex', from: 4, to: 5 }]);
});

test('a new file with any debt fails', () => {
  const r = compareToBaseline({ 'new.css': { hex: 0, fontFamily: 1 } }, {});
  assert.equal(r.ok, false);
  assert.deepEqual(r.increases, [{ file: 'new.css', kind: 'fontFamily', from: 0, to: 1 }]);
});

test('lower counts pass', () => {
  const r = compareToBaseline({ 'a.css': { hex: 1, fontFamily: 0 }, 'new.css': { hex: 0, fontFamily: 0 } }, { 'a.css': { hex: 9, fontFamily: 2 } });
  assert.deepEqual(r, { ok: true, increases: [] });
});
