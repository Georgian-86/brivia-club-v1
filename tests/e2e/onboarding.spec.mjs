// The onboarding gate and the old pending-profile path, against stubbed Supabase. Phase E Task 5 retired the 4-step
// form these checks used to drive: signup is now the guided flow (tests/e2e/signup.spec.mjs), and every route that
// used to open the old form's completion now opens the guided flow at the first incomplete screen.
// Never touches a real Supabase project. Playwright is NOT a repo dependency; see tests/e2e/README.md.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node tests/e2e/onboarding.spec.mjs
//
// Asserts:
// * the old pending profile (an account made with the 4-step form that confirmed its email later) is applied once at
//   the next password login: the profile row, then declare_adult, then a stored city, then complete interests; a geo
//   choice is never replayed (no coordinate was ever stored); an applied city is not applied again at a second login;
//   a pending profile older than 7 days is dropped; failures keep it and land on the screen that failed, with its
//   message; the photo preview it holds is uploaded once and never stored as a data: URL;
// * the gate: app.html sends an incomplete member to auth.html?complete-profile=1, which opens the first incomplete
//   guided screen (18+ for an undeclared older account, Name for 'New Member', Interests without interests);
// * a member under review stays in the app with the neutral notice (F2a); a consent given before a visit is never
//   withdrawn by a failed save (F2b).
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { axeViolations, smallText } from './a11y.mjs';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT || 5198);
const ORIGIN = 'https://stub.supabase.local';
const BASE = `http://127.0.0.1:${PORT}`;
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const COORD_RE = /12\.97|77\.59/;

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

// One stubbed Supabase per context. opts: signupSession (bool), profileExists, hasCell, interests, homeCityStatus[],
// interestsStatus[] (400 | 429), consentAt (consent given before this visit), underReview (completed stays false: F2).
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
    consent: Boolean(opts.consentAt),
    consentAt: opts.consentAt || null,
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
    if (p === '/auth/v1/signup' && opts.signupStatus === 429) return json(429, { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' });
    if (p === '/auth/v1/signup') return json(200, opts.signupSession === false ? user : session);
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers });
    if (p.startsWith('/auth/v1/')) return json(200, p.endsWith('/user') ? user : session);
    const wantsObject = (request.headers().accept || '').includes('vnd.pgrst.object');
    if (p === '/rest/v1/profiles') {
      const own = () => ({ ...state.profile, adult_declared_at: state.adultAt, sensitive_consent_at: state.consentAt });
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
      if (JSON.parse(body || '{}').p_notice_version !== '2026-10-20') return json(400, { code: '22023', message: 'stale notice version' });
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
      if (forced === 429) return json(429, { code: 'PT429', message: 'interest_rewrite_cap', details: null, hint: null });
      if (items.reduce((s, i) => s + i.points, 0) !== 20) return json(400, { code: '22023', message: 'invalid interests' });
      // Like the server (D-038 R3): a sensitive id needs the separate consent given through set_sensitive_consent.
      if (!state.consent && items.some((i) => nodes.find((n) => n.id === i.interest_id)?.sensitive)) return json(400, { code: '22023', message: 'sensitive consent required', details: null, hint: null });
      state.interests = items.map((i) => ({ interest_id: i.interest_id, label: nodes.find((n) => n.id === i.interest_id)?.label, points: i.points, mode: i.mode }));
      return route.fulfill({ status: 204, body: '', headers });
    }
    if (p === '/rest/v1/rpc/set_sensitive_consent') {
      if (!state.profile) return json(404, { code: 'P0002', message: 'profile required' });
      state.consent = JSON.parse(body || '{}').p_consent === true;
      state.consentAt = state.consent ? (state.consentAt || new Date().toISOString()) : null;
      return route.fulfill({ status: 204, body: '', headers });
    }
    if (p === '/rest/v1/rpc/my_interests') return json(200, state.interests);
    if (p === '/rest/v1/rpc/my_onboarding_status') {
      const points = state.interests.reduce((s, i) => s + i.points, 0);
      return json(200, [{ interests: state.interests.length, points, has_cell: state.hasCell, place_label: state.placeLabel, completed: !opts.underReview && Boolean(state.profile && state.adultAt && !['', 'New Member'].includes(String(state.profile.name || '').trim()) && state.hasCell && points === 20) }]);
    }
    if (opts.uploadStatus && method === 'POST' && p.startsWith('/storage/v1/object/')) return json(opts.uploadStatus, { statusCode: String(opts.uploadStatus), error: 'boom', message: 'upload failed' });
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
      window.__geoCalls.push({ options, explainerVisible: Boolean(explainer && explainer.getClientRects().length && /We keep only a rough ~2 km square, never your exact location\. Other members see a rounded distance once enough people are nearby; until then they see your city\./.test(explainer.textContent)) });
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

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const storageDump = (page) => page.evaluate(() => {
  const dump = {};
  for (const [name, store] of [['local', localStorage], ['session', sessionStorage]]) {
    for (let i = 0; i < store.length; i += 1) dump[`${name}:${store.key(i)}`] = store.getItem(store.key(i));
  }
  return dump;
});
// The guided flow (Phase E): the screen shown, its title and its step label.
const guided = (page) => page.evaluate(() => {
  const root = document.querySelector('#guided-signup');
  return {
    screen: root && !root.hidden ? root.dataset.screen : null,
    title: document.querySelector('#signup-screen-title')?.textContent.trim() || '',
    step: root?.querySelector('[data-signup-step]')?.textContent.trim() || '',
    message: root?.querySelector('#signup-error')?.textContent.trim() || '',
    picks: [...(root?.querySelectorAll('[data-pick-id]') || [])].map((el) => el.dataset.pickId),
  };
});
const waitScreen = async (page, screen, timeout = 15000) => {
  await page.waitForFunction((s) => { const r = document.querySelector('#guided-signup'); return r && !r.hidden && r.dataset.screen === s && document.querySelector('#signup-screen-title'); }, screen, { timeout });
  await page.waitForTimeout(450);
};
const primary = (page) => page.locator('#guided-signup .gs-primary');
const pickChip = async (page, id) => {
  const domain = page.locator(`#guided-signup [data-domain="${id.split('.')[0]}"]`);
  await domain.waitFor({ timeout: 8000 });
  if ((await domain.getAttribute('aria-pressed')) !== 'true') await domain.click();
  await page.locator(`#guided-signup [data-interest-id="${id}"]`).click();
  await page.waitForTimeout(450);
};
const seedSession = (context, value = session) => context.addInitScript(([key, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, v); sessionStorage.setItem('seeded', '1'); } }, ['sb-stub-auth-token', JSON.stringify(value)]);
const seedPending = (context, pending) => context.addInitScript(([value]) => {
  if (!sessionStorage.getItem('seeded')) { localStorage.setItem('brivia-pending-profile', value); sessionStorage.setItem('seeded', '1'); }
}, [JSON.stringify(pending)]);
// An account made with the old form: contact basics, the declaration, and onboarding kept while the email was confirmed.
const basePending = { name: 'Nia New', email: EMAIL, phone: '+91 9876543210', phoneCountryCode: '+91', phoneNumber: '9876543210', gender: 'Female', experience: '1–3 years', lookingFor: 'Friends', adultDeclared: true };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const loginOnFreshPage = async (page, { wait = 0 } = {}) => {
  await page.goto(`${BASE}/auth.html?later=${Date.now()}#login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-form');
  await page.locator('#login-form input[name="email"]').fill(EMAIL);
  await page.locator('#login-form input[name="password"]').fill('correct horse 1');
  await page.locator('#login-form .auth-submit').click();
  if (wait) await page.waitForTimeout(wait);
};
const rpcSeq = (stub) => stub.calls.filter((c) => /set_sensitive_consent|set_member_interests/.test(c.path)).map((c) => `${c.path.split('/').pop()}${c.path.endsWith('consent') ? ':' + JSON.parse(c.body).p_consent : ''}`);
const realErrors = (errors) => errors.filter((e) => !/Failed to fetch|NetworkError|aborted/i.test(e));

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: repoRoot,
  env: { ...process.env, VITE_SUPABASE_URL: ORIGIN, VITE_SUPABASE_ANON_KEY: 'stub-anon-key', VITE_SIGNUP_METHODS: 'google,email' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });
  const fresh = (width = 1280) => browser.newContext({ viewport: { width, height: 900 } });

  // 1. The old pending profile with a city: after a password login it is applied silently, in order, and the member
  //    goes to the app.
  {
    const context = await fresh();
    await seedPending(context, { ...basePending, interests: [{ id: 'sports.racket.tennis', points: 20, mode: 'learn' }], orbit: { kind: 'city', placeId: 'in-mumbai' }, savedAt: Date.now() });
    const stub = await stubContext(context, {});
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    const landed = await page.waitForURL(/\/app\.html/, { timeout: 15000 }).then(() => true, () => false);
    const city = stub.posts('/rest/v1/rpc/set_home_city').map((c) => JSON.parse(c.body || '{}'));
    const interests = JSON.parse(stub.posts('/rest/v1/rpc/set_member_interests').at(-1)?.body || '{}').p_items || [];
    check(`the old pending-profile path still applies a stored pending profile once: city ${JSON.stringify(city)}, interests ${JSON.stringify(interests)}, app ${landed}`, () => {
      assert.ok(landed);
      assert.deepEqual(city, [{ p_place_id: 'in-mumbai' }]);
      assert.deepEqual(interests, [{ interest_id: 'sports.racket.tennis', points: 20, mode: 'learn' }]);
      assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 1);
    });
    const order = ['/rest/v1/profiles', '/rest/v1/rpc/declare_adult', '/rest/v1/rpc/set_home_city', '/rest/v1/rpc/set_member_interests'].map((p) => stub.calls.findIndex((c) => c.method !== 'GET' && c.path === p));
    check(`pending: profile, then declare_adult, then city, then interests (${order.join(',')})`, () => { assert.ok(order.every((i) => i >= 0)); assert.deepEqual([...order].sort((a, b) => a - b), order); });
    const profileBodies = stub.calls.filter((c) => c.path === '/rest/v1/profiles' && ['POST', 'PATCH'].includes(c.method)).map((c) => c.body);
    check('pending: adultDeclared / adult_declared_at never reach a profiles body', () => assert.ok(!profileBodies.some((b) => /adult/i.test(b))));
    const after = await storageDump(page).catch(() => ({}));
    check('pending: the applied pending profile is removed', () => assert.ok(!('local:brivia-pending-profile' in after)));
    check('pending: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 2. A geo choice is never replayed (no coordinate was ever stored): the interests are applied, and the guided flow
  //    opens at Area ("Step 5 of 6"). Picking a city there finishes onboarding (interests are already saved: Reveal).
  {
    const context = await fresh();
    await seedPending(context, { ...basePending, interests: [{ id: 'games.board.chess', points: 20, mode: 'play' }], orbit: { kind: 'geo' }, savedAt: Date.now() });
    const stub = await stubContext(context, {});
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    const ok = await waitScreen(page, 'area').then(() => true, () => false);
    const g = await guided(page);
    check(`geo pending: after login the guided flow opens at Area, "Step 5 of 6" (${JSON.stringify(g)})`, () => { assert.ok(ok); assert.equal(g.title, 'Where are you based?'); assert.equal(g.step, 'Step 5 of 6'); });
    const applied = JSON.parse(stub.posts('/rest/v1/rpc/set_member_interests').at(-1)?.body || '{}').p_items || [];
    check(`geo pending: the stored interests were applied (${JSON.stringify(applied)})`, () => assert.deepEqual(applied, [{ interest_id: 'games.board.chess', points: 20, mode: 'play' }]));
    check('geo pending: no set_home_location without a fresh location', () => assert.equal(stub.posts('/rest/v1/rpc/set_home_location').length, 0));
    const after = await storageDump(page);
    check('geo pending: the pending profile is cleared after login', () => assert.ok(!('local:brivia-pending-profile' in after)));
    check('geo pending: nothing in storage carries a coordinate', () => assert.ok(!Object.values(after).some((v) => COORD_RE.test(v || ''))));
    if (ok) {
      await page.locator('#guided-signup [data-area-city]').click();
      await page.locator('#signup-area-city-search').pressSequentially('Pun', { delay: 20 });
      await page.waitForSelector('#signup-area-city-results [role="option"]');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await primary(page).click();
      const revealed = await waitScreen(page, 'reveal').then(() => true, () => false);
      const city = stub.posts('/rest/v1/rpc/set_home_city').map((c) => JSON.parse(c.body || '{}'));
      check(`geo pending: the picked city saves once and, with interests already saved, the flow ends on the Reveal (${JSON.stringify(city)}, reveal ${revealed})`, () => {
        assert.deepEqual(city, [{ p_place_id: 'in-pune' }]); assert.ok(revealed);
        assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 1);
      });
    }
    check('geo pending: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 3. A pending profile that left a private interest out (privateOmitted) and is no longer complete: the city is
  //    applied, the interests are not sent, and Interests opens with the stored pick and a note to pick private ones again.
  {
    const context = await fresh();
    await seedPending(context, { ...basePending, interests: [{ id: 'games.board.chess', points: 19, mode: 'play' }], privateOmitted: true, orbit: { kind: 'city', placeId: 'in-bengaluru' }, savedAt: Date.now() });
    const stub = await stubContext(context, {});
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    const ok = await waitScreen(page, 'interests').then(() => true, () => false);
    await page.waitForSelector('#guided-signup [data-pick-id="games.board.chess"]', { timeout: 5000 }).catch(() => {});
    const g = await guided(page);
    check(`private omitted: Interests opens with the stored pick and the note (${JSON.stringify(g)})`, () => {
      assert.ok(ok); assert.deepEqual(g.picks, ['games.board.chess']);
      assert.match(page.url(), /auth\.html/);
    });
    const note = await page.evaluate(() => document.querySelector('#guided-signup .gs-tray')?.textContent || '');
    check(`private omitted: the tray says to pick private interests again ("${note.slice(0, 120)}")`, () => assert.match(note, /Private interests aren't kept while you confirm your email/));
    check('private omitted: the city was applied silently, the incomplete interests were not sent', () => {
      assert.deepEqual(stub.posts('/rest/v1/rpc/set_home_city').map((c) => JSON.parse(c.body)), [{ p_place_id: 'in-bengaluru' }]);
      assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 0);
    });
    const after = await storageDump(page);
    check('private omitted: pending profile removed after login', () => assert.ok(!('local:brivia-pending-profile' in after)));
    check('private omitted: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 4. A pending profile older than 7 days is dropped, not applied; with no profile row the member starts at 18+.
  {
    const context = await fresh();
    await seedPending(context, { ...basePending, interests: [{ id: 'sports.racket.tennis', points: 20, mode: 'play' }], orbit: { kind: 'city', placeId: 'in-mumbai' }, savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 });
    const stub = await stubContext(context, {});
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    const ok = await waitScreen(page, 'adult').then(() => true, () => false);
    const after = await storageDump(page);
    check(`expired: an 8-day-old pending profile is not applied; the guided flow opens at 18+ (${ok})`, () => {
      assert.ok(ok);
      assert.equal(stub.posts('/rest/v1/rpc/set_home_city').length, 0);
      assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 0);
      assert.equal(stub.calls.filter((c) => c.path === '/rest/v1/profiles' && c.method !== 'GET').length, 0);
    });
    check('expired: the stale pending profile is removed', () => assert.ok(!('local:brivia-pending-profile' in after)));
    check('expired: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 5. Pending city answered with PT429: Area says "Try again later." and the pending profile is kept.
  {
    const context = await fresh();
    await seedPending(context, { ...basePending, interests: [{ id: 'sports.racket.tennis', points: 20, mode: 'play' }], orbit: { kind: 'city', placeId: 'in-mumbai' }, savedAt: Date.now() });
    const stub = await stubContext(context, { homeCityStatus: [429] });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    const ok = await waitScreen(page, 'area').then(() => true, () => false);
    const g = await guided(page);
    const after = await storageDump(page);
    check(`pending 429: Area shows "Try again later." (${JSON.stringify(g)})`, () => { assert.ok(ok); assert.equal(g.message, 'Try again later.'); });
    check('pending 429: the pending profile is kept for a retry', () => assert.ok('local:brivia-pending-profile' in after));
    check('pending 429: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 6. Pending interests rejected: Interests opens with the stored pick and the save error; the pending profile is kept
  //    (without the applied city) until the guided save succeeds.
  {
    const context = await fresh();
    await seedPending(context, { ...basePending, interests: [{ id: 'sports.racket.tennis', points: 20, mode: 'build' }], orbit: { kind: 'city', placeId: 'in-mumbai' }, savedAt: Date.now() });
    const stub = await stubContext(context, { interestsStatus: [400] });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    const ok = await waitScreen(page, 'interests').then(() => true, () => false);
    await page.waitForSelector('#guided-signup [data-pick-id="sports.racket.tennis"]', { timeout: 5000 }).catch(() => {});
    const g = await guided(page);
    const keptPending = JSON.parse((await storageDump(page))['local:brivia-pending-profile'] || 'null');
    check(`pending interests rejected: Interests with the stored pick and the save error (${JSON.stringify(g)})`, () => {
      assert.ok(ok); assert.deepEqual(g.picks, ['sports.racket.tennis']);
      assert.equal(g.message, "We couldn't save your interests. Please try again.");
    });
    check(`pending interests rejected: kept, with the applied city dropped (${JSON.stringify(keptPending?.orbit ?? null)})`, () => {
      assert.ok(keptPending && !('orbit' in keptPending));
      assert.deepEqual(keptPending.interests, [{ id: 'sports.racket.tennis', points: 20, mode: 'build' }]);
    });
    if (ok) {
      await primary(page).click();
      const revealed = await waitScreen(page, 'reveal').then(() => true, () => false);
      const final = await storageDump(page);
      check('pending interests rejected: the guided save succeeds and clears the pending profile', () => {
        assert.ok(revealed);
        assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 2);
        assert.ok(!('local:brivia-pending-profile' in final));
      });
    }
    check('pending interests rejected: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 7. The city applied at the first login is not applied again at a second login (each set_home_city counts toward
  //    the 3-per-24 h location cap), even though the interests failed both times and the pending profile stays.
  {
    const context = await fresh();
    await seedPending(context, { ...basePending, interests: [{ id: 'sports.racket.tennis', points: 20, mode: 'build' }], orbit: { kind: 'city', placeId: 'in-mumbai' }, savedAt: Date.now() });
    const stub = await stubContext(context, { interestsStatus: [400, 400] });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    await waitScreen(page, 'interests').catch(() => {});
    await page.evaluate(() => { Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)); });
    await loginOnFreshPage(page);
    await waitScreen(page, 'interests').catch(() => {});
    const cityCalls = stub.posts('/rest/v1/rpc/set_home_city').length;
    const interestCalls = stub.posts('/rest/v1/rpc/set_member_interests').length;
    check(`second login: set_home_city is not called again (${cityCalls} calls; set_member_interests ${interestCalls})`, () => { assert.equal(cityCalls, 1); assert.equal(interestCalls, 2); });
    check('second login: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 8. An old pending profile without the declaration, and one whose declaration fails: nothing is applied, the member
  //    lands on 18+, and after Yes the flow goes on to Area (the stored city was never applied).
  for (const variant of ['old pending', 'declare fails']) {
    const context = await fresh();
    const pend = { ...basePending, interests: [{ id: 'games.board.chess', points: 20, mode: 'play' }], orbit: { kind: 'city', placeId: 'in-mumbai' }, savedAt: Date.now() };
    if (variant === 'old pending') delete pend.adultDeclared;
    await seedPending(context, pend);
    const stub = await stubContext(context, { declareStatus: variant === 'declare fails' ? [500] : [] });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await loginOnFreshPage(page);
    const ok = await waitScreen(page, 'adult').then(() => true, () => false);
    check(`18+ ${variant}: lands on 18+ and nothing was applied before the declaration (${ok})`, () => {
      assert.ok(ok); assert.equal(stub.posts('/rest/v1/rpc/set_home_city').length + stub.posts('/rest/v1/rpc/set_member_interests').length, 0);
    });
    if (ok) {
      await primary(page).click();
      const area = await waitScreen(page, 'area').then(() => true, () => false);
      const g = await guided(page);
      check(`18+ ${variant}: Yes declares, then the flow goes on to Area (the name is already saved) (${JSON.stringify(g)})`, () => {
        assert.ok(area); assert.equal(g.step, 'Step 5 of 6');
        assert.ok(stub.posts('/rest/v1/rpc/declare_adult').length >= 1);
      });
    }
    check(`18+ ${variant}: no uncaught page errors`, () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 9. The signup photo the pending profile kept (a compressed data: preview) is uploaded to profile-photos after login;
  //    the stored photo_url is the storage URL. A login whose onboarding fails keeps the pending profile, and the next
  //    login neither uploads again nor writes photo_url = null; a failed upload never blocks sign-in.
  for (const variant of ['once', 'retry', 'upload-fails']) {
    const context = await fresh();
    await seedPending(context, { ...basePending, photoUrl: PNG, photoName: 'me.png', interests: [{ id: 'games.board.chess', points: 20, mode: 'play' }], orbit: { kind: 'city', placeId: 'in-pune' }, savedAt: Date.now() });
    const stub = await stubContext(context, { homeCityStatus: variant === 'retry' ? [429] : [], uploadStatus: variant === 'upload-fails' ? 500 : 0 });
    const { page, errors } = await newPage(context, stub.consoleLines);
    const photoWrites = () => stub.calls.filter((c) => c.path === '/rest/v1/profiles' && ['POST', 'PATCH'].includes(c.method)).map((c) => JSON.parse(c.body || '{}')).filter((b) => 'photo_url' in b).map((b) => b.photo_url);
    const uploads = () => stub.calls.filter((c) => c.method === 'POST' && c.path.startsWith(`/storage/v1/object/profile-photos/${ME}/`)).length;
    await loginOnFreshPage(page, { wait: 2500 });
    if (variant === 'once') {
      check(`photo: after login the signup photo is uploaded once to profile-photos/<id>/ (${uploads()})`, () => assert.equal(uploads(), 1));
      check(`photo: the stored photo_url is the storage URL, never a data URL (${JSON.stringify(photoWrites().map((u) => String(u).slice(0, 60)))})`, () => {
        assert.ok(photoWrites().length >= 1); photoWrites().forEach((u) => { assert.ok(!String(u).startsWith('data:')); assert.match(String(u), /\/storage\/v1\/object\/public\/profile-photos\//); });
      });
    } else if (variant === 'retry') {
      const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('brivia-pending-profile') || 'null'));
      check(`B1: after a PT429 the pending profile is kept with the stored photo URL, not the preview (${String(kept?.photoUrl).slice(0, 60)})`, () => { assert.ok(kept); assert.match(kept.photoUrl, /\/storage\/v1\/object\/public\/profile-photos\//); });
      const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('brivia-member-profile') || '{}').photoUrl || '');
      check('B1: the cached member profile never holds the data: preview', () => assert.ok(!cached.startsWith('data:')));
      await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)));
      await loginOnFreshPage(page, { wait: 2500 });
      const writes = photoWrites();
      check(`B1: a second login neither uploads again nor writes photo_url = null (uploads ${uploads()}, writes ${JSON.stringify(writes.map((w) => (w || 'NULL').slice(0, 40)))})`, () => {
        assert.equal(uploads(), 1); assert.ok(writes.length >= 2); writes.forEach((w) => assert.match(String(w), /profile-photos/));
      });
    } else {
      const routedOn = await page.evaluate(() => location.pathname);
      const writes = photoWrites();
      const pendingPhoto = await page.evaluate(() => JSON.parse(localStorage.getItem('brivia-pending-profile') || '{}').photoUrl || '');
      check(`S1: a failed upload does not block sign-in (at ${routedOn}; writes ${JSON.stringify(writes)})`, () => {
        assert.equal(routedOn, '/app.html'); assert.ok(writes.every((w) => w === null || /profile-photos/.test(w))); assert.ok(!pendingPhoto.startsWith('data:'));
      });
    }
    check(`photo ${variant}: no uncaught page errors`, () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 10. The gate: a signed-in member with a profile and an area but no interests is sent from app.html to
  //     auth.html?complete-profile=1, which opens Interests ("Step 6 of 6"); saving keeps the area (no set_home_*).
  {
    const context = await fresh();
    await seedSession(context);
    const stub = await stubContext(context, { profileExists: true, hasCell: true, realApp: true });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/auth\.html/, { timeout: 15000 }).catch(() => {});
    const ok = await waitScreen(page, 'interests').then(() => true, () => false);
    const g = await guided(page);
    check(`gate: app.html sends an incomplete member to Interests (url ${new URL(page.url()).pathname}${new URL(page.url()).search}, ${JSON.stringify(g)})`, () => { assert.ok(ok); assert.equal(g.step, 'Step 6 of 6'); });
    if (ok) {
      await pickChip(page, 'sports.racket.tennis');
      await context.route(`${BASE}/app.html*`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title>' }));
      await primary(page).click();
      await waitScreen(page, 'reveal').catch(() => {});
      const interests = JSON.parse(stub.posts('/rest/v1/rpc/set_member_interests').at(-1)?.body || '{}').p_items || [];
      check(`gate: completion sends the interests (${JSON.stringify(interests)})`, () => assert.deepEqual(interests, [{ interest_id: 'sports.racket.tennis', points: 20, mode: 'play' }]));
      check('gate: completion keeps the current area (no set_home_* call)', () => { assert.equal(stub.posts('/rest/v1/rpc/set_home_city').length, 0); assert.equal(stub.posts('/rest/v1/rpc/set_home_location').length, 0); });
    }
    check('gate: no signUp call for an existing member', () => assert.equal(stub.posts('/auth/v1/signup').length, 0));
    const noH = await noHorizontalScroll(page);
    check('gate: no horizontal scroll', () => assert.ok(noH));
    check('gate: no uncaught page errors', () => assert.deepEqual(realErrors(errors), []));
    await context.close();
  }

  // 11. Re-entry without a real name ('New Member'): ?complete-profile=1 opens Name with an empty field.
  {
    const context = await fresh();
    await seedSession(context, { ...session, user: { ...user, user_metadata: {} } });
    const stub = await stubContext(context, { profileExists: true, profileName: 'New Member', hasCell: true, interests: [{ interest_id: 'sports.racket.tennis', label: 'Tennis', points: 20, mode: 'play' }] });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await page.goto(`${BASE}/auth.html?complete-profile=1`, { waitUntil: 'domcontentloaded' });
    const ok = await waitScreen(page, 'name').then(() => true, () => false);
    const name = ok ? await page.locator('#signup-name').inputValue() : null;
    check(`no name: re-entry opens Name with no "New Member" prefilled (${ok}, "${name}")`, () => { assert.ok(ok); assert.equal(name, ''); });
    check('no name: no uncaught page errors', () => assert.deepEqual(errors, []));
    await context.close();
  }

  // 12. An OAuth / old account whose own row has adult_declared_at null, with an area and interests: app.html sends it
  //     to 18+; Yes declares once and, everything else being done, the flow ends on the Reveal (nothing re-sent).
  {
    const context = await fresh();
    await seedSession(context);
    const interests = [
      { interest_id: 'sports.racket.tennis', label: 'Tennis', points: 10, mode: 'play' },
      { interest_id: 'games.board.chess', label: 'Chess', points: 5, mode: 'play' },
      { interest_id: 'sports.racket.badminton', label: 'Badminton', points: 5, mode: 'play' },
    ];
    const stub = await stubContext(context, { profileExists: true, adultDeclared: false, hasCell: true, interests, realApp: true });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/auth\.html/, { timeout: 15000 }).catch(() => {});
    const ok = await waitScreen(page, 'adult').then(() => true, () => false);
    check(`18+ OAuth: an undeclared member lands on 18+ (${ok})`, () => assert.ok(ok));
    if (ok) {
      await context.route(`${BASE}/app.html*`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title>' }));
      await primary(page).click();
      const done = await waitScreen(page, 'reveal').then(() => true, () => false);
      check(`18+ OAuth: Yes declares once and ends on the Reveal; no area or interests re-sent (${done})`, () => {
        assert.ok(done); assert.equal(stub.posts('/rest/v1/rpc/declare_adult').length, 1);
        for (const n of ['set_home_city', 'set_home_location', 'set_member_interests']) assert.equal(stub.posts(`/rest/v1/rpc/${n}`).length, 0, n);
      });
    }
    check('18+ OAuth: no uncaught page errors', () => assert.deepEqual(realErrors(errors), []));
    await context.close();
  }
  // 13. F2a: a member under review (every client-visible step done, completed = false: an operator review flag) sees a
  //      neutral notice in the app instead of onboarding, and auth.html?complete-profile=1 sends them back to it (no loop,
  //      no interest rewrite, no consent call).
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
    await context.addInitScript(([key, value]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); } }, ['sb-stub-auth-token', JSON.stringify(session)]);
    const interests = [
      { interest_id: 'sports.racket.tennis', label: 'Tennis', points: 10, mode: 'play' },
      { interest_id: 'games.board.chess', label: 'Chess', points: 10, mode: 'play' },
    ];
    const stub = await stubContext(context, { profileExists: true, hasCell: true, interests, underReview: true, realApp: true });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-under-review]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    const notice = await page.evaluate(() => {
      const el = document.querySelector('[data-under-review]');
      return el ? { path: location.pathname, text: el.textContent.replace(/\s+/g, ' ').trim(), mail: el.querySelector('a[href^="mailto:"]')?.getAttribute('href'), heading: el.querySelector('h1')?.textContent.trim(), focus: el.contains(document.activeElement), targets: [...el.querySelectorAll('a, button')].map((b) => Math.round(b.getBoundingClientRect().height)), noH: document.documentElement.scrollWidth <= window.innerWidth } : { path: location.pathname };
    });
    check(`F2a: under review stays in the app with the neutral notice (${JSON.stringify(notice)})`, () => {
      assert.equal(notice.path, '/app.html');
      assert.ok(notice.text?.includes('Your profile is being reviewed. This usually takes up to 72 hours. Questions? Email thebrivia.club@gmail.com.'), notice.text);
      assert.equal(notice.mail, 'mailto:thebrivia.club@gmail.com');
      assert.ok(notice.heading); assert.ok(notice.focus, 'focus moves to the notice');
      assert.ok(notice.targets.every((h) => h >= 44), 'targets under 44 px'); assert.ok(notice.noH, 'horizontal scroll at 375 px');
      assert.ok(!/report/i.test(notice.text), 'the notice never mentions a report');
    });
    const small = await smallText(page, { root: '[data-under-review]' });
    check(`F2a: the notice text is at least 12 px (${small.join(' | ')})`, () => assert.deepEqual(small, []));
    const contrast = await axeViolations(page, { rules: ['color-contrast'], include: '[data-under-review]' });
    check(`F2a: the notice passes axe color-contrast (${contrast.join(' | ')})`, () => assert.deepEqual(contrast, []));
    await page.goto(`${BASE}/auth.html?complete-profile=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/app\.html/, { timeout: 15000 }).catch(() => {});
    await page.waitForSelector('[data-under-review]', { timeout: 15000 }).catch(() => {});
    const back = await page.evaluate(() => ({ path: location.pathname, notice: Boolean(document.querySelector('[data-under-review]')) }));
    check(`F2a: auth.html?complete-profile=1 sends a member under review back to the notice (${JSON.stringify(back)})`, () => assert.deepEqual(back, { path: '/app.html', notice: true }));
    check('F2a: no interest rewrite, consent or area call was made', () => {
      for (const n of ['set_member_interests', 'set_sensitive_consent', 'set_home_city', 'set_home_location']) assert.equal(stub.posts(`/rest/v1/rpc/${n}`).length, 0, n);
    });
    check('F2a: no uncaught page errors', () => assert.deepEqual(errors.filter((e) => !/Failed to fetch|NetworkError|aborted/i.test(e)), []));
    await context.close();
  }

  // 14. F2b: a member who consented before this visit picks a private interest (the consent dialog again, as this visit
  //     has not asked), and the save is refused (PT429): the earlier consent is NOT withdrawn.
  {
    const context = await fresh();
    await seedSession(context);
    const stub = await stubContext(context, { profileExists: true, hasCell: true, consentAt: '2026-10-01T00:00:00Z', interestsStatus: [429], realApp: true });
    const { page, errors } = await newPage(context, stub.consoleLines);
    await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/auth\.html/, { timeout: 15000 }).catch(() => {});
    const ok = await waitScreen(page, 'interests').then(() => true, () => false);
    if (ok) {
      await pickChip(page, 'games.board.chess');
      await page.locator('#guided-signup [data-domain="wellbeing"]').click();
      await page.locator('#guided-signup [data-interest-id="wellbeing.spirituality.scripture_study"]').click();
      await page.locator('[data-private-checkbox]').check();
      await page.locator('[data-private-continue]').click();
      await page.waitForTimeout(450);
      await primary(page).click();
      await page.waitForFunction(() => /couldn't save/.test(document.querySelector('#guided-signup #signup-error')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
    }
    const seq = rpcSeq(stub);
    check(`F2b: a PT429 save keeps the consent given before this submit (${seq.join(' > ')})`, () => {
      assert.ok(ok); assert.deepEqual(seq, ['set_sensitive_consent:true', 'set_member_interests']); assert.equal(stub.state.consent, true);
    });
    check('F2b: no uncaught page errors', () => assert.deepEqual(realErrors(errors), []));
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
