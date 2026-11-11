// Frame your post (D-232, founder 2026-11-10: "there is no option to adjust the area pls fix it"), stubbed Supabase.
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/post-frame.spec.mjs   (Vite on :5206)
// PF1 picking a post photo opens "Frame your post" with Portrait 4:5 (chosen), Square and Landscape 5:4, a zoom slider.
// PF2 dragging moves the framed region; Square changes the frame; "Use this frame" shows the framed photo whole at that
//     shape, with "Adjust photo" (>= 44 px) which reopens the frame.
// PF3 Cancel on Adjust keeps the earlier framing; sharing uploads the framed photo and inserts the post.
// PF5 (D-237) Replace opens the file picker and frames the new photo; Remove drops it and shows Add an image again.
// PF6 (D-237) the caption has the emoji panel; an emoji goes into the caption.
// PF4 at 390 px the dialog fits (no sideways scroll, chips and buttons >= 44 px) and is axe clean.
import { startAppStub } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const PHOTO = 'source-media/assets/badminton-premium-no-shuttle.png';
const shots = process.env.PF_SHOTS;
const st = { posts: [] };
const stub = await startAppStub({ port: 5206, state: st });
const browser = await chromium.launch();
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const page = await stub.open(ctx, { path: '/app.html?view=posts' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const uploads = [];
    const inserts = [];
    page.on('request', (r) => {
      if (r.url().includes('/storage/v1/object/community-posts/') && r.method() === 'POST') uploads.push(r.url());
      if (r.url().includes('/rest/v1/community_posts') && r.method() === 'POST') inserts.push(r.postDataJSON?.());
    });
    await page.waitForSelector('#open-community-post', { timeout: 8000 });
    await page.locator('#open-community-post').click();
    await page.setInputFiles('#community-post-image', PHOTO);
    await page.waitForSelector('.photo-crop-dialog.is-rect', { timeout: 8000 });
    await page.waitForTimeout(300);
    // PF1
    const chips = await page.$$eval('[data-photo-crop-aspect]', (els) => els.map((b) => [b.textContent.trim().split(/\s+/)[0], b.getAttribute('aria-pressed')]));
    check(`${w} PF1 shapes offered, Portrait chosen`, JSON.stringify(chips) === '[["Portrait","true"],["Square","false"],["Landscape","false"]]', JSON.stringify(chips));
    check(`${w} PF1 titled Frame your post`, (await page.textContent('#photo-crop-title')) === 'Frame your post');
    check(`${w} PF1 zoom slider`, (await page.locator('[data-photo-crop-range]').count()) === 1);
    const rect = () => page.$eval('[data-photo-crop-stage]', (el) => el.dataset.cropRect.split(',').map(Number));
    const before = await rect();
    check(`${w} PF1 portrait region is 4:5`, Math.abs(before[2] / before[3] - 0.8) < 0.01, JSON.stringify(before));
    if (w === 390) {
      const m = await page.evaluate(() => {
        const r = [...document.querySelectorAll('.photo-crop-aspect, .photo-crop-use, .photo-crop-cancel, .photo-crop-step')].map((el) => el.getBoundingClientRect());
        return { overflow: document.documentElement.scrollWidth - window.innerWidth, small: r.filter((x) => x.height < 44 || x.right > window.innerWidth + 0.5).length };
      });
      check('390 PF4 dialog fits, targets >= 44 px', m.overflow <= 0 && m.small === 0, JSON.stringify(m));
      const v = await axeViolations(page, { include: '.photo-crop' });
      check('390 PF4 frame dialog axe clean', v.length === 0, JSON.stringify(v));
    }
    if (shots) await page.screenshot({ path: `${shots}/post-frame-${w}.png` });
    // PF2 drag
    const box = await page.locator('[data-photo-crop-stage]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    const dragged = await rect();
    check(`${w} PF2 dragging moves the region`, dragged[0] < before[0], `${before} -> ${dragged}`);
    await page.locator('[data-photo-crop-aspect="1"]').click();
    const sq = await rect();
    check(`${w} PF2 Square makes a square region`, sq[2] === sq[3] && (await page.getAttribute('[data-photo-crop-aspect="1"]', 'aria-pressed')) === 'true', JSON.stringify(sq));
    await page.locator('[data-photo-crop-use]').click();
    await page.waitForSelector('.photo-crop', { state: 'detached' });
    await page.waitForFunction(() => document.querySelector('#community-post-preview-image')?.naturalWidth > 0);
    const shown = await page.evaluate(() => {
      const img = document.querySelector('#community-post-preview-image');
      const pv = document.querySelector('#community-post-preview');
      const b = pv.getBoundingClientRect();
      return { nw: img.naturalWidth, nh: img.naturalHeight, w: b.width, h: b.height, framed: pv.classList.contains('is-framed'), fit: getComputedStyle(img).objectFit };
    });
    check(`${w} PF2 preview is the framed square, shown whole`, shown.framed && shown.nw === shown.nh && Math.abs(shown.w - shown.h) < 2 && shown.fit === 'contain', JSON.stringify(shown));
    const adjust = await page.locator('[data-post-adjust]').boundingBox();
    check(`${w} PF2 Adjust photo is >= 44 px`, adjust && adjust.height >= 44);
    // PF3: Adjust, then Cancel keeps the square.
    await page.locator('[data-post-adjust]').click();
    await page.waitForSelector('.photo-crop-dialog.is-rect');
    check(`${w} PF3 Adjust reopens on the chosen shape`, (await page.getAttribute('[data-photo-crop-aspect="1"]', 'aria-pressed')) === 'true');
    await page.locator('[data-photo-crop-cancel]').click();
    await page.waitForSelector('.photo-crop', { state: 'detached' });
    const kept = await page.evaluate(() => { const i = document.querySelector('#community-post-preview-image'); return i.naturalWidth === i.naturalHeight && document.querySelector('#community-post-preview').classList.contains('is-framed'); });
    check(`${w} PF3 Cancel keeps the framing`, kept);
    if (shots) await page.screenshot({ path: `${shots}/post-framed-${w}.png` });
    // PF5 Remove, then Add again, then Replace
    const pv = page.locator('#community-post-preview');
    const btns = await page.$$eval('.community-post-photo-actions button', (els) => els.map((b) => [b.textContent.trim(), b.getBoundingClientRect().height]));
    check(`${w} PF5 Adjust, Replace and Remove, >= 44 px`, JSON.stringify(btns.map((b) => b[0])) === '["Adjust","Replace","Remove"]' && btns.every((b) => b[1] >= 44), JSON.stringify(btns));
    check(`${w} PF5 the Add an image box steps aside while a photo is in`, (await page.locator('.community-post-upload.has-photo').count()) === 1);
    await page.locator('[data-post-remove]').click();
    check(`${w} PF5 Remove drops the photo and shows Add an image`, (await pv.isHidden()) && (await page.locator('.community-post-upload.has-photo').count()) === 0 && (await page.inputValue('#community-post-image')) === '');
    await page.setInputFiles('#community-post-image', PHOTO);
    await page.waitForSelector('.photo-crop-dialog.is-rect');
    await page.locator('[data-photo-crop-aspect="1"]').click();
    await page.locator('[data-photo-crop-use]').click();
    await page.waitForSelector('.photo-crop', { state: 'detached' });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-post-replace]').click()]);
    await chooser.setFiles('source-media/assets/Yashika-Bansal.jpeg');
    await page.waitForSelector('.photo-crop-dialog.is-rect');
    check(`${w} PF5 Replace frames the new photo`, true);
    await page.locator('[data-photo-crop-aspect="1"]').click();
    await page.locator('[data-photo-crop-use]').click();
    await page.waitForSelector('.photo-crop', { state: 'detached' });
    await page.waitForFunction(() => document.querySelector('#community-post-preview-image')?.naturalWidth > 0);
    const replaced = await page.evaluate(() => { const i = document.querySelector('#community-post-preview-image'); return i.naturalWidth === i.naturalHeight && !document.querySelector('#community-post-preview').hidden; });
    check(`${w} PF5 the new framed photo is shown`, replaced);
    // PF6
    await page.fill('#community-post-caption', 'Kodaikanal trip ');
    await page.locator('#community-post-form .emoji-field-toggle').click();
    await page.locator('#community-post-form .emoji-field-emoji').first().click();
    const cap = await page.inputValue('#community-post-caption');
    check(`${w} PF6 an emoji goes into the caption`, /^Kodaikanal trip \p{Extended_Pictographic}/u.test(cap), cap);
    if (shots) await page.screenshot({ path: `${shots}/post-composer-${w}.png` });
    await page.keyboard.press('Escape');
    await page.fill('#community-post-caption', 'Evening at the club');
    await page.locator('.community-post-submit').click();
    await page.waitForTimeout(1200);
    check(`${w} PF3 the framed photo is uploaded and the post inserted`, uploads.length === 1 && inserts.length === 1 && inserts[0]?.caption === 'Evening at the club', JSON.stringify({ uploads, inserts }));
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
