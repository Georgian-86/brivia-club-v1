// Crossing paths (D-119): the loop, its pause rules and the copy. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCrossingPaths, isQuietHour, alertHeadline, alertDetail, alertToast, pausedCopy, normaliseAlerts, alertKey,
  geolocationPermission, NEARBY_GEO_OPTIONS, NEARBY_FRESH_OPTIONS, NEARBY_RETRY_OPTIONS, platformOf, locationHelp,
} from '../../site/scripts/crossing-paths.js';

const ALERT = { other_id: 'b', created_at: '2026-11-01T10:00:00Z', shared_interest: 'Chess' };

const harness = ({ permission = 'granted', fix = { lat: 12.97, lng: 77.6 }, pulseError = null, alertsError = null, alerts = [ALERT] } = {}) => {
  const calls = { pulse: [], alerts: 0, clear: 0, geo: [] };
  const listeners = { doc: {}, win: {} };
  let tick = null;
  const state = { permission, fix, pulseError, alertsError, alerts };
  const seen = { alerts: [], status: [] };
  const geo = {
    getCurrentPosition: (ok, fail, options) => {
      calls.geo.push(options);
      if (state.fix.code) fail({ code: state.fix.code }); else ok({ coords: { latitude: state.fix.lat, longitude: state.fix.lng } });
    },
  };
  const doc = { visibilityState: 'visible', addEventListener: (t, fn) => { listeners.doc[t] = fn; }, removeEventListener: (t) => { delete listeners.doc[t]; } };
  const cp = createCrossingPaths({
    pulse: async (lat, lng) => { calls.pulse.push([lat, lng]); return { data: [], error: state.pulseError }; },
    fetchAlerts: async () => { calls.alerts += 1; return { data: state.alertsError ? null : state.alerts, error: state.alertsError }; },
    clear: async () => { calls.clear += 1; return { error: null }; },
    geo, secure: true,
    permission: async () => state.permission,
    onAlerts: (rows) => seen.alerts.push(rows),
    onStatus: (s) => seen.status.push(s),
    doc,
    win: { addEventListener: (t, fn) => { listeners.win[t] = fn; }, removeEventListener: (t) => { delete listeners.win[t]; } },
    setIntervalFn: (fn, ms) => { tick = fn; calls.intervalMs = ms; return 1; },
    clearIntervalFn: () => { tick = null; },
  });
  return { cp, calls, seen, state, doc, listeners, tick: () => tick?.(), hasTick: () => Boolean(tick) };
};

test('granted: one coarse fix goes to the pulse, then the alerts are listed', async () => {
  const h = harness();
  await h.cp.start();
  assert.deepEqual(h.calls.pulse, [[12.97, 77.6]]);
  assert.equal(h.calls.geo[0].enableHighAccuracy, false);
  assert.equal(h.calls.geo[0], NEARBY_GEO_OPTIONS);
  assert.equal(h.calls.intervalMs, 5 * 60 * 1000);
  assert.deepEqual(h.seen.status, ['on']);
  assert.deepEqual(h.seen.alerts.at(-1), [{ otherId: 'b', createdAt: ALERT.created_at, sharedInterest: 'Chess', key: alertKey(ALERT) }]);
});

test('every 5 minutes; a hidden tab keeps going once location is granted and a fix worked (D-138); a return checks at once', async () => {
  const h = harness();
  await h.cp.start();
  await h.tick();
  assert.equal(h.calls.pulse.length, 2);
  h.doc.visibilityState = 'hidden';
  await h.tick();
  assert.equal(h.calls.pulse.length, 3, 'the member switched to another app: still found while the browser runs the page');
  h.doc.visibilityState = 'visible';
  await h.listeners.doc.visibilitychange();
  assert.equal(h.calls.pulse.length, 4);
});

test('a hidden tab never checks without a granted permission (iOS "Ask", or revoked): no prompt, no pulse', async () => {
  const h = harness();
  await h.cp.start();
  assert.equal(h.calls.pulse.length, 1);
  h.state.permission = 'prompt';
  await h.tick();                               // visible: learns the permission is now "ask"
  const geoBefore = h.calls.geo.length;
  h.doc.visibilityState = 'hidden';
  await h.tick();
  assert.equal(h.calls.geo.length, geoBefore, 'nothing asked from a hidden page');
  h.state.permission = 'denied'; h.state.fix = { code: 1 };
  h.doc.visibilityState = 'visible';
  await h.tick();                               // revoked: the live area is cleared at once
  assert.ok(h.calls.clear >= 1);
  const pulses = h.calls.pulse.length;
  h.doc.visibilityState = 'hidden';
  await h.tick();
  assert.equal(h.calls.pulse.length, pulses, 'revoked: nothing collected in the background');
});

// D-133 (the mobile "Location is off" bug): the Permissions API is a hint. A 'denied' from it used to stop every check
// before the browser was asked, so a stale denial (iOS Safari, Chrome on iOS) could never clear, even with Try again.
test('location blocked: the browser itself is asked and refuses; no pulse, the live cell is cleared, paused-denied', async () => {
  const h = harness({ permission: 'denied', fix: { code: 1 } });
  await h.cp.start();
  assert.equal(h.calls.geo.length, 1);   // asked the browser, not just the Permissions API
  assert.equal(h.calls.pulse.length, 0);
  assert.equal(h.calls.clear, 1);
  assert.deepEqual(h.seen.status, ['paused-denied']);
});

test('a stale "denied" from the Permissions API no longer blocks a real location (the iPhone case)', async () => {
  const h = harness({ permission: 'denied' });   // the API says denied, the browser gives a position
  await h.cp.start();
  assert.equal(h.calls.geo.length, 1);
  assert.deepEqual(h.calls.pulse, [[12.97, 77.6]]);
  assert.deepEqual(h.seen.status, ['on']);
});

test('Try again (ask) always asks the browser for a fresh position, even after a refusal', async () => {
  const h = harness({ permission: 'denied', fix: { code: 1 } });
  await h.cp.start();
  h.state.fix = { lat: 12.97, lng: 77.6 };   // the member allowed it in Settings
  await h.cp.check({ ask: true });
  assert.equal(h.calls.geo.length, 2);
  assert.equal(h.calls.geo[1], NEARBY_FRESH_OPTIONS);
  assert.equal(NEARBY_FRESH_OPTIONS.maximumAge, 0);
  assert.equal(h.calls.pulse.length, 1);
  assert.deepEqual(h.seen.status, ['paused-denied', 'on']);
});

test('iOS "Ask": after a first fix in this page, background updates go on although the API still says prompt', async () => {
  const h = harness({ permission: 'prompt' });
  await h.cp.start({ ask: true });
  await h.tick();
  assert.equal(h.calls.geo.length, 2);
  assert.equal(h.calls.pulse.length, 2);
});

test('never prompts on its own: permission "prompt" pauses without asking, unless the member just turned it on', async () => {
  const h = harness({ permission: 'prompt' });
  await h.cp.start();
  assert.equal(h.calls.geo.length, 0);
  assert.equal(h.calls.clear, 1);
  assert.deepEqual(h.seen.status, ['paused-prompt']);
  h.cp.stop();
  const k = harness({ permission: 'prompt' });
  await k.cp.start({ ask: true });
  assert.equal(k.calls.geo.length, 1);
  assert.equal(k.calls.pulse.length, 1);
});

test('the browser refuses at the prompt: cleared and paused; no fix (timeout): paused but the cell is left to expire', async () => {
  const h = harness({ permission: 'unknown', fix: { code: 1 } });
  await h.cp.start();
  assert.equal(h.calls.clear, 1);
  assert.deepEqual(h.seen.status, ['paused-denied']);
  // A timeout is retried once with GPS and a fresh reading, then reported as its own state; the cell expires on its own.
  const k = harness({ fix: { code: 3 } });
  await k.cp.start();
  assert.equal(k.calls.geo.length, 2);
  assert.equal(k.calls.geo[1], NEARBY_RETRY_OPTIONS);
  assert.equal(NEARBY_RETRY_OPTIONS.enableHighAccuracy, true);
  assert.equal(k.calls.clear, 0);
  assert.deepEqual(k.seen.status, ['paused-timeout']);
  // No position (code 2): retried once, then "unavailable", separately from a timeout.
  const u = harness({ fix: { code: 2 } });
  await u.cp.start();
  assert.equal(u.calls.geo.length, 2);
  assert.deepEqual(u.seen.status, ['paused-unavailable']);
  // A refusal is not retried (it would not change).
  const d = harness({ fix: { code: 1 } });
  await d.cp.start();
  assert.equal(d.calls.geo.length, 1);
  assert.equal(k.calls.pulse.length, 0);
});

test('a rate-limited pulse still counts as on; before 0021 the loop gives up quietly', async () => {
  const h = harness({ pulseError: { code: 'PT429', message: 'try again later' } });
  await h.cp.start();
  assert.deepEqual(h.seen.status, ['on']);
  const k = harness({ pulseError: { code: 'PGRST202' } });
  await k.cp.start();
  assert.equal(k.hasTick(), false);
  assert.equal(k.cp.isRunning(), false);
  assert.deepEqual(k.seen.status, ['unavailable-server']);
  assert.deepEqual(k.seen.alerts.at(-1), []);
});

test('stop clears the timer, the listeners and the alerts', async () => {
  const h = harness();
  await h.cp.start();
  h.cp.stop();
  assert.equal(h.hasTick(), false);
  assert.equal(h.listeners.doc.visibilitychange, undefined);
  assert.equal(h.cp.status(), 'off');
  assert.deepEqual(h.seen.alerts.at(-1), []);
});

test('copy: never a place, a distance or a time', () => {
  assert.equal(alertHeadline('Riya'), 'Riya is nearby');
  assert.equal(alertDetail('Chess'), 'You both love chess');
  assert.equal(alertDetail(''), "You're connected on Brivia");
  assert.equal(alertToast('Riya'), 'Riya is nearby. Say hi?');
  for (const text of [alertHeadline('Riya'), alertDetail('Chess'), alertToast('Riya'), pausedCopy('denied'), pausedCopy('prompt'), pausedCopy('x')]) {
    assert.doesNotMatch(text, /\d\s?km|metres|meters|miles|\bat \d/i);
  }
  assert.match(pausedCopy('denied'), /^Paused: location is off/);
});

test('quiet hours are 22:00 to 07:00 device time', () => {
  const at = (h) => new Date(2026, 10, 1, h, 30);
  assert.equal(isQuietHour(at(21)), false);
  assert.equal(isQuietHour(at(22)), true);
  assert.equal(isQuietHour(at(3)), true);
  assert.equal(isQuietHour(at(6)), true);
  assert.equal(isQuietHour(at(7)), false);
});

test('normaliseAlerts drops malformed rows', () => {
  assert.deepEqual(normaliseAlerts(null), []);
  assert.equal(normaliseAlerts([{ other_id: 'a' }, ALERT, {}]).length, 1);
});

test('geolocationPermission: the Permissions API state, or unknown without it', async () => {
  assert.equal(await geolocationPermission({}), 'unknown');
  assert.equal(await geolocationPermission({ permissions: { query: async () => ({ state: 'denied' }) } }), 'denied');
  assert.equal(await geolocationPermission({ permissions: { query: async () => { throw new Error('no'); } } }), 'unknown');
});

test('D-133: unsupported and insecure are their own states, not "location is off"', async () => {
  const mk = (opts) => createCrossingPaths({ pulse: async () => ({}), fetchAlerts: async () => ({ data: [] }), clear: async () => ({}), permission: async () => 'unknown',
    doc: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }, win: { addEventListener() {}, removeEventListener() {} },
    setIntervalFn: () => 1, clearIntervalFn() {}, onStatus: (s) => seen.push(s), ...opts });
  let seen = [];
  await mk({ geo: undefined, secure: true }).start();
  assert.deepEqual(seen, ['paused-unsupported']);
  seen = [];
  await mk({ geo: { getCurrentPosition() {} }, secure: false }).start();
  assert.deepEqual(seen, ['paused-insecure']);
  for (const reason of ['denied', 'prompt', 'unavailable', 'timeout', 'unsupported', 'insecure']) assert.match(pausedCopy(reason), /^Paused: /);
});

test('D-133: device-specific help for turning location on', () => {
  const ua = (userAgent, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints });
  assert.equal(platformOf(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')), 'ios-safari');
  assert.equal(platformOf(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1')), 'ios-chrome');
  assert.equal(platformOf(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', 5)), 'ios-safari');   // iPad
  assert.equal(platformOf(ua('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')), 'android');
  assert.equal(platformOf(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36')), 'desktop');
  assert.match(locationHelp(ua('iPhone Safari Version/18.0')), /Safari Websites/);
  assert.match(locationHelp(ua('iPhone CriOS/130')), /set Chrome to/);
  assert.match(locationHelp(ua('Android Chrome')), /quick settings/);
});
