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
// Section "covers" (every viewport above; 0014): no cover file input exists anywhere (profile editor, signup page);
// the editor shows the 18 provided covers as a radio group with the stored one checked (a legacy /assets/ value marks
// its preset); tiles are at least 44 px, titles at least 12 px, nothing scrolls sideways, axe finds nothing (375,
// 1440); picking another cover (pointer or arrow keys) and saving PATCHes cover_url = /Images/Cover%20images/<file>;
// saving without a change sends the stored value back; nothing is ever uploaded to profile-covers.
// Section "fix round 1": (I1) a click on non-focusable dialog text then 10 Tabs keep focus inside, the editor behind is
// inert while the dialog is open (and not after), Escape still closes it; (I2) the "Photo framed" status and the editor
// helpers are at least 4.5:1; (I3) a 6000 x 4000 photo is decoded at most 2048 px on the long side and still uploads
// 800 x 800; (M1/M2) when the crop module cannot load, the editor and signup say "Couldn't open the photo framer. Please
// try again.", clear the pick and upload nothing.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { startAppStub, ME, STILL, ownRow } from './app-stub.mjs';
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
  // ---- covers
  const P = (key) => `/Images/Cover%20images/${key}`;
  const MOMENTUM = '3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG';
  const MATTER = 'F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG';
  const profileWrites = () => stub.calls.filter((c) => c.path === '/rest/v1/profiles' && ['PATCH', 'POST'].includes(c.method)).map((c) => JSON.parse(c.body || '{}'));
  const coverUploads = () => stub.calls.filter((c) => c.method !== 'GET' && c.path.startsWith('/storage/v1/object/profile-covers'));
  for (const [width, height] of VIEWPORTS) {
    const tag = `${width}x${height}`;
    const phone = width <= 600;
    st.own = { ...ownRow, cover_url: P(MOMENTUM) };
    const context = await stub.newContext(browser, { width, height }, phone ? { isMobile: true, hasTouch: true } : {});
    const page = await openEditor(context);
    await page.locator('.profile-cover-picker').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const c = await page.evaluate(() => {
      const modal = document.querySelector('#profile-edit-modal');
      const radios = [...modal.querySelectorAll('input[name="coverChoice"]')];
      const tiles = [...modal.querySelectorAll('.profile-cover-option')].map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      return {
        // every file input on the page: none is about covers (the post image and the resume are fine); in the editor only the photo
        files: [...document.querySelectorAll('input[type="file"]')].filter((el) => /cover/i.test(`${el.name} ${el.id} ${el.className} ${el.closest('label, section, div')?.textContent || ''}`)).map((el) => el.name || el.id),
        editorFiles: [...modal.querySelectorAll('input[type="file"]')].map((el) => el.name),
        coverFile: document.querySelectorAll('[name="coverFile"], .cover-input').length,
        radios: radios.length, types: [...new Set(radios.map((r) => r.type))], checked: radios.filter((r) => r.checked).map((r) => r.value),
        legend: modal.querySelector('.profile-cover-picker legend')?.textContent.trim(), tiles,
        scrollWidth: document.documentElement.scrollWidth, innerWidth, dialogWidth: modal.querySelector('.profile-edit-dialog').scrollWidth - modal.querySelector('.profile-edit-dialog').clientWidth,
      };
    });
    if (SHOTS) {
      // Thumbnails are lazy: wait for the ones in view before the picture.
      await page.waitForFunction(() => [...document.querySelectorAll('.profile-cover-thumb img')].filter((img) => { const r = img.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).every((img) => img.complete && img.naturalWidth), null, { timeout: 8000 }).catch(() => {});
      await page.screenshot({ path: path.join(SHOTS, `covers-${tag}.png`) });
    }
    check(`covers ${tag}: no cover file input anywhere; the editor has only the photo one (${JSON.stringify([c.files, c.editorFiles, c.coverFile])})`, () => { assert.deepEqual(c.files, []); assert.deepEqual(c.editorFiles, ['photoFile']); assert.equal(c.coverFile, 0); });
    check(`covers ${tag}: 18 provided covers as radios, the stored one checked (${JSON.stringify([c.radios, c.types, c.checked, c.legend])})`, () => {
      assert.equal(c.radios, 18); assert.deepEqual(c.types, ['radio']); assert.deepEqual(c.checked, [P(MOMENTUM)]); assert.equal(c.legend, 'COVER');
    });
    check(`covers ${tag}: tiles are at least 44 px tall and wide (${JSON.stringify(c.tiles.slice(0, 2))})`, () => c.tiles.forEach(([w, h]) => { assert.ok(w >= 44 && h >= 44); }));
    check(`covers ${tag}: no sideways scroll (${c.scrollWidth}/${c.innerWidth}, dialog ${c.dialogWidth})`, () => { assert.ok(c.scrollWidth <= c.innerWidth); assert.ok(c.dialogWidth <= 0); });
    const audit = await textAudit(page, { root: '.profile-cover-picker' });
    check(`covers ${tag}: no text under 12 px (${audit.small.join(' | ')})`, () => assert.deepEqual(audit.small, []));
    if (width === 375 || width === 1440) {
      const violations = await axeViolations(page, { include: '.profile-cover-picker' });
      check(`covers ${tag}: axe finds nothing in the cover picker (${violations.join(' | ')})`, () => assert.deepEqual(violations, []));
    }
    if (width === 375 || width === 1440 || width === 320) {
      // Unchanged: the stored value goes back as is.
      const before = profileWrites().length;
      await page.locator('#profile-edit-form .profile-edit-save').click();
      await page.waitForSelector('#profile-edit-modal', { state: 'detached', timeout: 8000 });
      const same = profileWrites().slice(before);
      check(`covers ${tag}: saving without a change keeps the stored cover (${JSON.stringify(same.map((b) => b.cover_url))})`, () => { assert.equal(same.length, 1); assert.equal(same[0].cover_url, P(MOMENTUM)); });
      // Pointer pick.
      await page.locator('#profile-photo-editor').click();
      await page.waitForSelector('#profile-edit-modal');
      await page.locator('.profile-cover-option', { hasText: 'MAKE IT MATTER' }).click();
      const n = profileWrites().length;
      await page.locator('#profile-edit-form .profile-edit-save').click();
      await page.waitForSelector('#profile-edit-modal', { state: 'detached', timeout: 8000 });
      const picked = profileWrites().slice(n);
      check(`covers ${tag}: a picked cover saves its preset path (${JSON.stringify(picked.map((b) => b.cover_url))})`, () => { assert.equal(picked.length, 1); assert.equal(picked[0].cover_url, P(MATTER)); });
      // Keyboard: arrow keys move the choice.
      await page.locator('#profile-photo-editor').click();
      await page.waitForSelector('#profile-edit-modal');
      await page.locator(`input[name="coverChoice"][value="${P(MOMENTUM)}"]`).focus();
      await page.keyboard.press('ArrowRight');
      const keyed = await page.evaluate(() => ({ value: document.querySelector('input[name="coverChoice"]:checked')?.value, outline: getComputedStyle(document.activeElement.nextElementSibling).outlineStyle }));
      check(`covers ${tag}: arrow keys move the choice with a visible focus ring (${JSON.stringify(keyed)})`, () => { assert.equal(keyed.value, P('3453059c-4864-46f7-ae45-6f7049939b9f.png')); assert.equal(keyed.outline, 'solid'); });
      await page.locator('.profile-edit-close').click();
    }
    await context.close();
  }
  // A legacy /assets/ value (an old build of a preset) marks its preset as current and still renders on the profile.
  st.own = { ...ownRow, cover_url: '/assets/F28EA63E-1BEB-49E9-BA01-F62127017DB1-B4-NibCZ.webp' };
  {
    const context = await stub.newContext(browser, { width: 1440, height: 900 });
    const page = await stub.open(context, { path: '/app.html#profile', errors: pageErrors });
    await page.waitForSelector('#profile-photo-editor', { state: 'visible', timeout: 10000 });
    const hero = await page.evaluate(() => document.querySelector('#profile-cover-image')?.style.backgroundImage || '');
    await page.locator('#profile-photo-editor').click();
    const checked = await page.evaluate(() => document.querySelector('input[name="coverChoice"]:checked')?.value);
    check(`covers legacy: the hero renders the preset (${hero.slice(0, 90)})`, () => { assert.match(hero, /F28EA63E-1BEB-49E9-BA01-F62127017DB1/); assert.ok(!/NibCZ/.test(hero)); });
    check(`covers legacy: its preset is marked current (${checked})`, () => assert.equal(checked, P(MATTER)));
    await context.close();
  }
  // The signup page has no cover upload either (its picker stores the preset path).
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.route((u) => !u.href.startsWith(stub.url), (route) => route.abort());
    await page.goto(`${stub.url}/auth.html#signup`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-cover-picker]', { state: 'attached', timeout: 10000 });
    const signup = await page.evaluate(() => ({
      files: [...document.querySelectorAll('input[type="file"]')].map((el) => el.className),
      value: document.querySelector('.cover-value')?.value,
    }));
    await page.evaluate(() => [...document.querySelectorAll('.cover-choice')].at(-1).click());
    const pickedValue = await page.evaluate(() => document.querySelector('.cover-value')?.value);
    check(`covers signup: only the photo file input (${JSON.stringify(signup.files)})`, () => assert.deepEqual(signup.files, ['photo-input']));
    check(`covers signup: the picker stores preset paths, never a build URL (${signup.value} -> ${pickedValue})`, () => {
      assert.equal(signup.value, P('163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG')); assert.equal(pickedValue, P(MATTER));
    });
    await context.close();
  }
  // ---- fix round 1
  const contrastOf = (page, selector) => page.evaluate((sel) => {
    const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; const a = c.match(/[\d.]+/g); if (a && (a.length < 4 || Number(a[3]) === 1)) return c; } return 'rgb(255, 255, 255)'; };
    return [...document.querySelectorAll(sel)].map((el) => { const f = lum(getComputedStyle(el).color); const b = lum(bg(el)); return Math.round(((Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05)) * 100) / 100; });
  }, selector);
  st.own = { ...ownRow };
  for (const [width, height] of [[375, 812], [1440, 900]]) {
    const tag = `${width}x${height}`;
    const context = await stub.newContext(browser, { width, height }, width < 600 ? { isMobile: true, hasTouch: true } : {});
    const page = await openEditor(context);
    await pickPhoto(page);
    await page.locator('.photo-crop-title').click();
    const inside = [];
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('Tab');
      inside.push(await page.evaluate(() => document.querySelector('.photo-crop-dialog').contains(document.activeElement)));
    }
    const inert = await page.evaluate(() => ({ editor: Boolean(document.querySelector('#profile-edit-modal')?.inert), crop: Boolean(document.querySelector('.photo-crop')?.inert) }));
    check(`I1 ${tag}: after a click on the title, 10 Tabs stay inside the dialog (${inside.join(',')})`, () => assert.ok(inside.every(Boolean)));
    check(`I1 ${tag}: the editor behind is inert while the dialog is open (${JSON.stringify(inert)})`, () => { assert.equal(inert.editor, true); assert.equal(inert.crop, false); });
    await page.locator('.photo-crop-help').click();
    await page.keyboard.press('Escape');
    await page.waitForSelector('.photo-crop', { state: 'detached', timeout: 3000 }).catch(() => {});
    const closed = await page.evaluate(() => ({ open: Boolean(document.querySelector('.photo-crop')), inert: [...document.body.children].filter((el) => el.inert).map((el) => el.id || el.className), focus: document.activeElement?.getAttribute('name') }));
    check(`I1 ${tag}: Escape after a click on the help text still closes it; nothing stays inert; focus on the photo field (${JSON.stringify(closed)})`, () => {
      assert.equal(closed.open, false); assert.deepEqual(closed.inert, []); assert.equal(closed.focus, 'photoFile');
    });
    await pickPhoto(page);
    await page.locator('[data-photo-crop-use]').click();
    await page.waitForSelector('.photo-crop', { state: 'detached', timeout: 5000 });
    const status = await contrastOf(page, '#profile-photo-status');
    const helpers = await contrastOf(page, '#profile-edit-modal .profile-edit-helper');
    check(`I2 ${tag}: "Photo framed" status is at least 4.5:1 (${status})`, () => { assert.equal(status.length, 1); assert.ok(status[0] >= 4.5); });
    check(`I2 ${tag}: every editor helper line is at least 4.5:1 (${helpers.join(',')})`, () => helpers.forEach((ratio) => assert.ok(ratio >= 4.5)));
    await context.close();
  }
  {
    // I3: a 6000 x 4000 photo.
    const maker = await browser.newContext();
    const makerPage = await maker.newPage();
    const big = Buffer.from(await makerPage.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 6000; c.height = 4000;
      const g = c.getContext('2d'); const grad = g.createLinearGradient(0, 0, 6000, 4000); grad.addColorStop(0, '#5e0b28'); grad.addColorStop(1, '#fffaf1');
      g.fillStyle = grad; g.fillRect(0, 0, 6000, 4000);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.7));
      const bytes = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]); return btoa(bin);
    }), 'base64');
    await maker.close();
    const context = await stub.newContext(browser, { width: 1280, height: 800 });
    const page = await openEditor(context);
    await page.locator('#profile-edit-modal [name="photoFile"]').setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: big });
    await page.waitForSelector('.photo-crop-dialog', { state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('[data-photo-crop-stage]')?.dataset.cropRect, null, { timeout: 5000 });
    const source = await page.evaluate(() => (document.querySelector('[data-photo-crop-stage]').dataset.sourceSize || '').split(',').map(Number));
    check(`I3: a 6000 x 4000 photo is decoded at most 2048 px on the long side, aspect kept (${source})`, () => { assert.deepEqual(source, [2048, 1365]); });
    await page.locator('[data-photo-crop-use]').click();
    await page.waitForSelector('.photo-crop', { state: 'detached', timeout: 5000 });
    const posted = context.waitForEvent('request', { predicate: (r) => r.method() === 'POST' && r.url().includes(`/storage/v1/object/profile-photos/${ME}/`), timeout: 8000 });
    await page.locator('#profile-edit-form .profile-edit-save').click();
    const size = jpegSize((await posted).postDataBuffer() || Buffer.alloc(0));
    check(`I3: the big photo still uploads 800 x 800 (${JSON.stringify(size)})`, () => assert.deepEqual(size, { height: 800, width: 800 }));
    await context.close();
  }
  {
    // M1/M2: the crop module cannot load.
    const FRAMER = "Couldn't open the photo framer. Please try again.";
    const context = await stub.newContext(browser, { width: 1280, height: 800 });
    await context.route((u) => /\/photo-crop\.(js|css)/.test(u.pathname), (route) => route.abort());
    const page = await openEditor(context);
    const n = uploads().length;
    await page.locator('#profile-edit-modal [name="photoFile"]').setInputFiles({ name: 'court.png', mimeType: 'image/png', buffer: STILL });
    await page.waitForFunction(() => !document.querySelector('#profile-photo-error')?.hidden, null, { timeout: 8000 }).catch(() => {});
    const e = await page.evaluate(() => ({ text: document.querySelector('#profile-photo-error')?.textContent.trim(), hidden: document.querySelector('#profile-photo-error')?.hidden, files: document.querySelector('[name="photoFile"]').files.length, dialog: Boolean(document.querySelector('.photo-crop')) }));
    check(`M1 editor: the framer failing to load says so and clears the pick (${JSON.stringify(e)})`, () => { assert.equal(e.text, FRAMER); assert.equal(e.hidden, false); assert.equal(e.files, 0); assert.equal(e.dialog, false); });
    await page.locator('#profile-edit-form .profile-edit-save').click();
    await page.waitForSelector('#profile-edit-modal', { state: 'detached', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    check('M1 editor: nothing is uploaded unframed', () => assert.equal(uploads().length, n));
    await context.close();
    const signupContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const signup = await signupContext.newPage();
    await signup.route((u) => !u.href.startsWith(stub.url) || /\/photo-crop\.(js|css)/.test(u.pathname), (route) => route.abort());
    await signup.goto(`${stub.url}/auth.html#signup`, { waitUntil: 'domcontentloaded' });
    await signup.waitForSelector('.photo-input', { state: 'attached', timeout: 10000 });
    await signup.locator('.photo-input').setInputFiles({ name: 'court.png', mimeType: 'image/png', buffer: STILL });
    await signup.waitForFunction(() => !document.querySelector('#profile-photo-error')?.hidden, null, { timeout: 8000 }).catch(() => {});
    const m2 = await signup.evaluate(() => ({ text: document.querySelector('#profile-photo-error')?.textContent.trim(), files: document.querySelector('.photo-input').files.length }));
    check(`M2 signup: the framer failing to load says so and clears the pick (${JSON.stringify(m2)})`, () => { assert.equal(m2.text, FRAMER); assert.equal(m2.files, 0); });
    await signupContext.close();
  }
  check(`nothing was ever uploaded to profile-covers (${coverUploads().length})`, () => assert.equal(coverUploads().length, 0));
  check(`no uncaught page errors (${pageErrors.join(' | ')})`, () => assert.deepEqual(pageErrors, []));
} finally {
  await browser?.close();
  await stub.close();
}

results.forEach(([status, name]) => console.log(`${status}  ${name}`));
const failed = results.filter(([status]) => status === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
