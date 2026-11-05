// D-214 (0063): someone already connected who also wants company at the event is shown first in Companions, marked
// "You're already connected", with Text them · Make a plan (opens the chat) and Next instead of Pass / Connect; Next
// records no swipe; their profile says so too.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/companions-connected.spec.mjs   (Vite on :5189)
import { startAppStub, PHOTO } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const day = (n, h) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(h - 5, 30, 0, 0); return d.toISOString(); };
const id = (n) => `dddddddd-dddd-4ddd-8ddd-0000000002${String(n).padStart(2, '0')}`;
const person = (n, name, extra = {}) => ({ member_id: id(n), name, photo_url: PHOTO(id(n)), cover_url: null, headline: 'Builder', looking_for: ['Friends'],
  interests: ['Tech'], shared_interests: ['Tech'], distance_band: '~3 km', shared_count: 1, connected: false, ...extra });
const EVENTS = () => [{ event_id: 'e-quasar', title: 'Quasar 5.0', starts_at: day(2, 10), ends_at: day(3, 18), venue_name: 'Thapar', venue_area: 'Patiala' }];
const DECKS = () => ({ 'e-quasar': [person(1, 'Shanmukh Tawde', { connected: true }), person(2, 'Aanya Rao')] });
const st = { events: [], companionEvents: EVENTS(), companionDecks: DECKS(), likedMe: [], companionMatches: [], matchIds: [id(1)] };
const stub = await startAppStub({ port: 5189, state: st });
const browser = await chromium.launch();
try {
  for (const [w, h] of [[1440, 1000], [390, 844]]) {
    Object.assign(st, { companionEvents: EVENTS(), companionDecks: DECKS(), swipes: [], matchIds: [id(1)] });
    const ctx = await stub.newContext(browser, { width: w, height: h }, w < 780 ? { isMobile: true, hasTouch: true } : {});
    const errors = [];
    const page = await stub.open(ctx, { path: '/app.html?view=companions&event=e-quasar', errors });
    page.setDefaultTimeout(8000);
    await page.waitForSelector('.companion-card.is-current');
    await page.waitForTimeout(300);
    const card = await page.locator('.companion-card.is-current').innerText();
    check(`${w}: the connection is first, marked already connected (${JSON.stringify(card.slice(0, 80))})`, /YOU'RE ALREADY CONNECTED/i.test(card) && /Shanmukh/.test(card) && /text them to make a plan/i.test(card));
    check(`${w}: Text them · Make a plan and Next stand in for Pass / Connect`, await page.locator('.companion-actions').isHidden()
      && /Text Shanmukh · Make a plan/i.test(await page.locator('[data-companion-text]').innerText()) && await page.locator('[data-companion-next]').isVisible());
    const axe = await axeViolations(page, { include: '.companions-view' });
    check(`${w}: axe on the connected card`, axe.length === 0, JSON.stringify(axe));
    // Their profile says so too.
    await page.locator('.companion-card.is-current [data-companion-profile]').first().click();
    await page.waitForSelector('#public-profile-modal');
    const prof = await page.locator('#public-profile-modal').innerText();
    check(`${w}: the profile says already connected, with Text · Make a plan`, /You're already connected\./i.test(prof) && /Text Shanmukh · Make a plan/i.test(prof));
    await page.keyboard.press('Escape');
    // Next moves on without a swipe; the other person gets Pass / Connect.
    await page.locator('[data-companion-next]').click();
    await page.waitForTimeout(200);
    check(`${w}: Next shows the next person with Pass / Connect, no swipe recorded`, /Aanya/.test(await page.locator('.companion-card.is-current').innerText())
      && await page.locator('.companion-actions').isVisible() && await page.locator('[data-companion-connected]').isHidden() && (st.swipes || []).length === 0);
    check(`${w}: no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
  // Text opens the chat (its own run, so the deck is fresh).
  Object.assign(st, { companionEvents: EVENTS(), companionDecks: DECKS(), swipes: [], matchIds: [id(1)] });
  const ctx = await stub.newContext(browser, { width: 1440, height: 1000 });
  const page = await stub.open(ctx, { path: '/app.html?view=companions&event=e-quasar' });
  await page.waitForSelector('[data-companion-text]:visible');
  await page.locator('[data-companion-text]').click();
  await page.waitForFunction(() => document.body.dataset.appView === 'chat', null, { timeout: 6000 }).catch(() => {});
  check('Text them opens the chat with them', await page.evaluate(() => document.body.dataset.appView) === 'chat');
  await ctx.close();
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
