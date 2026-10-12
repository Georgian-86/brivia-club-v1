// Visual parity guard: `node scripts/visual-parity.mjs capture|compare <dir> [--pages index,auth] [--expect-diff a,b]`.
// Serves the existing dist/; never builds. Build it with the stub Supabase baked in, because the auth signup states
// (steps 2-4, the "Check your email." panel) need Supabase answers, which come from the fixtures below:
//   VITE_SUPABASE_URL=https://stub.supabase.local VITE_SUPABASE_ANON_KEY=stub npm run build
// (A build without them shows a different auth step 1 and cannot reach step 3.) Playwright lives outside the repo.
// --expect-diff names shots (file stem, e.g. auth-375-signup-step4-actions) whose change is intended: compare prints
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
  // after the web font swaps in (auth step 1 "Choose one" sat 1px higher or lower depending on that race).
  // Force one relayout after fonts are ready so every capture shows the post-font state.
  await page.evaluate(() => { for (const el of document.querySelectorAll('select')) { el.style.display = 'none'; void el.offsetHeight; el.style.display = ''; } });
  await idle(page);
  await settle(page, 400);
}

// Supabase fixtures for the auth states (the minimal answers tests/e2e/onboarding.spec.mjs uses): the interest
// catalogue, the place search, and a signUp without a session (email confirmation, so the success panel shows).
const STUB = 'https://stub.supabase.local';
const NODES = [
  { id: 'games', parent_id: null, level: 1, label: 'Games and puzzles', sensitive: false },
  { id: 'games.board', parent_id: 'games', level: 2, label: 'Board games', sensitive: false },
  { id: 'games.board.chess', parent_id: 'games.board', level: 3, label: 'Chess', sensitive: false },
  { id: 'sports', parent_id: null, level: 1, label: 'Sports and fitness', sensitive: false },
  { id: 'sports.racket', parent_id: 'sports', level: 2, label: 'Racket sports', sensitive: false },
  { id: 'sports.racket.tennis', parent_id: 'sports.racket', level: 3, label: 'Tennis', sensitive: false },
];
const PLACES = [{ id: 'in-pune', name: 'Pune', region: 'Maharashtra', country: 'India' }];
const USER = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'new@test.brivia.club', user_metadata: { name: 'Nia New' }, app_metadata: {}, created_at: '2026-01-15T09:30:00Z' };
async function stubSupabase(ctx) {
  await ctx.route(`${STUB}/**`, (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (p === '/auth/v1/signup') return json(USER); // no session: email confirmation
    if (p === '/rest/v1/interest_node') return json(NODES);
    if (p === '/rest/v1/place') return json(PLACES);
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
    path: '/auth.html#signup',
    async shots(page, vp, shot) {
      await ready(page);
      await imagesReady(page);
      await shot('signup-step1');
      // Each later state: the panel at its top (or at `anchor`), then with the step's Back / Next actions in view.
      const panelTop = () => page.evaluate(() => document.querySelector('.auth-panel')?.scrollTo({ top: 0, behavior: 'instant' }));
      const state = async (label, actions, anchor) => {
        await page.evaluate(() => document.activeElement?.blur());
        await ready(page);
        await imagesReady(page);
        await panelTop();
        if (anchor) await page.locator(anchor).evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
        await settle(page);
        await shot(label);
        if (!actions) return;
        await page.locator(actions).evaluate((el) => el.scrollIntoView({ block: 'end', behavior: 'instant' }));
        await settle(page);
        await shot(`${label}-actions`);
      };
      const step = (n) => page.locator(`[data-signup-step="${n}"]`);
      await step(1).locator('input[name="name"]').fill('Nia New');
      await step(1).locator('input[name="email"]').fill('new@test.brivia.club');
      await step(1).locator('input[name="phoneNumber"]').fill('98765 43210');
      await step(1).locator('.gender-option', { hasText: 'FEMALE' }).click();
      await step(1).locator('select[name="experience"]').selectOption({ index: 2 });
      await step(1).locator('input[name="adultConfirm"]').check();
      await step(1).locator('.signup-next').click();
      await page.waitForSelector('[data-signup-step="2"]:not([hidden])');
      // Your area: pick a city (no geolocation, so nothing depends on a permission prompt).
      await page.locator('[data-area-city]').click();
      await page.locator('#area-city-search').fill('Pun');
      await page.waitForSelector('#area-city-results [role="option"]');
      await page.locator('#area-city-search').press('ArrowDown');
      await page.locator('#area-city-search').press('Enter');
      await page.waitForFunction(() => /Pune/.test(document.querySelector('[data-area-status]')?.textContent || ''));
      await state('signup-step2', '[data-signup-step="2"] .signup-step-actions');
      await step(2).locator('.signup-next').click();
      await page.waitForSelector('[data-signup-step="3"]:not([hidden])');
      await page.waitForSelector('#interest-results [data-interest-group]', { state: 'attached' });
      await page.locator('#interest-search').fill('Chess');
      await page.locator('#interest-results [data-interest-id]', { hasText: 'Chess' }).first().click();
      await page.locator('#interest-search').fill('');
      await page.locator('[data-budget-spread]').click();
      await page.locator('.looking-search').click();
      await page.locator('#looking-results [data-looking-option]').first().click();
      await step(3).locator('.signup-step-heading h2').click(); // an outside click closes the looking-for list
      await state('signup-step3', '[data-signup-step="3"] .signup-step-actions');
      await step(3).locator('.signup-next').click();
      await page.waitForSelector('[data-signup-step="4"]:not([hidden])');
      await step(4).locator('input[name="password"]').fill('correct horse 1');
      await step(4).locator('input[name="passwordConfirm"]').fill('correct horse 1');
      await state('signup-step4', '[data-signup-step="4"] .signup-step-actions');
      await step(4).locator('[type="submit"]').click();
      await page.waitForSelector('#auth-success:not([hidden])', { timeout: 15000 });
      // The success panel sits below the (still visible) form at HEAD 8968f37: shoot it in view.
      await state('signup-success', null, '#auth-success');
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
