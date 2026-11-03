// Delivered, Read and last active (D-150, 0042), against stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/read-receipts.spec.mjs   (Vite on :5174)
// RR1 my messages carry one tick (Sent), two (Delivered) or two peach ticks (Read); only my newest says the word.
// RR2 opening a conversation with unread messages from them sends mark_conversation_read for that member; messages to
//     me that are not delivered yet send mark_messages_delivered.
// RR3 the header says "Active 12 min ago" (from connection_last_seen), "Active now" with the dot when active.
// RR4 before 0042 (PGRST202, no receipt columns): no ticks beyond Sent, no errors, and the old header line.
// RR_SHOTS=<dir> saves the open thread at 390 and 1440.
import { mkdirSync } from 'node:fs';
import { startAppStub, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000150';
const rows = [{ id: OTHER, name: 'Asha Rao', photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] }];
const at = (m) => new Date(Date.now() - m * 6e4).toISOString();
const messages = (receipts = true) => [
  { id: 'r1', sender_id: ME, recipient_id: OTHER, body: 'Hi Asha, loved your talk', created_at: at(30), ...(receipts ? { delivered_at: at(29), read_at: at(20) } : {}) },
  { id: 'r2', sender_id: OTHER, recipient_id: ME, body: 'Thank you! Coffee this week?', created_at: at(19), ...(receipts ? { delivered_at: at(19), read_at: null } : {}) },
  { id: 'r3', sender_id: ME, recipient_id: OTHER, body: 'Thursday works', created_at: at(5), ...(receipts ? { delivered_at: at(4), read_at: null } : {}) },
  { id: 'r4', sender_id: ME, recipient_id: OTHER, body: 'Near the station?', created_at: at(1), ...(receipts ? { delivered_at: null, read_at: null } : {}) },
  { id: 'r5', sender_id: OTHER, recipient_id: ME, body: 'One more thing', created_at: at(0.5), ...(receipts ? { delivered_at: null, read_at: null } : {}) },
];
const shots = process.env.RR_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const st = { rows, matchIds: [OTHER], messages: messages(true), lastSeen: { [OTHER]: at(12) } };
const stub = await startAppStub({ port: 5174, state: st, deckRows: rows });
const browser = await chromium.launch();
const openThread = async (w, h) => {
  const ctx = await stub.newContext(browser, { width: w, height: h });
  const page = await stub.open(ctx, { path: '/app.html?view=chat' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.chat-row-open', { timeout: 8000 });
  await page.locator('.chat-row-open', { hasText: 'Asha' }).click();
  await page.waitForSelector('#chat-messages .message', { timeout: 8000 });
  await page.waitForTimeout(1500);
  return { ctx, page, errors };
};
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    st.receiptCalls = [];
    const { ctx, page, errors } = await openThread(w, h);
    const ticks = await page.$$eval('#chat-messages .message.me', (els) => els.map((el) => ({
      state: el.querySelector('.message-receipt')?.getAttribute('aria-label') || '',
      paths: el.querySelectorAll('.message-receipt path').length,
      word: el.querySelector('.message-receipt-word')?.textContent || '',
    })));
    check(`${w} RR1 ticks: read, delivered, sent`, JSON.stringify(ticks.map((t) => t.state)) === '["Read","Delivered","Sent"]', JSON.stringify(ticks));
    check(`${w} RR1 one tick for sent, two otherwise`, ticks.map((t) => t.paths).join() === '2,2,1', JSON.stringify(ticks));
    check(`${w} RR1 no word on a Sent newest message`, ticks.every((t) => t.word === ''), JSON.stringify(ticks));
    check(`${w} RR1 their messages carry no ticks`, await page.locator('#chat-messages .message.them .message-receipt').count() === 0);
    const readColor = await page.$eval('#chat-messages .message-receipt.is-read', (el) => getComputedStyle(el).color);
    check(`${w} RR1 read ticks are the warm peach`, readColor === 'rgb(255, 176, 122)', readColor);
    const fns = st.receiptCalls.map((c) => c.fn);
    check(`${w} RR2 read receipt sent for Asha`, st.receiptCalls.some((c) => c.fn === 'mark_conversation_read' && c.args.p_other === OTHER), JSON.stringify(fns));
    check(`${w} RR2 delivered receipt sent`, fns.includes('mark_messages_delivered'), JSON.stringify(fns));
    const status = await page.textContent('#chat-status');
    check(`${w} RR3 header says when they were last here`, /^Active 1[12] min ago$/.test(status), status);
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    if (shots) await page.screenshot({ path: `${shots}/receipts-${w}.png` });
    await ctx.close();
  }
  // The newest own message gets the word once the server marks it.
  st.messages = messages(true).slice(0, 3);
  st.activeIds = [OTHER];
  {
    const { ctx, page } = await openThread(1440, 900);
    check('RR1 the newest delivered message says Delivered', (await page.locator('#chat-messages .message.me').last().locator('.message-receipt-word').textContent()) === 'Delivered');
    const status = await page.textContent('#chat-status');
    const dot = await page.$eval('#chat-status', (el) => getComputedStyle(el, '::before').content);
    check('RR3 Active now with the dot', status === 'Active now' && dot !== 'none', `${status} ${dot}`);
    if (shots) await page.screenshot({ path: `${shots}/receipts-active-1440.png` });
    await ctx.close();
  }
  // RR4 before 0042.
  st.noReceipts = true; st.activeIds = []; st.messages = messages(false); st.receiptCalls = [];
  {
    const { ctx, page, errors } = await openThread(1440, 900);
    const states = await page.$$eval('#chat-messages .message.me .message-receipt', (els) => els.map((el) => el.getAttribute('aria-label')));
    check('RR4 every message of mine shows Sent only', states.length === 3 && states.every((s) => s === 'Sent'), JSON.stringify(states));
    check('RR4 header keeps the old line', (await page.textContent('#chat-status')) === 'MEMBER / PRIVATE THREAD', await page.textContent('#chat-status'));
    check('RR4 no page errors', errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
