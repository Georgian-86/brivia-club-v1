// D-224: "You · Message yourself" (founder: "make it possible to text ourselves as well"). Against the app stub:
// * the thread is pinned first in Chats ("Alex Me (You)"), and not counted as a conversation;
// * searching your own name ("ale"), "you" or "notes" finds it; another name does not;
// * it opens with your name, "Only you can see this", no Remove/Block/Report menu and no ticks;
// * a note is sent with sender = recipient = you and shows in the thread and as the row's preview;
// * another conversation still has its menu afterwards.
// PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/chat-self.spec.mjs   (Vite on :5183)
import { startAppStub, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };

const friend = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000301', name: 'Priya Friend', photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] };
const st = {
  rows: [friend], matchIds: [friend.id], echoSends: true,
  messages: [
    { id: 'f1', sender_id: friend.id, recipient_id: ME, body: 'hello there', created_at: new Date(Date.now() - 6e4).toISOString() },
    { id: 's0', sender_id: ME, recipient_id: ME, body: 'old note', created_at: new Date(Date.now() - 9e6).toISOString(), delivered_at: new Date().toISOString(), read_at: new Date().toISOString() },
  ],
};
const stub = await startAppStub({ port: 5183, state: st, deckRows: [friend] });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const page = await stub.open(ctx, { path: '/app.html?view=chat' });
    await page.waitForSelector('.chat-row .chat-row-copy strong', { timeout: 8000 });
    const names = await page.$$eval('.chat-row .chat-row-copy strong', (n) => n.map((x) => x.textContent.trim()));
    check(`${w}: "Alex Me (You)" is pinned first, then the conversation`, names[0] === 'Alex Me (You)' && names[1]?.startsWith('Priya Friend'), JSON.stringify(names));
    const preview = await page.locator('.chat-row.is-self .chat-row-copy span').first().textContent();
    const lastNote = st.messages.filter((m) => m.sender_id === ME && m.recipient_id === ME).sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1).body;
    check(`${w}: its preview is the last note ("${lastNote}")`, preview === lastNote, preview);
    if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/self-list-${w}.png` });
    const count = await page.textContent('#chat-count');
    check(`${w}: not counted as a conversation`, /01 CONVERSATIONS/.test(count), count);

    for (const [q, want] of [['ale', true], ['you', true], ['notes', true], ['priya', false]]) {
      await page.fill('#chat-search', q);
      await page.waitForTimeout(500);
      const found = await page.locator('.chat-row.is-self').count();
      check(`${w}: searching "${q}" ${want ? 'finds' : 'does not show'} your own thread`, (found > 0) === want, String(found));
    }
    await page.fill('#chat-search', '');
    await page.waitForTimeout(400);

    await page.locator('.chat-row.is-self .chat-row-open').click();
    await page.waitForTimeout(600);
    const head = await page.evaluate(() => ({
      name: document.querySelector('#chat-name')?.textContent, status: document.querySelector('#chat-status')?.textContent,
      more: document.querySelector('#chat-more')?.hidden && getComputedStyle(document.querySelector('#chat-more')).display === 'none', ticks: document.querySelectorAll('#chat-messages .message-receipt, #chat-messages .message-receipt-word, #chat-messages [class*="receipt"]').length,
    }));
    check(`${w}: the thread opens as yours ("Only you can see this"), with no menu and no ticks`, head.name === 'Alex Me (You)' && head.status === 'Only you can see this' && head.more === true && head.ticks === 0, JSON.stringify(head));

    const sentBefore = (st.sent || []).length;
    await page.fill('#chat-input', `note from ${w}`);
    await page.keyboard.press('Enter');
    await page.waitForFunction((t) => [...document.querySelectorAll('#chat-messages .message')].some((m) => m.textContent.includes(t)), `note from ${w}`, { timeout: 6000 }).catch(() => {});
    const sent = (st.sent || []).slice(sentBefore).map((r) => [].concat(r)[0]);
    check(`${w}: a note is sent to yourself (sender = recipient = you)`, sent.length === 1 && sent[0].sender_id === ME && sent[0].recipient_id === ME && sent[0].body === `note from ${w}`, JSON.stringify(sent));
    const shown = await page.locator('#chat-messages .message', { hasText: `note from ${w}` }).count();
    check(`${w}: the note shows in the thread`, shown === 1, String(shown));
    if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/self-thread-${w}.png` });

    if (w < 700) { await page.locator('#chat-back, .chat-back').first().click().catch(() => {}); await page.waitForTimeout(400); }
    await page.locator('.chat-row-open', { hasText: 'Priya Friend' }).click();
    await page.waitForTimeout(500);
    const other = await page.evaluate(() => ({ more: document.querySelector('#chat-more')?.hidden || getComputedStyle(document.querySelector('#chat-more')).display === 'none', name: document.querySelector('#chat-name')?.textContent }));
    check(`${w}: another conversation still has its menu`, other.more === false && other.name === 'Priya Friend', JSON.stringify(other));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
