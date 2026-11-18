// D-270: a message is read only when the member can see it (founder 2026-11-18: "the texts get seen automatically when
// the user doesnt even open them"). Stubbed Supabase, no Realtime: the 5 s sync delivers new messages.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/chat-read-focus.spec.mjs   (Vite on :5169)
// RF1 opening the chat reads what is there: one mark_conversation_read.
// RF2 the window loses focus (another app or window in front) with the chat still open: a new message is NOT read.
// RF3 the window comes back to the front: that message is read, once.
// RF4 the member moves to another view with the chat still selected: a new message is NOT read; back on Chat it is.
import { startAppStub, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const FRIEND = 'aaaaaaaa-aaaa-4aaa-8aaa-000000002701';
const rows = [{ id: FRIEND, name: 'Lakshya Bharadwaj', photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] }];
const msg = (n, body) => ({ id: `0e270000-0000-4000-8000-00000000000${n}`, sender_id: FRIEND, recipient_id: ME, body, created_at: new Date().toISOString(), delivered_at: null, read_at: null, edited_at: null, unsent_at: null });
const st = { rows, matchIds: [FRIEND], lastSeen: {}, messages: [msg(1, 'hey')] };
const stub = await startAppStub({ port: Number(process.env.E2E_PORT || 5169), state: st, deckRows: rows });
const reads = () => (st.receiptCalls || []).filter((c) => c.fn === 'mark_conversation_read').length;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
try {
  const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
  // The window's focus, controlled by the test (headless pages always report focus).
  await ctx.addInitScript(() => { window.__focused = true; document.hasFocus = () => window.__focused; });
  const page = await stub.open(ctx, { path: '/app.html?view=chat', errors });
  await page.waitForSelector('.chat-row-open', { timeout: 10000 });
  await page.locator('.chat-row', { hasText: 'Lakshya' }).locator('.chat-row-meta').click();
  await page.waitForTimeout(1500);
  check('RF1 opening the chat reads it once', reads() === 1, String(reads()));

  await page.evaluate(() => { window.__focused = false; window.dispatchEvent(new Event('blur')); });
  st.messages.push(msg(2, 'are you there?'));
  await page.waitForFunction(() => document.querySelector('#chat-messages')?.textContent.includes('are you there?'), null, { timeout: 12000 });
  await page.waitForTimeout(800);
  check('RF2 a message that arrives while the window is in the background is not read', reads() === 1, String(reads()));

  await page.evaluate(() => { window.__focused = true; window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(800);
  check('RF3 bringing the window to the front reads it, once', reads() === 2, String(reads()));

  await page.locator('[data-nav="explore"]').first().click();
  await page.waitForTimeout(500);
  st.messages.push(msg(3, 'ping from connect'));
  await page.waitForTimeout(7000);
  check('RF4 a message that arrives while on another view is not read', reads() === 2, String(reads()));
  await page.locator('[data-nav="chat"]').first().click();
  await page.waitForTimeout(1000);
  const shown = await page.evaluate(() => !document.querySelector('#chat-window')?.hidden);
  check('RF4 back on Chat with the thread on screen, it is read', shown ? reads() === 3 : reads() === 2, `${reads()} shown=${shown}`);
  check('RF no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
} finally {
  await browser.close();
  await stub.close();
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('chat-read-focus: ALL PASSED');
