// Pure name resolution for preset covers (used by cover-assets.js; unit-tested in node, which cannot import images).
// Stored cover values are either the original preset path (/Images/Cover%20images/<name>) or, from older builds,
// a Vite-hashed build URL (/assets/<name-stem>-<8-char hash>.<ext>). Both resolve to the preset key, matched
// case-sensitively. An optimized build URL (<stem>-<hash>.webp) resolves by stem to the same preset.
const VITE_HASH = /-[A-Za-z0-9_-]{8}(\.[A-Za-z0-9]+)$/;
const stem = (name) => name.replace(/\.[^.]*$/, '');

export const resolveCoverKey = (url, keys) => {
  if (!url) return null;
  let name;
  try { name = decodeURIComponent(String(url)).split('/').pop(); } catch { return null; }
  if (keys.includes(name)) return name;
  const unhashed = name.replace(VITE_HASH, '$1');
  if (unhashed !== name && keys.includes(unhashed)) return unhashed;
  if (/\.webp$/.test(name)) {
    const wanted = new Set([stem(name), stem(unhashed)]);
    return keys.find((key) => wanted.has(stem(key))) || null;
  }
  return null;
};
