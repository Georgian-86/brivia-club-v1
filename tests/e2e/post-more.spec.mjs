// "Read more" for long captions on post cards (D-237, founder 2026-11-11), stubbed Supabase.
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/post-more.spec.mjs   (Vite on :5215)
// RM1 a caption cut at two lines shows "… more" (D-244: a text link, no pill) (>= 44 px); a short one does not; cards keep the same height.
// RM2 Read more shows the whole caption in place (aria-expanded), "Show less" folds it back; the post does not open.
// RM3 axe clean at 390.
// RM4 (D-247) a caption with line breaks keeps them: "… more" shows, and open it reads on separate lines.
import { startAppStub } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000002301';
const IMG = '/Images/Cover%20images/94978B9F-A399-43FC-AC48-0A41088B5D27.PNG';
const LONG = 'Hello Everyone, I am planning a trip from Bengaluru to Kodaikanal this weekend. Anyone wants to join? We leave Friday night and come back Sunday evening, sharing fuel and stay.';
const at = (h) => new Date(Date.now() - h * 36e5).toISOString();
const st = { posts: [
  { id: 'long', author_id: OTHER, image_url: IMG, image_path: '', caption: LONG, created_at: at(1) },
  { id: 'short', author_id: OTHER, image_url: IMG, image_path: '', caption: 'Deepavali 🪔', created_at: at(2) },
  { id: 'lines', author_id: OTHER, image_url: IMG, image_path: '', caption: 'BRIVIA HAS NOTIFICATIONS 🔔\n\nAnd its own icon too!\n\nGo to Settings', created_at: at(3) },
], rows: [{ id: OTHER, name: 'Meera Iyer', photo_url: null, cover_url: null, experience: 'Member', skills: ['Chess'], looking_for: ['Friends'] }] };
const stub = await startAppStub({ port: 5215, state: st });
const browser = await chromium.launch();
const shots = process.env.RM_SHOTS;
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const page = await stub.open(ctx, { path: '/app.html?view=posts' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForSelector('.post-card[data-post-id="short"]', { timeout: 8000 });
    await page.waitForTimeout(300);
    const longMore = page.locator('.post-card[data-post-id="long"] .post-card-more');
    const box = await longMore.boundingBox();
    check(`${w} RM1 a cut caption shows Read more, >= 44 px`, (await longMore.isVisible()) && box.height >= 44 && box.width >= 44, JSON.stringify(box));
    check(`${w} RM1 a short caption has none`, await page.locator('.post-card[data-post-id="short"] .post-card-more').isHidden());
    check(`${w} RM4 a caption with line breaks shows … more`, await page.locator('.post-card[data-post-id="lines"] .post-card-more').isVisible());
    await page.locator('.post-card[data-post-id="lines"] .post-card-more').click();
    const linesOpen = await page.$eval('.post-card[data-post-id="lines"] .post-card-caption', (el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    check(`${w} RM4 open, the breaks stay (5 lines)`, linesOpen >= 5, String(linesOpen));
    if (shots) await page.locator('.post-card[data-post-id="lines"]').screenshot({ path: `${shots}/post-lines-${w}.png` });
    await page.locator('.post-card[data-post-id="lines"] .post-card-more').click();
    const heights = await page.$$eval('.post-card', (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    check(`${w} RM1 cards keep the same height`, new Set(heights).size === 1, JSON.stringify(heights));
    if (w === 390) {
      const v = await axeViolations(page, { include: '#community-post-list' });
      check('390 RM3 axe clean', v.length === 0, JSON.stringify(v));
    }
    if (shots) { await page.mouse.move(1, 1); await page.locator('.post-card[data-post-id="long"]').screenshot({ path: `${shots}/post-more-closed-${w}.png` }); }
    await longMore.click();
    await page.waitForTimeout(200);
    const open = await page.evaluate(() => {
      const c = document.querySelector('.post-card[data-post-id="long"] .post-card-caption');
      const m = document.querySelector('.post-card[data-post-id="long"] .post-card-more');
      return { full: c.scrollHeight <= c.clientHeight + 1, lines: Math.round(c.clientHeight / parseFloat(getComputedStyle(c).lineHeight)), label: m.textContent.trim(), expanded: m.getAttribute('aria-expanded'), detail: !!document.querySelector('#post-detail') };
    });
    check(`${w} RM2 Read more shows the whole caption in place`, open.full && open.lines > 2 && open.label === 'less' && open.expanded === 'true' && !open.detail, JSON.stringify(open));
    if (shots) { await page.mouse.move(1, 1); await page.waitForTimeout(400); await page.locator('.post-card[data-post-id="long"]').screenshot({ path: `${shots}/post-more-${w}.png` }); }
    await longMore.click();
    await page.waitForTimeout(200);
    const closed = await page.evaluate(() => {
      const m = document.querySelector('.post-card[data-post-id="long"] .post-card-more');
      return { label: m.textContent.trim(), expanded: m.getAttribute('aria-expanded'), visible: !m.hidden };
    });
    check(`${w} RM2 Show less folds it back`, closed.label === '… more' && closed.expanded === 'false' && closed.visible, JSON.stringify(closed));
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
