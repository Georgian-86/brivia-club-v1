// CLI: walks dist/assets, prints oversize media, exits 1 on any. Run after `npm run build`.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAssetBudget } from './asset-budget.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'dist', 'assets');
if (!existsSync(dir)) { console.error('dist/assets not found. Run `npm run build` first.'); process.exit(2); }

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = join(d, e.name);
  return e.isDirectory() ? walk(p) : [{ path: relative(root, p), bytes: statSync(p).size }];
});

const { ok, violations } = checkAssetBudget(walk(dir));
const mb = (b) => `${(b / 1048576).toFixed(2)} MB`;
if (ok) { console.log('Asset budget OK.'); process.exit(0); }
console.error(`Asset budget exceeded (${violations.length} file${violations.length === 1 ? '' : 's'}):`);
for (const v of violations.sort((a, b) => b.bytes - a.bytes)) {
  console.error(`  ${mb(v.bytes).padStart(10)}  limit ${mb(v.limit).padStart(8)}  ${v.path}`);
}
process.exit(1);
