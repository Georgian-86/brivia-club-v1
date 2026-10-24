// Password reset (D-090), stubbed Supabase (Vite on :5181): "Forgot password?" swaps the login form for the request
// step (typed email kept, /recover called with redirect_to auth.html, a neutral "if an account exists" line, Back to
// log in), a rate limit says to wait; the emailed link (implicit `type=recovery`) opens the new-password step instead
// of the app, mismatched passwords are caught before any call, SAVE PASSWORD sends PUT /user and opens the app; an
// expired link asks for a new one; a link Supabase sent to the Site URL (the landing) reaches the same step.
// At 1440 and 390 px. SHOTS=<dir> saves the steps (default .superpowers/shots/reset).
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/password-reset.spec.mjs
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { startAppStub, ORIGIN, session, user, ownRow } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.SHOTS || '.superpowers/shots/reset'; mkdirSync(SHOTS, { recursive: true });
const stub = process.env.BASE ? { url: process.env.BASE, close: async () => {} } : await startAppStub({ port: 5181, state: {} });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log('PASS ', name); } catch (e) { failures++; console.log('FAIL ', name, e.message.split('\n')[0]); } };
const ctxFor = async (viewport, calls, { recoverStatus = 200, userStatus = 200, userBody = null } = {}) => {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    const r = route.request(); const u = new URL(r.url()); const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: h });
    calls.push({ method: r.method(), path: u.pathname, query: u.search, body: r.postData() });
    const json = (status, b) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b), headers: h });
    if (u.pathname === '/auth/v1/recover') return json(recoverStatus, recoverStatus === 200 ? {} : { code: 'over_email_send_rate_limit', msg: 'Email rate limit exceeded', message: 'Email rate limit exceeded' });
    if (u.pathname === '/auth/v1/user' && r.method() === 'PUT') return json(userStatus, userBody || user);
    if (u.pathname.startsWith('/auth/v1/')) return json(200, u.pathname.endsWith('/user') ? user : session);
    if (u.pathname === '/rest/v1/profiles') return json(200, (r.headers().accept || '').includes('vnd.pgrst.object') ? ownRow : [ownRow]);
    if (u.pathname === '/rest/v1/rpc/my_onboarding_status') return json(200, [{ interests: 2, points: 20, has_cell: true, place_label: 'Kochi', completed: true }]);
    return json(200, []);
  });
  await ctx.route(`${stub.url}/app.html*`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title><p id="stub-app">app</p>' }));
  return ctx;
};
const visible = (page, sel) => page.locator(sel).isVisible();
const recoveryHash = `#access_token=${session.access_token}&expires_at=${session.expires_at}&expires_in=3600&refresh_token=stub-refresh&token_type=bearer&type=recovery`;
try {
  for (const [tag, viewport] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]) {
    // 1. Request a link from the login card.
    let calls = []; let ctx = await ctxFor(viewport, calls); let page = await ctx.newPage();
    await page.goto(`${stub.url}/auth.html#login`); await page.waitForTimeout(1200);
    await page.fill('#login-form input[type=email]', 'member@test.brivia.club');
    await page.click('#login-form .auth-forgot');
    await check(`${tag} Forgot password? shows the request step with the typed email`, async () => {
      assert.equal(await visible(page, '#reset-request-form'), true);
      assert.equal(await visible(page, '#login-form'), false);
      assert.equal(await visible(page, '.auth-login .auth-socials'), false);
      assert.equal(await page.inputValue('#reset-request-form input[type=email]'), 'member@test.brivia.club');
      assert.equal(await page.textContent('#auth-title'), 'RESET PASSWORD');
      assert.equal(await page.evaluate(() => document.activeElement?.name), 'email');
    });
    await page.screenshot({ path: `${SHOTS}/request-${tag}.png` });
    await page.click('#reset-request-form .auth-submit'); await page.waitForTimeout(800);
    await check(`${tag} SEND RESET LINK calls /recover with the email and redirect to auth.html, and says so neutrally`, async () => {
      const recover = calls.find((c) => c.path === '/auth/v1/recover');
      assert.ok(recover, 'no /recover call');
      assert.equal(JSON.parse(recover.body).email, 'member@test.brivia.club');
      assert.equal(new URLSearchParams(recover.query).get('redirect_to'), `${stub.url}/auth.html`);
      assert.match(await page.textContent('#login-note'), /If an account exists for member@test\.brivia\.club/);
    });
    await page.screenshot({ path: `${SHOTS}/sent-${tag}.png` });
    await page.click('#reset-request-form .auth-reset-back');
    await check(`${tag} Back to log in restores the login card`, async () => {
      assert.equal(await visible(page, '#login-form'), true);
      assert.equal(await visible(page, '.auth-login .auth-socials'), true);
      assert.equal(await page.textContent('#auth-title'), 'JOIN THE CLUB');
    });
    await ctx.close();
    // 1b. Rate limited.
    calls = []; ctx = await ctxFor(viewport, calls, { recoverStatus: 429 }); page = await ctx.newPage();
    await page.goto(`${stub.url}/auth.html#login`); await page.waitForTimeout(1200);
    await page.click('#login-form .auth-forgot'); await page.fill('#reset-request-form input[type=email]', 'a@b.co');
    await page.click('#reset-request-form .auth-submit'); await page.waitForTimeout(800);
    await check(`${tag} a rate-limited request says to wait`, async () => assert.match(await page.textContent('#login-note'), /Too many reset emails/));
    await ctx.close();
    // 2. Back from the email: choose a new password, then the app.
    calls = []; ctx = await ctxFor(viewport, calls); page = await ctx.newPage();
    await page.goto(`${stub.url}/auth.html${recoveryHash}`); await page.waitForTimeout(1500);
    await check(`${tag} the reset link opens the new-password step (not the app)`, async () => {
      assert.match(page.url(), /\/auth\.html/);
      assert.equal(await visible(page, '#reset-update-form'), true);
      assert.equal(await page.textContent('#auth-title'), 'NEW PASSWORD');
      assert.equal(await visible(page, '.brivia-handoff'), false);
    });
    await page.screenshot({ path: `${SHOTS}/update-${tag}.png` });
    await page.fill('#reset-update-form input[name=password]', 'newpass123'); await page.fill('#reset-update-form input[name=confirm]', 'newpass124');
    await page.click('#reset-update-form .auth-submit'); await page.waitForTimeout(300);
    await check(`${tag} mismatched passwords are caught before any call`, async () => {
      assert.match(await page.textContent('#login-note'), /don't match/);
      assert.equal(calls.filter((c) => c.path === '/auth/v1/user' && c.method === 'PUT').length, 0);
    });
    await page.fill('#reset-update-form input[name=confirm]', 'newpass123');
    await page.click('#reset-update-form .auth-submit');
    await page.waitForURL(/app\.html/, { timeout: 8000 }).catch(() => {});
    await check(`${tag} SAVE PASSWORD updates the user and opens the app`, async () => {
      const put = calls.find((c) => c.path === '/auth/v1/user' && c.method === 'PUT');
      assert.ok(put, 'no PUT /user'); assert.equal(JSON.parse(put.body).password, 'newpass123');
      assert.match(page.url(), /app\.html/);
    });
    await ctx.close();
    // 3. Expired link.
    calls = []; ctx = await ctxFor(viewport, calls); page = await ctx.newPage();
    await page.goto(`${stub.url}/auth.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`); await page.waitForTimeout(1500);
    await check(`${tag} an expired link asks for a new one`, async () => {
      assert.equal(await visible(page, '#reset-request-form'), true);
      assert.match(await page.textContent('#login-note'), /expired or was already used/);
    });
    await page.screenshot({ path: `${SHOTS}/expired-${tag}.png` });
    await ctx.close();
    // 4. A reset link that Supabase sent to the Site URL (the landing).
    calls = []; ctx = await ctxFor(viewport, calls); page = await ctx.newPage();
    await page.goto(`${stub.url}/index.html${recoveryHash}`); await page.waitForTimeout(2000);
    await check(`${tag} a reset link landing on the home page goes to the new-password step`, async () => {
      assert.match(page.url(), /\/auth\.html/);
      assert.equal(await visible(page, '#reset-update-form'), true);
    });
    await ctx.close();
  }
} finally { await browser.close(); await stub.close(); }
console.log(failures ? `${failures} failed` : 'all passed'); process.exit(failures ? 1 : 0);
