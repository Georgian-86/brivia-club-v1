// New chat messages play the Brivia sax (D-256, founder 2026-11-14: "the web notifications for the whole app must be
// like saxophone sound only"). Stubbed Supabase (no Realtime: the inbox sync, every 15 s since D-257, is the path tested).
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/message-sound.spec.mjs   (Vite on :5290)
// MS1 a message that arrives while Brivia is open on another view asks for the sax (the notify cue), once.
// MS2 a message in the chat open on screen does not.
import { startAppStub, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const FRIEND = 'aaaaaaaa-aaaa-4aaa-8aaa-000000002561';
const rows = [{ id: FRIEND, name: 'Karthik Mishra', photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] }];
const msg = (n, body) => ({ id: `0e256000-0000-4000-8000-00000000000${n}`, sender_id: FRIEND, recipient_id: ME, body, created_at: new Date().toISOString(), delivered_at: null, read_at: null, edited_at: null, unsent_at: null });
const st = { rows, matchIds: [FRIEND], lastSeen: {}, messages: [] };
const stub = await startAppStub({ port: 5290, state: st, deckRows: rows });
const browser = await chromium.launch();
try {
  const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
  await ctx.addInitScript(() => { window.__briviaSoundLog = []; });
  const page = await stub.open(ctx, { path: '/app.html?view=home' });
  await page.waitForTimeout(3000);
  st.messages.push(msg(1, 'Hey, one small suggestion'));
  await page.waitForTimeout(17000);
  const log1 = await page.evaluate(() => window.__briviaSoundLog.slice());
  check('MS1 a message while on another view asks for the sax, once', log1.filter((x) => x === 'notify:msg:0e256000-0000-4000-8000-000000000001').length === 1, JSON.stringify(log1));
  await page.goto(`${stub.url}/app.html?view=chat`);
  await page.waitForSelector('.chat-row-open', { timeout: 8000 });
  await page.locator('.chat-row', { hasText: 'Karthik' }).locator('.chat-row-meta').click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__briviaSoundLog.length = 0; });
  st.messages.push(msg(2, 'Also a few more UI suggestions'));
  await page.waitForTimeout(17000);
  const log2 = await page.evaluate(() => window.__briviaSoundLog.slice());
  check('MS2 a message in the chat open on screen plays nothing', !log2.some((x) => x.includes('0e256000-0000-4000-8000-000000000002')), JSON.stringify(log2));
  await ctx.close();
} finally {
  await browser.close();
  await stub.close();
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('message-sound: ALL PASSED');
