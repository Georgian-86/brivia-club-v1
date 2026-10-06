// Iteration 3, Task 8: the 4-step signup (UX_SPEC flow A) and the completion re-entry, against stubbed Supabase.
// Never touches a real Supabase project. Playwright is NOT a repo dependency; see tests/e2e/README.md.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node tests/e2e/onboarding.spec.mjs
//
// Asserts (Review Focus 4 and 5, client side):
// * 4 steps reading "STEP n OF 4" (aria-valuemax 4) at 375 px and 1440 px, no City/State inputs, no horizontal scroll;
// * geolocation granted: asked only after the privacy explainer is visible, with { enableHighAccuracy: false,
//   timeout: 10000, maximumAge: 600000 }; the coordinate appears only in the body of POST rpc/set_home_location, in
//   no URL, no other body, no console line, and never in localStorage / sessionStorage;
// * geolocation denied, missing or timed out: "Pick my city" opens with the fallback copy (never a dead end); the
//   city listbox works from the keyboard and the request goes to rpc/set_home_city; a PT429 shows "Try again later."
//   beside the location step;
// * keyboard-only (Tab, Space, Enter, arrows): 2 interests added, 20 points placed with the steppers, a mode set;
//   at 19 points Next is disabled and "Place all 20 points to continue." shows beside the aria-live counter;
// * submit order saveProfile -> set_home_* -> set_member_interests (points sum to 20) -> the app; profile writes carry
//   no skills, city or state;
// * sensitive interests show the private hint; email confirmation stores no coordinate (only { kind: 'geo' } or
//   { kind: 'city', placeId }); after login a city choice is applied silently and a geo choice re-opens step 2;
//   an applied pending city is dropped from the kept pending profile, so a second login never re-applies it;
// * the gate: an app.html member whose my_onboarding_status().completed is false lands on the first incomplete step.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT || 5198);
const ORIGIN = 'https://stub.supabase.local';
const BASE = `http://127.0.0.1:${PORT}`;
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const LAT = 12.971598;
const LNG = 77.594566;
const COORD_RE = /12\.97|77\.59/;
// Optional: E2E_SCREENSHOTS=<dir> saves viewport screenshots of the key states (for visual review).
const SHOTS = process.env.E2E_SCREENSHOTS || '';
const shot = async (page, name, focusSelector) => {
  if (!SHOTS) return;
  if (focusSelector) await page.locator(focusSelector).first().scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: path.join(SHOTS, name) });
};

const ME = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'new@test.brivia.club';
const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const accessToken = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: ME, role: 'authenticated', exp, aud: 'authenticated' })}.sig`;
const user = { id: ME, aud: 'authenticated', role: 'authenticated', email: EMAIL, user_metadata: { name: 'Nia New' }, app_metadata: {}, created_at: new Date().toISOString() };
const session = { access_token: accessToken, refresh_token: 'stub-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };

const nodes = [
  { id: 'sports', parent_id: null, level: 1, label: 'Sports and fitness', sensitive: false },
  { id: 'sports.racket', parent_id: 'sports', level: 2, label: 'Racket sports', sensitive: false },
  { id: 'sports.racket.tennis', parent_id: 'sports.racket', level: 3, label: 'Tennis', sensitive: false },
  { id: 'sports.racket.badminton', parent_id: 'sports.racket', level: 3, label: 'Badminton', sensitive: false },
  { id: 'games', parent_id: null, level: 1, label: 'Games and puzzles', sensitive: false },
  { id: 'games.board', parent_id: 'games', level: 2, label: 'Board games', sensitive: false },
  { id: 'games.board.chess', parent_id: 'games.board', level: 3, label: 'Chess', sensitive: false },
  { id: 'games.board.chess.blitz', parent_id: 'games.board.chess', level: 4, label: 'Blitz chess', sensitive: false },
  { id: 'wellbeing', parent_id: null, level: 1, label: 'Wellbeing', sensitive: false },
  { id: 'wellbeing.spirituality', parent_id: 'wellbeing', level: 2, label: 'Spirituality', sensitive: false },
  { id: 'wellbeing.spirituality.scripture_study', parent_id: 'wellbeing.spirituality', level: 3, label: 'Scripture study', sensitive: true },
];
const places = [
  { id: 'in-bengaluru', name: 'Bengaluru', region: 'Karnataka', country: 'India' },
  { id: 'in-mumbai', name: 'Mumbai', region: 'Maharashtra', country: 'India' },
  { id: 'in-pune', name: 'Pune', region: 'Maharashtra', country: 'India' },
];
const PURPOSE = "Private interests (like faith, health or orientation) help us understand you. They are never shown to anyone and don't change who you see. If we ever want to use them for matching, we'll ask you again first. You can withdraw any time in Profile → Privacy and account.";
const CONSENT_LABEL = 'I consent to Brivia storing my private interests for this purpose.';

const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };

const waitForServer = async () => {
  for (let i = 0; i < 100; i += 1) {
    try { const res = await fetch(`${BASE}/auth.html`); if (res.ok) return; } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('vite did not start');
};

// One stubbed Supabase per context. opts: signupSession (bool), profileExists, hasCell, interests, homeCityStatus[].
const stubContext = async (context, opts = {}) => {
  const state = {
    profile: opts.profileExists ? { id: ME, name: opts.profileName ?? 'Nia New', full_name: opts.profileName ?? 'Nia New', email: EMAIL, phone: '+91 9876543210', phone_country_code: '+91', phone_number: '9876543210', gender: 'Female', experience: '1–3 years', looking_for: ['Friends'], skills: [] } : null,
    hasCell: Boolean(opts.hasCell),
    adultAt: opts.profileExists && opts.adultDeclared !== false ? '2026-10-05T00:00:00Z' : null,
    declareStatus: [...(opts.declareStatus || [])],
    placeLabel: opts.hasCell ? 'Pune' : null,
    interests: opts.interests || [],
    homeCityStatus: [...(opts.homeCityStatus || [])],
    interestsStatus: [...(opts.interestsStatus || [])],
    consent: false,
  };
  const calls = [];
  const consoleLines = [];
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
    if (p === '/auth/v1/signup') return json(200, opts.signupSession === false ? user : session);
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers });
    if (p.startsWith('/auth/v1/')) return json(200, p.endsWith('/user') ? user : session);
    const wantsObject = (request.headers().accept || '').includes('vnd.pgrst.object');
    if (p === '/rest/v1/profiles') {
      const own = () => ({ ...state.profile, adult_declared_at: state.adultAt });
      if (method === 'POST') {
        const row = JSON.parse(body || '{}');
        state.profile = { ...row, skills: [] };
        return json(201, wantsObject ? own() : [own()]);
      }
      if (method === 'PATCH') {
        if (!state.profile) return wantsObject ? json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }) : json(200, []);
        Object.assign(state.profile, JSON.parse(body || '{}'));
        return json(200, wantsObject ? own() : [own()]);
      }
      if (!state.profile) return wantsObject ? json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }) : json(200, []);
      return json(200, wantsObject ? own() : [own()]);
    }
    // R1: location and interests are refused until the member has declared they are an adult.
    const ADULT_REQUIRED = { code: 'P0001', message: 'adult declaration required', details: null, hint: null };
    if (p === '/rest/v1/rpc/declare_adult') {
      if (!state.profile) return json(404, { code: 'P0002', message: 'profile required' });
      if (JSON.parse(body || '{}').p_notice_version !== '2026-10-05') return json(400, { code: '22023', message: 'stale notice version' });
      const forced = state.declareStatus.shift();
      if (forced === 500) return json(500, { code: 'XX000', message: 'boom' });
      state.adultAt = state.adultAt || new Date().toISOString();
      return route.fulfill({ status: 204, body: '', headers });
    }
    if (['set_home_location', 'set_home_city', 'set_member_interests'].some((n) => p === `/rest/v1/rpc/${n}`) && state.profile && !state.adultAt) return json(400, ADULT_REQUIRED);
    // staleCatalog: a catalog loaded before a node became sensitive (the server still refuses it without consent).
    if (p === '/rest/v1/interest_node') return json(200, opts.staleCatalog ? nodes.map((n) => ({ ...n, sensitive: false })) : nodes);
    if (p === '/rest/v1/place') {
      const or = url.searchParams.get('or') || '';
      const q = (or.match(/name\.ilike\.\*([^*]*)\*/) || [])[1] || '';
      return json(200, places.filter((pl) => !q || pl.name.toLowerCase().includes(q.toLowerCase()) || pl.region.toLowerCase().includes(q.toLowerCase())));
    }
    if (p === '/rest/v1/rpc/set_home_location') {
      if (!state.profile) return json(404, { code: 'P0002', message: 'profile required' });
      state.hasCell = true; state.placeLabel = 'Bengaluru';
      return json(200, 'Bengaluru');
    }
    if (p === '/rest/v1/rpc/set_home_city') {
      if (!state.profile) return json(404, { code: 'P0002', message: 'profile required' });
      const status = state.homeCityStatus.shift() || 200;
      if (status === 429) return json(429, { code: 'PT429', message: 'try again later', details: null, hint: null });
      const place = places.find((pl) => pl.id === JSON.parse(body || '{}').p_place_id);
      if (!place) return json(400, { code: '22023', message: 'invalid place' });
      state.hasCell = true; state.placeLabel = place.name;
      return json(200, place.name);
    }
    if (p === '/rest/v1/rpc/set_member_interests') {
      if (!state.profile) return json(404, { code: 'P0002', message: 'profile required' });
      const items = JSON.parse(body || '{}').p_items || [];
      const forced = state.interestsStatus.shift();
      if (forced === 400) return json(400, { code: '22023', message: 'invalid interests', details: null, hint: null });
      if (items.reduce((s, i) => s + i.points, 0) !== 20) return json(400, { code: '22023', message: 'invalid interests' });
      // Like the server (D-038 R3): a sensitive id needs the separate consent given through set_sensitive_consent.
      if (!state.consent && items.some((i) => nodes.find((n) => n.id === i.interest_id)?.sensitive)) return json(400, { code: '22023', message: 'sensitive consent required', details: null, hint: null });
      state.interests = items.map((i) => ({ interest_id: i.interest_id, label: nodes.find((n) => n.id === i.interest_id)?.label, points: i.points, mode: i.mode }));
      return route.fulfill({ status: 204, body: '', headers });
    }
    if (p === '/rest/v1/rpc/set_sensitive_consent') {
      if (!state.profile) return json(404, { code: 'P0002', message: 'profile required' });
      state.consent = JSON.parse(body || '{}').p_consent === true;
      return route.fulfill({ status: 204, body: '', headers });
    }
    if (p === '/rest/v1/rpc/my_interests') return json(200, state.interests);
    if (p === '/rest/v1/rpc/my_onboarding_status') {
      const points = state.interests.reduce((s, i) => s + i.points, 0);
      return json(200, [{ interests: state.interests.length, points, has_cell: state.hasCell, place_label: state.placeLabel, completed: Boolean(state.profile && state.adultAt && !['', 'New Member'].includes(String(state.profile.name || '').trim()) && state.hasCell && points === 20) }]);
    }
    if (p.startsWith('/rest/v1/rpc/')) return json(200, []);
    if (p.startsWith('/rest/v1/')) return json(200, []);
    return json(200, {});
  });
  await context.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith(ORIGIN), (route) => route.abort());
  await context.routeWebSocket(/stub\.supabase\.local/, (ws) => ws.close());
  if (!opts.realApp) {
    // The app itself is out of scope here: a landing on /app.html is the end of the onboarding flow.
    await context.route(`${BASE}/app.html*`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title><p id="stub-app">app</p>' }));
  }
  // Records each getCurrentPosition call: its options and whether the privacy explainer was visible at that moment.
  await context.addInitScript(() => {
    window.__geoCalls = [];
    const geo = navigator.geolocation;
    if (!geo) return;
    const original = geo.getCurrentPosition.bind(geo);
    geo.getCurrentPosition = (ok, fail, options) => {
      const explainer = document.querySelector('[data-area-explainer]');
      window.__geoCalls.push({ options, explainerVisible: Boolean(explainer && explainer.getClientRects().length && /We keep only a rough ~2 km square, never your exact location\. Other members see a rounded distance or your city, and only once enough people are nearby\./.test(explainer.textContent)) });
      return original(ok, fail, options);
    };
  });
  const posts = (p) => calls.filter((c) => c.method === 'POST' && c.path === p);
  return { state, calls, posts, consoleLines };
};

const newPage = async (context, consoleLines) => {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (msg) => consoleLines.push(msg.text()));
  return { page, errors };
};

const stepLabel = (page) => page.locator('[data-signup-step-label]').textContent();
const visibleStep = (page) => page.evaluate(() => [...document.querySelectorAll('[data-signup-step]')].find((el) => !el.hidden)?.dataset.signupStep);
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const storageDump = (page) => page.evaluate(() => {
  const dump = {};
  for (const [name, store] of [['local', localStorage], ['session', sessionStorage]]) {
    for (let i = 0; i < store.length; i += 1) dump[`${name}:${store.key(i)}`] = store.getItem(store.key(i));
  }
  return dump;
});

// The auth close (×) button and every visible header control: sizes and whether any pair overlaps.
const closeAndHeader = (page) => page.evaluate(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; };
  const close = box(document.querySelector('.auth-close'));
  const others = [...document.querySelectorAll('.auth-panel-top > *')].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden').map(box);
  const overlap = others.some((o) => o.w && o.h && close.x < o.r && o.x < close.r && close.y < o.b && o.y < close.b);
  return { close, overlap };
});
const openSignup = async (page) => {
  await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-signup-step="1"]:not([hidden])', { timeout: 15000 });
  await page.waitForTimeout(300);
};
const fillStepOne = async (page) => {
  const step = page.locator('[data-signup-step="1"]');
  await step.locator('input[name="name"]').fill('Nia New');
  await step.locator('input[name="email"]').fill(EMAIL);
  await step.locator('input[name="phoneNumber"]').fill('98765 43210');
  await step.locator('.gender-option', { hasText: 'FEMALE' }).click();
  await step.locator('select[name="experience"]').selectOption({ index: 2 });
  await step.locator('input[name="adultConfirm"]').check();
  await step.locator('.signup-next').click();
  await page.waitForSelector('[data-signup-step="2"]:not([hidden])');
};
const pickCityByKeyboard = async (page, text = 'Beng') => {
  const input = page.locator('#area-city-search');
  await input.focus();
  await page.keyboard.type(text);
  await page.waitForSelector('#area-city-results [role="option"]');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
};
const clickInterest = (page, label) => page.locator('#interest-results [data-interest-id]', { hasText: label }).first().click();
const fillBudgetWithMouse = async (page, label) => {
  await page.locator('#interest-search').fill(label);
  await clickInterest(page, label);
  for (let i = 0; i < 19; i += 1) await page.getByRole('button', { name: `Add a point to ${label}`, exact: true }).click();
};
const finishStepFour = async (page) => {
  const step = page.locator('[data-signup-step="4"]');
  await step.locator('input[name="password"]').fill('correct horse 1');
  await step.locator('input[name="passwordConfirm"]').fill('correct horse 1');
  await step.locator('[type="submit"]').click();
};
const tabTo = async (page, predicateSrc, max = 60, key = 'Tab') => {
  for (let i = 0; i < max; i += 1) {
    if (await page.evaluate(predicateSrc)) return true;
    await page.keyboard.press(key);
  }
  return page.evaluate(predicateSrc);
};

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: repoRoot,
  env: { ...process.env, VITE_SUPABASE_URL: ORIGIN, VITE_SUPABASE_ANON_KEY: 'stub-anon-key' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });

  // ---------------------------------------------------------------------------------------------------------------
  // 1. 1440 px, geolocation granted, signup returns a session; keyboard-only budget.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.grantPermissions(['geolocation'], { origin: BASE });
    await context.setGeolocation({ latitude: LAT, longitude: LNG });
    const stub = await stubContext(context, { signupSession: true });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await openSignup(page);
    const label1 = await stepLabel(page);
    const valuemax = await page.locator('.signup-progress-track').getAttribute('aria-valuemax');
    const cityInputs = await page.locator('input[name="city"], input[name="state"]').count();
    const stepOneHasIdentity = await page.locator('[data-signup-step="1"] input[name="gender"]').count() > 0 && await page.locator('[data-signup-step="1"] select[name="experience"]').count() === 1;
    check(`1440: "STEP 1 OF 4" and aria-valuemax 4 (got "${label1}", ${valuemax})`, () => { assert.match(label1, /^STEP 1 OF 4\b/); assert.equal(valuemax, '4'); });
    check('1440: no City or State input anywhere', () => assert.equal(cityInputs, 0));
    check('1440: step 1 holds gender and experience', () => assert.ok(stepOneHasIdentity));
    const noScroll1 = await noHorizontalScroll(page);
    check('1440: page does not scroll sideways (step 1)', () => assert.ok(noScroll1));
    await shot(page, 'onboarding-1440-step1-header.png');
    const header1440 = await closeAndHeader(page);
    check(`1440: the close button is 44x44 and overlaps no header control (${JSON.stringify(header1440)})`, () => { assert.ok(header1440.close.w >= 44 && header1440.close.h >= 44); assert.equal(header1440.overlap, false); });
    await fillStepOne(page);
    const label2 = await stepLabel(page);
    const explainerVisible = await page.locator('[data-area-explainer]').isVisible();
    const explainerText = (await page.locator('[data-area-explainer]').textContent()).trim();
    const geoCallsBefore = await page.evaluate(() => window.__geoCalls.length);
    check(`1440: step 2 reads "STEP 2 OF 4" (got "${label2}")`, () => assert.match(label2, /^STEP 2 OF 4\b/));
    check(`1440: privacy explainer visible before any geolocation call ("${explainerText}")`, () => {
      assert.ok(explainerVisible); assert.match(explainerText, /We keep only a rough ~2 km square, never your exact location\. Other members see a rounded distance or your city, and only once enough people are nearby\./); assert.equal(geoCallsBefore, 0);
    });
    // Next is blocked until an area is chosen.
    await page.locator('[data-signup-step="2"] .signup-next').click();
    const stillTwo = await visibleStep(page);
    check('1440: Next on step 2 is blocked without an area', () => assert.equal(stillTwo, '2'));
    await page.locator('[data-area-geo]').click();
    await page.waitForFunction(() => /Got it\. We keep only the ~2 km square you're in\./.test(document.querySelector('[data-area-status]')?.textContent || ''), null, { timeout: 5000 });
    const geoCalls = await page.evaluate(() => window.__geoCalls);
    check(`1440: one geolocation call, after the explainer, with the spec options (${JSON.stringify(geoCalls)})`, () => {
      assert.equal(geoCalls.length, 1);
      assert.equal(geoCalls[0].explainerVisible, true);
      assert.deepEqual(geoCalls[0].options, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
    });
    await shot(page, 'onboarding-1440-step2-geo.png', '[data-area-status]');
    const areaStatus = (await page.locator('[data-area-status]').textContent()).trim();
    check(`1440: the area status never shows the coordinate ("${areaStatus}")`, () => assert.ok(!COORD_RE.test(areaStatus)));
    const domHasCoord = await page.evaluate((src) => new RegExp(src).test(document.documentElement.outerHTML), COORD_RE.source);
    check('1440: the coordinate is nowhere in the DOM', () => assert.equal(domHasCoord, false));
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="3"]:not([hidden])');
    const label3 = await stepLabel(page);
    check(`1440: step 3 reads "STEP 3 OF 4" (got "${label3}")`, () => assert.match(label3, /^STEP 3 OF 4\b/));
    await page.waitForSelector('#interest-results [data-interest-group]', { state: 'attached' });
    const heading3 = (await page.locator('[data-signup-step="3"] .signup-step-heading h2').textContent()).trim();
    check(`1440: step 3 heading is "What you care about" (got "${heading3}")`, () => assert.equal(heading3, 'What you care about'));
    // Escape in the interest search clears it and never leaves the page (the global Escape closes the auth modal).
    await page.locator('#interest-search').fill('chess');
    await page.waitForTimeout(50);
    const helpCount = (await page.locator('#interest-help').textContent()).trim();
    const helpLive = await page.locator('#interest-help').getAttribute('aria-live');
    check(`1440: the result count is announced in #interest-help ("${helpCount}", aria-live ${helpLive})`, () => { assert.equal(helpCount, '2 matches'); assert.equal(helpLive, 'polite'); });
    await page.locator('#interest-search').fill('tennis');
    const helpOne = (await page.locator('#interest-help').textContent()).trim();
    check(`1440: a single match reads "1 match" (got "${helpOne}")`, () => assert.equal(helpOne, '1 match'));
    await page.locator('#interest-search').focus();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const afterEscape = { url: new URL(page.url()).pathname, value: await page.locator('#interest-search').inputValue(), step: await visibleStep(page), label: await stepLabel(page) };
    check(`1440: Escape in #interest-search clears it and keeps the page and progress (${JSON.stringify(afterEscape)})`, () => {
      assert.equal(afterEscape.url, '/auth.html'); assert.equal(afterEscape.value, ''); assert.equal(afterEscape.step, '3'); assert.match(afterEscape.label, /^STEP 3 OF 4\b/);
    });
    // Escape on a step-3 button (outside a text field) does not leave a signup past step 1 either.
    await page.locator('[data-signup-step="3"] .signup-step-prev').focus();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const afterEscape2 = { url: new URL(page.url()).pathname, step: await visibleStep(page) };
    check(`1440: Escape past step 1 keeps the signup open (${JSON.stringify(afterEscape2)})`, () => { assert.equal(afterEscape2.url, '/auth.html'); assert.equal(afterEscape2.step, '3'); });
    // Category grouping (level 2) and selectable levels 3-4 only.
    const groupLabels = await page.locator('#interest-results [data-interest-group]').evaluateAll((els) => els.map((el) => el.dataset.interestGroup));
    const chipIds = await page.locator('#interest-results [data-interest-id]').evaluateAll((els) => els.map((el) => el.dataset.interestId));
    check(`1440: chips grouped by category (${groupLabels.join(',')})`, () => { assert.ok(groupLabels.includes('sports.racket')); assert.ok(groupLabels.includes('games.board')); });
    check('1440: only level 3-4 nodes are selectable chips', () => { assert.ok(chipIds.includes('games.board.chess.blitz')); assert.ok(!chipIds.includes('sports') && !chipIds.includes('sports.racket')); });
    const counter = page.locator('#budget-counter');
    const counterLive = await counter.getAttribute('aria-live');
    const counterStart = (await counter.textContent()).trim();
    check(`1440: counter aria-live=polite, "20 of 20 points left" (got ${counterLive}, "${counterStart}")`, () => { assert.equal(counterLive, 'polite'); assert.equal(counterStart, '20 of 20 points left'); });
    // R2: sensitive interests are not offered until the member opens the consent panel and continues.
    await page.locator('#interest-search').fill('scripture');
    await page.waitForTimeout(150);
    const sensitiveChips = await page.locator('#interest-results [data-interest-id="wellbeing.spirituality.scripture_study"]').count();
    const openButton = page.locator('[data-private-open]');
    const openText = (await openButton.textContent()).trim();
    const openBox = await openButton.boundingBox();
    check(`1440: no sensitive chip before consent (${sensitiveChips}) and the entry reads "Add private interests (optional)" (got "${openText}", ${openBox?.height}px)`, () => {
      assert.equal(sensitiveChips, 0); assert.equal(openText, 'Add private interests (optional)'); assert.ok(openBox.height >= 44);
    });
    await openButton.click();
    const dlg = page.locator('dialog#private-consent');
    const dlgOpen = await dlg.evaluate((el) => el.open);
    const purpose = (await dlg.locator('[data-private-purpose]').textContent()).trim();
    const ticked0 = await dlg.locator('[data-private-checkbox]').isChecked();
    const contDisabled0 = await dlg.locator('[data-private-continue]').isDisabled();
    const labelText = (await dlg.locator('label[for="private-consent-check"]').textContent()).trim();
    const notNowBox = await dlg.locator('[data-private-cancel]').boundingBox();
    const contBox = await dlg.locator('[data-private-continue]').boundingBox();
    const chipsBeforeContinue = await page.locator('#interest-results [data-interest-id="wellbeing.spirituality.scripture_study"]').count();
    check('1440: the consent panel is a real dialog with the purpose copy (no "yet"), an unticked box and Continue disabled', () => {
      assert.ok(dlgOpen); assert.equal(purpose, PURPOSE); assert.ok(!/yet/.test(purpose)); assert.equal(labelText, CONSENT_LABEL);
      assert.equal(ticked0, false); assert.equal(contDisabled0, true); assert.equal(chipsBeforeContinue, 0);
    });
    check(`1440: "Not now" has equal weight to Continue (${JSON.stringify([notNowBox?.width, notNowBox?.height, contBox?.width, contBox?.height])})`, () => {
      assert.ok(notNowBox.height >= 44 && contBox.height >= 44); assert.ok(Math.abs(notNowBox.width - contBox.width) <= 4);
    });
    await page.keyboard.press('Escape');
    const closedByEscape = await dlg.evaluate((el) => !el.open);
    const focusBack = await page.evaluate(() => document.activeElement?.hasAttribute('data-private-open'));
    check('1440: Escape closes the panel and returns focus to the entry button', () => { assert.ok(closedByEscape); assert.ok(focusBack); });
    await openButton.click();
    await dlg.locator('[data-private-cancel]').click();
    check('1440: nothing was sent to set_sensitive_consent by Not now', () => assert.equal(stub.posts('/rest/v1/rpc/set_sensitive_consent').length, 0));
    await openButton.click();
    await dlg.locator('[data-private-checkbox]').check();
    const contEnabled = await dlg.locator('[data-private-continue]').isEnabled();
    await dlg.locator('[data-private-continue]').click();
    await page.waitForSelector('#interest-results [data-interest-id="wellbeing.spirituality.scripture_study"]', { timeout: 3000 }).catch(() => {});
    const chipsAfter = await page.locator('#interest-results [data-interest-id="wellbeing.spirituality.scripture_study"]').count();
    check('1440: ticking enables Continue; after Continue the sensitive chip appears (with no server call yet)', () => {
      assert.ok(contEnabled); assert.equal(chipsAfter, 1); assert.equal(stub.posts('/rest/v1/rpc/set_sensitive_consent').length, 0);
    });
    await page.locator('#interest-search').fill('');
    await page.waitForTimeout(100);

    // Keyboard only from here: add Tennis (Space) and Chess (Enter).
    const search = page.locator('#interest-search');
    await search.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('tennis');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('chess');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const chosen = await page.locator('#budget-list [data-budget-row]').evaluateAll((els) => els.map((el) => el.dataset.budgetRow));
    check(`1440: keyboard added 2 interests (${chosen.join(',')})`, () => assert.deepEqual(chosen, ['sports.racket.tennis', 'games.board.chess']));
    const afterAdd = (await counter.textContent()).trim();
    check(`1440: counter reads 18 left after 2 adds (got "${afterAdd}")`, () => assert.equal(afterAdd, '18 of 20 points left'));
    const reachedPlus = await tabTo(page, () => document.activeElement?.getAttribute('aria-label') === 'Add a point to Tennis');
    check('1440: Tab reaches "Add a point to Tennis"', () => assert.ok(reachedPlus));
    for (let i = 0; i < 17; i += 1) await page.keyboard.press('Space');
    const at19 = (await counter.textContent()).trim();
    const nextThree = page.locator('[data-signup-step="3"] .signup-next');
    const nextDisabled = await nextThree.getAttribute('aria-disabled');
    check(`1440: 19 points placed, "1 of 20 points left" (got "${at19}")`, () => assert.equal(at19, '1 of 20 points left'));
    check(`1440: Next is disabled at 19 points (aria-disabled ${nextDisabled})`, () => assert.equal(nextDisabled, 'true'));
    const reachedNext = await tabTo(page, () => document.activeElement?.matches?.('[data-signup-step="3"] .signup-next'));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const errorText = (await page.locator('#budget-error').textContent()).trim();
    const errorVisible = await page.locator('#budget-error').isVisible();
    const stepAfterBlocked = await visibleStep(page);
    const errorBesideCounter = await page.evaluate(() => document.querySelector('#budget-error')?.parentElement === document.querySelector('#budget-counter')?.parentElement);
    check(`1440: Enter on the disabled Next shows "Place all 20 points to continue." beside the counter (got "${errorText}")`, () => {
      assert.ok(reachedNext); assert.ok(errorVisible); assert.equal(errorText, 'Place all 20 points to continue.'); assert.ok(errorBesideCounter); assert.equal(stepAfterBlocked, '3');
    });
    await shot(page, 'onboarding-1440-step3-19-points.png', '#budget-error');
    const plusDisabledTotal = await page.getByRole('button', { name: 'Add a point to Tennis', exact: true }).getAttribute('aria-disabled');
    check('1440: "Add a point" stays enabled with 1 point left', () => assert.notEqual(plusDisabledTotal, 'true'));
    const reachedChessPlus = await tabTo(page, () => document.activeElement?.getAttribute('aria-label') === 'Add a point to Chess', 60, 'Shift+Tab');
    await page.keyboard.press('Space');
    await page.keyboard.press('Space'); // a 21st point is refused
    const at20 = (await counter.textContent()).trim();
    const tennisPoints = (await page.locator('[data-budget-row="sports.racket.tennis"] [data-budget-points]').textContent()).trim();
    const chessPoints = (await page.locator('[data-budget-row="games.board.chess"] [data-budget-points]').textContent()).trim();
    check(`1440: 20 points placed, total never over 20 (counter "${at20}", ${tennisPoints}+${chessPoints})`, () => {
      assert.ok(reachedChessPlus); assert.equal(at20, '0 of 20 points left'); assert.equal(Number(tennisPoints) + Number(chessPoints), 20);
    });
    await shot(page, 'onboarding-1440-step3-budget.png', '#budget-list');
    const errorAfter = (await page.locator('#budget-error').textContent()).trim();
    const nextEnabled = await nextThree.getAttribute('aria-disabled');
    check(`1440: at 20 points the error clears and Next is enabled (error "${errorAfter}", aria-disabled ${nextEnabled})`, () => { assert.equal(errorAfter, ''); assert.notEqual(nextEnabled, 'true'); });
    // Mode: Tab into Tennis's radio group (lands on Play), ArrowRight selects Teach.
    const reachedMode = await tabTo(page, () => document.activeElement?.matches?.('input[type="radio"][name="mode-sports.racket.tennis"]'), 60, 'Shift+Tab');
    await page.keyboard.press('ArrowRight');
    const tennisMode = await page.locator('input[name="mode-sports.racket.tennis"]:checked').getAttribute('value');
    check(`1440: keyboard set Tennis's mode to teach (got ${tennisMode})`, () => { assert.ok(reachedMode); assert.equal(tennisMode, 'teach'); });
    const modeLabels = await page.locator('[data-budget-row="sports.racket.tennis"] .mode-option span').allTextContents();
    check(`1440: segmented control has visible labels Learn · Play · Teach · Build (${modeLabels.join('|')})`, () => assert.deepEqual(modeLabels.map((s) => s.trim()), ['Learn', 'Play', 'Teach', 'Build']));
    // Looking-for, then Next to step 4.
    await page.locator('.looking-search').click();
    await page.locator('#looking-results [data-looking-option]').first().click();
    await nextThree.click();
    await page.waitForSelector('[data-signup-step="4"]:not([hidden])');
    const label4 = await stepLabel(page);
    check(`1440: step 4 reads "STEP 4 OF 4" (got "${label4}")`, () => assert.match(label4, /^STEP 4 OF 4\b/));
    const noScroll4 = await noHorizontalScroll(page);
    check('1440: page does not scroll sideways (step 4)', () => assert.ok(noScroll4));
    const callsBeforeSubmit = stub.calls.length;
    await finishStepFour(page);
    await page.waitForURL(/\/app\.html/, { timeout: 15000 });
    const flow = stub.calls.slice(callsBeforeSubmit).filter((c) => c.method !== 'GET' && c.method !== 'OPTIONS').map((c) => `${c.method} ${c.path}`);
    const order = ['/auth/v1/signup', '/rest/v1/profiles', '/rest/v1/rpc/declare_adult', '/rest/v1/rpc/set_home_location', '/rest/v1/rpc/set_member_interests'].map((p) => flow.findIndex((f) => f.endsWith(p)));
    check(`1440: submit order signup -> profile -> declare_adult -> set_home_location -> set_member_interests -> app (${flow.join(' | ')})`, () => {
      assert.ok(order.every((i) => i >= 0)); assert.deepEqual([...order].sort((a, b) => a - b), order);
    });
    const interestsBody = JSON.parse(stub.posts('/rest/v1/rpc/set_member_interests').at(-1)?.body || '{}');
    const payload = interestsBody.p_items || [];
    check(`1440: set_member_interests points sum to 20 with modes (${JSON.stringify(payload)})`, () => {
      assert.equal(payload.reduce((s, i) => s + i.points, 0), 20);
      assert.deepEqual(payload.map((i) => i.interest_id), ['sports.racket.tennis', 'games.board.chess']);
      assert.deepEqual(payload.map((i) => i.mode), ['teach', 'play']);
    });
    const locationCalls = stub.posts('/rest/v1/rpc/set_home_location');
    check(`1440: exactly one set_home_location POST with the coordinate in the body (${locationCalls.map((c) => c.body).join(' ; ')})`, () => {
      assert.equal(locationCalls.length, 1);
      assert.deepEqual(JSON.parse(locationCalls[0].body), { lat: LAT, lng: LNG });
      assert.ok(!COORD_RE.test(locationCalls[0].url));
    });
    const leaks = stub.calls.filter((c) => (COORD_RE.test(c.url) || COORD_RE.test(c.body)) && !(c.method === 'POST' && c.path === '/rest/v1/rpc/set_home_location'));
    check(`1440: the coordinate is in no URL and no other body (${leaks.map((c) => `${c.method} ${c.path}`).join(', ')})`, () => assert.equal(leaks.length, 0));
    check('1440: set_home_city not called on the geo path', () => assert.equal(stub.posts('/rest/v1/rpc/set_home_city').length, 0));
    check('1440: with no sensitive pick set_sensitive_consent was never called, even after the panel was used', () => assert.equal(stub.posts('/rest/v1/rpc/set_sensitive_consent').length, 0));
    const profileWrites = stub.calls.filter((c) => c.path === '/rest/v1/profiles' && ['POST', 'PATCH'].includes(c.method)).map((c) => JSON.parse(c.body || '{}'));
    check(`1440: profile writes carry no skills, city or state (${profileWrites.map((w) => Object.keys(w).join(',')).join(' ; ')})`, () => {
      assert.ok(profileWrites.length >= 1);
      profileWrites.forEach((w) => { assert.ok(!('skills' in w)); assert.ok(!('city' in w)); assert.ok(!('state' in w)); });
    });
    const signupBody = JSON.parse(stub.posts('/auth/v1/signup')[0]?.body || '{}');
    check(`1440: signup metadata carries no skills, city, state or interests (${Object.keys(signupBody.data || {}).join(',')})`, () => {
      ['skills', 'city', 'state', 'interests', 'orbit'].forEach((key) => assert.ok(!(key in (signupBody.data || {})), key));
    });
    const stored = await storageDump(page);
    check(`1440: no coordinate in localStorage or sessionStorage (${Object.keys(stored).join(',')})`, () => assert.ok(!Object.values(stored).some((v) => COORD_RE.test(v || ''))));
    check('1440: no pending profile left behind after a session signup', () => assert.ok(!('local:brivia-pending-profile' in stored)));
    check('1440: the coordinate never reaches the console', () => assert.ok(!stub.consoleLines.some((line) => COORD_RE.test(line))));
    check('1440: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 2. 375 px, geolocation denied: city fallback; PT429 once; 44 px targets.
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    await context.grantPermissions([], { origin: BASE }); // geolocation not granted: getCurrentPosition fails with PERMISSION_DENIED
    const stub = await stubContext(context, { signupSession: true, homeCityStatus: [429] });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await openSignup(page);
    const label1 = await stepLabel(page);
    const valuemax = await page.locator('.signup-progress-track').getAttribute('aria-valuemax');
    check(`375: "STEP 1 OF 4", aria-valuemax 4 (got "${label1}", ${valuemax})`, () => { assert.match(label1, /^STEP 1 OF 4\b/); assert.equal(valuemax, '4'); });
    const cityInputs = await page.locator('input[name="city"], input[name="state"]').count();
    check('375: no input[name=city] or input[name=state]', () => assert.equal(cityInputs, 0));
    const noScroll1 = await noHorizontalScroll(page);
    check('375: no horizontal scroll (step 1)', () => assert.ok(noScroll1));
    await shot(page, 'onboarding-375-step1.png');
    const header375 = await closeAndHeader(page);
    check(`375: the close button is 44x44 and overlaps no header control (${JSON.stringify(header375)})`, () => { assert.ok(header375.close.w >= 44 && header375.close.h >= 44); assert.equal(header375.overlap, false); });
    await fillStepOne(page);
    const label2 = await stepLabel(page);
    check(`375: "STEP 2 OF 4" (got "${label2}")`, () => assert.match(label2, /^STEP 2 OF 4\b/));
    const pickerHiddenBefore = await page.locator('[data-area-picker]').isHidden();
    await page.locator('[data-area-geo]').click();
    await page.waitForSelector('[data-area-picker]:not([hidden])', { timeout: 15000 });
    const fallback = (await page.locator('[data-area-fallback]').textContent()).trim();
    check(`375: denial opens "Pick my city" with the fallback copy (got "${fallback}")`, () => { assert.ok(pickerHiddenBefore); assert.equal(fallback, 'No problem. Pick your city instead.'); });
    const comboAttrs = await page.locator('#area-city-search').evaluate((el) => ({ role: el.getAttribute('role'), controls: el.getAttribute('aria-controls'), label: el.labels?.[0]?.textContent?.trim() || '' }));
    check(`375: the city search is a labelled combobox over a listbox (${JSON.stringify(comboAttrs)})`, () => { assert.equal(comboAttrs.role, 'combobox'); assert.equal(comboAttrs.controls, 'area-city-results'); assert.ok(comboAttrs.label.length > 0); });
    await shot(page, 'onboarding-375-step2-fallback.png', '[data-area-fallback]');
    await pickCityByKeyboard(page);
    const status = (await page.locator('[data-area-status]').textContent()).trim();
    check(`375: keyboard picked Bengaluru (status "${status}")`, () => assert.match(status, /Bengaluru/));
    const areaButtons = await page.locator('[data-area-geo], [data-area-city]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    check(`375: area buttons are at least 44 px tall (${areaButtons.join(',')})`, () => areaButtons.forEach((h) => assert.ok(h >= 44)));
    const noScroll2 = await noHorizontalScroll(page);
    check('375: no horizontal scroll (step 2)', () => assert.ok(noScroll2));
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="3"]:not([hidden])');
    await page.waitForSelector('#interest-results [data-interest-group]', { state: 'attached' });
    const label3 = await stepLabel(page);
    check(`375: "STEP 3 OF 4" (got "${label3}")`, () => assert.match(label3, /^STEP 3 OF 4\b/));
    await fillBudgetWithMouse(page, 'Badminton');
    const sizes = await page.locator('[data-budget-row] .budget-step, [data-budget-row] .mode-option span, [data-budget-row] .budget-remove').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    check(`375: steppers, mode segments and remove are at least 44x44 px (${JSON.stringify(sizes)})`, () => { assert.ok(sizes.length >= 7); sizes.forEach(([w, h]) => { assert.ok(w >= 44 && h >= 44); }); });
    await shot(page, 'onboarding-375-step3-budget.png', '#budget-list');
    await page.locator('#interest-search').fill('scripture');
    await shot(page, 'onboarding-375-step3-private-hint.png', '#interest-results');
    await page.locator('#interest-search').fill('');
    const noScroll3 = await noHorizontalScroll(page);
    check('375: no horizontal scroll (step 3)', () => assert.ok(noScroll3));
    await page.locator('.looking-search').click();
    await page.locator('#looking-results [data-looking-option]').first().click();
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="4"]:not([hidden])');
    const label4 = await stepLabel(page);
    check(`375: "STEP 4 OF 4" (got "${label4}")`, () => assert.match(label4, /^STEP 4 OF 4\b/));
    // R12: a photo that cannot be re-encoded stops the submit BEFORE any account or profile write, on step 4,
    // with the inline error linked to the photo field.
    await page.locator('[data-signup-step="4"] input[name="password"]').fill('correct horse 1');
    await page.locator('[data-signup-step="4"] input[name="passwordConfirm"]').fill('correct horse 1');
    await page.locator('.photo-input').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not an image') });
    await page.locator('[data-signup-step="4"] [type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#profile-photo-error')?.hidden, null, { timeout: 8000 });
    const photoFail = await page.evaluate(() => ({ text: document.querySelector('#profile-photo-error')?.textContent, role: document.querySelector('#profile-photo-error')?.getAttribute('role'), linked: document.querySelector('.photo-input')?.getAttribute('aria-describedby'), step4: !document.querySelector('[data-signup-step="4"]')?.hidden }));
    check(`375: unprocessable signup photo shows the inline error on step 4 (${JSON.stringify(photoFail)})`, () => {
      assert.equal(photoFail.text, "We couldn't process this photo. Try a JPG or PNG.");
      assert.equal(photoFail.role, 'alert');
      assert.equal(photoFail.linked, 'profile-photo-error');
      assert.equal(photoFail.step4, true);
    });
    check('375: no signUp or profile write before the photo problem is fixed', () => {
      assert.equal(stub.posts('/auth/v1/signup').length, 0);
      assert.equal(stub.posts('/rest/v1/profiles').length, 0);
    });
    await page.locator('.photo-input').setInputFiles([]);
    await finishStepFour(page);
    // The first set_home_city answers PT429: back on step 2 with "Try again later." beside the location step.
    await page.waitForSelector('[data-signup-step="2"]:not([hidden])', { timeout: 15000 });
    await page.waitForFunction(() => (document.querySelector('[data-area-error]')?.textContent || '').trim() === 'Try again later.', null, { timeout: 5000 });
    const errorInStep = await page.evaluate(() => document.querySelector('[data-signup-step="2"]')?.contains(document.querySelector('[data-area-error]')));
    check('375: PT429 shows "Try again later." inside the location step', () => assert.ok(errorInStep));
    check('375: no interests sent after a failed location step', () => assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 0));
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="4"]:not([hidden])');
    await page.locator('[data-signup-step="4"] [type="submit"]').click();
    await page.waitForURL(/\/app\.html/, { timeout: 15000 });
    const cityCalls = stub.posts('/rest/v1/rpc/set_home_city').map((c) => JSON.parse(c.body || '{}'));
    check(`375: the city goes to rpc/set_home_city (${JSON.stringify(cityCalls)})`, () => { assert.equal(cityCalls.length, 2); cityCalls.forEach((b) => assert.deepEqual(b, { p_place_id: 'in-bengaluru' })); });
    check('375: no set_home_location on the denied path', () => assert.equal(stub.posts('/rest/v1/rpc/set_home_location').length, 0));
    const payload = JSON.parse(stub.posts('/rest/v1/rpc/set_member_interests').at(-1)?.body || '{}').p_items || [];
    check(`375: set_member_interests sums to 20 (${JSON.stringify(payload)})`, () => assert.deepEqual(payload, [{ interest_id: 'sports.racket.badminton', points: 20, mode: 'play' }]));
    check('375: only one signUp call (the retry reused the session)', () => assert.equal(stub.posts('/auth/v1/signup').length, 1));
    check('375: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 3. No geolocation API, and a geolocation timeout: both fall back to "Pick my city".
  for (const variant of ['missing', 'timeout']) {
    const context = await browser.newContext({ viewport: { width: 1024, height: 800 } });
    await context.addInitScript((kind) => {
      if (kind === 'missing') { try { delete Navigator.prototype.geolocation; } catch { /* ignore */ } Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true }); }
      if (kind === 'timeout') navigator.geolocation.getCurrentPosition = (ok, fail) => setTimeout(() => fail({ code: 3, message: 'Timeout expired', TIMEOUT: 3 }), 50);
    }, variant);
    const stub = await stubContext(context, { signupSession: true });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await openSignup(page);
    await fillStepOne(page);
    await page.locator('[data-area-geo]').click();
    await page.waitForSelector('[data-area-picker]:not([hidden])', { timeout: 15000 });
    const fallback = (await page.locator('[data-area-fallback]').textContent()).trim();
    check(`${variant}: geolocation ${variant} falls back to "Pick my city" (got "${fallback}")`, () => assert.equal(fallback, 'No problem. Pick your city instead.'));
    const focused = await page.evaluate(() => document.activeElement?.id);
    check(`${variant}: focus moves to the city search (got ${focused})`, () => assert.equal(focused, 'area-city-search'));
    check(`${variant}: no uncaught page errors`, () => assert.deepEqual(errors, []));
    await context.close();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 4. Email confirmation (no session) with a geo choice: the pending profile holds no coordinate; after login the
  //    interests are applied and step 2 re-opens (the coordinate is gone with the page).
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.grantPermissions(['geolocation'], { origin: BASE });
    await context.setGeolocation({ latitude: LAT, longitude: LNG });
    const stub = await stubContext(context, { signupSession: false });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await openSignup(page);
    await fillStepOne(page);
    await page.locator('[data-area-geo]').click();
    await page.waitForFunction(() => /Got it\. We keep only the ~2 km square you're in\./.test(document.querySelector('[data-area-status]')?.textContent || ''), null, { timeout: 5000 });
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('#interest-results [data-interest-group]', { state: 'attached' });
    await fillBudgetWithMouse(page, 'Chess');
    await page.locator('.looking-search').click();
    await page.locator('#looking-results [data-looking-option]').first().click();
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await finishStepFour(page);
    await page.waitForSelector('#auth-success:not([hidden])', { timeout: 15000 });
    const stored = await storageDump(page);
    const pendingRaw = stored['local:brivia-pending-profile'] || '';
    const pending = JSON.parse(pendingRaw || 'null');
    const keyDeep = (value, keys) => (value && typeof value === 'object') ? Object.entries(value).some(([k, v]) => keys.includes(k) || keyDeep(v, keys)) : false;
    check(`email path: pending profile stored with orbit { kind: 'geo' } and the interests as { id, points, mode } (${pendingRaw.slice(0, 200)})`, () => {
      assert.deepEqual(pending.orbit, { kind: 'geo' });
      assert.deepEqual(pending.interests, [{ id: 'games.board.chess', points: 20, mode: 'play' }]);
      assert.ok(!pendingRaw.includes('Chess'), 'no labels');
      assert.equal(typeof pending.savedAt, 'number');
      assert.ok(Math.abs(Date.now() - pending.savedAt) < 120000);
    });
    check('email path: the pending profile records adultDeclared: true', () => assert.equal(pending.adultDeclared, true));
    check('email path: pending profile has no lat / lng / latitude / longitude key and no 12.97', () => {
      assert.equal(keyDeep(pending, ['lat', 'lng', 'latitude', 'longitude']), false);
      assert.ok(!pendingRaw.includes('12.97'));
    });
    check('email path: nothing in storage carries the coordinate', () => assert.ok(!Object.values(stored).some((v) => COORD_RE.test(v || ''))));
    check('email path: no location or interest RPC before a session exists', () => {
      assert.equal(stub.posts('/rest/v1/rpc/set_home_location').length, 0); assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 0);
    });
    check('email path: the coordinate never left the browser', () => assert.ok(!stub.calls.some((c) => COORD_RE.test(c.url) || COORD_RE.test(c.body))));
    // Later: log in on a fresh page load (the in-memory coordinate is gone). The query forces a real reload.
    await page.goto(`${BASE}/auth.html?later=1#login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-form');
    await page.locator('#login-form input[name="email"]').fill(EMAIL);
    await page.locator('#login-form input[name="password"]').fill('correct horse 1');
    await page.locator('#login-form .auth-submit').click();
    await page.waitForSelector('[data-signup-step="2"]:not([hidden])', { timeout: 15000 });
    const label = await stepLabel(page);
    check(`email path: after login a geo choice re-opens step 2 (got "${label}")`, () => assert.match(label, /^STEP 2 OF 4\b/));
    const applied = JSON.parse(stub.posts('/rest/v1/rpc/set_member_interests').at(-1)?.body || '{}').p_items || [];
    check(`email path: the stored interests were applied after login (${JSON.stringify(applied)})`, () => assert.deepEqual(applied, [{ interest_id: 'games.board.chess', points: 20, mode: 'play' }]));
    check('email path: no set_home_location without a fresh location', () => assert.equal(stub.posts('/rest/v1/rpc/set_home_location').length, 0));
    const afterLogin = await storageDump(page);
    check('email path: the pending profile is cleared after login', () => assert.ok(!('local:brivia-pending-profile' in afterLogin)));
    // Finish: pick a city, then the remaining steps are already satisfied; submit lands in the app.
    await page.locator('[data-area-city]').click();
    await pickCityByKeyboard(page, 'Pun');
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="3"]:not([hidden])');
    const prefilled = await page.locator('#budget-list [data-budget-row]').evaluateAll((els) => els.map((el) => el.dataset.budgetRow));
    check(`email path: step 3 is prefilled from my_interests (${prefilled.join(',')})`, () => assert.deepEqual(prefilled, ['games.board.chess']));
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="4"]:not([hidden])');
    await page.locator('[data-signup-step="4"] [type="submit"]').click();
    await page.waitForURL(/\/app\.html/, { timeout: 15000 });
    const city = stub.posts('/rest/v1/rpc/set_home_city').map((c) => JSON.parse(c.body || '{}'));
    check(`email path: completion sends the picked city (${JSON.stringify(city)})`, () => assert.deepEqual(city, [{ p_place_id: 'in-pune' }]));
    check('email path: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 5. Email confirmation with a city choice: after login it is applied silently and the member goes to the app.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pending = { name: 'Nia New', email: EMAIL, phone: '+91 9876543210', phoneCountryCode: '+91', phoneNumber: '9876543210', gender: 'Female', experience: '1–3 years', lookingFor: 'Friends', adultDeclared: true, interests: [{ id: 'sports.racket.tennis', points: 20, mode: 'learn' }], orbit: { kind: 'city', placeId: 'in-mumbai' }, savedAt: Date.now() };
    await context.addInitScript(([value]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('brivia-pending-profile', value); sessionStorage.setItem('seeded', '1'); } }, [JSON.stringify(pending)]);
    const stub = await stubContext(context, { signupSession: false });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await page.goto(`${BASE}/auth.html#login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-form');
    await page.locator('#login-form input[name="email"]').fill(EMAIL);
    await page.locator('#login-form input[name="password"]').fill('correct horse 1');
    await page.locator('#login-form .auth-submit').click();
    await page.waitForURL(/\/app\.html/, { timeout: 15000 });
    const city = stub.posts('/rest/v1/rpc/set_home_city').map((c) => JSON.parse(c.body || '{}'));
    const interests = JSON.parse(stub.posts('/rest/v1/rpc/set_member_interests').at(-1)?.body || '{}').p_items || [];
    check(`city pending: applied silently after login (${JSON.stringify(city)})`, () => assert.deepEqual(city, [{ p_place_id: 'in-mumbai' }]));
    check(`city pending: interests applied (${JSON.stringify(interests)})`, () => assert.deepEqual(interests, [{ interest_id: 'sports.racket.tennis', points: 20, mode: 'learn' }]));
    const order = ['/rest/v1/profiles', '/rest/v1/rpc/declare_adult', '/rest/v1/rpc/set_home_city', '/rest/v1/rpc/set_member_interests'].map((p) => stub.calls.findIndex((c) => c.method !== 'GET' && c.path === p));
    check(`city pending: profile, then declare_adult, then city, then interests (${order.join(',')})`, () => { assert.ok(order.every((i) => i >= 0)); assert.deepEqual([...order].sort((a, b) => a - b), order); });
    check('city pending: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 6. The gate: a signed-in member with a profile but no interests is sent from app.html to step 3 of completion.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(([key, value]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); } }, ['sb-stub-auth-token', JSON.stringify(session)]);
    const stub = await stubContext(context, { profileExists: true, hasCell: true, realApp: true });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/auth\.html/, { timeout: 15000 });
    await page.waitForSelector('[data-signup-step="3"]:not([hidden])', { timeout: 15000 });
    const label = await stepLabel(page);
    check(`gate: app.html sends an incomplete member to step 3 (url ${new URL(page.url()).pathname}${new URL(page.url()).search}, "${label}")`, () => assert.match(label, /^STEP 3 OF 4\b/));
    // Back to step 2 shows the current area, already satisfied.
    await page.locator('[data-signup-step="3"] .signup-step-prev').click();
    const status = (await page.locator('[data-area-status]').textContent()).trim();
    check(`gate: step 2 shows the current area (got "${status}")`, () => assert.match(status, /Pune/));
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('#interest-results [data-interest-group]', { state: 'attached' });
    await fillBudgetWithMouse(page, 'Tennis');
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="4"]:not([hidden])');
    // Stop the real app from loading after submit: from here, /app.html is the end of the flow.
    await context.route(`${BASE}/app.html*`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title>' }));
    await page.locator('[data-signup-step="4"] [type="submit"]').click();
    await page.waitForURL(/\/app\.html/, { timeout: 15000 });
    check('gate: completion keeps the current area (no set_home_* call)', () => { assert.equal(stub.posts('/rest/v1/rpc/set_home_city').length, 0); assert.equal(stub.posts('/rest/v1/rpc/set_home_location').length, 0); });
    const interests = JSON.parse(stub.posts('/rest/v1/rpc/set_member_interests').at(-1)?.body || '{}').p_items || [];
    check(`gate: completion sends the interests (${JSON.stringify(interests)})`, () => assert.deepEqual(interests, [{ interest_id: 'sports.racket.tennis', points: 20, mode: 'play' }]));
    check('gate: no signUp call for an existing member', () => assert.equal(stub.posts('/auth/v1/signup').length, 0));
    check('gate: no uncaught page errors', () => assert.deepEqual(errors.filter((e) => !/Failed to fetch|NetworkError|aborted/i.test(e)), []));
    await context.close();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Helpers for the pending-profile contexts below.
  const loginOnFreshPage = async (page) => {
    await page.goto(`${BASE}/auth.html?later=1#login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#login-form');
    await page.locator('#login-form input[name="email"]').fill(EMAIL);
    await page.locator('#login-form input[name="password"]').fill('correct horse 1');
    await page.locator('#login-form .auth-submit').click();
  };
  const seedPending = (context, pending) => context.addInitScript(([value]) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem('brivia-pending-profile', value); sessionStorage.setItem('seeded', '1'); }
  }, [JSON.stringify(pending)]);
  const basePending = { name: 'Nia New', email: EMAIL, phone: '+91 9876543210', phoneCountryCode: '+91', phoneNumber: '9876543210', gender: 'Female', experience: '1–3 years', lookingFor: 'Friends', adultDeclared: true };

  // 7. Email confirmation with a sensitive pick: it is left out of the pending profile (privateOmitted); after login the
  //    city is applied, step 3 opens prefilled (labels from the taxonomy) with a one-line note asking for private
  //    interests again. Sensitive picks are hidden in the picker until the consent step ships (D-038 R3, fix round 1
  //    M-5), so the pending profile such a signup stores is seeded directly.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await seedPending(context, { ...basePending, interests: [{ id: 'games.board.chess', points: 19, mode: 'play' }], privateOmitted: true, orbit: { kind: 'city', placeId: 'in-bengaluru' }, savedAt: Date.now() });
    const stub = await stubContext(context, { signupSession: false });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    await page.waitForSelector('[data-signup-step="3"]:not([hidden])', { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('[data-budget-row="games.board.chess"] .budget-label')?.textContent === 'Chess', null, { timeout: 5000 }).catch(() => {});
    const note = (await page.locator('[data-budget-note]').textContent()).trim();
    const noteVisible = await page.locator('[data-budget-note]').isVisible();
    const row = { label: (await page.locator('[data-budget-row="games.board.chess"] .budget-label').textContent()).trim(), points: (await page.locator('[data-budget-row="games.board.chess"] [data-budget-points]').textContent()).trim() };
    check(`private: after login step 3 shows the note ("${note}")`, () => { assert.ok(noteVisible); assert.match(note, /private interests/i); });
    check(`private: the budget is prefilled from the pending list with taxonomy labels (${JSON.stringify(row)})`, () => assert.deepEqual(row, { label: 'Chess', points: '19' }));
    check('private: the city was applied silently, the incomplete interests were not sent', () => {
      assert.deepEqual(stub.posts('/rest/v1/rpc/set_home_city').map((c) => JSON.parse(c.body)), [{ p_place_id: 'in-bengaluru' }]);
      assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 0);
    });
    const after = await storageDump(page);
    check('private: pending profile removed after login', () => assert.ok(!('local:brivia-pending-profile' in after)));
    check('private: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 7b. R2: a stale catalog still lets a sensitive pick through; the server refuses it without consent. The client opens
  //     the consent panel with "Private interests need your consent first."; after Continue the retry gives the consent
  //     first, then saves.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const stub = await stubContext(context, { staleCatalog: true, realApp: false });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await openSignup(page);
    await fillStepOne(page);
    await page.locator('[data-area-city]').click();
    await pickCityByKeyboard(page);
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('#interest-results [data-interest-group]', { state: 'attached' });
    await page.locator('#interest-search').fill('Chess');
    await clickInterest(page, 'Chess');
    await page.locator('#interest-search').fill('scripture');
    await clickInterest(page, 'Scripture study');
    for (let i = 0; i < 18; i += 1) await page.getByRole('button', { name: 'Add a point to Chess', exact: true }).click();
    await page.locator('.looking-search').click();
    await page.locator('#looking-results [data-looking-option]').first().click();
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await finishStepFour(page);
    await page.waitForSelector('dialog#private-consent[open]', { timeout: 15000 }).catch(() => {});
    const dlgOpen = await page.locator('dialog#private-consent').evaluate((el) => el.open);
    const message = (await page.locator('[data-private-message]').textContent()).trim();
    const consentStep = await stepLabel(page);
    check(`consent: a server refusal opens the consent panel with the message ("${message}")`, () => {
      assert.ok(dlgOpen); assert.match(consentStep, /^STEP 3 OF 4\b/);
      assert.equal(message, 'Private interests need your consent first.');
    });
    check('consent: the app was not opened', () => assert.ok(!/\/app\.html/.test(page.url())));
    await page.locator('[data-private-checkbox]').check();
    await page.locator('[data-private-continue]').click();
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="4"]:not([hidden])');
    await page.locator('[data-signup-step="4"] [type="submit"]').click();
    await page.waitForURL(/\/app\.html/, { timeout: 15000 }).catch(() => {});
    const seq = stub.calls.filter((c) => /set_sensitive_consent|set_member_interests/.test(c.path)).map((c) => `${c.path.split('/').pop()}${c.path.endsWith('consent') ? ':' + JSON.parse(c.body).p_consent : ''}`);
    check(`consent: after Continue the retry gives consent first, then saves (${seq.join(' > ')})`, () => {
      assert.ok(/\/app\.html/.test(page.url()));
      assert.deepEqual(seq, ['set_member_interests', 'set_sensitive_consent:true', 'set_member_interests']);
    });
    check('consent: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 7c. R2: a sensitive pick calls set_sensitive_consent(true) BEFORE set_member_interests; when the save then fails the
  //     client withdraws with set_sensitive_consent(false).
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const stub = await stubContext(context, { interestsStatus: [400], realApp: false });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await openSignup(page);
    await fillStepOne(page);
    await page.locator('[data-area-city]').click();
    await pickCityByKeyboard(page);
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('#interest-results [data-interest-group]', { state: 'attached' });
    await page.locator('[data-private-open]').click();
    await page.locator('[data-private-checkbox]').check();
    await page.locator('[data-private-continue]').click();
    await page.locator('#interest-search').fill('Chess');
    await clickInterest(page, 'Chess');
    await page.locator('#interest-search').fill('scripture');
    await clickInterest(page, 'Scripture study');
    for (let i = 0; i < 18; i += 1) await page.getByRole('button', { name: 'Add a point to Chess', exact: true }).click();
    await page.locator('.looking-search').click();
    await page.locator('#looking-results [data-looking-option]').first().click();
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await finishStepFour(page);
    await page.waitForFunction(() => /could not be saved/.test(document.querySelector('#budget-error')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
    const seqFail = stub.calls.filter((c) => /set_sensitive_consent|set_member_interests/.test(c.path)).map((c) => `${c.path.split('/').pop()}${c.path.endsWith('consent') ? ':' + JSON.parse(c.body).p_consent : ''}`);
    check(`consent: a failed save after consent withdraws it (${seqFail.join(' > ')})`, () => assert.deepEqual(seqFail, ['set_sensitive_consent:true', 'set_member_interests', 'set_sensitive_consent:false']));
    check('consent: the failed attempt leaves no consent on the server', () => assert.equal(stub.state.consent, false));
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="4"]:not([hidden])');
    await page.locator('[data-signup-step="4"] [type="submit"]').click();
    await page.waitForURL(/\/app\.html/, { timeout: 15000 }).catch(() => {});
    const items = JSON.parse(stub.posts('/rest/v1/rpc/set_member_interests').at(-1)?.body || '{}').p_items || [];
    check(`consent: the retry succeeds with the sensitive pick (${items.map((i) => i.interest_id).join(',')})`, () => {
      assert.ok(/\/app\.html/.test(page.url())); assert.ok(items.some((i) => i.interest_id === 'wellbeing.spirituality.scripture_study')); assert.equal(stub.state.consent, true);
    });
    check('consent: no uncaught page errors (7c)', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 8. A pending profile older than 7 days is dropped, not applied.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await seedPending(context, { ...basePending, interests: [{ id: 'sports.racket.tennis', points: 20, mode: 'play' }], orbit: { kind: 'city', placeId: 'in-mumbai' }, savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 });
    const stub = await stubContext(context, { signupSession: false });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    await page.waitForSelector('[data-signup-step="1"]:not([hidden])', { timeout: 15000 });
    await page.waitForTimeout(300);
    const after = await storageDump(page);
    check('expired: an 8-day-old pending profile is not applied', () => {
      assert.equal(stub.posts('/rest/v1/rpc/set_home_city').length, 0);
      assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 0);
      assert.equal(stub.calls.filter((c) => c.path === '/rest/v1/profiles' && c.method !== 'GET').length, 0);
    });
    check('expired: the stale pending profile is removed', () => assert.ok(!('local:brivia-pending-profile' in after)));
    check('expired: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 9a. Pending city answered with PT429: step 2 says "Try again later." and the pending profile is kept.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await seedPending(context, { ...basePending, interests: [{ id: 'sports.racket.tennis', points: 20, mode: 'play' }], orbit: { kind: 'city', placeId: 'in-mumbai' }, savedAt: Date.now() });
    const stub = await stubContext(context, { signupSession: false, homeCityStatus: [429] });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    await page.waitForSelector('[data-signup-step="2"]:not([hidden])', { timeout: 15000 });
    const areaErr = (await page.locator('[data-area-error]').textContent()).trim();
    const after = await storageDump(page);
    check(`pending 429: step 2 shows "Try again later." (got "${areaErr}")`, () => assert.equal(areaErr, 'Try again later.'));
    check('pending 429: the pending profile is kept for a retry', () => assert.ok('local:brivia-pending-profile' in after));
    check('pending 429: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 9b. Pending interests rejected: step 3 is prefilled from the pending list with the budget error; pending kept until
  //     the completion succeeds.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await seedPending(context, { ...basePending, interests: [{ id: 'sports.racket.tennis', points: 20, mode: 'build' }], orbit: { kind: 'city', placeId: 'in-mumbai' }, savedAt: Date.now() });
    const stub = await stubContext(context, { signupSession: false, interestsStatus: [400] });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    await page.waitForSelector('[data-signup-step="3"]:not([hidden])', { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('[data-budget-row="sports.racket.tennis"] .budget-label')?.textContent === 'Tennis', null, { timeout: 5000 }).catch(() => {});
    const err = (await page.locator('#budget-error').textContent()).trim();
    const rows = await page.locator('#budget-list [data-budget-row]').evaluateAll((els) => els.map((el) => [el.dataset.budgetRow, el.querySelector('[data-budget-points]').textContent, el.querySelector('input:checked')?.value]));
    const keptDump = await storageDump(page);
    const kept = 'local:brivia-pending-profile' in keptDump;
    const keptPending = JSON.parse(keptDump['local:brivia-pending-profile'] || 'null');
    check(`pending interests rejected: step 3 with the budget error (got "${err}")`, () => assert.equal(err, 'Your interests could not be saved. Please try again.'));
    check(`pending interests rejected: budget prefilled from the pending list (${JSON.stringify(rows)})`, () => assert.deepEqual(rows, [['sports.racket.tennis', '20', 'build']]));
    check('pending interests rejected: the pending profile is kept', () => assert.ok(kept));
    check(`pending interests rejected: the applied city is dropped from the kept pending profile (${JSON.stringify(keptPending?.orbit ?? null)})`, () => {
      assert.ok(keptPending && !('orbit' in keptPending));
      assert.deepEqual(keptPending.interests, [{ id: 'sports.racket.tennis', points: 20, mode: 'build' }]);
    });
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="4"]:not([hidden])');
    await page.locator('[data-signup-step="4"] [type="submit"]').click();
    await page.waitForURL(/\/app\.html/, { timeout: 15000 });
    const final = await storageDump(page);
    check('pending interests rejected: completion succeeds and clears the pending profile', () => {
      assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 2);
      assert.ok(!('local:brivia-pending-profile' in final));
    });
    check('pending interests rejected: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 9c. Minor 1: the city applied at the first login is not applied again at a second login (each set_home_city counts
  //     toward the 3-per-24 h location cap), even though the interests failed both times and the pending profile stays.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await seedPending(context, { ...basePending, interests: [{ id: 'sports.racket.tennis', points: 20, mode: 'build' }], orbit: { kind: 'city', placeId: 'in-mumbai' }, savedAt: Date.now() });
    const stub = await stubContext(context, { signupSession: false, interestsStatus: [400, 400] });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    await page.waitForSelector('[data-signup-step="3"]:not([hidden])', { timeout: 15000 });
    // Sign out locally (drop the stored session), then log in again on a fresh page load.
    await page.evaluate(() => { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); });
    await loginOnFreshPage(page);
    await page.waitForSelector('[data-signup-step="3"]:not([hidden])', { timeout: 15000 });
    await page.waitForTimeout(300);
    const cityCalls = stub.posts('/rest/v1/rpc/set_home_city').length;
    const interestCalls = stub.posts('/rest/v1/rpc/set_member_interests').length;
    check(`second login: set_home_city is not called again (${cityCalls} calls; set_member_interests ${interestCalls})`, () => {
      assert.equal(cityCalls, 1);
      assert.equal(interestCalls, 2);
    });
    check('second login: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 10. One 22023 from set_member_interests during a session signup: back to step 3 with the error beside the counter;
  //     the error clears when step 3 is entered again; the retry succeeds without a second location call.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const stub = await stubContext(context, { signupSession: true, interestsStatus: [400] });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await openSignup(page);
    await fillStepOne(page);
    await page.locator('[data-area-city]').click();
    await pickCityByKeyboard(page);
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('#interest-results [data-interest-group]', { state: 'attached' });
    await fillBudgetWithMouse(page, 'Badminton');
    await page.locator('.looking-search').click();
    await page.locator('#looking-results [data-looking-option]').first().click();
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await finishStepFour(page);
    await page.waitForSelector('[data-signup-step="3"]:not([hidden])', { timeout: 15000 });
    await page.waitForFunction(() => (document.querySelector('#budget-error')?.textContent || '').trim().length > 0, null, { timeout: 5000 });
    const err = (await page.locator('#budget-error').textContent()).trim();
    const beside = await page.evaluate(() => document.querySelector('#budget-error')?.parentElement === document.querySelector('#budget-counter')?.parentElement);
    check(`22023: back on step 3 with the error beside the counter (got "${err}")`, () => { assert.equal(err, 'Your interests could not be saved. Please try again.'); assert.ok(beside); });
    await page.locator('[data-signup-step="3"] .signup-step-prev').click();
    const cityLabel = (await page.locator('[data-area-status]').textContent()).trim();
    check(`R9: a saved city pick reads "(city-wide)" exactly once (got "${cityLabel}")`, () => assert.equal(cityLabel, 'Your area: Bengaluru (city-wide). Choose again to change it.'));
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="3"]:not([hidden])');
    const cleared = (await page.locator('#budget-error').textContent()).trim();
    check(`22023: the error clears when step 3 is entered again (got "${cleared}")`, () => assert.equal(cleared, ''));
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="4"]:not([hidden])');
    await page.locator('[data-signup-step="4"] [type="submit"]').click();
    await page.waitForURL(/\/app\.html/, { timeout: 15000 });
    check('22023: the retry succeeds without a second location call', () => {
      assert.equal(stub.posts('/rest/v1/rpc/set_home_city').length, 1);
      assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 2);
      assert.equal(stub.posts('/auth/v1/signup').length, 1);
    });
    check('22023: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 11. Re-entry without a real name ('New Member'): completion opens at step 1 with an empty name field.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(([key, value]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); } }, ['sb-stub-auth-token', JSON.stringify({ ...session, user: { ...user, user_metadata: {} } })]);
    const stub = await stubContext(context, { profileExists: true, profileName: 'New Member', hasCell: true, interests: [{ interest_id: 'sports.racket.tennis', label: 'Tennis', points: 20, mode: 'play' }] });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await page.goto(`${BASE}/auth.html?complete-profile=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-signup-step="1"]:not([hidden])', { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('#signup-form')?.dataset.completion === '1' || document.querySelector('[data-auth-view="signup"].is-active'), null, { timeout: 5000 });
    const label = await stepLabel(page);
    const name = await page.locator('[data-signup-step="1"] input[name="name"]').inputValue();
    check(`no name: re-entry opens step 1 (got "${label}")`, () => assert.match(label, /^STEP 1 OF 4\b/));
    check(`no name: "New Member" is not prefilled (got "${name}")`, () => assert.equal(name, ''));
    check('no name: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 12. Iteration 4, R1 + R11 (client): the 18+ step, honest notices, the step-3 rename, declare_adult order.
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const stub = await stubContext(context, { signupSession: true });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await openSignup(page);
    const s1 = page.locator('[data-signup-step="1"]');
    const stepCounterVisible = await page.locator('.auth-step').isVisible();
    check('18+: the "01 / 02" counter is hidden during signup', () => assert.equal(stepCounterVisible, false));
    const boxLabel = (await s1.locator('.adult-row').textContent()).trim().replace(/\s+/g, ' ');
    const helper = (await s1.locator('#adult-help').textContent()).trim();
    const rowHeight = await s1.locator('.adult-row').evaluate((el) => el.getBoundingClientRect().height);
    const box = s1.locator('input[name="adultConfirm"]');
    const lastBeforeNext = await s1.evaluate((el) => { const next = el.querySelector('.signup-next'); return next.previousElementSibling?.classList.contains('adult-confirm'); });
    check(`18+: label "I confirm I'm 18 or older." and helper text (got "${boxLabel}" / "${helper}")`, () => {
      assert.ok(boxLabel.startsWith("I confirm I'm 18 or older."));
      assert.equal(helper, "Brivia is for adults only. We don't ask for your date of birth.");
    });
    check(`18+: the row is at least 44 px tall (${rowHeight}) and sits last above Next`, () => { assert.ok(rowHeight >= 44); assert.ok(lastBeforeNext); });
    const link1 = await s1.locator('a[href="/privacy.html"]').evaluate((a) => ({ href: a.getAttribute('href'), target: a.target }));
    check(`18+: step 1 privacy link opens /privacy.html in a new tab (${JSON.stringify(link1)})`, () => assert.deepEqual(link1, { href: '/privacy.html', target: '_blank' }));
    // Without the box: stays on step 1, inline error linked by aria-describedby, box focused, no reportValidity bubble.
    await s1.locator('input[name="name"]').fill('Nia New');
    await s1.locator('input[name="email"]').fill(EMAIL);
    await s1.locator('input[name="phoneNumber"]').fill('98765 43210');
    await s1.locator('.gender-option', { hasText: 'FEMALE' }).click();
    await s1.locator('select[name="experience"]').selectOption({ index: 2 });
    await s1.locator('.signup-next').click();
    await page.waitForTimeout(150);
    const blocked = await page.evaluate(() => {
      const box = document.querySelector('input[name="adultConfirm"]');
      const err = document.querySelector('#adult-error');
      const ids = (box.getAttribute('aria-describedby') || '').split(/\s+/);
      return { step: [...document.querySelectorAll('[data-signup-step]')].find((el) => !el.hidden)?.dataset.signupStep, text: err?.textContent.trim(), describedBy: ids.includes('adult-error'), focused: document.activeElement === box, invalid: box.getAttribute('aria-invalid') };
    });
    check(`18+: Next without the box stays on step 1 with the inline error, linked and focused (${JSON.stringify(blocked)})`, () => {
      assert.equal(blocked.step, '1'); assert.equal(blocked.text, 'You need to be 18 or older to join Brivia.');
      assert.ok(blocked.describedBy); assert.ok(blocked.focused); assert.equal(blocked.invalid, 'true');
    });
    await box.check();
    await s1.locator('.signup-next').click();
    await page.waitForSelector('[data-signup-step="2"]:not([hidden])');
    const errAfter = (await page.locator('#adult-error').textContent()).trim();
    check('18+: with the box ticked Next opens step 2 and the error is cleared', () => assert.equal(errAfter, ''));
    // Step 2 notices and the repeated privacy link.
    const notice = (await page.locator('[data-area-explainer]').textContent()).trim();
    const promise = (await page.locator('[data-signup-step="2"] .signup-step-heading p').textContent()).trim();
    const link2 = await page.locator('[data-signup-step="2"] a[href="/privacy.html"]').evaluate((a) => a.target);
    check(`R11: step 2 notice is the honest copy (got "${notice}")`, () => assert.equal(notice, 'We keep only a rough ~2 km square, never your exact location. Other members see a rounded distance or your city, and only once enough people are nearby.'));
    check(`R11: the promise line says "nearby first, as your area fills up" (got "${promise}")`, () => assert.ok(promise.includes('nearby first, as your area fills up')));
    const next2 = (await page.locator('[data-signup-step="2"] .signup-next').textContent()).trim().replace(/\s+/g, ' ');
    check(`R11: the step-2 button reads "NEXT: WHAT YOU CARE ABOUT" (got "${next2}")`, () => assert.match(next2, /^NEXT: WHAT YOU CARE ABOUT\b/));
    check('18+: step 2 repeats the privacy link with target=_blank', () => assert.equal(link2, '_blank'));
    await page.locator('[data-area-city]').click();
    await pickCityByKeyboard(page);
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('#interest-results [data-interest-group]', { state: 'attached' });
    const h3 = (await page.locator('[data-signup-step="3"] .signup-step-heading h2').textContent()).trim();
    const kicker3 = (await page.locator('[data-signup-step="3"] .signup-step-heading > span').textContent()).trim();
    check(`R11: step 3 heading is "What you care about" (got "${h3}", kicker "${kicker3}")`, () => { assert.equal(h3, 'What you care about'); assert.ok(!/signals/i.test(kicker3)); });
    await fillBudgetWithMouse(page, 'Chess');
    await page.locator('.looking-search').click();
    await page.locator('#looking-results [data-looking-option]').first().click();
    await page.locator('[data-signup-step="3"] .signup-next').click();
    const label3 = await stepLabel(page);
    await finishStepFour(page);
    await page.waitForURL(/\/app\.html/, { timeout: 15000 });
    const flow = stub.calls.filter((c) => c.method !== 'GET' && c.method !== 'OPTIONS').map((c) => c.path.replace('/rest/v1/', '').replace('/auth/v1/', ''));
    const idx = ['signup', 'profiles', 'rpc/declare_adult', 'rpc/set_home_city', 'rpc/set_member_interests'].map((n) => flow.indexOf(n));
    check(`18+: order profiles -> declare_adult -> set_home_city -> set_member_interests (${flow.join(' | ')})`, () => { assert.ok(idx.every((i) => i >= 0)); assert.deepEqual([...idx].sort((a, b) => a - b), idx); });
    const declareBody = JSON.parse(stub.posts('/rest/v1/rpc/declare_adult')[0]?.body || '{}');
    check(`18+: declare_adult sends the notice version (${JSON.stringify(declareBody)})`, () => assert.deepEqual(declareBody, { p_notice_version: '2026-10-05' }));
    const adultInBody = stub.calls.filter((c) => c.path === '/rest/v1/profiles' && ['POST', 'PATCH'].includes(c.method) && /adult_declared_at|adultDeclared/.test(c.body));
    check('18+: adult_declared_at is never in a profiles write body', () => assert.equal(adultInBody.length, 0));
    check('R11: the signup step label for step 3 no longer says "signals"', () => assert.ok(!/signals/i.test(label3)));
    check('18+: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 12b. Email-confirmation path: the pending profile records adultDeclared; after login declare_adult runs before
  //      set_home_city.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await seedPending(context, { ...basePending, interests: [{ id: 'sports.racket.tennis', points: 20, mode: 'learn' }], orbit: { kind: 'city', placeId: 'in-mumbai' }, savedAt: Date.now() });
    const stub = await stubContext(context, { signupSession: false });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    await page.waitForURL(/\/app\.html/, { timeout: 15000 });
    const idx = ['/rest/v1/rpc/declare_adult', '/rest/v1/rpc/set_home_city', '/rest/v1/rpc/set_member_interests'].map((n) => stub.calls.findIndex((c) => c.method === 'POST' && c.path === n));
    check(`18+ pending: after login declare_adult runs before set_home_city and interests (${idx.join(',')})`, () => { assert.ok(idx.every((i) => i >= 0)); assert.deepEqual([...idx].sort((a, b) => a - b), idx); });
    const profileBodies = stub.calls.filter((c) => c.path === '/rest/v1/profiles' && ['POST', 'PATCH'].includes(c.method)).map((c) => c.body);
    check('18+ pending: adultDeclared / adult_declared_at never reach a profiles body', () => assert.ok(!profileBodies.some((b) => /adult/i.test(b))));
    check('18+ pending: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 12c. An OAuth / old account: its own profile row has adult_declared_at null while my_onboarding_status says
  //      has_cell and 3 interests. The member lands on step 1 with the box focused.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(([key, value]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); } }, ['sb-stub-auth-token', JSON.stringify(session)]);
    const interests = [
      { interest_id: 'sports.racket.tennis', label: 'Tennis', points: 10, mode: 'play' },
      { interest_id: 'games.board.chess', label: 'Chess', points: 5, mode: 'play' },
      { interest_id: 'sports.racket.badminton', label: 'Badminton', points: 5, mode: 'play' },
    ];
    const stub = await stubContext(context, { profileExists: true, adultDeclared: false, hasCell: true, interests, realApp: true });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/auth\.html/, { timeout: 15000 });
    await page.waitForSelector('[data-signup-step="1"]:not([hidden])', { timeout: 15000 });
    await page.waitForTimeout(300);
    const landed = await page.evaluate(() => ({ focused: document.activeElement?.getAttribute('name'), checked: document.querySelector('input[name="adultConfirm"]').checked }));
    check(`18+ OAuth: an undeclared member lands on step 1 with the unchecked box focused (${JSON.stringify(landed)})`, () => { assert.equal(landed.focused, 'adultConfirm'); assert.equal(landed.checked, false); });
    // Finishing: tick, walk to the end, submit: declare_adult first, no area or interests re-sent for the kept data.
    await page.locator('input[name="adultConfirm"]').check();
    await page.locator('[data-signup-step="1"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="2"]:not([hidden])');
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="3"]:not([hidden])');
    await context.route(`${BASE}/app.html*`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title>' }));
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="4"]:not([hidden])');
    await page.locator('[data-signup-step="4"] [type="submit"]').click();
    await page.waitForURL(/\/app\.html/, { timeout: 15000 });
    check('18+ OAuth: completing declares once (declare_adult POSTed)', () => assert.equal(stub.posts('/rest/v1/rpc/declare_adult').length, 1));
    check('18+ OAuth: no uncaught page errors', () => assert.deepEqual(errors.filter((e) => !/Failed to fetch|NetworkError|aborted/i.test(e)), []));
    await context.close();
  }

  // 12d. declare_adult fails during a session signup: back to step 1 with the retry message, and nothing after it runs.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const stub = await stubContext(context, { signupSession: true, declareStatus: [500] });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await openSignup(page);
    await fillStepOne(page);
    await page.locator('[data-area-city]').click();
    await pickCityByKeyboard(page);
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('#interest-results [data-interest-group]', { state: 'attached' });
    await fillBudgetWithMouse(page, 'Chess');
    await page.locator('.looking-search').click();
    await page.locator('#looking-results [data-looking-option]').first().click();
    await page.locator('[data-signup-step="3"] .signup-next').click();
    await finishStepFour(page);
    await page.waitForSelector('[data-signup-step="1"]:not([hidden])', { timeout: 15000 });
    await page.waitForFunction(() => (document.querySelector('#adult-error')?.textContent || '').trim().length > 0, null, { timeout: 5000 });
    const msg = (await page.locator('#adult-error').textContent()).trim();
    check(`18+ failure: back on step 1 with the retry message (got "${msg}")`, () => assert.equal(msg, "We couldn't record your confirmation. Please try again."));
    check('18+ failure: no location or interests call was made', () => { assert.equal(stub.posts('/rest/v1/rpc/set_home_city').length, 0); assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 0); });
    check('18+ failure: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 12e. An old pending profile (no adultDeclared) and a failed declare: after login the member is on step 1, nothing
  //      was applied, and the stored interests still prefill step 3.
  for (const variant of ['old pending', 'declare fails']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pend = { ...basePending, interests: [{ id: 'games.board.chess', points: 20, mode: 'play' }], orbit: { kind: 'city', placeId: 'in-mumbai' }, savedAt: Date.now() };
    if (variant === 'old pending') delete pend.adultDeclared;
    await seedPending(context, pend);
    const stub = await stubContext(context, { signupSession: false, declareStatus: variant === 'declare fails' ? [500] : [] });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    await page.waitForSelector('[data-signup-step="1"]:not([hidden])', { timeout: 15000 });
    await page.waitForTimeout(300);
    await page.locator('input[name="adultConfirm"]').check();
    await page.locator('[data-signup-step="1"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="2"]:not([hidden])');
    await page.locator('[data-area-city]').click();
    await pickCityByKeyboard(page, 'Pun');
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="3"]:not([hidden])');
    await page.waitForSelector('[data-budget-row="games.board.chess"]', { timeout: 5000 }).catch(() => {});
    const rows = await page.locator('#budget-list [data-budget-row]').evaluateAll((els) => els.map((el) => el.dataset.budgetRow));
    check(`18+ ${variant}: stored interests prefill step 3 (${rows.join(',')})`, () => assert.deepEqual(rows, ['games.board.chess']));
    check(`18+ ${variant}: no location or interests call before the declaration`, () => assert.equal(stub.posts('/rest/v1/rpc/set_home_city').length + stub.posts('/rest/v1/rpc/set_member_interests').length, 0));
    check(`18+ ${variant}: no uncaught page errors`, () => assert.deepEqual(errors, []));
    await context.close();
  }
} catch (error) {
  results.push(['FAIL', `harness: ${error.stack || error.message}`]);
} finally {
  await browser?.close();
  try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* already gone */ }
}

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([status]) => status === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
