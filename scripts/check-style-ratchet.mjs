// CLI: scans site/styles/*.css (not tokens.css, fonts*.css), compares to scripts/style-baseline.json, exits 1 on any
// increase. `--write` rewrites the baseline but refuses (exit 1) if any count rose.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countStyleDebt, compareToBaseline } from './style-ratchet.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(root, 'scripts', 'style-baseline.json');
const stylesDir = join(root, 'site', 'styles');
const files = readdirSync(stylesDir).filter((f) => f.endsWith('.css') && f !== 'tokens.css' && !f.startsWith('fonts')).sort();

const current = {};
for (const f of files) current[f] = countStyleDebt(readFileSync(join(stylesDir, f), 'utf8'));
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {};
const { ok, increases } = compareToBaseline(current, baseline);

if (process.argv.includes('--write')) {
  if (!ok && Object.keys(baseline).length) {
    for (const i of increases) console.error(`  ${i.file}: ${i.kind} ${i.from} -> ${i.to}`);
    console.error('Refusing to write the baseline: style debt rose.');
    process.exit(1);
  }
  writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n');
  console.log(`Wrote ${baselinePath} (${files.length} files).`);
  process.exit(0);
}

if (ok) { console.log('Style ratchet OK.'); process.exit(0); }
console.error('Style debt rose (use var(--color-*) / var(--font-*) from tokens.css):');
for (const i of increases) console.error(`  ${i.file}: ${i.kind} ${i.from} -> ${i.to}`);
process.exit(1);
