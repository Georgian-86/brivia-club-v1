// Commenting never depends on the swipe limit (D-252, founder 2026-11-13: "if the free swipes get over, pls dont
// restrict comments"). Stubbed Supabase. PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/comment-at-limit.spec.mjs (:5286)
// CL1 with 0 swipes left (daily cap reached), a member opens a note and posts a comment: it is sent, the box clears, no
//     limit sheet opens, at 1440 (arriving from the deck) and 390.
import { startAppStub } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000002521';
const IMG = '/Images/Cover%20images/94978B9F-A399-43FC-AC48-0A41088B5D27.PNG';
const rows = [{ id: OTHER, name: 'Siddharth Kapoor', photo_url: null, cover_url: null, experience: 'Member', skills: ['Guitar'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: [] }];
const st = { rows, remaining: 0, dailyLimit: 10, resetsAt: new Date(Date.now() + 5 * 36e5).toISOString(),
  posts: [{ id: 'g1', author_id: OTHER, image_url: IMG, image_path: '', caption: "Let's catch up and jam", created_at: new Date().toISOString() }], comments: [] };
const stub = await startAppStub({ port: 5286, state: st, deckRows: rows });
const browser = await chromium.launch();
try {
  for (const [w, h, start] of [[1440, 900, 'home'], [390, 844, 'posts']]) {
    const ctx = await stub.newContext(browser, { width: w, height: h }, w < 500 ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: `/app.html?view=${start}` });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForTimeout(4000);
    if (start === 'home') { await page.evaluate(() => document.querySelector('[data-nav="posts"]')?.click()); await page.waitForTimeout(1500); }
    await page.locator('.post-card[data-post-id="g1"] .post-card-media').click();
    await page.waitForSelector('#post-comment-input', { timeout: 6000 });
    await page.fill('#post-comment-input', 'One in Mumbai Bruh 💤');
    const before = st.calls.length;
    await page.locator('.post-comment-send').click();
    await page.waitForTimeout(1500);
    const sent = st.calls.slice(before).filter((c) => /community_post_comments/.test(c.path) && c.method === 'POST').length;
    const ui = await page.evaluate(() => ({ input: document.querySelector('#post-comment-input')?.value, pitch: !document.querySelector('#pitch-modal')?.hidden }));
    check(`${w} CL1 at 0 swipes the comment is sent`, sent === 1, String(sent));
    check(`${w} CL1 the box clears and no limit sheet opens`, ui.input === '' && !ui.pitch, JSON.stringify(ui));
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('comment-at-limit: ALL PASSED');
