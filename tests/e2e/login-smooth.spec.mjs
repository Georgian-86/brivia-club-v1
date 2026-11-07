// The log-in screen on phones and laptops (D-223), against `vite preview` of a fresh build (the production CSS order
// matters: the bug fixed here only existed in the built bundle):
// * Log in and Continue with Google are on the first screen, with no sideways scroll, from an iPhone SE to a desktop;
// * the fields let password managers fill them (iCloud Keychain, Google, Windows, Android: no autocomplete="off"),
//   bring up the email keyboard, never auto-capitalise, and are 16 px (iOS zooms into smaller fields);
// * a wrong password, an unconfirmed email and a dropped connection read as plain sentences, not raw API text.
//   VITE_SUPABASE_URL=https://stub.supabase.local VITE_SUPABASE_ANON_KEY=stub npm run build
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/login-smooth.spec.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT || 5181);
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`PASS ${name}`); } catch (error) { failures += 1; console.log(`FAIL ${name}\n     ${String(error.message || error).split('\n').join('\n     ')}`); }
};
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: repoRoot, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-preview.pid, 'SIGTERM'); } catch { /* gone */ } };
for (let i = 0; i < 80; i += 1) { try { if ((await fetch(`${BASE}/`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }

const SIZES = [
  ['iPhone SE', { ...devices['iPhone SE'] }],
  ['iPhone 13', { ...devices['iPhone 13'] }],
  ['Pixel 7', { ...devices['Pixel 7'] }],
  ['laptop 1366', { viewport: { width: 1366, height: 768 } }],
  ['Mac 1440', { viewport: { width: 1440, height: 900 } }],
];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
try {
  for (const [name, opts] of SIZES) {
    const context = await browser.newContext(opts);
    await context.addInitScript(() => { try { sessionStorage.setItem('brivia-intro-seen', 'true'); } catch { /* none */ } });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html`, { waitUntil: 'load' });
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const box = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; };
      return { vh: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth, submit: box('#login-form .auth-submit'), google: box('.auth-google-trigger'), title: box('#auth-title') };
    });
    await check(`${name}: Log in and Continue with Google are on the first screen (${Math.round(r.google.bottom)} of ${r.vh} px), no sideways scroll`, () => {
      assert.ok(r.submit.bottom <= r.vh && r.google.bottom <= r.vh, JSON.stringify(r));
      assert.ok(r.title.top >= 0, 'the heading is not cut off');
      assert.ok(r.sw <= r.iw, `${r.sw} > ${r.iw}`);
    });
    const fields = await page.evaluate(() => [...document.querySelectorAll('#login-form input')].map((el) => ({
      name: el.name, autocomplete: el.getAttribute('autocomplete'), inputmode: el.getAttribute('inputmode'), autocapitalize: el.getAttribute('autocapitalize'),
      font: parseFloat(getComputedStyle(el).fontSize),
    })));
    const form = await page.evaluate(() => document.querySelector('#login-form').getAttribute('autocomplete'));
    await check(`${name}: password managers can fill the log-in (username, current-password), email keyboard, no auto-capitals`, () => {
      assert.notEqual(form, 'off');
      const email = fields.find((f) => f.name === 'email');
      const password = fields.find((f) => f.name === 'password');
      assert.match(email.autocomplete, /\busername\b/); assert.equal(email.inputmode, 'email'); assert.equal(email.autocapitalize, 'off');
      assert.equal(password.autocomplete, 'current-password');
    });
    if (opts.isMobile) await check(`${name}: fields are at least 16 px, so iOS does not zoom in on tap`, () => assert.ok(fields.every((f) => f.font >= 16), JSON.stringify(fields)));
    await context.close();
  }

  // Plain error copy, against the stubbed auth endpoint.
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  await context.addInitScript(() => { try { sessionStorage.setItem('brivia-intro-seen', 'true'); } catch { /* none */ } });
  const page = await context.newPage();
  let reply = 'invalid';
  await page.route('**/auth/v1/token**', (route) => {
    if (reply === 'offline') return route.abort('internetdisconnected');
    const body = reply === 'invalid'
      ? { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }
      : { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' };
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${BASE}/auth.html`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const attempt = async () => {
    await page.fill('#login-form input[name="email"]', 'member@test.brivia.club');
    await page.fill('#login-form input[name="password"]', 'not-the-password');
    await page.click('#login-form .auth-submit');
    await page.waitForFunction(() => !/Checking/.test(document.querySelector('#login-note').textContent) && document.querySelector('#login-note').textContent.length > 0, null, { timeout: 15000 });
    return page.textContent('#login-note');
  };
  const wrong = await attempt();
  await check(`wrong password: "${wrong}"`, () => { assert.match(wrong, /do not match/); assert.doesNotMatch(wrong, /Invalid login credentials/); });
  reply = 'unconfirmed';
  const unconfirmed = await attempt();
  await check(`unconfirmed email: "${unconfirmed}"`, () => assert.match(unconfirmed, /Confirm your email/));
  reply = 'offline';
  const offline = await attempt();
  await check(`no connection: "${offline}"`, () => { assert.match(offline, /No connection/); assert.doesNotMatch(offline, /fetch/i); });
  const enabled = await page.evaluate(() => !document.querySelector('#login-form .auth-submit').disabled);
  await check('after an error the Log in button is ready again', () => assert.equal(enabled, true));
  await context.close();
} finally { await browser.close(); stop(); }
console.log(failures ? `${failures} login check(s) failed` : 'All login checks passed');
process.exit(failures ? 1 : 0);
