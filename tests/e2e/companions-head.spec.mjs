// D-218: the Companions header (title, note, event picker, "N looking for a companion") never overlaps at any window
// width: it is one row when everything fits, and the picker and count wrap to a second row when it does not.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/companions-head.spec.mjs   (Vite on :5192)
// HEAD_SHOTS=<dir> saves the header at each width.
import { mkdirSync } from 'node:fs';
import { startAppStub, PHOTO } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const day = (n, h) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(h - 5, 30, 0, 0); return d.toISOString(); };
const id = (n) => `dddddddd-dddd-4ddd-8ddd-0000000003${String(n).padStart(2, '0')}`;
const person = (n, name) => ({ member_id: id(n), name, photo_url: PHOTO(id(n)), cover_url: null, headline: 'Builder', looking_for: ['Friends'],
  interests: ['Tech'], shared_interests: ['Tech'], distance_band: '~3 km', shared_count: 1, connected: false });
const EVENTS = () => [{ event_id: 'e-quasar', title: 'Quasar 5.0: 36-Hour International Hackathon', starts_at: day(2, 10), ends_at: day(3, 18), venue_name: 'Thapar', venue_area: 'Patiala' }];
const st = { events: [], companionEvents: EVENTS(), companionDecks: { 'e-quasar': [person(1, 'Golu Kumar')] }, likedMe: [], companionMatches: [], matchIds: [] };
const shots = process.env.HEAD_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const stub = await startAppStub({ port: 5192, state: st });
const browser = await chromium.launch();
try {
  for (const w of [1080, 1180, 1280, 1366, 1440, 1600, 1920]) {
    const ctx = await stub.newContext(browser, { width: w, height: 900 });
    const page = await stub.open(ctx, { path: '/app.html?view=companions&event=e-quasar' });
    await page.waitForSelector('.companion-card.is-current', { timeout: 8000 });
    await page.waitForTimeout(300);
    const boxes = await page.evaluate(() => ['.companions-head > div:first-child', '.companions-note', '.companion-picker', '#companion-count']
      .map((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && r.width ? { s, l: r.left, r: r.right, t: r.top, b: r.bottom } : null; })
      .filter(Boolean));
    const hit = [];
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]; const b = boxes[j];
      if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) hit.push(`${a.s} x ${b.s}`);
    }
    const inside = boxes.every((b) => b.r <= w + 1);
    check(`${w}: the header's ${boxes.length} parts never overlap and stay on screen (${hit.join('; ') || 'none'})`, boxes.length === 4 && !hit.length && inside, JSON.stringify(boxes));
    if (shots) await page.locator('.companions-head').screenshot({ path: `${shots}/companions-head-${w}.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('companions-head: all checks passed');
