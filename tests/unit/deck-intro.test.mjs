// D-162: the deck's arrival (deck-intro.js) and its "deal" cue (notify-sound.js INTRO_CUE). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { INTRO, introLength, introAllowed } from '../../site/scripts/deck-intro.js';
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

test('the intro is brief: about a second, the motion itself under 0.9 s', () => {
  const total = introLength();
  assert.ok(total > 0.8 && total <= 1.3, `total ${total}`);
  const motion = Math.max(...INTRO.layers.map((l) => l.at + l.dur));
  assert.ok(motion <= 0.9, `motion ${motion}`);
});

test('the stack is dealt back to front, each card from further down, the top card last', () => {
  assert.equal(INTRO.layers.length, 3);
  INTRO.layers.forEach((l, i, a) => {
    if (!i) return;
    assert.ok(l.at > a[i - 1].at, 'staggered');
    assert.ok(l.from.y > a[i - 1].from.y, 'from further down');
  });
  assert.ok(INTRO.land > INTRO.layers.at(-1).at, 'the stack lands after the top card is dealt');
});

test('the sound follows the motion: one tap per card, in order, then the bell as the stack settles', () => {
  assert.equal(INTRO_CUE.taps.length, INTRO.layers.length);
  INTRO_CUE.taps.forEach((t, i) => {
    const deal = INTRO.layers[i].at;
    assert.ok(t > deal && t < deal + 0.2, `tap ${i} lands within 0.2 s of its card`);
  });
  assert.ok(INTRO_CUE.bells[0].at >= INTRO.land - 0.05 && INTRO_CUE.bells[0].at <= INTRO.land + 0.1, 'bell on the landing');
  const end = Math.max(...INTRO_CUE.bells.map((b) => b.at + b.dur));
  assert.ok(end < INTRO_CUE.length && INTRO_CUE.length <= 1.5, 'short');
  assert.ok(INTRO_CUE.level < 0.7, 'quieter than the swipe cues');
});

test('the intro plays once, only for a visible deck with a card', () => {
  assert.equal(introAllowed({ cardShown: true, viewShown: true }), true);
  assert.equal(introAllowed({ played: true, cardShown: true, viewShown: true }), false);
  assert.equal(introAllowed({ cardShown: false, viewShown: true }), false, 'skeleton or empty state');
  assert.equal(introAllowed({ cardShown: true, viewShown: false }), false, 'another tab is open');
  assert.equal(introAllowed({ cardShown: true, viewShown: true, pageVisible: false }), false, 'background tab');
});

test('the deal cue renders without throwing and uses taps (noise + thump) and bells (sine)', () => {
  const log = { osc: [], buffers: [] };
  const ctx = new (fakeAudio(log).AudioContext)();
  assert.doesNotThrow(() => renderIntroCue(ctx, ctx.destination, 0));
  assert.equal(log.buffers.length, 3, 'one noise tap per card');
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
