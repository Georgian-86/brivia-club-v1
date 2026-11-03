// Crossing paths (D-119, migration 0021): a quiet alert when a connection is nearby. Design:
// docs/superpowers/specs/2026-11-01-crossing-paths-design.md; privacy contract: ORBIT spec §9.1.4a.
//
// While the feature is on and the tab is visible, the loop reads a coarse position (only if the browser already allows
// it: it never prompts on its own), sends it to nearby_pulse, and reads my_nearby_alerts. Coordinates live only in the
// local variable that is handed to pulse(); they are never stored, logged or put in the DOM.
// Location blocked or unavailable: the live cell is cleared on the server at once and the setting shows "Paused".
// Before 0021 is applied the functions are missing: the loop stops quietly.
import { locateOnce } from './geo-locate.js';

export const PULSE_MS = 5 * 60 * 1000;
// A fix up to 5 minutes old is fine; coarse is enough (the server keeps a ~2.3 km cell, and a ~1 km one for Nearby, D-131).
export const NEARBY_GEO_OPTIONS = Object.freeze({ enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 });
// D-133: the member's own tap asks for a fresh fix; a timeout or "unavailable" is retried once with GPS (high accuracy),
// which phones indoors or with Wi-Fi scanning off often need.
export const NEARBY_FRESH_OPTIONS = Object.freeze({ enableHighAccuracy: false, timeout: 15000, maximumAge: 0 });
export const NEARBY_RETRY_OPTIONS = Object.freeze({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
const MISSING = new Set(['PGRST202', '42883']);
const isMissing = (error) => Boolean(error) && (MISSING.has(error.code) || error.status === 404);
const isRateLimited = (error) => Boolean(error) && (error.code === 'PT429' || error.status === 429
  || String(error.message || '').trim().toLowerCase() === 'try again later');

export const PAUSED_COPY = {
  denied: "Paused: location is off for Brivia. Allow it in your browser's site settings to use Crossing paths.",
  prompt: 'Paused: Brivia needs your location to tell you who is nearby. Open Nearby and tap Allow location.',
  unavailable: "Paused: your device couldn't find a location. Check that GPS and your connection are on.",
  timeout: 'Paused: finding your location took too long. Open Nearby and tap Try again.',
  unsupported: "Paused: this browser can't share a location. Try Safari or Chrome.",
  insecure: 'Paused: location only works on the secure (https) Brivia site.',
};
export const pausedCopy = (reason) => PAUSED_COPY[reason] || PAUSED_COPY.unavailable;

// D-133: where to switch location on, for the device in hand. The browser alone is not enough on phones: iOS has a
// per-app switch (Safari Websites, or Chrome itself) and Android a system Location toggle.
export const platformOf = (nav = globalThis.navigator) => {
  const ua = String(nav?.userAgent || '');
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && Number(nav?.maxTouchPoints) > 1);
  if (ios && /CriOS/.test(ua)) return 'ios-chrome';
  if (ios && /FxiOS|EdgiOS/.test(ua)) return 'ios-other';
  if (ios) return 'ios-safari';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
};
export const LOCATION_HELP = Object.freeze({
  'ios-safari': 'On your iPhone open Settings › Privacy & Security › Location Services, turn it on, then set Safari Websites to “While Using”. In Safari tap “aA” › Website Settings › Location › Allow.',
  'ios-chrome': 'On your iPhone open Settings › Privacy & Security › Location Services, turn it on, then set Chrome to “While Using”. Then come back and tap Try again.',
  'ios-other': 'On your iPhone open Settings › Privacy & Security › Location Services, turn it on, and allow it for this browser “While Using”.',
  android: 'Tap the icon left of the address bar › Permissions › Location › Allow. Also check that Location is on in your phone’s quick settings.',
  desktop: 'Click the icon left of the address bar › Location › Allow, and check that location services are on for your browser in your computer’s settings.',
});
export const locationHelp = (nav = globalThis.navigator) => LOCATION_HELP[platformOf(nav)];

// Quiet hours (spec §5): 22:00 to 07:00 device time, alerts land silently (no toast).
export const isQuietHour = (date = new Date()) => {
  const h = date.getHours();
  return h >= 22 || h < 7;
};

// The panel row and the toast. Never a place, a distance or a time of arrival.
export const alertHeadline = (name) => `${name || 'A connection'} is nearby`;
export const alertDetail = (sharedInterest) => {
  const label = String(sharedInterest || '').trim();
  return label ? `You both love ${label.toLowerCase()}` : "You're connected on Brivia";
};
export const alertToast = (name) => `${name || 'A connection'} is nearby. Say hi?`;

// A stable key per alert, so "seen" survives a reload (an alert is listed for 3 hours).
export const alertKey = (row) => `${row?.other_id}@${row?.created_at}`;
export const normaliseAlerts = (rows) => (Array.isArray(rows) ? rows : [])
  .filter((row) => row?.other_id && row?.created_at)
  .map((row) => ({ otherId: String(row.other_id), createdAt: String(row.created_at), sharedInterest: row.shared_interest || '', key: alertKey(row) }));

// permission: () => Promise<'granted' | 'prompt' | 'denied' | 'unknown'>
export const geolocationPermission = async (nav = globalThis.navigator) => {
  try {
    if (!nav?.permissions?.query) return 'unknown';
    const status = await nav.permissions.query({ name: 'geolocation' });
    return ['granted', 'prompt', 'denied'].includes(status?.state) ? status.state : 'unknown';
  } catch { return 'unknown'; }
};

export const createCrossingPaths = ({
  pulse, fetchAlerts, clear,
  geo = globalThis.navigator?.geolocation,
  secure = Boolean(globalThis.isSecureContext),
  permission = () => geolocationPermission(),
  onAlerts = () => {}, onStatus = () => {}, onPulse = () => {},
  intervalMs = PULSE_MS,
  doc = globalThis.document, win = globalThis.window,
  setIntervalFn = (fn, ms) => globalThis.setInterval(fn, ms), clearIntervalFn = (id) => globalThis.clearInterval(id),
} = {}) => {
  let timer = null;
  let running = false;
  let busy = false;
  let status = 'off';
  // D-133: a fix succeeded in this page. Browsers that report 'prompt' every visit (iOS Safari's "Ask") do not prompt
  // again within the same page, so background updates may go on after the first fix.
  let gotFix = false;
  let permissionStatus = null;
  const visible = () => !doc || doc.visibilityState === 'visible';
  const setStatus = (next) => { if (next !== status) { status = next; onStatus(next); } };

  const stopListening = () => {
    if (timer !== null) clearIntervalFn(timer);
    timer = null;
    win?.removeEventListener?.('focus', onWake);
    doc?.removeEventListener?.('visibilitychange', onWake);
  };
  const giveUp = () => { running = false; stopListening(); setStatus('unavailable-server'); onAlerts([]); };

  const refreshAlerts = async () => {
    const { data, error } = (await fetchAlerts()) || {};
    if (isMissing(error)) { giveUp(); return; }
    if (!error) onAlerts(normaliseAlerts(data));
  };

  const pause = async (reason) => {
    setStatus(`paused-${reason}`);
    // Location is not usable: the member must stop counting as "around" right away. A momentary miss (no position, a
    // timeout) keeps the last live area until it expires (20 minutes) instead.
    if (!['unavailable', 'timeout'].includes(reason)) { try { await clear(); } catch { /* the 20-minute expiry still applies */ } }
  };

  // One check. ask = true from the member's own tap or from opening Nearby (it may show the browser prompt, and it
  // always asks the browser for a fresh position).
  //
  // D-133 (the mobile "Location is off" bug): the Permissions API is a hint, never the answer. Before, a 'denied' from
  // navigator.permissions.query() stopped every check before getCurrentPosition() was called, and Try again ran the
  // same path, so a stale 'denied' (iOS Safari keeps one until the page or app restarts; Chrome on iOS also needs its
  // own iOS location switch) could never clear. Now only the browser's real answer counts: a tap always calls
  // getCurrentPosition(); a background check skips it only when the browser would show a prompt and this page has not
  // had a fix yet (no unsolicited prompts). Calling it when location is truly denied shows nothing and fails at once.
  let inflight = null;
  const check = async ({ ask = false } = {}) => {
    // A tap while a background check runs waits for it, then asks the browser itself (never a silent no-op).
    if (busy && ask && inflight) { try { await inflight; } catch { /* its own errors are its own */ } }
    if (!running || busy || (!ask && !visible())) return;
    busy = true;
    inflight = runCheck({ ask });
    try { await inflight; } finally { inflight = null; }
  };
  const runCheck = async ({ ask }) => {
    try {
      const state = await permission();
      if (!ask && state === 'prompt' && !gotFix) { await pause('prompt'); await refreshAlerts(); return; }
      let fix = await locateOnce(geo, { secure, options: ask ? NEARBY_FRESH_OPTIONS : NEARBY_GEO_OPTIONS });
      if (!running) return;
      // Timed out or no position: once more with GPS and a fresh reading (not after a denial: that would not change).
      if (!fix.ok && (fix.reason === 'timeout' || fix.reason === 'unavailable')) {
        fix = await locateOnce(geo, { secure, options: NEARBY_RETRY_OPTIONS });
        if (!running) return;
      }
      if (!fix.ok) {
        await pause(['denied', 'unavailable', 'timeout', 'unsupported', 'insecure'].includes(fix.reason) ? fix.reason : 'unavailable');
        await refreshAlerts();
        return;
      }
      gotFix = true;
      const { error } = (await pulse(fix.lat, fix.lng)) || {};
      if (isMissing(error)) { giveUp(); return; }
      if (!error || isRateLimited(error)) setStatus('on');
      // D-131: a fresh live location (or one under 4 minutes old): Nearby reads who is around again.
      if (!error) onPulse();
      await refreshAlerts();
    } finally { busy = false; }
  };
  function onWake() { return visible() ? check() : undefined; }

  // enabled: the server switch. ask: the member just turned it on (allowed to prompt).
  // D-133: where the browser can tell us the permission changed (allowed in Settings, or revoked), check at once.
  const onPermissionChange = () => { if (running) check(); };
  const watchPermission = async () => {
    try {
      if (permissionStatus || !globalThis.navigator?.permissions?.query) return;
      permissionStatus = await globalThis.navigator.permissions.query({ name: 'geolocation' });
      permissionStatus?.addEventListener?.('change', onPermissionChange);
    } catch { permissionStatus = null; }
  };
  const start = async ({ ask = false } = {}) => {
    if (running) { if (ask) await check({ ask }); return; }
    running = true;
    win?.addEventListener?.('focus', onWake);
    doc?.addEventListener?.('visibilitychange', onWake);
    timer = setIntervalFn(() => check(), intervalMs);
    watchPermission();
    await check({ ask });
  };
  const stop = () => {
    running = false;
    stopListening();
    permissionStatus?.removeEventListener?.('change', onPermissionChange);
    permissionStatus = null;
    setStatus('off');
    onAlerts([]);
  };
  // Off with the switch: stop, and the server already deleted the live cell (set_nearby_enabled(false)).
  return { start, stop, check, refreshAlerts, status: () => status, isRunning: () => running };
};
