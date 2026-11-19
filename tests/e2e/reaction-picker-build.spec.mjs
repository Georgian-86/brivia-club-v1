// The "+" emoji card in the PRODUCTION build (founder 2026-11-19: "after clicking on +, i cant see other emojis").
// The build puts emoji-field.css in a shared file that loads after the app's own CSS; its `.emoji-field-panel
// { position: relative }` used to win, so the card opened at the bottom of the page, out of sight. The dev server
// loads CSS in import order, which is why message-reactions.spec.mjs never saw it. Stubbed Supabase.
//   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/reaction-picker-build.spec.mjs   (vite preview on :5167)
//   RP_DIST=<dir> serves a build you already made; otherwise one is built into a temporary folder.
// RP1 at 1440x900 and 390x844: right-click (or long-press) a message, press "+": the card is fixed, on screen, and lists emoji.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startAppStub, ME, ORIGIN } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
let dist = process.env.RP_DIST || '';
const own = !dist;
if (own) {
  dist = mkdtempSync(path.join(tmpdir(), 'brivia-rp-'));
  execFileSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], { stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: ORIGIN, VITE_SUPABASE_ANON_KEY: 'stub-anon-key' } });
}
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000291';
const rows = [{ id: OTHER, name: 'Tanu Verma', photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] }];
const at = (m) => new Date(Date.now() - m * 6e4).toISOString();
const MSG = '0e290000-0000-4000-8000-000000000001';
const st = { rows, matchIds: [OTHER], lastSeen: {}, routes: { 'rpc/message_reactions_for': { body: [] } },
  messages: [{ id: MSG, sender_id: OTHER, recipient_id: ME, body: 'So much of unnecessary pressure', created_at: at(3), delivered_at: at(3), read_at: at(2), edited_at: null, unsent_at: null }] };
const stub = await startAppStub({ port: Number(process.env.E2E_PORT || 5167), state: st, deckRows: rows, previewDir: dist });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const [w, h, phone] of [[1440, 900, false], [390, 844, true]]) {
    const ctx = await stub.newContext(browser, { width: w, height: h }, phone ? { hasTouch: true, isMobile: true } : {});
    const page = await stub.open(ctx, { path: '/app.html?view=chat' });
    await page.waitForSelector('.chat-row-open', { timeout: 15000 });
    await page.locator('.chat-row-open', { hasText: 'Tanu' }).click();
    const bubble = page.locator(`#chat-messages .message[data-message-id="${MSG}"]`);
    await bubble.waitFor({ timeout: 10000 });
    await page.waitForTimeout(600);
    if (phone) {
      const box = await bubble.boundingBox();
      const x = box.x + box.width / 2; const y = box.y + 12;
      await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true })), { x, y });
      await page.waitForTimeout(650);
      await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y })), { x, y });
    } else await bubble.click({ button: 'right' });
    await page.locator('.message-menu [data-message-react-more]').click({ timeout: 5000 });
    await page.waitForSelector('.reaction-picker', { timeout: 5000 });
    const s = await page.$eval('.reaction-picker', (el) => { const r = el.getBoundingClientRect(); return { pos: getComputedStyle(el).position, top: r.top, bottom: r.bottom, left: r.left, right: r.right, emoji: el.querySelectorAll('.emoji-field-emoji').length }; });
    const tag = `${w}x${h}`;
    check(`RP1 ${tag} the card is fixed beside the message (${s.pos})`, s.pos === 'fixed');
    check(`RP1 ${tag} the card is on screen (${Math.round(s.top)}..${Math.round(s.bottom)} of ${h})`, s.top >= 0 && s.bottom <= h && s.left >= 0 && s.right <= w);
    check(`RP1 ${tag} it lists emoji (${s.emoji})`, s.emoji > 20);
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
  if (own) rmSync(dist, { recursive: true, force: true });
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('reaction-picker-build: ALL PASSED');
