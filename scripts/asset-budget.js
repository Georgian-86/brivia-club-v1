// Asset budget (Phase B landing speed): pure check of built media sizes against per-type limits. No fs, no DOM.
export const DEFAULT_LIMITS = { imageBytes: 409600, videoBytes: 5242880 };
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
    const limit = IMAGE_EXT.has(ext) ? limits.imageBytes : VIDEO_EXT.has(ext) ? limits.videoBytes : null;
    if (limit != null && bytes > limit) violations.push({ path, bytes, limit });
  }
  return { ok: violations.length === 0, violations };
}
