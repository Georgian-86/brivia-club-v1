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
// A fix up to 5 minutes old is fine; coarse is enough (the server keeps a ~2.3 km cell).
export const NEARBY_GEO_OPTIONS = Object.freeze({ enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 });
const MISSING = new Set(['PGRST202', '42883']);
const isMissing = (error) => Boolean(error) && (MISSING.has(error.code) || error.status === 404);
const isRateLimited = (error) => Boolean(error) && (error.code === 'PT429' || error.status === 429
  || String(error.message || '').trim().toLowerCase() === 'try again later');

export const PAUSED_COPY = {
  denied: "Paused: location is off for Brivia. Allow it in your browser's site settings to use Crossing paths.",
  prompt: 'Paused: Brivia needs your location to tell you who is nearby. Turn this off and on again to allow it.',
  unavailable: "Paused: your device couldn't find a location. We'll try again in a few minutes.",
};
export const pausedCopy = (reason) => PAUSED_COPY[reason] || PAUSED_COPY.unavailable;

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
  onAlerts = () => {}, onStatus = () => {},
  intervalMs = PULSE_MS,
  doc = globalThis.document, win = globalThis.window,
  setIntervalFn = (fn, ms) => globalThis.setInterval(fn, ms), clearIntervalFn = (id) => globalThis.clearInterval(id),
} = {}) => {
  let timer = null;
  let running = false;
  let busy = false;
  let status = 'off';
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
    // Location is not usable: the member must stop counting as "around" right away.
    if (reason !== 'unavailable') { try { await clear(); } catch { /* the 20-minute expiry still applies */ } }
  };

  // One check. ask = true only from the member's own tap (it may show the browser prompt).
  const check = async ({ ask = false } = {}) => {
    if (!running || busy || (!ask && !visible())) return;
    busy = true;
    try {
      const state = await permission();
      if (state === 'denied') { await pause('denied'); await refreshAlerts(); return; }
      if (state === 'prompt' && !ask) { await pause('prompt'); await refreshAlerts(); return; }
      const fix = await locateOnce(geo, { secure, options: NEARBY_GEO_OPTIONS });
      if (!running) return;
      if (!fix.ok) {
        await pause(fix.reason === 'timeout' || fix.reason === 'unavailable' ? 'unavailable' : 'denied');
        await refreshAlerts();
        return;
      }
      const { error } = (await pulse(fix.lat, fix.lng)) || {};
      if (isMissing(error)) { giveUp(); return; }
      if (!error || isRateLimited(error)) setStatus('on');
      await refreshAlerts();
    } finally { busy = false; }
  };
  function onWake() { return visible() ? check() : undefined; }

  // enabled: the server switch. ask: the member just turned it on (allowed to prompt).
  const start = async ({ ask = false } = {}) => {
    if (running) { if (ask) await check({ ask }); return; }
    running = true;
    win?.addEventListener?.('focus', onWake);
    doc?.addEventListener?.('visibilitychange', onWake);
    timer = setIntervalFn(() => check(), intervalMs);
    await check({ ask });
  };
  const stop = () => { running = false; stopListening(); setStatus('off'); onAlerts([]); };
  // Off with the switch: stop, and the server already deleted the live cell (set_nearby_enabled(false)).
  return { start, stop, check, refreshAlerts, status: () => status, isRunning: () => running };
};
