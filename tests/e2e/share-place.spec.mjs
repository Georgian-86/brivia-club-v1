// Share a place (D-231, founder 2026-11-10: "add option of sending some random location as well"), stubbed Supabase.
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/share-place.spec.mjs   (Vite on :5205)
// SP1 "+" offers "Share a place"; the box takes a place name and sends exactly "Place: <name>".
// SP2 raw coordinates and non-Google-Maps links are refused in the box with a plain reason; nothing is sent.
// SP3 a pasted Google Maps short link is sent as is.
// SP4 a received place shows as a "Shared place" card that opens Google Maps in a new tab (a search for a name, the
//     link itself for a link), >= 44 px, axe clean; the inbox previews it as "📍 <name>".
import { startAppStub, ME } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const UDAY = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000001801', name: 'Uday Kiran', photo_url: null, cover_url: null, experience: 'Engineer', skills: ['Chess'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: [] };
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const st = { rows: [UDAY], matchIds: [UDAY.id], routes: { 'rpc/get_candidates': { body: [UDAY] } } };
const stub = await startAppStub({ port: 5205, state: st, deckRows: [UDAY] });
const browser = await chromium.launch();
const sentBodies = () => (st.sent || []).map((x) => x.body);
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    st.messages = [
      { id: 'p1', sender_id: UDAY.id, recipient_id: ME, body: 'Place: https://maps.app.goo.gl/S1kkeNLURQM4qEeN9?g_st=ic', created_at: ago(9e5), message_type: 'text' },
      { id: 'p2', sender_id: UDAY.id, recipient_id: ME, body: 'Place: MTR, Lalbagh', created_at: ago(6e4), message_type: 'text' },
    ];
    st.sent = [];
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const page = await stub.open(ctx, { path: '/app.html?view=chat' });
    page.setDefaultTimeout(8000);
    await page.waitForSelector('.chat-row');
    check(`${w} SP4 the inbox previews the place as "📍 MTR, Lalbagh"`, (await page.textContent('.chat-row')).includes('📍 MTR, Lalbagh'));
    await page.locator('.chat-row .chat-row-copy > span').first().click();
    await page.waitForSelector('#chat-messages a.message-place');
    const cards = await page.$$eval('#chat-messages a.message-place', (els) => els.map((a) => ({ text: a.innerText.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'), target: a.target, rel: a.rel, h: Math.round(a.getBoundingClientRect().height) })));
    check(`${w} SP4 two place cards: a pinned link and a named place`, cards.length === 2
      && cards[0].href === 'https://maps.app.goo.gl/S1kkeNLURQM4qEeN9?g_st=ic' && /Pinned on Google Maps/.test(cards[0].text)
      && cards[1].href === 'https://www.google.com/maps/search/?api=1&query=MTR%2C%20Lalbagh' && /Shared place MTR, Lalbagh Open in Maps/i.test(cards[1].text)
      && cards.every((c) => c.target === '_blank' && /noopener/.test(c.rel) && c.h >= 44), JSON.stringify(cards));
    const axe = await axeViolations(page, { include: '#chat-messages .message-place' });
    check(`${w} SP4 axe clean on the cards`, axe.length === 0, axe.join(' | '));
    // SP1
    await page.locator('#chat-share-toggle').click();
    await page.locator('#chat-share-menu [data-share="place"]').click();
    await page.waitForSelector('dialog.share-place[open]');
    check(`${w} SP1 the box asks for a place name or link`, (await page.textContent('dialog.share-place')).includes('Place name or Google Maps link'));
    // SP2
    await page.fill('#share-place-input', '12.9716, 77.5946');
    await page.locator('dialog.share-place button[type="submit"]').click();
    check(`${w} SP2 coordinates are refused with a reason`, /instead of coordinates/.test(await page.textContent('#share-place-error')) && sentBodies().length === 0);
    await page.fill('#share-place-input', 'https://evil.example/maps');
    await page.locator('dialog.share-place button[type="submit"]').click();
    check(`${w} SP2 other links are refused`, /Only Google Maps links/.test(await page.textContent('#share-place-error')) && sentBodies().length === 0);
    const box = await page.evaluate(() => { const d = document.querySelector('dialog.share-place').getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth - innerWidth, inView: d.top >= 0 && d.bottom <= innerHeight + 1 }; });
    check(`${w} SP1 the box fits on screen`, box.overflow <= 0 && box.inView, JSON.stringify(box));
    await page.fill('#share-place-input', '  Rameshwaram Cafe,   Indiranagar ');
    await page.locator('dialog.share-place button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('dialog.share-place'));
    await page.waitForTimeout(400);
    check(`${w} SP1 exactly one message "Place: Rameshwaram Cafe, Indiranagar"`, JSON.stringify(sentBodies()) === JSON.stringify(['Place: Rameshwaram Cafe, Indiranagar']), JSON.stringify(sentBodies()));
    // SP3
    await page.locator('#chat-share-toggle').click();
    await page.locator('#chat-share-menu [data-share="place"]').click();
    await page.fill('#share-place-input', 'https://maps.app.goo.gl/AbCdEf123');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('dialog.share-place'));
    await page.waitForTimeout(400);
    check(`${w} SP3 a Google Maps link is sent as is`, sentBodies().at(-1) === 'Place: https://maps.app.goo.gl/AbCdEf123', JSON.stringify(sentBodies()));
    await ctx.close();
  }
} finally { await browser.close(); await stub.close(); }
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
