// Edit your caption (D-234) and hear about a connection's new note (D-234, 0071), stubbed Supabase.
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/post-edit.spec.mjs   (Vite on :5208)
// PE1 your open post has "Edit caption" (>= 44 px); another member's does not.
// PE2 Edit shows the caption in a box; Cancel restores it untouched; an empty caption is refused with a reason.
// PE3 Save updates by id and author with the trimmed caption, shows it in the post and on the card, toasts.
// PE4 a refused save keeps the box open with a reason.
// PN6 a 'post_new' notification reads "Meera shared a new note" with the caption and opens that note.
// Axe clean (the open post while editing) at 390.
import { startAppStub, ME, ORIGIN } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000002001';
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
const IMG = '/Images/Cover%20images/94978B9F-A399-43FC-AC48-0A41088B5D27.PNG';
const posts = () => [
  { id: 'mine', author_id: ME, image_url: IMG, image_path: `${ME}/a.jpg`, caption: 'Evening at the club', created_at: ago(1) },
  { id: 'theirs', author_id: OTHER, image_url: IMG, image_path: '', caption: 'Chess night', created_at: ago(2) },
];
const note = { id: '00000000-0000-4000-8000-000000000234', notification_type: 'post_new', source_user_id: OTHER, name: 'Meera Iyer', photo_url: null, band: null,
  created_at: ago(0.2), read_at: null, dismissed_at: null, place_name: null, post_id: 'theirs', comment_id: null, snippet: 'Chess night', post_image_url: `${ORIGIN}/storage/v1/object/public/community-posts/${OTHER}/c.jpg`, event_id: null, event_image_url: null };
const st = { posts: posts(), matchIds: [OTHER], notifications: [note], rows: [{ id: OTHER, name: 'Meera Iyer', photo_url: null, cover_url: null, experience: 'Member', skills: ['Chess'], looking_for: ['Friends'] }] };
const stub = await startAppStub({ port: 5208, state: st });
const browser = await chromium.launch();
const card = (page, id) => page.locator(`.post-card[data-post-id="${id}"]`);
const toastHas = (page, re) => page.evaluate((src) => [...document.querySelectorAll('[role="status"], [role="alert"], .toast, #toast')].some((el) => new RegExp(src).test(el.textContent || '')), re);
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    st.posts = posts();
    st.notifications = [{ ...note }];
    st.routes = { 'PATCH community_posts': { body: [{ id: 'mine', caption: 'Badminton tonight at 7' }] } };
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const page = await stub.open(ctx, { path: '/app.html?view=posts' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const patches = [];
    page.on('request', (r) => { if (r.method() === 'PATCH' && r.url().includes('/rest/v1/community_posts')) patches.push({ url: decodeURIComponent(r.url()), body: r.postDataJSON() }); });
    await page.waitForSelector('.post-card[data-post-id="theirs"]', { timeout: 8000 });
    // PE1
    await card(page, 'theirs').locator('.post-card-media').click();
    await page.waitForSelector('#post-detail[open]');
    check(`${w} PE1 another member's post has no Edit caption`, (await page.locator('#post-detail [data-post-edit]').count()) === 0);
    await page.locator('[data-post-detail-close]').click();
    await page.waitForSelector('#post-detail', { state: 'detached' });
    await card(page, 'mine').locator('.post-card-media').click();
    await page.waitForSelector('#post-detail[open] [data-post-edit]');
    const eb = await page.locator('#post-detail [data-post-edit]').boundingBox();
    check(`${w} PE1 your post has Edit caption, >= 44 px`, eb && eb.height >= 44);
    // PE2
    await page.locator('#post-detail [data-post-edit]').click();
    check(`${w} PE2 the box holds the caption`, (await page.inputValue('#post-caption-edit-input')) === 'Evening at the club');
    if (w === 390) {
      const v = await axeViolations(page, { include: '#post-detail' });
      check('390 PE axe clean while editing', v.length === 0, JSON.stringify(v));
    }
    await page.fill('#post-caption-edit-input', 'changed but cancelled');
    await page.locator('[data-caption-cancel]').click();
    check(`${w} PE2 Cancel restores the caption`, (await page.textContent('#post-detail .post-detail-caption')) === 'Evening at the club' && (await page.locator('[data-caption-form]').count()) === 0 && patches.length === 0);
    await page.locator('#post-detail [data-post-edit]').click();
    await page.fill('#post-caption-edit-input', '   ');
    await page.locator('.post-caption-edit-save').click();
    check(`${w} PE2 an empty caption is refused`, /Write a caption/.test(await page.textContent('.post-caption-edit-error')) && patches.length === 0);
    // PE4
    st.routes = { 'PATCH community_posts': { status: 403, code: '42501', message: 'denied' } };
    await page.fill('#post-caption-edit-input', '  Badminton tonight at 7  ');
    await page.locator('.post-caption-edit-save').click();
    await page.waitForTimeout(500);
    check(`${w} PE4 a refused save keeps the box with a reason`, (await page.locator('[data-caption-form]').count()) === 1 && /could not be saved/.test(await page.textContent('.post-caption-edit-error')));
    // PE3
    st.routes = { 'PATCH community_posts': { body: [{ id: 'mine', caption: 'Badminton tonight at 7' }] } };
    await page.locator('.post-caption-edit-save').click();
    await page.waitForTimeout(600);
    const last = patches.at(-1) || {};
    check(`${w} PE3 saved by id and author, trimmed`, last.body?.caption === 'Badminton tonight at 7' && /id=eq\.mine/.test(last.url) && last.url.includes(`author_id=eq.${ME}`), JSON.stringify(last));
    check(`${w} PE3 the post shows the new caption`, (await page.textContent('#post-detail .post-detail-caption')) === 'Badminton tonight at 7');
    check(`${w} PE3 toast`, await toastHas(page, 'Caption updated'));
    await page.locator('[data-post-detail-close]').click();
    check(`${w} PE3 the card shows the new caption`, (await card(page, 'mine').locator('.post-card-caption').textContent()) === 'Badminton tonight at 7');
    // PN6
    await page.waitForSelector('#app-notification-button:not([hidden])', { timeout: 8000 });
    await page.click('#app-notification-button');
    await page.waitForSelector('#notification-list', { state: 'visible' });
    const row = page.locator('[data-post-note="n:theirs"]');
    const text = (await row.textContent()) || '';
    check(`${w} PN6 the new-note row reads right`, text.includes('Meera shared a new note') && text.includes('“Chess night”') && (await row.locator('.notification-post-kind.is-new').count()) === 1, text);
    await row.click();
    await page.waitForSelector('#post-detail[open]', { timeout: 5000 });
    check(`${w} PN6 it opens that note`, (await page.getAttribute('#post-detail', 'data-post-id')) === 'theirs');
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
