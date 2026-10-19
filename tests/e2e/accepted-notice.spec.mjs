// "Accepted your request" notifications and the chat thread header (2026-10-19, founder's live test with Aarav and
// Golu), against the stubbed Supabase (app-stub.mjs):
// * a request I sent that was accepted while I was away shows one notification on load ("<name> accepted your
//   request. Say hi."), opens the chat when tapped, and never comes back after a reload;
// * one accepted while the app is open shows within the ~30 s connection sync;
// * the thread header grows with large system text: name and status stay one line each, nothing spills out.
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/accepted-notice.spec.mjs
import assert from 'node:assert/strict';
import { startAppStub, defaultDeckRows } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };
const golu = { ...defaultDeckRows[1], name: 'Golu Kumar', full_name: 'Golu Kumar', photo_url: null };
const other = defaultDeckRows[0];
const accepted = (id) => ({ body: [{ to_id: id, note: null, status: 'accepted', created_at: new Date().toISOString() }] });
const panel = (page) => page.evaluate(() => ({
  badge: document.querySelector('#notification-badge')?.hidden ? '' : document.querySelector('#notification-badge')?.textContent,
  items: [...document.querySelectorAll('#notification-list .notification-item')].map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
}));

const state = { rows: [golu, other], matchIds: [golu.id], routes: { 'rpc/my_outgoing_requests': accepted(golu.id) } };
const stub = await startAppStub({ port: Number(process.env.E2E_PORT || 5174), state });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
try {
  {
    const context = await stub.newContext(browser, { width: 390, height: 844 });
    const page = await stub.open(context, { path: '/app.html?view=chat' });
    await page.waitForFunction(() => !document.querySelector('#notification-badge')?.hidden, null, { timeout: 8000 }).catch(() => {});
    const first = await panel(page);
    check(`accepted while away: one notification on load (${JSON.stringify(first)})`, () => {
      assert.equal(first.badge, '1');
      assert.ok(first.items.some((t) => /Golu Kumar accepted your request\. Say hi\./.test(t)), first.items.join(' | '));
    });
    await page.locator('#app-notification-button').click();
    await page.locator('#notification-list .notification-item').first().click();
    await page.waitForTimeout(500);
    const opened = await page.evaluate(() => ({ name: document.querySelector('#chat-name')?.textContent, badgeHidden: document.querySelector('#notification-badge')?.hidden }));
    check(`tapping it opens the chat with Golu and clears the badge (${JSON.stringify(opened)})`, () => { assert.equal(opened.name, 'Golu Kumar'); assert.equal(opened.badgeHidden, true); });
    // Large system text: the header holds it.
    await page.addStyleTag({ content: 'body.app-body .app-view[data-view="chat"] .chat-window-head #chat-name{font-size:40px!important} body.app-body .app-view[data-view="chat"] .chat-window-head #chat-status{font-size:26px!important}' });
    await page.waitForTimeout(200);
    const head = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const h = document.querySelector('.chat-window-head'); const n = document.querySelector('#chat-name'); const s = document.querySelector('#chat-status');
      const hb = box(h);
      const inside = (el) => { const b = box(el); return b.top >= hb.top - 0.5 && b.bottom <= hb.bottom + 0.5 && b.right <= hb.right + 0.5; };
      return { nameInside: inside(n), statusInside: inside(s), nameLines: Math.round(box(n).height / parseFloat(getComputedStyle(n).lineHeight)), statusLines: Math.round(box(s).height / parseFloat(getComputedStyle(s).lineHeight)), noScrollX: document.documentElement.scrollWidth <= innerWidth + 1 };
    });
    check(`large text: name and status stay inside the header on one line each (${JSON.stringify(head)})`, () => {
      assert.equal(head.nameInside, true); assert.equal(head.statusInside, true); assert.equal(head.nameLines, 1); assert.equal(head.statusLines, 1); assert.equal(head.noScrollX, true);
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const again = await panel(page);
    check(`after a reload it does not come back (${JSON.stringify(again)})`, () => { assert.equal(again.badge, ''); assert.ok(!again.items.some((t) => /accepted your request/.test(t))); });
    // Accepted while the app is open: a new match appears; the connection sync (every ~30 s) notices it.
    state.matchIds.push(other.id);
    state.routes['rpc/my_outgoing_requests'] = { body: [...accepted(golu.id).body, ...accepted(other.id).body] };
    const live = await page.waitForFunction((name) => [...document.querySelectorAll('#notification-list .notification-item')].some((el) => el.textContent.includes(`${name} accepted your request`)), other.name, { timeout: 40000 }).then(() => true).catch(() => false);
    const after = await panel(page);
    check(`accepted while open: shows within the sync (${JSON.stringify(after)})`, () => { assert.equal(live, true); assert.equal(after.badge, '1'); });
    await context.close();
  }
} finally { await browser.close(); await stub.close(); }
for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
