// Guided signup again (polish wave B, D-073; first D-067/D-068) against a stubbed Supabase. Never touches a real project.
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/signup.spec.mjs
//   E2E_SCREENSHOTS=<dir> also saves a screenshot of every screen. E2E_PORT overrides the Vite port (default 5193).
// Screens (B2), at 1440 and 375 px plus a 320 px overflow pass: one question per screen (exactly one [data-question]),
// "Step n of 6", bubbles done / current / pending, Enter = Continue, Back on every question screen, 18+ required,
// mismatched passwords blocked, Area with A1's locateOnce (granted: the status line; denied: fallbackCopy and the city
// list), Interests (0 picks disables Continue, the 13th is refused, the tray animates, not under reduced motion,
// private interests never offered), axe clean, 44 px targets, computed text contrast >= 4.5:1, no sideways scroll.
// Submit (B3): signUp at the end -> profile -> declare_adult (2026-10-05) -> set_home_* -> set_member_interests (20
// points, even split); Verify without a session (pending profile, no coordinates); Google skips Account; a returning
// member resumes at the first unfinished screen; VITE_SIGNUP_FLOW=classic shows the 4-step form.
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
const LNG = 77.594566;
const COORD_RE = /12\.97|77\.59/;
const DENIED = "Location is blocked. Allow it in your browser's site settings (on a Mac or phone, also check that location is on for your browser), or pick your city.";
const GOT_IT = "Got it. We keep only the ~2 km square you're in.";
const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };

const ME = '22222222-2222-4222-8222-222222222222';
const EMAIL = 'guided@test.brivia.club';
const PASSWORD = 'correct horse 1';
const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const accessToken = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: ME, role: 'authenticated', exp, aud: 'authenticated' })}.sig`;
const makeUser = (provider = 'email', meta = {}) => ({ id: ME, aud: 'authenticated', role: 'authenticated', email: EMAIL, user_metadata: meta, app_metadata: { provider, providers: [provider] }, created_at: new Date().toISOString() });
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

const startVite = async (port, env = {}) => {
  const proc = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: repoRoot,
    env: { ...process.env, VITE_SUPABASE_URL: ORIGIN, VITE_SUPABASE_ANON_KEY: 'stub-anon-key', VITE_SIGNUP_FLOW: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  for (let i = 0; i < 160; i += 1) { try { if ((await fetch(`http://127.0.0.1:${port}/auth.html`)).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 250)); }
  return () => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* gone */ } };
};
const stopVite = await startVite(PORT);

// A scripted navigator.geolocation: 'ok' answers with LAT/LNG, 'denied' with code 1 (as A1's location.spec).
const scriptGeo = (context, answer) => context.addInitScript(({ answer: a, lat, lng }) => {
  const fake = {
    getCurrentPosition(ok, fail) {
      setTimeout(() => {
        if (a === 'ok') ok({ coords: { latitude: lat, longitude: lng, accuracy: 1200 }, timestamp: Date.now() });
        else fail({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
      }, 60);
    },
    watchPosition() { return 0; },
    clearWatch() {},
  };
  Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true });
}, { answer, lat: LAT, lng: LNG });

const setup = async (context, opts = {}) => {
  const user = makeUser(opts.provider, { ...(opts.meta || {}) });
  const state = { profile: opts.profile ?? null, adultAt: opts.adultAt ?? null, hasCell: Boolean(opts.hasCell), interests: opts.interests || [], failRpc: new Set(opts.failRpc || []), confirm: Boolean(opts.confirm), signedUp: false };
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
    if (p === '/auth/v1/signup') {
      state.signedUp = true;
      if (opts.signupError) return json(422, { code: 'user_already_exists', error_code: 'user_already_exists', msg: 'User already registered' });
      const signed = makeUser('email', JSON.parse(body || '{}').data || {});
      return json(200, state.confirm ? { ...signed, identities: [{}] } : makeSession(signed));
    }
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers });
    if (p.startsWith('/auth/v1/')) return json(200, p.endsWith('/user') ? user : makeSession(user));
    const wantsObject = (request.headers().accept || '').includes('vnd.pgrst.object');
    if (p === '/rest/v1/profiles') {
      const own = () => ({ ...state.profile, adult_declared_at: state.adultAt });
      if (method === 'POST') { state.profile = { ...(state.profile || {}), ...JSON.parse(body || '{}') }; return json(201, wantsObject ? own() : [own()]); }
      if (method === 'PATCH') {
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
    if (rpc === 'set_member_interests') { state.interests = JSON.parse(body || '{}').p_items || []; return route.fulfill({ status: 204, body: '', headers }); }
    if (rpc === 'my_interests') return json(200, state.interests);
    if (rpc === 'my_onboarding_status') {
      const points = state.interests.reduce((s, i) => s + i.points, 0);
      const named = state.profile && !['', 'New Member'].includes(String(state.profile.name || '').trim());
      return json(200, [{ interests: state.interests.length, points, has_cell: state.hasCell, place_label: 'Pune', completed: Boolean(named && state.adultAt && state.hasCell && points === 20) }]);
    }
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
const waitScreen = (page, name, timeout = 6000) => page.waitForFunction((n) => document.querySelector('#guided-signup')?.dataset.screen === n && document.querySelector('[data-guided-next]')?.getAttribute('aria-busy') !== 'true', name, { timeout }).then(() => true).catch(() => false);
const ui = (page) => page.evaluate(() => {
  const root = document.querySelector('#guided-signup');
  const visible = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const next = root.querySelector('[data-guided-next]');
  return {
    questions: [...root.querySelectorAll('[data-question]')].filter(visible).length,
    h2: [...root.querySelectorAll('h2')].filter(visible).length,
    title: root.querySelector('h2')?.textContent.trim(),
    label: visible(root.querySelector('[data-guided-step-label]')) ? root.querySelector('[data-guided-step-label]').textContent : null,
    bubbles: [...root.querySelectorAll('.guided-bubble')].filter(visible).map((b) => `${b.dataset.step}:${b.className.match(/is-(done|current|pending)/)?.[1]}`),
    primaries: [next, ...root.querySelectorAll('.guided-choice--primary')].filter(visible).length,
    nextDisabled: next?.disabled,
    back: visible(root.querySelector('[data-guided-back]')),
    error: root.querySelector('[data-guided-error]')?.hidden ? '' : root.querySelector('[data-guided-error]')?.textContent,
    points: [...root.querySelectorAll('input')].filter((i) => /points/i.test(i.name)).length,
    text: root.innerText,
  };
});

// Targets >= 44 px, computed text contrast >= 4.5:1 (axe cannot see a cream gradient), and no sideways scroll.
// Disabled controls and inline links inside a sentence are exempt (WCAG 1.4.3 / 2.5.8).
const audit = (page, rootSel = '#guided-signup') => page.evaluate((sel) => {
  const root = document.querySelector(sel);
  const visible = (el) => { if (!el.getClientRects().length) return false; for (let p = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false; } return true; };
  const name = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/)[0]}` : ''}${el.dataset?.id ? `[${el.dataset.id}]` : ''}`;
  const small = [];
  for (const el of root.querySelectorAll('button, select, input:not([type="checkbox"]):not([type="hidden"]), label.guided-check, a')) {
    if (!visible(el) || el.closest('.sr-only')) continue;
    if (el.tagName === 'A' && el.closest('p')) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) small.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  const parse = (c) => {
    let m = c.match(/^rgba?\(([^)]+)\)/);
    if (m) { const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v[3] ?? 1]; }
    m = c.match(/^color\(srgb ([^)]+)\)/);
    if (m) { const v = m[1].split(/[ /]+/).filter(Boolean).map(Number); return [v[0] * 255, v[1] * 255, v[2] * 255, v[3] ?? 1]; }
    return null;
  };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1); };
  const bgOf = (el) => {
    const layers = [];
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.backgroundImage && s.backgroundImage !== 'none' && !/gradient/.test(s.backgroundImage)) return null;
      const c = parse(s.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let base = [255, 255, 255, 1];
    for (const l of layers.reverse()) base = over(l, base);
    return base;
  };
  const lum = (c) => c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const low = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!visible(el) || el.closest('.sr-only, [aria-hidden="true"], :disabled')) continue;
    const s = getComputedStyle(el);
    const fg = parse(s.color); const bg = bgOf(el);
    if (!fg || !bg) continue;
    let opacity = 1; for (let p = el; p; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity);
    const text = over([fg[0], fg[1], fg[2], fg[3] * opacity], bg);
    const a = lum(text); const b = lum(bg);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < 4.5) low.push(`${name(el)} "${node.textContent.trim().slice(0, 24)}" ${ratio.toFixed(2)}`);
  }
  return { small, low, overflow: document.documentElement.scrollWidth - window.innerWidth };
}, rootSel);
const shot = async (page, name, settle = 450) => { if (!SHOTS) return; if (settle) await page.waitForTimeout(settle); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
// Let finite transitions (screen fade-in, the button's disabled -> enabled colour) settle first: a loaded machine
// otherwise measures a half-faded heading. Infinite animations (the current bubble's pulse) are not awaited.
const settleAnimations = (page) => page.evaluate(() => Promise.race([
  Promise.all(document.getAnimations().filter((x) => x.effect?.getComputedTiming().iterations !== Infinity).map((x) => x.finished.catch(() => {}))),
  new Promise((r) => setTimeout(r, 3000)),
]));
const auditScreen = async (page, tag) => {
  await settleAnimations(page);
  const a = await audit(page);
  check(`${tag}: 44 px targets (${a.small.join(', ')})`, () => assert.deepEqual(a.small, []));
  check(`${tag}: text contrast >= 4.5:1 (${a.low.join(', ')})`, () => assert.deepEqual(a.low, []));
  check(`${tag}: no sideways scroll (${a.overflow})`, () => assert.ok(a.overflow <= 0));
  const axe = await axeViolations(page, { include: '.auth-shell' });
  check(`${tag}: axe clean (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
};

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
try {
  // ================================ B2: the screens ================================
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    const w = viewport.width;
    const mobile = w < 800;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    await scriptGeo(context, 'ok');
    const { calls } = await setup(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'load' });
    const atWelcome = await waitScreen(page, 'welcome');
    let u = await ui(page);
    await shot(page, `${w}-01-welcome`, 1200);
    check(`${w} #signup opens the guided Welcome: Google, email, "I already have an account"; no step label, no bubbles`, () => {
      assert.equal(atWelcome, true);
      assert.match(u.text, /Continue with Google/); assert.match(u.text, /Continue with email/); assert.match(u.text, /I already have an account/);
      assert.equal(u.label, null); assert.deepEqual(u.bubbles, []); assert.equal(u.h2, 1); assert.equal(u.primaries, 1); assert.equal(u.questions, 0);
    });
    const classicHidden = await page.evaluate(() => document.querySelector('[data-auth-view="signup"]')?.hidden);
    check(`${w} the classic 4-step form is not shown`, () => assert.equal(classicHidden, true));
    await auditScreen(page, `${w} welcome`);

    await page.locator('[data-guided-email]').click();
    await waitScreen(page, 'account');
    u = await ui(page);
    check(`${w} account: one question, "Step 1 of 6", first bubble current, Back shown, Continue disabled (${u.bubbles.join(' ')})`, () => {
      assert.equal(u.questions, 1); assert.equal(u.h2, 1); assert.equal(u.primaries, 1); assert.equal(u.label, 'Step 1 of 6');
      assert.deepEqual(u.bubbles, ['account:current', 'adult:pending', 'name:pending', 'details:pending', 'area:pending', 'interests:pending']);
      assert.equal(u.back, true); assert.equal(u.nextDisabled, true);
    });
    await page.locator('input[name="guided-email"]').fill(EMAIL);
    await page.locator('input[name="guided-password"]').fill(PASSWORD);
    await page.locator('input[name="guided-password-confirm"]').fill('correct horse 2');
    await page.locator('input[name="guided-password-confirm"]').press('Enter');
    await page.waitForTimeout(250);
    u = await ui(page);
    check(`${w} account: mismatched passwords block with a line (${u.error})`, () => assert.equal(u.error, "The two passwords don't match."));
    check(`${w} account: still on account after the mismatch`, () => assert.equal(u.label, 'Step 1 of 6'));
    await page.locator('input[name="guided-password-confirm"]').fill(PASSWORD);
    await shot(page, `${w}-02-account`);
    await auditScreen(page, `${w} account`);
    await page.locator('input[name="guided-password-confirm"]').press('Enter');
    const toAdult = await waitScreen(page, 'adult');
    u = await ui(page);
    check(`${w} Enter = Continue: account -> 18+ ("Step 2 of 6"), nothing sent to Supabase Auth yet`, () => {
      assert.equal(toAdult, true); assert.equal(u.label, 'Step 2 of 6'); assert.equal(u.questions, 1);
      assert.deepEqual(u.bubbles.slice(0, 2), ['account:done', 'adult:current']);
      assert.equal(calls.filter((c) => c.path.startsWith('/auth/v1/signup')).length, 0);
    });
    check(`${w} 18+: one checkbox "I'm 18 or older", the notice link, Continue disabled until ticked`, () => {
      assert.match(u.text, /I'm 18 or older/); assert.match(u.text, /privacy|How we use your data/i); assert.equal(u.nextDisabled, true);
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const stillAdult = await screenOf(page);
    check(`${w} 18+ is required (still ${stillAdult})`, () => assert.equal(stillAdult, 'adult'));
    await shot(page, `${w}-03-adult`);
    await auditScreen(page, `${w} adult`);
    await page.locator('[data-guided-back]').click();
    await waitScreen(page, 'account');
    const kept = await page.locator('input[name="guided-email"]').inputValue();
    check(`${w} Back from 18+ (no session yet) returns to account with the email kept`, () => assert.equal(kept, EMAIL));
    await page.locator('[data-guided-next]').click();
    await waitScreen(page, 'adult');
    await page.locator('input[name="guided-adult"]').check();
    await page.locator('input[name="guided-adult"]').press('Enter');
    await waitScreen(page, 'name');
    u = await ui(page);
    check(`${w} name: "Step 3 of 6", one question, Back shown, Continue disabled when empty`, () => {
      assert.equal(u.label, 'Step 3 of 6'); assert.equal(u.questions, 1); assert.equal(u.back, true); assert.equal(u.nextDisabled, true);
    });
    await page.locator('input[name="guided-name"]').fill('Gia Guided');
    await shot(page, `${w}-04-name`);
    await auditScreen(page, `${w} name`);
    await page.locator('input[name="guided-name"]').press('Enter');
    await waitScreen(page, 'details');
    u = await ui(page);
    check(`${w} details: phone + gender, "Step 4 of 6", Continue disabled until both`, () => {
      assert.equal(u.label, 'Step 4 of 6'); assert.equal(u.questions, 1); assert.equal(u.nextDisabled, true); assert.match(u.text, /Prefer not to say/);
    });
    await page.locator('input[name="guided-phone"]').fill('98765 43210');
    u = await ui(page);
    check(`${w} details: a phone alone is not enough`, () => assert.equal(u.nextDisabled, true));
    await page.locator('.guided-segment[data-gender="Female"]').click();
    await shot(page, `${w}-05-details`);
    await auditScreen(page, `${w} details`);
    await page.locator('input[name="guided-phone"]').press('Enter');
    await waitScreen(page, 'area');
    u = await ui(page);
    check(`${w} area: "Step 5 of 6", one question, Continue disabled until an area`, () => { assert.equal(u.label, 'Step 5 of 6'); assert.equal(u.questions, 1); assert.equal(u.nextDisabled, true); });
    await page.locator('[data-guided-geo]').click();
    await page.waitForFunction((t) => document.querySelector('[data-guided-area-status]')?.textContent === t, GOT_IT, { timeout: 4000 }).catch(() => {});
    u = await ui(page);
    const dom = await page.evaluate(() => document.documentElement.outerHTML);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    check(`${w} area: location granted -> "${GOT_IT}", Continue enabled, no coordinates in the DOM, storage or any request`, () => {
      assert.match(u.text, /Got it\. We keep only the ~2 km square you're in\./); assert.equal(u.nextDisabled, false);
      assert.ok(!COORD_RE.test(dom)); assert.ok(!COORD_RE.test(stored));
      assert.equal(calls.filter((c) => COORD_RE.test(c.url) || COORD_RE.test(c.body)).length, 0);
    });
    await shot(page, `${w}-06-area`);
    await auditScreen(page, `${w} area`);
    await page.keyboard.press('Enter');
    await waitScreen(page, 'interests');
    await page.waitForSelector('.guided-option', { timeout: 5000 });
    u = await ui(page);
    check(`${w} interests: "Step 6 of 6", Continue disabled with 0 picks, private ones never offered, popular first, no points input`, () => {
      assert.equal(u.label, 'Step 6 of 6'); assert.equal(u.questions, 1); assert.equal(u.nextDisabled, true);
      assert.ok(!/A private belief/.test(u.text)); assert.ok(u.text.indexOf('Chess') < u.text.indexOf('Interest A'));
      assert.equal(u.points, 0); assert.ok(!/passion points|points left/i.test(u.text));
    });
    await page.locator('.guided-option', { hasText: 'Chess' }).click();
    await page.waitForTimeout(90);
    const flight = await page.evaluate(() => { const g = document.querySelector('.guided-ghost'); return g ? getComputedStyle(g).transform : null; });
    await page.waitForTimeout(320);
    const picked = await page.evaluate(() => ({ count: document.querySelector('[data-guided-count]').textContent, pressed: document.querySelector('.guided-option[aria-pressed="true"]')?.textContent.trim(), tray: [...document.querySelectorAll('.guided-pick')].map((b) => b.textContent.replace('×', '').trim()), ghosts: document.querySelectorAll('.guided-ghost').length, next: document.querySelector('[data-guided-next]').disabled }));
    check(`${w} a pick flies into the "Your picks" tray (mid-flight ${flight}), "1 picked", no ghost left, Continue enabled`, () => {
      assert.ok(flight && flight !== 'none'); assert.equal(picked.count, '1 picked'); assert.equal(picked.pressed, 'Chess');
      assert.deepEqual(picked.tray, ['Chess']); assert.equal(picked.ghosts, 0); assert.equal(picked.next, false);
    });
    await page.locator('.guided-pick', { hasText: 'Chess' }).click();
    await page.waitForTimeout(320);
    const removed = await page.evaluate(() => ({ count: document.querySelector('[data-guided-count]').textContent, next: document.querySelector('[data-guided-next]').disabled }));
    check(`${w} tapping a pick in the tray removes it; 0 picks disables Continue again`, () => { assert.equal(removed.count, '0 picked'); assert.equal(removed.next, true); });
    for (let i = 0; i < 13; i += 1) { await page.locator('.guided-option[aria-pressed="false"]').first().click(); await page.waitForTimeout(30); }
    await page.waitForTimeout(320);
    u = await ui(page);
    const count = await page.locator('[data-guided-count]').textContent();
    check(`${w} the 13th pick is refused with a line (${count}; ${u.error})`, () => { assert.equal(count, '12 picked'); assert.match(u.error, /up to 12/); });
    for (let i = 0; i < 9; i += 1) { await page.locator('.guided-pick').last().click(); await page.waitForTimeout(30); }
    await page.waitForTimeout(320);
    await shot(page, `${w}-07-interests`);
    await auditScreen(page, `${w} interests`);
    await page.locator('[data-guided-back]').click();
    await waitScreen(page, 'area');
    const areaKept = await ui(page);
    check(`${w} Back from interests returns to area with the choice kept`, () => assert.equal(areaKept.nextDisabled, false));
    check(`${w} no page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
    await context.close();
  }

  // ---- 320 px: every question screen fits without a sideways scroll ----
  {
    const context = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
    await scriptGeo(context, 'ok');
    await setup(context);
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'load' });
    await waitScreen(page, 'welcome');
    const over = [];
    const note = async (name) => { const a = await audit(page); if (a.overflow > 0) over.push(`${name}:${a.overflow}`); if (a.small.length) over.push(`${name} small: ${a.small.join(',')}`); };
    await note('welcome');
    await page.locator('[data-guided-email]').click(); await waitScreen(page, 'account'); await note('account');
    await page.locator('input[name="guided-email"]').fill(EMAIL);
    await page.locator('input[name="guided-password"]').fill(PASSWORD);
    await page.locator('input[name="guided-password-confirm"]').fill(PASSWORD);
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'adult'); await note('adult');
    await page.locator('input[name="guided-adult"]').check();
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'name'); await note('name');
    await page.locator('input[name="guided-name"]').fill('Gia Guided');
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'details'); await note('details');
    await page.locator('input[name="guided-phone"]').fill('9876543210');
    await page.locator('.guided-segment[data-gender="Prefer not to say"]').click();
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'area'); await note('area');
    await page.locator('[data-guided-geo]').click();
    await page.waitForFunction(() => !document.querySelector('[data-guided-next]').disabled, null, { timeout: 4000 }).catch(() => {});
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'interests');
    await page.waitForSelector('.guided-option', { timeout: 5000 });
    for (const label of ['Chess', 'Guitar', 'Hackathons']) await page.locator('.guided-option', { hasText: label }).first().click();
    await page.waitForTimeout(320);
    await note('interests');
    await shot(page, '320-interests', 0);
    check(`320: no sideways scroll and 44 px targets on every screen (${over.join(' | ')})`, () => assert.deepEqual(over, []));
    await context.close();
  }

  // ---- Area: location denied -> A1's fallback line and the city list; a typed city + Enter picks it ----
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await scriptGeo(context, 'denied');
    await setup(context);
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'load' });
    await waitScreen(page, 'welcome');
    await page.locator('[data-guided-email]').click(); await waitScreen(page, 'account');
    await page.locator('input[name="guided-email"]').fill(EMAIL);
    await page.locator('input[name="guided-password"]').fill(PASSWORD);
    await page.locator('input[name="guided-password-confirm"]').fill(PASSWORD);
    await page.keyboard.press('Enter'); await waitScreen(page, 'adult');
    await page.locator('input[name="guided-adult"]').check(); await page.keyboard.press('Enter'); await waitScreen(page, 'name');
    await page.locator('input[name="guided-name"]').fill('Dee Denied'); await page.keyboard.press('Enter'); await waitScreen(page, 'details');
    await page.locator('input[name="guided-phone"]').fill('9876543210');
    await page.locator('.guided-segment[data-gender="Male"]').click();
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'area');
    await page.locator('[data-guided-geo]').click();
    await page.waitForFunction((t) => document.querySelector('#guided-signup')?.innerText.includes(t), DENIED, { timeout: 4000 }).catch(() => {});
    await page.waitForSelector('.guided-cities button', { timeout: 4000 }).catch(() => {});
    const denied = await page.evaluate(() => ({
      text: document.querySelector('#guided-signup').innerText,
      cities: [...document.querySelectorAll('.guided-cities button')].filter((b) => b.getClientRects().length).map((b) => b.dataset.place),
      focus: document.activeElement?.name || '',
      next: document.querySelector('[data-guided-next]').disabled,
    }));
    await shot(page, '1440-06b-area-denied');
    check(`area denied: fallbackCopy('denied'), the city list shown, focus in the city search, Continue disabled (${JSON.stringify(denied.cities)})`, () => {
      assert.ok(denied.text.includes(DENIED)); assert.ok(denied.cities.length >= 1); assert.equal(denied.focus, 'guided-city'); assert.equal(denied.next, true);
    });
    await page.locator('input[name="guided-city"]').fill('Pune');
    await page.waitForSelector('.guided-cities button[data-place="in-pune"]', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(250);
    await page.locator('input[name="guided-city"]').press('Enter');
    await page.waitForTimeout(150);
    const chose = await page.evaluate(() => ({ pressed: document.querySelector('.guided-cities button[aria-pressed="true"]')?.dataset.place, next: document.querySelector('[data-guided-next]').disabled, status: document.querySelector('[data-guided-area-status]')?.textContent }));
    check(`area: a typed city + Enter picks it (${JSON.stringify(chose)})`, () => { assert.equal(chose.pressed, 'in-pune'); assert.equal(chose.next, false); assert.match(chose.status, /Pune/); });
    await page.locator('input[name="guided-city"]').press('Enter');
    const moved = await waitScreen(page, 'interests');
    check('area: Enter again = Continue', () => assert.equal(moved, true));
    await context.close();
  }

  // ---- Interests under reduced motion: no flying chip ----
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await scriptGeo(context, 'ok');
    await setup(context);
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'load' });
    await waitScreen(page, 'welcome');
    await page.locator('[data-guided-email]').click(); await waitScreen(page, 'account');
    await page.locator('input[name="guided-email"]').fill(EMAIL);
    await page.locator('input[name="guided-password"]').fill(PASSWORD);
    await page.locator('input[name="guided-password-confirm"]').fill(PASSWORD);
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'adult');
    await page.locator('input[name="guided-adult"]').check(); await page.locator('[data-guided-next]').click(); await waitScreen(page, 'name');
    await page.locator('input[name="guided-name"]').fill('Rae Reduced'); await page.locator('[data-guided-next]').click(); await waitScreen(page, 'details');
    await page.locator('input[name="guided-phone"]').fill('9876543210');
    await page.locator('.guided-segment[data-gender="Female"]').click();
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'area');
    await page.locator('[data-guided-geo]').click();
    await page.waitForFunction(() => !document.querySelector('[data-guided-next]').disabled, null, { timeout: 4000 }).catch(() => {});
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'interests');
    await page.waitForSelector('.guided-option', { timeout: 5000 });
    await page.evaluate(() => { window.__ghosts = 0; new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => { if (n.classList?.contains('guided-ghost')) window.__ghosts += 1; }))).observe(document.body, { childList: true }); });
    await page.locator('.guided-option', { hasText: 'Chess' }).click();
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ ghosts: window.__ghosts, tray: document.querySelectorAll('.guided-pick').length, glow: getComputedStyle(document.querySelector('.guided-bubble.is-current .guided-bubble-dot')).animationName }));
    check(`reduced motion: the pick lands in the tray without a flying chip and the current bubble does not pulse (${JSON.stringify(r)})`, () => { assert.equal(r.ghosts, 0); assert.equal(r.tray, 1); assert.equal(r.glow, 'none'); });
    await context.close();
  }
  // ================================ B3: the answers save through the existing pipeline ================================
  // Walks from the current screen to the Finish button. opts: { area: 'geo' | 'city', picks }.
  const answerRest = async (page, from, { area = 'city', picks = ['Chess', 'Guitar', 'Hackathons'], name = 'Gia Guided' } = {}) => {
    const order = ['account', 'adult', 'name', 'details', 'area', 'interests'];
    for (const screen of order.slice(order.indexOf(from))) {
      await waitScreen(page, screen);
      if (screen === 'account') {
        await page.locator('input[name="guided-email"]').fill(EMAIL);
        await page.locator('input[name="guided-password"]').fill(PASSWORD);
        await page.locator('input[name="guided-password-confirm"]').fill(PASSWORD);
      } else if (screen === 'adult') {
        await page.locator('input[name="guided-adult"]').check();
      } else if (screen === 'name') {
        await page.locator('input[name="guided-name"]').fill(name);
      } else if (screen === 'details') {
        await page.locator('input[name="guided-phone"]').fill('98765 43210');
        await page.locator('.guided-segment[data-gender="Female"]').click();
      } else if (screen === 'area') {
        if (area === 'geo') await page.locator('[data-guided-geo]').click();
        else {
          await page.locator('input[name="guided-city"]').fill('Pune');
          await page.waitForSelector('.guided-cities button[data-place="in-pune"]', { timeout: 4000 });
          await page.locator('.guided-cities button[data-place="in-pune"]').click();
        }
        await page.waitForFunction(() => !document.querySelector('[data-guided-next]').disabled, null, { timeout: 4000 }).catch(() => {});
      } else if (screen === 'interests') {
        await page.waitForSelector('.guided-option', { timeout: 5000 });
        for (const label of picks) { await page.locator('.guided-option', { hasText: label }).first().click(); await page.waitForTimeout(40); }
        await page.waitForTimeout(300);
        return;
      }
      await page.locator('[data-guided-next]').click();
    }
  };
  const order = (calls, list) => list.map((test) => calls.findIndex(test));
  const isProfileWrite = (c) => c.path === '/rest/v1/profiles' && (c.method === 'POST' || c.method === 'PATCH');
  const rpcAt = (name) => (c) => c.path === `/rest/v1/rpc/${name}`;

  // ---- Email path, signup returns a session: signUp -> profile -> declare_adult -> set_home_location -> interests ----
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    const w = viewport.width;
    const mobile = w < 800;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    await scriptGeo(context, 'ok');
    const { state, calls } = await setup(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'load' });
    await waitScreen(page, 'welcome');
    await page.locator('[data-guided-email]').click();
    await answerRest(page, 'account', { area: 'geo' });
    await page.locator('[data-guided-next]').click();
    const revealed = await waitScreen(page, 'reveal', 8000);
    const at = order(calls, [(c) => c.path === '/auth/v1/signup', isProfileWrite, rpcAt('declare_adult'), rpcAt('set_home_location'), rpcAt('set_member_interests')]);
    const signup = JSON.parse(calls.find((c) => c.path === '/auth/v1/signup')?.body || '{}');
    const declare = JSON.parse(calls.find(rpcAt('declare_adult'))?.body || '{}');
    const loc = JSON.parse(calls.find(rpcAt('set_home_location'))?.body || '{}');
    const items = JSON.parse(calls.find(rpcAt('set_member_interests'))?.body || '{}').p_items || [];
    const leaked = calls.filter((c) => (COORD_RE.test(c.url) || COORD_RE.test(c.body)) && !c.path.endsWith('/set_home_location'));
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    check(`${w} submit: the account is created at the end, then profile -> declare_adult -> set_home_location -> set_member_interests (${at.join(' < ')})`, () => {
      assert.equal(revealed, true); assert.ok(at.every((i) => i >= 0)); assert.deepEqual([...at].sort((x, y) => x - y), at);
      assert.equal(signup.email, EMAIL); assert.equal(signup.password, PASSWORD);
    });
    check(`${w} submit: declare_adult sends notice 2026-10-05; the location only in its own body; 3 picks save as 7/7/6 (20 points)`, () => {
      assert.deepEqual(declare, { p_notice_version: '2026-10-05' });
      assert.ok(Number.isFinite(loc.lat) && Number.isFinite(loc.lng)); assert.equal(leaked.length, 0); assert.ok(!COORD_RE.test(stored));
      assert.deepEqual(items.map((i) => i.points), [7, 7, 6]); assert.equal(items.reduce((s, i) => s + i.points, 0), 20);
      assert.deepEqual(items.map((i) => i.interest_id), ['games.board.chess', 'music.instruments.guitar', 'tech.events.hackathons']);
      assert.ok(items.every((i) => i.mode === 'play'));
    });
    check(`${w} submit: phone digits, country code and gender on the member's own row (${state.profile?.phone_number}, ${state.profile?.gender})`, () => {
      assert.equal(state.profile.id, ME); assert.equal(state.profile.name, 'Gia Guided'); assert.equal(state.profile.phone_number, '9876543210');
      assert.equal(state.profile.phone_country_code, '+91'); assert.equal(state.profile.phone, '+91 9876543210'); assert.equal(state.profile.gender, 'Female');
      assert.ok(!('password' in state.profile));
    });
    const u = await ui(page);
    const hostText = await page.locator('[data-guided-host]').innerText();
    await shot(page, `${w}-08-reveal`);
    check(`${w} Reveal: "You're in, Gia.", every bubble done, no digits, no Back`, () => {
      assert.equal(u.title, "You're in, Gia."); assert.ok(u.bubbles.every((b) => b.endsWith(':done'))); assert.equal(u.back, false);
      assert.ok(!/\d/.test(hostText), hostText); assert.equal(u.primaries, 1);
    });
    await auditScreen(page, `${w} reveal`);
    await page.locator('[data-guided-next]').click();
    const toApp = await page.waitForURL(/\/app\.html/, { timeout: 5000 }).then(() => true).catch(() => false);
    check(`${w} "See my deck" goes to /app.html`, () => assert.equal(toApp, true));
    check(`${w} submit: no page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
    await context.close();
  }

  // ---- Email path with confirmation on: no session -> Verify; only the pending profile, never coordinates ----
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    const w = viewport.width;
    const mobile = w < 800;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    await scriptGeo(context, 'ok');
    const { calls } = await setup(context, { confirm: true });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'load' });
    await waitScreen(page, 'welcome');
    await page.locator('[data-guided-email]').click();
    await answerRest(page, 'account', { area: 'geo' });
    await page.locator('[data-guided-next]').click();
    const verified = await waitScreen(page, 'verify', 8000);
    const u = await ui(page);
    const pending = await page.evaluate(() => localStorage.getItem('brivia-pending-profile'));
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    const p = JSON.parse(pending || '{}');
    check(`${w} confirmation on: Verify "Check your email." with the address, all bubbles done, no actions`, () => {
      assert.equal(verified, true); assert.equal(u.title, 'Check your email.'); assert.match(u.text, new RegExp(EMAIL.replace(/\./g, '\\.')));
      assert.ok(u.bubbles.every((b) => b.endsWith(':done'))); assert.equal(u.back, false);
    });
    check(`${w} confirmation on: the pending profile keeps interests (20 points), adultDeclared and the KIND of area, no coordinates, no password`, () => {
      assert.equal(p.adultDeclared, true); assert.deepEqual(p.orbit, { kind: 'geo' }); assert.equal(p.interests.reduce((s, i) => s + i.points, 0), 20);
      assert.equal(p.phoneNumber, '9876543210'); assert.equal(p.gender, 'Female');
      assert.ok(!COORD_RE.test(stored)); assert.ok(!/correct horse/.test(stored));
      assert.equal(calls.filter((c) => c.path.startsWith('/rest/v1/rpc/')).length, 0);
    });
    await shot(page, `${w}-09-verify`);
    await auditScreen(page, `${w} verify`);
    await context.close();
  }

  // ---- signUp refused (the email has an account): back on Account with the reason ----
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setup(context, { signupError: true });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'load' });
    await waitScreen(page, 'welcome');
    await page.locator('[data-guided-email]').click();
    await answerRest(page, 'account');
    await page.locator('[data-guided-next]').click();
    const back = await waitScreen(page, 'account', 8000);
    const u = await ui(page);
    check(`signUp refused: Account again with a line (${u.error})`, () => { assert.equal(back, true); assert.ok(u.error.length > 5); });
    await context.close();
  }

  // ---- Google return: lands on the guided 18+ screen, "Step 1 of 5", name prefilled, no account step, no signUp ----
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    const w = viewport.width;
    const mobile = w < 800;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const { state, calls } = await setup(context, { signedIn: true, provider: 'google', meta: { full_name: 'Gabe Google' } });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html?complete-profile=1`, { waitUntil: 'load' });
    const landed = await waitScreen(page, 'adult', 8000);
    let u = await ui(page);
    check(`${w} Google: lands on 18+ at "Step 1 of 5", bubbles without Account`, () => {
      assert.equal(landed, true); assert.equal(u.label, 'Step 1 of 5');
      assert.deepEqual(u.bubbles, ['adult:current', 'name:pending', 'details:pending', 'area:pending', 'interests:pending']);
    });
    await page.locator('[data-guided-back]').click();
    await waitScreen(page, 'welcome');
    u = await ui(page);
    check(`${w} Google: Back from 18+ goes to Welcome (signed in), never to an account screen`, () => { assert.match(u.text, /Welcome back/); assert.match(u.text, /Sign out/); });
    await page.locator('[data-guided-continue]').click();
    await waitScreen(page, 'adult');
    await page.locator('input[name="guided-adult"]').check();
    await page.locator('[data-guided-next]').click();
    await waitScreen(page, 'name');
    const prefilled = await page.locator('input[name="guided-name"]').inputValue();
    u = await ui(page);
    check(`${w} Google: name prefilled (${prefilled}), "Step 2 of 5"`, () => { assert.equal(prefilled, 'Gabe Google'); assert.equal(u.label, 'Step 2 of 5'); });
    await page.locator('[data-guided-next]').click();
    await answerRest(page, 'details', { area: 'city', picks: ['Badminton'] });
    await page.locator('[data-guided-next]').click();
    const revealed = await waitScreen(page, 'reveal', 8000);
    const at = order(calls, [isProfileWrite, rpcAt('declare_adult'), rpcAt('set_home_city'), rpcAt('set_member_interests')]);
    const items = JSON.parse(calls.find(rpcAt('set_member_interests'))?.body || '{}').p_items || [];
    check(`${w} Google: no signUp; profile -> declare_adult -> set_home_city -> interests (${at.join(' < ')}); one pick holds 20`, () => {
      assert.equal(revealed, true); assert.equal(calls.filter((c) => c.path === '/auth/v1/signup').length, 0);
      assert.ok(at.every((i) => i >= 0)); assert.deepEqual([...at].sort((x, y) => x - y), at);
      assert.deepEqual(JSON.parse(calls.find(rpcAt('set_home_city')).body), { p_place_id: 'in-pune' });
      assert.deepEqual(items, [{ interest_id: 'sports.racket.badminton', points: 20, mode: 'play' }]);
      assert.equal(state.profile.name, 'Gabe Google'); assert.equal(state.profile.gender, 'Female');
    });
    await context.close();
  }

  // ---- A returning incomplete member resumes at the first unfinished screen; a failed save keeps the screen ----
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const { calls } = await setup(context, { signedIn: true, profile: { id: ME, name: 'Ray Resume', email: EMAIL, phone_number: '9876543210', phone_country_code: '+91', gender: 'Male', experience: '3–7 years' }, adultAt: '2026-10-18T00:00:00Z', failRpc: ['set_member_interests'] });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html?complete-profile=1`, { waitUntil: 'load' });
    const resumed = await waitScreen(page, 'area', 8000);
    let u = await ui(page);
    check(`resume: 18+, name and details done -> Area at "Step 5 of 6" (${await screenOf(page)})`, () => { assert.equal(resumed, true); assert.equal(u.label, 'Step 5 of 6'); });
    await answerRest(page, 'area', { area: 'city', picks: ['Chess', 'Guitar'] });
    await page.locator('[data-guided-next]').click();
    await page.waitForTimeout(1200);
    u = await ui(page);
    const screen = await screenOf(page);
    const declared = calls.filter(rpcAt('declare_adult')).length;
    const exp = calls.filter(isProfileWrite).map((c) => JSON.parse(c.body).experience);
    check(`resume: a failed interests save keeps Interests with the line (${screen}: ${u.error}); declare_adult not repeated; experience kept`, () => {
      assert.equal(screen, 'interests'); assert.match(u.error, /could not be saved|didn't save/i); assert.equal(declared, 0);
      assert.ok(exp.every((e) => e === '3–7 years'), JSON.stringify(exp));
    });
    await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setup(context, { signedIn: true, profile: { id: ME, name: 'Done Member', email: EMAIL }, adultAt: '2026-10-18T00:00:00Z', hasCell: true, interests: [{ interest_id: 'games.board.chess', points: 20, mode: 'play' }] });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'load' });
    const toApp = await page.waitForURL(/\/app\.html/, { timeout: 8000 }).then(() => true).catch(() => false);
    check('a completed member opening auth.html#signup lands on /app.html', () => assert.equal(toApp, true));
    await context.close();
  }

  // ---- VITE_SIGNUP_FLOW=classic: the 4-step form, no guided view ----
  {
    const CLASSIC_PORT = Number(process.env.E2E_CLASSIC_PORT || PORT + 2);
    const stopClassic = await startVite(CLASSIC_PORT, { VITE_SIGNUP_FLOW: 'classic' });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.route(`${ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'access-control-allow-origin': '*' } }));
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${CLASSIC_PORT}/auth.html#signup`, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      const r = await page.evaluate(() => ({ classic: !document.querySelector('[data-auth-view="signup"]').hidden, guided: !document.querySelector('[data-auth-view="guided"]').hidden, label: document.querySelector('[data-signup-step-label]')?.textContent }));
      check(`VITE_SIGNUP_FLOW=classic shows the 4-step form (${JSON.stringify(r)})`, () => { assert.equal(r.classic, true); assert.equal(r.guided, false); assert.match(r.label, /STEP 1 OF 4/); });
      await context.close();
    } finally { stopClassic(); }
  }

} finally {
  await browser.close();
  stopVite();
}

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
