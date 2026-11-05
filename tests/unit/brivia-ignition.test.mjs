// D-186: the Brivia ignition (brivia-ignition.js + ignition.css): the landing intro and the loading screen.
// Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IGNITION, IGNITION_CUE, IGNITION_WORD, ignitionMarkup, lettersDone, renderIgnitionCue, createIgnitionSound } from '../../site/scripts/brivia-ignition.js';
import { INTRO_CAP_MS } from '../../site/scripts/landing-motion.js';

const css = readFileSync(new URL('../../site/styles/ignition.css', import.meta.url), 'utf8');
const prop = (name) => Number((css.match(new RegExp(`--ign-${name}:\\s*([\\d.]+)s`)) || [])[1]);

test('the CSS runs on the same clock as IGNITION (the music is timed from these)', () => {
  assert.equal(prop('total'), IGNITION.total);
  assert.equal(prop('ignite'), IGNITION.ignite);
  assert.equal(prop('reveal'), IGNITION.reveal);
  assert.equal(prop('letter-at'), IGNITION.letters.at);
  assert.equal(prop('letter-step'), IGNITION.letters.step);
  assert.equal(prop('letter-dur'), IGNITION.letters.dur);
  const pct = (s) => `${Math.round((s / IGNITION.total) * 1000) / 10}%`;
  assert.ok(css.includes(`${pct(IGNITION.ignite)} {`), `the point flares at ${pct(IGNITION.ignite)}`);
  assert.ok(css.includes(`${pct(IGNITION.reveal)} {`), `the streak is full at ${pct(IGNITION.reveal)}`);
});

test('the order: light, ignition, streak, then the name from the centre; all inside the landing cap', () => {
  assert.ok(IGNITION.ignite < IGNITION.letters.at && IGNITION.letters.at < IGNITION.reveal, 'letters start as the streak is still opening');
  assert.ok(lettersDone() < IGNITION.total, `name complete at ${lettersDone()} s, before the ${IGNITION.total} s pass ends`);
  assert.ok(IGNITION.total * 1000 + 450 <= INTRO_CAP_MS, 'the title and its fade fit the 2.5 s intro cap');
});

test('the markup: one letter span per character, centre first, aria-hidden, no video', () => {
  const html = ignitionMarkup();
  assert.match(html, /^<div class="ignition" aria-hidden="true">/);
  const letters = [...html.matchAll(/--d:(\d+);--s:(-?\d+)">(.)</g)].map((m) => ({ d: Number(m[1]), s: Number(m[2]), ch: m[3] }));
  assert.equal(letters.map((l) => l.ch).join(''), IGNITION_WORD.replace(/ /g, ''));
  assert.equal(Math.min(...letters.map((l) => l.d)), 0, 'a centre letter');
  assert.ok(letters.filter((l) => l.d === 0).every((l) => l.s === 0));
  assert.doesNotMatch(html, /<video|<img/);
  ['site/index.html', 'site/app.html', 'site/auth.html'].forEach((page) => {
    const text = readFileSync(new URL(`../../${page}`, import.meta.url), 'utf8');
    assert.ok(text.includes(html), `${page} carries the same title`);
    assert.doesNotMatch(text, /intro-video/, `${page} has no intro video`);
  });
});

test('the music lands on the picture: spark on the ignition, hit and chord on the reveal, bells after', () => {
  assert.equal(IGNITION_CUE.spark.at, IGNITION.ignite);
  assert.equal(IGNITION_CUE.hit.at, IGNITION.reveal);
  assert.equal(IGNITION_CUE.chord.at, IGNITION.reveal);
  assert.ok(IGNITION_CUE.riser.to <= IGNITION.reveal && IGNITION_CUE.riser.to > IGNITION.reveal - 0.1, 'the riser cuts just before the hit');
  IGNITION_CUE.bells.forEach((b, i, a) => { assert.ok(b.at > IGNITION.reveal); if (i) assert.ok(b.at > a[i - 1].at); });
  assert.deepEqual(IGNITION_CUE.chord.notes.map((m) => m % 12), [10, 2, 5, 0, 5], 'B-flat add 9: the sound kit\'s key');
  assert.ok(IGNITION_CUE.length <= 6.5, 'the cue rings out under the 4 s title, not long after (D-190)');
});

const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
const node = (extra = {}) => ({ connect: (x) => x, ...extra });
const fakeCtx = (log, { convolver = true } = {}) => ({
  currentTime: 0, sampleRate: 8000, state: 'running', destination: node(),
  createGain: () => node({ gain: param() }),
  createBiquadFilter: () => node({ type: '', frequency: param(), Q: param() }),
  createOscillator: () => node({ type: '', frequency: param(), detune: param(), start() { log.osc += 1; }, stop() {} }),
  createBuffer: (ch, len) => ({ length: len, getChannelData: () => new Float32Array(len) }),
  createBufferSource: () => node({ buffer: null, start(at, offset) { log.sources.push({ at, offset }); }, stop() {} }),
  createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
  ...(convolver ? { createConvolver: () => node({ buffer: null }) } : {}),
});

test('the cue renders (with or without a reverb) and voices every part', () => {
  const log = { osc: 0, sources: [] };
  assert.doesNotThrow(() => renderIgnitionCue(fakeCtx(log), node(), 0));
  const voices = IGNITION_CUE.swell.notes.length + 1 + 1 + IGNITION_CUE.chord.notes.length * 3 + IGNITION_CUE.bells.length * 2;
  assert.equal(log.osc, voices);
  assert.equal(log.sources.length, 1, 'one riser');
  assert.doesNotThrow(() => renderIgnitionCue(fakeCtx({ osc: 0, sources: [] }, { convolver: false }), node(), 0));
});

test('played part-way from a tap during the intro, never after the reveal; silent when audio is not running', () => {
  const log = { osc: 0, sources: [] };
  const sound = createIgnitionSound({ win: {} });
  const ctx = fakeCtx(log);
  assert.equal(sound.play(ctx, ctx.destination, { offset: 0.3 }), true);
  assert.equal(sound.play(ctx, ctx.destination, { offset: IGNITION.reveal + 0.1 }), false, 'too late for the hit');
  assert.equal(sound.play({ ...ctx, state: 'suspended' }, ctx.destination), false);
});
