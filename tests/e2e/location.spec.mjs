// Polish wave A1: "Use my location" on the signup's area step (step 2), against stubbed Supabase and a scripted
// navigator.geolocation. Never touches a real Supabase project. Playwright is NOT a repo dependency (tests/e2e/README.md).
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node tests/e2e/location.spec.mjs
//
// What a member should see (task-A1 brief, L1-L7):
// * L1 granted at once: "Got it. We keep only the ~2 km square you're in.", the city list stays closed, the submit
//   POSTs rpc/set_home_location with finite lat/lng, and the coordinate is in no other request, no storage, no DOM.
// * L2 the permission prompt answered late (success after 16 s, past the 15 s "still waiting" guard): the location
//   still counts. L2b: a city picked while the browser was still thinking wins over a late answer.
// * L3 PERMISSION_DENIED (1), L4 POSITION_UNAVAILABLE (2), L5 TIMEOUT (3): the city list opens with a line that says
//   why; after a timeout a "Try again" button asks the browser once more.
// * L6 no navigator.geolocation, or an insecure context: the plain "No problem. Pick your city instead."
// * L7 set_home_location answers "try again later" (400 P0001 as in the brief, and the real 429 PT429): back on the
//   area step with "Try again later.".
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT || 5192);
const ORIGIN = 'https://stub.supabase.local';
const BASE = `http://127.0.0.1:${PORT}`;
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const LAT = 12.971598;
const LNG = 77.594566;
const COORD_RE = /12\.97|77\.59/;
const SHOTS = process.env.E2E_SCREENSHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };

const GOT_IT = "Got it. We keep only the ~2 km square you're in.";
const COPY = {
  denied: "Location is blocked for this site. Allow it in your browser's site settings, or pick your city.",
  unavailable: "Your device couldn't find a location. Check that location services are on, or pick your city.",
  timeout: 'Finding your location took too long. Try again, or pick your city.',
  plain: 'No problem. Pick your city instead.',
};

const ME = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'loc@test.brivia.club';
const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const accessToken = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: ME, role: 'authenticated', exp, aud: 'authenticated' })}.sig`;
const user = { id: ME, aud: 'authenticated', role: 'authenticated', email: EMAIL, user_metadata: { name: 'Lia Loc' }, app_metadata: {}, created_at: new Date().toISOString() };
const session = { access_token: accessToken, refresh_token: 'stub-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
const nodes = [
  { id: 'sports', parent_id: null, level: 1, label: 'Sports and fitness', sensitive: false },
  { id: 'sports.racket', parent_id: 'sports', level: 2, label: 'Racket sports', sensitive: false },
  { id: 'sports.racket.badminton', parent_id: 'sports.racket', level: 3, label: 'Badminton', sensitive: false },
];
const places = [
  { id: 'in-bengaluru', name: 'Bengaluru', region: 'Karnataka', country: 'India' },
  { id: 'in-mumbai', name: 'Mumbai', region: 'Maharashtra', country: 'India' },
];

const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };

const waitForServer = async () => {
  for (let i = 0; i < 100; i += 1) {
    try { const res = await fetch(`${BASE}/auth.html`); if (res.ok) return; } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('vite did not start');
};

// opts.locationAnswer: [status, body] for set_home_location once (then 200).
const stubContext = async (context, opts = {}) => {
  const state = { profile: null, adultAt: null, hasCell: false, interests: [], locationAnswer: opts.locationAnswer || null };
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
    if (p === '/auth/v1/signup') return json(200, session);
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers });
    if (p.startsWith('/auth/v1/')) return json(200, p.endsWith('/user') ? user : session);
    const wantsObject = (request.headers().accept || '').includes('vnd.pgrst.object');
    if (p === '/rest/v1/profiles') {
      const own = () => ({ ...state.profile, adult_declared_at: state.adultAt, sensitive_consent_at: null });
      if (method === 'POST' || method === 'PATCH') { state.profile = { ...(state.profile || {}), ...JSON.parse(body || '{}'), skills: [] }; return json(method === 'POST' ? 201 : 200, wantsObject ? own() : [own()]); }
      if (!state.profile) return wantsObject ? json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }) : json(200, []);
      return json(200, wantsObject ? own() : [own()]);
    }
    if (p === '/rest/v1/rpc/declare_adult') { state.adultAt = state.adultAt || new Date().toISOString(); return route.fulfill({ status: 204, body: '', headers }); }
    if (p === '/rest/v1/interest_node') return json(200, nodes);
    if (p === '/rest/v1/place') {
      const or = url.searchParams.get('or') || '';
      const q = (or.match(/name\.ilike\.\*([^*]*)\*/) || [])[1] || '';
      return json(200, places.filter((pl) => !q || pl.name.toLowerCase().includes(q.toLowerCase())));
    }
    if (p === '/rest/v1/rpc/set_home_location') {
      if (!state.profile) return json(404, { code: 'P0002', message: 'profile required' });
      if (state.locationAnswer) { const [status, payload] = state.locationAnswer; state.locationAnswer = null; return json(status, payload); }
      state.hasCell = true;
      return json(200, 'Bengaluru');
    }
    if (p === '/rest/v1/rpc/set_home_city') {
      const place = places.find((pl) => pl.id === JSON.parse(body || '{}').p_place_id);
      if (!place) return json(400, { code: '22023', message: 'invalid place' });
      state.hasCell = true;
      return json(200, place.name);
    }
    if (p === '/rest/v1/rpc/set_member_interests') { state.interests = JSON.parse(body || '{}').p_items || []; return route.fulfill({ status: 204, body: '', headers }); }
    if (p === '/rest/v1/rpc/my_interests') return json(200, []);
    if (p === '/rest/v1/rpc/my_onboarding_status') return json(200, [{ interests: state.interests.length, points: 20, has_cell: state.hasCell, place_label: 'Bengaluru', completed: true }]);
    if (p.startsWith('/rest/v1/')) return json(200, []);
    return json(200, {});
  });
  await context.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith(ORIGIN), (route) => route.abort());
  await context.routeWebSocket(/stub\.supabase\.local/, (ws) => ws.close());
  await context.route(`${BASE}/app.html*`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>app</title><p id="stub-app">app</p>' }));
  return { state, calls, consoleLines, posts: (p) => calls.filter((c) => c.method === 'POST' && c.path === p) };
};

// A scripted navigator.geolocation. plan.answers[i] is the answer to the i-th getCurrentPosition call
// ('ok' | 'denied' | 'unavailable' | 'timeout'; the last one repeats), after plan.delayMs. plan.mode 'missing' removes
// the API; plan.insecure makes window.isSecureContext false.
const scriptGeo = (context, plan) => context.addInitScript(({ plan: pl, lat, lng }) => {
  window.__geoCalls = [];
  if (pl.insecure) Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
  if (pl.mode === 'missing') {
    try { delete Navigator.prototype.geolocation; } catch { /* ignore */ }
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    return;
  }
  const codes = { denied: 1, unavailable: 2, timeout: 3 };
  const fake = {
    getCurrentPosition(ok, fail, options) {
      window.__geoCalls.push({ options });
      const answer = pl.answers[Math.min(window.__geoCalls.length - 1, pl.answers.length - 1)];
      setTimeout(() => {
        if (answer === 'ok') ok({ coords: { latitude: lat, longitude: lng, accuracy: 1200 }, timestamp: Date.now() });
        else fail({ code: codes[answer], message: answer, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
      }, pl.delayMs ?? 50);
    },
    watchPosition() { return 0; },
    clearWatch() {},
  };
  Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true });
}, { plan, lat: LAT, lng: LNG });

const newPage = async (context, consoleLines) => {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (msg) => consoleLines.push(msg.text()));
  return { page, errors };
};
const openStepTwo = async (page) => {
  await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-signup-step="1"]:not([hidden])', { timeout: 15000 });
  await page.waitForTimeout(300);
  const step = page.locator('[data-signup-step="1"]');
  await step.locator('input[name="name"]').fill('Lia Loc');
  await step.locator('input[name="email"]').fill(EMAIL);
  await step.locator('input[name="phoneNumber"]').fill('98765 43210');
  await step.locator('.gender-option', { hasText: 'FEMALE' }).click();
  await step.locator('select[name="experience"]').selectOption({ index: 2 });
  await step.locator('input[name="adultConfirm"]').check();
  await step.locator('.signup-next').click();
  await page.waitForSelector('[data-signup-step="2"]:not([hidden])');
};
const finishSignup = async (page) => {
  await page.locator('[data-signup-step="2"] .signup-next').click();
  await page.waitForSelector('[data-signup-step="3"]:not([hidden])');
  await page.waitForSelector('#interest-results [data-interest-group]', { state: 'attached' });
  await page.locator('#interest-search').fill('Badminton');
  await page.locator('#interest-results [data-interest-id]', { hasText: 'Badminton' }).first().click();
  for (let i = 0; i < 19; i += 1) await page.getByRole('button', { name: 'Add a point to Badminton', exact: true }).click();
  await page.locator('.looking-search').click();
  await page.locator('#looking-results [data-looking-option]').first().click();
  await page.locator('[data-signup-step="3"] .signup-next').click();
  await page.waitForSelector('[data-signup-step="4"]:not([hidden])');
  await page.locator('[data-signup-step="4"] input[name="password"]').fill('correct horse 1');
  await page.locator('[data-signup-step="4"] input[name="passwordConfirm"]').fill('correct horse 1');
  await page.locator('[data-signup-step="4"] [type="submit"]').click();
};
const areaState = (page) => page.evaluate(() => ({
  status: (document.querySelector('[data-area-status]')?.textContent || '').trim(),
  fallback: (document.querySelector('[data-area-fallback]')?.textContent || '').replace(/\s*Try again\s*$/, '').trim(),
  pickerOpen: !document.querySelector('[data-area-picker]')?.hidden,
  retry: (() => { const b = document.querySelector('[data-area-retry]'); return b && b.getClientRects().length ? (() => { const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) }; })() : null; })(),
  error: (document.querySelector('[data-area-error]')?.textContent || '').trim(),
  calls: window.__geoCalls?.length ?? -1,
}));
const waitForStatus = (page, text, timeout = 5000) => page.waitForFunction((t) => (document.querySelector('[data-area-status]')?.textContent || '').trim() === t, text, { timeout });
const waitForPicker = (page, timeout = 5000) => page.waitForSelector('[data-area-picker]:not([hidden])', { timeout });
const storageDump = (page) => page.evaluate(() => {
  const dump = {};
  for (const [name, store] of [['local', localStorage], ['session', sessionStorage]]) for (let i = 0; i < store.length; i += 1) dump[`${name}:${store.key(i)}`] = store.getItem(store.key(i));
  return dump;
});

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: repoRoot,
  env: { ...process.env, VITE_SUPABASE_URL: ORIGIN, VITE_SUPABASE_ANON_KEY: 'stub-anon-key' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let browser;
const run = async (name, { viewport = { width: 1440, height: 900 }, plan, stub: stubOpts, mobile = false }, body) => {
  const context = await browser.newContext({ viewport, ...(mobile ? { hasTouch: true, isMobile: true } : {}) });
  if (plan) await scriptGeo(context, plan);
  const stub = await stubContext(context, stubOpts);
  const { page, errors } = await newPage(context, stub.consoleLines);
  try {
    await openStepTwo(page);
    await body(page, stub);
  } catch (error) {
    results.push(['FAIL', `${name}: ${error.message.split('\n')[0]}`]);
  }
  check(`${name}: no uncaught page errors`, () => assert.deepEqual(errors, []));
  await context.close();
};

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });

  // L1: granted at once, at 1440 and 375; the full submit carries the coordinate only in set_home_location.
  for (const [tag, viewport, mobile] of [['L1 1440', { width: 1440, height: 900 }, false], ['L1 375', { width: 375, height: 812 }, true]]) {
    await run(tag, { viewport, mobile, plan: { answers: ['ok'] } }, async (page, stub) => {
      await page.locator('[data-area-geo]').click();
      await waitForStatus(page, GOT_IT);
      const s = await areaState(page);
      check(`${tag}: status reads "${GOT_IT}" and the city list stays closed (${JSON.stringify(s)})`, () => { assert.equal(s.status, GOT_IT); assert.equal(s.pickerOpen, false); assert.equal(s.calls, 1); });
      await shot(page, `${tag.replace(' ', '-')}-granted.png`);
      await finishSignup(page);
      await page.waitForURL(/\/app\.html/, { timeout: 15000 });
      const loc = stub.posts('/rest/v1/rpc/set_home_location');
      const bodyObj = JSON.parse(loc[0]?.body || '{}');
      check(`${tag}: one set_home_location POST with finite lat/lng and nothing else (${loc.map((c) => c.body).join(' ; ')})`, () => {
        assert.equal(loc.length, 1);
        assert.deepEqual(Object.keys(bodyObj).sort(), ['lat', 'lng']);
        assert.ok(Number.isFinite(bodyObj.lat) && Number.isFinite(bodyObj.lng));
        assert.ok(!COORD_RE.test(loc[0].url));
      });
      const leaks = stub.calls.filter((c) => (COORD_RE.test(c.url) || COORD_RE.test(c.body)) && !(c.method === 'POST' && c.path === '/rest/v1/rpc/set_home_location'));
      check(`${tag}: no other request carries the coordinate (${leaks.map((c) => `${c.method} ${c.path}`).join(', ')})`, () => assert.equal(leaks.length, 0));
      const stored = await storageDump(page);
      check(`${tag}: no coordinate in localStorage or sessionStorage`, () => assert.ok(!Object.values(stored).some((v) => COORD_RE.test(v || ''))));
      check(`${tag}: the coordinate never reaches the console`, () => assert.ok(!stub.consoleLines.some((line) => COORD_RE.test(line))));
    });
  }

  // L2: the prompt answered late (success at 16 s, after the 15 s guard). The location still counts.
  await run('L2', { plan: { answers: ['ok'], delayMs: 16000 } }, async (page) => {
    await page.locator('[data-area-geo]').click();
    await waitForPicker(page, 16000); // the guard opens the city list while the browser is still thinking
    const waiting = await areaState(page);
    check(`L2: at 15 s the city list opens with "Still waiting for your browser…" (${JSON.stringify(waiting)})`, () => { assert.equal(waiting.pickerOpen, true); assert.equal(waiting.fallback, 'Still waiting for your browser…'); });
    await waitForStatus(page, GOT_IT, 6000).catch(() => {});
    const s = await areaState(page);
    check(`L2: a success after 16 s still counts (${JSON.stringify(s)})`, () => { assert.equal(s.status, GOT_IT); assert.equal(s.pickerOpen, false); assert.equal(s.calls, 1); });
    await page.locator('[data-signup-step="2"] .signup-next').click();
    await page.waitForSelector('[data-signup-step="3"]:not([hidden])', { timeout: 3000 });
    check('L2: Next moves on with the late location', () => assert.ok(true));
  });

  // L2b: the member picks a city while the browser is still thinking; the late answer does not overwrite it.
  await run('L2b', { plan: { answers: ['ok'], delayMs: 2500 } }, async (page) => {
    await page.locator('[data-area-geo]').click();
    await page.locator('[data-area-city]').click();
    const input = page.locator('#area-city-search');
    await input.focus();
    await page.keyboard.type('Mum');
    await page.waitForSelector('#area-city-results [role="option"]');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3200);
    const s = await areaState(page);
    check(`L2b: a city picked meanwhile wins over the late location (${JSON.stringify(s)})`, () => assert.match(s.status, /^Your area: Mumbai, Maharashtra\./));
  });

  // L3-L5: each failure opens the city list with a line that says why.
  for (const [tag, answer, copy, mobile] of [['L3 denied', 'denied', COPY.denied, true], ['L4 unavailable', 'unavailable', COPY.unavailable, false], ['L5 timeout', 'timeout', COPY.timeout, false]]) {
    await run(tag, { viewport: mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 }, mobile, plan: { answers: answer === 'timeout' ? ['timeout', 'ok'] : [answer] } }, async (page) => {
      await page.locator('[data-area-geo]').click();
      await waitForPicker(page);
      await page.waitForTimeout(100);
      const s = await areaState(page);
      check(`${tag}: city list open with "${copy}" (${JSON.stringify(s)})`, () => { assert.equal(s.pickerOpen, true); assert.equal(s.fallback, copy); assert.equal(s.status, ''); });
      const focused = await page.evaluate(() => document.activeElement?.id);
      check(`${tag}: focus moves to the city search (${focused})`, () => assert.equal(focused, 'area-city-search'));
      await shot(page, `${tag.split(' ')[0]}-${answer}.png`);
      if (answer === 'timeout') {
        check(`L5: a "Try again" button of at least 44 px shows (${JSON.stringify(s.retry)})`, () => { assert.ok(s.retry); assert.equal(s.retry.text, 'Try again'); assert.ok(s.retry.h >= 44 && s.retry.w >= 44); });
        await page.locator('[data-area-retry]').click();
        await waitForStatus(page, GOT_IT).catch(() => {});
        const after = await areaState(page);
        check(`L5: "Try again" asks the browser once more and the answer counts (${JSON.stringify(after)})`, () => { assert.equal(after.calls, 2); assert.equal(after.status, GOT_IT); assert.equal(after.pickerOpen, false); });
      } else {
        check(`${tag}: no "Try again" button (${JSON.stringify(s.retry)})`, () => assert.equal(s.retry, null));
      }
    });
  }

  // L5 at every viewport: the timeout line and its button fit without sideways scroll.
  for (const width of [320, 375, 390, 768, 1280, 1440, 1920]) {
    const height = { 1280: 800, 1440: 900, 1920: 1080 }[width] || 812;
    await run(`L5 ${width}`, { viewport: { width, height }, mobile: width < 768, plan: { answers: ['timeout'] } }, async (page) => {
      await page.locator('[data-area-geo]').click();
      await waitForPicker(page);
      await page.waitForTimeout(100);
      const s = await areaState(page);
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      check(`L5 ${width}: no sideways scroll and the 44 px "Try again" shows (${JSON.stringify(s.retry)})`, () => { assert.ok(fits); assert.ok(s.retry && s.retry.h >= 44 && s.retry.w >= 44); });
      if (width === 375 || width === 1440) await shot(page, `L5-${width}-timeout.png`);
    });
  }

  // L6: no geolocation API, or an insecure context (the API is never called): the plain line.
  for (const [tag, plan] of [['L6 missing', { mode: 'missing' }], ['L6 insecure', { insecure: true, answers: ['ok'] }]]) {
    await run(tag, { plan }, async (page) => {
      await page.locator('[data-area-geo]').click();
      await waitForPicker(page);
      const s = await areaState(page);
      check(`${tag}: plain "${COPY.plain}" and no API call (${JSON.stringify(s)})`, () => { assert.equal(s.fallback, COPY.plain); assert.ok(s.calls <= 0); assert.equal(s.retry, null); });
    });
  }

  // L7: set_home_location says "try again later": back on the area step with "Try again later.".
  for (const [tag, answer] of [['L7 400 P0001', [400, { code: 'P0001', message: 'try again later', details: null, hint: null }]], ['L7 429 PT429', [429, { code: 'PT429', message: 'try again later', details: null, hint: null }]]]) {
    await run(tag, { plan: { answers: ['ok'] }, stub: { locationAnswer: answer } }, async (page, stub) => {
      await page.locator('[data-area-geo]').click();
      await waitForStatus(page, GOT_IT);
      await finishSignup(page);
      await page.waitForSelector('[data-signup-step="2"]:not([hidden])', { timeout: 15000 });
      await page.waitForFunction(() => (document.querySelector('[data-area-error]')?.textContent || '').trim() !== '', null, { timeout: 5000 }).catch(() => {});
      const s = await areaState(page);
      check(`${tag}: "Try again later." beside the area step (${JSON.stringify(s.error)})`, () => assert.equal(s.error, 'Try again later.'));
      check(`${tag}: no interests sent after the failed area step`, () => assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 0));
    });
  }
} finally {
  await browser?.close();
  try { process.kill(-vite.pid); } catch { /* already gone */ }
}

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([status]) => status === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
