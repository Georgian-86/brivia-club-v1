// Polish wave A2: the chat fits shorter laptop screens (13" MacBook Air ~1440x780 app area), against stubbed Supabase.
// Never touches a real Supabase project. Playwright is NOT a repo dependency; see tests/e2e/README.md.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node tests/e2e/fit.spec.mjs
//   E2E_SCREENSHOTS=<dir> also saves the thread at every viewport.
//
// Section "chat" (viewports 1280x720, 1280x800, 1366x768, 1440x780, 1440x900, 1536x864, 1920x1080, 375x812, 390x844):
// a thread of 30 messages with one 3000x4000 image from them, one 4000x3000 image from me and an image as the very
// first message:
// * the thread window and the composer end inside the viewport (the composer is always visible);
// * message images are at most 38% of the viewport tall (320 px at most) and never wider than the bubble limit;
// * no horizontal overflow, and the chat layout spans the app area (no side gutters at desktop widths);
// * the first bubble is not cropped under the thread header (scrolled to the top);
// * an image opens in a new tab on tap (it stays a link).
// Section "notifications" (375x812, 768x1024, 1440x900; E2E_SCREENSHOTS also 1280x800 and 1920x1080 in Chat, Explore, Connect
// and Profile): with a thread open in Chat, the bell opens the panel in the top layer: it is on top at its centre, starts
// under the bell, ends inside 8 px of the viewport; Escape and an outside click close it and focus returns to the bell.
// Sections "menu" and "blocked send" belong to later tasks of the wave and are added to this file by them.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { startAppStub, ME, ORIGIN } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const PORT = Number(process.env.E2E_PORT || 5191);
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.E2E_SCREENSHOTS || '';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const VIEWPORTS = [[1280, 720], [1280, 800], [1366, 768], [1440, 780], [1440, 900], [1536, 864], [1920, 1080], [375, 812], [390, 844], [320, 568], [768, 1024]];

// Two huge pictures drawn as SVG so the natural size is 3000x4000 / 4000x3000 without a big binary in the repo.
const svg = (w, h, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#5e0b28"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 3}" fill="#e9d9c4"/><text x="${w / 2}" y="${h / 2}" font-size="240" text-anchor="middle" fill="#430416">${label}</text></svg>`;
const PICTURES = { 'portrait.svg': svg(3000, 4000, 'PORTRAIT'), 'landscape.svg': svg(4000, 3000, 'LANDSCAPE') };

const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };

const at = (n) => new Date(Date.now() - (40 - n) * 60000).toISOString();
const image = (id, from, file, n) => ({ id, sender_id: from === 'me' ? ME : A, recipient_id: from === 'me' ? A : ME, body: '', created_at: at(n), message_type: 'image', attachment_path: `${ME}/${file}`, attachment_name: file, attachment_mime: 'image/svg+xml', attachment_size: 1000 });
const text = (i) => ({ id: `t${i}`, sender_id: i % 2 ? A : ME, recipient_id: i % 2 ? ME : A, body: i % 3 ? 'Shall we play on Saturday morning at the club courts?' : 'Yes, see you there.', created_at: at(i) });
const messages = [image('img-first', 'them', 'portrait.svg', 0)];
for (let i = 1; i <= 30; i += 1) messages.push(i === 10 ? image('img-me', 'me', 'landscape.svg', i) : i === 20 ? image('img-them', 'them', 'portrait.svg', i) : text(i));

const st = { matchIds: [A], messages };
const stub = await startAppStub({ port: PORT, state: st });
const pageErrors = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  for (const [width, height] of VIEWPORTS) {
    const tag = `${width}x${height}`;
    const phone = width <= 780;
    const context = await stub.newContext(browser, { width, height }, { reducedMotion: 'reduce', ...(phone ? { isMobile: true, hasTouch: true } : {}) });
    // Chat media is private: the app asks Storage for a signed URL per path, then loads that URL.
    await context.route(/\/storage\/v1\/object\/sign\/message-attachments\/.+\.svg$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: `/object/public/chat-fit/${route.request().url().split('/').pop()}?token=stub` }), headers: { 'access-control-allow-origin': '*' } }));
    await context.route(/\/chat-fit\/[a-z]+\.svg/, (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PICTURES[new URL(route.request().url()).pathname.split('/').pop()], headers: { 'access-control-allow-origin': '*' } }));
    const loaded = context.waitForEvent('response', { predicate: (r) => r.url().includes('/rest/v1/brivia_messages'), timeout: 15000 });
    const page = await stub.open(context, { path: '/app.html?view=chat', errors: pageErrors });
    await loaded;
    await page.waitForTimeout(400);
    await page.waitForFunction(() => document.querySelector('#chat-list [data-chat-id]'), null, { timeout: 10000 });
    await page.locator('#chat-list .chat-row-copy > span').first().click({ timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll('#chat-messages .message').length >= 31, null, { timeout: 10000 });
    // Images are loading="lazy": bring each into view so every picture has its real size, then settle at the top.
    await page.waitForFunction(() => document.querySelectorAll('#chat-messages img.message-attachment-image').length === 3, null, { timeout: 10000 });
    for (const handle of await page.locator('#chat-messages img.message-attachment-image').all()) {
      await handle.scrollIntoViewIfNeeded();
      await handle.evaluate((img) => (img.complete && img.naturalWidth ? null : new Promise((resolve) => { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true }); })));
    }
    await page.evaluate(() => { const t = document.querySelector('#chat-messages'); t.scrollTop = t.scrollHeight; });
    await page.waitForTimeout(500);
    if (SHOTS) {
      await page.screenshot({ path: path.join(SHOTS, `chat-${tag}.png`) });
      await page.locator('#chat-messages img.message-attachment-image').last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SHOTS, `chat-${tag}-image.png`) });
      await page.evaluate(() => { document.querySelector('#chat-messages').scrollTop = 0; });
      await page.screenshot({ path: path.join(SHOTS, `chat-${tag}-top.png`) });
    }
    const m = await page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
      const win = document.querySelector('#chat-window');
      const thread = document.querySelector('#chat-messages');
      const css = getComputedStyle(thread);
      const inner = thread.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      const view = document.querySelector('.app-view[data-view="chat"]');
      const main = document.querySelector('.app-main') || view.parentElement;
      const imgs = [...thread.querySelectorAll('img.message-attachment-image')].map((img) => ({ ...box(img), link: img.closest('a')?.getAttribute('target'), bubble: box(img.closest('.message')) }));
      const out = {
        innerHeight, innerWidth, scrollWidth: document.documentElement.scrollWidth,
        win: box(win), composer: box(document.querySelector('#chat-form')), head: box(document.querySelector('.chat-window-head')),
        layout: box(document.querySelector('.chat-layout')), main: box(main), inner, imgs,
        bubbleMax: Math.min(inner * 0.72, 560), threadScrollable: thread.scrollHeight > thread.clientHeight,
      };
      thread.scrollTop = 0;
      out.first = box(thread.querySelector('.message'));
      out.firstHead = box(document.querySelector('.chat-window-head'));
      return out;
    });
    const hint = JSON.stringify({ win: m.win.bottom, composer: m.composer.bottom, imgs: m.imgs.map((i) => [Math.round(i.width), Math.round(i.height)]), bubbleMax: m.bubbleMax, layout: [m.layout.left, m.layout.right], main: [m.main.left, m.main.right], first: m.first.top, head: m.firstHead.bottom });
    check(`chat ${tag}: ${m.imgs.length} images rendered`, () => assert.equal(m.imgs.length, 3));
    check(`chat ${tag}: thread window and composer end inside the viewport ${hint}`, () => {
      assert.ok(m.win.bottom <= m.innerHeight + 0.5, 'window below the fold');
      assert.ok(m.composer.bottom <= m.innerHeight + 0.5, 'composer below the fold');
      assert.ok(m.composer.height > 20 && m.composer.top >= m.win.top, 'composer collapsed');
    });
    check(`chat ${tag}: images at most 38% of the viewport tall (320 px at most) and inside the bubble limit ${hint}`, () => {
      for (const img of m.imgs) {
        assert.ok(img.height <= Math.min(Math.round(m.innerHeight * 0.38), 320) + 1, `image ${Math.round(img.height)}px tall`);
        assert.ok(img.width <= m.bubbleMax + 1, `image ${Math.round(img.width)}px wide`);
        assert.ok(img.height >= 60, 'image collapsed');
        assert.ok(img.bubble.height >= img.height && img.bubble.width >= img.width, 'bubble squeezed smaller than its picture');
      }
    });
    check(`chat ${tag}: no horizontal overflow ${m.scrollWidth}/${m.innerWidth}`, () => assert.equal(m.scrollWidth, m.innerWidth));
    check(`chat ${tag}: the chat spans the app area, no side gutters ${hint}`, () => {
      assert.ok(Math.abs(m.layout.left - m.main.left) <= 1 && Math.abs(m.layout.right - m.main.right) <= 1, 'side margins');
    });
    check(`chat ${tag}: the first bubble is not cropped under the header ${hint}`, () => assert.ok(m.first.top >= m.firstHead.bottom - 0.5, 'first bubble under the header'));
    check(`chat ${tag}: an image opens in a new tab on tap`, () => assert.ok(m.imgs.every((i) => i.link === '_blank')));
    await context.close();
  }
  const NOTE_VIEWPORTS = [[375, 812], [768, 1024], [1440, 900], ...(SHOTS ? [[1280, 800], [1920, 1080]] : [])];
  const VIEWS = ['chat', 'explore', 'posts', 'profile'];
  for (const [width, height] of NOTE_VIEWPORTS) {
    const tag = `${width}x${height}`;
    for (const view of VIEWS) {
      if (!SHOTS && view !== 'chat') continue;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      await stub.attach(context);
      const page = await stub.open(context, { path: `/app.html?view=${view}`, errors: pageErrors });
      if (view === 'chat') {
        await page.waitForFunction(() => document.querySelector('#chat-list [data-chat-id]'), null, { timeout: 10000 });
        await page.locator('#chat-list .chat-row-copy > span').first().click({ timeout: 5000 });
        await page.waitForFunction(() => document.querySelectorAll('#chat-messages .message').length >= 31, null, { timeout: 10000 });
      }
      const bell = page.locator('#app-notification-button');
      const visible = await bell.isVisible();
      if (view === 'chat') check(`notifications ${tag} ${view}: the bell is visible`, () => assert.ok(visible));
      if (!visible) { if (SHOTS) console.log(`note: no bell in ${view} at ${tag}`); await context.close(); continue; }
      await bell.click();
      await page.waitForSelector('#app-notification-panel:not([hidden])', { timeout: 3000 });
      const m = await page.evaluate(() => {
        const panel = document.querySelector('#app-notification-panel');
        const bellEl = document.querySelector('#app-notification-button');
        const p = panel.getBoundingClientRect();
        const b = bellEl.getBoundingClientRect();
        const hit = document.elementFromPoint(p.left + p.width / 2, p.top + Math.min(p.height / 2, 40));
        const hitCorner = document.elementFromPoint(p.right - 20, p.bottom - 20);
        return { top: p.top, bottom: p.bottom, left: p.left, right: p.right, bellBottom: b.bottom, bellRight: b.right, w: innerWidth, h: innerHeight,
          onTop: !!hit?.closest('#app-notification-panel'), cornerOnTop: !!hitCorner?.closest('#app-notification-panel'),
          scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, expanded: bellEl.getAttribute('aria-expanded') };
      });
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `notifications-${view}-${tag}.png`) });
      check(`notifications ${tag} ${view}: the panel is on top at its centre and corner`, () => { assert.ok(m.onTop, 'centre'); assert.ok(m.cornerOnTop, 'corner'); });
      check(`notifications ${tag} ${view}: the panel starts under the bell, inside 8 px of the viewport`, () => {
        assert.ok(m.top >= m.bellBottom - 1, `top ${m.top} vs bell bottom ${m.bellBottom}`);
        assert.ok(m.right <= m.w - 8 + 0.5, `right ${m.right}/${m.w}`);
        assert.ok(m.left >= 8 - 0.5, `left ${m.left}`);
        assert.ok(m.bottom <= m.h - 8 + 0.5, `bottom ${m.bottom}/${m.h}`);
      });
      check(`notifications ${tag} ${view}: the right edge sits on the bell's right edge (or the 8 px gutter)`, () => assert.ok(Math.abs(m.right - m.bellRight) <= 1 || m.right >= m.w - 8 - 0.5 || m.left <= 8.5, `right ${m.right} bell ${m.bellRight}`));
      check(`notifications ${tag} ${view}: no horizontal overflow`, () => assert.ok(m.scrollWidth <= m.clientWidth, `${m.scrollWidth} > ${m.clientWidth}`));
      if (view === 'chat') {
        await page.keyboard.press('Escape');
        const afterEsc = await page.evaluate(() => ({ hidden: document.querySelector('#app-notification-panel').hidden, open: document.querySelector('#app-notification-panel').matches(':popover-open'), focus: document.activeElement?.id, expanded: document.querySelector('#app-notification-button').getAttribute('aria-expanded') }));
        check(`notifications ${tag}: Escape closes the panel and focus returns to the bell`, () => { assert.equal(afterEsc.hidden, true); assert.equal(afterEsc.open, false); assert.equal(afterEsc.focus, 'app-notification-button'); assert.equal(afterEsc.expanded, 'false'); });
        await bell.click();
        await page.waitForSelector('#app-notification-panel:not([hidden])', { timeout: 3000 });
        await page.mouse.click(Math.round(width / 2), 4); // empty header strip, nothing focusable
        const afterOutside = await page.evaluate(() => ({ hidden: document.querySelector('#app-notification-panel').hidden, focus: document.activeElement?.id }));
        check(`notifications ${tag}: an outside click closes the panel and focus returns to the bell`, () => { assert.equal(afterOutside.hidden, true); assert.equal(afterOutside.focus, 'app-notification-button'); });
        await bell.click();
        await page.waitForSelector('#app-notification-panel:not([hidden])', { timeout: 3000 });
        await bell.click();
        const afterToggle = await page.evaluate(() => document.querySelector('#app-notification-panel').hidden);
        check(`notifications ${tag}: the bell toggles the panel closed`, () => assert.equal(afterToggle, true));
      }
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
