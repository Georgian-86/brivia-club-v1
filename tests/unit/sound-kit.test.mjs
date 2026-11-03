// D-137: the Brivia sound kit (notification, pass, pitch) and the bio word limit. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSoundKit, interactionSoundEnabled, setInteractionSoundEnabled, pushSoundEnabled, setPushSoundEnabled, CUES, soundEnabled, setSoundEnabled, soundVolume, setSoundVolume, volumeGain, DEFAULT_VOLUME, renderCue,
} from '../../site/scripts/notify-sound.js';
import { countWords, bioWords, BIO_WORDS_MAX } from '../../site/scripts/profile-edit.js';

// A fake Web Audio graph: records every oscillator start (its frequency) and every buffer started.
const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
const node = (extra = {}) => ({ connect: (x) => x, ...extra });
const fakeAudio = (log) => {
  const make = (rate = 44100) => ({
    currentTime: 0, sampleRate: rate, destination: node(), state: 'suspended',
    resume() { this.state = 'running'; return Promise.resolve(); },
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ type: '', frequency: param(), Q: param() }),
    createDelay: () => node({ delayTime: param() }),
    createOscillator: () => { const o = node({ type: '', frequency: param(), start() { log.osc.push(o.type); }, stop() {} }); return o; },
    createBuffer: (ch, len) => ({ length: len, getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => { const s = node({ buffer: null, start() { log.buffers.push(s.buffer); }, stop() {} }); return s; },
  });
  function AudioContext() { return make(); }
  function OfflineAudioContext(ch, len, rate) { const c = make(rate); c.startRendering = () => Promise.resolve({ rendered: true, len }); return c; }
  return { AudioContext, OfflineAudioContext };
};
const fakeDoc = () => { const l = {}; return { l, addEventListener: (t, fn) => { (l[t] ||= []).push(fn); }, fire: (t, e = {}) => (l[t] || []).forEach((fn) => fn({ type: t, ...e })) }; };

test('three cues, one voice: the notification is the longest, pass is the darkest and lowest, pitch the brightest', () => {
  assert.deepEqual(Object.keys(CUES).sort(), ['notify', 'pass', 'pitch']);
  const top = (c) => Math.max(...c.notes.map((n) => n.midi));
  const end = (c) => Math.max(...c.notes.map((n) => n.at + n.dur));
  const bright = (c) => Math.max(...c.notes.map((n) => n.bright || 0));
  assert.ok(end(CUES.notify) > end(CUES.pitch) && end(CUES.notify) > end(CUES.pass));
  assert.ok(bright(CUES.pass) < bright(CUES.pitch));
  assert.ok(CUES.pass.notes.at(-1).fall < 0, 'pass droops');
  assert.ok(CUES.pitch.notes.every((n, i, a) => i === 0 || n.midi > a[i - 1].midi), 'pitch climbs');
  assert.ok(top(CUES.pass) <= top(CUES.pitch));
  for (const c of Object.values(CUES)) assert.ok(end(c) < c.length && c.length <= 2, 'short');
});

test('nothing plays before a real gesture; a touchstart or touch pointerdown is not one', async () => {
  const log = { osc: [], buffers: [] };
  const doc = fakeDoc();
  const kit = createSoundKit({ win: fakeAudio(log), doc, nav: {}, enabled: () => true, volume: () => 70 });
  assert.equal(kit.notify('n1'), false);
  doc.fire('pointerdown', { pointerType: 'touch' });
  assert.equal(kit.isUnlocked(), false);
  doc.fire('touchend');
  assert.equal(kit.isUnlocked(), true);
  await kit.ready();
  assert.equal(kit.notify('n1'), true);
  assert.equal(log.buffers.at(-1)?.rendered, true, 'played from the pre-rendered buffer');
});

test('a notification id plays once; a swipe cue once per swipe; off and zero volume are silent', async () => {
  const log = { osc: [], buffers: [] };
  const doc = fakeDoc();
  let on = true; let vol = 70; let t = 1000;
  const kit = createSoundKit({ win: fakeAudio(log), doc, nav: {}, enabled: () => on, interactions: () => on, volume: () => vol, now: () => t });
  doc.fire('click');
  await kit.ready();
  assert.equal(kit.notify('a'), true);
  assert.equal(kit.notify('a'), false);
  assert.equal(kit.swipe('pass'), true);
  assert.equal(kit.swipe('pass'), false, 'the same swipe reported twice');
  t += 400;
  assert.equal(kit.swipe('pass'), true, 'the next swipe');
  assert.equal(kit.swipe('pitch'), true);
  assert.equal(kit.swipe('sideways'), false);
  vol = 0; t += 400;
  assert.equal(kit.swipe('pitch'), false);
  vol = 70; on = false; t += 400;
  assert.equal(kit.notify('b'), false);
  assert.equal(kit.swipe('pass'), false);
});

test('before the buffers are ready the cue is synthesized live (the Brivia horn: sawtooth and square)', () => {
  const log = { osc: [], buffers: [] };
  const win = fakeAudio(log);
  delete win.OfflineAudioContext;
  const doc = fakeDoc();
  const kit = createSoundKit({ win, doc, nav: {}, enabled: () => true, volume: () => 50 });
  doc.fire('keydown', { key: 'a' });
  assert.equal(kit.swipe('pitch'), true);
  assert.ok(log.osc.includes('sawtooth') && log.osc.includes('square') && log.osc.includes('sine'));
  const ctx = new win.AudioContext();
  assert.doesNotThrow(() => renderCue(ctx, ctx.destination, CUES.notify));
});

test('iOS: the audio session mixes with the member’s music', () => {
  const nav = {};
  const doc = fakeDoc();
  createSoundKit({ win: fakeAudio({ osc: [], buffers: [] }), doc, nav, enabled: () => true });
  doc.fire('click');
  assert.equal(nav.audioSession, undefined);   // no audioSession API: nothing set
  const nav2 = { audioSession: { type: 'auto' } };
  const doc2 = fakeDoc();
  createSoundKit({ win: fakeAudio({ osc: [], buffers: [] }), doc: doc2, nav: nav2, enabled: () => true });
  doc2.fire('click');
  assert.equal(nav2.audioSession.type, 'ambient');
});

test('one switch and one volume per device', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(soundEnabled(storage), true);
  setSoundEnabled(false, storage);
  assert.equal(soundEnabled(storage), false);
  assert.equal(soundVolume(storage), DEFAULT_VOLUME);
  setSoundVolume(135, storage);
  assert.equal(soundVolume(storage), 100);
  setSoundVolume(-4, storage);
  assert.equal(soundVolume(storage), 0);
  assert.equal(volumeGain(0), 0);
  assert.equal(volumeGain(100), 1);
  assert.ok(volumeGain(50) < 0.5);
  assert.ok(volumeGain(DEFAULT_VOLUME) > 0.7, 'loud enough on laptop speakers');
});

test('bio: words, not characters; spaces and line breaks never count; 1 to 20', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   \n  '), 0);
  assert.equal(countWords('Hi'), 1);
  assert.equal(countWords('  I   cook \n\n and   play  '), 4);
  assert.equal(countWords('Café ☕ lover'), 3);
  assert.deepEqual(bioWords('Hi'), { words: 1, over: false, empty: false, ok: true, label: '1/20 words', message: '' });
  assert.equal(bioWords('').ok, false);
  const twenty = Array.from({ length: BIO_WORDS_MAX }, (_, i) => `w${i}`).join('   ');
  assert.equal(bioWords(twenty).ok, true);
  assert.equal(bioWords(`${twenty} one-more`).ok, false);
  assert.equal(bioWords(`${twenty} one-more`).label, '21/20 words');
  assert.match(bioWords(`${twenty} x`).message, /20 words or fewer/);
  assert.equal(bioWords('a'.repeat(200)).words, 1, 'a long word is one word');
});

test('D-138: notification sound and swipe sounds are separate choices; the push sound choice reaches the worker', async () => {
  const log = { osc: [], buffers: [] };
  const doc = fakeDoc();
  let notes = true; let swipes = false; let t = 0;
  const kit = createSoundKit({ win: fakeAudio(log), doc, nav: {}, enabled: () => notes, interactions: () => swipes, volume: () => 80, now: () => (t += 500) });
  doc.fire('click');
  await kit.ready();
  assert.equal(kit.swipe('pass'), false, 'swipe sounds off');
  assert.equal(kit.notify('x'), true, 'the notification chime still plays');
  notes = false; swipes = true;
  assert.equal(kit.notify('y'), false);
  assert.equal(kit.swipe('pitch'), true);
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(interactionSoundEnabled(storage), true);
  setInteractionSoundEnabled(false, storage);
  assert.equal(interactionSoundEnabled(storage), false);
  const put = [];
  const cachesApi = { open: async (name) => ({ put: async (key, res) => put.push([name, key, await res.json()]) }) };
  assert.equal(pushSoundEnabled(storage), true);
  await setPushSoundEnabled(false, storage, cachesApi);
  assert.equal(pushSoundEnabled(storage), false);
  assert.deepEqual(put.at(-1), ['brivia-prefs', '/__brivia-prefs', { pushSilent: true }]);
  const { readFileSync } = await import('node:fs');
  const sw = readFileSync(new URL('../../site/public/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /caches\.open\('brivia-prefs'\)/);
  assert.match(sw, /'\/__brivia-prefs'/);
  assert.match(sw, /silent,/);
});
