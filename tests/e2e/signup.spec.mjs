// Guided signup (Phase E, D-067) against a stubbed Supabase, at 375 and 1440 px. Never touches a real project.
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/signup.spec.mjs
//   E2E_SCREENSHOTS=<dir> also saves a screenshot of every screen (and a mid-flight interest pick).
// Asserts: one screen at a time (one h2, one primary action; at most two questions); the bubble stepper and
// "Step n of N"; email -> code (POST /otp with the email), typed and pasted codes verify by themselves, a wrong code
// keeps the boxes, Resend waits 60 s; a new account then sets a password (two matching fields); after verify Back never
// returns to Email or Code; About you = name + 18+ (declare_adult first, current notice); Details = phone + gender
// saved on the own row; a city saves through set_home_city, a location only in the body of set_home_location; an
// interest tap flies a chip into the tray, the 13th is refused, 3 picks save as 7/7/6 "play"; the Reveal has no digits
// and goes to the app; no points input anywhere; a returning member
// resumes at the first unfinished screen and a completed one goes to the app; VITE_SIGNUP_METHODS hides methods;
// axe finds nothing; the primary button stays above a phone keyboard.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { axeViolations } from './a11y.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT || 5193);
const ORIGIN = 'https://stub.supabase.local';
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.E2E_SCREENSHOTS || '';
const LAT = 12.971598;
const COORD_RE = /12\.97|77\.59/;
const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };

const ME = '22222222-2222-4222-8222-222222222222';
const EMAIL = 'guided@test.brivia.club';
const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const accessToken = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: ME, role: 'authenticated', exp, aud: 'authenticated' })}.sig`;
const makeUser = (provider = 'email', meta = {}, createdAt = new Date().toISOString()) => ({ id: ME, aud: 'authenticated', role: 'authenticated', email: EMAIL, user_metadata: meta, app_metadata: { provider, providers: [provider] }, created_at: createdAt });
const makeSession = (user) => ({ access_token: accessToken, refresh_token: 'stub-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user });

const nodes = [
  { id: 'games', parent_id: null, level: 1, label: 'Games', sensitive: false },
  { id: 'games.board', parent_id: 'games', level: 2, label: 'Board games', sensitive: false },
  { id: 'games.board.chess', parent_id: 'games.board', level: 3, label: 'Chess', sensitive: false },
  { id: 'music.instruments.guitar', parent_id: 'music.instruments', level: 3, label: 'Guitar', sensitive: false },
  { id: 'tech.events.hackathons', parent_id: 'tech.events', level: 3, label: 'Hackathons', sensitive: false },
  { id: 'sports.racket.badminton', parent_id: 'sports.racket', level: 3, label: 'Badminton', sensitive: false },
  { id: 'beliefs.faith.private', parent_id: 'beliefs.faith', level: 3, label: 'A private belief', sensitive: true },
  ...Array.from({ length: 14 }, (_, i) => ({ id: `misc.more.i${i}`, parent_id: 'misc.more', level: 3, label: `Interest ${String.fromCharCode(65 + i)}`, sensitive: false })),
];
const places = [{ id: 'in-pune', name: 'Pune', region: 'Maharashtra', country: 'India' }, { id: 'in-bengaluru', name: 'Bengaluru', region: 'Karnataka', country: 'India' }];

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: repoRoot,
  env: { ...process.env, VITE_SUPABASE_URL: ORIGIN, VITE_SUPABASE_ANON_KEY: 'stub-anon-key', VITE_SIGNUP_FLOW: 'guided', VITE_SIGNUP_METHODS: process.env.VITE_SIGNUP_METHODS ?? 'google,email' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
const stopVite = () => { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* gone */ } };
for (let i = 0; i < 120; i += 1) { try { if ((await fetch(`${BASE}/auth.html`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }

const setup = async (context, opts = {}) => {
  const user = makeUser(opts.provider, { ...(opts.meta || {}) }, opts.createdAt);
  const state = {
    profile: opts.profile ?? null, adultAt: opts.adultAt ?? null, hasCell: Boolean(opts.hasCell), interests: opts.interests || [],
    otpStatus: opts.otpStatus || [], failRpc: new Set(opts.failRpc || []),
  };
  const calls = [];
  await context.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const p = url.pathname;
    const body = request.postData() || '';
    calls.push({ method, path: p, url: request.url(), body });
    const headers = { 'access-control-allow-origin': '*' };
    const json = (status, payload) => route.fulfill({ status, contentType: 'application/json', body: payload === undefined ? '' : JSON.stringify(payload), headers });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (p === '/auth/v1/otp') {
      const forced = state.otpStatus.shift();
      if (forced === 429) return json(429, { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' });
      return json(200, {});
    }
    if (p === '/auth/v1/verify') {
      const { token } = JSON.parse(body || '{}');
      if (token !== '123456') return json(403, { code: 'otp_expired', error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      return json(200, makeSession(user));
    }
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers });
    if (p === '/auth/v1/user' && method === 'PUT') { Object.assign(user.user_metadata, JSON.parse(body || '{}').data || {}); return json(200, user); }
    if (p.startsWith('/auth/v1/')) return json(200, p.endsWith('/user') ? user : makeSession(user));
    const wantsObject = (request.headers().accept || '').includes('vnd.pgrst.object');
    if (p === '/rest/v1/profiles') {
      const own = () => ({ ...state.profile, adult_declared_at: state.adultAt });
      if (method === 'POST') { state.profile = JSON.parse(body || '{}'); return json(201, wantsObject ? own() : [own()]); }
      if (method === 'PATCH') {
        if (state.failRpc.has('name')) return json(500, { code: 'XX000', message: 'boom' });
        if (!state.profile) return json(200, []);
        Object.assign(state.profile, JSON.parse(body || '{}'));
        return json(200, wantsObject ? own() : [own()]);
      }
      if (!state.profile) return wantsObject ? json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }) : json(200, []);
      return json(200, wantsObject ? own() : [own()]);
    }
    const rpc = p.startsWith('/rest/v1/rpc/') ? p.slice('/rest/v1/rpc/'.length) : '';
    if (rpc && state.failRpc.has(rpc)) return json(500, { code: 'XX000', message: 'boom' });
    if (rpc === 'declare_adult') {
      if (!state.profile) return json(404, { code: 'P0002', message: 'profile required' });
      if (JSON.parse(body || '{}').p_notice_version !== '2026-10-05') return json(400, { code: '22023', message: 'stale notice version' });
      state.adultAt = state.adultAt || new Date().toISOString();
      return route.fulfill({ status: 204, body: '', headers });
    }
    if (p === '/rest/v1/interest_node') return json(200, nodes);
    if (p === '/rest/v1/place') {
      const q = ((url.searchParams.get('or') || '').match(/name\.ilike\.\*([^*]*)\*/) || [])[1] || '';
      return json(200, places.filter((pl) => !q || pl.name.toLowerCase().includes(q.toLowerCase())));
    }
    if (rpc === 'set_home_location' || rpc === 'set_home_city') { state.hasCell = true; return json(200, 'Pune'); }
    if (rpc === 'set_member_interests') {
      const items = JSON.parse(body || '{}').p_items || [];
      state.interests = items;
      return route.fulfill({ status: 204, body: '', headers });
    }
    if (rpc === 'my_onboarding_status') {
      const points = state.interests.reduce((s, i) => s + i.points, 0);
      const named = state.profile && !['', 'New Member'].includes(String(state.profile.name || '').trim());
      return json(200, [{ interests: state.interests.length, points, has_cell: state.hasCell, place_label: 'Pune', completed: Boolean(named && state.adultAt && state.hasCell && points === 20) }]);
    }
    if (rpc) return json(200, []);
    return json(200, []);
  });
  await context.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith(ORIGIN), (route) => route.abort());
  await context.routeWebSocket(/stub\.supabase\.local/, (ws) => ws.close());
  await context.route(`${BASE}/app.html*`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title><p id="stub-app">app</p>' }));
  if (opts.signedIn) {
    await context.addInitScript(([key, value]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); } }, ['sb-stub-auth-token', JSON.stringify(makeSession(user))]);
  }
  const posts = (name) => calls.filter((c) => c.method === 'POST' && (c.path === name || c.path === `/rest/v1/rpc/${name}`));
  return { state, calls, posts };
};

const screenOf = (page) => page.evaluate(() => document.querySelector('#guided-signup')?.dataset.screen || null);
const waitScreen = (page, name, timeout = 6000) => page.waitForFunction((n) => document.querySelector('#guided-signup')?.dataset.screen === n && !document.querySelector('[data-guided-next]')?.getAttribute('aria-busy')?.includes('true'), name, { timeout }).then(() => true).catch(() => false);
const ui = (page) => page.evaluate(() => {
  const root = document.querySelector('#guided-signup');
  const visible = (el) => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const bubbles = [...root.querySelectorAll('.guided-bubble')].map((b) => `${b.dataset.step}:${b.className.match(/is-(done|current|pending)/)?.[1]}`);
  const next = root.querySelector('[data-guided-next]');
  return {
    h2: [...root.querySelectorAll('h2')].filter(visible).length,
    title: root.querySelector('h2')?.textContent.trim(),
    label: visible(root.querySelector('[data-guided-step-label]')) ? root.querySelector('[data-guided-step-label]').textContent : null,
    bubbles,
    primaries: [next, ...root.querySelectorAll('.guided-choice--primary')].filter(visible).length,
    nextDisabled: next?.disabled,
    back: visible(root.querySelector('[data-guided-back]')),
    error: root.querySelector('[data-guided-error]')?.hidden ? '' : root.querySelector('[data-guided-error]')?.textContent,
    points: [...document.querySelectorAll('#guided-signup input')].filter((i) => /points/i.test(i.name)).length,
    text: root.innerText,
  };
});
const shot = async (page, name, settle = 450) => { if (!SHOTS) return; if (settle) await page.waitForTimeout(settle); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    const w = viewport.width;
    const mobile = w < 800;
    // ---- The whole email path ----
    {
      const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, permissions: ['geolocation'], geolocation: { latitude: LAT, longitude: 77.594566 } });
      const { state, posts, calls } = await setup(context);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'load' });
      await waitScreen(page, 'welcome');
      let u = await ui(page);
      await shot(page, `${w}-01-welcome`, 1200);
      check(`${w} welcome: Google and email, no step label, no stepper`, () => {
        assert.match(u.text, /Continue with Google/); assert.match(u.text, /Continue with email/);
        assert.equal(u.label, null); assert.deepEqual(u.bubbles, []); assert.equal(u.h2, 1);
      });
      const axeWelcome = await axeViolations(page, { include: '.auth-shell' });
      check(`${w} welcome: axe clean (${axeWelcome.join(' | ')})`, () => assert.deepEqual(axeWelcome, []));

      await page.locator('[data-guided-email]').click();
      await waitScreen(page, 'email');
      u = await ui(page);
      check(`${w} email: one question, "Step 1 of 7", first bubble current (${u.bubbles.join(' ')})`, () => {
        assert.equal(u.h2, 1); assert.equal(u.primaries, 1); assert.equal(u.label, 'Step 1 of 7');
        assert.deepEqual(u.bubbles, ['email:current', 'code:pending', 'password:pending', 'about:pending', 'details:pending', 'area:pending', 'interests:pending']);
        assert.equal(u.nextDisabled, true);
      });
      await page.locator('input[name="guided-email"]').fill(EMAIL);
      await shot(page, `${w}-02-email`);
      await page.locator('input[name="guided-email"]').press('Enter');
      await waitScreen(page, 'code');
      u = await ui(page);
      const otp = posts('/auth/v1/otp');
      check(`${w} Enter sends the code to that email, and the code screen names it`, () => {
        assert.equal(otp.length, 1); assert.equal(JSON.parse(otp[0].body).email, EMAIL);
        assert.equal(JSON.parse(otp[0].body).create_user, true);
        assert.match(u.text, new RegExp(`6-digit code to ${EMAIL.replace('.', '\\.')}`)); assert.match(u.text, /Wrong email\?/);
        assert.equal(u.label, 'Step 2 of 7');
      });
      const boxes = await page.evaluate(() => [...document.querySelectorAll('[data-otp]')].map((i) => [i.getAttribute('autocomplete'), i.inputMode]));
      check(`${w} code boxes: 6, the first autocomplete=one-time-code, all numeric`, () => {
        assert.equal(boxes.length, 6); assert.equal(boxes[0][0], 'one-time-code'); assert.ok(boxes.every((b) => b[1] === 'numeric'));
      });
      const resend = await page.locator('[data-guided-resend]').evaluate((b) => ({ disabled: b.disabled, text: b.textContent }));
      check(`${w} Resend waits about 60 s (${resend.text})`, () => { assert.equal(resend.disabled, true); assert.match(resend.text, /(1:00|0:5\d)/); });
      // A wrong code: the boxes stay, the error shows, focus stays in the boxes.
      await page.locator('[data-otp="0"]').focus();
      await page.keyboard.type('111111');
      await page.waitForFunction(() => /didn't work/.test(document.querySelector('[data-guided-error]')?.textContent || ''), null, { timeout: 4000 }).catch(() => {});
      u = await ui(page);
      const stillCode = await screenOf(page);
      const kept = await page.evaluate(() => ({ v: [...document.querySelectorAll('[data-otp]')].map((i) => i.value).join(''), inBoxes: Boolean(document.activeElement?.matches('[data-otp]')) }));
      await shot(page, `${w}-03-code-wrong`);
      check(`${w} a wrong code says so, keeps the boxes and the focus (${JSON.stringify(kept)})`, () => {
        assert.equal(u.error, "That code didn't work. Check it, or send a new one."); assert.equal(kept.v, '111111'); assert.equal(kept.inBoxes, true);
        assert.equal(stillCode, 'code');
      });
      // Paste "123 456" into the first box: all six fill and it verifies by itself.
      await page.locator('[data-otp="0"]').evaluate((input) => {
        const data = new DataTransfer(); data.setData('text', 'Your code is 123 456');
        input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      });
      const reachedPassword = await waitScreen(page, 'password');
      u = await ui(page);
      await shot(page, `${w}-04-password`);
      check(`${w} pasting "Your code is 123 456" verifies; Password shows "Step 3 of 7" with 2 done bubbles`, () => {
        assert.equal(reachedPassword, true); assert.equal(u.label, 'Step 3 of 7');
        assert.deepEqual(u.bubbles.slice(0, 3), ['email:done', 'code:done', 'password:current']);
        assert.ok(state.profile, 'the profile row was created'); assert.equal(state.profile.name, 'New Member');
        assert.equal(u.h2, 1); assert.equal(u.primaries, 1);
      });
      const axePassword = await axeViolations(page, { include: '.auth-shell' });
      check(`${w} password: axe clean (${axePassword.join(' | ')})`, () => assert.deepEqual(axePassword, []));
      // Back after verifying: Welcome ("signed in as"), never Code or Email.
      await page.locator('[data-guided-back]').click();
      await waitScreen(page, 'welcome');
      u = await ui(page);
      check(`${w} Back from Password goes to Welcome with the signed-in line, not to Code`, () => { assert.match(u.text, /signed in as/i); assert.match(u.text, new RegExp(EMAIL.replace('.', '\\.'))); });
      await page.locator('[data-guided-continue]').click();
      await waitScreen(page, 'password');
      await page.locator('input[name="guided-password"]').fill('correct horse 1');
      await page.locator('input[name="guided-password-confirm"]').fill('correct horse 2');
      await page.locator('[data-guided-next]').click();
      await page.waitForTimeout(300);
      u = await ui(page);
      check(`${w} mismatched passwords are refused on the screen (${u.error})`, () => assert.equal(u.error, "The two passwords don't match."));
      await page.locator('input[name="guided-password-confirm"]').fill('correct horse 1');
      await page.locator('input[name="guided-password-confirm"]').press('Enter');
      await waitScreen(page, 'about');
      const pw = calls.filter((c) => c.method === 'PUT' && c.path === '/auth/v1/user' && JSON.parse(c.body || '{}').password);
      check(`${w} the password is set on the account and the passwordless mark cleared`, () => {
        assert.equal(pw.length, 1); const b = JSON.parse(pw[0].body); assert.equal(b.password, 'correct horse 1'); assert.equal(b.data.passwordless, false);
      });
      u = await ui(page);
      check(`${w} About you: name + 18+ on one screen, "Step 4 of 7", Next disabled until both`, () => {
        assert.equal(u.label, 'Step 4 of 7'); assert.equal(u.nextDisabled, true); assert.equal(u.h2, 1); assert.match(u.text, /I'm 18 or older/);
      });
      await page.locator('input[name="guided-name"]').fill('Gia Guided');
      u = await ui(page);
      check(`${w} About you: a name alone is not enough (the 18+ box is required)`, () => assert.equal(u.nextDisabled, true));
      await page.locator('input[name="guided-adult"]').check();
      await shot(page, `${w}-05-about`);
      await page.locator('[data-guided-next]').click();
      await waitScreen(page, 'details');
      const declare = posts('declare_adult');
      const declareAt = calls.findIndex((c) => c.path.endsWith('/declare_adult'));
      const nameAt = calls.findIndex((c) => c.method === 'PATCH' && c.path === '/rest/v1/profiles' && /Gia Guided/.test(c.body));
      check(`${w} About you: declare_adult (notice 2026-10-05) before the name save (${declareAt} < ${nameAt})`, () => {
        assert.equal(declare.length, 1); assert.deepEqual(JSON.parse(declare[0].body), { p_notice_version: '2026-10-05' });
        assert.ok(declareAt >= 0 && nameAt > declareAt); assert.equal(state.profile.name, 'Gia Guided');
      });
      u = await ui(page);
      check(`${w} Details: phone + gender, "Step 5 of 7", Next disabled until both`, () => { assert.equal(u.label, 'Step 5 of 7'); assert.equal(u.nextDisabled, true); assert.match(u.text, /gender/i); });
      await page.locator('input[name="guided-phone"]').fill('98765 43210');
      u = await ui(page);
      check(`${w} Details: a phone alone is not enough (gender is required)`, () => assert.equal(u.nextDisabled, true));
      await page.locator('.guided-segment[data-gender="Female"]').click();
      await shot(page, `${w}-06-details`);
      const axeDetails = await axeViolations(page, { include: '.auth-shell' });
      check(`${w} details: axe clean (${axeDetails.join(' | ')})`, () => assert.deepEqual(axeDetails, []));
      await page.locator('[data-guided-next]').click();
      await waitScreen(page, 'area');
      check(`${w} Details saved on the member's own row (${state.profile.phone}, ${state.profile.gender})`, () => {
        assert.equal(state.profile.phone, '+91 9876543210'); assert.equal(state.profile.phone_number, '9876543210');
        assert.equal(state.profile.phone_country_code, '+91'); assert.equal(state.profile.gender, 'Female');
      });
      u = await ui(page);
      check(`${w} area: Next disabled until an area is chosen`, () => assert.equal(u.nextDisabled, true));
      if (mobile) {
        await page.locator('[data-guided-geo]').click();
        await page.waitForFunction(() => document.querySelector('[data-guided-geo]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 4000 }).catch(() => {});
      } else {
        await page.locator('input[name="guided-city"]').fill('pu');
        await page.waitForSelector('.guided-cities button[data-place="in-pune"]', { timeout: 4000 });
        await page.locator('.guided-cities button[data-place="in-pune"]').click();
      }
      await shot(page, `${w}-06-area`);
      await page.locator('[data-guided-next]').click();
      await waitScreen(page, 'interests');
      await page.waitForSelector('.guided-option', { timeout: 5000 });
      const areaCalls = calls.filter((c) => /set_home_(city|location)/.test(c.path));
      const leaked = calls.filter((c) => COORD_RE.test(c.url) || (COORD_RE.test(c.body) && !c.path.endsWith('/set_home_location')));
      const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
      check(`${w} area saved once (${areaCalls.map((c) => c.path.split('/').pop()).join(',')}); coordinates only in the set_home_location body`, () => {
        assert.equal(areaCalls.length, 1);
        assert.equal(areaCalls[0].path.endsWith(mobile ? 'set_home_location' : 'set_home_city'), true);
        if (!mobile) assert.deepEqual(JSON.parse(areaCalls[0].body), { p_place_id: 'in-pune' });
        assert.equal(leaked.length, 0); assert.ok(!COORD_RE.test(stored));
      });
      u = await ui(page);
      check(`${w} interests: "Step 7 of 7", popular first, private ones never offered, Next disabled`, () => {
        assert.equal(u.label, 'Step 7 of 7'); assert.equal(u.nextDisabled, true);
        assert.ok(!/A private belief/.test(u.text)); assert.ok(u.text.indexOf('Chess') < u.text.indexOf('Interest A'));
      });
      // Tap: a clone flies (a transform mid-flight), the chip is pressed, the tray says "1 picked".
      await page.locator('.guided-option', { hasText: 'Chess' }).click();
      await page.waitForTimeout(90);
      const flight = await page.evaluate(() => { const g = document.querySelector('.guided-ghost'); return g ? getComputedStyle(g).transform : null; });
      await shot(page, `${w}-07-interest-flight`, 0);
      await page.waitForTimeout(260);
      const picked = await page.evaluate(() => ({ count: document.querySelector('[data-guided-count]').textContent, pressed: document.querySelector('.guided-option[aria-pressed="true"]')?.textContent.trim(), tray: [...document.querySelectorAll('.guided-pick')].map((b) => b.textContent.replace('×', '').trim()), ghosts: document.querySelectorAll('.guided-ghost').length }));
      check(`${w} a pick flies into the tray (mid-flight transform ${flight}), "1 picked", chip pressed, no ghost left`, () => {
        assert.ok(flight && flight !== 'none'); assert.equal(picked.count, '1 picked'); assert.equal(picked.pressed, 'Chess'); assert.deepEqual(picked.tray, ['Chess']); assert.equal(picked.ghosts, 0);
      });
      await page.locator('.guided-pick', { hasText: 'Chess' }).click();
      await page.waitForTimeout(300);
      const removed = await page.evaluate(() => ({ count: document.querySelector('[data-guided-count]').textContent, tray: document.querySelectorAll('.guided-pick').length }));
      check(`${w} tapping a pick in the tray removes it`, () => { assert.equal(removed.count, '0 picked'); assert.equal(removed.tray, 0); });
      for (const label of ['Chess', 'Guitar', 'Hackathons']) { await page.locator('.guided-option', { hasText: label }).first().click(); await page.waitForTimeout(40); }
      await page.waitForTimeout(300);
      await shot(page, `${w}-08-interests`);
      const axeInterests = await axeViolations(page, { include: '.auth-shell' });
      check(`${w} interests: axe clean (${axeInterests.join(' | ')})`, () => assert.deepEqual(axeInterests, []));
      await page.locator('[data-guided-next]').click();
      await waitScreen(page, 'reveal');
      const saved = posts('set_member_interests');
      check(`${w} Finish saves 3 picks as 7/7/6, mode play`, () => {
        assert.equal(saved.length, 1);
        assert.deepEqual(JSON.parse(saved[0].body).p_items, [
          { interest_id: 'games.board.chess', points: 7, mode: 'play' }, { interest_id: 'music.instruments.guitar', points: 7, mode: 'play' }, { interest_id: 'tech.events.hackathons', points: 6, mode: 'play' }]);
      });
      u = await ui(page);
      await shot(page, `${w}-09-reveal`);
      check(`${w} Reveal: "You're in, Gia.", all bubbles done, no digits, no points text`, () => {
        assert.equal(u.title, "You're in, Gia."); assert.ok(u.bubbles.every((b) => b.endsWith(':done')));
        const copy = u.text.replace(/See my deck/, '');
        assert.ok(!/\d/.test(copy), copy); assert.ok(!/points? left|passion points/i.test(u.text));
        assert.equal(u.points, 0);
      });
      await page.locator('[data-guided-next]').click();
      const toApp = await page.waitForURL(/\/app\.html/, { timeout: 5000 }).then(() => true).catch(() => false);
      check(`${w} See my deck goes to /app.html`, () => assert.equal(toApp, true));
      check(`${w} no page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }
  }

  // ---- Phone: 13th pick refused; the primary button stays above the keyboard; a save failure keeps the screen ----
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await setup(context, { signedIn: true, profile: { id: ME, name: 'Ray Resume', email: EMAIL, phone_number: '9876543210', phone_country_code: '+91', gender: 'Male' }, adultAt: '2026-10-18T00:00:00Z', hasCell: true, failRpc: ['set_member_interests'] });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html?complete-profile=1`, { waitUntil: 'load' });
    const resumed = await waitScreen(page, 'interests');
    await page.waitForSelector('.guided-option', { timeout: 5000 });
    let u = await ui(page);
    check(`resume: about + details + area done opens Interests at "Step 7 of 7" (${u.label})`, () => { assert.equal(resumed, true); assert.equal(u.label, 'Step 7 of 7'); });
    for (let i = 0; i < 13; i += 1) await page.locator('.guided-option[aria-pressed="false"]').first().click();
    await page.waitForTimeout(300);
    u = await ui(page);
    const count = await page.locator('[data-guided-count]').textContent();
    check(`the 13th pick is refused with the cap message (${count})`, () => { assert.equal(count, '12 picked'); assert.match(u.error, /up to 12/); });
    await page.locator('[data-guided-next]').click();
    await page.waitForTimeout(600);
    u = await ui(page);
    const busy = await page.locator('[data-guided-next]').getAttribute('aria-busy');
    check(`a failed save keeps the screen, says so, and the button is not left busy (${busy})`, () => {
      assert.equal(u.error, "That didn't save. Check your connection and try again."); assert.equal(busy, 'false');
    });
    // A 300 px keyboard: the visual viewport shrinks; the primary button moves up with it.
    await page.evaluate(() => {
      const vv = window.visualViewport;
      Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - 300 });
      vv.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);
    const box = await page.locator('[data-guided-next]').boundingBox();
    check(`the primary button stays above a 300 px keyboard (bottom ${Math.round(box.y + box.height)} <= 512)`, () => assert.ok(box.y + box.height <= 812 - 300 + 1));
    await context.close();
  }

  // ---- Google return: About you prefilled, no password; a completed member goes straight to the app ----
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setup(context, { signedIn: true, provider: 'google', meta: { full_name: 'Gabe Google' } });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html`, { waitUntil: 'load' });
    await waitScreen(page, 'about');
    const u = await ui(page);
    const value = await page.locator('input[name="guided-name"]').inputValue({ timeout: 2000 }).catch(() => '');
    check(`Google: a new account starts at About you, name prefilled (${value}), "Step 1 of 4", no password screen`, () => {
      assert.equal(value, 'Gabe Google'); assert.equal(u.label, 'Step 1 of 4'); assert.ok(!u.bubbles.some((b) => b.startsWith('password')));
    });
    await page.locator('input[name="guided-adult"]').check();
    await page.locator('[data-guided-next]').click();
    await waitScreen(page, 'details');
    const d = await ui(page);
    check(`Google: then Details, "Step 2 of 4" (${d.label})`, () => assert.equal(d.label, 'Step 2 of 4'));
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setup(context, { signedIn: true, profile: { id: ME, name: 'Done Member', email: EMAIL }, adultAt: '2026-10-18T00:00:00Z', hasCell: true, interests: [{ interest_id: 'games.board.chess', points: 20, mode: 'play' }] });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'load' });
    const toApp = await page.waitForURL(/\/app\.html/, { timeout: 6000 }).then(() => true).catch(() => false);
    check('a completed member opening auth.html#signup lands on /app.html', () => assert.equal(toApp, true));
    await context.close();
  }
  // ---- Login by code: never creates an account; a verified member who is done goes to the app ----
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const { posts } = await setup(context, { createdAt: '2026-01-01T00:00:00Z', profile: { id: ME, name: 'Code Member', email: EMAIL }, adultAt: '2026-10-18T00:00:00Z', hasCell: true, interests: [{ interest_id: 'games.board.chess', points: 20, mode: 'play' }] });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html`, { waitUntil: 'load' });
    await page.locator('.auth-code-login').click();
    await waitScreen(page, 'email');
    const u = await ui(page);
    await page.locator('input[name="guided-email"]').fill(EMAIL);
    await page.locator('[data-guided-next]').click();
    await waitScreen(page, 'code');
    const sent = posts('/auth/v1/otp');
    check(`login: "Email me a code instead" asks for the email and sends a code that never creates an account (${u.title})`, () => {
      assert.equal(u.title, 'Log in with a code'); assert.equal(sent.length, 1); assert.equal(JSON.parse(sent[0].body).create_user, false);
    });
    await page.locator('[data-otp="0"]').focus();
    await page.keyboard.type('123456');
    const toApp = await page.waitForURL(/\/app\.html/, { timeout: 6000 }).then(() => true).catch(() => false);
    check('login: typing the right code signs in and a completed member lands on /app.html', () => assert.equal(toApp, true));
    await context.close();
  }
  // ---- A 429 when sending the code ----
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setup(context, { otpStatus: [429] });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'load' });
    await waitScreen(page, 'welcome');
    await page.locator('[data-guided-email]').click();
    await waitScreen(page, 'email');
    await page.locator('input[name="guided-email"]').fill(EMAIL);
    await page.locator('[data-guided-next]').click();
    await page.waitForTimeout(500);
    const u = await ui(page);
    check(`a 429 on sending the code shows the rate-limit copy and stays on Email (${await screenOf(page)})`, () => { assert.match(u.error, /Too many codes/); });
    await context.close();
  }
} finally {
  await browser.close();
  stopVite();
}

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
