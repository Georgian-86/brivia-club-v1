// Landing sound and smooth scroll (D-063), against `vite preview` of a fresh build:
// * scrolling alone never starts the music (no browser allows it), the first real gesture does, on desktop (click)
//   and on a phone (a tap: touchend / pointerup, the old one-shot touchstart never could);
// * the music is the hero video's own soundtrack (D-092), looped with a crossfade, never layered;
// * the sound button turns it off and on, the choice survives a reload, and the music stops itself after 5 minutes;
// * Lenis smooth scroll runs on a desktop pointer, not on a phone, not with reduced motion; the menu stops it.
//   VITE_SUPABASE_URL=https://stub.supabase.local VITE_SUPABASE_ANON_KEY=stub npm run build
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/landing-sound.spec.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT || 5179);
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`PASS ${name}`); } catch (error) { failures += 1; console.log(`FAIL ${name}\n     ${String(error.message || error).split('\n').join('\n     ')}`); }
};

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: repoRoot, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-preview.pid, 'SIGTERM'); } catch { /* gone */ } };
for (let i = 0; i < 80; i += 1) { try { if ((await fetch(`${BASE}/`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }

// The browser's autoplay rule, made explicit: an AudioContext may only run after a real gesture. A time shift lets a
// test jump the page's clock forward (the 5-minute limit) without waiting 5 minutes.
const INIT = () => {
  try { localStorage.setItem('brivia-intro-seen', 'true'); } catch { /* none */ }
  window.__timeShift = 0;
  const realNow = performance.now.bind(performance);
  performance.now = () => realNow() + window.__timeShift;
  window.__gesture = false;
  ['mousedown', 'keydown', 'touchend', 'click'].forEach((type) => window.addEventListener(type, (e) => { if (e.isTrusted && (type !== 'keydown' || e.key !== 'Escape')) window.__gesture = true; }, true));
  window.addEventListener('pointerup', (e) => { if (e.isTrusted && e.pointerType !== 'mouse') window.__gesture = true; }, true);
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(...args) { super(...args); window.__ctx = this; this.__suspend(); }
    __suspend() { Real.prototype.suspend.call(this).catch(() => {}); }
    resume() { return window.__gesture ? Real.prototype.resume.call(this) : Promise.resolve(); }
  };
  // D-092: count the soundtrack passes that are queued and still live (started, not yet ended or stopped early).
  window.__passes = { started: 0, live: 0, duration: 0 };
  const realSource = Real.prototype.createBufferSource;
  Real.prototype.createBufferSource = function createBufferSource() {
    const node = realSource.call(this);
    const realStart = node.start.bind(node);
    node.start = (...a) => { window.__passes.started += 1; window.__passes.live += 1; window.__passes.duration = node.buffer?.duration || 0; node.addEventListener('ended', () => { window.__passes.live -= 1; }); return realStart(...a); };
    return node;
  };
};
const sound = (page) => page.evaluate(() => {
  const b = document.querySelector('[data-landing-sound]');
  return { pressed: b?.getAttribute('aria-pressed'), label: b?.getAttribute('aria-label'), ready: b?.classList.contains('is-ready'), ctx: window.__ctx?.state || 'none', stored: localStorage.getItem('brivia-landing-sound') };
});
const waitFor = async (page, fn, arg, timeout = 4000) => page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
try {
  // Desktop: scroll does nothing, a click starts it, the button mutes it and the choice survives a reload.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(INIT);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    let s = await sound(page);
    await check('1440: the sound button is on screen, 44 px, labelled, and not playing before any gesture', async () => {
      assert.equal(s.ready, true);
      assert.equal(s.pressed, 'false');
      assert.equal(s.label, 'Play sound');
      const box = await page.locator('[data-landing-sound]').boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, JSON.stringify(box));
      assert.ok(box.x + box.width <= 1440 && box.y + box.height <= 900, 'inside the viewport');
    });
    await page.mouse.move(700, 450);
    for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, 120); await page.waitForTimeout(30); }
    await page.waitForTimeout(500);
    s = await sound(page);
    await check('1440: scrolling alone does not start the music (no browser allows it)', () => assert.equal(s.pressed, 'false'));
    await check('1440: Lenis smooth scroll is on (desktop pointer) and the page moved', async () => {
      const r = await page.evaluate(() => ({ lenis: document.documentElement.classList.contains('lenis'), smooth: document.documentElement.classList.contains('has-smooth-scroll'), y: scrollY }));
      assert.equal(r.lenis, true); assert.equal(r.smooth, true); assert.ok(r.y > 500, `scrollY ${r.y}`);
    });
    await page.mouse.click(700, 450);
    const started = await waitFor(page, () => document.querySelector('[data-landing-sound]')?.getAttribute('aria-pressed') === 'true');
    s = await sound(page);
    await check(`1440: the first click starts the music at once (pressed ${s.pressed}, context ${s.ctx})`, () => { assert.equal(started, true); assert.equal(s.ctx, 'running'); });
    const playing = await waitFor(page, () => window.__passes?.started > 0);
    const passes = await page.evaluate(() => window.__passes);
    await check(`1440: it plays the hero video's own soundtrack (${passes.duration.toFixed(1)} s), not a synthesized chord`, () => {
      assert.equal(playing, true);
      assert.ok(passes.duration > 17 && passes.duration < 18.5, String(passes.duration));
    });
    await page.locator('[data-landing-sound]').click();
    await page.waitForTimeout(200);
    s = await sound(page);
    await check('1440: the button mutes it and remembers', () => { assert.equal(s.pressed, 'false'); assert.equal(s.label, 'Play sound'); assert.equal(s.stored, 'off'); });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.mouse.click(700, 450);
    await page.waitForTimeout(500);
    s = await sound(page);
    await check('1440: after a reload a muted visitor stays muted, even after a click', () => assert.equal(s.pressed, 'false'));
    await page.locator('[data-landing-sound]').click();
    const back = await waitFor(page, () => document.querySelector('[data-landing-sound]')?.getAttribute('aria-pressed') === 'true');
    s = await sound(page);
    await check('1440: the button turns it back on', () => { assert.equal(back, true); assert.equal(s.stored, 'on'); });
    await page.locator('[data-landing-sound]').click(); await page.waitForTimeout(150);
    await page.locator('[data-landing-sound]').click(); await page.waitForTimeout(1200);
    const layered = await page.evaluate(() => window.__passes.live);
    await check(`1440: off and on again never layers a second copy (live passes ${layered})`, () => assert.ok(layered <= 1, String(layered)));
    await page.evaluate(() => { window.__timeShift = 5 * 60 * 1000 + 1000; });
    const ended = await waitFor(page, () => document.querySelector('[data-landing-sound]')?.getAttribute('aria-pressed') === 'false');
    await check('1440: the music stops itself after 5 minutes', () => assert.equal(ended, true));
    await page.locator('[data-landing-sound]').click();
    const replay = await waitFor(page, () => document.querySelector('[data-landing-sound]')?.getAttribute('aria-pressed') === 'true');
    await check('1440: after the 5 minutes, the button plays it again', () => assert.equal(replay, true));
    await page.locator('.menu-trigger').click();
    await page.waitForTimeout(800); // the button's 0.5 s fade-out
    const stopped = await page.evaluate(() => document.documentElement.classList.contains('lenis-stopped'));
    const hidden = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('[data-landing-sound]')); return { opacity: Number(s.opacity), events: s.pointerEvents }; });
    await check('1440: the open menu stops smooth scroll and hides the sound button', () => { assert.equal(stopped, true); assert.ok(hidden.opacity < 0.01, JSON.stringify(hidden)); assert.equal(hidden.events, 'none'); });
    await check('1440: no page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }
  // Phone: native scrolling (no Lenis), and a tap starts the music (the old touchstart one-shot never could).
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(INIT);
    const page = await context.newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    const lenis = await page.evaluate(() => document.documentElement.classList.contains('lenis'));
    await check('390 touch: no Lenis on a phone (native momentum scrolling)', () => assert.equal(lenis, false));
    await page.touchscreen.tap(195, 500);
    const started = await waitFor(page, () => document.querySelector('[data-landing-sound]')?.getAttribute('aria-pressed') === 'true');
    const s = await sound(page);
    await check(`390 touch: a tap starts the music (pressed ${s.pressed}, context ${s.ctx})`, () => assert.equal(started, true));
    const box = await page.locator('[data-landing-sound]').boundingBox();
    await check('390 touch: the button is a 44 px target inside the screen', () => assert.ok(box && box.width >= 44 && box.x + box.width <= 390 && box.y + box.height <= 844, JSON.stringify(box)));
    await context.close();
  }
  // Reduced motion: no Lenis.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(INIT);
    const page = await context.newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    const lenis = await page.evaluate(() => document.documentElement.classList.contains('lenis'));
    await check('reduced motion: plain scrolling (no Lenis)', () => assert.equal(lenis, false));
    await context.close();
  }
} finally { await browser.close(); stop(); }
console.log(failures ? `${failures} landing sound check(s) failed` : 'All landing sound checks passed');
process.exit(failures ? 1 : 0);
