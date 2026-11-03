// Chat search finds people, not only threads (D-152, 0044), against stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/chat-search.spec.mjs   (Vite on :5176)
// CS1 a connection with no visible thread (removed from this device's inbox) is found by a partial name, with a
//     Message button; Message opens their chat at once (no request), clears the search and brings the thread back.
// CS2 statuses: Wants to connect, Request sent, Not connected; a person with a conversation is listed once, under
//     Conversations.
// CS3 a person's row opens their profile: Message for a connection, Connect for anyone else, "Request sent" said plainly.
// CS4 no match: one empty state; a server error: "Try again", which searches again.
// CS5 before 0044 the device's own connections are still found.
// CS6 phones (320, 375, 390, 430) and a tablet (768): no sideways scroll, the search fits, buttons >= 44 px.
// CS_SHOTS=<dir> saves the results and the profile at 390 and 1440.
import { mkdirSync } from 'node:fs';
import { startAppStub, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const id = (n) => `aaaaaaaa-aaaa-4aaa-8aaa-0000000015${String(n).padStart(2, '0')}`;
const card = (n, name, extra = {}) => ({ id: id(n), name, photo_url: null, cover_url: null, experience: 'Member', skills: ['Chess'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: [], ...extra });
const YASHIKA = card(1, 'Yashika Rao'); const MEERA = card(2, 'Meera Iyer'); const YASH = card(3, 'Yash Thakkar'); const YASMIN = card(4, 'Yasmin Khan'); const YASHWANT = card(5, 'Yashwant');
const rows = [YASHIKA, MEERA, YASH, YASMIN, YASHWANT];
const result = (c, status, extra = {}) => ({ member_id: c.id, name: c.name, photo_url: null, job_title: null, company_name: null, logo_path: null, bio_preview: null, status, has_conversation: false, last_message_at: null, ...extra });
const peopleSearch = [
  result(YASHIKA, 'connected', { job_title: 'Architect', company_name: 'Studio Nine', bio_preview: 'Builds quiet houses by the sea.' }),
  result(MEERA, 'connected', { has_conversation: true, last_message_at: new Date().toISOString() }),
  result(YASMIN, 'request_received'), result(YASH, 'request_sent'), result(YASHWANT, 'none'),
];
const messages = [{ id: 'm1', sender_id: MEERA.id, recipient_id: ME, body: 'See you at the café', created_at: new Date(Date.now() - 6e4).toISOString() }];
const shots = process.env.CS_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
const st = { rows: [MEERA], matchIds: [YASHIKA.id, MEERA.id], messages, peopleSearch, routes: { 'rpc/get_candidates': { body: rows } } };
const stub = await startAppStub({ port: 5176, state: st, deckRows: [MEERA] });
const browser = await chromium.launch();
const open = async (w, h) => {
  const ctx = await stub.newContext(browser, { width: w, height: h });
  // The bug that started this: Yashika's thread was removed from this device's inbox, so search said "No threads found".
  await ctx.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [`brivia-hidden-chats:${ME}`, JSON.stringify([YASHIKA.id])]);
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
    const { ctx, page, errors } = await open(w, h);
    check(`${w} the hidden thread is not in the inbox`, !(await names(page, '.chat-row')).includes('Yashika Rao'));
    await search(page, 'yas');
    const people = await page.$$eval('.chat-person-row', (els) => els.map((e) => ({ name: e.querySelector('strong')?.textContent, status: e.querySelector('.chat-person-status')?.textContent || '', message: Boolean(e.querySelector('[data-person-message]')), sub: e.querySelector('.chat-row-copy span')?.textContent })));
    check(`${w} CS1 Yashika is found by "yas" with Message`, people[0]?.name === 'Yashika Rao' && people[0].message && people[0].sub === 'Architect at Studio Nine', JSON.stringify(people));
    check(`${w} CS2 statuses`, JSON.stringify(people.slice(1).map((p) => p.status)) === JSON.stringify(['Wants to connect', 'Request sent', 'Not connected']), JSON.stringify(people));
    check(`${w} CS4 no empty state when people are found`, await page.locator('.inbox-empty').count() === 0);
    if (shots) await page.screenshot({ path: `${shots}/search-${w}.png` });
    // CS3
    await page.locator('[data-person-open]', { hasText: 'Yashwant' }).click();
    await page.waitForSelector('#public-profile-modal');
    check(`${w} CS3 a stranger's profile offers Connect`, (await page.textContent('#public-profile-modal footer')).includes('Connect with Yashwant'));
    if (shots) await page.screenshot({ path: `${shots}/profile-none-${w}.png` });
    await page.keyboard.press('Escape');
    await page.locator('[data-person-open]', { hasText: 'Yash Thakkar' }).click();
    check(`${w} CS3 a sent request is said plainly`, (await page.textContent('#public-profile-modal footer')).includes('Request sent'));
    await page.keyboard.press('Escape');
    await page.locator('[data-person-open]', { hasText: 'Yashika' }).click();
    check(`${w} CS3 a connection's profile offers Message`, await page.locator('#public-profile-modal [data-public-profile-message]').isVisible());
    if (shots) await page.screenshot({ path: `${shots}/profile-connected-${w}.png` });
    const requestsBefore = st.calls.filter((c) => /send_signal|send_connect_request/.test(c.path)).length;
    await page.locator('#public-profile-modal [data-public-profile-message]').click();
    await page.waitForSelector('#chat-window:not([hidden])');
    await page.waitForTimeout(400);
    check(`${w} CS1 Message opens her chat`, (await page.textContent('#chat-name')) === 'Yashika Rao');
    check(`${w} CS1 no request is sent`, st.calls.filter((c) => /send_signal|send_connect_request/.test(c.path)).length === requestsBefore);
    check(`${w} CS1 the search is cleared`, (await page.inputValue('#chat-search')) === '');
    if (w > 700) check(`${w} CS1 her thread is back in the inbox`, (await names(page, '.chat-row')).includes('Yashika Rao'));
    if (w <= 700) { await page.locator('#chat-back').click(); await page.waitForTimeout(300); }
    // CS2: Meera has a conversation: once, under Conversations.
    await search(page, 'meera');
    const convos = await names(page, '.chat-search-section[aria-label="Conversations"] .chat-row');
    check(`${w} CS2 Meera under Conversations only`, convos.includes('Meera Iyer') && !(await names(page, '.chat-person-row')).includes('Meera Iyer'), JSON.stringify(convos));
    // CS4
    await search(page, 'zzzz');
    check(`${w} CS4 one empty state`, (await page.locator('.inbox-empty').count()) === 1 && (await page.textContent('.inbox-empty')).includes('No one found'));
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
  // CS4 error and retry.
  st.peopleSearchError = true;
  {
    const { ctx, page } = await open(1440, 900);
    await search(page, 'yash');
    check('CS4 an error says so, with Try again', await page.locator('[data-chat-search-retry]').isVisible());
    st.peopleSearchError = false;
    await page.locator('[data-chat-search-retry]').click();
    await page.waitForTimeout(600);
    check('CS4 Try again searches again', await page.locator('.chat-person-row').count() > 0);
    await ctx.close();
  }
  // CS5 before 0044.
  st.noPeopleSearch = true;
  {
    const { ctx, page } = await open(1440, 900);
    await search(page, 'yas');
    check('CS5 a known connection is still found', (await names(page, '.chat-person-row')).includes('Yashika Rao'), JSON.stringify(await names(page, '.chat-person-row')));
    await ctx.close();
  }
  st.noPeopleSearch = false;
  // CS6 layout on phones and a tablet.
  for (const [w, h] of [[320, 640], [375, 667], [390, 844], [430, 932], [768, 1024]]) {
    const { ctx, page } = await open(w, h);
    await search(page, 'yas');
    const m = await page.evaluate(() => {
      const input = document.querySelector('#chat-search').getBoundingClientRect();
      const small = [...document.querySelectorAll('.chat-person-message, .chat-person-open, #chat-search')].filter((el) => el.getClientRects().length)
        .map((el) => el.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length;
      return { overflow: document.documentElement.scrollWidth - window.innerWidth, inputRight: input.right, vw: window.innerWidth, small };
    });
    check(`${w} CS6 no sideways scroll, search fits, targets >= 44 px`, m.overflow <= 0 && m.inputRight <= m.vw && m.small === 0, JSON.stringify(m));
    await page.locator('[data-person-message]').first().click();
    await page.waitForSelector('#chat-window:not([hidden])');
    await page.waitForTimeout(300);
    const c = await page.evaluate(() => {
      const form = document.querySelector('#chat-form').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - window.innerWidth, composerBottom: form.bottom, vh: window.innerHeight, composerVisible: form.height > 0 };
    });
    check(`${w} CS6 the open chat fits and its composer is on screen`, c.overflow <= 0 && c.composerVisible && c.composerBottom <= c.vh + 1, JSON.stringify(c));
    if (shots && w === 390) await page.screenshot({ path: `${shots}/chat-390.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
