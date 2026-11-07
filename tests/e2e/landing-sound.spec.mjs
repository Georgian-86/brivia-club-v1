// Landing music and smooth scroll (D-063, D-220), against `vite preview` of a fresh build:
// * the music starts at load when the browser allows sound, otherwise on the first real gesture (scrolling never can);
// * "Stop music" silences every layer that reaches the speakers (the soundtrack and the intro's cue) and "Play music"
//   resumes from the same point, never layering a second copy, however fast the button is pressed;
// * the label always matches what is heard (an interrupted or hidden page says "Play music");
// * a mute holds while moving between pages of the tab, a reload starts with music on again, and the position
//   carries across a visit to another page and back;
// * a missing soundtrack is retried a few times, not in a loop, and the button says so honestly;
// * an iPhone keeps the page in the playback audio session (silent switch); no console errors or warnings, including
//   under Chromium's real autoplay policy with no mocks; Lenis on a desktop pointer only, the 5-minute limit.
//   VITE_SUPABASE_URL=https://stub.supabase.local VITE_SUPABASE_ANON_KEY=stub npm run build
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/landing-sound.spec.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
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

// The browser's autoplay rule, made explicit: without a real gesture an AudioContext stays suspended and an unmuted
// media element refuses to play, unless the test says sound is allowed (allowSound; a real allow-policy browser is used for that further down).
// A time shift lets a test jump the page's clock (the 5-minute limit).
const INIT = ({ allowSound = false, skipIntro = true } = {}) => {
  try { if (skipIntro) sessionStorage.setItem('brivia-intro-seen', 'true'); } catch { /* none */ }
  window.__timeShift = 0;
  const realNow = performance.now.bind(performance);
  performance.now = () => realNow() + window.__timeShift;
  window.__gesture = allowSound;
  ['mousedown', 'keydown', 'touchend', 'click'].forEach((type) => window.addEventListener(type, (e) => { if (e.isTrusted && (type !== 'keydown' || e.key !== 'Escape')) window.__gesture = true; }, true));
  window.addEventListener('pointerup', (e) => { if (e.isTrusted && e.pointerType !== 'mouse') window.__gesture = true; }, true);
  const realPlay = HTMLMediaElement.prototype.play;
  window.__mediaPlays = [];
  window.__mediaEls = [];
  HTMLMediaElement.prototype.play = function play() {
    if (!this.muted && !window.__gesture) return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    window.__mediaPlays.push(this.currentSrc || this.src || 'video');
    if (!window.__mediaEls.includes(this)) window.__mediaEls.push(this);
    return realPlay.call(this);
  };
  const Real = window.AudioContext;
  window.__contexts = 0;
  window.AudioContext = class extends Real {
    constructor(...args) { super(...args); window.__contexts += 1; window.__ctx = this; if (!window.__gesture) Real.prototype.suspend.call(this).catch(() => {}); }
    resume() { return window.__gesture ? Real.prototype.resume.call(this) : Promise.resolve(); }
  };
  window.__interrupt = () => Real.prototype.suspend.call(window.__ctx); // what iOS does on a call or Siri
  // Every gain node wired straight to the speakers: the page's layers. After "Stop music" all must be silent.
  window.__outputs = [];
  const realConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function connect(target, ...rest) {
    if (target instanceof AudioDestinationNode && this instanceof GainNode) window.__outputs.push(this);
    return realConnect.call(this, target, ...rest);
  };
  // Soundtrack passes: started, still live, and the offset each one started from.
  window.__passes = { started: 0, live: 0, duration: 0, offsets: [] };
  const realSource = Real.prototype.createBufferSource;
  Real.prototype.createBufferSource = function createBufferSource() {
    const node = realSource.call(this);
    const realStart = node.start.bind(node);
    node.start = (...a) => {
      if (node.buffer && node.buffer.duration > 10) {
        window.__passes.started += 1; window.__passes.live += 1; window.__passes.duration = node.buffer.duration; window.__passes.offsets.push(a[1] || 0);
        node.addEventListener('ended', () => { window.__passes.live -= 1; });
      }
      return realStart(...a);
    };
    return node;
  };
};
const sound = (page) => page.evaluate(() => {
  const b = document.querySelector('[data-landing-sound]');
  return {
    state: b?.dataset.state, label: b?.getAttribute('aria-label'), text: b?.textContent.trim(), playing: b?.classList.contains('is-playing'),
    ready: b?.classList.contains('is-ready'), ctx: window.__ctx?.state || 'none', time: window.__ctx?.currentTime || 0,
    stored: sessionStorage.getItem('brivia-landing-sound'), legacy: localStorage.getItem('brivia-landing-sound'),
    passes: { ...window.__passes }, outputs: window.__outputs.map((g) => g.gain.value),
  };
});
const isPlaying = () => document.querySelector('[data-landing-sound]')?.dataset.state === 'playing';
const isStopped = () => document.querySelector('[data-landing-sound]')?.dataset.state === 'stopped';
const isArmed = () => document.querySelector('[data-landing-sound]')?.dataset.state === 'armed';
const waitFor = async (page, fn, arg, timeout = 5000) => page.waitForFunction(fn, arg, { timeout }).then(() => true).catch(() => false);
const watchConsole = (page) => {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const text = m.text();
    if (/was preloaded using link preload/.test(text)) return; // font preloads, unrelated to sound
    if (/supabase|stub\.supabase|Failed to load resource|ERR_NAME_NOT_RESOLVED|net::/i.test(text) && !/m4a|soundtrack/i.test(text)) return; // the stub backend
    problems.push(`${m.type()}: ${text}`);
  });
  return problems;
};

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
try {
  // Desktop, autoplay blocked: scroll does nothing, a click starts it, Stop / Play control every layer.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(INIT, {});
    const page = await context.newPage();
    const problems = watchConsole(page);
    await page.evaluate(() => localStorage.setItem('brivia-landing-sound', 'off')).catch(() => {});
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.setItem('brivia-landing-sound', 'off')); // a visitor muted under the old rule
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(700);
    let s = await sound(page);
    await check('1440: before any gesture the button shows music ON ("Music on", waiting for a tap), 44 px tall, inside the screen', async () => {
      assert.equal(s.ready, true); assert.equal(s.state, 'armed'); assert.equal(s.text, 'Music on'); assert.equal(s.playing, false);
      const box = await page.locator('[data-landing-sound]').boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44 && box.x + box.width <= 1440 && box.y + box.height <= 900, JSON.stringify(box));
    });
    await check('1440: the old forever-mute in localStorage is cleared (music is on by default)', () => assert.equal(s.legacy, null));
    await check('1440: no AudioContext is created before the browser allows sound (no console warning)', async () => assert.equal(await page.evaluate(() => window.__contexts), 0));
    await page.mouse.move(700, 450);
    for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, 120); await page.waitForTimeout(30); }
    await page.waitForTimeout(500);
    s = await sound(page);
    await check('1440: scrolling alone does not start the music (no browser allows it); the button stays "Music on"', () => assert.equal(s.state, 'armed'));
    await check('1440: Lenis smooth scroll is on (desktop pointer) and the page moved', async () => {
      const r = await page.evaluate(() => ({ lenis: document.documentElement.classList.contains('lenis'), smooth: document.documentElement.classList.contains('has-smooth-scroll'), y: scrollY }));
      assert.equal(r.lenis, true); assert.equal(r.smooth, true); assert.ok(r.y > 500, `scrollY ${r.y}`);
    });
    await page.mouse.click(700, 450);
    const started = await waitFor(page, isPlaying);
    const passed = await waitFor(page, () => window.__passes.started > 0);
    s = await sound(page);
    await check(`1440: the first click starts the soundtrack (${s.passes.duration.toFixed(1)} s) and the button says "Stop music"`, () => {
      assert.equal(started, true); assert.equal(passed, true); assert.equal(s.ctx, 'running');
      assert.equal(s.label, 'Stop music'); assert.equal(s.text, 'Stop music'); assert.equal(s.playing, true);
      assert.ok(s.passes.duration > 17 && s.passes.duration < 18.5, String(s.passes.duration));
    });
    await page.waitForTimeout(1500);
    await page.locator('[data-landing-sound]').click();
    await page.waitForTimeout(700);
    s = await sound(page);
    const stoppedAt = s.time;
    await check('1440: "Stop music" silences every layer, suspends the audio clock and says "Play music"', () => {
      assert.equal(s.state, 'stopped'); assert.equal(s.label, 'Play music'); assert.equal(s.ctx, 'suspended'); assert.equal(s.stored, 'off');
      assert.ok(s.outputs.length >= 2, `outputs ${s.outputs}`);
      assert.ok(s.outputs.every((v) => v < 0.01), `gains ${s.outputs}`);
    });
    const startedBefore = s.passes.started;
    await page.waitForTimeout(800);
    await page.locator('[data-landing-sound]').click();
    const resumed = await waitFor(page, isPlaying);
    await page.waitForTimeout(300);
    s = await sound(page);
    await check('1440: "Play music" resumes from the same point (no new pass, the clock picks up where it stopped)', () => {
      assert.equal(resumed, true); assert.equal(s.stored, 'on');
      assert.equal(s.passes.started, startedBefore);
      assert.ok(s.time - stoppedAt < 0.6, `stopped at ${stoppedAt}, now ${s.time}`);
    });
    for (let i = 0; i < 7; i += 1) { await page.locator('[data-landing-sound]').click(); await page.waitForTimeout(90); }
    await page.waitForTimeout(1300);
    s = await sound(page);
    await check(`1440: seven quick presses end on the right state with no layering (live passes ${s.passes.live})`, () => {
      assert.equal(s.state, 'stopped'); assert.equal(s.label, 'Play music'); assert.ok(s.passes.live <= 2, String(s.passes.live));
      assert.ok(s.outputs.every((v) => v < 0.01), `gains ${s.outputs}`);
    });
    await page.locator('[data-landing-sound]').click();
    await waitFor(page, isPlaying);
    // A hidden tab is silent; back on screen, it carries on.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(300);
    const hiddenCtx = (await sound(page)).ctx;
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    const back = await waitFor(page, () => window.__ctx.state === 'running');
    await check(`1440: a hidden tab suspends the music (${hiddenCtx}) and it resumes on return`, () => { assert.equal(hiddenCtx, 'suspended'); assert.equal(back, true); });
    // An interruption (iOS: a call, Siri) the page did not ask for: the label follows, the next gesture resumes.
    await page.evaluate(() => window.__interrupt());
    const honest = await waitFor(page, isArmed);
    await page.mouse.click(700, 300);
    const recovered = await waitFor(page, isPlaying);
    await check('1440: an outside interruption shows "Music on" (waiting for a tap) and the next click brings the music back', () => { assert.equal(honest, true); assert.equal(recovered, true); });
    const live = (await sound(page)).passes.live;
    await check(`1440: never more than one pass (plus a crossfade) at a time (live ${live})`, () => assert.ok(live <= 2, String(live)));
    await page.evaluate(() => { window.__timeShift = 5 * 60 * 1000 + 1000; });
    const ended = await waitFor(page, isStopped);
    await check('1440: the music fades itself out after 5 minutes (D-063)', () => assert.equal(ended, true));
    await page.locator('[data-landing-sound]').click();
    const replay = await waitFor(page, isPlaying);
    await check('1440: after the 5 minutes, "Play music" plays it again', () => assert.equal(replay, true));
    await page.locator('.menu-trigger').click();
    await page.waitForTimeout(800);
    const menu = await page.evaluate(() => { const st = getComputedStyle(document.querySelector('[data-landing-sound]')); return { lenis: document.documentElement.classList.contains('lenis-stopped'), opacity: Number(st.opacity), events: st.pointerEvents }; });
    await check('1440: the open menu stops smooth scroll and hides the sound button', () => { assert.equal(menu.lenis, true); assert.ok(menu.opacity < 0.01); assert.equal(menu.events, 'none'); });
    await check('1440: no console errors or warnings', () => assert.deepEqual(problems, []));
    await context.close();
  }
  // Moving between pages: a mute holds, a reload restores the default, and the position carries over.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(INIT, {});
    const page = await context.newPage();
    const problems = watchConsole(page);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.mouse.click(640, 400);
    await waitFor(page, () => window.__passes.started > 0);
    await page.waitForTimeout(3000);
    await page.goto(`${BASE}/auth.html`, { waitUntil: 'load' }); // runs script.js too: must leave the position alone
    await page.reload({ waitUntil: 'load' });
    await page.goto(`${BASE}/careers.html`, { waitUntil: 'load' });
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.mouse.click(640, 400);
    await waitFor(page, () => window.__passes.started > 0);
    let s = await sound(page);
    await check(`navigation: back on the landing the soundtrack picks up where it was (offset ${s.passes.offsets[0]} s), one copy`, () => {
      assert.ok(s.passes.offsets[0] > 2 && s.passes.offsets[0] < 8, String(s.passes.offsets));
      assert.equal(s.passes.started, 1); assert.equal(s.state, 'playing');
    });
    await page.locator('[data-landing-sound]').click();
    await page.waitForTimeout(300);
    await page.goto(`${BASE}/auth.html`, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' }); // reloading another page is not a reload of the landing
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.mouse.click(640, 400);
    await page.waitForTimeout(700);
    s = await sound(page);
    await check('navigation: a visitor who stopped the music is not surprised by it on the next page', () => { assert.equal(s.state, 'stopped'); assert.equal(s.ctx, 'none'); });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.mouse.click(640, 400);
    const on = await waitFor(page, isPlaying);
    s = await sound(page);
    await check('reload: the music is on again by default (first gesture starts it, from the top)', () => { assert.equal(on, true); assert.equal(s.stored, null); });
    await waitFor(page, () => window.__passes.started > 0);
    await check('reload: from the top of the track', async () => assert.equal((await sound(page)).passes.offsets[0], 0));
    await check('navigation: no console errors or warnings', () => assert.deepEqual(problems, []));
    await context.close();
  }
  // A missing soundtrack: a few spaced retries, never a request loop, and the button stays honest.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(INIT, {});
    let requests = 0;
    await context.route(/\.m4a(\?|$)/, (route) => { requests += 1; return route.fulfill({ status: 404, body: '' }); });
    const page = await context.newPage();
    page.on('pageerror', (e) => { failures += 1; console.log(`FAIL missing file: page error ${e.message}`); });
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.mouse.click(640, 400);
    await page.waitForTimeout(9000);
    const s = await sound(page);
    await check(`missing soundtrack: at most a few requests (${requests}) and the button offers "Play music" again`, () => { assert.ok(requests >= 1 && requests <= 4, String(requests)); assert.equal(s.label, 'Play music'); });
    await context.close();
  }
  // Phone (iPhone): native scrolling, a tap starts it, and the playback audio session is held while it plays.
  {
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    await context.addInitScript(INIT, {});
    const page = await context.newPage();
    const problems = watchConsole(page);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    const lenis = await page.evaluate(() => document.documentElement.classList.contains('lenis'));
    await check('iPhone: no Lenis on a phone (native momentum scrolling)', () => assert.equal(lenis, false));
    const shown = await sound(page);
    await check('iPhone: on opening, the button shows music ON ("Music on"), not "Play music"', () => { assert.equal(shown.state, 'armed'); assert.equal(shown.text, 'Music on'); });
    await page.touchscreen.tap(195, 500);
    const started = await waitFor(page, isPlaying);
    const media = await page.evaluate(() => ({ contexts: window.__contexts, loop: window.__mediaPlays.filter((src) => /hero-soundtrack-loop/.test(src)).length }));
    // D-223: every iPhone browser is WebKit, so the soundtrack is an <audio> (which is in the playback session by itself:
    // the silent switch does not mute it) and no AudioContext is made for the landing's music.
    await check(`iPhone: a tap starts the music as an <audio> loop, no Web Audio (${media.loop} plays, ${media.contexts} contexts)`, () => { assert.equal(started, true); assert.ok(media.loop >= 1); assert.equal(media.contexts, 0); });
    const box = await page.locator('[data-landing-sound]').boundingBox();
    const vp = page.viewportSize();
    await check('iPhone: the button is a 44 px target inside the screen', () => assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height, JSON.stringify(box)));
    await page.locator('[data-landing-sound]').tap();
    const off = await waitFor(page, isStopped);
    await page.locator('[data-landing-sound]').tap();
    const on = await waitFor(page, isPlaying);
    await check('iPhone: tapping the button stops and plays the music', () => { assert.equal(off, true); assert.equal(on, true); });
    await check('iPhone: no console errors or warnings', () => assert.deepEqual(problems, []));
    await context.close();
  }
  // iPhone, first touch on the button itself while it says "Music on": the music starts (it never turns it off).
  {
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    await context.addInitScript(INIT, {});
    const page = await context.newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    await page.locator('[data-landing-sound]').tap();
    const started = await waitFor(page, isPlaying);
    const s = await sound(page);
    await check('iPhone: tapping "Music on" first starts the music and the button becomes "Stop music"', () => { assert.equal(started, true); assert.equal(s.text, 'Stop music'); });
    await context.close();
  }
  // D-223: Safari on a Mac. The soundtrack and the intro's cue play through <audio> elements; no AudioContext at all.
  const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
  const media = (page) => page.evaluate(() => {
    const loop = window.__mediaEls.find((el) => /hero-soundtrack-loop/.test(el.currentSrc || el.src));
    const cue = window.__mediaEls.find((el) => /^blob:/.test(el.currentSrc || el.src));
    return {
      contexts: window.__contexts, loopPaused: loop ? loop.paused : null, loopTime: loop ? loop.currentTime : 0, loopVolume: loop ? loop.volume : null,
      loopLoops: loop ? loop.loop : null, cuePlayed: Boolean(cue), cuePaused: cue ? cue.paused : null,
    };
  });
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: SAFARI_UA });
    await context.addInitScript(INIT, {});
    const page = await context.newPage();
    const problems = watchConsole(page);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    let s = await sound(page);
    await check('Safari: before any gesture the button shows "Music on"', () => assert.equal(s.state, 'armed'));
    await page.mouse.click(700, 450);
    const started = await waitFor(page, isPlaying);
    await page.waitForTimeout(1600);
    let m = await media(page);
    await check(`Safari: a click plays the soundtrack as a looping <audio>, faded in (volume ${m.loopVolume?.toFixed(2)}), and no AudioContext is ever made`, () => {
      assert.equal(started, true); assert.equal(m.loopPaused, false); assert.equal(m.loopLoops, true); assert.equal(m.contexts, 0);
      assert.ok(m.loopVolume > 0.4 && m.loopVolume <= 1, String(m.loopVolume));
    });
    await page.locator('[data-landing-sound]').click();
    await page.waitForTimeout(700);
    s = await sound(page); m = await media(page);
    const stoppedAt = m.loopTime;
    await check('Safari: "Stop music" fades the soundtrack out and pauses it; the button says "Play music"', () => { assert.equal(s.state, 'stopped'); assert.equal(m.loopPaused, true); assert.equal(s.stored, 'off'); });
    await page.waitForTimeout(800);
    await page.locator('[data-landing-sound]').click();
    const resumed = await waitFor(page, isPlaying);
    m = await media(page);
    await check('Safari: "Play music" resumes from the same point, one element (no second copy)', async () => {
      assert.equal(resumed, true); assert.equal(m.loopPaused, false); assert.ok(m.loopTime - stoppedAt < 0.6, `${stoppedAt} -> ${m.loopTime}`);
      assert.equal(await page.evaluate(() => window.__mediaEls.filter((el) => /hero-soundtrack-loop/.test(el.currentSrc || el.src)).length), 1);
    });
    for (let i = 0; i < 7; i += 1) { await page.locator('[data-landing-sound]').click(); await page.waitForTimeout(90); }
    await page.waitForTimeout(900);
    s = await sound(page); m = await media(page);
    await check('Safari: seven quick presses end stopped and paused', () => { assert.equal(s.state, 'stopped'); assert.equal(m.loopPaused, true); });
    await page.locator('[data-landing-sound]').click();
    await waitFor(page, isPlaying);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(300);
    const hiddenPaused = (await media(page)).loopPaused;
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(300);
    m = await media(page); s = await sound(page);
    await check('Safari: a hidden tab pauses the music and it plays again on return', () => { assert.equal(hiddenPaused, true); assert.equal(m.loopPaused, false); assert.equal(s.state, 'playing'); });
    // The system pausing it (a call, another app taking the audio): the label follows, the next click resumes.
    await page.evaluate(() => window.__mediaEls.find((el) => /hero-soundtrack-loop/.test(el.currentSrc || el.src)).pause());
    const honest = await waitFor(page, isArmed);
    await page.mouse.click(700, 300);
    const recovered = await waitFor(page, isPlaying);
    await check('Safari: an outside pause shows "Music on" and the next click brings the music back', () => { assert.equal(honest, true); assert.equal(recovered, true); });
    await page.evaluate(() => { window.__timeShift = 5 * 60 * 1000 + 1000; });
    const ended = await waitFor(page, isStopped);
    await page.waitForTimeout(3000);
    await check('Safari: the music fades itself out after 5 minutes', async () => { assert.equal(ended, true); assert.equal((await media(page)).loopPaused, true); });
    await check('Safari: no console errors or warnings', () => assert.deepEqual(problems, []));
    await context.close();
  }
  // Safari, a click during the intro: the cue plays (a pre-rendered WAV) and the soundtrack comes in under its tail.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: SAFARI_UA });
    await context.addInitScript(INIT, { skipIntro: false });
    const page = await context.newPage();
    const problems = watchConsole(page);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.mouse.click(700, 450);
    const cue = await waitFor(page, () => window.__mediaEls.some((el) => /^blob:/.test(el.currentSrc || el.src) && !el.paused), null, 3000);
    const early = await media(page);
    const later = await waitFor(page, () => window.__mediaEls.some((el) => /hero-soundtrack-loop/.test(el.currentSrc || el.src) && !el.paused), null, 8000);
    await check(`Safari intro: a click plays the cue, the soundtrack follows (loop paused at first: ${early.loopPaused})`, () => { assert.equal(cue, true); assert.equal(later, true); assert.equal((early.loopPaused ?? true), true); });
    await waitFor(page, () => document.querySelector('[data-landing-sound]')?.classList.contains('is-ready'), null, 8000);
    await page.locator('[data-landing-sound]').click();
    await page.waitForTimeout(700);
    const m = await media(page);
    await check('Safari intro: "Stop music" silences the soundtrack and the cue', () => { assert.equal(m.loopPaused, true); assert.ok(m.cuePaused !== false); });
    await check('Safari intro: no console errors or warnings', () => assert.deepEqual(problems, []));
    await context.close();
  }
  // Reduced motion: no Lenis.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await context.addInitScript(INIT, {});
    const page = await context.newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    const lenis = await page.evaluate(() => document.documentElement.classList.contains('lenis'));
    await check('reduced motion: plain scrolling (no Lenis)', () => assert.equal(lenis, false));
    await context.close();
  }
} finally { await browser.close(); }

// A browser that allows sound (Chromium's no-gesture policy, as for a site the visitor lets play): it plays at load
// with no gesture, and the intro's cue joins the same control.
const allowed = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  {
    const context = await allowed.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(INIT, { allowSound: true, skipIntro: false });
    const page = await context.newPage();
    const problems = watchConsole(page);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    const running = await waitFor(page, () => window.__ctx?.state === 'running');
    const cue = await page.evaluate(() => window.__outputs.length);
    await check('autoplay allowed: the music and the intro cue start at load, with no gesture', () => { assert.equal(running, true); assert.ok(cue >= 2); });
    await waitFor(page, () => document.querySelector('[data-landing-sound]')?.classList.contains('is-ready'), null, 8000);
    await waitFor(page, isPlaying);
    await check('autoplay allowed: the button says "Stop music" once the intro has gone', async () => assert.equal((await sound(page)).label, 'Stop music'));
    await page.locator('[data-landing-sound]').click();
    await page.waitForTimeout(600);
    const s = await sound(page);
    await check('autoplay allowed: "Stop music" silences the soundtrack and the cue', () => { assert.equal(s.state, 'stopped'); assert.ok(s.outputs.every((v) => v < 0.01), String(s.outputs)); });
    await check('autoplay allowed: no console errors or warnings', () => assert.deepEqual(problems, []));
    await context.close();
  }
} finally { await allowed.close(); }

// Chromium's own autoplay policy, nothing mocked: blocked at load without a console warning, a click starts it.
const real = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--autoplay-policy=user-gesture-required'] });
try {
  const context = await real.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => { try { sessionStorage.setItem('brivia-intro-seen', 'true'); } catch { /* none */ } });
  const page = await context.newPage();
  const problems = watchConsole(page);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const before = await page.evaluate(isArmed);
  await page.mouse.click(700, 450);
  const started = await waitFor(page, isPlaying);
  await page.waitForTimeout(1500);
  await page.locator('[data-landing-sound]').click();
  const off = await waitFor(page, isStopped);
  await page.locator('[data-landing-sound]').click();
  const on = await waitFor(page, isPlaying);
  await check('real autoplay policy: silent at load with the button showing "Music on",  a click plays, the button stops and plays it', () => { assert.equal(before, true); assert.equal(started, true); assert.equal(off, true); assert.equal(on, true); });
  await check('real autoplay policy: no console errors or warnings (no refused AudioContext)', () => assert.deepEqual(problems, []));
  await context.close();
} finally { await real.close(); stop(); }
console.log(failures ? `${failures} landing sound check(s) failed` : 'All landing sound checks passed');
process.exit(failures ? 1 : 0);
