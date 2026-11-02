// 0022 (D-122) adds catalogue interests to a database where 0017 already ran. Its rows must be in the TSV (the source
// of truth, which also feeds 0017) with the same id and label, and the TSV must still pass the builder's checks.
// Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCatalog, checkCatalog, catalogSql } from '../../scripts/build-interest-catalog.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const rows = parseCatalog(read('supabase/catalog/interest-catalog.tsv'));

test('the TSV passes the builder checks and 0017 holds exactly its rows', () => {
  assert.deepEqual(checkCatalog(rows), []);
  assert.ok(read('supabase/migrations/0017_interest_catalog.sql').includes(catalogSql(rows)), 'run node scripts/build-interest-catalog.mjs');
});

test('every 0022 row is a TSV row with the same id and label', () => {
  const sql = read('supabase/migrations/0022_interest_catalog_additions.sql');
  const added = [...sql.matchAll(/^\s+\('([a-z0-9_.]+)', '((?:[^']|'')+)'\),?;?$/gm)].map((m) => ({ id: m[1], label: m[2].replace(/''/g, "'") }));
  assert.equal(added.length, 9);
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const { id, label } of added) {
    assert.equal(byId.get(id)?.label, label, `${id} is not in the TSV as ${label}`);
    assert.equal(byId.get(id)?.kind, 'new');
  }
});
