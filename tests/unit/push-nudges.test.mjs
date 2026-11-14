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

// D-265 (founder: "make sure different notifications should be sent in a day"): the four nudges are four different
// notifications, and on the phone they sit side by side; none replaces another. Runs the real service worker
// (site/public/sw.js) with a fake registration: four pushes in one day leave four notifications on the screen.
test('the service worker keeps all four nudges of a day as separate notifications', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../../site/public/sw.js', import.meta.url), 'utf8');
  const shown = new Map();   // tag -> notification, as the OS does: a new one with the same tag replaces the old
  const handlers = {};
  const self = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    clients: { matchAll: async () => [], claim: async () => {} },   // the app is closed: the phone shows it
    registration: { showNotification: async (title, opts) => { shown.set(opts.tag, { title, ...opts }); } },
    location: { origin: 'https://thebriviaclub.live' },
    skipWaiting: () => {},
  };
  const caches = { open: async () => ({ match: async () => null }) };
  new Function('self', 'caches', src)(self, caches);
  for (const n of NUDGES) {
    let done;
    handlers.push({ data: { json: () => nudgePayload(n.slot) }, waitUntil: (p) => { done = p; } });
    await done;
  }
  assert.equal(shown.size, 4);
  assert.deepEqual([...shown.values()].map((x) => [x.title, x.body]), NUDGES.map((n) => [n.title, n.body]));
  assert.equal(new Set(NUDGES.map((n) => `${n.title}|${n.body}`)).size, 4, 'four different texts');
  // Tomorrow's noon nudge replaces today's noon one (no pile-up of the same line), the others stay.
  let done;
  handlers.push({ data: { json: () => nudgePayload('noon') }, waitUntil: (p) => { done = p; } });
  await done;
  assert.equal(shown.size, 4);
});

test('each slot has its own push topic, so a phone that was offline still gets every one', () => {
  const topics = NUDGES.map((n) => nudgePayload(n.slot).tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32));
  assert.equal(new Set(topics).size, 4);
});

// D-265 (founder: "i want the notifications on the phone screen not in app notifications"): with Brivia open and in
// front, a nudge still goes to the phone's notification screen; a chat push is still shown inside the app.
test('a nudge goes to the phone screen even with Brivia open; other pushes stay in the app', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../../site/public/sw.js', import.meta.url), 'utf8');
  const shown = [];
  const posted = [];
  const handlers = {};
  const page = { focused: true, visibilityState: 'visible', url: 'https://thebriviaclub.live/app.html', postMessage: (m) => posted.push(m) };
  const self = {
    addEventListener: (type, fn) => { handlers[type] = fn; },
    clients: { matchAll: async () => [page], claim: async () => {} },
    registration: { showNotification: async (title, opts) => { shown.push({ title, ...opts }); } },
    location: { origin: 'https://thebriviaclub.live' },
    skipWaiting: () => {},
  };
  new Function('self', 'caches', src)(self, { open: async () => ({ match: async () => null }) });
  const push = async (data) => { let done; handlers.push({ data: { json: () => data }, waitUntil: (p) => { done = p; } }); await done; };
  await push(nudgePayload('chai'));
  assert.deepEqual(shown.map((n) => n.title), ['Ek Kachori Do Chai']);
  assert.equal(posted.length, 0, 'the nudge is not shown inside the app');
  await push({ type: 'message', tag: 'msg-x', title: 'Asha', body: 'hi' });
  assert.equal(shown.length, 1);
  assert.equal(posted.length, 1);
});
