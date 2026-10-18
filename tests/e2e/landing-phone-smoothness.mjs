// Phone smoothness probe (D-066): a touch fling down the built landing page on a 390x844 phone (isMobile, hasTouch)
// with the CPU throttled 4x (a mid-range Android), reporting frame times, long tasks, layout shifts and how much
// main-thread work each scroll section costs. Not a pass/fail spec unless SMOOTH_ASSERT=1.
//   VITE_SUPABASE_URL=https://stub.supabase.local VITE_SUPABASE_ANON_KEY=stub npm run build
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/landing-phone-smoothness.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT || 5187);
const THROTTLE = Number(process.env.CPU_THROTTLE || 4);
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: repoRoot, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-preview.pid, 'SIGTERM'); } catch { /* gone */ } };
for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let worst = 0;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    try { localStorage.setItem('brivia-intro-seen', 'true'); } catch { /* none */ }
    window.__frames = []; window.__long = []; window.__cls = 0; window.__shifts = [];
    let last = performance.now();
    const tick = (t) => { window.__frames.push([t - last, scrollY]); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push([Math.round(e.duration), Math.round(scrollY)]))).observe({ type: 'longtask', buffered: true }); } catch { /* none */ }
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push([Math.round(e.value * 1000) / 1000, Math.round(scrollY), e.sources?.map((s) => s.node?.className || s.node?.nodeName).join(' ')]); } })).observe({ type: 'layout-shift', buffered: true }); } catch { /* none */ }
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await page.evaluate(() => { window.__frames = []; window.__long = []; });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  // Thumb flings: a 500 px drag in 10 moves of 16 ms, released (the fling carries on), then a short pause, until the
  // bottom. (Input.synthesizeScrollGesture does not scroll in headless Chromium; raw touch events do.)
  const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 195, y }] });
  for (let i = 0; i < 80; i += 1) {
    await touch('touchStart', 700);
    for (let k = 1; k <= 10; k += 1) { await touch('touchMove', 700 - k * 50); await page.waitForTimeout(16); }
    await touch('touchEnd');
    await page.waitForTimeout(350);
    if (await page.evaluate((h) => scrollY + innerHeight >= h - 4, height)) break;
  }
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const f = window.__frames.slice(2).map(([d]) => d).sort((a, b) => a - b);
    const pct = (p) => Math.round(f[Math.min(f.length - 1, Math.floor(f.length * p))] * 10) / 10;
    const sections = [...document.querySelectorAll('body > section, main > section, body > div > section, footer')].map((s) => ({ name: s.className.split(' ')[0] || s.id || s.tagName, top: s.offsetTop, bottom: s.offsetTop + s.offsetHeight }));
    const where = (y) => (sections.find((s) => y + 422 >= s.top && y + 422 < s.bottom) || { name: '?' }).name;
    const bySection = {};
    for (const [d, y] of window.__frames.slice(2)) { const k = where(y); (bySection[k] ||= { frames: 0, over33: 0, worst: 0 }); bySection[k].frames += 1; if (d > 33.4) bySection[k].over33 += 1; bySection[k].worst = Math.max(bySection[k].worst, Math.round(d)); }
    return { frames: f.length, p50: pct(.5), p95: pct(.95), p99: pct(.99), over33: f.filter((d) => d > 33.4).length, over50: f.filter((d) => d > 50).length, longTasks: window.__long.map(([d, y]) => `${d}ms@${where(y)}`), cls: Math.round(window.__cls * 1000) / 1000, shifts: window.__shifts, y: Math.round(scrollY), bySection };
  });
  worst = r.p95;
  console.log(`390x844 touch, CPU x${THROTTLE}`, JSON.stringify(r, null, 1));
  await context.close();
} finally { await browser.close(); stop(); }
if (process.env.SMOOTH_ASSERT === '1' && worst > 34) { console.log(`FAIL p95 frame ${worst} ms`); process.exit(1); }
