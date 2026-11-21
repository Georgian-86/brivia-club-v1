// D-277: the floating jump-to-latest button in an open chat. Stubbed Supabase, no Realtime: the 5 s sync delivers.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/chat-jump.spec.mjs   (Vite on :5167)
// CJ1 at the latest message there is no button. CJ2 scrolled up, it appears above the composer.
// CJ3 a message arriving while scrolled up shows a count. CJ4 a tap goes to the latest message and the button goes.
// CJ5 the same on a phone (375 px).
import { startAppStub, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const FRIEND = 'aaaaaaaa-aaaa-4aaa-8aaa-000000002771';
const rows = [{ id: FRIEND, name: 'Mira Kapoor', photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] }];
const hex = (n) => n.toString(16).padStart(12, '0');
const msg = (n, mine, minsAgo) => ({ id: `0e277000-0000-4000-8000-${hex(n)}`, sender_id: mine ? ME : FRIEND, recipient_id: mine ? FRIEND : ME, body: `Message number ${n}, a line long enough to take some room in the thread.`, created_at: new Date(Date.now() - minsAgo * 6e4).toISOString(), delivered_at: null, read_at: null, edited_at: null, unsent_at: null });
const st = { rows, matchIds: [FRIEND], lastSeen: {}, messages: Array.from({ length: 40 }, (_, i) => msg(i + 1, i % 3 === 0, 120 - i)) };
const stub = await startAppStub({ port: Number(process.env.E2E_PORT || 5167), state: st, deckRows: rows });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const look = (page) => page.evaluate(() => {
  const b = document.querySelector('.chat-jump'); const t = document.querySelector('#chat-messages'); const f = document.querySelector('#chat-form');
  const r = b && !b.hidden ? b.getBoundingClientRect() : null; const tr = t.getBoundingClientRect(); const fr = f?.getBoundingClientRect();
  return { shown: Boolean(r), count: b?.querySelector('.chat-jump-count:not([hidden])')?.textContent || '', dist: t.scrollHeight - t.scrollTop - t.clientHeight,
    inside: r ? r.left > tr.left + tr.width / 2 && r.right <= tr.right + 1 && r.bottom <= tr.bottom + 1 && r.top >= tr.top && (!fr || r.bottom <= fr.top + 1) : null };
});
let n = 40;
const run = async (label, viewport, shot) => {
  const errors = [];
  const ctx = await stub.newContext(browser, viewport);
  const page = await stub.open(ctx, { path: '/app.html?view=chat', errors });
  await page.waitForSelector('.chat-row-open', { timeout: 10000 });
  await page.locator('.chat-row', { hasText: 'Mira' }).first().click();
  await page.waitForFunction(() => document.querySelector('#chat-messages')?.textContent.includes('Message number 40'), null, { timeout: 12000 });
  await page.waitForTimeout(800);
  let s = await look(page);
  check(`${label} CJ1 at the latest message there is no button`, !s.shown && s.dist < 80, JSON.stringify(s));
  await page.evaluate(() => { const t = document.querySelector('#chat-messages'); t.scrollTop = 0; });
  await page.waitForTimeout(400);
  s = await look(page);
  check(`${label} CJ2 scrolled up, the button shows on the thread above the composer`, s.shown && s.inside, JSON.stringify(s));
  n += 1; st.messages.push(msg(n, false, 0));
  await page.waitForFunction(() => document.querySelector('.chat-jump-count:not([hidden])'), null, { timeout: 12000 }).catch(() => {});
  s = await look(page);
  check(`${label} CJ3 a message that arrives while scrolled up shows a count of 1`, s.count === '1', JSON.stringify(s));
  if (shot) await page.screenshot({ path: shot });
  await page.locator('.chat-jump').click();
  await page.waitForTimeout(1200);
  s = await look(page);
  check(`${label} CJ4 one tap goes to the latest message and the button goes`, !s.shown && s.dist < 80, JSON.stringify(s));
  check(`${label} no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
};
try {
  await run('desktop', { width: 1440, height: 900 }, process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/chat-jump-desktop.png` : '');
  await run('phone CJ5', { width: 375, height: 812 }, process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/chat-jump-phone.png` : '');
} finally {
  await browser.close();
  await stub.close();
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('chat-jump: ALL PASSED');
