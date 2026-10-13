// Phase E Task 4: the pure parts of interest picking (interest-tray.js). Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickedText, togglePick, canContinue, trayAnnouncement, flipTransform, MAX_PICKS } from '../../interest-tray.js';

const tennis = { id: 'sports.racket.tennis', label: 'Tennis', sensitive: false };
const chess = { id: 'games.board.chess', label: 'Chess', sensitive: false };
const scripture = { id: 'wellbeing.spirituality.scripture_study', label: 'Scripture study', sensitive: true };

test('pickedText is "n picked"', () => {
  assert.equal(pickedText(0), '0 picked');
  assert.equal(pickedText(1), '1 picked');
  assert.equal(pickedText(12), '12 picked');
});

test('togglePick adds, removes and refuses a 13th pick', () => {
  const one = togglePick([], tennis);
  assert.equal(one.result, 'added');
  assert.deepEqual(one.picks.map((p) => p.id), [tennis.id]);
  const two = togglePick(one.picks, chess);
  assert.deepEqual(two.picks.map((p) => p.label), ['Tennis', 'Chess']);
  const back = togglePick(two.picks, tennis);
  assert.equal(back.result, 'removed');
  assert.deepEqual(back.picks.map((p) => p.label), ['Chess']);
  assert.notEqual(back.picks, two.picks, 'never mutates');
  assert.equal(two.picks.length, 2);
  const full = Array.from({ length: MAX_PICKS }, (_, i) => ({ id: `x.${i}`, label: `X${i}`, sensitive: false }));
  const capped = togglePick(full, tennis);
  assert.equal(capped.result, 'full');
  assert.equal(capped.picks, full);
  assert.equal(togglePick(full, full[3]).result, 'removed', 'a full tray still removes');
  assert.equal(MAX_PICKS, 12);
});

test('canContinue needs at least one non-sensitive pick', () => {
  assert.equal(canContinue([]), false);
  assert.equal(canContinue([scripture]), false);
  assert.equal(canContinue([scripture, tennis]), true);
  assert.equal(canContinue([tennis]), true);
});

test('trayAnnouncement says what changed', () => {
  assert.equal(trayAnnouncement('Tennis', 'added'), 'Tennis added');
  assert.equal(trayAnnouncement('Tennis', 'removed'), 'Tennis removed');
});

test('flipTransform moves and scales one rect onto another (origin top left)', () => {
  const from = { left: 10, top: 20, width: 100, height: 40 };
  const to = { left: 60, top: 220, width: 50, height: 40 };
  assert.equal(flipTransform(from, to), 'translate(50px, 200px) scale(0.5, 1)');
  assert.equal(flipTransform(from, from), 'translate(0px, 0px) scale(1, 1)');
  assert.equal(flipTransform(from, { left: 10, top: 20, width: 0, height: 0 }), 'translate(0px, 0px) scale(1, 1)', 'a zero rect never scales to 0');
});

test('fitNewest keeps whole picks only, newest first, leaving room for "+n more"', async () => {
  const { fitNewest } = await import('../../interest-tray.js');
  assert.deepEqual(fitNewest([80, 80, 80], 300, 8, 90), { visible: 3, hidden: 0 }, 'all fit: no button');
  // 4 picks of 80 need 344: with the 90 px button only the newest two fit (80+8+80+8+90 = 266; three would be 354).
  assert.deepEqual(fitNewest([80, 80, 80, 80], 300, 8, 90), { visible: 2, hidden: 2 });
  assert.deepEqual(fitNewest([200, 60, 260], 300, 8, 90), { visible: 0, hidden: 3 }, 'a newest pick wider than the room hides behind the button');
  assert.deepEqual(fitNewest([], 300, 8, 90), { visible: 0, hidden: 0 });
});

test('parseMs reads a motion token, else the fallback', async () => {
  const { parseMs } = await import('../../interest-tray.js');
  assert.equal(parseMs('150ms', 1), 150);
  assert.equal(parseMs(' 0.2s ', 1), 200);
  assert.equal(parseMs('0ms', 1), 0);
  assert.equal(parseMs('', 220), 220);
  assert.equal(parseMs('fast', 220), 220);
});
