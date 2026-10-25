// Faceless profile photos for the v3 test members (spec: docs/superpowers/specs/2026-10-25-test-world-v3-design.md).
// Unsplash photos (Unsplash License: free to use, no attribution required; credits are kept anyway). Two steps, so a
// person checks every photo for faces before it ships:
//   node scripts/seed/fetch-test-photos.mjs candidates   # search per interest theme; contact sheets for review
//   node scripts/seed/fetch-test-photos.mjs build         # download the picks, crop 480x600, WebP, credits.json
// then re-run scripts/seed/gen-test-members-v3.mjs so the seed points at the photos.
// Picks live in scripts/seed/test-photo-picks.json: { "t061": "<unsplash photo id>", ... }. Candidates and sheets are
// written to scripts/seed/.photo-cache/ (git-ignored). Needs network access to unsplash.com and images.unsplash.com;
// set UNSPLASH_ACCESS_KEY to use the official API instead of the website's search endpoint.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const ROOT = new URL('../../', import.meta.url);
const CACHE = new URL('scripts/seed/.photo-cache/', ROOT);
const OUT = new URL('site/media/test-members/', ROOT);
const PICKS = new URL('scripts/seed/test-photo-picks.json', ROOT);
const members = JSON.parse(readFileSync(new URL('scripts/seed/test-members-v3.json', ROOT), 'utf8'));

// A search theme per top-level interest area; the query asks for faceless framing.
const THEMES = {
  tech: ['laptop hands coding', 'circuit board hands', 'desk setup laptop'],
  arts: ['hands painting', 'pottery hands', 'person sketching from behind'],
  business: ['notebook coffee laptop hands', 'presentation from behind', 'whiteboard hands'],
  community: ['volunteers hands planting', 'dog walk leash', 'beach cleanup hands'],
  food: ['hands cooking kitchen', 'coffee pour over hands', 'street food india'],
  games: ['chess board hands', 'board game hands', 'game controller hands'],
  learning: ['books reading hands', 'library from behind', 'telescope night sky'],
  lifestyle: ['traveller backpack from behind', 'indoor plants hands', 'motorcycle road india'],
  music: ['guitar hands', 'tabla hands', 'concert crowd from behind'],
  outdoors: ['hiker from behind mountains', 'trekking sahyadri', 'camping tent night'],
  sports: ['runner from behind', 'cricket bat ball', 'badminton racket shuttle'],
  stage_screen: ['camera hands filming', 'stage lights silhouette', 'dancer silhouette'],
  wellbeing: ['yoga silhouette sunrise', 'meditation hands', 'yoga mat from behind'],
};
const themeOf = (m) => THEMES[m.top.split('.')[0]];

const search = async (query) => {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  const url = key
    ? `https://api.unsplash.com/search/photos?per_page=30&orientation=portrait&query=${encodeURIComponent(query)}`
    : `https://unsplash.com/napi/search/photos?per_page=30&orientation=portrait&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, key ? { headers: { Authorization: `Client-ID ${key}` } } : {});
  if (!res.ok) throw new Error(`search "${query}": HTTP ${res.status}`);
  const data = await res.json();
  return data.results
    .filter((p) => !p.premium && !p.plus)   // Unsplash+ photos are not under the free license
    .map((p) => ({ id: p.id, raw: p.urls.raw, thumb: p.urls.small, by: p.user?.name, page: p.links?.html, alt: p.alt_description }));
};

const fetchBuffer = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

async function candidates() {
  mkdirSync(CACHE, { recursive: true });
  const queries = [...new Set(Object.values(THEMES).flat())];
  const all = {};
  for (const q of queries) {
    const found = await search(q);
    all[q] = found;
    // Contact sheet: 6 x 5 thumbnails, each 200 x 250, numbered, for the face check.
    const tiles = await Promise.all(found.map(async (p, i) => {
      const img = await sharp(await fetchBuffer(`${p.thumb}`)).resize(200, 250, { fit: 'cover' }).toBuffer();
      const label = Buffer.from(`<svg width="200" height="250"><rect x="0" y="0" width="34" height="24" fill="#000"/><text x="5" y="18" font-size="16" fill="#fff" font-family="sans-serif">${i}</text></svg>`);
      return sharp(img).composite([{ input: label, top: 0, left: 0 }]).toBuffer();
    }));
    const sheet = sharp({ create: { width: 1200, height: 1250, channels: 3, background: '#fff' } })
      .composite(tiles.map((input, i) => ({ input, left: (i % 6) * 200, top: Math.floor(i / 6) * 250 })));
    await sheet.jpeg({ quality: 70 }).toFile(new URL(`sheet-${q.replace(/\W+/g, '-')}.jpg`, CACHE).pathname);
    console.log(`${q}: ${found.length}`);
  }
  writeFileSync(new URL('candidates.json', CACHE), JSON.stringify(all, null, 1));
}

async function build() {
  mkdirSync(OUT, { recursive: true });
  const picks = JSON.parse(readFileSync(PICKS, 'utf8'));
  const all = JSON.parse(readFileSync(new URL('candidates.json', CACHE), 'utf8'));
  const byId = new Map(Object.values(all).flat().map((p) => [p.id, p]));
  const credits = existsSync(new URL('credits.json', OUT)) ? JSON.parse(readFileSync(new URL('credits.json', OUT), 'utf8')) : {};
  for (const m of members) {
    const id = picks[m.tag];
    if (!id) continue;
    const p = byId.get(id);
    if (!p) throw new Error(`${m.tag}: pick ${id} is not among the candidates`);
    const src = await fetchBuffer(`${p.raw}&w=720&q=80&fm=jpg`);
    await sharp(src).rotate().resize(480, 600, { fit: 'cover', position: 'attention' })
      .webp({ quality: 72, effort: 6 }).toFile(new URL(`${m.tag}.webp`, OUT).pathname);
    credits[m.tag] = { source: p.page, photographer: p.by, license: 'Unsplash License', faceless: true };
  }
  writeFileSync(new URL('credits.json', OUT), `${JSON.stringify(credits, null, 1)}\n`);
  console.log(`built ${Object.keys(credits).length} photos`);
}

const step = process.argv[2];
if (step === 'candidates') await candidates();
else if (step === 'build') await build();
else { console.error('usage: fetch-test-photos.mjs candidates|build'); process.exit(1); }
export { themeOf };
