// Phone notifications (D-245), against stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/push-install.spec.mjs   (Vite on :5177)
// PI1 iPhone, Safari tab: the Web notifications switch is not greyed out; a tap shows the Safari Home Screen steps,
//     and the switch stays off. No axe violations in the steps.
// PI2 iPhone, inside the Google app: the steps start with "Open in Safari" and offer "Copy the Brivia link".
// PI3 sending a chat message asks push-notify to tell the other member ({ to }); three quick sends make one call.
import { startAppStub } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000245';
const rows = [{ id: OTHER, name: 'Tanishq Verma', photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] }];
const st = { rows, matchIds: [OTHER], messages: [], lastSeen: {} };
const stub = await startAppStub({ port: 5177, state: st, deckRows: rows });
const browser = await chromium.launch();
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const openSettings = async (ua) => {
  const ctx = await stub.newContext(browser, { width: 390, height: 844 }, { isMobile: true, hasTouch: true, userAgent: ua });
  const page = await stub.open(ctx, { path: '/app.html?view=profile' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.locator('#profile-settings-button').click();
  await page.locator('[data-profile-setting="notifications"]').click();
  await page.waitForSelector('#profile-push-toggle');
  return { ctx, page, errors };
};

try {
  {
    const { ctx, page, errors } = await openSettings(`${IPHONE} Version/18.0 Safari/604.1`);
    check('PI1 the switch is not greyed out on an iPhone tab', !(await page.locator('#profile-push-toggle').isDisabled()));
    await page.locator('label:has(#profile-push-toggle)').click();
    await page.waitForSelector('[data-push-install]');
    const text = await page.locator('[data-push-install]').innerText();
    check('PI1 a tap shows the Safari steps', /Add to Home Screen/.test(text) && /bottom of Safari/.test(text), text);
    check('PI1 the switch stays off', !(await page.locator('#profile-push-toggle').isChecked()));
    const axe = await axeViolations(page, { include: '[data-push-install]' });
    check('PI1 no axe violations in the steps', axe.length === 0, JSON.stringify(axe));
    if (process.env.PI_SHOTS) await page.screenshot({ path: `${process.env.PI_SHOTS}/steps-safari.png` });
    check('PI1 no page errors', errors.length === 0, errors.join('; '));
    await ctx.close();
  }
  {
    const { ctx, page } = await openSettings(`${IPHONE} GSA/350.0.0 Safari/604.1`);
    await page.locator('label:has(#profile-push-toggle)').click();
    await page.waitForSelector('[data-push-install]');
    const text = await page.locator('[data-push-install]').innerText();
    check('PI2 inside the Google app the steps start with Open in Safari', /Open in Safari/.test(text), text);
    check('PI2 and offer to copy the link', await page.locator('[data-push-copy]').count() === 1);
    await page.waitForTimeout(600);
    if (process.env.PI_SHOTS) { await page.locator('[data-push-install]').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.PI_SHOTS}/steps-google.png` }); }
    check('PI2 the steps are fully visible (not faded)', Number(await page.locator('[data-push-install]').evaluate((el) => { let o = 1; for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; })) > 0.95);
    await ctx.close();
  }
  {
    const ctx = await stub.newContext(browser, { width: 1280, height: 860 });
    const page = await stub.open(ctx, { path: '/app.html?view=chat' });
    await page.waitForSelector('.chat-row-open', { timeout: 8000 });
    await page.locator('.chat-row-open', { hasText: 'Tanishq' }).click();
    await page.waitForSelector('#chat-input');
    const before = st.calls.filter((c) => c.path === '/functions/v1/push-notify').length;
    for (const text of ['Hey', 'are you around?', 'chess at 8']) { await page.fill('#chat-input', text); await page.keyboard.press('Enter'); await page.waitForTimeout(250); }
    await page.waitForTimeout(2200);
    const calls = st.calls.filter((c) => c.path === '/functions/v1/push-notify').slice(before).map((c) => JSON.parse(c.body || '{}'));
    check('PI3 three quick sends make one push call to the other member', calls.length === 1 && calls[0].to === OTHER, JSON.stringify(calls));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('push-install: ALL PASSED');
