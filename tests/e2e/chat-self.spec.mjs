// Message yourself (D-224, 0068), against stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/chat-self.spec.mjs   (Vite on :5193)
// MY1 searching your own name (and "you", "me", "myself") lists "Alex Me (You) · Message yourself" first under People,
//     with Message; another member's search still works beside it.
// MY2 Message opens your own thread at once: header "Alex Me (You)", "Message yourself"; the ••• menu keeps only
//     Delete chat.
// MY3 sending stores a message from you to you (sender = recipient = you).
// MY4 with a note in the inbox: the thread is listed as "Alex Me (You)" with its preview, never unread, no
//     notification mentions it, no read ticks; searching your name finds it under Conversations (not twice).
// MY5 your own row never reaches the deck or the People list from the server, and the avatar opens your Profile.
// MY6 at 390 px the self row fits (no sideways scroll, targets >= 44 px).
// MY_SHOTS=<dir> saves the search and the thread at 390 and 1440.
import { mkdirSync } from 'node:fs';
import { startAppStub, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const id = (n) => `aaaaaaaa-aaaa-4aaa-8aaa-0000000016${String(n).padStart(2, '0')}`;
const card = (n, name) => ({ id: id(n), name, photo_url: null, cover_url: null, experience: 'Member', skills: ['Chess'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: [] });
const MEERA = card(1, 'Meera Iyer'); const ALEXA = card(2, 'Alexa Roy');
const result = (c, status) => ({ member_id: c.id, name: c.name, photo_url: null, job_title: null, company_name: null, logo_path: null, bio_preview: null, status, has_conversation: false, last_message_at: null });
const shots = process.env.MY_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const meeraMsg = { id: 'm1', sender_id: MEERA.id, recipient_id: ME, body: 'See you at the café', created_at: ago(6e5) };
const note = { id: 'n1', sender_id: ME, recipient_id: ME, body: 'Book the badminton court', created_at: ago(6e4), delivered_at: ago(5e4), read_at: ago(4e4) };
const st = { rows: [MEERA, ALEXA], matchIds: [MEERA.id], messages: [meeraMsg], peopleSearch: [result(ALEXA, 'none')], routes: { 'rpc/get_candidates': { body: [MEERA, ALEXA] } } };
const stub = await startAppStub({ port: 5193, state: st, deckRows: [ALEXA] });
const browser = await chromium.launch();
const open = async (w, h) => {
  const ctx = await stub.newContext(browser, { width: w, height: h });
  const page = await stub.open(ctx, { path: '/app.html?view=chat' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('#chat-search', { timeout: 8000 });
  await page.waitForSelector('.chat-row', { timeout: 8000 });
  return { ctx, page, errors };
};
const search = async (page, q) => { await page.fill('#chat-search', q); await page.waitForTimeout(600); };
const names = (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.querySelector('strong')?.textContent.trim()));
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    st.messages = [meeraMsg];
    st.sent = [];
    const { ctx, page, errors } = await open(w, h);
    check(`${w} no self thread before the first note`, !(await names(page, '.chat-row')).some((n) => /\(You\)/.test(n || '')));
    // MY1
    for (const q of ['alex', 'Alex Me', 'me', 'you', 'myself']) {
      await search(page, q);
      const people = await names(page, '.chat-person-row');
      const self = page.locator('.chat-person-row.is-self');
      check(`${w} MY1 "${q}" lists you first`, people[0] === 'Alex Me (You)' && (await self.count()) === 1 && (await self.textContent()).includes('Message yourself'), JSON.stringify(people));
    }
    await search(page, 'alex');
    check(`${w} MY1 another member is still found beside you`, (await names(page, '.chat-person-row')).includes('Alexa Roy'));
    check(`${w} MY5 the server list never repeats you`, (await page.locator(`.chat-person-row[data-person-id="${ME}"]`).count()) === 1);
    await search(page, 'meera');
    check(`${w} MY1 a search for someone else has no self row`, (await page.locator('.chat-person-row.is-self').count()) === 0);
    if (shots) { await search(page, 'alex'); await page.screenshot({ path: `${shots}/self-search-${w}.png` }); }
    // MY2
    await search(page, 'alex');
    await page.locator('[data-self-message]').click();
    await page.waitForSelector('#chat-window:not([hidden])');
    await page.waitForTimeout(400);
    check(`${w} MY2 header names you`, (await page.textContent('#chat-name')) === 'Alex Me (You)');
    check(`${w} MY2 status says Message yourself`, (await page.textContent('#chat-status')) === 'Message yourself');
    check(`${w} MY2 the search is cleared`, (await page.inputValue('#chat-search')) === '');
    const menu = await page.$$eval('#chat-more-menu [data-chat-action]', (els) => els.filter((b) => !b.hidden).map((b) => b.dataset.chatAction));
    check(`${w} MY2 the menu keeps only Delete chat`, JSON.stringify(menu) === '["delete"]', JSON.stringify(menu));
    // MY3
    await page.fill('#chat-input', 'Book the badminton court');
    await page.locator('#chat-form button[type="submit"]').click();
    await page.waitForTimeout(600);
    const sent = (st.sent || []).at(-1) || {};
    check(`${w} MY3 the note is sent from you to you`, sent.sender_id === ME && sent.recipient_id === ME && sent.body === 'Book the badminton court', JSON.stringify(sent));
    if (shots) await page.screenshot({ path: `${shots}/self-thread-${w}.png` });
    // MY5: your profile, not a public card.
    await page.locator('#chat-avatar').click();
    await page.waitForTimeout(400);
    check(`${w} MY5 the avatar opens your Profile tab`, (await page.locator('#public-profile-modal').count()) === 0 && (await page.evaluate(() => document.body.dataset.appView)) === 'profile');
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
  // MY4 with a note already stored.
  st.messages = [meeraMsg, note];
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const { ctx, page, errors } = await open(w, h);
    await page.waitForTimeout(500);
    const row = page.locator('.chat-row.is-self');
    check(`${w} MY4 the self thread is in the inbox, newest first`, (await names(page, '.chat-row'))[0] === 'Alex Me (You)' && (await row.textContent()).includes('Book the badminton court'), JSON.stringify(await names(page, '.chat-row')));
    check(`${w} MY4 never unread`, !(await row.getAttribute('class')).includes('is-unread') && (await row.locator('.chat-row-meta b').count()) === 0);
    const noteNotified = await page.evaluate(() => [...document.querySelectorAll('#notification-list *')].some((el) => /badminton court/.test(el.textContent || '')));
    check(`${w} MY4 no notification mentions the note`, !noteNotified);
    check(`${w} MY4 the initials avatar is "AM", never "A("`, (await row.locator('.mini-avatar').textContent()).trim() === 'AM');
    await search(page, 'alex');
    check(`${w} MY4 your name finds the thread under Conversations, once`, (await names(page, '.chat-search-section[aria-label="Conversations"] .chat-row')).includes('Alex Me (You)') && (await page.locator('.chat-person-row.is-self').count()) === 0);
    await search(page, '');
    await row.locator('.chat-row-copy > span').first().click();   // the name is a profile link, like every row's
    await page.waitForSelector('#chat-window:not([hidden])');
    await page.waitForTimeout(500);
    check(`${w} MY4 no read ticks on your notes`, (await page.locator('#chat-messages .message-receipt, #chat-messages .message-receipt-word').count()) === 0);
    const deckHasMe = await page.evaluate((me) => [...document.querySelectorAll('[data-person-id], [data-card-id]')].some((el) => (el.dataset.cardId === me) && !el.closest('#chat-list')), ME);
    check(`${w} MY5 you are never a deck card`, !deckHasMe);
    if (w === 390) {
      await page.locator('#chat-back').click();
      await page.waitForTimeout(300);
      await search(page, 'myself');
      const m = await page.evaluate(() => {
        const r = [...document.querySelectorAll('.chat-row.is-self .chat-row-open, .chat-person-row.is-self button')].map((el) => el.getBoundingClientRect());
        return { overflow: document.documentElement.scrollWidth - window.innerWidth, small: r.filter((x) => x.height < 44).length, n: r.length };
      });
      check('390 MY6 the self row fits, targets >= 44 px', m.overflow <= 0 && m.small === 0 && m.n > 0, JSON.stringify(m));
    }
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
