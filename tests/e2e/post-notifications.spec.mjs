// Likes and comments on my notes, the Read receipts switch and the Notes tab (D-151, 0043), against stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/post-notifications.spec.mjs   (Vite on :5175)
// PN1 two likes on one note are one row ("Ravi and Asha liked your note", newest first) with the note's thumbnail; a comment is its own
//     row quoting its words; the bell counts the unread rows.
// PN2 opening the panel marks them read on the server (as every notification, D-134); a row opens the Notes view.
// PN6 (D-243) a like row shows who (two faces, "See all 2") and opens "Liked by" with both people; "View note"
//     then opens Notes. A comment row still opens the note at once.
// PN3 Settings shows READ RECEIPTS (on); turning it off saves set_read_receipts(false).
// PN4 the nav says Notes.  PN5 before 0043 (v2 only, no receipts functions): no post rows, the switch stays hidden.
// PN_SHOTS=<dir> saves the open panel at 390 and 1440.
import { mkdirSync } from 'node:fs';
import { startAppStub, ME, ORIGIN } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000151';
const B = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000152';
const POST = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000151';
const img = `${ORIGIN}/storage/v1/object/public/community-posts/${ME}/note.jpg`;
const at = (m) => new Date(Date.now() - m * 6e4).toISOString();
const note = (id, type, src, name, mins, extra = {}) => ({ id, notification_type: type, source_user_id: src, name, photo_url: null, band: null, created_at: at(mins), read_at: null, dismissed_at: null, place_name: null, post_id: POST, comment_id: null, snippet: null, post_image_url: img, ...extra });
const fresh = () => [
  note('00000000-0000-4000-8000-0000000000n1', 'post_like', A, 'Asha Rao', 30),
  note('00000000-0000-4000-8000-0000000000n2', 'post_like', B, 'Ravi Kumar', 20),
  note('00000000-0000-4000-8000-0000000000n3', 'post_comment', B, 'Ravi Kumar', 15, { comment_id: '00000000-0000-4000-8000-0000000000c1', snippet: 'Where is this café?' }),
];
const shots = process.env.PN_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const st = { matchIds: [], notifications: fresh(), posts: [] };
const stub = await startAppStub({ port: 5175, state: st });
const browser = await chromium.launch();
const openPanel = async (page) => {
  await page.waitForSelector('#app-notification-button:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(400);
  const badge = await page.textContent('#notification-badge');
  await page.click('#app-notification-button');
  await page.waitForSelector('#notification-list', { state: 'visible' });
  return badge;
};
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    st.notifications = fresh();
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const page = await stub.open(ctx, { path: '/app.html?view=home' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const nav = await page.$$eval('[data-nav="posts"]', (els) => els.map((e) => e.textContent.trim()).filter(Boolean));
    check(`${w} PN4 the nav says Notes`, nav.length > 0 && nav.every((t) => /Notes/.test(t)) && !nav.some((t) => /Posts/.test(t)), JSON.stringify(nav));
    const badge = await openPanel(page);
    check(`${w} PN1 the bell counts two unread rows`, badge === '2', badge);
    const rows = await page.$$eval('.notification-post', (els) => els.map((el) => ({ title: el.querySelector('strong')?.textContent, line: el.querySelector('.notification-nearby-copy span')?.textContent || '', thumb: Boolean(el.querySelector('.notification-post-thumb img')) })));
    check(`${w} PN1 rows: the comment, then the likes`, rows.length === 2 && rows[0].title === 'Ravi commented on your note' && rows[0].line === 'Where is this café?' && rows[1].title === 'Ravi and Asha liked your note', JSON.stringify(rows));
    check(`${w} PN1 each row shows the note`, rows.every((r) => r.thumb), JSON.stringify(rows));
    if (shots) await page.screenshot({ path: `${shots}/post-notes-${w}.png` });
    const likeRow = await page.$eval('.notification-post.has-stack', (el) => ({ faces: el.querySelectorAll('.notification-avatar').length, see: el.querySelector('.notification-see-likers')?.textContent })).catch(() => null);
    check(`${w} PN6 the like row shows who`, likeRow?.faces === 2 && likeRow?.see === 'See all 2', JSON.stringify(likeRow));
    await page.locator('.notification-post', { hasText: 'liked your note' }).click();
    await page.waitForSelector('dialog.likers-sheet[open] .likers-row', { timeout: 4000 }).catch(() => {});
    const likers = await page.$$eval('dialog.likers-sheet .likers-name', (els) => els.map((e) => e.textContent));
    check(`${w} PN6 it opens "Liked by" with both`, JSON.stringify(likers) === '["Ravi Kumar","Asha Rao"]', JSON.stringify(likers));
    if (shots) await page.screenshot({ path: `${shots}/post-likers-${w}.png` });
    await page.locator('dialog.likers-sheet [data-likers-note]').click();
    await page.waitForTimeout(600);
    const marked = st.calls.filter((c) => c.path === '/rest/v1/rpc/mark_notifications_read').map((c) => JSON.parse(c.body || '{}').p_ids || []).flat();
    check(`${w} PN2 they are marked read on the server`, marked.includes('00000000-0000-4000-8000-0000000000n2'), JSON.stringify(marked));
    check(`${w} PN2 it opens Notes`, (await page.evaluate(() => document.body.dataset.appView)) === 'posts');
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
  // PN3
  {
    const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
    const page = await stub.open(ctx, { path: '/app.html?view=profile' });
    await page.evaluate(() => document.querySelector('[data-nav="profile"]')?.click());
    await page.locator('#profile-settings-button').click();
    await page.locator('[data-profile-setting="notifications"]').click();
    await page.waitForSelector('[data-receipts-setting]:not([hidden])', { timeout: 6000 });
    check('PN3 READ RECEIPTS is on by default', await page.isChecked('#profile-receipts-toggle'));
    await page.locator('[data-receipts-setting]').click();
    await page.waitForTimeout(400);
    check('PN3 turning it off saves false', st.readReceipts === false, String(st.readReceipts));
    if (shots) await page.screenshot({ path: `${shots}/settings-receipts.png` });
    await ctx.close();
  }
  // PN5
  st.notificationsV2Only = true; st.noReceipts = true; st.notifications = fresh().map(({ post_id, comment_id, snippet, post_image_url, ...rest }) => rest);
  {
    const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
    const page = await stub.open(ctx, { path: '/app.html?view=profile' });
    await page.waitForTimeout(1500);
    check('PN5 no post rows before 0043', await page.locator('.notification-post').count() === 0);
    await page.evaluate(() => document.querySelector('[data-nav="profile"]')?.click());
    await page.locator('#profile-settings-button').click();
    await page.locator('[data-profile-setting="notifications"]').click();
    await page.waitForTimeout(800);
    check('PN5 the switch stays hidden', await page.locator('[data-receipts-setting]').isHidden());
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
