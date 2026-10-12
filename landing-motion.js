// Pure helpers for the landing page's intro and video start (Phase B landing speed).
// Keep this file free of DOM access so it can be unit-tested with node --test.

export const INTRO_CAP_MS = 2500;
export const INTRO_START_GRACE_MS = 800;

// Posters only (no video requests) for reduced-motion and save-data visitors.
export function motionAllowed({ reducedMotion = false, saveData = false } = {}) {
  return !reducedMotion && !saveData;
}

// The intro plays on a first visit only; arriving back from an auth page also skips it.
export function introPlan({ seenBefore = false, fromAuth = false } = {}) {
  return seenBefore || fromAuth ? 'skip' : 'play';
}
