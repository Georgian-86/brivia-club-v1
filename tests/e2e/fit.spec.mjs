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
// Section "menu" (320x568, 375x812, 390x844, 768x1024, 1280x800, 1440x900, 1920x1080; E2E_SCREENSHOTS saves each): the Profile
// ⚙ account menu keeps natural items (44-52 px, never stretched) and is at most 320 px wide; at 600 px and under it is a
// bottom sheet (flush with the left, right and bottom edges, a grabber, backdrop click closes). Tab order, Escape + focus,
// and the menu and the notification panel close each other. Fix round 1: with a leaked inset (an id rule and an inline
// bottom:0, as Safari's UA `[popover]{inset:0}` did) at 1600x1040, 1440x900 and 1280x800 the box still hugs its rows and
// bottom is auto; at 820x600 to 1600x1040 (and without popover support) it never covers ⚙ and stays under the header; at
// 375 a tap on the scrim over EDIT PROFILE or the brand closes the sheet and reaches nothing, the page does not scroll,
// and swipe down (past 60 px or a flick) closes it while a short drag snaps back.
// Section "blocked send" (A5, migration 0013; 320x568, 375x812, 390x844, 768x1024, 1280x800, 1440x900, 1920x1080): the
// member A blocked writes to A. The server stores the message and withholds it from A, so the insert answers 201 exactly
// like any other send and the sender's own thread reads it back. Enter sends it: the bubble shows as sent (mine), the
// composer clears, and no toast or error appears. Nothing in the client may differ from an ordinary send.
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
  for (const mode of ['popover', 'fallback']) for (const [width, height] of NOTE_VIEWPORTS) {
    const tag = `${width}x${height}${mode === 'fallback' ? ' no-popover' : ''}`;
    for (const view of VIEWS) {
      if ((!SHOTS || mode === 'fallback') && view !== 'chat') continue;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      if (mode === 'fallback') await context.addInitScript(() => { delete HTMLElement.prototype.showPopover; });
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
        // Controls that stopPropagation still close the panel: the chat "..." menu and a chat row's avatar (public profile).
        await bell.click();
        await page.waitForSelector('#app-notification-panel:not([hidden])', { timeout: 3000 });
        await page.locator('#chat-more').dispatchEvent('click'); // the panel may cover the button at phone widths
        const afterMore = await page.evaluate(() => ({ hidden: document.querySelector('#app-notification-panel').hidden, menu: !document.querySelector('#chat-more-menu').hidden }));
        check(`notifications ${tag}: opening the chat "..." menu closes the panel`, () => { assert.equal(afterMore.hidden, true); assert.equal(afterMore.menu, true); });
        await page.keyboard.press('Escape');
        await bell.click();
        await page.waitForSelector('#app-notification-panel:not([hidden])', { timeout: 3000 });
        const avatar = page.locator('#chat-list [data-public-profile-id]').first();
        if (await avatar.isVisible()) {
          await avatar.click({ force: true });
          const afterAvatar = await page.evaluate(() => document.querySelector('#app-notification-panel').hidden);
          check(`notifications ${tag}: opening a public profile from a chat row closes the panel`, () => assert.equal(afterAvatar, true));
          await page.keyboard.press('Escape');
        }
      }
      await context.close();
    }
  }
  const MENU_VIEWPORTS = [[320, 568], [375, 812], [390, 844], [768, 1024], [1280, 800], [1440, 900], [1920, 1080]];
  for (const [width, height] of MENU_VIEWPORTS) {
    const tag = `${width}x${height}`;
    const phone = width <= 780;
    const context = await stub.newContext(browser, { width, height }, { reducedMotion: 'reduce', ...(phone ? { isMobile: true, hasTouch: true } : {}) });
    const page = await stub.open(context, { path: '/app.html?view=profile', errors: pageErrors });
    await page.waitForSelector('#profile-settings-button', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(500);
    const state = () => page.evaluate(() => {
      const m = document.querySelector('#profile-settings-menu');
      const n = document.querySelector('#app-notification-panel');
      return { menu: m.matches('[popover]') ? m.matches(':popover-open') : !m.hidden, panel: !n.hidden, expanded: document.querySelector('#profile-settings-button').getAttribute('aria-expanded'), focus: document.activeElement?.id || document.activeElement?.textContent.trim() };
    });
    await page.evaluate(() => document.querySelector('#profile-settings-button').scrollIntoView({ block: 'center' }));
    await page.locator('#profile-settings-button').click();
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const menu = document.querySelector('#profile-settings-menu');
      const r = menu.getBoundingClientRect();
      const items = [...menu.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return { text: b.textContent.trim(), height: q.height, onTop: b.contains(hit), inside: q.left >= 0 && q.right <= innerWidth && q.bottom <= innerHeight && q.top >= 0 }; });
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, items, innerWidth, innerHeight, label: menu.getAttribute('aria-label'), grabber: (() => { const g = menu.querySelector('.profile-settings-grabber'); return !!g && g.getBoundingClientRect().height > 0; })(), scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
    });
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `menu-${tag}.png`) });
    const layout = width <= 600 ? 'sheet' : 'popover';
    const hint = JSON.stringify({ w: Math.round(m.width), h: Math.round(m.height), top: Math.round(m.top), bottom: Math.round(m.bottom), items: m.items.map((i) => Math.round(i.height)) });
    check(`menu ${tag}: five items at their natural height, 44-52 px ${hint}`, () => { assert.equal(m.items.length, 5); for (const item of m.items) assert.ok(item.height >= 44 && item.height <= 52, `${item.text} is ${item.height}px`); });
    check(`menu ${tag}: every item is on screen and on top ${hint}`, () => m.items.forEach((i) => { assert.ok(i.onTop, `${i.text} covered`); assert.ok(i.inside, `${i.text} off screen`); }));
    check(`menu ${tag}: at most 320 px wide unless it is a sheet ${hint}`, () => assert.ok(m.width <= 320.5 || layout === 'sheet'));
    check(`menu ${tag}: no horizontal overflow`, () => assert.ok(m.scrollWidth <= m.clientWidth));
    check(`menu ${tag}: labelled "Account menu"`, () => assert.equal(m.label, 'Account menu'));
    if (layout === 'sheet') {
      check(`menu ${tag}: a bottom sheet, flush left, right and bottom ${hint}`, () => { assert.ok(Math.abs(m.bottom - m.innerHeight) <= 1, `bottom ${m.bottom}/${m.innerHeight}`); assert.equal(m.left, 0); assert.equal(m.width, m.innerWidth); assert.ok(m.grabber, 'grabber'); assert.ok(m.height < m.innerHeight * 0.6, 'sheet too tall'); });
    } else {
      check(`menu ${tag}: a popover inside the viewport, no grabber ${hint}`, () => { assert.ok(m.left >= 8 - 0.5 && m.right <= m.innerWidth - 8 + 0.5, `${m.left}-${m.right}`); assert.ok(m.top >= 0 && m.bottom <= m.innerHeight, 'vertical'); assert.equal(m.grabber, false); });
    }
    // Backdrop (sheet) or any outside click closes it.
    await page.mouse.click(Math.round(width / 2), 6);
    await page.waitForTimeout(150);
    const afterOutside = await state();
    check(`menu ${tag}: a click outside the menu (the backdrop on a phone) closes it`, () => { assert.equal(afterOutside.menu, false); assert.equal(afterOutside.expanded, 'false'); });
    // Keyboard: Tab order and Escape.
    await page.evaluate(() => document.querySelector('#profile-settings-button').focus());
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const tabbed = [];
    for (let i = 0; i < 5; i += 1) { await page.keyboard.press('Tab'); tabbed.push((await state()).focus); }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const afterEsc = await state();
    check(`menu ${tag}: Tab walks the five items in order; Escape closes and focus returns to the gear`, () => {
      assert.deepEqual(tabbed, ['NOTIFICATIONS', 'BLOCKED USERS', 'REMOVED CONNECTIONS', 'PRIVACY & ACCOUNT', 'LOG OUT']);
      assert.equal(afterEsc.menu, false); assert.equal(afterEsc.focus, 'profile-settings-button');
    });
    // The two top layers cooperate.
    const bell = page.locator('#app-notification-button');
    if (await bell.isVisible()) {
      await bell.dispatchEvent('click');
      await page.waitForSelector('#app-notification-panel:not([hidden])', { timeout: 3000 });
      await page.locator('#profile-settings-button').dispatchEvent('click');
      await page.waitForTimeout(150);
      const menuOverPanel = await state();
      check(`menu ${tag}: opening the account menu closes the notification panel`, () => { assert.equal(menuOverPanel.menu, true); assert.equal(menuOverPanel.panel, false); });
      await bell.dispatchEvent('click');
      await page.waitForTimeout(150);
      const panelOverMenu = await state();
      check(`menu ${tag}: opening the notification panel closes the account menu`, () => { assert.equal(panelOverMenu.panel, true); assert.equal(panelOverMenu.menu, false); });
      await page.keyboard.press('Escape');
      await page.locator('#profile-settings-button').dispatchEvent('click');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      const both = await state();
      check(`menu ${tag}: Escape leaves nothing open`, () => { assert.equal(both.menu, false); assert.equal(both.panel, false); });
    } else check(`menu ${tag}: bell hidden in this view (noted)`, () => {});
    await context.close();
  }
  // A4 fix round 1. (1) Safari stretched the popover from under the header to the window's bottom: an inset the script
  // does not own (the UA `[popover]{inset:0}`) reached the box. Mimic it at a low specificity (an id rule, then an inline
  // bottom:0 set before opening) and require a box that hugs its rows, with bottom computed as auto.
  const box = (page) => page.evaluate(() => {
    const menu = document.querySelector('#profile-settings-menu');
    const r = menu.getBoundingClientRect(); const cs = getComputedStyle(menu);
    const kids = [...menu.children].filter((c) => c.getClientRects().length);
    const first = kids[0].getBoundingClientRect(); const last = kids[kids.length - 1].getBoundingClientRect();
    const px = (v) => parseFloat(v) || 0;
    const content = (last.bottom + px(getComputedStyle(kids[kids.length - 1]).marginBottom)) - (first.top - px(getComputedStyle(kids[0]).marginTop)) + px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
    const g = document.querySelector('#profile-settings-button').getBoundingClientRect();
    const header = document.querySelector('.app-topbar')?.getBoundingClientRect().bottom || 0;
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, content, bottomValue: String(menu.computedStyleMap().get('bottom')), rows: [...menu.querySelectorAll('button')].map((b) => b.getBoundingClientRect().height), gear: { top: g.top, bottom: g.bottom, left: g.left, right: g.right }, header, innerHeight };
  });
  const short = (b) => JSON.stringify({ top: Math.round(b.top), h: Math.round(b.height), content: Math.round(b.content), bottom: b.bottomValue, rows: b.rows.map(Math.round), gear: [Math.round(b.gear.top), Math.round(b.gear.bottom)], header: Math.round(b.header) });
  const overlaps = (a, g) => a.left < g.right && a.right > g.left && a.top < g.bottom && a.bottom > g.top;
  for (const [width, height] of [[1600, 1040], [1440, 900], [1280, 800]]) {
    for (const [how, leak] of [['id rule bottom:0;right:0', 'sheet'], ['inline bottom:0 before open', 'inline']]) {
      const context = await stub.newContext(browser, { width, height }, { reducedMotion: 'reduce' });
      const page = await stub.open(context, { path: '/app.html?view=profile', errors: pageErrors });
      await page.waitForSelector('#profile-settings-button', { state: 'attached', timeout: 10000 });
      await page.waitForTimeout(400);
      if (leak === 'sheet') await page.addStyleTag({ content: '#profile-settings-menu{bottom:0;right:0}' });
      else await page.evaluate(() => { document.querySelector('#profile-settings-menu').style.bottom = '0'; });
      await page.locator('#profile-settings-button').click();
      await page.waitForTimeout(200);
      const b = await box(page);
      check(`menu leak ${width}x${height} (${how}): the box hugs its rows, bottom auto, rows ~44 px ${short(b)}`, () => {
        assert.ok(Math.abs(b.height - b.content) <= 2, `height ${b.height} vs content ${b.content}`);
        assert.equal(b.bottomValue, 'auto');
        b.rows.forEach((h) => assert.ok(h >= 44 && h <= 52, `row ${h}`));
      });
      await context.close();
    }
  }
  // (2) Never over the gear: below it if there is room, else above, else the larger side, capped, with its own scroll.
  // (3) Without popover support the menu never rises over the header.
  for (const [width, height, nopop] of [[820, 600], [1024, 700], [1280, 800], [1440, 900], [1600, 1040], [1440, 900, true], [1280, 800, true], [1024, 700, true]]) {
    for (const scroll of ['none', 'center']) {
      const tag = `${width}x${height}${nopop ? ' without popover' : ''} scroll ${scroll}`;
      const context = await stub.newContext(browser, { width, height }, { reducedMotion: 'reduce' });
      if (nopop) await context.addInitScript(() => { delete HTMLElement.prototype.showPopover; delete HTMLElement.prototype.hidePopover; });
      const page = await stub.open(context, { path: '/app.html?view=profile', errors: pageErrors });
      await page.waitForSelector('#profile-settings-button', { state: 'attached', timeout: 10000 });
      await page.waitForTimeout(400);
      if (scroll === 'center') await page.evaluate(() => document.querySelector('#profile-settings-button').scrollIntoView({ block: 'center' }));
      await page.locator('#profile-settings-button').click();
      await page.waitForTimeout(200);
      const b = await box(page);
      if (SHOTS && scroll === 'none') await page.screenshot({ path: path.join(SHOTS, `menu-gear-${tag.replace(/ /g, '-')}.png`) });
      check(`menu ${tag}: the menu never covers the gear ${short(b)}`, () => assert.ok(!overlaps(b, b.gear)));
      check(`menu ${tag}: inside the viewport, under the header ${short(b)}`, () => { assert.ok(b.top >= Math.max(0, b.header + 8) - 0.5, `top ${b.top}`); assert.ok(b.bottom <= b.innerHeight + 0.5, `bottom ${b.bottom}`); });
      await context.close();
    }
  }
  // (4) The phone sheet: a tap on the dimmed page closes it and reaches nothing else; the page does not scroll under
  // it; a swipe down on the grabber or the header closes it, a short slow drag snaps back.
  {
    const openSheetPage = async (motion) => {
      const context = await stub.newContext(browser, { width: 375, height: 812 }, { reducedMotion: motion, isMobile: true, hasTouch: true });
      const page = await stub.open(context, { path: '/app.html?view=profile', errors: pageErrors });
      await page.waitForSelector('#profile-settings-button', { state: 'attached', timeout: 10000 });
      await page.waitForTimeout(400);
      await page.evaluate(() => document.querySelector('#profile-settings-button').scrollIntoView({ block: 'center' }));
      return { context, page };
    };
    const isOpen = (page) => page.evaluate(() => !!document.querySelector('#profile-settings-menu')?.matches(':popover-open'));
    // A tap that cannot land (an editor opened by a click that went through) is a failed check, not a crash.
    const tapGear = async (page) => {
      await page.evaluate(() => document.querySelector('#profile-edit-modal')?.remove());
      await page.locator('#profile-settings-button').tap({ timeout: 3000 }).catch((error) => check('menu sheet 375: the gear can be tapped', () => { throw error; }));
      await page.waitForTimeout(250);
    };
    const drag = async (page, sel, dy, steps, stepMs) => {
      const cdp = await page.context().newCDPSession(page);
      const r = await page.locator(sel).boundingBox({ timeout: 3000 }).catch(() => null);
      if (!r) { check(`menu sheet 375: ${sel} is on screen to drag`, () => assert.fail('not found')); return null; }
      const x = r.x + r.width / 2; const y = r.y + r.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      let mid = null;
      for (let i = 1; i <= steps; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * i) / steps }] });
        if (stepMs) await page.waitForTimeout(stepMs);
        if (stepMs && i === Math.ceil(steps / 2)) mid = await page.evaluate(() => document.querySelector('#profile-settings-menu').style.transform);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(300);
      return mid;
    };
    const { context, page } = await openSheetPage('reduce');
    await tapGear(page);
    const editor = await page.locator('#profile-photo-editor').boundingBox();
    const ex = editor.x + editor.width / 2; const ey = editor.y + editor.height / 2;
    const hitEditor = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return `${e?.tagName}.${e?.className}`; }, [ex, ey]);
    const y0 = await page.evaluate(() => scrollY);
    await page.mouse.move(ex, ey);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);
    const y1 = await page.evaluate(() => scrollY);
    const locked = await page.evaluate(() => document.documentElement.classList.contains('account-sheet-open') && getComputedStyle(document.documentElement).overflowY === 'hidden');
    await page.touchscreen.tap(ex, ey);
    await page.waitForTimeout(400);
    const afterEditorTap = await page.evaluate(() => ({ open: document.querySelector('#profile-settings-menu').matches(':popover-open'), editor: !!document.querySelector('#profile-edit-modal'), locked: document.documentElement.classList.contains('account-sheet-open') }));
    check(`menu sheet 375: the dimmed page above the sheet is a solid scrim (${hitEditor})`, () => assert.match(hitEditor, /account-sheet-scrim/));
    check(`menu sheet 375: the page does not scroll while the sheet is open (${y0} -> ${y1}, locked ${locked})`, () => { assert.equal(y1, y0); assert.equal(locked, true); });
    check(`menu sheet 375: a tap over EDIT PROFILE closes the sheet and does not open the editor ${JSON.stringify(afterEditorTap)}`, () => { assert.equal(afterEditorTap.open, false); assert.equal(afterEditorTap.editor, false); assert.equal(afterEditorTap.locked, false); });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(150);
    await tapGear(page);
    const brand = await page.locator('.app-brand').boundingBox();
    await page.evaluate(() => document.querySelector('#profile-edit-modal')?.remove());
    const before = page.url();
    await page.touchscreen.tap(brand.x + brand.width / 2, brand.y + brand.height / 2);
    await page.waitForTimeout(600);
    const afterBrand = { open: await isOpen(page), url: page.url() };
    check(`menu sheet 375: a tap over the brand link closes the sheet and does not navigate ${JSON.stringify(afterBrand)}`, () => { assert.equal(afterBrand.open, false); assert.equal(afterBrand.url, before); });
    if (afterBrand.url !== before) { await page.goto(before); await page.waitForSelector('#profile-settings-button', { state: 'attached', timeout: 10000 }); await page.waitForTimeout(400); }
    await tapGear(page);
    const reducedMid = await drag(page, '#profile-settings-menu .profile-settings-grabber', 120, 8, 20);
    const reducedClosed = !(await isOpen(page));
    check(`menu sheet 375 reduced motion: a swipe down on the grabber closes it; the sheet does not follow the finger (${reducedMid})`, () => { assert.equal(reducedClosed, true); assert.ok(!reducedMid); });
    await context.close();
    const moving = await openSheetPage('no-preference');
    await tapGear(moving.page);
    const followMid = await drag(moving.page, '#profile-settings-menu .profile-settings-account', 30, 6, 40);
    const snapped = { open: await isOpen(moving.page), transform: await moving.page.evaluate(() => document.querySelector('#profile-settings-menu').style.transform) };
    check(`menu sheet 375: a short slow drag follows the finger (${followMid}) and snaps back ${JSON.stringify(snapped)}`, () => { assert.match(String(followMid), /translateY\(\d/); assert.equal(snapped.open, true); assert.ok(!/translateY\([1-9]/.test(snapped.transform)); });
    await drag(moving.page, '#profile-settings-menu .profile-settings-grabber', 100, 6, 20);
    const farClosed = !(await isOpen(moving.page));
    check(`menu sheet 375: dragging past 60 px closes it (${farClosed})`, () => assert.equal(farClosed, true));
    await tapGear(moving.page);
    await drag(moving.page, '#profile-settings-menu .profile-settings-grabber', 40, 2, 0);
    const flickClosed = !(await isOpen(moving.page));
    check(`menu sheet 375: a fast 40 px flick closes it (${flickClosed})`, () => assert.equal(flickClosed, true));
    await moving.context.close();
  }
  // Section "blocked send" (A5).
  const BLOCKED_SEND = 'Are we still on for Saturday at the club?';
  for (const [width, height] of [[320, 568], [375, 812], [390, 844], [768, 1024], [1280, 800], [1440, 900], [1920, 1080]]) {
    const tag = `${width}x${height}`;
    const phone = width <= 780;
    st.messages = [text(1), text(2)];
    st.routes = { ...(st.routes || {}), 'POST brivia_messages': { status: 201 } };
    const context = await stub.newContext(browser, { width, height }, { reducedMotion: 'reduce', ...(phone ? { isMobile: true, hasTouch: true } : {}) });
    // The server keeps the row (withheld from A only): the sender's next read returns it, as for any message.
    const posted = [];
    await context.route(/\/rest\/v1\/brivia_messages/, (route) => {
      if (route.request().method() === 'POST') posted.push(JSON.parse(route.request().postData() || '{}'));
      if (route.request().method() === 'POST' && st.routes['POST brivia_messages'].status < 300) {
        const row = posted[posted.length - 1];
        st.messages.push({ id: `sent-${posted.length}`, message_type: 'text', created_at: new Date().toISOString(), ...row });
      }
      return route.fallback();
    });
    const page = await stub.open(context, { path: '/app.html?view=chat', errors: pageErrors });
    await page.waitForFunction(() => document.querySelector('#chat-list [data-chat-id]'), null, { timeout: 10000 });
    await page.locator('#chat-list .chat-row-copy > span').first().click({ timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll('#chat-messages .message').length >= 2, null, { timeout: 10000 });
    // Every toast shown from here on is recorded (a toast hides itself after 2.6 s).
    await page.evaluate(() => {
      window.__toasts = [];
      const toast = document.querySelector('#app-toast');
      new MutationObserver(() => { if (toast.classList.contains('show')) window.__toasts.push(toast.textContent.trim()); }).observe(toast, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
    });
    const input = page.locator('#chat-input');
    await input.fill(BLOCKED_SEND);
    await input.press('Enter');
    const shown = await page.waitForFunction((body) => [...document.querySelectorAll('#chat-messages .message.me')].some((m) => m.textContent.includes(body)), BLOCKED_SEND, { timeout: 5000 }).then(() => true, () => false);
    await page.waitForTimeout(800);
    const s = await page.evaluate(() => {
      const toast = document.querySelector('#app-toast');
      return { value: document.querySelector('#chat-input').value, toast: [...new Set(window.__toasts)].join(' | ') || (toast?.classList.contains('show') ? toast.textContent.trim() : ''), attachmentError: document.querySelector('.chat-attachment-error:not([hidden])')?.textContent.trim() || '', scrollWidth: document.documentElement.scrollWidth, innerWidth };
    });
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `blocked-send-${tag}.png`) });
    check(`blocked send ${tag}: one insert to A with the text (${posted.length})`, () => { assert.equal(posted.length, 1); assert.equal(posted[0].recipient_id, A); assert.equal(posted[0].body, BLOCKED_SEND); });
    check(`blocked send ${tag}: the bubble shows as sent in my thread`, () => assert.ok(shown));
    check(`blocked send ${tag}: the composer clears (${JSON.stringify(s.value)})`, () => assert.equal(s.value, ''));
    check(`blocked send ${tag}: no toast and no error (${JSON.stringify([s.toast, s.attachmentError])})`, () => { assert.equal(s.toast, ''); assert.equal(s.attachmentError, ''); });
    check(`blocked send ${tag}: no horizontal overflow ${s.scrollWidth}/${s.innerWidth}`, () => assert.ok(s.scrollWidth <= s.innerWidth));
    await context.close();
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
