// Visual parity guard: `node scripts/visual-parity.mjs capture|compare <dir> [--pages index,auth]`.
// Serves the existing dist/ (run `npm run build` first); never builds. Playwright lives outside the repo.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = 5194;
const ORIGIN = `http://localhost:${PORT}`;
const WIDTHS = [{ w: 375, h: 812 }, { w: 1440, h: 900 }];
const settle = (page, ms = 800) => page.waitForTimeout(ms);

// networkidle can stay busy forever (streaming media); never block on it for more than a few seconds.
const idle = (page) => page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

async function ready(page) {
  await page.evaluate(() => document.fonts.ready);
  // Chromium sizes a <select>'s inner text with whatever font was loaded at first layout and may not redo it
  // after the web font swaps in (auth step 1 "Choose one" sat 1px higher or lower depending on that race).
  // Force one relayout after fonts are ready so every capture shows the post-font state.
  await page.evaluate(() => { for (const el of document.querySelectorAll('select')) { el.style.display = 'none'; void el.offsetHeight; el.style.display = ''; } });
  await idle(page);
  await settle(page, 400);
}

const PAGES = {
  index: {
    path: '/',
    async shots(page, vp, shot) {
      await ready(page);
      await shot('hero');
      // Warm-up pass: lazy images/backgrounds load on first sight; scroll the whole page once so every shot
      // sees them already decoded (otherwise below-the-fold imagery races the screenshot).
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += Math.max(300, vp.h / 2)) {
        await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
        await page.waitForTimeout(150);
      }
      await idle(page);
      await page.evaluate(() => Promise.race([Promise.all([...document.images].map((i) => i.decode().catch(() => {}))), new Promise((r) => setTimeout(r, 5000))]));
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await settle(page);
      const n = await page.locator('main > section').count();
      for (let i = 0; i < n; i++) {
        const sec = page.locator('main > section').nth(i);
        if (!(await sec.isVisible())) continue; // hidden at this width: nothing to compare
        await sec.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await idle(page);
        await settle(page);
        await shot(`section-${String(i + 1).padStart(2, '0')}`);
      }
    },
  },
  auth: {
    path: '/auth.html#signup',
    async shots(page, vp, shot) {
      await ready(page);
      await shot('signup-step1');
    },
  },
};

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
}

async function withServer(fn) {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(ORIGIN + '/')).ok) break; } catch {}
      await new Promise((r) => setTimeout(r, 200));
      if (i === 99) throw new Error('vite preview did not start');
    }
    return await fn();
  } finally {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {} // whole group: npx spawns the real vite process
  }
}

async function captureAll(dir, pages) {
  const pw = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || '/tmp/pw/node_modules/playwright/index.mjs').href);
  const { chromium } = pw.default || pw;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
    // Root cause of the old 1px flake in the matching section (index section-07): GPU/partial raster of the
    // filtered, scroll-driven photo layers is not bit-stable between page loads (DOM state was identical in
    // every run). Software, non-partial raster is: 10/10 identical vs 4 distinct frames in 10 without these.
    args: ['--disable-gpu-rasterization', '--disable-zero-copy', '--disable-accelerated-2d-canvas', '--disable-threaded-animation', '--disable-partial-raster', '--enable-features=NoSkiaNondeterminism'],
  });
  let count = 0;
  try {
    for (const name of pages) {
      const spec = PAGES[name];
      for (const vp of WIDTHS) {
        const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, reducedMotion: 'reduce' });
        await ctx.addInitScript(() => { try { localStorage.setItem('brivia-intro-seen', '1'); } catch {} });
        await ctx.route('**/*.mp4', (r) => r.abort());
        const page = await ctx.newPage();
        await page.clock.setFixedTime(new Date('2026-01-15T09:30:00')); // landing shows a live clock/greeting
        await page.goto(ORIGIN + spec.path);
        // Scroll-linked/transition-driven sections keep moving for a while after a scroll: shoot until two
        // three consecutive frames are byte-identical, then keep that frame.
        const shot = async (label) => {
          const opts = { animations: 'disabled', caret: 'hide' };
          let prev = await page.screenshot(opts);
          let same = 0;
          for (let i = 0; i < 20 && same < 3; i++) {
            await page.waitForTimeout(400);
            const next = await page.screenshot(opts);
            same = next.equals(prev) ? same + 1 : 0;
            prev = next;
          }
          if (same < 3) throw new Error(`unsettled frame: ${name}-${vp.w}-${label} never gave 3 identical frames`);
          writeFileSync(join(dir, `${name}-${vp.w}-${label}.png`), prev);
          count++;
        };
        await spec.shots(page, vp, shot);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  return count;
}

const [cmd, dirArg] = process.argv.slice(2);
const pagesArg = arg('--pages');
const pages = pagesArg ? pagesArg.split(',') : Object.keys(PAGES);
const bad = pages.filter((p) => !PAGES[p]);
if (!['capture', 'compare'].includes(cmd) || !dirArg || bad.length) {
  console.error('usage: visual-parity.mjs capture|compare <dir> [--pages index,auth]' + (bad.length ? ` (unknown: ${bad})` : ''));
  process.exit(2);
}
const dir = resolve(dirArg);

if (cmd === 'capture') {
  mkdirSync(dir, { recursive: true });
  const n = await withServer(() => captureAll(dir, pages));
  console.log(`captured ${n} screenshots into ${dir}`);
} else {
  if (!existsSync(dir)) { console.error(`no baseline at ${dir}`); process.exit(2); }
  const tmp = join(dir, '..', `.parity-tmp-${process.pid}`);
  const { rmSync } = await import('node:fs');
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  await withServer(() => captureAll(tmp, pages));
  const base = readdirSync(dir).filter((f) => f.endsWith('.png') && pages.some((p) => f.startsWith(p + '-')));
  const fresh = readdirSync(tmp).filter((f) => f.endsWith('.png'));
  const all = new Set([...fresh, ...base]);
  const remaining = new Set();
  for (const f of all) {
    const a = existsSync(join(dir, f)) ? readFileSync(join(dir, f)) : null;
    const b = existsSync(join(tmp, f)) ? readFileSync(join(tmp, f)) : null;
    if (!a || !b || !a.equals(b)) {
      remaining.add(f);
      if (b) { mkdirSync(join(dir, '..', 'parity-diff'), { recursive: true }); writeFileSync(join(dir, '..', 'parity-diff', f), b); }
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log(`compared ${all.size} screenshots`);
  if (remaining.size) { console.error('DIFFERENT:\n' + [...remaining].join('\n')); process.exit(1); }
  console.log('identical');
}
