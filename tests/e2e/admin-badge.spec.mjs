// The Admin badge (D-246, 0076), against stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/admin-badge.spec.mjs   (Vite on :5178)
// AB1 my own profile (an admin): the eyebrow above my name says ADMIN (no second pill beside it).
// AB2 another admin: the badge in the chat list, the chat header and their public profile; a member without one: none.
// AB3 no axe violations on the badge; no page errors.
import { startAppStub, ME } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const CLUB = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000246';
const ASHA = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000247';
const card = (id, name) => ({ id, name, photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] });
const rows = [card(CLUB, 'THE BRIVIA CLUB'), card(ASHA, 'Asha Rao')];
const at = (m) => new Date(Date.now() - m * 6e4).toISOString();
const st = { rows, matchIds: [CLUB, ASHA], lastSeen: {}, messages: [
  { id: '0e760000-0000-4000-8000-0000000000a1', sender_id: CLUB, recipient_id: ME, body: 'Welcome to Brivia', created_at: at(5), delivered_at: at(5), read_at: null, edited_at: null, unsent_at: null },
  { id: '0e760000-0000-4000-8000-0000000000a2', sender_id: ASHA, recipient_id: ME, body: 'Hi!', created_at: at(4), delivered_at: at(4), read_at: null, edited_at: null, unsent_at: null },
], routes: { member_badge: { body: [{ member_id: ME, badge: 'admin' }, { member_id: CLUB, badge: 'admin' }] } } };
const stub = await startAppStub({ port: 5178, state: st, deckRows: rows });
const browser = await chromium.launch();
const shots = process.env.AB_SHOTS;
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const w = viewport.width;
    const ctx = await stub.newContext(browser, viewport, w < 500 ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: '/app.html?view=profile' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => document.querySelector('.profile-hero-copy .app-eyebrow')?.textContent.trim() === 'ADMIN', null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);   // past the hiring card's own repaint of the eyebrow
    check(`AB1 ${w}: my eyebrow says ADMIN`, (await page.locator('.profile-hero-copy .app-eyebrow').innerText()).trim() === 'ADMIN');
    check(`AB1 ${w}: no second pill beside my name`, await page.locator('#profile-name .admin-badge').count() === 0);
    if (shots) await page.screenshot({ path: `${shots}/profile-${w}.png` });
    await page.goto(`${stub.url}/app.html?view=chat`);
    await page.waitForSelector('.chat-row-open', { timeout: 8000 });
    check(`AB2 ${w}: the club's chat row has the badge`, await page.locator('.chat-row', { hasText: 'THE BRIVIA CLUB' }).locator('.admin-badge').count() === 1);
    check(`AB2 ${w}: Asha's chat row has none`, await page.locator('.chat-row', { hasText: 'Asha' }).locator('.admin-badge').count() === 0);
    await page.locator('.chat-row', { hasText: 'THE BRIVIA CLUB' }).locator('.chat-row-meta').click();
    await page.waitForSelector('#chat-name .admin-badge');
    check(`AB2 ${w}: the chat header has the badge`, true);
    const axe = await axeViolations(page, { include: '.admin-badge' });
    check(`AB3 ${w}: no axe violations`, axe.length === 0, JSON.stringify(axe));
    if (shots) await page.screenshot({ path: `${shots}/chat-${w}.png` });
    await page.locator('#chat-name').click();
    await page.waitForSelector('#public-profile-modal');
    check(`AB2 ${w}: the public profile has the badge`, await page.locator('#public-profile-modal h2 .admin-badge').count() === 1);
    if (shots) await page.screenshot({ path: `${shots}/public-${w}.png` });
    check(`AB3 ${w}: no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('admin-badge: ALL PASSED');
