// Test world v3 (D-100): the generated seed stays in sync with its generator, and every photo it points at ships with
// the site, faceless-checked and credited. Run: node --test tests/unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const PHOTOS = new URL('site/media/test-members/', ROOT);

test('the v3 seed is exactly what the generator writes (never edited by hand)', () => {
  const before = read('supabase/seed/test-members-v3.sql');
  execFileSync(process.execPath, [new URL('scripts/seed/gen-test-members-v3.mjs', ROOT).pathname], { stdio: 'ignore' });
  assert.equal(read('supabase/seed/test-members-v3.sql'), before, 're-run scripts/seed/gen-test-members-v3.mjs and commit its output');
});

test('200 members t061-t260, unique names, mostly Indian cities from the spec', () => {
  const members = JSON.parse(read('scripts/seed/test-members-v3.json'));
  assert.equal(members.length, 200);
  assert.deepEqual(members.map((m) => m.n), Array.from({ length: 200 }, (_, i) => 61 + i));
  assert.equal(new Set(members.map((m) => m.name)).size, 200);
  const v2 = read('supabase/seed/test-members.sql');
  members.forEach((m) => assert.ok(!v2.includes(`'${m.name.replace(/'/g, "''")}'`), `${m.name} repeats a v2 name`));
  members.forEach((m) => assert.ok(m.interests.length >= 2 && m.interests.length <= 5));
});

test('every photo the seed points at ships, is a small WebP and has a credit', () => {
  const sql = read('supabase/seed/test-members-v3.sql');
  const paths = [...sql.matchAll(/'(\/media\/test-members\/t\d{3}\.webp)'/g)].map((m) => m[1]);
  const credits = existsSync(new URL('credits.json', PHOTOS)) ? JSON.parse(readFileSync(new URL('credits.json', PHOTOS), 'utf8')) : {};
  for (const p of paths) {
    const file = new URL(`site${p}`, ROOT);
    assert.ok(existsSync(file), `${p} is missing`);
    assert.ok(statSync(file).size < 80 * 1024, `${p} is over 80 KB`);
    const tag = p.match(/t\d{3}/)[0];
    assert.ok(credits[tag]?.source && credits[tag]?.faceless === true, `${tag} has no credit or was not checked for faces`);
  }
  // No stray photo without a seed row.
  if (existsSync(PHOTOS)) {
    const shipped = readdirSync(PHOTOS).filter((f) => f.endsWith('.webp')).map((f) => `/media/test-members/${f}`);
    assert.deepEqual(shipped.sort(), [...paths].sort());
  }
});
