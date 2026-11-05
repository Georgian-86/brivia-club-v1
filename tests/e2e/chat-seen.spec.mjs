// Chats read on any device (D-215, 0064), against stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/chat-seen.spec.mjs   (Vite on :5191)
// CS1 a conversation read on another device (my_chat_seen) clears its "messages from" row from the bell here.
// CS2 opening the Chats tab clears the bell's message rows and tells the server (mark_chat_seen with p_other null).
// CS3 opening a conversation tells the server how far it was read (mark_chat_seen with that member).
// CS4 before 0064 (PGRST202): the bell works as before, with no page errors.
import { startAppStub, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const ASHA = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000213';
const RAVI = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000214';
const person = (id, name) => ({ id, name, photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] });
const rows = [person(ASHA, 'Asha Rao'), person(RAVI, 'Ravi Menon')];
const at = (m) => new Date(Date.now() - m * 6e4).toISOString();
const messages = () => [
  { id: 's1', sender_id: ASHA, recipient_id: ME, body: 'Coffee?', created_at: at(10) },
  { id: 's2', sender_id: ASHA, recipient_id: ME, body: 'Thursday?', created_at: at(8) },
  { id: 's3', sender_id: RAVI, recipient_id: ME, body: 'Hello there', created_at: at(6) },
];
const st = { rows, matchIds: [ASHA, RAVI], messages: messages(), chatSeen: [] };
const stub = await startAppStub({ port: 5191, state: st, deckRows: rows });
const browser = await chromium.launch();
const bellRows = (page) => page.$$eval('#notification-list [data-notification-person]', (els) => els.map((el) => el.dataset.notificationPerson));
const waitRows = (page, n) => page.waitForFunction((count) => document.querySelectorAll('#notification-list [data-notification-person]').length === count, n, { timeout: 15000 }).then(() => true).catch(() => false);
try {
  {
    const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
    const page = await stub.open(ctx, { path: '/app.html' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    check('setup: both senders are in the bell', await waitRows(page, 2), JSON.stringify(await bellRows(page)));
    // CS1: Asha's chat was read on the phone, up to her newest message.
    st.chatSeen = [{ other_id: ASHA, seen_at: at(7.5) }];
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    check('CS1 a chat read on another device leaves the bell', await waitRows(page, 1) && (await bellRows(page))[0] === RAVI, JSON.stringify(await bellRows(page)));
    // CS2
    st.chatSeenCalls = [];
    await page.locator('[data-nav="chat"]').first().click();
    check('CS2 opening Chats clears the bell', await waitRows(page, 0), JSON.stringify(await bellRows(page)));
    check('CS2 the server hears the Chats tab was opened', st.chatSeenCalls.some((c) => c.p_other === null), JSON.stringify(st.chatSeenCalls));
    // CS3
    await page.waitForSelector('.chat-row-open', { timeout: 8000 });
    await page.locator('.chat-row-open', { hasText: 'Ravi' }).click();
    await page.waitForSelector('#chat-messages .message', { timeout: 8000 });
    await page.waitForTimeout(800);
    const call = st.chatSeenCalls.find((c) => c.p_other === RAVI);
    check('CS3 opening a chat sends how far it was read', Boolean(call) && Math.abs(Date.parse(call.p_at) - Date.parse(st.messages[2].created_at)) < 1000, JSON.stringify(st.chatSeenCalls));
    check('no page errors', errors.length === 0, errors.join('; '));
    await ctx.close();
  }
  // CS4 before 0064.
  delete st.chatSeen; st.chatSeenCalls = [];
  {
    const ctx = await stub.newContext(browser, { width: 390, height: 844 });
    const page = await stub.open(ctx, { path: '/app.html' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    check('CS4 before 0064 the bell still lists both senders', await waitRows(page, 2), JSON.stringify(await bellRows(page)));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(500);
    check('CS4 no page errors', errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('chat-seen: all checks passed');
