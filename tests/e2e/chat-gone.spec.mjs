// D-273: a chat with someone no longer connected (founder 2026-11-19: "why am i not able to send the text in this chat").
// The server refuses a message unless the pair is matched; the composer used to stay and the refusal was a short toast.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/chat-gone.spec.mjs   (Vite on :5166)
// CG1 a connected member's chat: the composer, no notice.
// CG2 a removed connection's chat (messages, no match): no composer; one line says why; "Send a request" opens the pitch sheet.
import { startAppStub, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const LINKED = 'aaaaaaaa-aaaa-4aaa-8aaa-000000002731';
const GONE = 'aaaaaaaa-aaaa-4aaa-8aaa-000000002732';
const card = (id, name) => ({ id, name, photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] });
const rows = [card(LINKED, 'Meera Iyer'), card(GONE, 'Aryan Sharma')];
const at = (m) => new Date(Date.now() - m * 6e4).toISOString();
const msg = (n, from, to, body, m) => ({ id: `0e273000-0000-4000-8000-00000000000${n}`, sender_id: from, recipient_id: to, body, created_at: at(m), delivered_at: at(m), read_at: at(m), edited_at: null, unsent_at: null });
const st = { rows, matchIds: [LINKED], lastSeen: {}, messages: [msg(1, LINKED, ME, 'Coffee?', 30), msg(2, GONE, ME, 'why would not i know', 20), msg(3, ME, GONE, 'Bengaluru', 25)] };
const stub = await startAppStub({ port: Number(process.env.E2E_PORT || 5166), state: st, deckRows: rows });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await stub.newContext(browser, { width: w, height: h }, w < 600 ? { hasTouch: true, isMobile: true } : {});
    const page = await stub.open(ctx, { path: '/app.html?view=chat', errors });
    const tag = `${w}`;
    await page.waitForSelector('.chat-row-open', { timeout: 12000 });
    await page.locator('.chat-row-open', { hasText: 'Meera' }).click();
    await page.waitForTimeout(800);
    let s = await page.evaluate(() => ({ form: !document.querySelector('#chat-form')?.hidden, gone: !!document.querySelector('#chat-gone:not([hidden])') }));
    check(`CG1 ${tag} connected: the composer shows, no notice`, s.form && !s.gone, JSON.stringify(s));
    if (w < 600) await page.locator('#chat-back').click(); 
    await page.locator('.chat-row-open', { hasText: 'Aryan' }).click();
    await page.waitForTimeout(800);
    s = await page.evaluate(() => {
      const note = document.querySelector('#chat-gone:not([hidden])');
      const r = note?.getBoundingClientRect();
      return { form: !document.querySelector('#chat-form')?.hidden && getComputedStyle(document.querySelector('#chat-form')).display !== 'none', text: note?.textContent || '', inView: r ? r.bottom <= innerHeight && r.top >= 0 : false, thread: document.querySelectorAll('#chat-messages .message').length };
    });
    check(`CG2 ${tag} removed: no composer`, !s.form, JSON.stringify(s));
    check(`CG2 ${tag} one line says why (${s.text.slice(0, 60)})`, /no longer connected with Aryan/.test(s.text));
    check(`CG2 ${tag} the notice is on screen and the conversation stays`, s.inView && s.thread === 2, JSON.stringify(s));
    await page.locator('[data-chat-gone-request]').click();
    await page.waitForTimeout(500);
    check(`CG2 ${tag} "Send a request" opens the pitch sheet`, await page.evaluate(() => !document.querySelector('#pitch-modal')?.hidden));
    await ctx.close();
  }
  check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  await stub.close();
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('chat-gone: ALL PASSED');
