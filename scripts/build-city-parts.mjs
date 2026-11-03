// Builds site/public/data/cities/part-NN.json from the countries-states-cities database (D-140, migration 0035).
// Usage:
//   curl -LO https://github.com/dr5hn/countries-states-cities-database/releases/latest/download/csv-cities.csv.gz
//   gunzip csv-cities.csv.gz
//   node scripts/build-city-parts.mjs csv-cities.csv
// Then import the parts into the database (supabase/migrations/README.md "## 0035"). The data is ODbL: keep NOTICE.txt
// and the credit on the privacy page.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const source = process.argv[2];
if (!source) { console.error('Usage: node scripts/build-city-parts.mjs <csv-cities.csv>'); process.exit(1); }
const out = path.resolve('site/public/data/cities');
const PER_PART = 10000;

// A small RFC 4180 reader (quoted fields, doubled quotes, commas and newlines inside quotes).
const parseCsv = (text) => {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i += 1; row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
};

const [header, ...lines] = parseCsv(readFileSync(source, 'utf8'));
const col = Object.fromEntries(header.map((h, i) => [h, i]));
const rows = [];
for (const r of lines) {
  if (r.length < header.length) continue;
  const lat = Number(r[col.latitude]); const lng = Number(r[col.longitude]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  const pop = /^\d+$/.test(r[col.population]?.trim() || '') ? Number(r[col.population]) : null;
  rows.push([Number(r[col.id]), r[col.name], r[col.native] !== r[col.name] ? r[col.native] : '', r[col.state_name], r[col.state_code],
    r[col.country_code], r[col.country_name], Math.round(lat * 1e4) / 1e4, Math.round(lng * 1e4) / 1e4, pop, r[col.type]]);
}
rows.sort((a, b) => a[0] - b[0]);
mkdirSync(out, { recursive: true });
readdirSync(out).filter((f) => /^part-\d+\.json$/.test(f)).forEach((f) => unlinkSync(path.join(out, f)));
let parts = 0;
for (let i = 0; i < rows.length; i += PER_PART) {
  writeFileSync(path.join(out, `part-${String(parts).padStart(2, '0')}.json`), JSON.stringify(rows.slice(i, i + PER_PART)));
  parts += 1;
}
console.log(`${rows.length} cities in ${parts} parts (${out})`);
