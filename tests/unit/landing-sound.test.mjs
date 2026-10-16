// Landing sound rules (D-063): when the music may start, the 5-minute limit, the saved mute choice and the bar clock.
// Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOUND_LIMIT_MS, soundPreference, soundPlan, isUnlockEvent, barsToSchedule } from '../../landing-sound.js';

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
