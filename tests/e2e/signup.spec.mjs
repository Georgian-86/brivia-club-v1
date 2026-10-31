// Guided signup again (polish wave B, D-073; first D-067/D-068) against a stubbed Supabase. Never touches a real project.
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/signup.spec.mjs
//   E2E_SCREENSHOTS=<dir> also saves a screenshot of every screen. E2E_PORT overrides the Vite port (default 5193).
// D-102: signup ends on a required profile photo; D-112 adds About you after it (looking for + bio, both required),
// whose button creates the account ("Step n of 6"; Google "of 5"); setup (area, interests: "Set up n of 2") follows
// and is the only way to the app.
// Screens (B2), at 1440 and 375 px plus a 320 px overflow pass: one question per screen (exactly one [data-question]),
// bubbles done / current / pending, Enter = Continue, Back on every question screen, 18+ required,
// mismatched passwords blocked, Area with A1's locateOnce (granted: the status line; denied: fallbackCopy and the city
// list), Interests (0 picks disables Continue, the 13th is refused, the tray animates, not under reduced motion,
// private interests never offered), axe clean, 44 px targets, computed text contrast >= 4.5:1, no sideways scroll.
// Submit (B3): signUp at the end -> profile -> declare_adult (2026-10-05) -> set_home_* -> set_member_interests (20
// points, even split); Verify without a session (pending profile, no coordinates); Google skips Account; a returning
// member resumes at the first unfinished screen; VITE_SIGNUP_FLOW=classic shows the 4-step form.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
    if (opts.delay?.[p]) await new Promise((r) => setTimeout(r, opts.delay[p]));
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
    // D-109: opts.catalog gives every public level-3 node a catalog_order (A-Z) and answers add_member_interest.
    if (p === '/rest/v1/interest_node') return json(200, opts.catalog ? nodes.map((n) => ({ ...n, catalog_order: n.level >= 3 && !n.sensitive ? 1 + [...nodes].filter((x) => x.level >= 3 && !x.sensitive).sort((a, b) => a.label.localeCompare(b.label)).findIndex((x) => x.id === n.id) : null })) : nodes);
    if (rpc === 'add_member_interest') return json(200, 'member.custom.kite_surfing_club');
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
    h1: [...root.querySelectorAll('h1')].filter(visible).length,
    pageH1: [...document.querySelectorAll('h1')].filter(visible).length,
    h2: [...root.querySelectorAll('h2')].filter(visible).length,
    title: root.querySelector('h1')?.textContent.trim(),
    label: visible(root.querySelector('[data-guided-step-label]')) ? root.querySelector('[data-guided-step-label]').textContent : null,
    // D-082b: the stepper is a row of bars (done / current / pending), one per question.
    bubbles: [...root.querySelectorAll('.guided-bar')].filter(visible).map((b) => `${b.dataset.step}:${b.className.match(/is-(done|current|pending)/)?.[1]}`),
    primaries: [next, ...root.querySelectorAll('.guided-choice--primary')].filter(visible).length,
    nextDisabled: next?.disabled,
    back: visible(root.querySelector('[data-guided-back]')),
    error: root.querySelector('[data-guided-error]')?.hidden ? '' : root.querySelector('[data-guided-error]')?.textContent,
    points: [...root.querySelectorAll('input')].filter((i) => /points/i.test(i.name)).length,
    text: root.innerText,
    firstTab: root.querySelector('.guided-menu-label')?.textContent.trim() || null,
  };
});

// D-102: the photo screen. Picks a real PNG through the hidden file input and frames it ("Use photo").
const PHOTO_PNG = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../source-media/assets/badminton-premium-no-shuttle.png'));
const addPhoto = async (page) => {
  await page.locator('[data-guided-photo-input]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PHOTO_PNG });
  await page.locator('[data-photo-crop-use]').click({ timeout: 8000 });
  await page.waitForFunction(() => document.querySelector('[data-guided-photo-preview] img') && !document.querySelector('[data-guided-next]').disabled, null, { timeout: 8000 });
};

// D-112: About you. Picks one "Looking for" from the dropdown and writes a bio.
const BIO = 'I build small tools and play badminton on weekends.';
const addAbout = async (page, { bio = BIO } = {}) => {
  await page.locator('input[name="guided-looking"]').click();
  await page.locator('.guided-menu-option[data-value="Co-founder"]').click();
  await page.locator('input[name="guided-looking"]').press('Escape');
  await page.locator('textarea[name="guided-bio"]').fill(bio);
};

// D-095: the interests step is a dropdown; this opens it and waits for its options.
const openInterests = async (page) => {
  await page.locator('input[name="guided-interest"]').click();
  await page.waitForSelector('.guided-menu-option[data-id]', { timeout: 5000 });
};

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
// Fix round 1 (M6, M7): every guided heading seen, for one punctuation rule; one visible h1 on the page.
const seenTitles = new Set();
const headingInfo = (page) => page.evaluate(() => {
  const visible = (el) => Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  return { title: document.querySelector('#guided-signup h1, #guided-signup h2')?.textContent.trim() || '', h1: [...document.querySelectorAll('h1')].filter(visible).map((h) => h.textContent.trim()) };
});
// Fix round 1 (M1): where focus lands and the focused element's accessible description (aria-describedby text).
const focusInfo = (page) => page.evaluate(() => {
  const el = document.activeElement;
  const ids = (el?.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  return { tag: el?.tagName.toLowerCase() || '', id: el?.id || '', name: el?.getAttribute('name') || '', description: ids.map((id) => document.getElementById(id)?.textContent.trim() || '').join(' ') };
});
// Fix round 1 (M6): the label type of a button's text span (case, size, weight, tracking).
const typeOf = (page, sel) => page.evaluate((q) => { const el = document.querySelector(q); if (!el) return null; const c = getComputedStyle(el); return { transform: c.textTransform, size: c.fontSize, weight: c.fontWeight, spacing: c.letterSpacing }; }, sel);
const auditScreen = async (page, tag) => {
  await settleAnimations(page);
  const h = await headingInfo(page);
  if (h.title) seenTitles.add(h.title);
  check(`${tag}: the question heading is the page's one visible h1 (${JSON.stringify(h.h1)})`, () => { assert.equal(h.h1.length, 1); assert.equal(h.h1[0], h.title); });
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
      assert.match(u.text, /Continue with Google/i); assert.match(u.text, /Continue with email/i); assert.match(u.text, /I already have an account/i);
      assert.equal(u.label, null); assert.deepEqual(u.bubbles, []); assert.equal(u.h1, 1); assert.equal(u.primaries, 1); assert.equal(u.questions, 0);
    });
    const welcomeType = await typeOf(page, '[data-guided-email] > span');
    const classicHidden = await page.evaluate(() => document.querySelector('[data-auth-view="signup"]')?.hidden);
    check(`${w} the classic 4-step form is not shown`, () => assert.equal(classicHidden, true));
    await auditScreen(page, `${w} welcome`);

    await page.locator('[data-guided-email]').click();
    await waitScreen(page, 'account');
    u = await ui(page);
    check(`${w} account: one question, "Step 1 of 6", first bubble current, Back shown, Continue disabled (${u.bubbles.join(' ')})`, () => {
      assert.equal(u.questions, 1); assert.equal(u.h1, 1); assert.equal(u.primaries, 1); assert.equal(u.label, 'Step 1 of 6');
      assert.deepEqual(u.bubbles, ['account:current', 'adult:pending', 'name:pending', 'details:pending', 'photo:pending', 'about:pending']);
      assert.equal(u.back, true); assert.equal(u.nextDisabled, true);
    });
    let f = await focusInfo(page);
    check(`${w} account: focus ${mobile ? 'on the question heading (touch)' : 'in the email field, described by the question'} (${JSON.stringify(f)})`, () => {
      if (mobile) { assert.equal(f.tag, 'h1'); assert.equal(f.id, 'signup-screen-title'); }
      else { assert.equal(f.name, 'guided-email'); assert.match(f.description, /^Create your account\./); }
    });
    const backType = await typeOf(page, '[data-guided-back] > span');
    const nextType = await typeOf(page, '[data-guided-next] > span');
    check(`${w} Back and Continue use the Welcome buttons' classic uppercase type (D-086) (${JSON.stringify({ backType, nextType, welcomeType })})`, () => {
      assert.equal(welcomeType.transform, 'uppercase');
      assert.deepEqual(backType, welcomeType); assert.deepEqual(nextType, welcomeType);
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
      assert.match(u.text, /I'm 18 or older/i); assert.match(u.text, /privacy|How we use your data/i); assert.equal(u.nextDisabled, true);
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
    f = await focusInfo(page);
    check(`${w} name: focus ${mobile ? 'on the question heading (touch)' : 'in the name field, described by the question'} (${JSON.stringify(f)})`, () => {
      if (mobile) { assert.equal(f.tag, 'h1'); assert.equal(f.id, 'signup-screen-title'); }
      else { assert.equal(f.name, 'guided-name'); assert.match(f.description, /^What should members call you\?/); }
    });
    await page.locator('input[name="guided-name"]').fill('Gia Guided');
    await shot(page, `${w}-04-name`);
    await auditScreen(page, `${w} name`);
    await page.locator('input[name="guided-name"]').press('Enter');
    await waitScreen(page, 'details');
    u = await ui(page);
    check(`${w} details: phone + gender, "Step 4 of 6", Continue disabled until both`, () => {
      assert.equal(u.label, 'Step 4 of 6'); assert.equal(u.questions, 1); assert.equal(u.nextDisabled, true); assert.match(u.text, /Prefer not to say/i);
    });
    await page.locator('input[name="guided-phone"]').fill('98765 43210');
    u = await ui(page);
    check(`${w} details: a phone alone is not enough`, () => assert.equal(u.nextDisabled, true));
    await page.locator('.guided-segment[data-gender="Female"]').click();
    await shot(page, `${w}-05-details`);
    await auditScreen(page, `${w} details`);
    await page.locator('input[name="guided-phone"]').press('Enter');
    await waitScreen(page, 'photo');
    u = await ui(page);
    check(`${w} photo: "Step 5 of 6"; Continue disabled until a photo, Enter refused`, () => {
      assert.equal(u.label, 'Step 5 of 6'); assert.equal(u.questions, 1); assert.equal(u.nextDisabled, true);
      assert.match(u.text, /Add a profile photo/); assert.match(u.text, /Continue/i);
      assert.deepEqual(u.bubbles.slice(-3), ['details:done', 'photo:current', 'about:pending']);
    });
    check(`${w} photo: still no account before the photo screen's button`, () => assert.equal(calls.filter((c) => c.path.startsWith('/auth/v1/signup')).length, 0));
    await page.locator('[data-guided-next]').click({ force: true });
    await page.waitForTimeout(200);
    const stillPhoto = await screenOf(page);
    check(`${w} photo is required (still ${stillPhoto})`, () => assert.equal(stillPhoto, 'photo'));
    await auditScreen(page, `${w} photo`);
    await addPhoto(page);
    u = await ui(page);
    check(`${w} photo: framed photo previewed, "Change photo", Continue enabled`, () => { assert.match(u.text, /Change photo/i); assert.equal(u.nextDisabled, false); });
    await shot(page, `${w}-05b-photo`);
    await auditScreen(page, `${w} photo framed`);
    await page.locator('[data-guided-next]').click();
    // D-112: About you, the last signup question. Both fields are required; its button creates the account.
    await waitScreen(page, 'about');
    u = await ui(page);
    check(`${w} about: "Step 6 of 6", the last signup question; "Create account" disabled while empty`, () => {
      assert.equal(u.label, 'Step 6 of 6'); assert.equal(u.questions, 1); assert.equal(u.nextDisabled, true); assert.equal(u.back, true);
      assert.match(u.text, /Tell members about you/); assert.match(u.text, /Looking for/i); assert.match(u.text, /Bio/i); assert.match(u.text, /Create account/i);
      assert.deepEqual(u.bubbles.slice(-2), ['photo:done', 'about:current']);
    });
    check(`${w} about: still no account before its button`, () => assert.equal(calls.filter((c) => c.path.startsWith('/auth/v1/signup')).length, 0));
    await page.locator('input[name="guided-looking"]').click();
    await page.waitForTimeout(250); // the open list scrolls into view on the next frame
    const lookingMenu = await page.evaluate(() => {
      const input = document.querySelector('input[name="guided-looking"]');
      const menu = document.querySelector('#guided-looking-options');
      const r = menu.getBoundingClientRect();
      return { expanded: input.getAttribute('aria-expanded'), role: menu.getAttribute('role'), n: menu.querySelectorAll('[role="option"]').length, rowH: Math.round(menu.querySelector('.guided-menu-option').getBoundingClientRect().height), onScreen: r.top >= 0 && r.bottom <= window.innerHeight + 1 };
    });
    check(`${w} about: Looking for opens a listbox of suggestions (${lookingMenu.n}, rows ${lookingMenu.rowH}px)`, () => {
      assert.equal(lookingMenu.expanded, 'true'); assert.equal(lookingMenu.role, 'listbox'); assert.ok(lookingMenu.n >= 20); assert.ok(lookingMenu.rowH >= 44); assert.equal(lookingMenu.onScreen, true);
    });
    await shot(page, `${w}-05c-about-open`);
    await page.locator('.guided-menu-option[data-value="Co-founder"]').click();
    await page.locator('input[name="guided-looking"]').fill('Chai buddy');
    await page.locator('input[name="guided-looking"]').press('Enter');
    const looking = await page.evaluate(() => [...document.querySelectorAll('.guided-tray--looking .guided-pick')].map((b) => b.dataset.value));
    check(`${w} about: a suggestion and the member's own words both land in the tray (${looking.join(', ')})`, () => assert.deepEqual(looking, ['Co-founder', 'Chai buddy']));
    await page.locator('input[name="guided-looking"]').press('Escape');
    u = await ui(page);
    check(`${w} about: Looking for alone is not enough (bio required)`, () => assert.equal(u.nextDisabled, true));
    await page.locator('textarea[name="guided-bio"]').fill('Hi there');
    u = await ui(page);
    check(`${w} about: a bio under 20 characters is not enough`, () => assert.equal(u.nextDisabled, true));
    await page.locator('textarea[name="guided-bio"]').fill(BIO);
    u = await ui(page);
    const bioCount = await page.locator('[data-guided-bio-count]').textContent();
    check(`${w} about: both answered enables Create account; the count reads ${bioCount}`, () => { assert.equal(u.nextDisabled, false); assert.equal(Number(bioCount), BIO.length); });
    await shot(page, `${w}-05d-about`);
    await auditScreen(page, `${w} about`);
    await page.locator('[data-guided-next]').click();
    await waitScreen(page, 'area', 8000);
    u = await ui(page);
    check(`${w} area: setup starts after the account exists ("Set up 1 of 2", "Before you start", no Back into signup), Continue disabled until an area`, () => {
      assert.equal(u.label, 'Set up 1 of 2'); assert.equal(u.questions, 1); assert.equal(u.nextDisabled, true);
      assert.match(u.text, /Before you start/i); assert.equal(u.back, false);
      assert.deepEqual(u.bubbles, ['area:current', 'interests:pending']);
      assert.equal(calls.filter((c) => c.path.startsWith('/auth/v1/signup')).length, 1);
    });
    await page.locator('[data-guided-geo]').click();
    await page.waitForFunction((t) => document.querySelector('[data-guided-area-status]')?.textContent === t, GOT_IT, { timeout: 4000 }).catch(() => {});
    u = await ui(page);
    const dom = await page.evaluate(() => document.documentElement.outerHTML);
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    check(`${w} area: location granted -> "${GOT_IT}", Continue enabled, no coordinates in the DOM, storage or any request`, () => {
      assert.match(u.text, /Got it\. We keep only the ~2 km square you're in\./); assert.equal(u.nextDisabled, false);
      assert.ok(!COORD_RE.test(dom.replace(/src="blob:[^"]*"/g, ''))); assert.ok(!COORD_RE.test(stored));
      assert.equal(calls.filter((c) => COORD_RE.test(c.url) || COORD_RE.test(c.body)).length, 0);
    });
    await shot(page, `${w}-06-area`);
    await auditScreen(page, `${w} area`);
    await page.keyboard.press('Enter');
    await waitScreen(page, 'interests');
    await openInterests(page);
    u = await ui(page);
    check(`${w} interests: "Set up 2 of 2", Continue disabled with 0 picks, private ones never offered, popular first, no points input`, () => {
      assert.equal(u.label, 'Set up 2 of 2'); assert.equal(u.questions, 1); assert.equal(u.nextDisabled, true);
      assert.ok(!/A private belief/.test(u.text)); assert.equal(u.firstTab, 'Popular'); assert.match(u.text, /Chess/i);
      assert.equal(u.points, 0); assert.ok(!/passion points|points left/i.test(u.text));
    });
    await page.locator('.guided-menu-option', { hasText: /^Chess$/ }).first().click();
    await page.waitForTimeout(320);
    const picked = await page.evaluate(() => ({ count: document.querySelector('[data-guided-count]').textContent, selected: document.querySelector('.guided-menu-option[aria-selected="true"]')?.textContent.trim(), tray: [...document.querySelectorAll('.guided-pick')].map((b) => b.textContent.replace('×', '').trim()), open: !document.querySelector('.guided-menu').hidden, next: document.querySelector('[data-guided-next]').disabled }));
    check(`${w} a pick from the dropdown lands in the "Your picks" tray, "1 picked", the list stays open for another, Continue enabled (${JSON.stringify(picked)})`, () => {
      assert.equal(picked.count, '1 picked'); assert.equal(picked.selected, 'Chess');
      assert.deepEqual(picked.tray, ['Chess']); assert.equal(picked.open, true); assert.equal(picked.next, false);
    });
    await page.locator('.guided-pick', { hasText: 'Chess' }).click();
    await page.waitForTimeout(320);
    const removed = await page.evaluate(() => ({ count: document.querySelector('[data-guided-count]').textContent, next: document.querySelector('[data-guided-next]').disabled }));
    check(`${w} tapping a pick in the tray removes it; 0 picks disables Continue again`, () => { assert.equal(removed.count, '0 picked'); assert.equal(removed.next, true); });
    await openInterests(page);
    await shot(page, `${w}-07a-interests-open`);
    for (let i = 0; i < 13; i += 1) { await page.locator('.guided-menu-option[aria-selected="false"][data-id]').first().click(); await page.waitForTimeout(30); }
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
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'photo'); await note('photo');
    await addPhoto(page);
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'about');
    await addAbout(page); await note('about');
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'area', 8000); await note('area');
    await page.locator('[data-guided-geo]').click();
    await page.waitForFunction(() => !document.querySelector('[data-guided-next]').disabled, null, { timeout: 4000 }).catch(() => {});
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'interests');
    await openInterests(page);
    for (const label of ['Chess', 'Guitar', 'Hackathons']) await page.locator('.guided-menu-option', { hasText: new RegExp(`^${label}$`) }).first().click();
    await page.keyboard.press('Escape');
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
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'photo');
    await addPhoto(page);
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'about');
    await addAbout(page);
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'area', 8000);
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
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'photo');
    await addPhoto(page);
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'about');
    await addAbout(page);
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'area', 8000);
    await page.locator('[data-guided-geo]').click();
    await page.waitForFunction(() => !document.querySelector('[data-guided-next]').disabled, null, { timeout: 4000 }).catch(() => {});
    await page.locator('[data-guided-next]').click(); await waitScreen(page, 'interests');
    await openInterests(page);
    await page.evaluate(() => { window.__ghosts = 0; new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => { if (n.classList?.contains('guided-ghost')) window.__ghosts += 1; }))).observe(document.body, { childList: true }); });
    await page.locator('.guided-menu-option', { hasText: /^Chess$/ }).first().click();
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ ghosts: window.__ghosts, tray: document.querySelectorAll('.guided-pick').length, glow: (() => { const el = document.querySelector('.guided-bar.is-current'); return el ? getComputedStyle(el).animationName : 'no bar'; })() }));
    check(`reduced motion: the pick lands in the tray without a flying chip and the current bubble does not pulse (${JSON.stringify(r)})`, () => { assert.equal(r.ghosts, 0); assert.equal(r.tray, 1); assert.equal(r.glow, 'none'); });
    await context.close();
  }
  // ================================ B3: the answers save through the existing pipeline ================================
  // Walks from the current screen to the Finish button (or, with { until: 'about' }, to About you's button, which
  // creates the account, D-112). opts: { area: 'geo' | 'city', picks }.
  const answerRest = async (page, from, { area = 'city', picks = ['Chess', 'Guitar', 'Hackathons'], name = 'Gia Guided', until = 'interests' } = {}) => {
    const order = ['account', 'adult', 'name', 'details', 'photo', 'about', 'area', 'interests'];
    for (const screen of order.slice(order.indexOf(from))) {
      await waitScreen(page, screen, 8000);
      if (screen === 'photo') {
        if (!(await page.locator('[data-guided-photo-preview] img').count())) await addPhoto(page);
        await page.locator('[data-guided-next]').click();
        continue;
      }
      if (screen === 'about') {
        if (!(await page.locator('.guided-tray--looking .guided-pick').count())) await addAbout(page);
        if (until === 'about') return;
        await page.locator('[data-guided-next]').click();
        continue;
      }
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
        await openInterests(page);
        for (const label of picks) { await page.locator('.guided-menu-option', { hasText: new RegExp(`^${label}$`) }).first().click(); await page.waitForTimeout(40); }
        await page.keyboard.press('Escape'); // done picking: the list closes (Escape, Tab or a press outside)
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
    const upload = calls.findIndex((c) => c.path.startsWith('/storage/v1/object/profile-photos/'));
    check(`${w} submit: the framed photo is uploaded before the profile row is written, and the row stores it (${upload})`, () => {
      assert.ok(upload >= 0 && upload < at[1]); assert.match(String(state.profile?.photo_url || ''), new RegExp(`/profile-photos/${ME}/`));
    });
    check(`${w} submit: the account is created on About you, then profile -> declare_adult; setup sends set_home_location -> set_member_interests (${at.join(' < ')})`, () => {
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
    check(`${w} submit: looking for and the bio are on the member's own row (D-112: ${JSON.stringify(state.profile?.looking_for)})`, () => {
      assert.deepEqual(state.profile.looking_for, ['Co-founder']); assert.equal(state.profile.bio, BIO);
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
    await answerRest(page, 'account', { until: 'about' });
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
    check(`${w} confirmation on: Verify comes straight after About you; the pending profile keeps adultDeclared, looking for, the bio and the photo (a compressed data:image), no interests (asked after login), no coordinates, no password`, () => {
      assert.equal(p.adultDeclared, true); assert.deepEqual(p.interests, []); assert.match(String(p.photoUrl || ''), /^data:image\/(jpeg|webp|png);base64,/);
      assert.match(u.text, /pick your area and interests next/);
      assert.equal(p.phoneNumber, '9876543210'); assert.equal(p.gender, 'Female');
      assert.equal(p.lookingFor, 'Co-founder'); assert.equal(p.bio, BIO);
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
    await answerRest(page, 'account', { until: 'about' });
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
      assert.deepEqual(u.bubbles, ['adult:current', 'name:pending', 'details:pending', 'photo:pending', 'about:pending']);
    });
    await page.locator('[data-guided-back]').click();
    await waitScreen(page, 'welcome');
    u = await ui(page);
    if (u.title) seenTitles.add(u.title);
    check(`${w} Google: Back from 18+ goes to Welcome (signed in), never to an account screen`, () => { assert.match(u.text, /Welcome back/i); assert.match(u.text, /Sign out/i); });
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
    const { calls } = await setup(context, { signedIn: true, profile: { id: ME, name: 'Ray Resume', email: EMAIL, phone_number: '9876543210', phone_country_code: '+91', gender: 'Male', experience: '3–7 years', looking_for: ['Mentor'], photo_url: `${ORIGIN}/storage/v1/object/public/profile-photos/${ME}/p.jpg` }, adultAt: '2026-10-18T00:00:00Z', failRpc: ['set_member_interests'] });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html?complete-profile=1`, { waitUntil: 'load' });
    const resumed = await waitScreen(page, 'area', 8000);
    let u = await ui(page);
    check(`resume: 18+, name, details, photo and About you done -> Area at "Set up 1 of 2" (${await screenOf(page)})`, () => { assert.equal(resumed, true); assert.equal(u.label, 'Set up 1 of 2'); });
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
  // D-109: the founder's catalogue: the list is A-Z under letter headings (no Popular); typing an interest that is not
  // there offers "Add … as your own interest", which adds it to the picks and saves through set_member_interests.
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, ...(w < 780 ? { isMobile: true, hasTouch: true } : {}) });
    const { state, posts } = await setup(context, { signedIn: true, catalog: true, hasCell: true, profile: { id: ME, name: 'Cat Alog', email: EMAIL, phone_number: '9876543210', phone_country_code: '+91', gender: 'Female', experience: '3–7 years', looking_for: ['Mentor'], photo_url: `${ORIGIN}/storage/v1/object/public/profile-photos/${ME}/p.jpg` }, adultAt: '2026-10-18T00:00:00Z' });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html?complete-profile=1`, { waitUntil: 'load' });
    await waitScreen(page, 'interests', 8000);
    await openInterests(page);
    const menu = await page.evaluate(() => ({ labels: [...document.querySelectorAll('.guided-menu-label')].map((x) => x.textContent.trim()), first: document.querySelector('.guided-menu-option')?.textContent.trim() }));
    check(`${w} catalogue: letter headings A-Z, no Popular (${JSON.stringify(menu)})`, () => { assert.equal(menu.labels[0], 'B'); assert.ok(!menu.labels.includes('Popular')); assert.deepEqual(menu.labels, [...menu.labels].sort()); assert.equal(menu.first, 'Badminton'); });
    const axe = await axeViolations(page, { include: '#guided-signup' });
    check(`${w} catalogue: axe on the open A-Z list (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
    await shot(page, `${w}-catalog-open`);
    await page.locator('input[name="guided-interest"]').fill('Kite  surfing club');
    const add = page.locator('.guided-menu-option.is-add');
    const addText = await add.textContent().catch(() => 'none');
    check(`${w} catalogue: "Add … as your own interest" is offered (${addText})`, () => assert.match(addText, /Add “Kite surfing club” as your own interest/));
    await shot(page, `${w}-catalog-own`);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('.guided-pick')].some((b) => /Kite surfing club/.test(b.textContent)));
    check(`${w} catalogue: Enter on the row adds it through add_member_interest`, () => assert.equal(JSON.parse(posts('add_member_interest').at(-1)?.body || '{}').p_label, 'Kite surfing club'));
    await page.keyboard.press('Escape');
    await page.locator('[data-guided-next]').click();
    await page.waitForFunction(() => document.querySelector('#guided-signup')?.dataset.screen === 'reveal', null, { timeout: 6000 }).catch(() => {});
    check(`${w} catalogue: Finish saves the own interest (${JSON.stringify(state.interests.map((i) => i.interest_id))})`, () => assert.deepEqual(state.interests.map((i) => i.interest_id), ['member.custom.kite_surfing_club']));
    await context.close();
  }
  // D-102: an incomplete member with no photo is asked for it first; the photo screen saves it and setup follows.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const { state, calls } = await setup(context, { signedIn: true, profile: { id: ME, name: 'Noa Nophoto', email: EMAIL, phone_number: '9876543210', phone_country_code: '+91', gender: 'Female' }, adultAt: '2026-10-18T00:00:00Z' });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html?complete-profile=1`, { waitUntil: 'load' });
    const atPhoto = await waitScreen(page, 'photo', 8000);
    const label = (await ui(page)).label;
    await addPhoto(page);
    await page.locator('[data-guided-next]').click();
    const atAbout = await waitScreen(page, 'about', 8000);
    await addAbout(page);
    const button = (await page.locator('[data-guided-next]').innerText()).trim();
    await page.locator('[data-guided-next]').click();
    const atArea = await waitScreen(page, 'area', 8000);
    check(`resume without a photo: Photo first ("${label}"), then About you (button "${button}"), then setup; photo, looking for and bio stored, no signUp, no second declaration`, () => {
      assert.equal(atPhoto, true); assert.equal(label, 'Step 5 of 6'); assert.equal(atAbout, true); assert.match(button, /continue/i); assert.equal(atArea, true);
      assert.match(String(state.profile.photo_url || ''), /\/profile-photos\//);
      assert.deepEqual(state.profile.looking_for, ['Co-founder']); assert.equal(state.profile.bio, BIO);
      assert.equal(calls.filter((c) => c.path === '/auth/v1/signup').length, 0); assert.equal(calls.filter(rpcAt('declare_adult')).length, 0);
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

  // ================================ Fix round 1 ================================
  // I1: one submit per button. A double tap (taps keep coming every 10 ms while the screen is on) and Enter+Enter
  // (a real Enter, then synthetic Enters every 10 ms): on About you of the email path that ends on Verify (no
  // session: one signUp, nothing else), and on Interests of the path that ends on Reveal (a session: one signUp, one
  // declare_adult, one area RPC and one set_member_interests). Back is disabled while the submit is in flight.
  for (const kind of ['verify', 'session']) {
    for (const how of ['click', 'enter']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await scriptGeo(context, 'ok');
      const delay = kind === 'verify' ? { '/auth/v1/signup': 450 } : { '/rest/v1/rpc/set_member_interests': 450 };
      const { calls } = await setup(context, { confirm: kind === 'verify', delay });
      const page = await context.newPage();
      await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'load' });
      await waitScreen(page, 'welcome');
      await page.locator('[data-guided-email]').click();
      const screenName = kind === 'verify' ? 'about' : 'interests';
      const field = kind === 'verify' ? 'input[name="guided-looking"]' : 'input[name="guided-interest"]';
      await answerRest(page, 'account', { area: 'city', until: screenName });
      if (how === 'enter') await page.locator(field).focus();
      const run = page.evaluate(([mode, at, sel]) => new Promise((resolve) => {
        const root = document.querySelector('#guided-signup');
        const next = root.querySelector('[data-guided-next]');
        const back = root.querySelector('[data-guided-back]');
        const input = root.querySelector(sel);
        const samples = [];
        const enter = () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        const started = Date.now();
        const timer = setInterval(() => {
          const busy = next.getAttribute('aria-busy') === 'true';
          samples.push({ busy, backDisabled: back.disabled, backHidden: back.hidden });
          if (root.dataset.screen === at) { if (mode === 'click') next.click(); else enter(); }
          if (Date.now() - started > 2500) { clearInterval(timer); resolve(samples); }
        }, 10);
      }), [how, screenName, field]);
      // The first tap is the interval's first tick; the Enter run starts with a real key press.
      if (how === 'enter') await page.locator(field).dispatchEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      const samples = await run;
      const target = kind === 'verify' ? 'verify' : 'reveal';
      const landed = await waitScreen(page, target, 6000);
      await page.waitForTimeout(500);
      const count = (test) => calls.filter(test).length;
      const n = {
        signUp: count((c) => c.path === '/auth/v1/signup'),
        declare: count(rpcAt('declare_adult')),
        area: count((c) => rpcAt('set_home_city')(c) || rpcAt('set_home_location')(c)),
        interests: count(rpcAt('set_member_interests')),
      };
      const inFlight = samples.filter((x) => x.busy && !x.backHidden);
      check(`I1 ${kind} ${how}: one submit per Finish, ends on ${target} (${await screenOf(page)}; ${JSON.stringify(n)})`, () => {
        assert.equal(landed, true);
        assert.deepEqual(n, kind === 'verify' ? { signUp: 1, declare: 0, area: 0, interests: 0 } : { signUp: 1, declare: 1, area: 1, interests: 1 });
      });
      check(`I1 ${kind} ${how}: Back is disabled while the submit is in flight (${inFlight.length} busy samples, ${inFlight.filter((x) => !x.backDisabled).length} with Back enabled)`, () => {
        assert.ok(inFlight.length >= 5); assert.ok(inFlight.every((x) => x.backDisabled));
      });
      const backAfter = kind === 'verify' ? null : await page.evaluate(() => document.querySelector('[data-guided-back]').disabled);
      if (backAfter !== null) check(`I1 ${kind} ${how}: Back is enabled again once the submit is done`, () => assert.equal(backAfter, false));
      await context.close();
    }
  }

  // M2: the guided "Continue with Google" is disabled and busy while the OAuth start runs; a failed start shows a
  // visible line on the Welcome screen itself (not the hidden login note) and gives the button back.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setup(context);
    // A stubbed OAuth start failure: building the authorize URL throws (the select_account query is Google's).
    await context.addInitScript(() => {
      const Real = window.URLSearchParams;
      window.URLSearchParams = class extends Real {
        constructor(init) { if (init && typeof init === 'object' && !(init instanceof Real) && !Array.isArray(init) && init.prompt === 'select_account') throw new Error('stub: oauth start failed'); super(init); }
      };
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'load' });
    await waitScreen(page, 'welcome');
    await page.evaluate(() => {
      window.__googleBusy = [];
      const b = document.querySelector('[data-guided-google]');
      new MutationObserver(() => window.__googleBusy.push({ disabled: b.disabled, busy: b.getAttribute('aria-busy') })).observe(b, { attributes: true });
    });
    await page.locator('[data-guided-google]').click();
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const box = document.querySelector('[data-guided-error]');
      if (!box) return { url: location.href };
      const b = document.querySelector('[data-guided-google]');
      return { screen: document.querySelector('#guided-signup').dataset.screen, error: box.hidden ? '' : box.textContent, visible: Boolean(box.getClientRects().length), log: window.__googleBusy, disabled: b.disabled, busy: b.getAttribute('aria-busy') };
    });
    check(`M2 guided Google: busy while starting, then a visible line on Welcome when the start fails (${JSON.stringify(r)})`, () => {
      assert.equal(r.screen, 'welcome'); assert.equal(r.visible, true); assert.match(r.error, /Google sign-in could not start/);
      assert.ok(r.log.some((x) => x.disabled && x.busy === 'true')); assert.equal(r.disabled, false); assert.notEqual(r.busy, 'true');
    });
    await auditScreen(page, 'M2 welcome with the Google line');
    await context.close();
  }

  // M3: resuming at Area with a complete saved budget (custom points and modes) and finishing with the same picks keeps
  // them: no set_member_interests call, the saved rows unchanged.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const saved = [{ interest_id: 'games.board.chess', points: 13, mode: 'learn' }, { interest_id: 'music.instruments.guitar', points: 7, mode: 'teach' }];
    const { state, calls } = await setup(context, { signedIn: true, profile: { id: ME, name: 'Kim Keep', email: EMAIL, phone_number: '9876543210', phone_country_code: '+91', gender: 'Female', looking_for: ['Mentor'], photo_url: `${ORIGIN}/storage/v1/object/public/profile-photos/${ME}/p.jpg` }, adultAt: '2026-10-18T00:00:00Z', interests: saved.map((x) => ({ ...x })) });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html?complete-profile=1`, { waitUntil: 'load' });
    const atArea = await waitScreen(page, 'area', 8000);
    await page.locator('input[name="guided-city"]').fill('Pune');
    await page.waitForSelector('.guided-cities button[data-place="in-pune"]', { timeout: 4000 }).catch(() => {});
    await page.locator('.guided-cities button[data-place="in-pune"]').click();
    await page.locator('[data-guided-next]').click();
    await waitScreen(page, 'interests');
    await page.waitForSelector('[data-guided-tray]', { timeout: 5000 });
    const tray = await page.evaluate(() => [...document.querySelectorAll('.guided-pick')].map((b) => b.dataset.id));
    await page.locator('[data-guided-next]').click();
    const revealed = await waitScreen(page, 'reveal', 8000);
    check(`M3 resume with unchanged picks keeps the custom points and modes (${JSON.stringify({ atArea, tray, interests: calls.filter(rpcAt('set_member_interests')).length, saved: state.interests })})`, () => {
      assert.equal(atArea, true); assert.equal(revealed, true);
      assert.deepEqual(tray, ['games.board.chess', 'music.instruments.guitar']);
      assert.equal(calls.filter(rpcAt('set_home_city')).length, 1);
      assert.equal(calls.filter(rpcAt('set_member_interests')).length, 0);
      assert.deepEqual(state.interests, saved);
    });
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

  // ================================ D-085: the login look restored to the pre-B4 screen ================================
  // The founder asked for the earlier login UI back with the flow unchanged: "JOIN THE CLUB", the email form, LOG IN,
  // "Forgot password?", an "OR" divider and the round Google button, and "NEW HERE? CREATE ACCOUNT" in the panel's
  // top bar. Behaviour is what is checked: Google still starts, "Create account" still opens the guided Welcome (and
  // its Google button still starts), the form is the same #login-form, and nothing scrolls sideways.
  for (const viewport of [{ width: 320, height: 640 }, { width: 375, height: 812 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    const w = viewport.width;
    const mobile = w < 800;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    const { calls } = await setup(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}/auth.html#login`, { waitUntil: 'load' });
    await page.waitForSelector('.auth-login.is-active #login-form');
    await settleAnimations(page);
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => {
      const view = document.querySelector('.auth-login');
      const visible = (el) => Boolean(el?.getClientRects().length);
      return {
        cardClass: view.classList.contains('auth-card'),
        h1: view.querySelector('#auth-title')?.textContent.trim(),
        email: visible(view.querySelector('#login-form input[name="email"]')),
        password: visible(view.querySelector('#login-form input[name="password"]')),
        submit: view.querySelector('#login-form .auth-submit')?.innerText.trim() || '',
        forgot: visible(view.querySelector('.auth-forgot')),
        google: visible(view.querySelector('.auth-google-trigger')),
        googleName: view.querySelector('.auth-google-trigger')?.getAttribute('aria-label') || '',
        topCreate: visible(document.querySelector('.auth-top-signup')),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    if ([320, 375, 1440, 1920].includes(w)) await shot(page, `login-${w}`, 300);
    check(`${w} login: the pre-B4 screen ("${r.h1}", no editorial card)`, () => { assert.equal(r.h1, 'JOIN THE CLUB'); assert.equal(r.cardClass, false); });
    check(`${w} login: email, password, LOG IN, "Forgot password?" and the Google button are shown (${JSON.stringify(r)})`, () => {
      assert.equal(r.email, true); assert.equal(r.password, true); assert.match(r.submit, /LOG IN/); assert.equal(r.forgot, true);
      assert.equal(r.google, true); assert.equal(r.googleName, 'Continue with Google');
    });
    check(`${w} login: "NEW HERE? CREATE ACCOUNT" is in the top bar`, () => assert.equal(r.topCreate, true));
    check(`${w} login: no sideways scroll (${r.overflow})`, () => assert.ok(r.overflow <= 0));
    if (w === 1440 || w === 375) {
      // Google still starts: signInWithOAuth sends the browser to the stub's /authorize with provider=google.
      await page.locator('.auth-login .auth-google-trigger').click();
      await page.waitForURL(/\/auth\/v1\/authorize/, { timeout: 5000 }).catch(() => {});
      const authorize = calls.find((c) => c.path === '/auth/v1/authorize');
      check(`${w} login: the Google button starts Google sign-in (${authorize ? new URL(authorize.url).searchParams.get('provider') : 'no call'})`, () => {
        assert.ok(authorize); assert.equal(new URL(authorize.url).searchParams.get('provider'), 'google');
      });
      await page.goto(`${BASE}/auth.html#login`, { waitUntil: 'load' });
      await page.waitForSelector('.auth-login.is-active #login-form');
      await page.locator('.auth-top-signup').click({ timeout: 4000 }).catch(() => {});
      const toGuided = await waitScreen(page, 'welcome');
      check(`${w} login: "Create account" opens the guided Welcome`, () => assert.equal(toGuided, true));
      // The guided Welcome's Google button starts Google too.
      await page.locator('[data-guided-google]').click({ timeout: 4000 }).catch(() => {});
      await page.waitForURL(/\/auth\/v1\/authorize/, { timeout: 5000 }).catch(() => {});
      check(`${w} guided Welcome: "Continue with Google" starts Google sign-in`, () => assert.equal(calls.filter((c) => c.path === '/auth/v1/authorize').length, 2));
    }
    check(`${w} login: no page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
    await context.close();
  }

  // ================================ D-086: the guided signup in the classic signup look ================================
  // The founder asked for the earlier signup UI with today's flow (no points): every guided screen sits in the classic
  // column under the "FIND YOUR PEOPLE" head (centred on it, 560 px at most, one width for Welcome, Account and 18+),
  // the head is one line on desktop, "Are you 18 or older?" is one line from 1440 px, and the stepper is the classic
  // "STEP n OF N" over a thin wine track (done and current filled) that stays a progressbar.
  const boxOf = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, sel);
  const linesOf = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); const c = getComputedStyle(el); const lh = parseFloat(c.lineHeight) || parseFloat(c.fontSize) * 1.2; return { h: el.getBoundingClientRect().height, lh, size: parseFloat(c.fontSize) }; }, sel);
  for (const viewport of [{ width: 1100, height: 800 }, { width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1536, height: 709 }, { width: 1920, height: 1080 }, { width: 1920, height: 886 }]) {
    const tag = `${viewport.width}x${viewport.height}`;
    const vw = viewport.width; const vh = viewport.height;
    const context = await browser.newContext({ viewport });
    await setup(context);
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html#login`, { waitUntil: 'load' });
    await page.waitForSelector('.auth-login.is-active #login-form');
    await settleAnimations(page);
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.auth-top-signup').click();
    await waitScreen(page, 'welcome');
    await settleAnimations(page);
    const welcome = await boxOf(page, '#guided-signup');
    const title = await linesOf(page, '#guided-signup h1');
    const helper = await linesOf(page, '#guided-signup .guided-helper');
    const head = await boxOf(page, '.auth-guided .guided-brand-title');
    const brand = await linesOf(page, '.auth-guided .guided-brand-title');
    const under = (b) => Math.round(b.cx - head.cx);
    await shot(page, `align-welcome-${tag}`, 0);
    check(`${tag} Welcome sits in the classic column under the head (dx ${under(welcome)}; ${Math.round(welcome.w)}x${Math.round(welcome.h)})`, () => { assert.ok(Math.abs(under(welcome)) <= 2); assert.ok(welcome.w <= 560 && welcome.w >= 400); assert.ok(welcome.t > head.b); });
    check(`${tag} "FIND YOUR PEOPLE" is one line (${Math.round(brand.h)} px, line ${Math.round(brand.lh)} px); the screen's own h1 is for screen readers only (${Math.round(title.h)} px)`, () => {
      assert.ok(brand.h <= brand.lh * 1.4, JSON.stringify(brand)); assert.ok(title.h <= 1);
    });
    await page.locator('[data-guided-email]').click();
    await waitScreen(page, 'account');
    await settleAnimations(page);
    const account = await boxOf(page, '#guided-signup');
    await page.locator('input[name="guided-email"]').fill('align@test.brivia.club');
    await page.locator('input[name="guided-password"]').fill(PASSWORD);
    await page.locator('input[name="guided-password-confirm"]').fill(PASSWORD);
    await page.locator('[data-guided-next]').click();
    const onAdult = await waitScreen(page, 'adult');
    await settleAnimations(page);
    const adult = onAdult ? await boxOf(page, '#guided-signup') : null;
    const adultTitle = onAdult ? await linesOf(page, '#guided-signup h1') : null;
    await shot(page, `align-adult-${tag}`, 0);
    check(`${tag} Account and 18+ stay in the same column and as wide as Welcome (Account dx ${under(account)}, 18+ ${adult ? `dx ${under(adult)}` : 'not reached'})`, () => {
      assert.ok(adult);
      for (const b of [account, adult]) { assert.ok(Math.abs(under(b)) <= 2); assert.ok(Math.abs(b.w - welcome.w) <= 1); }
    });
    if (vw >= 1440) check(`${tag} "Are you 18 or older?" is one line at ${adultTitle?.size} px (${Math.round(adultTitle?.h)} px, line ${Math.round(adultTitle?.lh)} px)`, () => { assert.ok(adultTitle.size <= 40); assert.ok(adultTitle.h <= adultTitle.lh * 1.4); });
    // The stepper: one thin bar per question, done / current / pending, no icon circles and no step names.
    const bars = await page.evaluate(() => {
      const steps = document.querySelector('[data-guided-steps]');
      const bar = [...steps.querySelectorAll('.guided-bar')];
      const fill = (b) => { const f = b.querySelector('.guided-bar-fill'); return f ? Math.round((f.getBoundingClientRect().width / b.getBoundingClientRect().width) * 100) : -1; };
      return {
        n: bar.length, states: bar.map((b) => b.className.match(/is-(done|current|pending)/)?.[1]), fills: bar.map(fill),
        h: Math.round(bar[0]?.getBoundingClientRect().height || 0), icons: steps.querySelectorAll('svg, .guided-bubble-dot').length,
        names: /ACCOUNT|18\+|NAME|DETAILS|AREA|INTERESTS/i.test(steps.innerText), role: steps.getAttribute('role'),
        now: steps.getAttribute('aria-valuenow'), max: steps.getAttribute('aria-valuemax'), text: steps.getAttribute('aria-valuetext'),
        label: document.querySelector('[data-guided-step-label]').textContent.trim(), labelClipped: getComputedStyle(document.querySelector('[data-guided-step-label]')).clipPath !== 'none' || getComputedStyle(document.querySelector('[data-guided-step-label]')).clip !== 'auto',
      };
    });
    check(`${tag} the stepper is the classic thin track (done ${bars.fills[0]}%, current ${bars.fills[1]}%, pending ${bars.fills[2]}%; ${bars.h} px tall), no icons or step names, a progressbar 2 of 6, "Step 2 of 6" shown above it (${JSON.stringify(bars.states)})`, () => {
      assert.equal(bars.n, 6); assert.deepEqual(bars.states, ['done', 'current', 'pending', 'pending', 'pending', 'pending']);
      assert.equal(bars.fills[0], 100); assert.equal(bars.fills[1], 100); assert.equal(bars.fills[2], 0);
      assert.ok(bars.h >= 2 && bars.h <= 8); assert.equal(bars.icons, 0); assert.equal(bars.names, false);
      assert.equal(bars.role, 'progressbar'); assert.equal(bars.now, '2'); assert.equal(bars.max, '6'); assert.equal(bars.text, 'Step 2 of 6');
      assert.equal(bars.label, 'Step 2 of 6'); assert.equal(bars.labelClipped, false);
    });
    await context.close();
  }

  // D-082b: the Interests picker: a search field, a scrollable row of category tabs ("Popular" first, arrow keys), one
  // category's chips at a time in a fixed-height area, search across every category, a compact "Your picks" tray that
  // never overlaps the chips, and the whole screen (Back and Finish included) inside 1920x886 and 1440x900.
  for (const viewport of [{ width: 1920, height: 886 }, { width: 1440, height: 900 }, { width: 375, height: 812 }]) {
    const tag = `${viewport.width}x${viewport.height}`;
    const mobile = viewport.width < 800;
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    await setup(context, { signedIn: true, profile: { id: ME, name: 'Ida Picker', email: EMAIL, phone_number: '9876543210', phone_country_code: '+91', gender: 'Female', experience: '3–7 years', looking_for: ['Mentor'], photo_url: `${ORIGIN}/storage/v1/object/public/profile-photos/${ME}/p.jpg` }, adultAt: '2026-10-18T00:00:00Z', hasCell: true });
    const page = await context.newPage();
    await page.goto(`${BASE}/auth.html?complete-profile=1`, { waitUntil: 'load' });
    const reached = await waitScreen(page, 'interests', 8000);
    await page.waitForSelector('input[name="guided-interest"]', { timeout: 5000 }).catch(() => {});
    await settleAnimations(page);
    // D-095: one dropdown. Closed until the field is used; then grouped by category with "Popular" first.
    const closed = await page.evaluate(() => { const i = document.querySelector('input[name="guided-interest"]'); return { role: i?.getAttribute('role'), expanded: i?.getAttribute('aria-expanded'), hidden: document.querySelector('#guided-interest-options')?.hidden, controls: i?.getAttribute('aria-controls') }; });
    check(`${tag} interests (${reached}): a closed combobox controlling the list (${JSON.stringify(closed)})`, () => {
      assert.equal(reached, true); assert.deepEqual(closed, { role: 'combobox', expanded: 'false', hidden: true, controls: 'guided-interest-options' });
    });
    await openInterests(page);
    const menu = await page.evaluate(() => {
      const m = document.querySelector('#guided-interest-options');
      const groups = [...m.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label'));
      const opts = [...m.querySelectorAll('[role="option"][data-id]')];
      const box = m.getBoundingClientRect();
      return { role: m.getAttribute('role'), multi: m.getAttribute('aria-multiselectable'), expanded: document.querySelector('input[name="guided-interest"]').getAttribute('aria-expanded'), groups: groups.slice(0, 3), nGroups: groups.length, n: opts.length, overflow: getComputedStyle(m).overflowY, h: Math.round(box.height), optH: Math.round(opts[0]?.getBoundingClientRect().height || 0), onScreen: box.bottom <= innerHeight + 0.5 };
    });
    check(`${tag} the field opens a listbox grouped by category, "Popular" first, scrolling, 44 px rows, on screen (${JSON.stringify(menu)})`, () => {
      assert.equal(menu.role, 'listbox'); assert.equal(menu.multi, 'true'); assert.equal(menu.expanded, 'true');
      assert.equal(menu.groups[0], 'Popular'); assert.ok(menu.nGroups >= 2); assert.ok(menu.n >= 10);
      assert.match(menu.overflow, /auto|scroll/); assert.ok(menu.optH >= 44); assert.ok(menu.onScreen);
    });
    // Arrow keys move the highlight; Enter picks it and the list stays open.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const activeId = await page.evaluate(() => document.querySelector('input[name="guided-interest"]').getAttribute('aria-activedescendant'));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    const keyed = await page.evaluate((id) => ({ id, selected: document.getElementById(id)?.getAttribute('aria-selected'), picks: document.querySelectorAll('.guided-pick').length, open: !document.querySelector('#guided-interest-options').hidden, screen: document.querySelector('#guided-signup').dataset.screen }), activeId);
    check(`${tag} ArrowDown highlights an option (aria-activedescendant), Enter picks it and keeps the list open (${JSON.stringify(keyed)})`, () => {
      assert.match(keyed.id || '', /^guided-interest-1$/); assert.equal(keyed.selected, 'true'); assert.equal(keyed.picks, 1); assert.equal(keyed.open, true); assert.equal(keyed.screen, 'interests');
    });
    // Typing narrows the list to matches from every category, without the headings.
    await page.locator('input[name="guided-interest"]').fill('e');
    await page.waitForTimeout(120);
    const found = await page.evaluate(() => {
      const opts = [...document.querySelectorAll('#guided-interest-options [role="option"][data-id]')];
      return { cats: [...new Set(opts.map((c) => c.dataset.id.split('.')[0]))], labels: opts.map((c) => c.textContent.trim()), headings: document.querySelectorAll('#guided-interest-options .guided-menu-label').length };
    });
    check(`${tag} typing "e" lists matches from more than one category, no headings (${found.labels.length} matches)`, () => {
      assert.ok(found.cats.length >= 2); assert.ok(found.labels.includes('Chess')); assert.ok(found.labels.every((l) => /e/i.test(l))); assert.equal(found.headings, 0);
    });
    await page.locator('input[name="guided-interest"]').fill('');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    const esc = await page.evaluate(() => ({ hidden: document.querySelector('#guided-interest-options').hidden, expanded: document.querySelector('input[name="guided-interest"]').getAttribute('aria-expanded'), screen: document.querySelector('#guided-signup').dataset.screen }));
    check(`${tag} Escape closes the list only (${JSON.stringify(esc)})`, () => assert.deepEqual(esc, { hidden: true, expanded: 'false', screen: 'interests' }));
    await openInterests(page);
    for (let i = 0; i < 7; i += 1) { await page.locator('#guided-interest-options .guided-menu-option[aria-selected="false"][data-id]').first().click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(40); }
    // A press outside closes it.
    await page.mouse.click(5, 5);
    await page.waitForTimeout(400);
    const layout = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const hit = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
      const tray = r(document.querySelector('[data-guided-tray]'));
      const field = r(document.querySelector('.guided-combo'));
      const back = r(document.querySelector('[data-guided-back]'));
      const finish = r(document.querySelector('[data-guided-next]'));
      return { closed: document.querySelector('#guided-interest-options').hidden, overlaps: hit(field, tray) ? 1 : 0, picks: document.querySelectorAll('.guided-pick').length, trayH: Math.round(tray.b - tray.t), back, finish, vh: innerHeight, pickH: Math.round(document.querySelector('.guided-pick')?.getBoundingClientRect().height || 0) };
    });
    await shot(page, `interests-${tag}`, 0);
    check(`${tag} a press outside closes the list (${layout.closed}); the "Your picks" tray (${layout.picks} picks, ${layout.trayH} px tall) sits clear of the field (${layout.overlaps}); picks are 44 px targets (${layout.pickH})`, () => { assert.equal(layout.closed, true); assert.equal(layout.picks, 8); assert.equal(layout.overlaps, 0); assert.ok(layout.pickH >= 44); });
    if (!mobile) {
      check(`${tag} the whole Interests screen fits the window: Back (${Math.round(layout.back.b)}) and Finish (${Math.round(layout.finish.b)}) on screen of ${layout.vh}; tray compact (${layout.trayH} px)`, () => {
        for (const b of [layout.back, layout.finish]) { assert.ok(b.t >= 0 && b.b <= layout.vh); }
        assert.ok(layout.trayH <= 96);
      });
    } else {
      check(`${tag} on a phone Finish stays in view (${Math.round(layout.finish.t)}-${Math.round(layout.finish.b)} of ${layout.vh})`, () => assert.ok(layout.finish.t >= 0 && layout.finish.b <= layout.vh));
    }
    await auditScreen(page, `${tag} interests picker`);
    await context.close();
  }
  // M6: one punctuation rule for every guided heading: a question ends with "?", anything else with a full stop.
  check(`M6 every guided heading ends with "." or "?" (${[...seenTitles].join(' | ')})`, () => {
    assert.ok(seenTitles.size >= 9); for (const t of seenTitles) assert.match(t, /[.?]$/, t);
  });
} finally {
  await browser.close();
  stopVite();
}

for (const [status, name] of results) console.log(`${status}  ${name}`);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
