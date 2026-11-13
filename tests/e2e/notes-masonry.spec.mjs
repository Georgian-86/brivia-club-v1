// The Notes masonry wall (D-248), against stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/notes-masonry.spec.mjs   (Vite on :5179)
// NM1 at 1440 (4 columns) and 1024 (3): D-249 every card has the original size (one height); no two cards overlap; the
//     space under a card is the column gap (± 6 px).
// NM2 opening a long caption grows only that card and pushes only the cards under it down; still no overlap.
// NM3 at 390: one column, no spans, no page errors.
import { startAppStub } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000002481';
const IMG = '/Images/Cover%20images/94978B9F-A399-43FC-AC48-0A41088B5D27.PNG';
const at = (h) => new Date(Date.now() - h * 36e5).toISOString();
const captions = ['✨', 'BRIVIA HAS NOTIFICATIONS 🔔\n\nAnd its own icon too!\n\nGo to Settings › Notifications › Turn on Web Notifications › Add to Home Screen\n\nAnd never miss a thing ♡', 'Deepavali 🪔', 'Love how AI can make even the pictures clicked by our siblings look beautiful, thank you all', 'Is anyone prepping for GATE?', '', 'Happy Diwali', 'Let\'s catch up and jam, bengaluru folks 🎸'];
const st = { posts: captions.map((caption, i) => ({ id: `p${i}`, author_id: OTHER, image_url: IMG, image_path: '', caption, created_at: at(i + 1) })),
  rows: [{ id: OTHER, name: 'Meera Iyer', photo_url: null, cover_url: null, experience: 'Member', skills: ['Chess'], looking_for: ['Friends'] }] };
const stub = await startAppStub({ port: 5179, state: st });
const browser = await chromium.launch();
const shots = process.env.NM_SHOTS;
const boxes = (page) => page.$$eval('#community-post-list > .post-card', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.postId, x: Math.round(r.left), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; }));
const overlaps = (b) => b.some((a, i) => b.some((c, j) => i < j && a.x < c.x + c.w - 1 && c.x < a.x + a.w - 1 && a.y < c.y + c.h - 1 && c.y < a.y + a.h - 1));
const gapsOk = (b, gap) => b.every((a) => {
  const below = b.filter((c) => c.x === a.x && c.y > a.y).sort((p, q) => p.y - q.y)[0];
  return !below || Math.abs(below.y - (a.y + a.h) - gap) <= 6;
});
try {
  for (const [w, h] of [[1440, 900], [1024, 800]]) {
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const page = await stub.open(ctx, { path: '/app.html?view=posts' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForSelector('.post-card[data-post-id="p7"]', { timeout: 8000 });
    await page.waitForTimeout(900);
    await page.mouse.move(1, 1);
    const gap = await page.$eval('#community-post-list', (el) => parseFloat(getComputedStyle(el).columnGap));
    let b = await boxes(page);
    check(`${w} NM1 masonry is on`, await page.locator('#community-post-list.is-masonry').count() === 1);
    check(`${w} NM1 every card has the original size (one height)`, Math.max(...b.map((x) => x.h)) - Math.min(...b.map((x) => x.h)) <= 1, JSON.stringify(b.map((x) => x.h)));
    check(`${w} NM1 no two cards overlap`, !overlaps(b), JSON.stringify(b));
    check(`${w} NM1 the space under each card is the gap (${gap} px)`, gapsOk(b, gap), JSON.stringify(b));
    if (shots) await page.screenshot({ path: `${shots}/masonry-${w}.png`, fullPage: true });
    const tall = (await boxes(page)).find((x) => x.id === 'p1');
    await page.locator('.post-card[data-post-id="p1"] .post-card-more').click();
    await page.mouse.move(1, 1);   // off the card: its hover lift (-4 px) is not part of the layout
    await page.waitForTimeout(500);
    b = await boxes(page);
    const others = b.filter((x) => x.id !== 'p1' && x.y < tall.y + tall.h);
    check(`${w} NM2 only the opened card grows (founder: "only that post must get expanded")`, b.find((x) => x.id === 'p1').h > tall.h && others.every((x) => x.h < 450), JSON.stringify(b));
    check(`${w} NM2 an open caption: still no overlap`, !overlaps(b), JSON.stringify(b));
    check(`${w} NM2 and the gaps hold`, gapsOk(b, gap), JSON.stringify(b));
    if (shots) await page.screenshot({ path: `${shots}/masonry-open-${w}.png`, fullPage: true });
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
  {
    const ctx = await stub.newContext(browser, { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    const page = await stub.open(ctx, { path: '/app.html?view=posts' });
    await page.waitForSelector('.post-card[data-post-id="p7"]', { timeout: 8000 });
    await page.waitForTimeout(700);
    check('390 NM3 one column, no masonry spans', await page.locator('#community-post-list.is-masonry').count() === 0);
    const b = await boxes(page);
    check('390 NM3 no overlap', !overlaps(b), JSON.stringify(b));
    if (shots) await page.screenshot({ path: `${shots}/masonry-390.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('notes-masonry: ALL PASSED');
