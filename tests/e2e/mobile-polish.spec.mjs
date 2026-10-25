// Mobile polish (D-096), stubbed Supabase (Vite on :5167). Never touches a real Supabase project.
// * Login on phones (360 x 700, 390 x 844): the telephone shows at the top, centred; JOIN THE CLUB is one line; the
//   Google button is fully on screen; outlined field icons (no ✉ / ♙ glyphs).
// * Chat: on desktop a 40 px × beside ••• closes the thread to "Your messages", and so does Escape (not while a menu
//   is open); on phones there is no ×, the inbox is one page (the list does not scroll inside itself) under one heading.
// * Header: the bell and the avatar are the same size and on one line at 1440 and 390 px.
// * Landing on phones: WHERE IDEAS BEGIN is one line, no telephone, nothing wider than the screen.
// * The deck hint has no middle dots.
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/mobile-polish.spec.mjs
import assert from 'node:assert/strict';
import { startAppStub, defaultDeckRows, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const ids = defaultDeckRows.map((r) => r.id);
const messages = [{ id: 'm1', sender_id: ids[0], recipient_id: ME, content: 'Badminton on Sunday?', created_at: new Date(Date.now() - 3e5).toISOString() }];
const stub = await startAppStub({ port: 5167, state: { matchIds: ids, messages } });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log('PASS ', name); } catch (e) { failures++; console.log('FAIL ', name, e.message.replace(/\s+/g, ' ').slice(0, 400)); } };
const signedOut = async (viewport) => {
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 800, hasTouch: viewport.width < 800 });
  await ctx.route('https://stub.supabase.local/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }));
  await ctx.addInitScript(() => { try { localStorage.setItem('brivia-intro-seen', 'true'); } catch { /* none */ } });
  return ctx;
};

try {
  // 1. Login on phones.
  for (const viewport of [{ width: 360, height: 700 }, { width: 390, height: 844 }]) {
    const ctx = await signedOut(viewport);
    const page = await ctx.newPage();
    await page.goto(`${stub.url}/auth.html#login`, { waitUntil: 'load' });
    await page.waitForSelector('.auth-login.is-active #login-form');
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const phone = r('.auth-phone'); const title = r('#auth-title'); const g = r('.auth-login .auth-google-trigger');
      const titleLines = Math.round(title.height / parseFloat(getComputedStyle(document.querySelector('#auth-title')).lineHeight || title.height));
      const icons = [...document.querySelectorAll('#login-form .auth-field-icon')].map((i) => ({ font: getComputedStyle(i).fontSize, mask: getComputedStyle(i).maskImage || getComputedStyle(i).webkitMaskImage }));
      return { phoneH: Math.round(phone.height), phoneMid: Math.round(phone.left + phone.width * .25), mid: Math.round(innerWidth / 2), titleLines, titleBelowPhone: title.top >= phone.bottom - 24, googleBottom: Math.round(g.bottom), h: innerHeight, icons, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    const tag = `${viewport.width}x${viewport.height}`;
    await check(`${tag} login: the telephone shows at the top, centred, above the title (${JSON.stringify(m)})`, () => {
      assert.ok(m.phoneH >= 120); assert.ok(Math.abs(m.phoneMid - m.mid) <= 6); assert.ok(m.titleBelowPhone);
    });
    await check(`${tag} login: JOIN THE CLUB is one line, Google is on screen, nothing scrolls sideways`, () => {
      assert.equal(m.titleLines, 1); assert.ok(m.googleBottom <= m.h, `${m.googleBottom} > ${m.h}`); assert.ok(m.overflow <= 0);
    });
    await check(`${tag} login: outlined field icons, no text glyphs`, () => { m.icons.forEach((i) => { assert.equal(i.font, '0px'); assert.match(i.mask, /url\(/); }); });
    await ctx.close();
  }

  // 2. Chat: × and Escape on desktop; the phone inbox as one page.
  for (const [tag, viewport, phone] of [['1440', { width: 1440, height: 900 }, false], ['390', { width: 390, height: 844 }, true]]) {
    const ctx = await stub.newContext(browser, viewport, phone ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: '/app.html?view=chat' });
    await page.waitForFunction(() => document.querySelector('#chat-list [data-chat-id]'), null, { timeout: 10000 });
    if (phone) {
      const inbox = await page.evaluate(() => {
        const list = document.querySelector('#chat-list');
        const visible = (s) => { const e = document.querySelector(s); return Boolean(e && e.getClientRects().length && getComputedStyle(e).display !== 'none'); };
        return { overflow: getComputedStyle(list).overflowY, scrollsInside: list.scrollHeight > list.clientHeight + 1, heading: document.querySelector('[data-view="chat"] .view-heading h1')?.textContent, topline: visible('[data-view="chat"] .view-topline'), threadsHead: visible('.inbox-panel-head') };
      });
      await check(`${tag} chat: the inbox is one page under one heading (${JSON.stringify(inbox)})`, () => {
        assert.equal(inbox.scrollsInside, false); assert.equal(inbox.heading, 'Messages'); assert.equal(inbox.topline, false); assert.equal(inbox.threadsHead, false);
      });
    }
    await page.locator('#chat-list [data-chat-id]').first().click();
    await page.waitForFunction(() => !document.querySelector('#chat-window')?.hidden, null, { timeout: 5000 });
    const close = await page.evaluate(() => { const c = document.querySelector('#chat-close'); const m = document.querySelector('#chat-more'); const box = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }; return { shown: Boolean(c && getComputedStyle(c).display !== 'none'), label: c?.getAttribute('aria-label'), close: c && box(c), more: m && box(m) }; });
    if (!phone) {
      await check(`${tag} chat: a × beside •••, the same size, labelled (${JSON.stringify(close)})`, () => { assert.equal(close.shown, true); assert.equal(close.label, 'Close chat'); assert.deepEqual(close.close, close.more); });
      await page.click('#chat-more');
      await page.keyboard.press('Escape');
      await check(`${tag} chat: Escape with the ••• menu open closes the menu, not the thread`, async () => assert.equal(await page.evaluate(() => !document.querySelector('#chat-window').hidden), true));
      await page.keyboard.press('Escape');
      await check(`${tag} chat: a second Escape closes the thread back to "Your messages"`, async () => {
        assert.equal(await page.evaluate(() => document.querySelector('#chat-window').hidden), true);
        assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('chat-row-open')), true);
      });
      await page.locator('#chat-list [data-chat-id]').first().click();
      await page.click('#chat-close');
      await check(`${tag} chat: × closes the thread`, async () => assert.equal(await page.evaluate(() => document.querySelector('#chat-window').hidden), true));
    } else {
      await check(`${tag} chat: no × on phones (← goes back)`, () => assert.equal(close.shown, false));
    }

    // 3. Header icons, and the deck hint.
    const icons = await page.evaluate(() => ['#app-notification-button', '#app-avatar-button'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.top)]; }));
    await check(`${tag} header: the bell and the avatar are the same size, on one line (${JSON.stringify(icons)})`, () => { assert.deepEqual(icons[0], icons[1]); assert.ok(icons[0][0] >= 40); });
    await ctx.close();
  }
  {
    const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
    const page = await stub.open(ctx, { path: '/app.html' });
    await page.waitForTimeout(800);
    const hint = await page.evaluate(() => document.querySelector('.swipe-hint')?.textContent || '');
    await check(`deck: the hint has no middle dots (${hint.trim()})`, () => { assert.ok(hint.includes('PASS WITH INTENTION')); assert.doesNotMatch(hint, /·/); });
    await ctx.close();
  }

  // 4. Landing on phones: WHERE IDEAS BEGIN, one line, no telephone.
  for (const viewport of [{ width: 360, height: 760 }, { width: 390, height: 844 }]) {
    const ctx = await signedOut(viewport);
    const page = await ctx.newPage();
    await page.goto(`${stub.url}/index.html`, { waitUntil: 'load' });
    await page.evaluate(() => document.querySelector('.orbit-section').scrollIntoView());
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => { const h = document.querySelector('.orbit-statement'); const r = h.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(h).fontSize); return { lines: Math.round(r.height / lh), right: Math.round(r.right), left: Math.round(r.left), w: innerWidth, phone: getComputedStyle(document.querySelector('.orbit-phone')).display, video: document.querySelectorAll('video[src*="write_Its"], source[src*="write_Its"]').length }; });
    await check(`${viewport.width} landing: WHERE IDEAS BEGIN is one line inside the screen, no telephone, no camera video (${JSON.stringify(m)})`, () => {
      assert.equal(m.lines, 1); assert.ok(m.left >= 0 && m.right <= m.w); assert.equal(m.phone, 'none'); assert.equal(m.video, 0);
    });
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
