// Pure helper for scripts/optimize-media.mjs. After `media:repoint` the site no longer references most originals
// (they now point into media/), so a rescan alone would shrink media/manifest.json. The refs to build are the scan
// plus every existing manifest entry whose source file still exists; entries whose source is gone are dropped.
// scanned: root-relative decoded paths ('Images/X.PNG'); manifest: { '/Images/X.PNG': '/media/...' };
// exists(rel) -> boolean.
export const collectRefs = (scanned, manifest, exists) => {
  const refs = new Set(scanned);
  for (const key of Object.keys(manifest || {})) {
    const rel = key.replace(/^\//, '');
    if (exists(rel)) refs.add(rel);
  }
  return [...refs].sort();
};
