// "Liked by" (D-242, 0074), stubbed Supabase.
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/post-likers.spec.mjs   (Vite on :5265)
// LK1 a liked note's "Liked by …" line (card and open note) is a button; a note with no likes keeps the muted line.
// LK2 it opens "Liked by" with each liker (name, photo, "Connection"), asked by post id; Escape closes it.
// LK3 a liker opens their profile. Axe clean (the sheet) at 390; rows >= 44 px.
import { startAppStub, ME, ORIGIN } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000002801'; const B = 'aaaaaaaa-aaaa-4aaa-8aaa-000000002802';
const IMG = '/Images/Cover%20images/94978B9F-A399-43FC-AC48-0A41088B5D27.PNG';
const at = (h) => new Date(Date.now() - h * 36e5).toISOString();
const st = {
  matchIds: [A],
  rows: [{ id: A, name: 'Asha Rao', photo_url: null, cover_url: null, experience: 'Designer', skills: ['Chess'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: [] },
         { id: B, name: 'Ravi Kumar', photo_url: null, cover_url: null, experience: 'Engineer', skills: ['Chess'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: [] }],
  posts: [
    { id: 'mine', author_id: ME, image_url: IMG, image_path: '', caption: 'My note', created_at: at(1) },
    { id: 'quiet', author_id: ME, image_url: IMG, image_path: '', caption: 'No likes yet', created_at: at(2) },
  ],
  activity: [
    { post_id: 'mine', like_count: 2, liked_by_me: false, comment_count: 0, share_count: 0, connection_likers: [A] },
    { post_id: 'quiet', like_count: 0, liked_by_me: false, comment_count: 0, share_count: 0, connection_likers: [] },
  ],
  routes: { 'rpc/post_likers': { body: [
    { member_id: B, name: 'Ravi Kumar', photo_url: `${ORIGIN}/storage/v1/object/public/profile-photos/${B}/p.jpg`, liked_at: at(0.1), is_connection: false },
    { member_id: A, name: 'Asha Rao', photo_url: null, liked_at: at(0.2), is_connection: true },
  ] } },
};
const stub = await startAppStub({ port: 5265, state: st });
const browser = await chromium.launch();
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const asks = [];
    ctx.on('request', (r) => { if (r.url().includes('/rpc/post_likers')) asks.push(r.postDataJSON()); });
    const page = await stub.open(ctx, { path: '/app.html?view=posts' });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForSelector('.post-card[data-post-id="mine"] [data-post-likers]', { timeout: 8000 });
    // LK1
    const quiet = await page.locator('.post-card[data-post-id="quiet"] [data-post-likers]').count();
    check(`${w} LK1 a liked note's line is a button, an unliked one is not`, quiet === 0 && (await page.locator('.post-card[data-post-id="mine"] button[data-post-likers]').count()) === 1);
    // LK2 from the card
    await page.locator('.post-card[data-post-id="mine"] [data-post-likers]').click();
    await page.waitForSelector('dialog.likers-sheet[open] .likers-row');
    const rows = await page.$$eval('dialog.likers-sheet .likers-row', (els) => els.map((e) => [e.querySelector('.likers-name').textContent, e.querySelector('small')?.textContent || '', Math.round(e.getBoundingClientRect().height)]));
    check(`${w} LK2 every liker, connections marked, asked by post id`, JSON.stringify(rows.map((r) => r.slice(0, 2))) === '[["Ravi Kumar",""],["Asha Rao","Connection"]]' && asks.at(-1)?.p_post_id === 'mine', JSON.stringify({ rows, asks }));
    check(`${w} LK3 rows >= 44 px`, rows.every((r) => r[2] >= 44), JSON.stringify(rows));
    if (w === 390) { const v = await axeViolations(page, { include: 'dialog.likers-sheet' }); check('390 LK3 the sheet is axe clean', v.length === 0, JSON.stringify(v)); }
    await page.keyboard.press('Escape');
    check(`${w} LK2 Escape closes it`, (await page.locator('dialog.likers-sheet').count()) === 0);
    // From the open note
    await page.locator('.post-card[data-post-id="mine"] .post-card-media').click();
    await page.waitForSelector('#post-detail[open] [data-post-likers]');
    await page.locator('#post-detail [data-post-likers]').click();
    await page.waitForSelector('dialog.likers-sheet[open] .likers-row');
    check(`${w} LK2 also from the open note`, (await page.locator('dialog.likers-sheet .likers-row').count()) === 2);
    // LK3
    await page.locator('dialog.likers-sheet .likers-row', { hasText: 'Asha Rao' }).click();
    await page.waitForTimeout(800);
    const profile = await page.evaluate(() => document.querySelector('#public-profile-modal')?.textContent || '');
    check(`${w} LK3 a liker opens their profile`, /Asha Rao/.test(profile) && (await page.locator('dialog.likers-sheet').count()) === 0, profile.slice(0, 80));
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
