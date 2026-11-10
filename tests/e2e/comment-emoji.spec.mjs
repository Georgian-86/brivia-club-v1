// Emoji in Notes comments (D-235, founder 2026-11-10: "i need option of emojis for comments section in notes").
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/comment-emoji.spec.mjs   (Vite on :5209)
// CE1 the comment box has a quick row of 8 reactions and an emoji button (all >= 44 px); Post stays inside the form.
// CE2 a quick reaction goes in at the cursor and enables Post.
// CE3 the emoji button opens the full panel above the box, inside the screen; a tab changes the set; an emoji goes in
//     at the cursor; Escape closes the panel (the post stays open).
// CE4 posting sends the emoji in the comment and closes the panel. Axe clean (panel open) at 390; no sideways scroll.
import { startAppStub, ME } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000002101';
const IMG = '/Images/Cover%20images/94978B9F-A399-43FC-AC48-0A41088B5D27.PNG';
const st = { posts: [{ id: 'p1', author_id: OTHER, image_url: IMG, image_path: '', caption: 'Chess night', created_at: new Date(Date.now() - 36e5).toISOString() }],
  comments: [], rows: [{ id: OTHER, name: 'Meera Iyer', photo_url: null, cover_url: null, experience: 'Member', skills: ['Chess'], looking_for: ['Friends'] }] };
const stub = await startAppStub({ port: 5209, state: st });
const browser = await chromium.launch();
const shots = process.env.CE_SHOTS;
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    st.comments = [];
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const page = await stub.open(ctx, { path: '/app.html?view=posts' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const posted = [];
    page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/rest/v1/community_post_comments')) posted.push(r.postDataJSON()); });
    await page.waitForSelector('.post-card[data-post-id="p1"]', { timeout: 8000 });
    await page.locator('.post-card[data-post-id="p1"] [data-post-action="comment"]').first().click();
    await page.waitForSelector('#post-detail[open] .post-comment-quick');
    await page.waitForTimeout(300);
    // CE1
    const sizes = await page.$$eval('#post-detail .post-comment-quick button, #post-detail .emoji-field-toggle', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    const edge = await page.evaluate(() => { const f = document.querySelector('#post-detail .post-comment-form').getBoundingClientRect(); const s = document.querySelector('#post-detail .post-comment-send').getBoundingClientRect(); return { send: s.right, form: f.right }; });
    check(`${w} CE1 Post stays inside the form`, edge.send <= edge.form + 0.5, JSON.stringify(edge));
    check(`${w} CE1 8 quick reactions and an emoji button, >= 44 px`, sizes.length === 9 && sizes.every(([a, b]) => a >= 44 && b >= 44), JSON.stringify(sizes));
    // CE2
    await page.fill('#post-comment-input', 'Great game ');
    await page.locator('[data-comment-emoji="🔥"]').click();
    check(`${w} CE2 the reaction goes in, Post enabled`, (await page.inputValue('#post-comment-input')) === 'Great game 🔥' && !(await page.locator('.post-comment-send').isDisabled()));
    // CE3
    await page.locator('#post-detail .emoji-field-toggle').click();
    const panel = page.locator('#post-detail .emoji-field-panel');
    await panel.waitFor({ state: 'visible' });
    const geo = await page.evaluate(() => {
      const p = document.querySelector('#post-detail .emoji-field-panel').getBoundingClientRect();
      const box = document.querySelector('#post-comment-input').getBoundingClientRect();
      return { top: p.top, bottom: p.bottom, left: p.left, right: p.right, boxTop: box.top, vw: innerWidth, vh: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    check(`${w} CE3 the panel opens above the box, on screen`, geo.bottom <= geo.boxTop + 1 && geo.top >= 0 && geo.left >= 0 && geo.right <= geo.vw + 0.5 && geo.overflow <= 0, JSON.stringify(geo));
    if (shots) await page.screenshot({ path: `${shots}/comment-emoji-${w}.png` });
    if (w === 390) {
      const v = await axeViolations(page, { include: '#post-detail .post-comment-form' });
      check('390 CE4 the comment form is axe clean with the panel open', v.length === 0, JSON.stringify(v));
    }
    await page.locator('#post-detail [data-emoji-tab="food"]').click();
    const first = await page.locator('#post-detail .emoji-field-emoji').first().getAttribute('data-emoji');
    await page.locator('#post-detail .emoji-field-emoji').first().click();
    check(`${w} CE3 a panel emoji goes in at the cursor`, (await page.inputValue('#post-comment-input')) === `Great game 🔥${first}`, `${await page.inputValue('#post-comment-input')} / ${first}`);
    await page.keyboard.press('Escape');
    check(`${w} CE3 Escape closes the panel, the post stays`, (await panel.isHidden()) && (await page.locator('#post-detail[open]').count()) === 1);
    // CE4
    await page.locator('#post-detail .emoji-field-toggle').click();
    await page.locator('.post-comment-send').click();
    await page.waitForTimeout(600);
    check(`${w} CE4 the comment is sent with its emoji`, posted.length === 1 && posted[0]?.body === `Great game 🔥${first}`, JSON.stringify(posted));
    check(`${w} CE4 posting closes the panel`, await panel.isHidden());
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
