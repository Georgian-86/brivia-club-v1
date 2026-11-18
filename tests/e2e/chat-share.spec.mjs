// Links and sharing in chat (D-255, founder 2026-11-14: "allow sending links as links in the chat and allow sending post
// or events from respective sections directly and clearly"). Stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/chat-share.spec.mjs   (Vite on :5289)
// CS1 a plain link in a message is a real link (new tab, no opener); the words around it stay text.
// CS2 a Brivia post link with words around it shows the post card, then the words (a member pasted one like this).
// CS3 a shared event shows an event card (title, when / where, View event); View event opens it in Events.
// CS4 from an event's share menu, "Send in chat" opens "Send this event": a message is optional; Send sends one chat
//     message with the event link and the note, and the button says Sent.
// CS5 from a note, Share opens "Send this post" with the same sheet. axe clean on the sheet; no page errors.
import { startAppStub, ME, ORIGIN } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const FRIEND = 'aaaaaaaa-aaaa-4aaa-8aaa-000000002551';
const POST = '8ebd0bdc-0086-4a37-8531-f5e8eeb85caf';
const IMG = '/Images/Cover%20images/94978B9F-A399-43FC-AC48-0A41088B5D27.PNG';
const at = (m) => new Date(Date.now() - m * 6e4).toISOString();
const day = (n, h) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const msg = (n, from, body, mins) => ({ id: `0e255000-0000-4000-8000-00000000000${n}`, sender_id: from, recipient_id: from === ME ? FRIEND : ME, body, created_at: at(mins), delivered_at: at(mins), read_at: null, edited_at: null, unsent_at: null });
const rows = [{ id: FRIEND, name: 'Tanishq Verma', photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] }];
const event = { id: 'e-jam', title: 'Acoustic Jam Session', description: 'Good people.', category: 'music', tags: ['Music'], venue_name: 'The Whitefield Social', venue_area: 'Whitefield, Bengaluru', starts_at: day(2, 13), ends_at: day(2, 16), image_key: '', distance_km: 1, going_count: 3, companion_count: 1, going: false, wants_companion: false, friends: [] };
const st = { rows, matchIds: [FRIEND], lastSeen: {}, events: [event], companions: [], companionDefault: false,
  posts: [{ id: POST, author_id: FRIEND, image_url: IMG, image_path: '', caption: 'Career, chess, looks', created_at: at(90) }],
  messages: [
    msg(1, FRIEND, 'Read this https://example.com/article?x=1. Then tell me', 30),
    msg(2, FRIEND, `https://thebriviaclub.com/explore.html?post=${POST}          Career, chess, looks, dressing… koi area 😭`, 20),
    msg(3, ME, 'Shared an event with you on Brivia Club: https://thebriviaclub.com/app.html?view=events&event=e-jam', 10),
  ] };
const stub = await startAppStub({ port: 5289, state: st, deckRows: rows });
const browser = await chromium.launch();
const openChat = async (page) => {
  await page.waitForSelector('.chat-row-open', { timeout: 8000 });
  await page.locator('.chat-row', { hasText: 'Tanishq' }).locator('.chat-row-meta').click();
  await page.waitForSelector('#chat-messages .message[data-message-id]');
  await page.waitForTimeout(1200);
};
const bubble = (page, n) => page.locator(`#chat-messages .message[data-message-id="0e255000-0000-4000-8000-00000000000${n}"]`);
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await stub.newContext(browser, { width: w, height: h }, w < 500 ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: '/app.html?view=chat' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openChat(page);
    const link = await bubble(page, 1).locator('a.message-link').evaluate((a) => ({ href: a.href, target: a.target, rel: a.rel, text: a.textContent, after: a.nextSibling?.textContent }));
    check(`${w} CS1 a plain link is a link (new tab, no opener), the full stop stays text`, link.href === 'https://example.com/article?x=1' && link.target === '_blank' && /noopener/.test(link.rel) && link.after.startsWith('. Then'), JSON.stringify(link));
    const post = await bubble(page, 2).evaluate((b) => ({ card: Boolean(b.querySelector('.message-post [data-shared-post-open]')), words: b.querySelector(':scope > .message-copy')?.textContent || '' }));
    check(`${w} CS2 a pasted post link with words shows the post card and the words`, post.card && /Career, chess, looks, dressing/.test(post.words) && !/explore\.html/.test(post.words), JSON.stringify(post));
    const ev = await bubble(page, 3).evaluate((b) => ({ title: b.querySelector('.message-event-title')?.textContent, meta: b.querySelector('.message-event-meta')?.textContent, open: Boolean(b.querySelector('[data-shared-event-open]')) }));
    check(`${w} CS3 a shared event shows its card (title, when / where, View event)`, ev.title === 'Acoustic Jam Session' && /Whitefield/.test(ev.meta || '') && ev.open, JSON.stringify(ev));
    if (process.env.CS_SHOTS) await page.screenshot({ path: `${process.env.CS_SHOTS}/chat-${w}.png` });
    await bubble(page, 3).locator('[data-shared-event-open]').click();
    await page.waitForSelector('#event-detail:not([hidden])', { timeout: 6000 }).catch(() => {});
    check(`${w} CS3 View event opens the event in Events`, await page.evaluate(() => document.body.dataset.appView === 'events' && /Acoustic Jam Session/.test(document.querySelector('#event-detail')?.innerText || '')));
    // CS4
    await page.locator('#event-detail [data-event-share]').click();
    await page.locator('[data-event-share-chat]').click();
    await page.waitForSelector('#post-share[open]');
    check(`${w} CS4 Send in chat opens "Send this event"`, (await page.locator('#post-share-title').textContent()) === 'Send this event');
    const axe = await axeViolations(page, { include: '#post-share' });
    check(`${w} CS4 axe on the sheet`, axe.length === 0, JSON.stringify(axe));
    if (process.env.CS_SHOTS) await page.screenshot({ path: `${process.env.CS_SHOTS}/send-event-${w}.png` });
    await page.fill('#post-share [data-share-note]', 'Coming along?');
    const before = st.calls.length;
    await page.locator(`#post-share [data-share-to="${FRIEND}"]`).click();
    await page.waitForTimeout(600);
    const sent = st.calls.slice(before).filter((c) => c.method === 'POST' && c.path === '/rest/v1/brivia_messages').map((c) => JSON.parse(c.body || '{}').body);
    check(`${w} CS4 one message with the event link and the note; the button says Sent`, sent.length === 1 && /app\.html\?view=events&event=e-jam/.test(sent[0]) && /Coming along\?$/.test(sent[0]) && (await page.locator(`#post-share [data-share-to="${FRIEND}"]`).textContent()) === 'Sent', JSON.stringify(sent));
    await page.keyboard.press('Escape');
    // CS5
    await page.evaluate(() => document.querySelector('[data-nav="posts"]')?.click());
    await page.waitForSelector(`.post-card[data-post-id="${POST}"]`, { timeout: 8000 });
    await page.locator(`.post-card[data-post-id="${POST}"] [data-post-action="share"]`).click();
    await page.waitForSelector('#post-share[open]');
    check(`${w} CS5 Share on a note opens "Send this post" with a message field`, (await page.locator('#post-share-title').textContent()) === 'Send this post' && await page.locator('#post-share [data-share-note]').count() === 1);
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('chat-share: ALL PASSED');
