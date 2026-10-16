// Asset budget (Phase B landing speed): pure check of built media sizes against per-type limits. No fs, no DOM.
// heroVideoBytes (D-062): the landing hero ships the 4K master's pixels (hero-4k-*, hero-portrait-4k-*). Each browser
// fetches one of them, after idle and behind the poster, so they get their own 20 MB cap (the H.264 last resort is the largest, about 18 MB).
export const DEFAULT_LIMITS = { imageBytes: 409600, videoBytes: 5242880, heroVideoBytes: 20 * 1048576 };
const HERO_4K = /(^|\/)hero-(portrait-)?4k-(av1|hevc|h264)[^/]*\.mp4$/i;
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov']);

const extOf = (path) => {
  const i = String(path).lastIndexOf('.');
  return i < 0 ? '' : String(path).slice(i).toLowerCase();
};

export function checkAssetBudget(files, limits = DEFAULT_LIMITS) {
  const violations = [];
  for (const { path, bytes } of files) {
    const ext = extOf(path);
    const limit = IMAGE_EXT.has(ext) ? limits.imageBytes
      : VIDEO_EXT.has(ext) ? (HERO_4K.test(path) ? limits.heroVideoBytes ?? limits.videoBytes : limits.videoBytes) : null;
    if (limit != null && bytes > limit) violations.push({ path, bytes, limit });
  }
  return { ok: violations.length === 0, violations };
}
