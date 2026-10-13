// Phase E, Task 3: the guided signup shell and the account screens (Welcome, Email, Code, Google), against a stubbed
// Supabase. Never touches a real Supabase project. Playwright is NOT a repo dependency; see tests/e2e/README.md.
//
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/signup.spec.mjs
//
// One command runs three Vite servers in turn on the same port (E2E_PORT || 5193), one per VITE_SIGNUP_METHODS value
// ('google,email', 'google', ''), because Vite reads import.meta.env at server start.
// Asserts (Review Focus "code by autofill or paste" and "Back after verification"):
// * Welcome: Continue with Google and Continue with email, no step label; one h2 and one primary action per screen at
//   375 and 1440 px; Enter submits the email screen; the code request POSTs that email with create_user true;
// * Code: six boxes (autocomplete="one-time-code" on the first, inputmode="numeric" on all); typing six digits or
//   pasting "123 456" verifies by itself; a wrong code shows the copy and keeps focus in the boxes; an expired code
//   sends a new one; Resend waits 60 s (fake clock) and a 429 shows the rate-limit copy;
// * after verify: "Step 3 of 6" on 18+; Back (and browser Back) goes to Welcome with "Signed in as …", never to Code;
// * the switch: 'google' hides the email option; '' shows "Signups open soon" and Log in;
// * phone: the primary button stays above a simulated 300 px keyboard (visualViewport); reduced motion: no transform;
// * axe (full rule set) clean and text >= 12 px in Instrument Sans / Bodoni Moda on every screen.
// E2E_SCREENSHOTS=<dir> saves every screen at 375 and 1440 px.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { axeViolations, textAudit, TYPE_FAMILIES } from './a11y.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT || 5193);
const ORIGIN = 'https://stub.supabase.local';
const BASE = `http://127.0.0.1:${PORT}`;
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.E2E_SCREENSHOTS || '';

const ME = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'new@test.brivia.club';
const GOOD = '123456';
const EXPIRED = '999999';
const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const accessToken = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: ME, role: 'authenticated', exp, aud: 'authenticated' })}.sig`;
const user = { id: ME, aud: 'authenticated', role: 'authenticated', email: EMAIL, user_metadata: {}, app_metadata: { provider: 'email' }, created_at: new Date().toISOString() };
const session = { access_token: accessToken, refresh_token: 'stub-refresh', token_type: 'bearer', expires_in: 86400, expires_at: exp, user };

const WRONG_COPY = "That code didn't work. Check it, or send a new one.";
const EXPIRED_COPY = "That code has expired. We've sent you a new one.";
const RATE_COPY = "We can't send the confirmation email right now: too many sign-ups at once. Your account was not created. Please try again in about an hour.";

const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };

// Stubbed Supabase for one context. opts.otpStatus: statuses to answer the next /otp POSTs with (429), in order.
const stubContext = async (context, opts = {}) => {
  const otpStatus = [...(opts.otpStatus || [])];
  const calls = [];
  await context.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const p = url.pathname;
    const body = request.postData() || '';
    calls.push({ method, path: p, url: request.url(), body });
    const headers = { 'access-control-allow-origin': '*' };
    const json = (status, payload) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload), headers });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (p === '/auth/v1/otp') {
      if (otpStatus.shift() === 429) return json(429, { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' });
      return json(200, {});
    }
    if (p === '/auth/v1/verify') {
      const token = JSON.parse(body || '{}').token;
      if (token === GOOD) return json(200, session);
      if (token === EXPIRED) return json(403, { code: 'otp_expired', error_code: 'otp_expired', msg: 'Token has expired', message: 'Token has expired' });
      return json(403, { code: 'otp_expired', error_code: 'otp_expired', msg: 'Token has expired or is invalid', message: 'Token has expired or is invalid' });
    }
    if (p === '/auth/v1/authorize') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>google</title><p id="stub-google">google</p>' });
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers });
    if (p === '/auth/v1/user') return json(200, user);
    if (p.startsWith('/auth/v1/')) return json(200, session);
    const wantsObject = (request.headers().accept || '').includes('vnd.pgrst.object');
    if (p === '/rest/v1/profiles') {
      const row = { id: ME, name: 'New Member', email: EMAIL, adult_declared_at: null };
      return json(200, wantsObject ? row : [row]);
    }
    if (p === '/rest/v1/rpc/my_onboarding_status') return json(200, [{ interests: 0, points: 0, has_cell: false, place_label: null, completed: false }]);
    if (p.startsWith('/rest/v1/')) return json(200, []);
    return json(200, {});
  });
  await context.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith(ORIGIN), (route) => route.abort());
  await context.routeWebSocket(/stub\.supabase\.local/, (ws) => ws.close());
  await context.route(`${BASE}/app.html*`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title><p id="stub-app">app</p>' }));
  // A controllable visualViewport: window.__kb is the simulated on-screen keyboard height in px.
  await context.addInitScript(() => {
    const target = new EventTarget();
    window.__kb = 0;
    const vv = {
      get height() { return window.innerHeight - window.__kb; },
      get width() { return window.innerWidth; },
      offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
  });
  const posts = (p) => calls.filter((c) => c.method === 'POST' && c.path === p);
  return { calls, posts };
};

const newPage = async (context) => {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  return { page, errors };
};

const SETTLE = 450;
const title = (page) => page.locator('#signup-screen-title').textContent();
const waitTitle = async (page, text) => {
  await page.waitForFunction((t) => document.querySelector('#signup-screen-title')?.textContent.trim() === t, text, { timeout: 8000 });
  await page.waitForTimeout(SETTLE);
};
const stepText = (page) => page.evaluate(() => {
  const el = document.querySelector('#guided-signup [data-signup-step]');
  return el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' ? el.textContent.trim() : '';
});
const isVisible = async (page, selector) => {
  const loc = page.locator(selector);
  for (let i = 0; i < await loc.count(); i += 1) if (await loc.nth(i).isVisible()) return true;
  return false;
};
const buttonByText = (page, text) => page.locator('#guided-signup button:visible', { hasText: text });
// One question per screen: one visible h2 (outside aria-hidden brand art) and one visible primary action.
const oneQuestion = (page) => page.evaluate(() => {
  const seen = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden],[aria-hidden="true"],[inert]');
  const h2 = [...document.querySelectorAll('#auth-modal h1, #auth-modal h2')].filter(seen).map((el) => el.textContent.trim());
  const primary = [...document.querySelectorAll('#guided-signup .gs-primary')].filter(seen).map((el) => el.textContent.trim());
  return { h2, primary };
});
const otpValues = (page) => page.$$eval('#guided-signup .gs-otp input', (els) => els.map((el) => el.value).join(''));
const pasteInto = (page, text) => page.evaluate((t) => {
  const dt = new DataTransfer();
  dt.setData('text/plain', t);
  document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, text);

const a11yScreen = async (page, tag) => {
  const axe = await axeViolations(page, { include: '#guided-signup', decorative: ['.auth-shell::before'] });
  check(`${tag}: axe has no violations (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
  const { small, family } = await textAudit(page, { root: '#guided-signup', families: TYPE_FAMILIES });
  check(`${tag}: visible text is at least 12 px (${small.join(' | ')})`, () => assert.deepEqual(small, []));
  check(`${tag}: text is Bodoni Moda or Instrument Sans (${[...new Set(family)].join(' | ')})`, () => assert.deepEqual(family, []));
  const q = await oneQuestion(page);
  check(`${tag}: exactly one heading and one primary action (${JSON.stringify(q)})`, () => { assert.equal(q.h2.length, 1); assert.equal(q.primary.length, 1); });
  const focus = await page.evaluate(() => {
    const el = document.querySelector('#signup-screen-title');
    return { focused: document.activeElement === el, ring: el ? getComputedStyle(el).outlineStyle !== 'none' && parseFloat(getComputedStyle(el).outlineWidth) > 0 : null };
  });
  if (focus.focused) check(`${tag}: the focused heading shows no ring`, () => assert.equal(focus.ring, false));
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(`${tag}: no sideways scroll`, () => assert.ok(sideways));
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };

const openGuided = async (page) => {
  await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#guided-signup:not([hidden])', { timeout: 15000 });
  await waitTitle(page, 'Find your people.');
};
const toCode = async (page) => {
  await buttonByText(page, 'Continue with email').click();
  await waitTitle(page, "What's your email?");
  await page.locator('#signup-email').fill(EMAIL);
  await page.locator('#signup-email').press('Enter');
  await waitTitle(page, 'Enter the code');
};

const startVite = (methods) => spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: repoRoot,
  env: { ...process.env, VITE_SUPABASE_URL: ORIGIN, VITE_SUPABASE_ANON_KEY: 'stub-anon-key', VITE_SIGNUP_METHODS: methods },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
const waitForServer = async () => {
  for (let i = 0; i < 100; i += 1) {
    try { const res = await fetch(`${BASE}/auth.html`); if (res.ok) return; } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('vite did not start');
};
const stopVite = async (vite) => {
  const gone = new Promise((resolve) => vite.once('exit', resolve));
  try { process.kill(-vite.pid, 'SIGTERM'); } catch { return; }
  await Promise.race([gone, new Promise((resolve) => setTimeout(resolve, 3000))]);
  for (let i = 0; i < 25; i += 1) {
    try { await fetch(`${BASE}/auth.html`); } catch { return; }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
};
const withServer = async (methods, fn) => {
  const vite = startVite(methods);
  try { await waitForServer(); await fn(); } finally { await stopVite(vite); }
};

let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });

  await withServer('google,email', async () => {
    // 1. The email path at both widths: Welcome, Email, Code, 18+, Back to Welcome signed in.
    for (const w of [1440, 375]) {
      const context = await browser.newContext({ viewport: { width: w, height: w === 375 ? 812 : 900 } });
      const stub = await stubContext(context);
      const { page, errors } = await newPage(context);
      await openGuided(page);
      const google = await isVisible(page, '#guided-signup button:has-text("Continue with Google")');
      const email = await isVisible(page, '#guided-signup button:has-text("Continue with email")');
      const step0 = await stepText(page);
      check(`${w}: Welcome shows Continue with Google and Continue with email, and no step label (step "${step0}")`, () => { assert.ok(google); assert.ok(email); assert.equal(step0, ''); });
      const body0 = await page.locator('#guided-signup').textContent();
      check(`${w}: Welcome copy and "Already a member? Log in"`, () => { assert.match(body0, /Join in a minute\. One question at a time\./); assert.match(body0, /Already a member\?\s*Log in/); });
      const backHidden = !(await isVisible(page, '#guided-signup [data-signup-back]'));
      check(`${w}: no Back on Welcome`, () => assert.ok(backHidden));
      await a11yScreen(page, `${w} welcome`);
      await shot(page, `signup-${w}-welcome.png`);

      await buttonByText(page, 'Continue with email').click();
      await waitTitle(page, "What's your email?");
      const step1 = await stepText(page);
      const focused1 = await page.evaluate(() => document.activeElement?.id);
      check(`${w}: Email shows "Step 1 of 6" and focus moves to the heading (${step1}, ${focused1})`, () => { assert.equal(step1, 'Step 1 of 6'); assert.equal(focused1, 'signup-screen-title'); });
      const helper = await page.locator('#guided-signup').textContent();
      check(`${w}: Email helper copy`, () => assert.match(helper, /We'll send you a 6-digit code\. No password needed\./));
      const emailField = await page.locator('#signup-email').evaluate((el) => ({ type: el.type, ac: el.autocomplete, size: parseFloat(getComputedStyle(el).fontSize), h: el.getBoundingClientRect().height }));
      check(`${w}: the email field is type=email, autocomplete=email, >= 16 px text and 44 px tall (${JSON.stringify(emailField)})`, () => { assert.equal(emailField.type, 'email'); assert.equal(emailField.ac, 'email'); assert.ok(emailField.size >= 16); assert.ok(emailField.h >= 44); });
      await a11yScreen(page, `${w} email`);
      await shot(page, `signup-${w}-email.png`);
      if (w === 375) {
        await page.locator('#signup-email').focus();
        await page.evaluate(() => { window.__kb = 300; window.visualViewport.dispatchEvent(new Event('resize')); });
        await page.waitForTimeout(200);
        const kb = await page.locator('#guided-signup .gs-primary').evaluate((el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), limit: window.innerHeight - 300 }; });
        check(`375: the primary button stays visible above a 300 px keyboard (${JSON.stringify(kb)})`, () => { assert.ok(kb.bottom <= kb.limit, 'under the keyboard'); assert.ok(kb.top >= 0, 'above the screen'); });
        await shot(page, 'signup-375-email-keyboard.png');
        await page.evaluate(() => { window.__kb = 0; window.visualViewport.dispatchEvent(new Event('resize')); });
      }
      await page.locator('#signup-email').fill('not-an-email');
      await page.locator('#signup-email').press('Enter');
      await page.waitForTimeout(200);
      check(`${w}: an invalid email sends nothing`, () => assert.equal(stub.posts('/auth/v1/otp').length, 0));
      await page.locator('#signup-email').fill(EMAIL);
      await page.locator('#signup-email').press('Enter');
      await waitTitle(page, 'Enter the code');
      const otpPost = stub.posts('/auth/v1/otp').map((c) => JSON.parse(c.body || '{}'));
      check(`${w}: Enter submits the email screen and the code request POSTs that email with create_user (${JSON.stringify(otpPost)})`, () => { assert.equal(otpPost.length, 1); assert.equal(otpPost[0].email, EMAIL); assert.equal(otpPost[0].create_user, true); });
      const codeText = await page.locator('#guided-signup').textContent();
      const wrongEmail = await isVisible(page, '#guided-signup button:has-text("Wrong email?")');
      check(`${w}: the code screen says "We sent a 6-digit code to ${EMAIL}." with "Wrong email?"`, () => { assert.ok(codeText.includes(`We sent a 6-digit code to ${EMAIL}.`)); assert.ok(wrongEmail); });
      const step2 = await stepText(page);
      check(`${w}: Code shows "Step 2 of 6" (${step2})`, () => assert.equal(step2, 'Step 2 of 6'));
      const boxes = await page.$$eval('#guided-signup .gs-otp input', (els) => els.map((el) => ({ ac: el.getAttribute('autocomplete'), im: el.inputMode, size: parseFloat(getComputedStyle(el).fontSize), w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, label: el.getAttribute('aria-label') })));
      check(`${w}: six boxes, the first autocomplete="one-time-code", all inputmode="numeric", >= 44 px and 16 px (${JSON.stringify(boxes[0])})`, () => {
        assert.equal(boxes.length, 6);
        assert.equal(boxes[0].ac, 'one-time-code');
        for (const b of boxes) { assert.equal(b.im, 'numeric'); assert.ok(b.size >= 16); assert.ok(b.w >= 44 && b.h >= 44, JSON.stringify(b)); assert.ok(b.label); }
      });
      const resend = await page.locator('#guided-signup [data-signup-resend]').evaluate((el) => ({ disabled: el.disabled, text: el.textContent.trim() }));
      check(`${w}: Resend is disabled with a countdown (${JSON.stringify(resend)})`, () => { assert.equal(resend.disabled, true); assert.match(resend.text, /^Resend in [01]:\d\d$/); });
      await a11yScreen(page, `${w} code`);
      await shot(page, `signup-${w}-code.png`);

      await page.waitForTimeout(1100);
      const ticking = await page.locator('#guided-signup [data-signup-resend]').textContent();
      check(`${w}: the Resend countdown ticks in real time (${ticking.trim()})`, () => assert.match(ticking.trim(), /^Resend in 0:5\d$/));
      // Wrong code, typed: the copy shows and focus stays in the boxes.
      await page.locator('#guided-signup .gs-otp input').first().focus();
      await page.keyboard.type('111111');
      await page.waitForFunction((t) => document.querySelector('#guided-signup')?.textContent.includes(t), WRONG_COPY, { timeout: 5000 }).catch(() => {});
      const wrong = await page.evaluate((t) => ({ shown: document.querySelector('#guided-signup').textContent.includes(t), inBoxes: Boolean(document.activeElement?.closest('.gs-otp')), title: document.querySelector('#signup-screen-title')?.textContent }), WRONG_COPY);
      const verify1 = stub.posts('/auth/v1/verify').map((c) => JSON.parse(c.body || '{}'));
      check(`${w}: typing 6 digits verifies automatically (${JSON.stringify(verify1)})`, () => { assert.equal(verify1.length, 1); assert.equal(verify1[0].token, '111111'); assert.equal(verify1[0].email, EMAIL); assert.equal(verify1[0].type, 'email'); });
      check(`${w}: a wrong code shows "${WRONG_COPY}" and keeps focus in the boxes (${JSON.stringify(wrong)})`, () => { assert.ok(wrong.shown); assert.ok(wrong.inBoxes); assert.equal(wrong.title, 'Enter the code'); });
      await shot(page, `signup-${w}-code-wrong.png`);
      await a11yScreen(page, `${w} code wrong`);

      // Typing over a filled box replaces its digit.
      await page.locator('#guided-signup .gs-otp input').nth(2).focus();
      await page.keyboard.type('7');
      const over = await otpValues(page);
      check(`${w}: typing over a filled box replaces it (${over})`, () => assert.equal(over, '117111'));
      await page.waitForTimeout(150);
      check(`${w}: a fix in the middle of a full code waits for Verify (${stub.posts('/auth/v1/verify').length} verify POSTs)`, () => assert.equal(stub.posts('/auth/v1/verify').length, 1));
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#guided-signup .gs-otp')?.getAttribute('aria-busy') === 'false' && !document.querySelector('#guided-signup .gs-otp input').disabled, null, { timeout: 5000 });
      await page.waitForTimeout(150);
      const retried = stub.posts('/auth/v1/verify').map((c) => JSON.parse(c.body || '{}').token);
      check(`${w}: Enter in the boxes verifies the fixed code (${retried.join(',')})`, () => assert.deepEqual(retried, ['111111', '117111']));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      check(`${w}: the code that just failed is not sent again`, () => assert.equal(stub.posts('/auth/v1/verify').length, 2));
      if (w === 375) {
        await page.locator('#guided-signup .gs-otp input').first().focus();
        await pasteInto(page, '123 456');
      } else {
        await page.locator('#guided-signup .gs-otp input').first().focus();
        await page.keyboard.type(GOOD);
      }
      await waitTitle(page, 'Are you 18 or older?');
      const verify2 = stub.posts('/auth/v1/verify').map((c) => JSON.parse(c.body || '{}').token);
      check(`${w}: ${w === 375 ? 'pasting "123 456" fills all 6 boxes and verifies' : 'typing the right code verifies'} (${verify2.join(',')})`, () => assert.equal(verify2.at(-1), GOOD));
      const step3 = await stepText(page);
      check(`${w}: after verify the 18+ screen shows "Step 3 of 6" (${step3})`, () => assert.equal(step3, 'Step 3 of 6'));
      await shot(page, `signup-${w}-adult.png`);

      await page.locator('#guided-signup [data-signup-back]').click();
      await waitTitle(page, 'Find your people.');
      const signedIn = await page.locator('#guided-signup').textContent();
      const methodsGone = !(await isVisible(page, '#guided-signup button:has-text("Continue with email")'));
      check(`${w}: Back from 18+ goes to Welcome with "Signed in as ${EMAIL}", never to Code`, () => { assert.ok(signedIn.includes(`Signed in as ${EMAIL}`)); assert.ok(methodsGone); assert.ok(!signedIn.includes('Enter the code')); });
      await a11yScreen(page, `${w} welcome signed in`);
      await shot(page, `signup-${w}-welcome-signed-in.png`);
      await buttonByText(page, 'Continue').first().click();
      await waitTitle(page, 'Are you 18 or older?');
      check(`${w}: Continue resumes at 18+`, () => assert.ok(true));
      // Browser Back walks history: through 18+ and Welcome entries, but never shows Email or Code again.
      const seenTitles = [];
      for (let i = 0; i < 4; i += 1) {
        await page.goBack({ waitUntil: 'commit' }).catch(() => {});
        await page.waitForTimeout(SETTLE);
        seenTitles.push(await page.locator('#signup-screen-title').textContent().catch(() => ''));
      }
      check(`${w}: browser Back never returns to Email or Code (${seenTitles.join(' / ')})`, () => { for (const t of seenTitles) assert.ok(!["What's your email?", 'Enter the code'].includes(t), t); });
      check(`${w}: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 2. Resend: disabled for 60 s (fake clock), then enabled; a 429 shows the rate-limit copy. Wrong email? goes back.
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.clock.install();
      const stub = await stubContext(context, { otpStatus: [200, 429] });
      const { page, errors } = await newPage(context);
      await openGuided(page);
      await toCode(page);
      await context.clock.fastForward(1000);
      const t1 = await page.locator('[data-signup-resend]').evaluate((el) => ({ disabled: el.disabled, text: el.textContent.trim() }));
      check(`Resend counts down ("Resend in 0:59") while disabled (${JSON.stringify(t1)})`, () => { assert.equal(t1.disabled, true); assert.equal(t1.text, 'Resend in 0:59'); });
      await context.clock.fastForward(30000);
      const t2 = await page.locator('[data-signup-resend]').evaluate((el) => el.disabled);
      check('Resend is still disabled at 31 s', () => assert.equal(t2, true));
      await context.clock.fastForward(30000);
      const t3 = await page.locator('[data-signup-resend]').evaluate((el) => ({ disabled: el.disabled, text: el.textContent.trim() }));
      check(`Resend is enabled after 60 s (${JSON.stringify(t3)})`, () => { assert.equal(t3.disabled, false); assert.equal(t3.text, 'Resend code'); });
      await page.locator('[data-signup-resend]').click();
      await page.waitForFunction((t) => document.querySelector('#guided-signup')?.textContent.includes(t), RATE_COPY, { timeout: 5000 }).catch(() => {});
      const rate = await page.locator('#guided-signup').textContent();
      check('a 429 on resend shows the rate-limit copy', () => { assert.ok(rate.includes(RATE_COPY)); assert.equal(stub.posts('/auth/v1/otp').length, 2); });
      await shot(page, 'signup-1440-code-rate-limited.png');
      await page.locator('#guided-signup button:has-text("Wrong email?")').click();
      await waitTitle(page, "What's your email?");
      const kept = await page.locator('#signup-email').inputValue();
      check(`Wrong email? goes back to Email with the address kept (${kept})`, () => assert.equal(kept, EMAIL));
      check(`resend: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 3. An expired code: the expired copy, and a new code is sent automatically.
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const stub = await stubContext(context);
      const { page, errors } = await newPage(context);
      await openGuided(page);
      await toCode(page);
      await page.locator('#guided-signup .gs-otp input').first().focus();
      await page.keyboard.type(EXPIRED);
      await page.waitForFunction((t) => document.querySelector('#guided-signup')?.textContent.includes(t), EXPIRED_COPY, { timeout: 5000 }).catch(() => {});
      const text = await page.locator('#guided-signup').textContent();
      const inBoxes = await page.evaluate(() => Boolean(document.activeElement?.closest('.gs-otp')));
      check(`an expired code shows "${EXPIRED_COPY}" and sends a new one (otp POSTs ${stub.posts('/auth/v1/otp').length})`, () => { assert.ok(text.includes(EXPIRED_COPY)); assert.equal(stub.posts('/auth/v1/otp').length, 2); assert.ok(inBoxes); });
      await shot(page, 'signup-375-code-expired.png');
      check(`expired: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 4. Google, every signup entry point, reduced motion, and Log in.
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      const stub = await stubContext(context);
      const { page, errors } = await newPage(context);
      await page.goto(`${BASE}/auth.html#login`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-auth-view="login"]:not([hidden])', { timeout: 15000 });
      await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelector('.auth-create-trigger').click());  // hidden in this layout; still wired
      await waitTitle(page, 'Find your people.');
      check('"Create an account" opens the guided flow', () => assert.ok(true));
      const hash = await page.evaluate(() => window.location.hash);
      check(`the guided flow is at #signup (${hash})`, () => assert.equal(hash, '#signup'));
      await page.locator('#guided-signup button:has-text("Log in")').click();
      await page.waitForSelector('[data-auth-view="login"]:not([hidden])');
      check('"Already a member? Log in" shows the login view', () => assert.ok(true));
      await page.waitForTimeout(400);
      await page.locator('.auth-top-signup').click();
      await waitTitle(page, 'Find your people.');
      check('"New here? Create account" opens the guided flow', () => assert.ok(true));
      await buttonByText(page, 'Continue with email').click();
      const transform = await page.evaluate(() => [...document.querySelectorAll('#guided-signup .gs-screen-inner')].map((el) => getComputedStyle(el).transform));
      check(`reduced motion: a screen change moves nothing (${transform.join(', ')})`, () => { for (const t of transform) assert.equal(t, 'none'); });
      await waitTitle(page, "What's your email?");
      await page.locator('#guided-signup [data-signup-back]').click();
      await waitTitle(page, 'Find your people.');
      const authorize = page.waitForRequest((r) => r.url().startsWith(`${ORIGIN}/auth/v1/authorize`), { timeout: 8000 }).catch(() => null);
      await buttonByText(page, 'Continue with Google').click();
      const req = await authorize;
      const reqUrl = req ? new URL(req.url()) : null;
      check(`Continue with Google starts the Google sign-in, back to auth.html (${reqUrl?.search || 'no request'})`, () => { assert.ok(reqUrl); assert.equal(reqUrl.searchParams.get('provider'), 'google'); assert.match(reqUrl.searchParams.get('redirect_to') || '', /\/auth\.html$/); });
      check(`google: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      void stub;
      await context.close();
    }
  });

  await withServer('google', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    await stubContext(context);
    const { page, errors } = await newPage(context);
    await openGuided(page);
    const google = await isVisible(page, '#guided-signup button:has-text("Continue with Google")');
    const email = await isVisible(page, '#guided-signup button:has-text("Continue with email")');
    check('VITE_SIGNUP_METHODS=google hides the email option', () => { assert.ok(google); assert.equal(email, false); });
    await a11yScreen(page, '375 welcome google only');
    await shot(page, 'signup-375-welcome-google-only.png');
    check(`google only: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
    await context.close();
  });

  await withServer('', async () => {
    for (const w of [375, 1440]) {
      const context = await browser.newContext({ viewport: { width: w, height: w === 375 ? 812 : 900 } });
      await stubContext(context);
      const { page, errors } = await newPage(context);
      await openGuided(page);
      const google = await isVisible(page, '#guided-signup button:has-text("Continue with Google")');
      const email = await isVisible(page, '#guided-signup button:has-text("Continue with email")');
      const text = await page.locator('#guided-signup').textContent();
      const login = await isVisible(page, '#guided-signup button:has-text("Log in")');
      check(`${w}: empty VITE_SIGNUP_METHODS hides both and shows "Signups open soon" and Log in`, () => { assert.equal(google, false); assert.equal(email, false); assert.match(text, /Signups open soon/); assert.ok(login); });
      await a11yScreen(page, `${w} welcome closed`);
      await shot(page, `signup-${w}-welcome-closed.png`);
      check(`closed ${w}: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }
  });
} catch (error) {
  results.push(['FAIL', `harness: ${error.stack || error.message}`]);
} finally {
  await browser?.close();
}

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([status]) => status === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
