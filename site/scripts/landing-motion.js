// Pure helpers for the landing page's intro and video start (Phase B landing speed).
// Keep this file free of DOM access so it can be unit-tested with node --test.

export const INTRO_CAP_MS = 2500;
export const INTRO_START_GRACE_MS = 800;

// Posters only (no video requests) for reduced-motion and save-data visitors, and on a 2g link where the 4K hero (D-062)
// would stall. Not on "3g": Chrome derives it from latency alone (round trip >= 270 ms), so Wi-Fi calling and many
// mobile networks report it with plenty of bandwidth, and the hero never played there (D-064).
const SLOW_LINKS = new Set(['slow-2g', '2g']);
export function motionAllowed({ reducedMotion = false, saveData = false, effectiveType = '' } = {}) {
  return !reducedMotion && !saveData && !SLOW_LINKS.has(effectiveType);
}

// The hero's <source> to keep (D-062), from MediaCapabilities answers in source order: the first one the device
// decodes smoothly in hardware (power-efficient), else the first smooth one, else the first it can decode at all,
// else -1 (leave the browser's own choice alone). D-066: a phone without an AV1 chip reports software AV1 as smooth,
// and decoding the 4K portrait stream on the CPU starved scrolling; its HEVC or H.264 copy is the same picture.
export function pickHeroSource(infos) {
  const list = Array.isArray(infos) ? infos : [];
  const first = (test) => list.findIndex((info) => info?.supported && test(info));
  const hardware = first((info) => info.smooth && info.powerEfficient);
  if (hardware >= 0) return hardware;
  const smooth = first((info) => info.smooth);
  return smooth >= 0 ? smooth : first(() => true);
}

// The intro plays on a first visit only; arriving back from an auth page also skips it.
export function introPlan({ seenBefore = false, fromAuth = false } = {}) {
  return seenBefore || fromAuth ? 'skip' : 'play';
}

// Drops the `.skeleton` shimmer from an image's wrapper once the image has loaded (or failed, so it never shimmers forever).
export function markLoaded(img) {
  const wrapper = img?.closest?.('.skeleton');
  if (!wrapper) return;
  const done = () => wrapper.classList.remove('skeleton');
  if (img.complete) { done(); return; } // loaded, or already failed (naturalWidth 0): either way stop shimmering
  img.addEventListener('load', done, { once: true });
  img.addEventListener('error', done, { once: true });
}
