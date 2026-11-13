// The Hiring switch gives the deck back when it is turned off (D-253, founder 2026-11-13: "once I click on hiring,
// then I am not able to go back to normal"). Stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/hiring-off.spec.mjs   (Vite on :5288)
// HO1 the deck starts with its own first card; Hiring on shows a hirer from outside the deck first; Hiring off shows
//     the deck's own first card again, and the hirer the lens brought in is gone from the queue. At 1440 and 390.
import { startAppStub } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const card = (n, name) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-0000000025${String(n).padStart(2, '0')}`, name, photo_url: null, cover_url: null, experience: 'Member', skills: ['Chess'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: [] });
const deckRows = [card(1, 'Aditya Rao'), card(2, 'Bina Shah'), card(3, 'Chirag Mehta')];
const HIRER = card(9, 'Hirings in Chess Sector');
const st = { rows: [...deckRows, HIRER], remaining: 10, routes: {
  'rpc/my_role_intent': { body: [] }, 'rpc/my_hiring_roles': { body: [] }, 'rpc/member_open_to': { body: [] },
  'rpc/member_hiring': { body: [{ member_id: HIRER.id, best_title: 'Chess Coach', fits: true, roles: [{ id: 'a0a00000-0000-4000-8000-000000002501', title: 'Chess Coach', family: 'education', level: 'mid', work_mode: 'onsite', help: 'hiring', company: null, about: null, opened_days: 1, fit: 0.8, accepting: true, asked: false }] }] },
  'rpc/hiring_suggestions': { body: [] }, 'rpc/my_sent_role_asks': { body: [] },
  'rpc/hiring_people_v2': { body: [{ id: HIRER.id, fit: 0.8, role_title: 'Chess Coach', distance_band: '~10 km', hiring_kind: 'hiring', score: 0.8, request_pending: false }] },
  'rpc/hiring_people': { body: [{ id: HIRER.id, fit: 0.8, role_title: 'Chess Coach', distance_band: '~10 km' }] },
} };
const stub = await startAppStub({ port: 5288, state: st, deckRows });
const browser = await chromium.launch();
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    st.passed = new Set();   // the stub remembers passes: each viewport starts with the full deck
    const ctx = await stub.newContext(browser, { width: w, height: h }, w < 500 ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: '/app.html?view=home' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => document.querySelector('#swipe-name')?.textContent.trim());
    await page.waitForTimeout(4500);
    const name = () => page.evaluate(() => document.querySelector('#swipe-name')?.textContent.trim());
    const first = await name();
    await page.locator('#hiring-toggle').click();
    await page.waitForTimeout(1500);
    const on = await name();
    await page.locator('#hiring-toggle').click();
    await page.waitForTimeout(1200);
    const off = await name();
    const pressed = await page.locator('#hiring-toggle').getAttribute('aria-pressed').catch(() => null);
    check(`${w} HO1 the deck starts with its own card`, first === 'Aditya Rao', first);
    check(`${w} HO1 Hiring on shows the hirer first`, on === HIRER.name, on);
    check(`${w} HO1 Hiring off shows the deck's own first card again`, off === 'Aditya Rao' && pressed !== 'true', `${off} ${pressed}`);
    // Swipe through the deck: the hirer the lens brought in does not come back.
    const seen = [];
    for (let i = 0; i < 3; i += 1) { seen.push(await name()); await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(700); }
    check(`${w} HO1 the hirer the lens brought in has left the queue`, !seen.includes(HIRER.name), JSON.stringify(seen));
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('hiring-off: ALL PASSED');
