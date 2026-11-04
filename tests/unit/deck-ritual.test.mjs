// D-173: the deck ritual's choreography (pure). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RITUAL, introLandings, introRiseAt, introTotal, riffleOrder, completeLandings, completeSquareAt, completeTotal,
  stackPose, poseTransform, introFrom, spreadPose, spreadReach, springEasing, completionCopy, introDue, markIntroPlayed, INTRO_KEY,
} from '../../site/scripts/deck-ritual.js';
import { RITUAL_CUES } from '../../site/scripts/notify-sound.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('the intro lands deepest first, one back every 120 ms, then the top card rises; about 1.7 s in all', () => {
  const lands = introLandings();
  assert.equal(lands.length, RITUAL.backs);
  lands.slice(1).forEach((t, i) => assert.equal(t - lands[i], RITUAL.introStagger));
  assert.ok(introRiseAt() > lands.at(-1));
  assert.ok(introTotal() >= 1400 && introTotal() <= 2000, `intro ${introTotal()} ms`);
});

test('the completion shuffle is fast, like Solitaire (D-174): two riffles; the cards are squared by about 1.1 s, the message shows by 1.7 s', () => {
  const total = completeTotal();
  assert.ok(total >= 1000 && total <= 1700, `shuffle ${total} ms`);
  assert.ok(completeSquareAt() <= 1200, `squared at ${completeSquareAt()} ms`);
  assert.equal(completeLandings().length, RITUAL.backs * RITUAL.riffles);
  const lands = completeLandings();
  lands.slice(1).forEach((t, i) => assert.ok(t > lands[i], 'every card lands after the one before'));
  assert.ok(RITUAL.gatherStagger <= 40, 'cards drop in quick succession');
  assert.ok(completeSquareAt() >= Math.max(...lands));
});

test('the riffle interleaves the two halves and keeps every card exactly once', () => {
  assert.deepEqual(riffleOrder(5), [0, 3, 1, 4, 2]);
  assert.deepEqual(riffleOrder(4), [0, 2, 1, 3]);
  [3, 5, 6, 7].forEach((n) => assert.deepEqual([...riffleOrder(n)].sort((a, b) => a - b), [...Array(n).keys()]));
});

test('the stack is squared, not a pile: small offsets and turns, deeper cards lower and smaller', () => {
  const top = stackPose(0);
  assert.deepEqual({ x: top.x, y: top.y, r: top.r, s: top.s }, { x: 0, y: 0, r: 0, s: 1 });
  for (let d = 1; d < RITUAL.backs; d += 1) {
    const p = stackPose(d);
    assert.ok(Math.abs(p.x) <= 4 && Math.abs(p.r) <= 2.5, JSON.stringify(p));
    assert.ok(p.y > stackPose(d - 1).y && p.s < stackPose(d - 1).s && p.z < stackPose(d - 1).z);
  }
  assert.equal(poseTransform({ x: 1, y: 2, z: -3, r: 4, s: 0.5 }), 'translate3d(1px, 2px, -3px) rotate(4deg) scale(0.5)');
});

test('intro arrivals come from different sides; the fan is symmetric with no wild spin', () => {
  const sides = new Set(Array.from({ length: 5 }, (_, i) => `${Math.sign(introFrom(i, 400, 600).x)},${Math.sign(introFrom(i, 400, 600).y)}`));
  assert.ok(sides.size >= 4, [...sides].join(' '));
  for (let i = 0; i < 5; i += 1) assert.ok(Math.abs(introFrom(i, 400, 600).r) <= 18);
  const fan = Array.from({ length: 5 }, (_, i) => spreadPose(i, 5, 400, 600));
  assert.equal(fan[2].x, 0);
  assert.equal(fan[0].x, -fan[4].x);
  assert.equal(fan[0].r, -fan[4].r);
  fan.forEach((p) => assert.ok(Math.abs(p.r) <= 12));
});

test('the spring easing settles at 1 with a small overshoot (no bounce)', () => {
  const values = springEasing().replace(/^linear\(|\)$/g, '').split(',').map(Number);
  assert.equal(values[0], 0);
  assert.equal(values.at(-1), 1);
  const peak = Math.max(...values);
  assert.ok(peak > 1 && peak < 1.08, `peak ${peak}`);
  const dips = values.filter((v, i) => i > 0 && i < values.length - 1 && v > values[i - 1] && v > values[i + 1]);
  assert.ok(dips.length <= 1, 'one gentle overshoot, not a bounce');
});

test('the completion words, with the refresh time only when the server gave one', () => {
  const words = completionCopy({ resets_at: '2026-11-04T15:00:00Z' });
  assert.equal(words.title, "That's your deck for today.");
  assert.equal(words.copy, "You've met everyone waiting in your deck. Good things take a little time.");
  assert.match(words.refresh, /^Fresh swipes at \d{1,2}(:\d\d)?\s?[AP]M$/i);
  assert.equal(completionCopy(null).refresh, 'Fresh swipes arrive within 24 hours');
});

test('the intro plays once per visit (session storage), and a broken storage never blocks the deck', () => {
  const s = memory();
  assert.equal(introDue(s), true);
  markIntroPlayed(s);
  assert.equal(introDue(s), false);
  assert.equal(s.getItem(INTRO_KEY), 'played');
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(introDue(broken), true);
  assert.doesNotThrow(() => markIntroPlayed(broken));
});

test('the shuffle cue is timed to the choreography and quieter than a swipe', () => {
  const { complete } = RITUAL_CUES;
  assert.equal(RITUAL_CUES.deal, undefined, 'the opening deal is D-164 (deck-intro.js), not a ritual cue');
  const resolution = complete.notes.at(-1);
  assert.equal(resolution.midi, 70, 'the deck resolves home, on B-flat');
  assert.ok(Math.abs(complete.notes[0].at * 1000 - completeSquareAt()) <= 1);
  [complete].forEach((c) => {
    assert.ok(c.level <= 0.6);
    [...c.keys, ...c.notes].forEach((n) => assert.ok(n.gain <= 0.45, JSON.stringify(n)));
  });
});

test('the fan stays on screen: full reach on a desktop, narrower on a phone', () => {
  assert.equal(spreadReach(400, 1440), 0.42);
  const phone = spreadReach(360, 390);
  assert.ok(phone < 0.3 && phone >= 0.16, String(phone));
  const outer = spreadPose(4, 5, 360, 560, phone);
  assert.ok(outer.x + 360 / 2 <= 390 / 2 + 360 * 0.45, 'the outer card keeps most of itself on screen');
});
