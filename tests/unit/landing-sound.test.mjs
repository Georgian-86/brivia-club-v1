// Landing sound rules (D-063): when the music may start, the 5-minute limit, the saved mute choice and the bar clock.
// Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOUND_LIMIT_MS, soundPreference, soundPlan, isUnlockEvent, barsToSchedule } from '../../site/scripts/landing-sound.js';

test('the music plays for at most 5 minutes', () => {
  assert.equal(SOUND_LIMIT_MS, 5 * 60 * 1000);
});

test('soundPreference: on unless the visitor turned it off', () => {
  assert.equal(soundPreference(null), 'on');
  assert.equal(soundPreference('on'), 'on');
  assert.equal(soundPreference('off'), 'off');
  assert.equal(soundPreference('garbage'), 'on');
});

test('soundPlan: off wins, then the limit, then the unlock', () => {
  assert.equal(soundPlan({ preference: 'off', unlocked: true, playedMs: 0 }), 'off');
  assert.equal(soundPlan({ preference: 'on', unlocked: true, playedMs: SOUND_LIMIT_MS }), 'ended');
  assert.equal(soundPlan({ preference: 'on', unlocked: false, playedMs: 0 }), 'wait');
  assert.equal(soundPlan({ preference: 'on', unlocked: true, playedMs: SOUND_LIMIT_MS - 1 }), 'play');
  assert.equal(soundPlan({}), 'wait');
});

test('isUnlockEvent: only the gestures a browser accepts for starting audio', () => {
  // Browsers start audio on: keydown (not Escape), mousedown, pointerdown from a mouse, pointerup / touchend from a
  // finger or pen, click. A touchstart, a wheel or a scroll never unlocks audio (the old bug: touchstart once, on phones).
  assert.equal(isUnlockEvent({ type: 'pointerdown', pointerType: 'mouse' }), true);
  assert.equal(isUnlockEvent({ type: 'pointerdown', pointerType: 'touch' }), false);
  assert.equal(isUnlockEvent({ type: 'pointerup', pointerType: 'touch' }), true);
  assert.equal(isUnlockEvent({ type: 'pointerup', pointerType: 'pen' }), true);
  assert.equal(isUnlockEvent({ type: 'touchend' }), true);
  assert.equal(isUnlockEvent({ type: 'click' }), true);
  assert.equal(isUnlockEvent({ type: 'mousedown' }), true);
  assert.equal(isUnlockEvent({ type: 'keydown', key: 'ArrowDown' }), true);
  assert.equal(isUnlockEvent({ type: 'keydown', key: 'Escape' }), false);
  assert.equal(isUnlockEvent({ type: 'touchstart' }), false);
  assert.equal(isUnlockEvent({ type: 'wheel' }), false);
  assert.equal(isUnlockEvent({ type: 'scroll' }), false);
  assert.equal(isUnlockEvent(null), false);
});

test('barsToSchedule: queues bars on the audio clock ahead of time, never in the past, never twice', () => {
  // A 3.2 s bar, a 1 s look-ahead: the scheduler wakes often and queues every bar that starts before now + 1 s.
  assert.deepEqual(barsToSchedule({ now: 0, nextBarAt: 0.05, barLength: 3.2, lookahead: 1 }), [0.05]);
  assert.deepEqual(barsToSchedule({ now: 1, nextBarAt: 3.25, barLength: 3.2, lookahead: 1 }), []);
  assert.deepEqual(barsToSchedule({ now: 2.5, nextBarAt: 3.25, barLength: 3.2, lookahead: 1 }), [3.25]);
  // After a stall (tab throttled), late bars are dropped rather than played in a burst: start from now.
  assert.deepEqual(barsToSchedule({ now: 20, nextBarAt: 6.45, barLength: 3.2, lookahead: 1 }), [20.05]);
});

// D-220
import { initialPreference, soundButtonView, trackOffset, MAX_LOAD_ATTEMPTS, loadRetryDelayMs, silentWavDataUri } from '../../site/scripts/landing-sound.js';

test('initialPreference: a mute holds while navigating, a reload starts with music on again', () => {
  assert.equal(initialPreference({ stored: 'off', navigationType: 'navigate' }), 'off');
  assert.equal(initialPreference({ stored: 'off', navigationType: 'back_forward' }), 'off');
  assert.equal(initialPreference({ stored: 'off', navigationType: 'reload' }), 'on');
  assert.equal(initialPreference({ stored: null, navigationType: 'navigate' }), 'on');
  assert.equal(initialPreference({ stored: 'on', navigationType: 'reload' }), 'on');
  assert.equal(initialPreference(), 'on');
});

test('soundButtonView: the label always names the action the button will take', () => {
  assert.deepEqual(soundButtonView({ audible: true }), { state: 'playing', label: 'Stop music', text: 'Stop music' });
  assert.deepEqual(soundButtonView({ audible: true, waiting: true }).state, 'playing');
  // D-221: on by default; before the first touch the button shows ON, never "Play music".
  assert.deepEqual(soundButtonView({ waiting: true }), { state: 'armed', label: 'Music on: tap anywhere to hear it', text: 'Music on' });
  assert.deepEqual(soundButtonView({}), { state: 'stopped', label: 'Play music', text: 'Play music' });
});

test('trackOffset: the position inside the current pass, 0 when unknown or at the very end', () => {
  assert.equal(trackOffset({ now: 12.345, passStart: 10, duration: 17.6 }), 2.35);
  assert.equal(trackOffset({ now: 9, passStart: 10, duration: 17.6 }), 0);
  assert.equal(trackOffset({ now: 27.4, passStart: 10, duration: 17.6 }), 0);
  assert.equal(trackOffset({ now: 5, passStart: 0, duration: 0 }), 0);
});

test('loadRetryDelayMs: a growing pause, capped, and a bounded number of attempts', () => {
  assert.equal(MAX_LOAD_ATTEMPTS, 3);
  assert.equal(loadRetryDelayMs(1), 1000);
  assert.equal(loadRetryDelayMs(2), 2000);
  assert.equal(loadRetryDelayMs(3), 4000);
  assert.equal(loadRetryDelayMs(10), 8000);
});

test('silentWavDataUri: a valid, silent PCM WAV', () => {
  const uri = silentWavDataUri();
  assert.ok(uri.startsWith('data:audio/wav;base64,'));
  const bytes = Buffer.from(uri.split(',')[1], 'base64');
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
  assert.ok([...bytes.subarray(44)].every((b) => b === 128));
});

// D-223: Safari and every iPhone browser get the media-element path; Chrome, Edge and Firefox keep Web Audio.
test('prefersMediaElementAudio: WebKit only', async () => {
  const { prefersMediaElementAudio: pick } = await import('../../site/scripts/landing-sound.js');
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
  assert.equal(pick({ userAgent: `${mac} Version/18.1 Safari/605.1.15`, platform: 'MacIntel' }), true);
  assert.equal(pick({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }), true);
  assert.equal(pick({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1' }), true);
  assert.equal(pick({ userAgent: `${mac} Version/18.0 Safari/605.1.15`, platform: 'MacIntel', maxTouchPoints: 5 }), true); // iPad
  assert.equal(pick({ userAgent: `${mac.replace('605.1.15 (KHTML, like Gecko)', '537.36 (KHTML, like Gecko)')} Chrome/130.0.0.0 Safari/537.36`, platform: 'MacIntel' }), false);
  assert.equal(pick({ userAgent: `${mac} Chrome/130.0.0.0 Safari/537.36 Edg/130.0`, platform: 'MacIntel' }), false);
  assert.equal(pick({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0', platform: 'MacIntel' }), false);
  assert.equal(pick({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', platform: 'Win32' }), false);
  assert.equal(pick({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', platform: 'Linux armv8l' }), false);
  assert.equal(pick({}), false);
});

test('wavBytes: a valid 16-bit PCM WAV, interleaved and clamped', async () => {
  const { wavBytes } = await import('../../site/scripts/landing-sound.js');
  const bytes = wavBytes([Float32Array.from([0, 1, -1]), Float32Array.from([0.5, 2, -2])], 44100);
  const view = new DataView(bytes.buffer);
  const text = (at, n) => String.fromCharCode(...bytes.slice(at, at + n));
  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 4), 'WAVE');
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint32(40, true), 3 * 2 * 2);
  assert.equal(bytes.length, 44 + 12);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => view.getInt16(44 + i * 2, true)), [0, 16383, 32767, 32767, -32768, -32768]);
});

test('fadeVolume: linear, clamped, done at the end', async () => {
  const { fadeVolume } = await import('../../site/scripts/landing-sound.js');
  assert.equal(fadeVolume({ from: 0, to: 0.5, elapsed: 0, duration: 1 }), 0);
  assert.equal(fadeVolume({ from: 0, to: 0.5, elapsed: 0.5, duration: 1 }), 0.25);
  assert.equal(fadeVolume({ from: 0.5, to: 0, elapsed: 2, duration: 1 }), 0);
  assert.equal(fadeVolume({ from: 0, to: 3, elapsed: 0, duration: 0 }), 1);
});
