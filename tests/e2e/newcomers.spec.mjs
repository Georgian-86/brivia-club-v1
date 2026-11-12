// Newcomers in the deck (D-241, 0073), stubbed Supabase.
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/newcomers.spec.mjs   (Vite on :5266)
// NC1 newcomer_cards is asked once the deck is ready, excluding the deck's own ids.
// NC2 the newcomer comes after four deck cards (not first), with "New to Brivia" where the distance goes.
// NC3 a request to them goes through like any other (send_connect_request with their id); no page errors.
// NC4 an empty deck still shows the newcomers (they are not dropped when the location-first deck has no one).
import { startAppStub } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const mk = (i, extra = {}) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-0000000027${String(i).padStart(2, '0')}`, name: `Deck ${i}`, photo_url: null, cover_url: null, experience: 'Member', skills: ['Chess'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: [], ...extra });
const deckRows = Array.from({ length: 6 }, (_, i) => mk(i + 1));
const NEW = mk(90, { name: 'Nisha New', skills: [], looking_for: [], distance_band: 'New to Brivia' });
const st = { rows: deckRows, remaining: 30, routes: { 'rpc/newcomer_cards': { body: [NEW] } } };
const stub = await startAppStub({ port: 5266, state: st, deckRows });
const browser = await chromium.launch();
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    st.passed = new Set(); st.signalled = new Set(); st.rows = deckRows;
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const asks = []; const sends = [];
    ctx.on('request', (r) => {
      if (r.url().includes('/rpc/newcomer_cards')) asks.push(r.postDataJSON());
      if (/\/rpc\/(send_connect_request|send_signal)/.test(r.url())) sends.push(r.postDataJSON());
    });
    const page = await stub.open(ctx, { path: '/app.html?view=home' });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (/newcomer/i.test(m.text())) console.log('CONSOLE', m.text()); });
    await page.waitForFunction(() => document.querySelector('#swipe-name')?.textContent.trim());
    await page.waitForTimeout(4500);
    check(`${w} NC1 newcomer_cards asked once the deck is ready, excluding deck ids`, asks.length >= 1 && (asks[0].p_exclude || []).includes(deckRows[0].id), JSON.stringify(asks[0]));
    const seen = [];
    for (let k = 0; k < 5; k += 1) {
      seen.push((await page.textContent('#swipe-name')).trim());
      if (k < 4) { await page.locator('[data-action="pass"]').dispatchEvent('click'); await page.waitForTimeout(700); }
    }
    check(`${w} NC2 the newcomer comes after four deck cards`, seen[4] === 'Nisha New' && !seen.slice(0, 4).includes('Nisha New'), JSON.stringify(seen));
    const band = (await page.textContent('#swipe-location'))?.trim() || '';
    check(`${w} NC2 "New to Brivia" on the card`, /New to Brivia/.test(band), band);
    await page.locator('[data-action="like"]').dispatchEvent('click');
    await page.waitForSelector('#pitch-modal:not([hidden])');
    await page.waitForTimeout(400);
    await page.locator('#pitch-modal .pitch-no-note').click();
    await page.waitForTimeout(800);
    check(`${w} NC3 the request goes to the newcomer`, sends.some((b) => b.p_to === NEW.id), JSON.stringify(sends));
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
  // NC4
  st.rows = []; st.emptyDeck = true;
  const ctx = await stub.newContext(browser, { width: 390, height: 844 });
  const page = await stub.open(ctx, { path: '/app.html?view=home' });
  await page.waitForFunction(() => document.querySelector('#swipe-name')?.textContent.trim() === 'Nisha New', null, { timeout: 10000 }).catch(() => {});
  check('NC4 an empty deck still shows the newcomer', (await page.textContent('#swipe-name'))?.trim() === 'Nisha New', await page.textContent('#swipe-name'));
  await ctx.close();
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
