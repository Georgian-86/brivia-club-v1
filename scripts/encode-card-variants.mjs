// Small copies of the matching-scene card photos (D-066). On a phone those cards are about 160 CSS px wide, yet each
// was decoded from a 1,450-1,600 px file mid-scroll (40-60 ms per image on a mid-range phone). An 800 px copy still
// covers a 3x screen, so the cards look the same; index.html offers it through srcset and keeps the full file for
// the full-bleed backgrounds. Same encoder settings as optimize-media.mjs (WebP q78, colour profile kept).
// Usage: npm run media:cards   (needs sharp)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, statSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'source-media', 'Images');
const outDir = join(root, 'site', 'media', 'Images');
export const CARD_WIDTH = 800;

for (const name of readdirSync(sourceDir).filter((f) => /^MATCHING\d\.(png|jpe?g)$/i.test(f)).sort()) {
  const out = join(outDir, `${name.replace(/\.[^.]+$/, '')}-${CARD_WIDTH}.webp`);
  const src = join(sourceDir, name);
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) continue;
  await sharp(src).rotate().resize({ width: CARD_WIDTH, withoutEnlargement: true }).keepIccProfile()
    .webp({ quality: 78, effort: 6 }).toFile(out);
  console.log(`${name} -> ${out.slice(root.length + 1)} (${Math.round(statSync(out).size / 1024)} KB)`);
}
