// Polish wave A1: the one-shot geolocation helper behind "Use my location" (site/scripts/geo-locate.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GEO_OPTIONS, locateOnce, fallbackCopy, isTryAgainLater, STILL_WAITING_TEXT } from '../../site/scripts/geo-locate.js';

// A fake navigator.geolocation: `answer(ok, fail)` decides what happens to each call (sync or via setTimeout).
const fakeGeo = (answer) => {
  const geo = { calls: [], getCurrentPosition(ok, fail, options) { geo.calls.push(options); answer(ok, fail); } };
  return geo;
};
const okAt = (ms, lat = 12.97, lng = 77.59) => fakeGeo((ok) => setTimeout(() => ok({ coords: { latitude: lat, longitude: lng } }), ms));
const fail = (code) => fakeGeo((_, f) => setTimeout(() => f({ code, message: 'x' }), 0));

test('GEO_OPTIONS: coarse, 10 s per attempt, a cached fix up to 10 min is fine', () => {
  assert.deepEqual(GEO_OPTIONS, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
});

test('a success resolves with finite lat/lng and passes the options through', async () => {
  const geo = okAt(0);
  assert.deepEqual(await locateOnce(geo, { secure: true }), { ok: true, lat: 12.97, lng: 77.59 });
  assert.deepEqual(geo.calls, [GEO_OPTIONS]);
});

test('a success after the 15 s guard (the prompt answered late) still resolves ok within the grace', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = locateOnce(okAt(16000), { secure: true });
  t.mock.timers.tick(16000);
  assert.deepEqual(await p, { ok: true, lat: 12.97, lng: 77.59 });
});

test('no answer within promptGraceMs resolves timeout, and a later answer is ignored', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const geo = okAt(31000);
  const p = locateOnce(geo, { secure: true, promptGraceMs: 30000 });
  let settledWith = null;
  p.then((r) => { settledWith = r; });
  t.mock.timers.tick(30000);
  assert.deepEqual(await p, { ok: false, reason: 'timeout' });
  t.mock.timers.tick(1000); // the late success fires now
  await Promise.resolve();
  assert.deepEqual(settledWith, { ok: false, reason: 'timeout' }); // nothing changed: still the timeout
  assert.deepEqual(await p, { ok: false, reason: 'timeout' });
  assert.equal(geo.calls.length, 1); // and no second call
});

test('error codes map to reasons: 1 denied, 2 unavailable, 3 timeout, anything else unavailable', async () => {
  assert.equal((await locateOnce(fail(1), { secure: true })).reason, 'denied');
  assert.equal((await locateOnce(fail(2), { secure: true })).reason, 'unavailable');
  assert.equal((await locateOnce(fail(3), { secure: true })).reason, 'timeout');
  assert.equal((await locateOnce(fail(undefined), { secure: true })).reason, 'unavailable');
});

test('only the first answer counts (a browser that calls back twice)', async () => {
  const geo = fakeGeo((ok, f) => { f({ code: 1 }); ok({ coords: { latitude: 1, longitude: 2 } }); });
  assert.deepEqual(await locateOnce(geo, { secure: true }), { ok: false, reason: 'denied' });
});

test('non-finite coordinates are unavailable, never ok', async () => {
  const geo = fakeGeo((ok) => ok({ coords: { latitude: Number.NaN, longitude: 77 } }));
  assert.deepEqual(await locateOnce(geo, { secure: true }), { ok: false, reason: 'unavailable' });
});

test('getCurrentPosition throwing is unavailable', async () => {
  const geo = { getCurrentPosition() { throw new Error('blocked by policy'); } };
  assert.deepEqual(await locateOnce(geo, { secure: true }), { ok: false, reason: 'unavailable' });
});

test('insecure context never calls the API', async () => {
  const geo = okAt(0);
  assert.deepEqual(await locateOnce(geo, { secure: false }), { ok: false, reason: 'insecure' });
  assert.equal(geo.calls.length, 0);
});

test('a missing API is unsupported', async () => {
  assert.deepEqual(await locateOnce(undefined, { secure: true }), { ok: false, reason: 'unsupported' });
  assert.deepEqual(await locateOnce({}, { secure: true }), { ok: false, reason: 'unsupported' });
});

test('fallbackCopy says why, in the exact words', () => {
  assert.equal(fallbackCopy('denied'), "Location is blocked. Allow it in your browser's site settings (on a Mac or phone, also check that location is on for your browser), or pick your city.");
  assert.equal(fallbackCopy('unavailable'), "Your device couldn't find a location. Check that location services are on, or pick your city.");
  assert.equal(fallbackCopy('timeout'), 'Finding your location took too long. Try again, or pick your city.');
  assert.equal(fallbackCopy('insecure'), 'No problem. Pick your city instead.');
  assert.equal(fallbackCopy('unsupported'), 'No problem. Pick your city instead.');
  assert.equal(fallbackCopy('something else'), 'No problem. Pick your city instead.');
  assert.equal(STILL_WAITING_TEXT, 'Still waiting for your browser…');
});

test('isTryAgainLater: the location cap as 429 PT429, or as a plain "try again later" error', () => {
  assert.equal(isTryAgainLater({ code: 'PT429', message: 'try again later' }, 429), true);
  assert.equal(isTryAgainLater({ code: 'P0001', message: 'try again later' }, 400), true);
  assert.equal(isTryAgainLater({ code: 'P0001', message: 'adult declaration required' }, 400), false);
  assert.equal(isTryAgainLater({ code: 'P0002', message: 'profile required' }, 404), false);
  assert.equal(isTryAgainLater(null, 0), false);
});
