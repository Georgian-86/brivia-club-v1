// Chat smoothness (D-267, founder 2026-11-17: "make the chat section ... faster non laggy and smoother"): 30
// conversations, one with 300 messages, on a phone-sized page with the CPU slowed 4x. Opens the long thread, then
// sits 20 s idle (the message sync keeps running) and types a message. Prints: time to open the thread, how often the
// thread and the inbox were rebuilt while nothing changed, long tasks (> 50 ms) and frames over 32 ms.
// PLAYWRIGHT_MODULE=... node tests/e2e/perf-chat.mjs        (PERF_DIST=<production build> to measure dist/)
import { startAppStub, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const rows = Array.from({ length: 30 }, (_, i) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-0000000002${String(i).padStart(2, '0')}`, name: `Person ${i}`, photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] }));
const at = (m) => new Date(Date.now() - m * 6e4).toISOString();
const messages = [
  ...rows.map((r, i) => ({ id: `p${i}`, sender_id: r.id, recipient_id: ME, body: `hello from ${i}`, created_at: at(400 + i) })),
  ...Array.from({ length: 300 }, (_, k) => {
    const mine = k % 3 === 0;
    return { id: `t${k}`, sender_id: mine ? ME : rows[0].id, recipient_id: mine ? rows[0].id : ME, body: `message ${k} with a few words, a link https://example.com/${k} and an emoji 🙂`, created_at: at(300 - k), read_at: mine ? null : at(1) };
  }),
];
const stub = await startAppStub({ port: 5186, state: { rows, matchIds: rows.map((r) => r.id), messages }, deckRows: rows, previewDir: process.env.PERF_DIST || '' });
const browser = await chromium.launch();
try {
  const ctx = await stub.newContext(browser, { width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await stub.open(ctx, { path: '/app.html?view=chat' });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForSelector('.chat-row-open', { timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    window.__p = { long: [], frames: [], thread: 0, inbox: 0 };
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__p.long.push(Math.round(e.duration)))).observe({ type: 'longtask' });
    let last = performance.now();
    const tick = (t) => { window.__p.frames.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const count = (sel, key) => { const el = document.querySelector(sel); if (el) new MutationObserver((recs) => { if (recs.some((r) => r.addedNodes.length > 5)) window.__p[key] += 1; }).observe(el, { childList: true }); };
    count('#chat-messages', 'thread');
    count('.chat-inbox-scroll', 'inbox');
  });
  const t0 = Date.now();
  await page.locator('.chat-row-open', { hasText: 'Person 0' }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('#chat-messages .message').length >= 300, null, { timeout: 20000 });
  const openMs = Date.now() - t0;
  const opened = await page.evaluate(() => { const p = window.__p; const r = { thread: p.thread, inbox: p.inbox, long: p.long.length }; p.long = []; p.frames = []; p.thread = 0; p.inbox = 0; return r; });
  await page.waitForTimeout(20000);
  const idle = await page.evaluate(() => { const p = window.__p; const f = p.frames.slice(1); const r = { threadRebuilds: p.thread, inboxRebuilds: p.inbox, long: p.long.length, longMs: p.long.reduce((s, x) => s + x, 0), slowFrames: f.filter((x) => x > 32).length, frames: f.length }; p.long = []; p.frames = []; return r; });
  const box = page.locator('#chat-input, #chat-form textarea, #chat-form input[type="text"]').first();
  const t1 = Date.now();
  await box.pressSequentially('typing a quick reply to see how it feels', { delay: 30 });
  const typeMs = Date.now() - t1;
  const typing = await page.evaluate(() => { const p = window.__p; const f = p.frames.slice(1); return { long: p.long.length, longMs: p.long.reduce((s, x) => s + x, 0), slowFrames: f.filter((x) => x > 32).length, frames: f.length }; });
  console.log(JSON.stringify({ openMs, opened, idle20s: idle, typeMs, typing }, null, 1));
} finally { await browser.close(); await stub.close(); }
