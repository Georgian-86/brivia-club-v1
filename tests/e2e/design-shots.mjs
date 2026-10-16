// Design review screenshots (2026-10-16 card + chat restyle): the deck card and an open chat thread at phone and
// desktop widths, stubbed Supabase. Not a spec. SHOTS=<dir> (default .superpowers/shots).
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/design-shots.mjs
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { startAppStub, ME } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.SHOTS || '.superpowers/shots';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
mkdirSync(SHOTS, { recursive: true });
const st = { matchIds: [A], messages: [
  { id: 'm1', sender_id: ME, recipient_id: A, body: 'Hey Asha, I noticed we both care about data structures & algorithms. Would love to connect and exchange ideas.', created_at: new Date(Date.now() - 9e5).toISOString() },
  { id: 'm2', sender_id: A, recipient_id: ME, body: 'Shall we play on Saturday?', created_at: new Date(Date.now() - 6e5).toISOString() },
] };
const stub = await startAppStub({ port: 5191, state: st });
const browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });
try {
  for (const [tag, viewport] of [['390', { width: 390, height: 844 }], ['1440', { width: 1440, height: 900 }], ['1024', { width: 1024, height: 768 }]]) {
    const extra = viewport.width <= 780 ? { isMobile: true, hasTouch: true } : {};
    const ctx = await stub.newContext(browser, viewport, { reducedMotion: 'reduce', ...extra });
    let page = await stub.open(ctx, { path: '/app.html?view=explore' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, `home-${tag}.png`) });
    await page.locator('#open-discovery-filters').click().catch(() => {});
    await page.waitForTimeout(500);
    await page.locator('#filter-skills-input').click().catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, `filters-${tag}.png`) });
    await page.close();
    page = await stub.open(ctx, { path: '/app.html?view=chat' });
    await page.waitForTimeout(1500);
    await page.locator('#chat-list [data-chat-id]').first().click({ timeout: 5000 }).catch((e) => console.log('chat open', e.message));
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, `chat-${tag}.png`) });
    await ctx.close();
  }
} finally { await browser.close(); await stub.close(); }
console.log('shots in', SHOTS);
