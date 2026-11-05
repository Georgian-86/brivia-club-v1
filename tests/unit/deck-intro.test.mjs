// D-164 / D-174: the deck's arrival (a shuffle, then the deal) (deck-intro.js) and its "deal" cue (notify-sound.js INTRO_CUE). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { INTRO, introLength, introAllowed, riffleOrder, riffleLandings } from '../../site/scripts/deck-intro.js';
import { INTRO_CUE, renderIntroCue, createSoundKit } from '../../site/scripts/notify-sound.js';

const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
const node = (extra = {}) => ({ connect: (x) => x, ...extra });
const fakeAudio = (log) => {
  const make = (rate = 44100) => ({
    currentTime: 0, sampleRate: rate, destination: node(), state: 'suspended',
    resume() { this.state = 'running'; return Promise.resolve(); },
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ type: '', frequency: param(), Q: param() }),
    createOscillator: () => { const o = node({ type: '', frequency: param(), start() { log.osc.push(o.type); }, stop() {} }); return o; },
    createBuffer: (ch, len) => ({ length: len, getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => { const s = node({ buffer: null, start() { log.buffers.push(s.buffer); }, stop() {} }); return s; },
  });
  function AudioContext() { return make(); }
  function OfflineAudioContext(ch, len, rate) { const c = make(rate); c.startRendering = () => Promise.resolve({ rendered: true, len }); return c; }
  return { AudioContext, OfflineAudioContext };
};
const fakeDoc = () => { const l = {}; return { addEventListener: (t, fn) => { (l[t] ||= []).push(fn); }, fire: (t, e = {}) => (l[t] || []).forEach((fn) => fn({ type: t, ...e })) }; };

test('the shuffle is a moment, not a wait: under 3.7 s in all, the cards dealt by 3.1 s (D-187 adds a 0.6 s hold)', () => {
  const total = introLength();
  assert.ok(total > 3 && total <= 3.7, `total ${total}`);
  const dealt = Math.max(...INTRO.layers.map((l) => l.at + l.dur));
  assert.ok(dealt <= 3.1, `dealt ${dealt}`);
});

test('the beats run in order: pack, split, riffle, square, deal', () => {
  const p = INTRO.pack, sp = INTRO.split, r = INTRO.riffle, sq = INTRO.square;
  assert.ok(sp.at >= p.at + p.dur, 'split after the pack has risen');
  assert.ok(INTRO.gather.at >= p.at + p.dur + 0.3, 'the fanned pack holds long enough to read');
  assert.ok(sp.at >= INTRO.gather.at + INTRO.gather.dur, 'the fan gathers before the split');
  assert.equal(INTRO.fan.angles.length, 4, 'two cards fanned each side');
  assert.ok(r.at >= sp.at + sp.dur, 'riffle after the split');
  assert.ok(sq.at >= Math.max(...riffleLandings()) - 0.01, 'square after the last card lands');
  assert.ok(INTRO.layers[0].at >= sq.at + sq.dur, 'deal after the pack is square');
  assert.ok(INTRO.flip.at + INTRO.flip.dur <= INTRO.layers[2].at + 0.01, 'the pack card is edge-on when the top card turns up');
  assert.ok(INTRO.land > INTRO.layers[2].at, 'the stack lands after the top card turns up');
});

test('a real riffle: every pack card once, bottom cards first, alternating halves', () => {
  const order = riffleOrder();
  assert.equal(order.length, INTRO.pack.count);
  assert.deepEqual([...new Set(order.map((o) => o.card))].sort((a, b) => a - b), [...Array(INTRO.pack.count).keys()]);
  order.forEach((o, k) => { if (k) { assert.notEqual(o.side, order[k - 1].side, 'alternating'); assert.ok(o.at > order[k - 1].at); } });
  assert.equal(order[0].card, Math.ceil(INTRO.pack.count / 2), 'the right half bottom card falls first');
});

test('the back cards are dealt back to front, the top card flips face up last', () => {
  assert.equal(INTRO.layers.length, 3);
  assert.ok(INTRO.layers[1].at > INTRO.layers[0].at && INTRO.layers[2].at > INTRO.layers[1].at, 'staggered');
  assert.ok(Math.abs(INTRO.layers[2].from.rotationY) >= 80, 'the top card turns from edge-on');
});

test('the sound follows the motion: a tick per riffled card, a tap per dealt card, the bell on the landing', () => {
  assert.deepEqual([...INTRO_CUE.ticks], riffleLandings(), 'one tick as each card lands');
  assert.ok(Math.abs(INTRO_CUE.swish.at - INTRO.split.at) < 0.05, 'the swish on the split');
  assert.ok(INTRO_CUE.square >= INTRO.square.at && INTRO_CUE.square <= INTRO.square.at + 0.08, 'the square-up tap');
  assert.equal(INTRO_CUE.taps.length, INTRO.layers.length);
  INTRO_CUE.taps.forEach((t, i) => {
    const deal = INTRO.layers[i].at;
    assert.ok(t > deal && t < deal + 0.2, `tap ${i} lands within 0.2 s of its card`);
  });
  assert.ok(INTRO_CUE.bells[0].at >= INTRO.land - 0.05 && INTRO_CUE.bells[0].at <= INTRO.land + 0.1, 'bell on the landing');
  const end = Math.max(...INTRO_CUE.bells.map((b) => b.at + b.dur));
  assert.ok(end < INTRO_CUE.length && INTRO_CUE.length <= 4.2, 'ends with the motion');
  assert.ok(INTRO_CUE.level < 0.7, 'quieter than the swipe cues');
});

test('the intro plays once, only for a visible deck with a card', () => {
  assert.equal(introAllowed({ cardShown: true, viewShown: true }), true);
  assert.equal(introAllowed({ played: true, cardShown: true, viewShown: true }), false);
  assert.equal(introAllowed({ cardShown: false, viewShown: true }), false, 'skeleton or empty state');
  assert.equal(introAllowed({ cardShown: true, viewShown: false }), false, 'another tab is open');
  assert.equal(introAllowed({ cardShown: true, viewShown: true, pageVisible: false }), false, 'background tab');
});

test('the shuffle cue renders without throwing: noise for the swish, ticks and taps; sine thumps and bells', () => {
  const log = { osc: [], buffers: [] };
  const ctx = new (fakeAudio(log).AudioContext)();
  assert.doesNotThrow(() => renderIntroCue(ctx, ctx.destination, 0));
  assert.equal(log.buffers.length, 1 + INTRO_CUE.ticks.length + 1 + 3, 'swish, a tick per riffled card, the square-up, a tap per dealt card');
  assert.ok(log.osc.length >= 3 + 4 && log.osc.every((t) => t === 'sine'));
});

test('autoplay rules: silent on a fresh load; plays after a tap or when the page is already allowed; follows the switch', async () => {
  const log = { osc: [], buffers: [] };
  const doc = fakeDoc();
  let on = true;
  const kit = createSoundKit({ win: fakeAudio(log), doc, nav: {}, interactions: () => on, volume: () => 80 });
  assert.equal(kit.unlockIfAllowed(), false, 'no gesture yet');
  assert.equal(kit.intro(), false);
  doc.fire('click');
  await kit.ready();
  assert.equal(kit.intro(), true);
  assert.equal(log.buffers.at(-1)?.rendered, true, 'pre-rendered');
  on = false;
  assert.equal(kit.intro(), false, 'swipe sounds off: no deal sound');

  const sticky = createSoundKit({ win: fakeAudio(log), doc: fakeDoc(), nav: { userActivation: { hasBeenActive: true } }, interactions: () => true, volume: () => 80 });
  assert.equal(sticky.unlockIfAllowed(), true, 'the page already had a gesture');
  const policy = createSoundKit({ win: fakeAudio(log), doc: fakeDoc(), nav: { getAutoplayPolicy: () => 'allowed' }, interactions: () => true, volume: () => 80 });
  assert.equal(policy.unlockIfAllowed(), true, 'the browser says audio may start');
  const silent = createSoundKit({ win: fakeAudio(log), doc: fakeDoc(), nav: {}, interactions: () => true, volume: () => 0 });
  silent.unlock();
  assert.equal(silent.intro(), false, 'volume 0');
});
