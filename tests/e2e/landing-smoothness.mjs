// Landing smoothness probe (D-063): wheel-scrolls the built landing page top to bottom and reports frame times
// (rAF deltas), long frames, long tasks and layout shifts. Not a pass/fail spec unless SMOOTH_ASSERT=1.
//   VITE_SUPABASE_URL=https://stub.supabase.local VITE_SUPABASE_ANON_KEY=stub npm run build
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/landing-smoothness.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 5188;
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: repoRoot, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-preview.pid, 'SIGTERM'); } catch { /* gone */ } };
for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: (process.env.SMOOTH_GL === '0' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-gpu-rasterization', '--ignore-gpu-blocklist']) });
let worst = 0;
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => {
      try { localStorage.setItem('brivia-intro-seen', 'true'); } catch { /* none */ }
      window.__frames = []; window.__long = []; window.__cls = 0;
      let last = performance.now();
      const tick = (t) => { window.__frames.push(t - last); last = t; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); } catch { /* none */ }
      try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true }); } catch { /* none */ }
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.evaluate(() => { window.__frames = []; window.__long = []; });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const steps = Math.ceil(height / 100);
    for (let i = 0; i < steps; i += 1) { await page.mouse.wheel(0, 100); await page.waitForTimeout(16); }
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const f = window.__frames.slice(2).sort((a, b) => a - b);
      const pct = (p) => Math.round(f[Math.min(f.length - 1, Math.floor(f.length * p))] * 10) / 10;
      return { frames: f.length, p50: pct(.5), p95: pct(.95), p99: pct(.99), over33: f.filter((d) => d > 33.4).length, over50: f.filter((d) => d > 50).length, longTasks: window.__long, cls: Math.round(window.__cls * 1000) / 1000, y: Math.round(scrollY) };
    });
    worst = Math.max(worst, r.p95);
    console.log(`${viewport.width}x${viewport.height}`, JSON.stringify(r));
    await context.close();
  }
} finally { await browser.close(); stop(); }
if (process.env.SMOOTH_ASSERT === '1' && worst > 34) { console.log(`FAIL p95 frame ${worst} ms`); process.exit(1); }
