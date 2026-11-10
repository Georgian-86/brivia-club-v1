// Delete your own post (D-233, founder 2026-11-10: "pls give an option to delete the post, i mistakenly posted
// something"), stubbed Supabase.
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/post-delete.spec.mjs   (Vite on :5207)
// PD1 only your own post card has "Delete your post" (>= 44 px); another member's card has none.
// PD2 dismissing the confirm keeps the post and sends nothing.
// PD3 confirming deletes it by id and author, removes your image file, takes the card away, toasts "Post deleted."
// PD4 the open post (detail) of your own post has "Delete post", which deletes and closes it; others' posts do not.
// PD5 a refused delete keeps the post and says it could not be deleted. Axe clean at 390.
import { startAppStub, ME } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000001901';
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
const IMG = '/Images/Cover%20images/94978B9F-A399-43FC-AC48-0A41088B5D27.PNG';
const posts = () => [
  { id: 'mine-1', author_id: ME, image_url: IMG, image_path: `${ME}/a.jpg`, caption: 'Oops, wrong photo', created_at: ago(1) },
  { id: 'mine-2', author_id: ME, image_url: IMG, image_path: `${ME}/b.jpg`, caption: 'Evening at the club', created_at: ago(2) },
  { id: 'theirs', author_id: OTHER, image_url: IMG, image_path: '', caption: 'Chess night', created_at: ago(3) },
];
const st = { posts: posts(), rows: [{ id: OTHER, name: 'Meera Iyer', photo_url: null, cover_url: null, experience: 'Member', skills: ['Chess'], looking_for: ['Friends'] }] };
const stub = await startAppStub({ port: 5207, state: st });
const browser = await chromium.launch();
const card = (page, id) => page.locator(`.post-card[data-post-id="${id}"]`);
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    st.posts = posts();
    st.routes = { 'DELETE community_posts': { body: [{ id: 'x' }] } };
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const page = await stub.open(ctx, { path: '/app.html?view=posts' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const deletes = [];
    const removes = [];
    page.on('request', (r) => {
      if (r.method() === 'DELETE' && r.url().includes('/rest/v1/community_posts')) deletes.push(decodeURIComponent(r.url()));
      if (r.url().includes('/storage/v1/object/community-posts') && r.method() === 'DELETE') removes.push(r.postData() || '');
    });
    await page.waitForSelector('.post-card[data-post-id="theirs"]', { timeout: 8000 });
    // PD1
    const own = await card(page, 'mine-1').locator('[data-post-action="delete"]').boundingBox();
    check(`${w} PD1 your card has Delete, >= 44 px`, own && own.height >= 44 && own.width >= 44, JSON.stringify(own));
    check(`${w} PD1 another member's card has none`, (await card(page, 'theirs').locator('[data-post-action="delete"]').count()) === 0);
    if (w === 390) {
      const v = await axeViolations(page, { include: '#community-post-list' });
      check('390 PD5 the feed is axe clean', v.length === 0, JSON.stringify(v));
    }
    // PD2
    page.once('dialog', (d) => d.dismiss());
    await card(page, 'mine-1').locator('[data-post-action="delete"]').click();
    await page.waitForTimeout(300);
    check(`${w} PD2 dismiss keeps it, sends nothing`, (await card(page, 'mine-1').count()) === 1 && deletes.length === 0);
    // PD3
    let asked = '';
    page.once('dialog', (d) => { asked = d.message(); d.accept(); });
    await card(page, 'mine-1').locator('[data-post-action="delete"]').click();
    await page.waitForTimeout(700);
    check(`${w} PD3 confirm says what happens`, /Delete this post\?/.test(asked), asked);
    check(`${w} PD3 deleted by id and author`, deletes.length === 1 && deletes[0].includes('id=eq.mine-1') && deletes[0].includes(`author_id=eq.${ME}`), JSON.stringify(deletes));
    check(`${w} PD3 your image file is removed`, removes.length === 1 && removes[0].includes(`${ME}/a.jpg`), JSON.stringify(removes));
    check(`${w} PD3 the card is gone, others stay`, (await card(page, 'mine-1').count()) === 0 && (await card(page, 'theirs').count()) === 1);
    check(`${w} PD3 toast`, await page.evaluate(() => [...document.querySelectorAll('[role="status"], .toast, #toast')].some((el) => /Post deleted\./.test(el.textContent || ''))));
    // PD4 others' detail has no Delete
    await card(page, 'theirs').locator('.post-card-media').click();
    await page.waitForSelector('#post-detail[open]');
    check(`${w} PD4 another member's open post has no Delete`, (await page.locator('#post-detail [data-post-delete]').count()) === 0);
    await page.locator('[data-post-detail-close]').click();
    await page.waitForSelector('#post-detail', { state: 'detached' });
    // PD5 refused delete (from the detail of mine-2)
    st.routes = { 'DELETE community_posts': { status: 403, code: '42501', message: 'denied' } };
    await card(page, 'mine-2').locator('.post-card-media').click();
    await page.waitForSelector('#post-detail[open] [data-post-delete]');
    const d = await page.locator('#post-detail [data-post-delete]').boundingBox();
    check(`${w} PD4 your open post has Delete post, >= 44 px`, d && d.height >= 44);
    page.once('dialog', (dl) => dl.accept());
    await page.locator('#post-detail [data-post-delete]').click();
    await page.waitForTimeout(700);
    check(`${w} PD5 a refused delete keeps the post and says so`, (await page.locator('#post-detail[open]').count()) === 1 && (await card(page, 'mine-2').count()) === 1
      && await page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"], .toast, #toast')].some((el) => /could not be deleted/.test(el.textContent || ''))));
    // PD4 delete from the detail
    st.routes = { 'DELETE community_posts': { body: [{ id: 'mine-2' }] } };
    page.once('dialog', (dl) => dl.accept());
    await page.locator('#post-detail [data-post-delete]').click();
    await page.waitForTimeout(800);
    check(`${w} PD4 Delete post deletes and closes the post`, (await page.locator('#post-detail').count()) === 0 && (await card(page, 'mine-2').count()) === 0);
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
