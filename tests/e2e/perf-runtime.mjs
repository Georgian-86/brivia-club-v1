// Runtime smoothness of app.html against the stub (D-229): for each view, ten seconds idle, then a scroll, measuring
// CPU busy time (CDP Performance metrics), long tasks (> 50 ms), frames over 32 ms, running CSS/Web animations and
// style/layout counts. PERF_DIST=<production build> (see perf-boot.mjs); PERF_PHONE=1 throttles CPU x4.
// PLAYWRIGHT_MODULE=... node tests/e2e/perf-runtime.mjs [views...]
import { startAppStub } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const views = process.argv.slice(2).length ? process.argv.slice(2) : ['home', 'explore', 'events', 'chat', 'profile'];
const stub = await startAppStub({ port: 5198, previewDir: process.env.PERF_DIST || '' });
const browser = await chromium.launch();
const phone = Boolean(process.env.PERF_PHONE);
try {
  for (const view of views) {
    const ctx = await stub.newContext(browser, phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {});
    const page = await stub.open(ctx, { path: `/app.html${view === 'home' ? '' : `?view=${view}`}` });
    const cdp = await ctx.newCDPSession(page);
    if (phone) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Performance.enable');
    await page.waitForTimeout(6000);   // past the deck shuffle and first loads
    await page.evaluate(() => {
      window.__perf = { long: [], frames: [] };
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__perf.long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: false });
      let last = performance.now();
      const tick = (t) => { window.__perf.frames.push(t - last); last = t; window.__perf.raf = requestAnimationFrame(tick); };
      window.__perf.raf = requestAnimationFrame(tick);
    });
    const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    const a = await metric();
    await page.waitForTimeout(10000);
    const b = await metric();
    const idle = await page.evaluate(() => {
      const anims = document.getAnimations().filter((x) => x.playState === 'running');
      const names = [...new Set(anims.map((x) => `${x.animationName || x.constructor.name}@${(x.effect?.target?.className || x.effect?.target?.id || x.effect?.target?.tagName || '').toString().slice(0, 40)}`))].slice(0, 12);
      const f = window.__perf.frames.slice(1);
      const out = { long: window.__perf.long.length, longMs: window.__perf.long.reduce((s, x) => s + x, 0), slowFrames: f.filter((x) => x > 32).length, frames: f.length, anims: anims.length, names };
      window.__perf.long = []; window.__perf.frames = [];
      return out;
    });
    // scroll the main scroller and whatever scrolls inside the view
    const s0 = await metric();
    await page.mouse.move(phone ? 195 : 720, phone ? 500 : 500);
    for (let i = 0; i < 20; i += 1) { await page.mouse.wheel(0, i < 10 ? 300 : -300); await page.waitForTimeout(60); }
    await page.waitForTimeout(500);
    const s1 = await metric();
    const scroll = await page.evaluate(() => { const f = window.__perf.frames.slice(1); return { long: window.__perf.long.length, slowFrames: f.filter((x) => x > 32).length, frames: f.length, worst: Math.round(Math.max(0, ...f)) }; });
    const d = (x, y, k) => +(y[k] - x[k]).toFixed(2);
    console.log(`${phone ? 'PHONE' : 'LAPTOP'} ${view.padEnd(8)} IDLE 10s: cpu ${d(a, b, 'TaskDuration')}s script ${d(a, b, 'ScriptDuration')}s style ${d(a, b, 'RecalcStyleCount')} layout ${d(a, b, 'LayoutCount')} long ${idle.long} (${idle.longMs}ms) slowFrames ${idle.slowFrames}/${idle.frames} anims ${idle.anims}`);
    console.log(`   running: ${idle.names.join(' | ')}`);
    console.log(`   SCROLL: cpu ${d(s0, s1, 'TaskDuration')}s long ${scroll.long} slowFrames ${scroll.slowFrames}/${scroll.frames} worst ${scroll.worst}ms`);
    await ctx.close();
  }
} finally { await browser.close(); await stub.close(); }
