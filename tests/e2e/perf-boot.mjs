// Start-up waterfall of app.html against the stub, with a fixed delay on every Supabase request (default 150 ms, the
// round trip from India to the project). Prints each request's start time and the moment the first deck card shows.
// PLAYWRIGHT_MODULE=... node tests/e2e/perf-boot.mjs [delayMs] [view]
// PERF_DIST=<dir>: a production build to serve (build it with VITE_SUPABASE_URL=https://stub.supabase.local
// VITE_SUPABASE_ANON_KEY=stub-anon-key npx vite build --outDir <dir>). PERF_PHONE=1: a mid phone on 4G (CPU x4,
// 9 Mbps, 40 ms).
import { startAppStub, ORIGIN } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const DELAY = Number(process.argv[2] || 150);
const VIEW = process.argv[3] || 'home';
const stub = await startAppStub({ port: 5197, previewDir: process.env.PERF_DIST || '' });
const browser = await chromium.launch();
try {
  const ctx = await stub.newContext(browser, { width: 390, height: 844 });
  // Registered after the stub's own route, so it runs first: wait, then let the stub answer.
  await ctx.route(`${ORIGIN}/**`, async (route) => { if (route.request().method() !== 'OPTIONS') await new Promise((r) => setTimeout(r, DELAY)); await route.fallback(); });
  if (process.env.PERF_PHONE) {
    ctx.on('page', async (p) => {
      const cdp = await ctx.newCDPSession(p);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 });
    });
  }
  // PERF_AUTH_FIRST=1: six seconds on the login page first (as a member signing up or logging in), then the app.
  if (process.env.PERF_AUTH_FIRST) {
    const auth = await ctx.newPage();
    await auth.goto(`${stub.url}/auth.html?forgot=1`, { waitUntil: 'load' });
    await auth.waitForTimeout(6000);
    await auth.close();
  }
  const t0 = Date.now();
  const log = [];
  ctx.on('request', (r) => { if (r.url().startsWith(ORIGIN) && r.method() !== 'OPTIONS') log.push({ t: Date.now() - t0, m: r.method(), u: r.url().replace(ORIGIN, '').split('?')[0] }); });
  const page = await stub.open(ctx, { path: `/app.html${VIEW === 'home' ? '' : `?view=${VIEW}`}` });
  const ready = VIEW === 'home'
    ? await page.waitForFunction(() => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim(), null, { timeout: 30000 }).then(() => Date.now() - t0)
    : await page.waitForSelector('.chat-row, .inbox-empty', { timeout: 30000 }).then(() => Date.now() - t0);
  await page.waitForTimeout(1500);
  const splashGone = await page.evaluate(() => performance.now());
  console.log(`delay ${DELAY} ms, view ${VIEW}: first content at ${ready} ms`);
  for (const l of log.filter((x) => x.t <= ready + 50)) console.log(String(l.t).padStart(6), l.m.padEnd(5), l.u);
  console.log(`requests before first content: ${log.filter((x) => x.t <= ready).length}`);
} finally { await browser.close(); await stub.close(); }
