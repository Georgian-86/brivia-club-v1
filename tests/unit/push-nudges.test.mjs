import test from 'node:test';
import assert from 'node:assert/strict';
import { NUDGES, nudgeFor, nudgePayload } from '../../supabase/functions/_shared/nudges.js';

test('four nudges in the founder\'s words, in order through the day', () => {
  assert.deepEqual(NUDGES.map((n) => n.slot), ['noon', 'afternoon', 'chai', 'night']);
  assert.equal(nudgeFor('noon').title, 'Bore horhe ho?');
  assert.equal(nudgeFor('noon').body, 'Brivia pr swipe krlo');
  assert.equal(nudgeFor('afternoon').body, 'Brivia se Itni Jaldi Bore hogye?');
  assert.equal(nudgeFor('chai').title, 'Ek Kachori Do Chai');
  assert.equal(nudgeFor('chai').body, 'Brivia pr Swipe ho jaye');
  assert.equal(nudgeFor('night').title, 'Career ki Tension Horhi hai?');
  assert.equal(nudgeFor('night').body, 'Brivia pr Referral Maanglo');
});

test('the day slots are 3 hours apart in IST and each cron is its IST time in UTC', () => {
  const mins = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const day = NUDGES.slice(0, 3).map((n) => mins(n.ist));
  assert.deepEqual([day[1] - day[0], day[2] - day[1]], [180, 180]);
  assert.ok(mins(nudgeFor('night').ist) >= 21 * 60, 'the last one is at night');
  for (const n of NUDGES) {
    const [m, h] = n.cron.split(' ').map(Number);
    assert.equal(((h * 60 + m) + 330) % 1440, mins(n.ist), n.slot);
  }
});

test('payload: one tag per slot, unknown slots send nothing', () => {
  assert.deepEqual(nudgePayload('chai'), { id: null, tag: 'nudge-chai', type: 'nudge', title: 'Ek Kachori Do Chai', body: 'Brivia pr Swipe ho jaye', url: '/app.html' });
  assert.equal(nudgePayload('midnight'), null);
});

test('0082 schedules the same slots at the same UTC times', async () => {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile(new URL('../../supabase/migrations/0082_daily_nudges.sql', import.meta.url), 'utf8');
  const jobs = [...sql.matchAll(/\('brivia-nudge-(\w+)', '([^']+)', '(\w+)'\)/g)].map((m) => ({ slot: m[3], cron: m[2] }));
  assert.deepEqual(jobs, NUDGES.map((n) => ({ slot: n.slot, cron: n.cron })));
  const allowed = sql.match(/p_slot not in \(([^)]+)\)/)[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(allowed, NUDGES.map((n) => n.slot));
});
