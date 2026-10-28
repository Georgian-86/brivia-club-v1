// Chat inbox (D-100, founder 2026-10-28): the list scrolls (the phone inbox as a page, the desktop rows from anywhere in
// the sidebar), conversations sort by last contact, and the Chat badge counts unread MESSAGES, not conversations.
// PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/chat-inbox.spec.mjs   (Vite on :5181)
import { startAppStub, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };

const rows = Array.from({ length: 10 }, (_, i) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-0000000001${String(i).padStart(2, '0')}`, name: `Person ${i}`, photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] }));
const minutesAgo = [5, 1, 9, 3, 7, 2, 8, 4, 6, 10];
// Person 1 has two unread messages; Person 4 last wrote to them (read: mine is the last message).
const messages = rows.flatMap((r, i) => {
  const at = (m) => new Date(Date.now() - m * 6e4).toISOString();
  const list = [{ id: `m${i}a`, sender_id: r.id, recipient_id: ME, body: `hi ${i}`, created_at: at(minutesAgo[i] + 0.5) }];
  if (i === 1) list.push({ id: 'm1b', sender_id: r.id, recipient_id: ME, body: 'again', created_at: at(minutesAgo[i]) });
  if (i === 4) list.push({ id: 'm4b', sender_id: ME, recipient_id: r.id, body: 'reply', created_at: at(minutesAgo[i]) });
  return list;
});
const st = { rows, matchIds: rows.map((r) => r.id), messages };
const stub = await startAppStub({ port: 5181, state: st, deckRows: rows });
const browser = await chromium.launch();
const expectedOrder = rows.map((r, i) => [r.name, minutesAgo[i]]).sort((a, b) => a[1] - b[1]).map(([n]) => n);
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await stub.newContext(browser, { width: w, height: h });
    // Everything since 2020 is unread for this member (a first run would start from "now").
    await ctx.addInitScript(([k]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ baseline: '2020-01-01T00:00:00.000Z', read: {} })); }, [`brivia-chat-read:${ME}`]);
    const page = await stub.open(ctx, { path: '/app.html?view=chat' });
    await page.waitForSelector('.chat-row .chat-row-copy strong', { timeout: 8000 });
    const order = await page.$$eval('.chat-row .chat-row-copy strong', (n) => n.map((x) => x.textContent));
    check(`${w}: newest contact first`, JSON.stringify(order) === JSON.stringify(expectedOrder), JSON.stringify(order));
    const badge = () => page.$$eval('[data-chat-badge]', (b) => b.filter((x) => !x.hidden).map((x) => x.textContent));
    check(`${w}: badge counts unread messages (10: two from one person, none from the one I answered), not conversations`, (await badge()).every((t) => t === '10') && (await badge()).length > 0, JSON.stringify(await badge()));
    const p1 = await page.locator('.chat-row', { hasText: 'Person 1' }).locator('.chat-row-meta b').textContent();
    check(`${w}: a row shows its own unread count`, p1 === '2', p1);
    check(`${w}: a conversation I answered last is not unread`, await page.locator('.chat-row', { hasText: 'Person 4' }).locator('.chat-row-meta b').count() === 0);

    // Scrolling: phones scroll the page, desktop scrolls the rows, also from a wheel over the search box.
    if (w < 700) {
      const before = await page.evaluate(() => document.scrollingElement.scrollTop);
      const box = await page.locator('.chat-row').first().boundingBox();
      await page.mouse.move(box.x + 40, box.y + 10); await page.mouse.wheel(0, 500); await page.waitForTimeout(400);
      const after = await page.evaluate(() => document.scrollingElement.scrollTop);
      check(`${w}: the inbox page scrolls`, after > before + 100, `${before} -> ${after}`);
      const lastRow = await page.locator('.chat-row').last().boundingBox();
      check(`${w}: the last row is reachable`, lastRow && lastRow.y + lastRow.height < h, JSON.stringify(lastRow));
    } else {
      const box = await page.locator('#chat-search').boundingBox();
      await page.mouse.move(box.x + 20, box.y + 5); await page.mouse.wheel(0, 300); await page.waitForTimeout(400);
      const top = await page.evaluate(() => document.querySelector('.chat-inbox-scroll').scrollTop);
      check(`${w}: a wheel over the search box scrolls the rows`, top > 0, String(top));
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.chat-row-open', { hasText: 'Person 1' }).click();
    await page.waitForTimeout(600);
    check(`${w}: opening a conversation clears its messages from the badge`, (await badge()).every((t) => t === '8'), JSON.stringify(await badge()));
    await page.reload();
    await page.waitForSelector('.chat-row .chat-row-copy strong', { timeout: 8000 });
    check(`${w}: read state survives a reload`, (await badge()).every((t) => t === '8') && (await badge()).length > 0, JSON.stringify(await badge()));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
