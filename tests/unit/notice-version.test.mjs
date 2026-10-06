// The privacy notice version must be one string in three places (R1, R10): privacy.html (shown to members),
// notice-version.js (what the client declares against) and brivia_notice_version() in migration 0005 (what the server
// accepts). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NOTICE_VERSION } from '../../notice-version.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('privacy.html, notice-version.js and brivia_notice_version() carry the same version', () => {
  const html = read('privacy.html');
  const sql = read('supabase/migrations/0005_p0b_dpdp_safety.sql');
  const fn = sql.match(/function public\.brivia_notice_version\(\)[\s\S]*?as \$\$ select '([^']+)'::text \$\$/);
  assert.ok(fn, 'brivia_notice_version() body not found in 0005');
  const page = html.match(/data-notice-version="([^"]+)"/);
  assert.ok(page, 'privacy.html has no data-notice-version attribute');
  assert.match(NOTICE_VERSION, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(page[1], NOTICE_VERSION);
  assert.equal(fn[1], NOTICE_VERSION);
  assert.ok(html.includes(`Version ${NOTICE_VERSION} · effective 5 October 2026`), 'the visible version line is missing or differs');
});

test('privacy.html names the grievance contact and the retention rows the purge implements', () => {
  const html = read('privacy.html');
  const sql = read('supabase/migrations/0005_p0b_dpdp_safety.sql');
  assert.ok(html.includes('thebrivia.club@gmail.com'));
  assert.ok(html.includes('Supabase, Mumbai (ap-south-1), India'));
  // The purge's intervals: every one must appear as a row in the table.
  const purge = sql.slice(sql.indexOf('create or replace function public.purge_expired_requests()'));
  assert.match(purge, /event in \('like', 'pass'\) and created_at <= now\(\) - interval '180 days'/);
  assert.match(purge, /interval '365 days'/);
  for (const row of ['180 days', '365 days', '30 days', '24 hours', '90 days']) assert.ok(html.includes(row), `retention table lacks "${row}"`);
});
