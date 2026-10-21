// "Use my location" (polish wave A1): one geolocation attempt as a promise, and the line the member sees when it
// cannot be used. Pure (no DOM), so the signup and later screens share it and node --test can run it.
// Privacy: the coordinates are only returned to the caller; this module never stores, logs or sends them.

// Coarse is enough (the server keeps a ~2 km cell); 10 s per attempt once the browser is allowed to look (the spec's
// timeout does not include the permission prompt); a fix up to 10 min old is fine.
export const GEO_OPTIONS = Object.freeze({ enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });

// How long we keep listening for one attempt, from the click: the permission prompt plus the fix. A member who answers
// the prompt after a while (or a slow first fix on macOS) still counts. The signup opens the city list earlier (15 s)
// so nobody is stranded, but keeps listening until this grace runs out.
export const PROMPT_GRACE_MS = 30000;

export const STILL_WAITING_TEXT = 'Still waiting for your browser…';
const PLAIN = 'No problem. Pick your city instead.';
const COPY = {
  denied: "Location is blocked for this site. Allow it in your browser's site settings, or pick your city.",
  unavailable: "Your device couldn't find a location. Check that location services are on, or pick your city.",
  timeout: 'Finding your location took too long. Try again, or pick your city.',
};
export const fallbackCopy = (reason) => COPY[reason] || PLAIN;

const REASON_BY_CODE = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };

// locateOnce(geo, { secure, options, promptGraceMs }) -> Promise<{ ok: true, lat, lng } | { ok: false, reason }>
// reason: 'insecure' | 'unsupported' | 'denied' | 'unavailable' | 'timeout'. Settles exactly once; later callbacks
// from the browser are ignored.
export const locateOnce = (geo, { secure, options = GEO_OPTIONS, promptGraceMs = PROMPT_GRACE_MS } = {}) => new Promise((resolve) => {
  if (!secure) { resolve({ ok: false, reason: 'insecure' }); return; }
  if (!geo || typeof geo.getCurrentPosition !== 'function') { resolve({ ok: false, reason: 'unsupported' }); return; }
  let settled = false;
  let grace;
  const settle = (result) => {
    if (settled) return;
    settled = true;
    clearTimeout(grace);
    resolve(result);
  };
  grace = setTimeout(() => settle({ ok: false, reason: 'timeout' }), promptGraceMs);
  try {
    geo.getCurrentPosition((position) => {
      const lat = Number(position?.coords?.latitude);
      const lng = Number(position?.coords?.longitude);
      settle(Number.isFinite(lat) && Number.isFinite(lng) ? { ok: true, lat, lng } : { ok: false, reason: 'unavailable' });
    }, (error) => settle({ ok: false, reason: REASON_BY_CODE[error?.code] || 'unavailable' }), options);
  } catch {
    settle({ ok: false, reason: 'unavailable' });
  }
});

// The 3-per-24-h home change cap ('try again later', 0004). PostgREST answers it as 429 PT429; a gateway or an older
// PostgREST that does not map PT codes answers 400 with the same message, which must read the same to the member.
export const isTryAgainLater = (error, status = 0) => status === 429 || error?.code === 'PT429'
  || String(error?.message || '').trim().toLowerCase() === 'try again later';
