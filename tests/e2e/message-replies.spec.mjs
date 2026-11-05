// Replies (D-191, 0055), against stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/message-replies.spec.mjs   (Vite on :5176)
// MR1 Reply from the long-press menu on their message shows "Replying to Asha" with the line above the composer; the
//     bubble is marked; Escape (in the composer) lets go and the bar hides.
// MR2 Reply again, type and send: one insert carrying reply_to_id = their message; the bar hides afterwards.
// MR3 a thread with replies shows the quote (who + line) on top of the reply, mine and theirs; a reply to a message
//     deleted for me quotes "Original message unavailable"; tapping a quote scrolls to the original and makes it glow.
// MR4 before 0055 (the column is missing): the thread still loads and Reply sends a plain message.
// MR_SHOTS=<dir> saves the bar and the quotes (phone and desktop).
import { mkdirSync } from 'node:fs';
import { startAppStub, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000191';
const id = (n) => `0e550000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const rows = [{ id: OTHER, name: 'Asha Rao', photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] }];
const at = (m) => new Date(Date.now() - m * 6e4).toISOString();
const base = () => [
  { id: id(1), sender_id: OTHER, recipient_id: ME, body: 'Have you been to Manali?', created_at: at(30), reply_to_id: null },
  { id: id(2), sender_id: ME, recipient_id: OTHER, body: 'I love mountains', created_at: at(20), reply_to_id: null },
];
const shots = process.env.MR_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const st = { rows, matchIds: [OTHER], messages: base(), lastSeen: {} };
const stub = await startAppStub({ port: 5176, state: st, deckRows: rows });
const browser = await chromium.launch();
const openThread = async (viewport, extra = {}) => {
  const ctx = await stub.newContext(browser, viewport, extra);
  const page = await stub.open(ctx, { path: '/app.html?view=chat' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.chat-row-open', { timeout: 8000 });
  await page.locator('.chat-row-open', { hasText: 'Asha' }).click();
  await page.waitForSelector('#chat-messages .message[data-message-id]', { timeout: 8000 });
  await page.waitForTimeout(700);
  return { ctx, page, errors };
};
const bubble = (page, n) => page.locator(`#chat-messages .message[data-message-id="${id(n)}"]`);
const openMenu = async (page, n) => { await bubble(page, n).click({ button: 'right' }); await page.waitForSelector('.message-menu [role="menuitem"]'); };
const choose = (page, label) => page.locator('.message-menu [role="menuitem"]', { hasText: label }).click();

try {
  // MR1 + MR2 (phone)
  {
    st.messages = base(); st.sent = [];
    const { ctx, page, errors } = await openThread({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    await openMenu(page, 1);
    await choose(page, 'Reply');
    await page.waitForTimeout(200);
    const bar = await page.evaluate(() => { const b = document.querySelector('#chat-reply-bar'); return b && { shown: !b.hidden, who: b.querySelector('#chat-reply-who')?.textContent, line: b.querySelector('#chat-reply-preview')?.textContent, focus: document.activeElement?.id }; });
    check('MR1 Reply shows "Replying to Asha" with her line, the composer focused', bar?.shown && bar.who === 'Replying to Asha' && bar.line === 'Have you been to Manali?' && bar.focus === 'chat-input', JSON.stringify(bar));
    check('MR1 the bubble being answered is marked', await bubble(page, 1).evaluate((el) => el.classList.contains('is-replying-to')));
    if (shots) await page.screenshot({ path: `${shots}/reply-bar-390.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    check('MR1 Escape lets go: the bar hides, nothing marked, the chat stays open', await page.evaluate(() => document.querySelector('#chat-reply-bar')?.hidden === true && !document.querySelector('.message.is-replying-to') && !document.querySelector('#chat-window')?.hidden));
    await openMenu(page, 1);
    await choose(page, 'Reply');
    await page.fill('#chat-input', 'Yes! Loved it, really superb');
    await page.locator('#chat-form button[type="submit"], .chat-send-button').first().click();
    await page.waitForTimeout(700);
    const sent = (st.sent || []).map((s) => (typeof s === 'string' ? JSON.parse(s) : s)).flat();
    check('MR2 one insert, carrying reply_to_id = her message', sent.length === 1 && sent[0].reply_to_id === id(1) && sent[0].body === 'Yes! Loved it, really superb', JSON.stringify(sent));
    check('MR2 the bar hides after sending', await page.evaluate(() => document.querySelector('#chat-reply-bar')?.hidden !== false));
    check('MR2 no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // MR3 (phone and desktop)
  for (const [tag, vp, extra] of [['390', { width: 390, height: 844 }, { isMobile: true, hasTouch: true }], ['1440', { width: 1440, height: 900 }, {}]]) {
    st.messages = [...base(),
      { id: id(3), sender_id: ME, recipient_id: OTHER, body: 'Yes! Loved it, really superb', created_at: at(10), reply_to_id: id(1) },
      { id: id(4), sender_id: OTHER, recipient_id: ME, body: 'Same here', created_at: at(5), reply_to_id: id(2) },
      { id: id(5), sender_id: OTHER, recipient_id: ME, body: 'About that other thing', created_at: at(2), reply_to_id: id(99) },
      ...Array.from({ length: 14 }, (_, k) => ({ id: id(20 + k), sender_id: k % 2 ? ME : OTHER, recipient_id: k % 2 ? OTHER : ME, body: `Filler line ${k}`, created_at: at(1.5 - k * 0.05), reply_to_id: null }))];
    const { ctx, page, errors } = await openThread(vp, extra);
    const q = (n) => bubble(page, n).evaluate((el) => { const b = el.querySelector('.message-reply-quote'); return b && { who: b.querySelector('strong')?.textContent || '', line: b.querySelector('span')?.textContent, first: el.firstElementChild === b, missing: b.classList.contains('is-missing') }; });
    const mine = await q(3); const theirs = await q(4); const gone = await q(5);
    check(`MR3 ${tag} my reply quotes Asha's line, on top of the bubble`, mine?.who === 'Asha' && mine.line === 'Have you been to Manali?' && mine.first, JSON.stringify(mine));
    check(`MR3 ${tag} her reply quotes "You"`, theirs?.who === 'You' && theirs.line === 'I love mountains', JSON.stringify(theirs));
    check(`MR3 ${tag} a reply to a message I no longer hold quotes "Original message unavailable"`, gone?.missing && gone.line === 'Original message unavailable', JSON.stringify(gone));
    await page.locator('#chat-messages').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(200);
    await bubble(page, 3).locator('.message-reply-quote').scrollIntoViewIfNeeded();
    await bubble(page, 3).locator('.message-reply-quote').click();
    await page.waitForTimeout(700);
    const target = await bubble(page, 1).evaluate((el) => { const r = el.getBoundingClientRect(); const box = document.querySelector('#chat-messages').getBoundingClientRect(); return { glow: el.classList.contains('is-reply-target'), inView: r.top >= box.top - 2 && r.bottom <= box.bottom + 2 }; });
    check(`MR3 ${tag} tapping the quote brings the original into view and makes it glow`, target.glow && target.inView, JSON.stringify(target));
    check(`MR3 ${tag} the tap did not open the message menu`, await page.locator('.message-menu').count() === 0);
    if (shots) await page.screenshot({ path: `${shots}/reply-quotes-${tag}.png` });
    check(`MR3 ${tag} no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // MR4: before 0055
  {
    st.messages = base().map(({ reply_to_id, ...m }) => m); st.sent = [];
    const ctx = await stub.newContext(browser, { width: 1440, height: 900 }, {});
    await ctx.route('**/rest/v1/brivia_messages*', async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'GET' && /reply_to_id/.test(decodeURIComponent(url))) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '42703', message: 'column brivia_messages.reply_to_id does not exist' }) });
      if (route.request().method() === 'POST' && /reply_to_id/.test(route.request().postData() || '')) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST204', message: "Could not find the 'reply_to_id' column of 'brivia_messages' in the schema cache" }) });
      return route.fallback();
    });
    const page = await stub.open(ctx, { path: '/app.html?view=chat' });
    await page.waitForSelector('.chat-row-open', { timeout: 8000 });
    await page.locator('.chat-row-open', { hasText: 'Asha' }).click();
    await page.waitForSelector('#chat-messages .message[data-message-id]', { timeout: 8000 });
    check('MR4 before 0055 the thread loads', await bubble(page, 1).count() === 1);
    await openMenu(page, 1);
    await choose(page, 'Reply');
    await page.fill('#chat-input', 'Plain reply');
    await page.locator('#chat-form button[type="submit"], .chat-send-button').first().click();
    await page.waitForTimeout(700);
    const sent = (st.sent || []).map((s) => (typeof s === 'string' ? JSON.parse(s) : s)).flat();
    check('MR4 before 0055 Reply sends a plain message', sent.length === 1 && sent[0].body === 'Plain reply' && !('reply_to_id' in sent[0]), JSON.stringify(sent));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
