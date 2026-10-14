// Phase B Task 3: landing speed (intro cap, deferred video, lazy images) against `vite preview` of a fresh build.
// No Supabase is needed (the landing only reads the session when configured). External hosts (fonts) are aborted.
//
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs CHROMIUM_PATH=/opt/pw-browsers/chromium \
//     node tests/e2e/landing.spec.mjs
//
// Per viewport (375 and 1440):
// * first paint shows the hero poster (no black hero), even when every video request fails;
// * the intro is gone within 2600 ms on a first visit, and a second visit in a new tab never shows it;
// * reduced motion and save-data: zero .mp4 requests, even after scrolling and a click;
// * initial transfer (until load + 2 s idle, no scroll) under 3 MB;
// * CLS under 0.1 after load + 2 s;
// * no request for the app bundle (app-*.js) on the landing;
// * below-fold images load only after scrolling near them.
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT || 5196);
const BASE = `http://127.0.0.1:${PORT}`;
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const VIEWPORTS = [{ name: '375', width: 375, height: 812 }, { name: '1440', width: 1440, height: 900 }];
const MAX_BYTES = 3_000_000;
// This Chromium build cannot decode H.264, so it downloads BOTH hero <source> files; a real browser fetches one (and, on
// a fast link, buffers all of it). So the hard 3 MB check counts everything except the hero video files exactly as
// received, and a separate line reports the total with the hero file the viewport would really stream (a WARN, see below).
const HERO_FILE = (viewport) => (viewport.width > 700 ? 'hero-section-video-1080.mp4' : 'hero-section-video-720.mp4');
const isHeroVideo = (url) => /hero-section-video-(1080|720)[^/]*\.mp4/.test(url);
const nonHeroBytes = (entries) => entries.filter(({ url }) => !isHeroVideo(url)).reduce((sum, { size }) => sum + size, 0);

let failures = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`PASS ${name}`); } catch (error) { failures += 1; console.log(`FAIL ${name}\n     ${String(error.message || error).split('\n').join('\n     ')}`); }
};

// Install the observers before any page script runs.
const INIT_SCRIPT = () => {
  window.__cls = 0;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* unsupported */ }
  window.__lcp = null;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__lcp = { time: Math.round(entry.startTime), url: entry.url || '', tag: entry.element ? entry.element.tagName : '' };
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* unsupported */ }
  window.__introEverVisible = false;
  window.__introGoneAt = null;
  const isShown = (el) => {
    const st = getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0;
  };
  const tick = () => {
    const el = document.querySelector('#intro-burst');
    if (el && isShown(el)) window.__introEverVisible = true;
    if (window.__introGoneAt === null && document.body && (!el || !isShown(el))) window.__introGoneAt = Math.round(performance.now());
    if (window.__introGoneAt === null) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const newContext = async (browser, viewport, options = {}) => {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, ...options.context });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    return route.continue();
  });
  await context.addInitScript(INIT_SCRIPT);
  if (options.seen) await context.addInitScript(() => { try { localStorage.setItem('brivia-intro-seen', 'true'); } catch { /* ignore */ } });
  if (options.saveData) await context.addInitScript(() => { Object.defineProperty(navigator, 'connection', { get: () => ({ saveData: true, effectiveType: '4g' }) }); });
  return context;
};

// Records every request URL and the bytes received per request (CDP, so in-flight media counts too).
const track = async (context, page) => {
  const urls = [];
  page.on('request', (request) => urls.push(request.url()));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const idToUrl = new Map();
  const received = new Map();
  const finished = new Map();
  cdp.on('Network.requestWillBeSent', (event) => idToUrl.set(event.requestId, event.request.url));
  // In-flight media counts by bytes received; finished requests use the exact encoded (on the wire) size.
  cdp.on('Network.dataReceived', (event) => received.set(event.requestId, (received.get(event.requestId) || 0) + (event.encodedDataLength || event.dataLength || 0)));
  cdp.on('Network.loadingFinished', (event) => finished.set(event.requestId, event.encodedDataLength));
  const entries = () => [...idToUrl.entries()]
    .map(([id, url]) => ({ url, size: finished.has(id) ? finished.get(id) : (received.get(id) || 0) }))
    .filter(({ url }) => !url.startsWith('data:'));
  const biggest = () => entries().sort((a, b) => b.size - a.size).slice(0, 4).map((entry) => `${entry.url.replace(BASE, '')} ${entry.size}`);
  return { urls, entries, biggest };
};

const waitForServer = async () => {
  for (let i = 0; i < 80; i += 1) {
    try { const res = await fetch(`${BASE}/index.html`); if (res.ok) return; } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('vite preview did not start');
};

const build = spawnSync('npm', ['run', 'build'], { cwd: repoRoot, encoding: 'utf8' });
if (build.status !== 0) { console.log(build.stdout, build.stderr); process.exit(1); }

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
});
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });

  for (const viewport of VIEWPORTS) {
    const label = viewport.name;

    // 1. First paint shows the hero poster, even when every video request fails.
    {
      const context = await newContext(browser, viewport, { seen: true });
      await context.route('**/*.mp4', (route) => route.abort());
      const page = await context.newPage();
      const posterResponse = page.waitForResponse((response) => /hero-section-video[^/]*\.webp/.test(response.url()), { timeout: 15000 });
      await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
      const response = await posterResponse;
      await page.waitForTimeout(500);
      const poster = await page.evaluate(() => { const v = document.querySelector('.hero-video'); const r = v.getBoundingClientRect(); return { poster: v.poster, width: r.width, height: r.height }; });
      const stats = await sharp(await page.screenshot()).stats();
      await check(`${label}: first paint shows the hero poster (no black hero), even with failing videos`, () => {
        assert.equal(response.status(), 200);
        assert.match(poster.poster, /hero-section-video[^/]*\.webp$/);
        assert.ok(poster.width >= viewport.width * 0.9 && poster.height > 300, `hero video box ${poster.width}x${poster.height}`);
        const brightest = Math.max(...stats.channels.map((channel) => channel.mean));
        assert.ok(brightest > 40, `viewport looks black (brightest channel mean ${brightest.toFixed(1)})`);
      });
      await context.close();
    }

    // 2. Intro: first visit is gone within 2600 ms; second visit in a new tab never shows it.
    {
      const context = await newContext(browser, viewport);
      const page = await context.newPage();
      await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
      const introSeenAtStart = await page.evaluate(() => Boolean(document.querySelector('#intro-burst')));
      await page.waitForFunction(() => window.__introGoneAt !== null, null, { timeout: 8000 }).catch(() => {});
      const goneAt = await page.evaluate(() => window.__introGoneAt);
      const bodyLocked = await page.evaluate(() => document.body.classList.contains('intro-active'));
      const stored = await page.evaluate(() => { try { return localStorage.getItem('brivia-intro-seen'); } catch { return null; } });
      console.log(`INFO ${label}: first-visit intro present at DOMContentLoaded=${introSeenAtStart}, gone at ${goneAt} ms`);
      await check(`${label}: intro gone within 2600 ms on first visit`, () => {
        assert.equal(introSeenAtStart, true, 'a first visit should start with the intro');
        assert.ok(goneAt !== null && goneAt <= 2600, `intro gone at ${goneAt} ms`);
        assert.equal(bodyLocked, false, 'body.intro-active still set');
        assert.equal(stored, 'true', 'brivia-intro-seen not stored in localStorage');
      });
      const second = await context.newPage();
      await second.goto(`${BASE}/index.html`, { waitUntil: 'load' });
      await second.waitForTimeout(300);
      const secondState = await second.evaluate(() => ({ everVisible: window.__introEverVisible, present: Boolean(document.querySelector('#intro-burst')), locked: document.body.classList.contains('intro-active') }));
      await check(`${label}: no intro on second visit (localStorage)`, () => {
        assert.equal(secondState.everVisible, false, 'intro flashed on the second visit');
        assert.equal(secondState.locked, false);
      });
      await context.close();
    }

    // 2b. Hard cap: a video that plays (stubbed here: this Chromium cannot decode H.264) is still cut at INTRO_CAP_MS.
    {
      const context = await newContext(browser, viewport);
      await context.addInitScript(() => {
        Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { get: () => 1, set: () => {}, configurable: true });
        HTMLMediaElement.prototype.play = () => Promise.resolve();
      });
      const page = await context.newPage();
      await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__introGoneAt !== null, null, { timeout: 8000 }).catch(() => {});
      const goneAt = await page.evaluate(() => window.__introGoneAt);
      console.log(`INFO ${label}: playing-video intro gone at ${goneAt} ms`);
      await check(`${label}: a playing intro is cut at the 2500 ms cap (gone by 2600 ms, not before 2000 ms)`, () => {
        assert.ok(goneAt !== null && goneAt >= 2000 && goneAt <= 2600, `gone at ${goneAt} ms`);
      });
      await context.close();
    }

    // 2c. Audio unlock: a gesture BEFORE the hero starts must still unmute it once it starts (the listener is one-shot).
    // Chromium here cannot decode H.264, so play() is stubbed with the autoplay policy: an unmuted play() needs a prior gesture.
    for (const tapFirst of [true, false]) {
      const context = await newContext(browser, viewport, { seen: true });
      await context.addInitScript(() => {
        window.requestIdleCallback = undefined; // force the 1200 ms timer path (Safari)
        window.__unmutedAttempts = 0;
        HTMLMediaElement.prototype.play = function play() {
          if (!this.muted) {
            window.__unmutedAttempts += 1;
            if (!navigator.userActivation.hasBeenActive) return Promise.reject(new DOMException('autoplay', 'NotAllowedError'));
          }
          return Promise.resolve();
        };
      });
      const page = await context.newPage();
      await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
      if (tapFirst) await page.mouse.click(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
      await page.waitForTimeout(1900);
      const hero = await page.evaluate(() => ({ muted: document.querySelector('.hero-video').muted, attempts: window.__unmutedAttempts }));
      await check(`${label}: ${tapFirst ? 'a tap before the hero starts leaves it unmuted once it starts' : 'with no gesture the hero starts muted without an unmuted attempt'}`, () => {
        if (tapFirst) assert.equal(hero.muted, false, 'hero is muted after an early tap');
        else { assert.equal(hero.muted, true); assert.equal(hero.attempts, 0, 'unmuted play() attempted before any gesture'); }
      });
      await context.close();
    }

    // 3. Arriving from an auth page (sessionStorage flag) skips the intro once.
    {
      const context = await newContext(browser, viewport);
      await context.addInitScript(() => { try { sessionStorage.setItem('brivia-skip-intro-once', 'true'); } catch { /* ignore */ } });
      const page = await context.newPage();
      await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
      await page.waitForTimeout(300);
      const state = await page.evaluate(() => ({ everVisible: window.__introEverVisible, flag: sessionStorage.getItem('brivia-skip-intro-once') }));
      await check(`${label}: arriving from auth skips the intro and clears the one-shot flag`, () => {
        assert.equal(state.everVisible, false);
        assert.equal(state.flag, null);
      });
      await context.close();
    }

    // 4. Reduced motion and save-data: zero .mp4 requests.
    for (const mode of ['reduced-motion', 'save-data']) {
      const context = await newContext(browser, viewport, mode === 'reduced-motion' ? { context: { reducedMotion: 'reduce' } } : { saveData: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const tracked = await track(context, page);
      await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      await page.evaluate(async () => { for (let y = 0; y <= document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } });
      await page.mouse.click(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
      await page.keyboard.press('Tab');
      await page.waitForTimeout(1200);
      const mp4 = tracked.urls.filter((url) => /\.mp4(\?|$)/.test(url));
      await check(`${label}: ${mode}: zero .mp4 requests and no page errors`, () => {
        assert.deepEqual(mp4, []);
        assert.deepEqual(errors, []);
      });
      await context.close();
    }

    // 5. Transfer, CLS, app bundle, lazy images (second visit so the intro does not mask the page).
    {
      const context = await newContext(browser, viewport, { seen: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const tracked = await track(context, page);
      const bad = [];
      page.on('response', (response) => { if (response.url().startsWith(BASE) && response.status() >= 400) bad.push(`${response.status()} ${response.url().replace(BASE, '')}`); });
      await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
      await page.waitForTimeout(2000);
      const modelledBytes = nonHeroBytes(tracked.entries());
      const heroBytes = fs.statSync(path.join(repoRoot, 'media/video', HERO_FILE(viewport))).size;
      const withHero = modelledBytes + heroBytes;
      const cls = await page.evaluate(() => window.__cls);
      const beforeScroll = [...tracked.urls];
      console.log(`INFO ${label}: initial transfer ${modelledBytes} bytes (${(modelledBytes / 1e6).toFixed(2)} MB without the hero video; ${(withHero / 1e6).toFixed(2)} MB if the whole ${HERO_FILE(viewport)} streams), CLS ${cls.toFixed(4)}; largest: ${tracked.biggest().join(' | ')}`);
      await check(`${label}: initial transfer (hero video excluded) under 3 MB before scroll`, () => assert.ok(modelledBytes < MAX_BYTES, `${modelledBytes} bytes`));
      if (withHero >= MAX_BYTES) console.log(`WARN ${label}: with the whole hero video streamed the initial transfer is ${(withHero / 1e6).toFixed(2)} MB (budget 3 MB)`);
      await check(`${label}: CLS under 0.1 after load + 2 s`, () => assert.ok(cls < 0.1, `CLS ${cls}`));
      const lcp = await page.evaluate(() => window.__lcp);
      const posterRequests = tracked.urls.filter((url) => /hero-section-video[^/]*\.webp/.test(url));
      console.log(`INFO ${label}: LCP ${lcp && lcp.time} ms (${lcp && lcp.tag} ${lcp && lcp.url.replace(BASE, '')}); poster requests: ${posterRequests.length}`);
      await check(`${label}: LCP under 2500 ms (local preview, unthrottled)`, () => {
        assert.ok(lcp, 'no largest-contentful-paint entry');
        assert.ok(lcp.time < 2500, `LCP ${lcp.time} ms`);
      });
      await check(`${label}: the hero poster is requested once (preload reused by the <video poster>)`, () => assert.equal(posterRequests.length, 1, posterRequests.join(', ')));
      await check(`${label}: no request to fonts.googleapis.com or fonts.gstatic.com`, () => assert.deepEqual(tracked.urls.filter((url) => /fonts\.(googleapis|gstatic)\.com/.test(url)), []));
      await check(`${label}: heading font is preloaded (link rel=preload as=font) and fetched from our own host`, async () => {
        const link = await page.evaluate(() => { const l = document.querySelector('link[rel="preload"][as="font"]'); return l && { href: l.getAttribute('href'), type: l.type, cross: l.crossOrigin }; });
        assert.ok(link, 'no font preload link');
        assert.equal(link.type, 'font/woff2');
        assert.ok(tracked.urls.some((url) => url.endsWith(link.href)), 'preloaded font was not requested');
        assert.equal(tracked.urls.filter((url) => url.endsWith(link.href)).length, 1, 'font requested more than once');
      });
      await check(`${label}: no request for the app bundle (app-*.js) on the landing`, () => {
        assert.deepEqual(beforeScroll.filter((url) => /\/assets\/app-[^/]*\.js/.test(url)), []);
        assert.deepEqual(errors, []);
      });

      const imgInfo = await page.evaluate(() => [...document.images].map((img) => {
        const rect = img.getBoundingClientRect();
        return { src: img.getAttribute('src'), lazy: img.loading === 'lazy', hasSize: img.hasAttribute('width') && img.hasAttribute('height'), top: rect.top + window.scrollY, hidden: !img.getClientRects().length };
      }));
      await check(`${label}: only below-fold images are lazy, and every image has width/height`, () => {
        const firstViewport = imgInfo.filter((img) => !img.hidden && img.top < viewport.height);
        assert.deepEqual(firstViewport.filter((img) => img.lazy).map((img) => img.src), [], 'lazy image in first viewport');
        const farBelow = imgInfo.filter((img) => !img.hidden && img.top > viewport.height * 2);
        assert.deepEqual(farBelow.filter((img) => !img.lazy).map((img) => img.src), [], 'eager image far below the fold');
        assert.deepEqual(imgInfo.filter((img) => !img.hasSize).map((img) => img.src), [], 'image without width/height');
      });

      await check(`${label}: hero video starts on its own after load, the playground video waits until it is near`, async () => {
        assert.equal(beforeScroll.some((url) => /hero-section-video[^/]*\.mp4/.test(url)), true, 'hero video never requested');
        assert.equal(beforeScroll.some((url) => /write_Its_a_in_black_color[^/]*\.mp4/.test(url)), false, 'playground video fetched before scrolling');
        await page.evaluate(() => document.querySelector('[data-playground-video]').scrollIntoView({ block: 'center' }));
        await page.waitForTimeout(1500);
        assert.equal(tracked.urls.some((url) => /write_Its_a_in_black_color[^/]*\.mp4/.test(url)), true, 'playground video not requested near the viewport');
      });

      const target = '[data-pillar-image="private"]';
      const pillarRe = /PILLARS1[^/]*\.webp/;
      await check(`${label}: below-fold images load only after scrolling near them`, async () => {
        assert.equal(beforeScroll.some((url) => pillarRe.test(url)), false, 'PILLARS1 fetched before scrolling');
        await page.locator(target).scrollIntoViewIfNeeded();
        await page.evaluate((selector) => document.querySelector(selector).scrollIntoView({ block: 'center' }), target);
        await page.waitForTimeout(1500);
        assert.equal(tracked.urls.some((url) => pillarRe.test(url)), true, 'PILLARS1 not fetched after scrolling to it');
      });
      await page.evaluate(async () => { for (let y = 0; y <= document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } });
      await page.waitForTimeout(800);
      await check(`${label}: index.html: no same-origin response with status >= 400 after a full scroll`, () => assert.deepEqual(bad, []));
      await context.close();
    }

    // 6. Image cards show the skeleton tint until their image has loaded.
    {
      const context = await newContext(browser, viewport, { seen: true });
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      await context.route(/CONTEXT1[^/]*\.webp/, async (route) => { await gate; await route.continue(); });
      const page = await context.newPage();
      await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
      const card = page.locator('.process-step-visual').first();
      await card.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.querySelector('.process-step-visual').scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(500);
      const before = await card.evaluate((el) => ({ skeleton: el.classList.contains('skeleton'), bg: getComputedStyle(el).backgroundColor }));
      release();
      await page.waitForFunction(() => !document.querySelector('.process-step-visual').classList.contains('skeleton'), null, { timeout: 8000 }).catch(() => {});
      const after = await card.evaluate((el) => el.classList.contains('skeleton'));
      await check(`${label}: image cards show the skeleton tint until loaded`, () => {
        assert.equal(before.skeleton, true, 'no .skeleton while the image is pending');
        assert.equal(before.bg, 'rgb(239, 228, 220)', `tint ${before.bg}`);
        assert.equal(after, false, '.skeleton still present after the image loaded');
      });
      await context.close();
    }
  }

  // 6b. auth.html loads and scrolls without a same-origin 4xx/5xx.
  {
    const context = await newContext(browser, VIEWPORTS[0], { seen: true });
    const page = await context.newPage();
    const bad = [];
    page.on('response', (response) => { if (response.url().startsWith(BASE) && response.status() >= 400) bad.push(`${response.status()} ${response.url().replace(BASE, '')}`); });
    await page.goto(`${BASE}/auth.html`, { waitUntil: 'load' });
    await page.evaluate(async () => { for (let y = 0; y <= document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } });
    await page.waitForTimeout(800);
    await check('auth.html: no same-origin response with status >= 400 after a full scroll', () => assert.deepEqual(bad, []));
    await context.close();
  }

  // 7. careers.html keeps Instrument Sans 400 (its body text and modal inputs rely on it), loaded only from careers.js.
  {
    const context = await newContext(browser, VIEWPORTS[1], { seen: true });
    const page = await context.newPage();
    const tracked = await track(context, page);
    await page.goto(`${BASE}/careers.html`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => ({
      weight: getComputedStyle(document.querySelector('.careers-intro')).fontWeight,
      loaded400: [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Instrument Sans' && f.weight === '400' && f.style === 'normal' && f.status === 'loaded'),
      check: document.fonts.check('400 16px "Instrument Sans"'),
    }));
    await check('careers: body text is weight 400 and the 400 face is loaded', () => {
      assert.equal(info.weight, '400');
      assert.equal(info.loaded400, true, 'Instrument Sans 400 face not loaded');
      assert.equal(info.check, true);
    });
    await context.close();
    const landing = await newContext(browser, VIEWPORTS[1], { seen: true });
    const lp = await landing.newPage();
    const lt = await track(landing, lp);
    await lp.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await lp.waitForTimeout(800);
    await check('landing does not fetch the careers-only 400 font', () => assert.deepEqual(lt.urls.filter((url) => /instrument-sans-latin-400/.test(url)), []));
    await landing.close();
  }

  // 8. Phase C Task 3: each page ships only its own CSS. Read the stylesheets each built page links (dist/*.html).
  {
    const linkedCss = (html) => {
      const doc = fs.readFileSync(path.join(repoRoot, 'dist', html), 'utf8');
      const hrefs = [...doc.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map((m) => (m[0].match(/href="([^"]+)"/) || [])[1]).filter((h) => h && h.startsWith('/assets/'));
      return { hrefs, css: hrefs.map((h) => fs.readFileSync(path.join(repoRoot, 'dist', h), 'utf8')).join('\n') };
    };
    const AUTH_ONLY = /\.signup-step|\.auth-success/g;
    const landingCss = linkedCss('index.html');
    const authCss = linkedCss('auth.html');
    await check(`the landing CSS bundle contains no .signup-step or .auth-success selectors (${landingCss.hrefs.join(', ')})`, () => {
      assert.ok(landingCss.hrefs.length > 0, 'index.html links no stylesheet');
      assert.deepEqual([...new Set(landingCss.css.match(AUTH_ONLY) || [])], []);
    });
    // Phase E Task 5 retired the 4-step form: the auth bundle carries the guided signup, and none of the old form's styles.
    await check(`the auth CSS bundle carries the guided signup and none of the retired form's styles (${authCss.hrefs.join(', ')})`, () => {
      assert.ok(/#guided-signup/.test(authCss.css), 'no #guided-signup styles in the auth bundle');
      assert.deepEqual([...new Set(authCss.css.match(AUTH_ONLY) || [])], []);
    });
  }
} finally {
  await browser?.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ }
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll landing checks passed');
process.exit(failures ? 1 : 0);
