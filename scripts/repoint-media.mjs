// Media codemod (Phase B): repoints where the site LOADS images and videos to the optimized copies in media/.
// `node scripts/repoint-media.mjs` rewrites the site's root HTML/CSS/JS files in place from media/manifest.json.
//
// Rules (controller Ruling D): only load sites change (<img src>, <video>/<source> src, CSS url(), import sources,
// JS strings). Stored identifiers never change: a ref that is the whole value of a data-* or value="" attribute
// (auth.html data-cover-option and the hidden coverUrl input) is left alone, because the DB stores those values and
// supabase.js isPresetCoverUrl only accepts /assets/ and /Images/Cover images/ paths. Refs already under media/
// are never rewritten, so the codemod is idempotent.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const STORED_ATTR = /(?:\bdata-[\w-]+|\bvalue)\s*=\s*["']$/;

// map: { '/Images/CONNECT.PNG': '/media/Images/CONNECT.webp', ... } (root-relative, decoded). A ref may appear
// as /x or ./x, with spaces literal or as %20; the replacement keeps the same prefix and encoding.
export const repointReferences = (text, map) => {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  if (!keys.length) return text;
  const alt = keys.map((k) => escapeRe(k.replace(/^\//, '')).replace(/ /g, '(?: |%20)')).join('|');
  const re = new RegExp(`(?<![\\w/.%-])(\\.?/)(${alt})(?![\\w.%-])`, 'g');
  return text.replace(re, (match, prefix, path, offset) => {
    if (STORED_ATTR.test(text.slice(Math.max(0, offset - 40), offset))) return match;
    const key = `/${path.replace(/%20/g, ' ')}`;
    const target = map[key];
    if (!target) return match;
    const body = target.replace(/^\//, '');
    return prefix + (path.includes('%20') ? body.replace(/ /g, '%20') : body);
  });
};

// The site's own source files: root-level pages, styles and scripts (no node_modules, dist, media, tests, docs).
export const siteFiles = (root) => readdirSync(root, { withFileTypes: true })
  .filter((e) => e.isFile() && /\.(html|css|js|mjs)$/.test(e.name) && !/^vite\.config\./.test(e.name))
  .map((e) => join(root, e.name));

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const manifestPath = join(root, 'media', 'manifest.json');
  if (!existsSync(manifestPath)) { console.error('media/manifest.json not found. Run `npm run media:build` first.'); process.exit(2); }
  const map = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let changed = 0;
  for (const file of siteFiles(root)) {
    const before = readFileSync(file, 'utf8');
    const after = repointReferences(before, map);
    if (after !== before) { writeFileSync(file, after); changed += 1; console.log(`repointed ${file.slice(root.length + 1)}`); }
  }
  console.log(`${changed} file${changed === 1 ? '' : 's'} changed.`);
}
