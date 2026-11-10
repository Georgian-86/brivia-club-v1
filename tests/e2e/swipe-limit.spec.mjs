// The swipe limit, said in the request dialog (D-225, founder 2026-11-10: "display the message that free swipes over,
// fresh swipes tomm clearly on screen when the user tries to send requests").
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/swipe-limit.spec.mjs   (Vite on :5194)
// SL1 Companions: Send request refused at the daily cap: the dialog stays open and says "You're out of free swipes"
//     and "Fresh swipes tomorrow at <time>"; the writing parts step aside; Got it closes it and sends nothing more.
// SL2 Companions at a cap the app already knows: Connect opens straight on the limit; nothing is sent.
// SL3 A profile's Connect (here from Chat search) at a known cap opens the sheet on the limit; nothing is sent. (The
//     Connect deck itself already turns into "That's your deck for today" at the daily cap, D-179.)
// SL4 Connect deck, Send request refused by the server: the sheet stays on the limit; the note comes back on the next
//     try once swipes are free again.
// SL5 phones (375, 390), the profile Connect route: the limit is on screen in full, Got it is >= 44 px, no sideways scroll.
// SL_SHOTS=<dir> saves the limit at 1440 and 390.
import { mkdirSync } from 'node:fs';
import { startAppStub, PHOTO } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const shots = process.env.SL_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
// Fresh swipes tomorrow at 3 PM, local time (the label is built the same way as in the app).
const tomorrow3pm = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(15, 0, 0, 0); return d.toISOString(); };
const timeLabel = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric' });
const day = (n, h) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(h - 5, 30, 0, 0); return d.toISOString(); };
const cid = (n) => `cccccccc-cccc-4ccc-8ccc-0000000017${String(n).padStart(2, '0')}`;
const person = (n, name) => ({ member_id: cid(n), name, photo_url: PHOTO(cid(n)), cover_url: null, headline: 'Product & AI', looking_for: ['Friends'],
  interests: ['Chess'], shared_interests: ['Chess'], distance_band: '~3 km', shared_count: 1 });
const EVENTS = () => [{ event_id: 'e-chess', title: 'Blitz Chess Meetup', starts_at: day(2, 10), ends_at: day(2, 13), venue_name: 'Battle Chess Skool', venue_area: 'Whitefield, Bengaluru' }];
const DECKS = () => ({ 'e-chess': [person(1, 'Lakshya Bhardwaj'), person(2, 'Aanya')] });
const CAP = { status: 429, code: 'PT429', message: 'signal_quota_exhausted' };
const st = { events: [], companionEvents: EVENTS(), companionDecks: DECKS(), likedMe: [], companionMatches: [], passed: new Set(), signalled: new Set(), remaining: 5, resetsAt: tomorrow3pm(), dailyLimit: 10, routes: {} };
const stub = await startAppStub({ port: 5194, state: st });
const browser = await chromium.launch();
const requests = () => st.calls.filter((c) => /rpc\/(send_signal|send_connect_request|nearby_connect)/.test(c.path) && c.method === 'POST').length;
const reset = (extra = {}) => {
  Object.assign(st, { companionEvents: EVENTS(), companionDecks: DECKS(), likedMe: [], companionMatches: [], swipes: [], matchIds: [], connectRequests: [], passed: new Set(), signalled: new Set(), remaining: 5, resetsAt: tomorrow3pm(), dailyLimit: 10, routes: {}, ...extra });
  st.calls.length = 0;
};
const limitState = (page, root) => page.evaluate((sel) => {
  const box = document.querySelector(`${sel} .composer-limit`);
  const visible = (el) => Boolean(el) && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const ok = box?.querySelector('.composer-limit-ok')?.getBoundingClientRect();
  const r = box?.getBoundingClientRect();
  return {
    shown: visible(box),
    title: box?.querySelector('.composer-limit-title')?.textContent || '',
    body: box?.querySelector('.composer-limit-body')?.textContent || '',
    textarea: visible(document.querySelector(`${sel} textarea`)),
    send: visible(document.querySelector(`${sel} :is(.composer-send, .pitch-submit)`)),
    inView: r ? r.top >= 0 && r.bottom <= window.innerHeight + 1 : false,
    okHeight: ok?.height || 0,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    role: box?.getAttribute('role'),
  };
}, root);
// The deck deals its first card in (D-164) and may shuffle first (D-174): wait until the stack is at rest.
const deckReady = async (page) => {
  await page.waitForFunction(() => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim()
    && !document.querySelector('#swipe-stack')?.classList.contains('is-intro'), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
};
const fresh = `Fresh swipes tomorrow at ${timeLabel(tomorrow3pm())}.`;
const STRANGER = { member_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000001799', name: 'Lakshya Bhardwaj', photo_url: null, job_title: null, company_name: null, logo_path: null, bio_preview: null, status: 'none', has_conversation: false, last_message_at: null };
const openStrangerConnect = async (page) => {
  await page.waitForSelector('#chat-search');
  await page.waitForTimeout(800);   // the quota is read at load
  await page.fill('#chat-search', 'lak');
  await page.waitForTimeout(700);
  await page.locator('[data-person-open]', { hasText: 'Lakshya' }).click();
  await page.waitForSelector('#public-profile-modal [data-public-profile-connect]');
  await page.locator('#public-profile-modal [data-public-profile-connect]').click();
  await page.waitForSelector('#pitch-modal:not([hidden]) #pitch-limit:not([hidden])');
  await page.waitForTimeout(200);
};

try {
  for (const [w, h] of [[1440, 1000], [390, 844]]) {
    // SL1
    reset({ routes: { 'rpc/send_connect_request': CAP } });
    let ctx = await stub.newContext(browser, { width: w, height: h });
    let page = await stub.open(ctx, { path: '/app.html?view=companions&event=e-chess' });
    page.setDefaultTimeout(8000);
    await page.waitForSelector('.companion-card.is-current');
    await page.waitForTimeout(300);
    await page.locator('#companion-like').click();
    await page.waitForSelector('#connect-composer-dialog[open]');
    await page.locator('#connect-composer-dialog .composer-send').click();
    await page.waitForSelector('#connect-composer-dialog .composer-limit:not([hidden])');
    let s = await limitState(page, '#connect-composer-dialog');
    check(`${w} SL1 the dialog stays and says the swipes are over`, s.shown && s.title === "You're out of free swipes" && s.role === 'alert', JSON.stringify(s));
    check(`${w} SL1 it says when: "${fresh}"`, s.body.includes("You've used all 10 of today's free swipes, so this request wasn't sent.") && s.body.endsWith(fresh), s.body);
    check(`${w} SL1 the writing parts step aside`, !s.textarea && !s.send, JSON.stringify(s));
    if (shots) await page.screenshot({ path: `${shots}/companions-limit-${w}.png` });
    const sentBefore = requests();
    await page.locator('#connect-composer-dialog .composer-limit-ok').click();
    await page.waitForFunction(() => !document.querySelector('#connect-composer-dialog').open);
    check(`${w} SL1 Got it closes and sends nothing more`, requests() === sentBefore);
    await ctx.close();

    // SL2
    reset({ remaining: 0 });
    ctx = await stub.newContext(browser, { width: w, height: h });
    page = await stub.open(ctx, { path: '/app.html?view=companions&event=e-chess' });
    page.setDefaultTimeout(8000);
    await page.waitForSelector('.companion-card.is-current');
    await page.waitForTimeout(800);   // the quota is read at load
    await page.locator('#companion-like').click();
    await page.waitForSelector('#connect-composer-dialog[open]');
    await page.waitForTimeout(200);
    s = await limitState(page, '#connect-composer-dialog');
    check(`${w} SL2 a known cap opens straight on the limit`, s.shown && s.title === "You're out of free swipes" && s.body.endsWith(fresh) && !s.textarea, JSON.stringify(s));
    check(`${w} SL2 nothing was sent`, requests() === 0);
    await ctx.close();

    // SL3 (the Connect deck itself shows "That's your deck for today" at the daily cap, D-179; the route that used to
    // reach the sheet at a cap is a profile's Connect, here from Chat search).
    reset({ remaining: 0, peopleSearch: [STRANGER] });
    ctx = await stub.newContext(browser, { width: w, height: h });
    page = await stub.open(ctx, { path: '/app.html?view=chat' });
    page.setDefaultTimeout(8000);
    await openStrangerConnect(page);
    s = await limitState(page, '#pitch-modal');
    check(`${w} SL3 Connect on a profile at a cap shows the limit in the sheet`, s.shown && s.title === "You're out of free swipes" && s.body.endsWith(fresh) && !s.textarea && !s.send, JSON.stringify(s));
    if (shots) await page.screenshot({ path: `${shots}/profile-connect-limit-${w}.png` });
    await page.waitForTimeout(300);
    await page.locator('#pitch-limit .composer-limit-ok').click();
    await page.waitForFunction(() => document.querySelector('#pitch-modal')?.hidden);
    await page.waitForTimeout(300);
    check(`${w} SL3 Got it closes it and nothing is sent`, requests() === 0);
    await ctx.close();

    // SL4
    reset({ routes: { 'rpc/send_signal': CAP } });
    ctx = await stub.newContext(browser, { width: w, height: h });
    page = await stub.open(ctx);
    page.setDefaultTimeout(8000);
    await deckReady(page);
    await page.locator('[data-action="like"]').dispatchEvent('click');   // as deck.spec does (the card overlaps the button in a short viewport)
    await page.waitForSelector('#pitch-modal:not([hidden])');
    await page.waitForTimeout(400);
    await page.fill('#pitch-message', 'Saw you play blitz, fancy a game?');
    await page.locator('#pitch-modal .pitch-submit').click();
    await page.waitForSelector('#pitch-limit:not([hidden])');
    s = await limitState(page, '#pitch-modal');
    check(`${w} SL4 a refused send keeps the sheet on the limit`, s.shown && s.title === "You're out of free swipes" && s.body.endsWith(fresh), JSON.stringify(s));
    await page.waitForTimeout(300);
    await page.locator('#pitch-limit .composer-limit-ok').click();
    await page.waitForFunction(() => document.querySelector('#pitch-modal')?.hidden);
    // Swipes are free again: the next try opens the sheet with the note kept.
    st.routes = {};
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(400);
    await page.locator('[data-action="like"]').dispatchEvent('click');   // as deck.spec does (the card overlaps the button in a short viewport)
    await page.waitForSelector('#pitch-modal:not([hidden])');
    await page.waitForTimeout(300);
    check(`${w} SL4 the note comes back on the next try`, (await page.inputValue('#pitch-message')) === 'Saw you play blitz, fancy a game?' && !(await limitState(page, '#pitch-modal')).shown);
    await ctx.close();
  }
  // SL5
  for (const [w, h] of [[375, 667], [390, 844]]) {
    reset({ remaining: 0, peopleSearch: [STRANGER] });
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const page = await stub.open(ctx, { path: '/app.html?view=chat' });
    page.setDefaultTimeout(8000);
    await openStrangerConnect(page);
    await page.waitForTimeout(300);
    const s = await limitState(page, '#pitch-modal');
    check(`${w} SL5 the limit is on screen in full, Got it >= 44 px, no sideways scroll`, s.inView && s.okHeight >= 44 && s.overflow <= 0, JSON.stringify(s));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
