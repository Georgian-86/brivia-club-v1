// Visual parity guard: `node scripts/visual-parity.mjs capture|compare <dir> [--pages index,auth] [--expect-diff a,b]`.
// Serves the existing dist/; never builds. Build it with the stub Supabase and both signup methods baked in, because
// the auth page's guided screens need Supabase answers (the fixtures below) and VITE_SIGNUP_METHODS decides Welcome:
//   VITE_SUPABASE_URL=https://stub.supabase.local VITE_SUPABASE_ANON_KEY=stub VITE_SIGNUP_METHODS=google,email npm run build
// --pages auth (Phase E Task 5) shoots the login view, then the guided Welcome, Email and Code screens at 375 and 1440.
// Playwright lives outside the repo.
// --expect-diff names shots (file stem, e.g. auth-375-login) whose change is intended: compare prints
// "EXPECTED DIFF <name>" for each and fails if one of them is identical, missing, or any other shot differs.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { imagesReady } from './parity-images.mjs';

const PORT = 5194;
const ORIGIN = `http://localhost:${PORT}`;
const WIDTHS = [{ w: 375, h: 812 }, { w: 1440, h: 900 }];
const settle = (page, ms = 800) => page.waitForTimeout(ms);

// networkidle can stay busy forever (streaming media); never block on it for more than a few seconds.
const idle = (page) => page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

async function ready(page) {
  await page.evaluate(() => document.fonts.ready);
  // Chromium sizes a <select>'s inner text with whatever font was loaded at first layout and may not redo it
  // after the web font swaps in (a select's text sat 1px higher or lower depending on that race).
  // Force one relayout after fonts are ready so every capture shows the post-font state.
  await page.evaluate(() => { for (const el of document.querySelectorAll('select')) { el.style.display = 'none'; void el.offsetHeight; el.style.display = ''; } });
  await idle(page);
  await settle(page, 400);
}

// Supabase fixtures for the auth states: no session, and a code request that succeeds (the guided Code screen).
const STUB = 'https://stub.supabase.local';
async function stubSupabase(ctx) {
  await ctx.route(`${STUB}/**`, (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (p === '/auth/v1/otp') return json({}); // the code goes out; there is still no session
    if (p.startsWith('/rest/v1/')) return json([]);
    return json({});
  });
  await ctx.routeWebSocket(/stub\.supabase\.local/, (ws) => ws.close());
}

const PAGES = {
  index: {
    path: '/',
    async shots(page, vp, shot) {
      await ready(page);
      // Warm-up: scroll the whole page once (scroll-driven reveals), then load and decode every image.
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += Math.max(300, vp.h / 2)) {
        await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
        await page.waitForTimeout(150);
      }
      await imagesReady(page);
      await idle(page);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await settle(page);
      await shot('hero');
      const n = await page.locator('main > section').count();
      for (let i = 0; i < n; i++) {
        const sec = page.locator('main > section').nth(i);
        if (!(await sec.isVisible())) continue; // hidden at this width: nothing to compare
        await sec.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await imagesReady(page);
        await idle(page);
        await settle(page);
        await shot(`section-${String(i + 1).padStart(2, '0')}`);
      }
    },
  },
  auth: {
    // Phase E Task 5: the old 4-step form is gone. The auth page is the login view (with "Email me a code instead")
    // and the guided signup's account screens: Welcome, Email, and Code (no session, so nothing else is reachable).
    path: '/auth.html#login',
    async shots(page, vp, shot) {
      const view = async (label) => {
        await page.evaluate(() => document.activeElement?.blur());
        await page.mouse.move(1, 1);
        await ready(page);
        await imagesReady(page);
        await settle(page);
        await shot(label);
      };
      await page.waitForSelector('#login-form');
      await view('login');
      await page.goto(ORIGIN + '/auth.html?signup=1#signup'); // a new document: a hash change alone does not reload
      await page.waitForSelector('#guided-signup:not([hidden]) #signup-screen-title');
      await view('signup-welcome');
      const email = page.locator('#guided-signup button', { hasText: 'Continue with email' });
      if (!(await email.count())) return; // a build without VITE_SIGNUP_METHODS shows only "Signups open soon"
      await email.first().click();
      await page.waitForSelector('#signup-email');
      await view('signup-email');
      await page.locator('#signup-email').fill('new@test.brivia.club');
      await page.locator('#signup-email').press('Enter');
      await page.waitForSelector('#guided-signup .gs-otp');
      await view('signup-code');
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
        await stubSupabase(ctx);
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
const expectDiff = new Set((arg('--expect-diff') || '').split(',').filter(Boolean));
const pages = pagesArg ? pagesArg.split(',') : Object.keys(PAGES);
const bad = pages.filter((p) => !PAGES[p]);
if (!['capture', 'compare'].includes(cmd) || !dirArg || bad.length) {
  console.error('usage: visual-parity.mjs capture|compare <dir> [--pages index,auth] [--expect-diff name,name]' + (bad.length ? ` (unknown: ${bad})` : ''));
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
  try {
    await withServer(() => captureAll(tmp, pages));
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
  const base = readdirSync(dir).filter((f) => f.endsWith('.png') && pages.some((p) => f.startsWith(p + '-')));
  const fresh = readdirSync(tmp).filter((f) => f.endsWith('.png'));
  const all = new Set([...fresh, ...base]);
  const remaining = new Set();
  const oneSided = new Set();
  for (const f of all) {
    const a = existsSync(join(dir, f)) ? readFileSync(join(dir, f)) : null;
    const b = existsSync(join(tmp, f)) ? readFileSync(join(tmp, f)) : null;
    if (!a || !b) oneSided.add(f);
    if (!a || !b || !a.equals(b)) {
      remaining.add(f);
      if (b) { mkdirSync(join(dir, '..', 'parity-diff'), { recursive: true }); writeFileSync(join(dir, '..', 'parity-diff', f), b); }
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log(`compared ${all.size} screenshots`);
  // Intended changes are named one by one; each must really differ (and exist on both sides), nothing else may.
  const problems = [];
  for (const name of expectDiff) {
    const f = `${name}.png`;
    if (!all.has(f) || oneSided.has(f)) problems.push(`${name} (expected a difference, but there is no such shot on both sides)`);
    else if (!remaining.has(f)) problems.push(`${name} (expected a difference, but it is identical)`);
    else { console.log(`EXPECTED DIFF ${name}`); remaining.delete(f); }
  }
  if (remaining.size || problems.length) { console.error('DIFFERENT:\n' + [...remaining, ...problems].join('\n')); process.exit(1); }
  console.log(expectDiff.size ? 'identical apart from the expected differences' : 'identical');
}
