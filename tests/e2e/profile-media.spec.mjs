// Founder request 2026-10-22 (D-080): "Frame your photo" before a profile photo is uploaded, and covers only from the
// provided set. Against stubbed Supabase (app-stub.mjs); never touches a real project. Playwright and axe-core are NOT
// repo dependencies; see tests/e2e/README.md.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node tests/e2e/profile-media.spec.mjs
//   E2E_SCREENSHOTS=<dir> saves the crop dialog (and the cover picker) at every viewport.
//
// Section "crop" (320x568, 375x812, 390x844, 768x1024, 1280x800, 1440x900, 1920x1080), Profile -> EDIT PROFILE:
// * picking a photo opens a modal dialog (role=dialog, aria-modal, labelled "Frame your photo" in Bodoni Moda) with
//   focus inside; Tab never leaves it;
// * a drag, the wheel / + key and the arrow keys change the framed region; a huge drag never leaves the photo;
// * every control is at least 44 x 44 px and no text is under 12 px; nothing scrolls sideways (320 too);
// * axe finds nothing in the dialog (375 and 1440);
// * "Use photo" closes it, focus returns to the file input, and SAVE uploads one square JPEG (800 x 800) to
//   profile-photos/<me>/; reduced motion fades (no rise).
// Section "cancel" (375x812, 1440x900): Cancel or Escape closes the dialog, focus returns to the input, the pick is
// cleared and SAVE uploads nothing.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { startAppStub, ME, STILL } from './app-stub.mjs';
import { axeViolations, textAudit } from './a11y.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const PORT = Number(process.env.E2E_PORT || 5351);
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.E2E_SCREENSHOTS || '';
const VIEWPORTS = [[320, 568], [375, 812], [390, 844], [768, 1024], [1280, 800], [1440, 900], [1920, 1080]];

const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };

// The JPEG's own size, read from its SOF marker (the upload is a multipart body: find the JPEG inside it).
const jpegSize = (buffer) => {
  let i = buffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  if (i < 0) return null;
  i += 2;
  while (i < buffer.length - 9) {
    if (buffer[i] !== 0xff) { i += 1; continue; }
    const type = buffer[i + 1];
    if (type >= 0xc0 && type <= 0xc3) return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
    i += 2 + buffer.readUInt16BE(i + 2);
  }
  return null;
};

const st = {};
const stub = await startAppStub({ port: PORT, state: st });
const pageErrors = [];
let browser;

const openEditor = async (context) => {
  const page = await stub.open(context, { path: '/app.html#profile', errors: pageErrors });
  await page.waitForSelector('#profile-photo-editor', { state: 'visible', timeout: 10000 });
  await page.locator('#profile-photo-editor').click();
  await page.waitForSelector('#profile-edit-modal');
  return page;
};
const pickPhoto = async (page) => {
  await page.locator('#profile-edit-modal [name="photoFile"]').setInputFiles({ name: 'court.png', mimeType: 'image/png', buffer: STILL });
  await page.waitForSelector('.photo-crop-dialog', { state: 'visible', timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('[data-photo-crop-stage]')?.dataset.cropRect, null, { timeout: 5000 });
};
const rect = (page) => page.evaluate(() => document.querySelector('[data-photo-crop-stage]').dataset.cropRect.split(',').map(Number));
const uploads = () => stub.calls.filter((c) => c.method === 'POST' && c.path.startsWith(`/storage/v1/object/profile-photos/${ME}/`));

try {
  browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const natural = await (async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const size = await page.evaluate(async (b64) => { const r = await fetch(`data:image/png;base64,${b64}`); const bmp = await createImageBitmap(await r.blob()); return [bmp.width, bmp.height]; }, STILL.toString('base64'));
    await context.close();
    return size;
  })();

  // ---- crop
  for (const [width, height] of VIEWPORTS) {
    const tag = `${width}x${height}`;
    const phone = width <= 600;
    const context = await stub.newContext(browser, { width, height }, { reducedMotion: width === 1440 ? 'reduce' : 'no-preference', ...(phone ? { isMobile: true, hasTouch: true } : {}) });
    const page = await openEditor(context);
    await pickPhoto(page);
    await page.waitForTimeout(350);
    const d = await page.evaluate(() => {
      const dialog = document.querySelector('.photo-crop-dialog');
      const title = document.querySelector(`#${dialog.getAttribute('aria-labelledby')}`);
      const box = dialog.getBoundingClientRect();
      const targets = [...dialog.querySelectorAll('button, input, [data-photo-crop-stage]')].map((el) => { const r = el.getBoundingClientRect(); return [el.className || el.tagName, Math.round(r.width), Math.round(r.height)]; });
      return {
        role: dialog.getAttribute('role'), modal: dialog.getAttribute('aria-modal'), title: title?.textContent.trim(),
        font: getComputedStyle(title).fontFamily, focusInside: dialog.contains(document.activeElement),
        animation: getComputedStyle(dialog).animationName, box: [box.left, box.right, box.top, box.bottom],
        scrollWidth: document.documentElement.scrollWidth, innerWidth, innerHeight, targets,
        stageColour: getComputedStyle(document.querySelector('[data-photo-crop-stage]')).backgroundColor,
        useColour: getComputedStyle(document.querySelector('[data-photo-crop-use]')).backgroundColor,
      };
    });
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `crop-${tag}.png`) });
    check(`crop ${tag}: a modal dialog labelled "Frame your photo" in Bodoni Moda (${JSON.stringify([d.role, d.modal, d.title, d.font])})`, () => {
      assert.equal(d.role, 'dialog'); assert.equal(d.modal, 'true'); assert.equal(d.title, 'Frame your photo'); assert.match(d.font, /^"?Bodoni Moda/);
    });
    check(`crop ${tag}: focus is inside the dialog`, () => assert.ok(d.focusInside));
    check(`crop ${tag}: cream stage (${d.stageColour}) and a wine "Use photo" (${d.useColour})`, () => { assert.equal(d.stageColour, 'rgb(255, 250, 241)'); assert.equal(d.useColour, 'rgb(94, 11, 40)'); });
    check(`crop ${tag}: the dialog fits the viewport, no sideways scroll (${d.box.map(Math.round)} / ${d.scrollWidth}x${d.innerWidth})`, () => {
      assert.ok(d.scrollWidth <= d.innerWidth); assert.ok(d.box[0] >= -0.5 && d.box[1] <= d.innerWidth + 0.5);
      if (phone) { assert.ok(d.box[0] <= 0.5 && d.box[1] >= d.innerWidth - 0.5, 'a full-screen sheet on phones'); }
    });
    check(`crop ${tag}: every control is at least 44 x 44 px (${JSON.stringify(d.targets)})`, () => d.targets.forEach(([, w, h]) => { assert.ok(w >= 44 && h >= 44); }));
    check(`crop ${tag}: ${width === 1440 ? 'reduced motion fades only' : 'the dialog rises in'} (${d.animation})`, () => assert.equal(d.animation, width === 1440 ? 'photo-crop-in' : 'photo-crop-rise'));
    const audit = await textAudit(page, { root: '.photo-crop-dialog' });
    check(`crop ${tag}: no text under 12 px (${audit.small.join(' | ')})`, () => assert.deepEqual(audit.small, []));
    if (width === 375 || width === 1440) {
      const violations = await axeViolations(page, { include: '.photo-crop' });
      check(`crop ${tag}: axe finds nothing in the dialog (${violations.join(' | ')})`, () => assert.deepEqual(violations, []));
    }
    // Tab stays inside.
    for (let i = 0; i < 8; i += 1) await page.keyboard.press('Tab');
    const trapped = await page.evaluate(() => document.querySelector('.photo-crop-dialog').contains(document.activeElement));
    check(`crop ${tag}: Tab never leaves the dialog`, () => assert.ok(trapped));

    const r0 = await rect(page);
    check(`crop ${tag}: 1x frames the full short side of the photo (${r0} of ${natural})`, () => assert.equal(r0[2], Math.min(...natural)));
    // Zoom: + on the keyboard, then the wheel (desktop).
    await page.locator('[data-photo-crop-stage]').focus();
    await page.keyboard.press('+');
    const r1 = await rect(page);
    check(`crop ${tag}: + zooms in (${r0[2]} -> ${r1[2]})`, () => assert.ok(r1[2] < r0[2]));
    const stage = await page.locator('[data-photo-crop-stage]').boundingBox();
    if (!phone) {
      await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(100);
      const rw = await rect(page);
      check(`crop ${tag}: the wheel zooms in (${r1[2]} -> ${rw[2]})`, () => assert.ok(rw[2] < r1[2]));
    }
    const zoomValue = Number(await page.locator('[data-photo-crop-range]').inputValue());
    check(`crop ${tag}: the slider follows the zoom (${zoomValue})`, () => assert.ok(zoomValue > 1));
    // Drag: move the photo right, so the framed region moves left.
    const before = await rect(page);
    await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width / 2 + 30, stage.y + stage.height / 2 + 20, { steps: 4 });
    await page.mouse.up();
    const dragged = await rect(page);
    check(`crop ${tag}: a drag moves the framed region (${before} -> ${dragged})`, () => assert.ok(dragged[0] < before[0] || dragged[1] < before[1]));
    await page.locator('[data-photo-crop-stage]').focus();
    await page.keyboard.press('ArrowLeft');
    const keyed = await rect(page);
    check(`crop ${tag}: an arrow key moves it (${dragged} -> ${keyed})`, () => assert.notDeepEqual(keyed, dragged));
    // A huge drag never leaves the photo.
    await page.mouse.move(stage.x + 10, stage.y + 10);
    await page.mouse.down();
    await page.mouse.move(stage.x + 4000, stage.y + 4000, { steps: 3 });
    await page.mouse.up();
    const clamped = await rect(page);
    check(`crop ${tag}: the circle never shows empty space (${clamped} inside ${natural})`, () => {
      assert.ok(clamped[0] >= 0 && clamped[1] >= 0); assert.ok(clamped[0] + clamped[2] <= natural[0] && clamped[1] + clamped[2] <= natural[1]);
      assert.equal(clamped[0], 0); assert.equal(clamped[1], 0);
    });

    // Use photo -> focus back on the input -> SAVE uploads one square JPEG.
    await page.locator('[data-photo-crop-use]').click();
    await page.waitForSelector('.photo-crop', { state: 'detached', timeout: 5000 });
    const after = await page.evaluate(() => ({ focus: document.activeElement?.getAttribute('name'), status: document.querySelector('#profile-photo-status')?.textContent.trim() }));
    check(`crop ${tag}: "Use photo" returns focus to the photo field (${JSON.stringify(after)})`, () => { assert.equal(after.focus, 'photoFile'); assert.match(after.status, /framed/i); });
    const n = uploads().length;
    const posted = context.waitForEvent('request', { predicate: (r) => r.method() === 'POST' && r.url().includes(`/storage/v1/object/profile-photos/${ME}/`), timeout: 8000 });
    await page.locator('#profile-edit-form .profile-edit-save').click();
    const request = await posted;
    const size = jpegSize(request.postDataBuffer() || Buffer.alloc(0));
    await page.waitForSelector('#profile-edit-modal', { state: 'detached', timeout: 8000 }).catch(() => {});
    check(`crop ${tag}: SAVE uploads one square JPEG of 800 x 800 (${JSON.stringify(size)})`, () => { assert.equal(uploads().length, n + 1); assert.deepEqual(size, { height: 800, width: 800 }); });
    await context.close();
  }

  // ---- cancel
  for (const [width, height] of [[375, 812], [1440, 900]]) {
    const tag = `${width}x${height}`;
    for (const how of ['Cancel', 'Escape']) {
      const context = await stub.newContext(browser, { width, height });
      const page = await openEditor(context);
      await pickPhoto(page);
      if (how === 'Cancel') await page.locator('[data-photo-crop-cancel]').click(); else await page.keyboard.press('Escape');
      await page.waitForSelector('.photo-crop', { state: 'detached', timeout: 5000 });
      const s = await page.evaluate(() => ({ focus: document.activeElement?.getAttribute('name'), files: document.querySelector('[name="photoFile"]').files.length, editor: Boolean(document.querySelector('#profile-edit-modal')) }));
      check(`cancel ${tag} ${how}: the dialog closes, focus returns to the photo field, the pick is cleared, the editor stays (${JSON.stringify(s)})`, () => {
        assert.equal(s.focus, 'photoFile'); assert.equal(s.files, 0); assert.ok(s.editor);
      });
      const n = uploads().length;
      await page.locator('#profile-edit-form .profile-edit-save').click();
      await page.waitForSelector('#profile-edit-modal', { state: 'detached', timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(300);
      check(`cancel ${tag} ${how}: SAVE uploads nothing`, () => assert.equal(uploads().length, n));
      await context.close();
    }
  }
  check(`no uncaught page errors (${pageErrors.join(' | ')})`, () => assert.deepEqual(pageErrors, []));
} finally {
  await browser?.close();
  await stub.close();
}

results.forEach(([status, name]) => console.log(`${status}  ${name}`));
const failed = results.filter(([status]) => status === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
