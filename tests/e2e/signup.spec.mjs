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
//   sends a new one once (never inside the 60 s wait, never again on later tries); Resend waits 60 s (fake clock) and a
//   429 shows the Code-screen rate-limit copy; a 429 on the first send stays on Email with the Email-screen copy; the
//   same address inside the wait goes to Code without a new send;
// * after verify: "Step 3 of 6" on 18+; Back (and browser Back) goes to Welcome with "Signed in as …", never to Code;
// * the switch: 'google' hides the email option; '' shows "Signups open soon" and Log in;
// * phone: the primary button stays above a simulated 300 px keyboard (visualViewport); at 320 px the step label and the
//   page's × do not overlap; reduced motion: no transform; the Google buttons show the four-colour G (SVG);
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
const VERIFY_429 = '429429';
const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const accessToken = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: ME, role: 'authenticated', exp, aud: 'authenticated' })}.sig`;
const user = { id: ME, aud: 'authenticated', role: 'authenticated', email: EMAIL, user_metadata: {}, app_metadata: { provider: 'email' }, created_at: new Date().toISOString() };
const session = { access_token: accessToken, refresh_token: 'stub-refresh', token_type: 'bearer', expires_in: 86400, expires_at: exp, user };

const WRONG_COPY = "That code didn't work. Check it, or send a new one.";
const EXPIRED_COPY = "That code has expired. We've sent you a new one.";
const CODE_RATE_COPY = 'Too many codes requested. Wait a minute, then tap Resend.';
const EMAIL_RATE_COPY = "We can't send a code right now. Please try again in a few minutes.";
const EXPIRED_RESEND_COPY = 'That code has expired. Tap Resend for a new one.';
const EXPIRED_WAIT_COPY = 'That code has expired. Resend will be available in a moment.';
const VERIFY_RATE_COPY = 'Too many attempts. Wait a minute, then try the code again.';

const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };
// A step that waits (a click, a screen change): its own named check, so a failure names the step and later checks run.
const checkStep = async (name, fn) => { try { await fn(); results.push(['PASS', name]); return true; } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); return false; } };

// The taxonomy and places the stub serves (Task 4). 14 public interests (so a 13th pick can be refused) and one private.
const nodes = [
  ['sports', 'Sports and fitness'], ['sports.racket', 'Racket sports'], ['sports.racket.tennis', 'Tennis'], ['sports.racket.badminton', 'Badminton'],
  ['sports.racket.squash', 'Squash'], ['sports.racket.padel', 'Padel'], ['sports.team', 'Team sports'], ['sports.team.cricket', 'Cricket'],
  ['sports.team.football', 'Football'], ['sports.team.basketball', 'Basketball'],
  ['games', 'Games and puzzles'], ['games.board', 'Board games'], ['games.board.chess', 'Chess'], ['games.board.chess.blitz', 'Blitz chess'],
  ['games.board.go', 'Go'], ['games.video', 'Video games'], ['games.video.indie', 'Indie games'],
  ['music', 'Music'], ['music.listening', 'Listening'], ['music.listening.jazz', 'Jazz'], ['music.listening.indie_rock', 'Indie rock'],
  ['music.listening.classical', 'Classical music'],
  ['wellbeing', 'Wellbeing'], ['wellbeing.spirituality', 'Spirituality'], ['wellbeing.spirituality.scripture_study', 'Scripture study'],
].map(([id, label]) => ({ id, parent_id: id.includes('.') ? id.replace(/\.[^.]+$/, '') : null, level: id.split('.').length, label, sensitive: id === 'wellbeing.spirituality.scripture_study' }));
const PUBLIC_IDS = nodes.filter((n) => n.level >= 3 && !n.sensitive).map((n) => n.id);
const PRIVATE_ID = 'wellbeing.spirituality.scripture_study';
const places = [
  { id: 'in-bengaluru', name: 'Bengaluru', region: 'Karnataka', country: 'India' },
  { id: 'in-pune', name: 'Pune', region: 'Maharashtra', country: 'India' },
];

// Stubbed Supabase for one context, with the member's own state. opts.otpStatus: statuses to answer the next /otp POSTs
// with (429), in order. Task 4: opts.profile (own row; default none: a new account has no row until 18+), opts.hasCell,
// opts.fail ({ declare_adult | profiles | set_home_city | set_home_location | set_member_interests: [500, …] }),
// opts.deckRows (deck_candidates answer).
const stubContext = async (context, opts = {}) => {
  const otpStatus = [...(opts.otpStatus || [])];
  const fail = Object.fromEntries(Object.entries(opts.fail || {}).map(([k, v]) => [k, [...v]]));
  const state = {
    profile: opts.profile ? { id: ME, email: EMAIL, ...opts.profile } : null,
    hasCell: Boolean(opts.hasCell),
    placeLabel: opts.hasCell ? 'Pune' : null,
    interests: opts.interests ? [...opts.interests] : [],
    consent: false,
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
    const json = (status, payload) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload), headers });
    const noContent = () => route.fulfill({ status: 204, body: '', headers });
    const boom = (key) => (fail[key]?.length ? fail[key].shift() : 0);
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (p === '/auth/v1/otp') {
      if (otpStatus.shift() === 429) return json(429, { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' });
      return json(200, {});
    }
    if (p === '/auth/v1/verify') {
      const token = JSON.parse(body || '{}').token;
      if (token === GOOD) return json(200, opts.verifySession || session);
      if (token === VERIFY_429) return json(429, { code: 'over_request_rate_limit', error_code: 'over_request_rate_limit', msg: 'Request rate limit reached', message: 'Request rate limit reached' });
      // Every code starting 99 has expired (the client never re-sends the code that just failed, so tests vary it).
      if (/^99/.test(token)) return json(403, { code: 'otp_expired', error_code: 'otp_expired', msg: 'Token has expired', message: 'Token has expired' });
      return json(403, { code: 'otp_expired', error_code: 'otp_expired', msg: 'Token has expired or is invalid', message: 'Token has expired or is invalid' });
    }
    if (p === '/auth/v1/authorize') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>google</title><p id="stub-google">google</p>' });
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers });
    if (p === '/auth/v1/user') return json(200, opts.user || user);
    if (p.startsWith('/auth/v1/')) return json(200, session);
    const wantsObject = (request.headers().accept || '').includes('vnd.pgrst.object');
    const rows = (row) => json(200, wantsObject ? row : (row ? [row] : []));
    if (p === '/rest/v1/profiles') {
      if (method === 'POST') {
        if (boom('profiles')) return json(500, { code: 'XX000', message: 'boom' });
        state.profile = { ...JSON.parse(body || '{}'), adult_declared_at: null };
        return json(201, wantsObject ? state.profile : [state.profile]);
      }
      if (method === 'PATCH') {
        if (boom('profiles')) return json(500, { code: 'XX000', message: 'boom' });
        if (!state.profile) return rows(null);
        Object.assign(state.profile, JSON.parse(body || '{}'));
        return rows(state.profile);
      }
      return rows(state.profile ? { name: 'New Member', adult_declared_at: null, ...state.profile } : null);
    }
    const rpc = (name) => p === `/rest/v1/rpc/${name}`;
    if (rpc('declare_adult')) {
      if (boom('declare_adult')) return json(500, { code: 'XX000', message: 'boom' });
      if (!state.profile) return json(404, { code: 'P0002', message: 'profile required' });
      if (JSON.parse(body || '{}').p_notice_version !== '2026-10-20') return json(400, { code: '22023', message: 'stale notice version' });
      state.profile.adult_declared_at ||= new Date().toISOString();
      return noContent();
    }
    if (['set_home_location', 'set_home_city', 'set_member_interests'].some(rpc) && !state.profile?.adult_declared_at) return json(400, { code: 'P0001', message: 'adult declaration required' });
    if (rpc('set_home_location')) {
      if (boom('set_home_location')) return json(500, { code: 'XX000', message: 'boom' });
      state.hasCell = true; state.placeLabel = 'Bengaluru';
      return json(200, 'Bengaluru');
    }
    if (rpc('set_home_city')) {
      if (boom('set_home_city')) return json(500, { code: 'XX000', message: 'boom' });
      const place = places.find((pl) => pl.id === JSON.parse(body || '{}').p_place_id);
      if (!place) return json(400, { code: '22023', message: 'invalid place' });
      state.hasCell = true; state.placeLabel = place.name;
      return json(200, place.name);
    }
    if (rpc('set_member_interests')) {
      if (boom('set_member_interests')) return json(500, { code: 'XX000', message: 'boom' });
      const items = JSON.parse(body || '{}').p_items || [];
      if (items.reduce((sum, i) => sum + i.points, 0) !== 20) return json(400, { code: '22023', message: 'invalid interests' });
      if (!state.consent && items.some((i) => i.interest_id === PRIVATE_ID)) return json(400, { code: '22023', message: 'sensitive consent required' });
      state.interests = items;
      return noContent();
    }
    if (rpc('set_sensitive_consent')) { state.consent = JSON.parse(body || '{}').p_consent === true; return noContent(); }
    if (rpc('my_onboarding_status')) {
      const points = state.interests.reduce((sum, i) => sum + i.points, 0);
      const named = state.profile && !['', 'New Member'].includes(String(state.profile.name || '').trim());
      return json(200, [{ interests: state.interests.length, points, has_cell: state.hasCell, place_label: state.placeLabel, completed: Boolean(named && state.profile.adult_declared_at && state.hasCell && points === 20) }]);
    }
    if (rpc('deck_candidates')) return json(200, opts.deckRows || []);
    if (p === '/rest/v1/interest_node') return json(200, nodes);
    if (p === '/rest/v1/place') {
      const q = ((url.searchParams.get('or') || '').match(/name\.ilike\.\*([^*]*)\*/) || [])[1] || '';
      return json(200, places.filter((pl) => !q || pl.name.toLowerCase().includes(q.toLowerCase())));
    }
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
  if (opts.signedIn) {
    await context.addInitScript(([key, value]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); } }, ['sb-stub-auth-token', JSON.stringify(opts.signedIn)]);
  }
  const posts = (p) => calls.filter((c) => c.method === 'POST' && c.path === p);
  const patches = (p) => calls.filter((c) => c.method === 'PATCH' && c.path === p);
  return { calls, posts, patches, state };
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
// The pointer is parked in a corner first, so a button the test just clicked is not shown in its hover state.
const shot = async (page, name, { now = false } = {}) => {
  if (!SHOTS) return;
  if (!now) { await page.mouse.move(1, 1); await page.waitForTimeout(200); }
  await page.screenshot({ path: path.join(SHOTS, name) });
};

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

// Task 4 helpers. A member signed in with 18+, name and area done resumes at Interests.
// Task 5: auth.html#signup with a session opens the first incomplete screen at once (no Welcome first).
const openResumed = async (page, expected, url = '/auth.html#signup') => {
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#guided-signup:not([hidden])', { timeout: 15000 });
  await waitTitle(page, expected);
};
const toInterests = (page) => openResumed(page, 'What are you into?');
// Shows the chip's domain, then taps it (unless click is false).
// force: a full tray marks the other chips aria-disabled (they still answer a tap with the cap message).
const pickChip = async (page, id, { click = true, settle = 0, force = false } = {}) => {
  const domain = page.locator(`#guided-signup [data-domain="${id.split('.')[0]}"]`);
  if ((await domain.getAttribute('aria-pressed')) !== 'true') await domain.click();
  if (click) await page.locator(`#guided-signup [data-interest-id="${id}"]`).click({ force });
  if (settle) await page.waitForTimeout(settle);
};
const trayState = (page) => page.evaluate(() => ({
  count: document.querySelector('#guided-signup [data-tray-count]')?.textContent.trim(),
  picks: [...document.querySelectorAll('#guided-signup [data-pick-id]')].map((el) => el.textContent.trim()),
  pressed: [...document.querySelectorAll('#guided-signup [data-interest-id][aria-pressed="true"]')].map((el) => el.dataset.interestId),
  live: document.querySelector('#guided-signup .gs-tray [aria-live="polite"]')?.textContent.trim(),
  clones: document.querySelectorAll('#guided-signup .it-fly').length,
  next: document.querySelector('#guided-signup .gs-primary')?.disabled,
}));

// The tray as laid out: every shown pick's box against the tray's and the screen's, the "+n more" button, and how many
// picks sit behind it.
const trayLayout = (page) => page.evaluate(() => {
  const tray = document.querySelector('#guided-signup .gs-tray').getBoundingClientRect();
  const all = [...document.querySelectorAll('#guided-signup [data-pick-id]')];
  const shown = all.filter((b) => !b.closest('li').hidden && b.getClientRects().length);
  const clipped = shown.map((b) => ({ label: b.textContent.trim(), r: b.getBoundingClientRect() }))
    .filter(({ r }) => r.left < tray.left - 0.5 || r.right > tray.right + 0.5 || r.left < -0.5 || r.right > window.innerWidth + 0.5 || r.top < tray.top - 0.5 || r.bottom > tray.bottom + 0.5)
    .map(({ label, r }) => `${label}@${Math.round(r.left)}-${Math.round(r.right)}`);
  const more = document.querySelector('#guided-signup [data-tray-more]');
  const moreShown = Boolean(more && !more.hidden && more.getClientRects().length);
  const primary = document.querySelector('#guided-signup .gs-primary').getBoundingClientRect();
  return {
    total: all.length, shown: shown.length, newest: shown.map((b) => b.textContent.trim()), clipped,
    more: moreShown ? { text: more.textContent.trim(), expanded: more.getAttribute('aria-expanded'), h: Math.round(more.getBoundingClientRect().height), tag: more.tagName } : null,
    primaryOnScreen: primary.top >= 0 && primary.bottom <= window.innerHeight + 0.5,
  };
});
// Phone tray disclosure checks (UX_SPEC rule 3): whole picks only, "+n more" with the right n, expand / collapse.
const checkTrayDisclosure = async (page, w, expectedLabels) => {
  const collapsed = await trayLayout(page);
  check(`${w}: no tray pick is clipped; the newest picks show and "+n more" counts the rest (${JSON.stringify(collapsed)})`, () => {
    assert.deepEqual(collapsed.clipped, []);
    assert.equal(collapsed.total, expectedLabels.length);
    assert.deepEqual(collapsed.newest, expectedLabels.slice(expectedLabels.length - collapsed.shown));
    if (collapsed.shown < collapsed.total) {
      assert.ok(collapsed.more, '"+n more" shown');
      assert.equal(collapsed.more.text, `+${collapsed.total - collapsed.shown} more`);
      assert.equal(collapsed.more.expanded, 'false');
      assert.equal(collapsed.more.tag, 'BUTTON');
      assert.ok(collapsed.more.h >= 44);
    } else assert.equal(collapsed.more, null);
  });
  if (!collapsed.more) return collapsed;
  await page.locator('#guided-signup [data-tray-more]').click();
  await page.waitForTimeout(200);
  const open = await trayLayout(page);
  check(`${w}: "+n more" expands the tray to every pick, says "Show less" (aria-expanded=true), and Continue stays on screen (${JSON.stringify(open)})`, () => {
    assert.equal(open.shown, open.total); assert.equal(open.more?.text, 'Show less'); assert.equal(open.more?.expanded, 'true'); assert.ok(open.primaryOnScreen);
  });
  await a11yScreen(page, `${w} interests tray expanded`);
  await shot(page, `signup-${w}-interests-tray-expanded.png`);
  await page.locator('#guided-signup [data-tray-more]').click();
  await page.waitForTimeout(200);
  const back = await trayLayout(page);
  check(`${w}: "Show less" collapses the tray again (${JSON.stringify(back)})`, () => { assert.equal(back.more?.expanded, 'false'); assert.equal(back.shown, collapsed.shown); assert.deepEqual(back.clipped, []); });
  return collapsed;
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
    for (const w of [1440, 375, 320]) {
      const context = await browser.newContext({ viewport: { width: w, height: w <= 375 ? 812 : 900 } });
      const stub = await stubContext(context);
      const { page, errors } = await newPage(context);
      await openGuided(page);
      const google = await isVisible(page, '#guided-signup button:has-text("Continue with Google")');
      const email = await isVisible(page, '#guided-signup button:has-text("Continue with email")');
      const step0 = await stepText(page);
      check(`${w}: Welcome shows Continue with Google and Continue with email, and no step label (step "${step0}")`, () => { assert.ok(google); assert.ok(email); assert.equal(step0, ''); });
      const body0 = await page.locator('#guided-signup').textContent();
      check(`${w}: Welcome copy and "Already a member? Log in"`, () => { assert.match(body0, /Join in a minute\. One question at a time\./); assert.match(body0, /Already a member\?\s*Log in/); });
      const mark = await page.locator('#guided-signup .gs-google-mark').evaluate((el) => ({ hidden: el.getAttribute('aria-hidden'), fills: [...el.querySelectorAll('svg [fill]')].map((n) => n.getAttribute('fill').toUpperCase()), text: el.textContent.trim(), w: el.getBoundingClientRect().width }));
      const googleLabel = (await buttonByText(page, 'Continue with Google').first().textContent()).trim();
      check(`${w}: Continue with Google shows the four-colour G on a white disc, aria-hidden, with the text label (${JSON.stringify(mark)})`, () => {
        assert.equal(mark.hidden, 'true');
        for (const c of ['#FFFFFF', '#4285F4', '#34A853', '#FBBC05', '#EA4335']) assert.ok(mark.fills.includes(c), c);
        assert.equal(mark.text, '');
        assert.ok(mark.w >= 20);
        assert.equal(googleLabel, 'Continue with Google');
      });
      const backHidden = !(await isVisible(page, '#guided-signup [data-signup-back]'));
      check(`${w}: no Back on Welcome`, () => assert.ok(backHidden));
      await a11yScreen(page, `${w} welcome`);
      await shot(page, `signup-${w}-welcome.png`);

      await buttonByText(page, 'Continue with email').click();
      await waitTitle(page, "What's your email?");
      const step1 = await stepText(page);
      const focused1 = await page.evaluate(() => document.activeElement?.id);
      check(`${w}: Email shows "Step 1 of 6" and focus moves to the heading (${step1}, ${focused1})`, () => { assert.equal(step1, 'Step 1 of 6'); assert.equal(focused1, 'signup-screen-title'); });
      const clash = await page.evaluate(() => {
        const box = (sel) => { const el = document.querySelector(sel); if (!el || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
        const step = box('#guided-signup [data-signup-step]');
        const close = box('#auth-modal .auth-close');
        const overlap = Boolean(step && close && step.l < close.r && close.l < step.r && step.t < close.b && close.t < step.b);
        return { step, close, overlap };
      });
      check(`${w}: the step label and the page's × close button do not overlap (${JSON.stringify(clash)})`, () => { assert.ok(clash.step, 'step label shown'); assert.ok(clash.close, 'the × close button exists and is visible'); assert.equal(clash.overlap, false); });
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
      await page.waitForTimeout(SETTLE);  // let Verify finish fading back from busy before the contrast check
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
      await checkStep(`${w}: Continue resumes at 18+`, async () => {
        await buttonByText(page, 'Continue').first().click();
        await waitTitle(page, 'Are you 18 or older?');
      });
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
      await page.waitForFunction((t) => document.querySelector('#guided-signup')?.textContent.includes(t), CODE_RATE_COPY, { timeout: 5000 }).catch(() => {});
      const rate = await page.locator('#guided-signup').textContent();
      check(`a 429 on Resend shows "${CODE_RATE_COPY}"`, () => { assert.ok(rate.includes(CODE_RATE_COPY)); assert.ok(!rate.includes('not created')); assert.equal(stub.posts('/auth/v1/otp').length, 2); });
      await shot(page, 'signup-1440-code-rate-limited.png');
      await checkStep('Wrong email? goes back to Email', async () => {
        await page.locator('#guided-signup button:has-text("Wrong email?")').click();
        await waitTitle(page, "What's your email?");
      });
      const kept = await page.locator('#signup-email').inputValue();
      check(`Wrong email? keeps the address (${kept})`, () => assert.equal(kept, EMAIL));
      // The same address inside the resend wait: straight to Code, no new send (no way around the countdown).
      await checkStep('Send code for the same address inside the resend wait goes to Code', async () => {
        await page.locator('#signup-email').press('Enter');
        await waitTitle(page, 'Enter the code');
      });
      check(`the same address inside the wait sends nothing (${stub.posts('/auth/v1/otp').length} otp POSTs)`, () => assert.equal(stub.posts('/auth/v1/otp').length, 2));
      const still = await page.locator('[data-signup-resend]').evaluate((el) => ({ disabled: el.disabled, text: el.textContent.trim() }));
      check(`Resend is still counting down after the round trip (${JSON.stringify(still)})`, () => { assert.equal(still.disabled, true); assert.match(still.text, /^Resend in [01]:\d\d$/); });
      check(`resend: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 3. An expired code: inside the 60 s wait nothing is sent; after it a new code goes out once, and later tries never
    //    send again. Fake clock.
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await context.clock.install();
      const stub = await stubContext(context);
      const { page, errors } = await newPage(context);
      await openGuided(page);
      await toCode(page);
      const typeCode = async (code, copy) => {
        await page.locator('#guided-signup .gs-otp input').first().focus();
        await page.keyboard.type(code);
        await page.waitForFunction((t) => document.querySelector('#guided-signup [role="alert"]')?.textContent === t, copy, { timeout: 5000 }).catch(() => {});
        return page.evaluate(() => ({ alert: document.querySelector('#guided-signup [role="alert"]')?.textContent, inBoxes: Boolean(document.activeElement?.closest('.gs-otp')) }));
      };
      const early = await typeCode(EXPIRED, EXPIRED_WAIT_COPY);
      const resendLocked = await page.locator('[data-signup-resend]').isDisabled();
      check(`an expired code inside the resend wait sends nothing and, with Resend still disabled, says "${EXPIRED_WAIT_COPY}" (${JSON.stringify(early)}, otp POSTs ${stub.posts('/auth/v1/otp').length})`, () => { assert.equal(early.alert, EXPIRED_WAIT_COPY); assert.ok(resendLocked); assert.ok(!early.alert.includes('Tap Resend')); assert.equal(stub.posts('/auth/v1/otp').length, 1); assert.ok(early.inBoxes); });
      await context.clock.fastForward(61000);
      const sent = await typeCode('998888', EXPIRED_COPY);  // a different code: the one that just failed is never re-sent
      check(`an expired code after the wait shows "${EXPIRED_COPY}" and sends a new one (${JSON.stringify(sent)}, otp POSTs ${stub.posts('/auth/v1/otp').length})`, () => { assert.equal(sent.alert, EXPIRED_COPY); assert.equal(stub.posts('/auth/v1/otp').length, 2); assert.ok(sent.inBoxes); });
      await shot(page, 'signup-375-code-expired.png');
      await context.clock.fastForward(61000);
      const again = await typeCode('997777', EXPIRED_RESEND_COPY);
      check(`a later expired try does not send again (${JSON.stringify(again)}, otp POSTs ${stub.posts('/auth/v1/otp').length})`, () => { assert.equal(again.alert, EXPIRED_RESEND_COPY); assert.equal(stub.posts('/auth/v1/otp').length, 2); });
      check(`expired: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 3b. The automatic resend for an expired code hits a 429: the expired copy together with the send error.
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await context.clock.install();
      const stub = await stubContext(context, { otpStatus: [200, 429] });
      const { page, errors } = await newPage(context);
      await openGuided(page);
      await toCode(page);
      await context.clock.fastForward(61000);
      const both = `That code has expired. ${CODE_RATE_COPY}`;
      await page.locator('#guided-signup .gs-otp input').first().focus();
      await page.keyboard.type(EXPIRED);
      await page.waitForFunction((t) => document.querySelector('#guided-signup [role="alert"]')?.textContent === t, both, { timeout: 5000 }).catch(() => {});
      const alert = await page.locator('#guided-signup [role="alert"]').textContent();
      check(`a failed automatic resend shows "${both}" (${alert}, otp POSTs ${stub.posts('/auth/v1/otp').length})`, () => { assert.equal(alert, both); assert.equal(stub.posts('/auth/v1/otp').length, 2); });
      await shot(page, 'signup-375-code-expired-rate-limited.png');
      await page.locator('#guided-signup .gs-otp input').first().focus();
      await page.keyboard.type('111111');
      await page.waitForFunction((t) => document.querySelector('#guided-signup [role="alert"]')?.textContent === t, WRONG_COPY, { timeout: 5000 }).catch(() => {});
      check(`a wrong code after that sends no new code (otp POSTs ${stub.posts('/auth/v1/otp').length})`, () => assert.equal(stub.posts('/auth/v1/otp').length, 2));
      check(`expired 429: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 3c. A 429 on the Email screen's first "Send code": the Email-screen copy, and the member stays on Email.
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const stub = await stubContext(context, { otpStatus: [429] });
      const { page, errors } = await newPage(context);
      await openGuided(page);
      await checkStep('email 429: Continue with email opens Email', async () => {
        await buttonByText(page, 'Continue with email').click();
        await waitTitle(page, "What's your email?");
      });
      await page.locator('#signup-email').fill(EMAIL);
      await page.locator('#signup-email').press('Enter');
      await page.waitForFunction((t) => document.querySelector('#guided-signup [role="alert"]')?.textContent === t, EMAIL_RATE_COPY, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(SETTLE);
      const shown = await page.evaluate(() => ({ alert: document.querySelector('#guided-signup [role="alert"]')?.textContent, title: document.querySelector('#signup-screen-title')?.textContent }));
      check(`a 429 on the first Send code shows "${EMAIL_RATE_COPY}" and stays on Email (${JSON.stringify(shown)})`, () => { assert.equal(shown.alert, EMAIL_RATE_COPY); assert.equal(shown.title, "What's your email?"); assert.equal(stub.posts('/auth/v1/otp').length, 1); });
      await a11yScreen(page, '375 email rate limited');
      await shot(page, 'signup-375-email-rate-limited.png');
      check(`email 429: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
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
      const loginMark = await page.locator('.auth-login .auth-google-mark').evaluate((el) => ({ hidden: el.getAttribute('aria-hidden'), fills: [...el.querySelectorAll('svg [fill]')].map((n) => n.getAttribute('fill').toUpperCase()), text: el.textContent.trim(), label: el.closest('button')?.getAttribute('aria-label') }));
      check(`the login view's Google button shows the same four-colour G (${JSON.stringify(loginMark)})`, () => {
        assert.equal(loginMark.hidden, 'true');
        for (const c of ['#FFFFFF', '#4285F4', '#34A853', '#FBBC05', '#EA4335']) assert.ok(loginMark.fills.includes(c), c);
        assert.equal(loginMark.text, '');
        assert.equal(loginMark.label, 'Continue with Google');
      });
      await shot(page, 'signup-1440-login-google.png');
      await checkStep('"Create an account" opens the guided flow', async () => {
        await page.evaluate(() => document.querySelector('.auth-create-trigger').click());  // hidden in this layout; still wired
        await waitTitle(page, 'Find your people.');
      });
      const hash = await page.evaluate(() => window.location.hash);
      check(`the guided flow is at #signup (${hash})`, () => assert.equal(hash, '#signup'));
      await checkStep('"Already a member? Log in" shows the login view', async () => {
        await page.locator('#guided-signup button:has-text("Log in")').click();
        await page.waitForSelector('[data-auth-view="login"]:not([hidden])', { timeout: 8000 });
      });
      await page.waitForTimeout(400);
      await checkStep('"New here? Create account" opens the guided flow', async () => {
        await page.locator('.auth-top-signup').click();
        await waitTitle(page, 'Find your people.');
      });
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

    // ---- Task 4: the profile screens (18+, Name, Area, Interests, Reveal) -------------------------------------------
    // 5. The whole email path after verify, at 1440 and 375: 18+ Yes (declare_adult with the notice version), Name saves,
    //    a city saves once, the interest picks fly into the tray, Next saves the even split, Reveal names a shared pick.
    for (const w of [1440, 375]) {
      const context = await browser.newContext({ viewport: { width: w, height: w === 375 ? 812 : 900 } });
      const deckRows = [{ id: '22222222-2222-4222-8222-222222222222', name: 'Mira', shared_interests: [] }, { id: '33333333-3333-4333-8333-333333333333', name: 'Kai', shared_interests: ['Jazz', 'Chess'] }];
      const stub = await stubContext(context, { signedIn: session, deckRows });
      const { page, errors } = await newPage(context);
      const flowText = [];
      const grab = async () => flowText.push(await page.locator('#guided-signup').textContent());
      await checkStep(`${w}: a signed-in member opening #signup resumes at 18+`, () => openResumed(page, 'Are you 18 or older?'));
      const adultUi = { yes: await isVisible(page, '#guided-signup .gs-primary:has-text("Yes, I\'m 18 or older")'), no: await isVisible(page, '#guided-signup button:text-is("No")'), step: await stepText(page) };
      check(`${w}: 18+ offers "Yes, I'm 18 or older" (primary) and "No" (${JSON.stringify(adultUi)})`, () => { assert.ok(adultUi.yes); assert.ok(adultUi.no); assert.equal(adultUi.step, 'Step 3 of 6'); });
      await a11yScreen(page, `${w} adult`);
      await shot(page, `signup-${w}-adult.png`);
      await grab();
      await checkStep(`${w}: 18+ Yes shows Name`, async () => {
        await buttonByText(page, "Yes, I'm 18 or older").click();
        await waitTitle(page, 'What should members call you?');
      });
      const declared = stub.posts('/rest/v1/rpc/declare_adult').map((c) => JSON.parse(c.body || '{}'));
      const created = stub.posts('/rest/v1/profiles').map((c) => JSON.parse(c.body || '{}'));
      check(`${w}: 18+ Yes creates the own profile row, then calls declare_adult with NOTICE_VERSION 2026-10-20 (${JSON.stringify(declared)})`, () => {
        assert.deepEqual(declared, [{ p_notice_version: '2026-10-20' }]);
        assert.equal(created.length, 1);
        assert.equal(created[0].id, ME);
        for (const key of ['phone', 'gender', 'phone_number']) assert.ok(!(key in created[0]), key);
      });
      const nameUi = await page.evaluate(() => ({ help: document.querySelector('#guided-signup').textContent.includes('Members see this name.'), value: document.querySelector('#signup-name')?.value, ac: document.querySelector('#signup-name')?.autocomplete }));
      check(`${w}: Name shows the helper and an empty field on the email path (${JSON.stringify(nameUi)})`, () => { assert.ok(nameUi.help); assert.equal(nameUi.value, ''); assert.equal(nameUi.ac, 'name'); });
      await a11yScreen(page, `${w} name`);
      await shot(page, `signup-${w}-name.png`);
      await grab();
      await page.locator('#signup-name').press('Enter');
      await page.waitForTimeout(300);
      check(`${w}: an empty name saves nothing`, () => assert.equal(stub.patches('/rest/v1/profiles').length, 0));
      await page.locator('#signup-name').fill('Ada Lovelace');
      await checkStep(`${w}: Name saves on Enter and shows Area`, async () => {
        await page.locator('#signup-name').press('Enter');
        await waitTitle(page, 'Where are you based?');
      });
      const named = stub.patches('/rest/v1/profiles').map((c) => JSON.parse(c.body || '{}'));
      check(`${w}: the name is saved to the own row (${JSON.stringify(named)})`, () => { assert.equal(named.length, 1); assert.equal(named[0].name, 'Ada Lovelace'); });
      const areaHelp = await page.locator('#guided-signup').textContent();
      check(`${w}: Area helper copy`, () => assert.ok(areaHelp.includes('We show people near you first. Members only ever see a rounded distance.')));
      await a11yScreen(page, `${w} area`);
      await shot(page, `signup-${w}-area.png`);
      await grab();
      await page.locator('#guided-signup [data-area-city]').click();
      await page.locator('#signup-area-city-search').fill('Pun');
      await page.waitForSelector('#guided-signup .area-city-option', { timeout: 5000 });
      await page.locator('#guided-signup .area-city-option', { hasText: 'Pune' }).click();
      await shot(page, `signup-${w}-area-city.png`);
      await a11yScreen(page, `${w} area city picked`);
      await checkStep(`${w}: Area Continue shows Interests`, async () => {
        await page.locator('#guided-signup .gs-primary').click();
        await waitTitle(page, 'What are you into?');
      });
      const city = stub.posts('/rest/v1/rpc/set_home_city').map((c) => JSON.parse(c.body || '{}'));
      check(`${w}: picking a city calls set_home_city once (${JSON.stringify(city)})`, () => assert.deepEqual(city, [{ p_place_id: 'in-pune' }]));
      const intro = await page.evaluate(() => ({
        help: document.querySelector('#guided-signup').textContent.includes('Pick what you genuinely care about. 3–6 works best.'),
        label: document.querySelector('#guided-signup .gs-tray')?.textContent.includes('Your picks'),
        count: document.querySelector('#guided-signup [data-tray-count]')?.textContent.trim(),
        live: document.querySelector('#guided-signup .gs-tray [aria-live="polite"]') !== null,
        next: document.querySelector('#guided-signup .gs-primary')?.disabled,
      }));
      check(`${w}: Interests shows the helper, a "Your picks" tray (live region) at "0 picked", and Next disabled (${JSON.stringify(intro)})`, () => { assert.ok(intro.help); assert.ok(intro.label); assert.equal(intro.count, '0 picked'); assert.ok(intro.live); assert.equal(intro.next, true); });
      await a11yScreen(page, `${w} interests`);
      await shot(page, `signup-${w}-interests.png`);
      // A tap: the clone flies (a transform at 100 ms), then the chip is pressed and the tray says "1 picked".
      await pickChip(page, 'sports.racket.tennis', { click: false });
      await page.locator('#guided-signup [data-interest-id="sports.racket.tennis"]').click();
      await page.waitForTimeout(100);
      const mid = await page.evaluate(() => [...document.querySelectorAll('#guided-signup .it-fly')].map((el) => getComputedStyle(el).transform));
      await shot(page, `signup-${w}-interests-mid-pick.png`, { now: true });
      check(`${w}: a cloned chip animates during the pick (transform at 100 ms: ${mid.join(', ')})`, () => { assert.equal(mid.length, 1); assert.notEqual(mid[0], 'none'); assert.notEqual(mid[0], 'matrix(1, 0, 0, 1, 0, 0)'); });
      await page.waitForTimeout(SETTLE);
      const one = await trayState(page);
      check(`${w}: the chip is in the tray ("1 picked"), aria-pressed=true, and the tray announced it (${JSON.stringify(one)})`, () => {
        assert.equal(one.count, '1 picked'); assert.deepEqual(one.picks, ['Tennis']); assert.deepEqual(one.pressed, ['sports.racket.tennis']); assert.equal(one.live, 'Tennis added'); assert.equal(one.clones, 0); assert.equal(one.next, false);
      });
      await page.locator('#guided-signup [data-pick-id="sports.racket.tennis"]').click();
      await page.waitForTimeout(SETTLE);
      const none = await trayState(page);
      check(`${w}: tapping it in the tray removes it (${JSON.stringify(none)})`, () => { assert.equal(none.count, '0 picked'); assert.deepEqual(none.picks, []); assert.deepEqual(none.pressed, []); assert.equal(none.live, 'Tennis removed'); assert.equal(none.next, true); });
      for (const id of ['sports.racket.tennis', 'games.board.chess', 'music.listening.jazz', 'games.board.go']) { await pickChip(page, id); await page.waitForTimeout(SETTLE); }
      const four = await trayState(page);
      check(`${w}: four picks in pick order (${JSON.stringify(four)})`, () => { assert.equal(four.count, '4 picked'); assert.deepEqual(four.picks, ['Tennis', 'Chess', 'Jazz', 'Go']); });
      if (w === 375) await checkTrayDisclosure(page, w, ['Tennis', 'Chess', 'Jazz', 'Go']);
      await a11yScreen(page, `${w} interests 4 picks`);
      await shot(page, `signup-${w}-interests-4-picks.png`);
      if (w === 375) {
        const strip = await page.evaluate(() => {
          const tray = document.querySelector('#guided-signup .gs-tray').getBoundingClientRect();
          const primary = document.querySelector('#guided-signup .gs-primary').getBoundingClientRect();
          return { trayBottom: Math.round(tray.bottom), primaryTop: Math.round(primary.top), fixed: getComputedStyle(document.querySelector('#guided-signup .gs-actions')).position };
        });
        check(`375: the tray is a sticky strip right above the pinned button (${JSON.stringify(strip)})`, () => { assert.equal(strip.fixed, 'fixed'); assert.ok(strip.trayBottom <= strip.primaryTop + 1); assert.ok(strip.primaryTop - strip.trayBottom < 40); });
        // The page under the auth card can scroll; the pinned bar stays at the bottom of the screen.
        const pinned = await page.evaluate(async () => {
          window.scrollTo(0, 80);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const bar = document.querySelector('#guided-signup .gs-actions').getBoundingClientRect();
          const out = { scrolled: Math.round(window.scrollY), bottom: Math.round(bar.bottom), screen: window.innerHeight };
          window.scrollTo(0, 0);
          return out;
        });
        check(`375: the pinned bar stays at the bottom of the screen when the page scrolls (${JSON.stringify(pinned)})`, () => { assert.ok(pinned.scrolled > 0, 'the page scrolled'); assert.equal(pinned.bottom, pinned.screen); });
      } else {
        const side = await page.evaluate(() => {
          const tray = document.querySelector('#guided-signup .gs-tray').getBoundingClientRect();
          const cat = document.querySelector('#guided-signup .gs-catalog').getBoundingClientRect();
          return { trayLeft: Math.round(tray.left), catRight: Math.round(cat.right), trayTop: Math.round(tray.top), catTop: Math.round(cat.top) };
        });
        check(`1440: the tray sits beside the catalogue (${JSON.stringify(side)})`, () => assert.ok(side.trayLeft >= side.catRight - 1));
      }
      // The selected chip itself also removes (Go), leaving three picks.
      await page.locator('#guided-signup [data-interest-id="games.board.go"]').click();
      await page.waitForTimeout(SETTLE);
      await grab();
      await checkStep(`${w}: Interests Next shows the Reveal`, async () => {
        await page.locator('#guided-signup .gs-primary').click();
        await waitTitle(page, "You're in, Ada.");
      });
      const saved = stub.posts('/rest/v1/rpc/set_member_interests').map((c) => JSON.parse(c.body || '{}').p_items);
      check(`${w}: Next calls set_member_interests with the even split 7,7,6 and mode play (${JSON.stringify(saved)})`, () => assert.deepEqual(saved, [[
        { interest_id: 'sports.racket.tennis', points: 7, mode: 'play' }, { interest_id: 'games.board.chess', points: 7, mode: 'play' }, { interest_id: 'music.listening.jazz', points: 6, mode: 'play' },
      ]]));
      const reveal = await page.evaluate(() => ({ text: document.querySelector('#guided-signup .gs-host').textContent.replace(/\s+/g, ' ').trim(), back: Boolean(document.querySelector('#guided-signup [data-signup-back]:not([hidden])')), step: document.querySelector('#guided-signup [data-signup-step]').textContent }));
      check(`${w}: Reveal names the first shared pick, has no Back and no step label, and contains no digits (${JSON.stringify(reveal)})`, () => {
        assert.ok(reveal.text.includes('People near you are into Chess. Your deck is ready.'));
        assert.ok(!/\d/.test(reveal.text), 'no member count');
        assert.equal(reveal.back, false);
        assert.equal(reveal.step, '');
      });
      await a11yScreen(page, `${w} reveal`);
      await shot(page, `signup-${w}-reveal-shared.png`);
      await grab();
      check(`${w}: no points, stepper or "points left" text anywhere in the flow`, () => {
        for (const t of flowText) { assert.ok(!/points?\b/i.test(t), t.slice(0, 80)); assert.ok(!/points left/i.test(t)); }
      });
      const steppers = await page.locator('#guided-signup .budget-step, #guided-signup [data-budget-points]').count();
      check(`${w}: no stepper controls in the guided flow`, () => assert.equal(steppers, 0));
      await checkStep(`${w}: See my deck goes to /app.html`, async () => {
        await buttonByText(page, 'See my deck').click();
        await page.waitForURL(/\/app\.html/, { timeout: 8000 });
      });
      check(`${w}: profile flow has no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 6. Google: the name is prefilled from full_name; "Use my location" sends coordinates only in the POST body; a deck
    //    with no shared interest gives the "one of the first" Reveal.
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, geolocation: { latitude: 12.971598, longitude: 77.594566 }, permissions: ['geolocation'] });
      const gUser = { ...user, user_metadata: { full_name: 'Grace Hopper', name: 'Grace Hopper' }, app_metadata: { provider: 'google' } };
      const stub = await stubContext(context, { signedIn: { ...session, user: gUser }, user: gUser, profile: { name: 'New Member', adult_declared_at: '2026-10-13T00:00:00Z' }, deckRows: [{ id: '22222222-2222-4222-8222-222222222222', shared_interests: [] }] });
      const { page, errors } = await newPage(context);
      await checkStep('google: #signup resumes at Name', () => openResumed(page, 'What should members call you?'));
      const pre = await page.evaluate(() => ({ value: document.querySelector('#signup-name')?.value, step: document.querySelector('#guided-signup [data-signup-step]').textContent }));
      check(`google: Name is prefilled from Google full_name, "Step 2 of 4" (${JSON.stringify(pre)})`, () => { assert.equal(pre.value, 'Grace Hopper'); assert.equal(pre.step, 'Step 2 of 4'); });
      await checkStep('google: Name saves and shows Area', async () => {
        await buttonByText(page, 'Continue').first().click();
        await waitTitle(page, 'Where are you based?');
      });
      check('google: the prefilled name is saved', () => assert.equal(JSON.parse(stub.patches('/rest/v1/profiles')[0]?.body || '{}').name, 'Grace Hopper'));
      await page.locator('#guided-signup [data-area-geo]').click();
      await page.waitForFunction(() => /Got it/.test(document.querySelector('#guided-signup [data-area-status]')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
      await shot(page, 'signup-1440-area-geo.png');
      await checkStep('google: Area (location) Continue shows Interests', async () => {
        await page.locator('#guided-signup .gs-primary').click();
        await waitTitle(page, 'What are you into?');
      });
      const loc = stub.posts('/rest/v1/rpc/set_home_location');
      const leaks = stub.calls.filter((c) => /12\.97|77\.59/.test(c.url));
      const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + location.href + document.body.innerHTML);
      check(`google: geolocation calls set_home_location with coordinates only in the POST body (${loc.map((c) => c.body).join(' | ')})`, () => {
        assert.equal(loc.length, 1);
        assert.deepEqual(JSON.parse(loc[0].body), { lat: 12.971598, lng: 77.594566 });
        assert.equal(leaks.length, 0, 'no coordinates in any URL');
        assert.ok(!/12\.97|77\.59/.test(stored), 'no coordinates in storage, the URL or the DOM');
      });
      await pickChip(page, 'sports.racket.padel');
      await page.waitForTimeout(SETTLE);
      await checkStep('google: Interests Next shows the Reveal', async () => {
        await page.locator('#guided-signup .gs-primary').click();
        await waitTitle(page, "You're in, Grace.");
      });
      const text = (await page.locator('#guided-signup .gs-host').textContent()).replace(/\s+/g, ' ');
      check(`google: with no shared interest the Reveal says "You're one of the first in Bengaluru…" and has no digits (${text})`, () => {
        assert.ok(text.includes("You're one of the first in Bengaluru. We'll bring people to you as the club grows."));
        assert.ok(!/\d/.test(text));
      });
      check('google: one pick saves 20 points', () => assert.deepEqual(JSON.parse(stub.posts('/rest/v1/rpc/set_member_interests')[0]?.body || '{}').p_items, [{ interest_id: 'sports.racket.padel', points: 20, mode: 'play' }]));
      await a11yScreen(page, '1440 reveal first');
      await shot(page, 'signup-1440-reveal-first.png');
      check(`google profile: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await stubContext(context, { signedIn: session, profile: { name: 'Ada', adult_declared_at: '2026-10-13T00:00:00Z' }, hasCell: true });
      const { page } = await newPage(context);
      await toInterests(page);
      await pickChip(page, 'sports.racket.tennis');
      await page.waitForTimeout(SETTLE);
      await page.locator('#guided-signup .gs-primary').click();
      await waitTitle(page, "You're in, Ada.");
      await shot(page, 'signup-375-reveal-first.png');
      await context.close();
    }

    // 7. 18+ "No": the adults-only copy, and the member is signed out.
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const stub = await stubContext(context, { signedIn: session });
      const { page, errors } = await newPage(context);
      await openResumed(page, 'Are you 18 or older?');
      await page.locator('#guided-signup button:text-is("No")').click();
      await page.waitForFunction(() => document.querySelector('#guided-signup')?.textContent.includes("Brivia Club is for adults. Come back when you're 18."), null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(SETTLE);
      const after = await page.evaluate(() => ({ text: document.querySelector('#guided-signup').textContent, back: Boolean(document.querySelector('#guided-signup [data-signup-back]:not([hidden])')), token: localStorage.getItem('sb-stub-auth-token') }));
      check(`No signs out with the adults-only copy (${JSON.stringify({ ...after, text: after.text.slice(0, 120) })})`, () => {
        assert.ok(after.text.includes("Brivia Club is for adults. Come back when you're 18."));
        assert.equal(stub.posts('/auth/v1/logout').length, 1);
        assert.equal(after.token, null);
        assert.equal(after.back, false);
        assert.equal(stub.posts('/rest/v1/rpc/declare_adult').length, 0);
      });
      await a11yScreen(page, '375 adult no');
      await shot(page, 'signup-375-adult-no.png');
      check(`adult no: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 8. Each save failure (500) keeps the screen, shows a retry message, and leaves no busy button; the retry works.
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const stub = await stubContext(context, { signedIn: session, fail: { declare_adult: [500], profiles: [0, 500], set_home_city: [500], set_member_interests: [500] } });
      const { page, errors } = await newPage(context);
      await openResumed(page, 'Are you 18 or older?');
      const failed = async (tag, titleText, press) => {
        await press();
        await page.waitForFunction(() => (document.querySelector('#guided-signup #signup-error')?.textContent || '').length > 0, null, { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(300);
        const st = await page.evaluate(() => {
          const b = document.querySelector('#guided-signup .gs-primary');
          return { title: document.querySelector('#signup-screen-title')?.textContent, error: document.querySelector('#guided-signup #signup-error')?.textContent, busy: b.getAttribute('aria-busy'), disabled: b.disabled };
        });
        check(`${tag}: a 500 keeps the screen, shows a retry message, and the button is not left aria-busy (${JSON.stringify(st)})`, () => {
          assert.equal(st.title, titleText); assert.match(st.error || '', /try again/i); assert.equal(st.busy, null); assert.equal(st.disabled, false);
        });
        await shot(page, `signup-375-${tag}-error.png`);
      };
      await failed('adult', 'Are you 18 or older?', () => buttonByText(page, "Yes, I'm 18 or older").click());
      await checkStep('adult retry shows Name', async () => { await buttonByText(page, "Yes, I'm 18 or older").click(); await waitTitle(page, 'What should members call you?'); });
      await page.locator('#signup-name').fill('Ada');
      await failed('name', 'What should members call you?', () => page.locator('#signup-name').press('Enter'));
      await checkStep('name retry shows Area', async () => { await page.locator('#signup-name').press('Enter'); await waitTitle(page, 'Where are you based?'); });
      await page.locator('#guided-signup [data-area-city]').click();
      await page.locator('#signup-area-city-search').fill('Pune');
      await page.waitForSelector('#guided-signup .area-city-option', { timeout: 5000 });
      await page.locator('#guided-signup .area-city-option', { hasText: 'Pune' }).click();
      await failed('area', 'Where are you based?', () => page.locator('#guided-signup .gs-primary').click());
      await checkStep('area retry shows Interests', async () => { await page.locator('#guided-signup .gs-primary').click(); await waitTitle(page, 'What are you into?'); });
      await pickChip(page, 'sports.racket.tennis');
      await page.waitForTimeout(SETTLE);
      await failed('interests', 'What are you into?', () => page.locator('#guided-signup .gs-primary').click());
      await checkStep('interests retry shows the Reveal', async () => { await page.locator('#guided-signup .gs-primary').click(); await waitTitle(page, "You're in, Ada."); });
      check(`failures: every call was retried exactly once (${['declare_adult', 'set_home_city', 'set_member_interests'].map((n) => stub.posts(`/rest/v1/rpc/${n}`).length).join(',')})`, () => {
        for (const n of ['declare_adult', 'set_home_city', 'set_member_interests']) assert.equal(stub.posts(`/rest/v1/rpc/${n}`).length, 2, n);
      });
      check(`failures: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 9. Interests details: reduced motion (no transform, fades only), the 13th pick, a private pick behind the consent
    //    dialog, Next disabled until a public pick, and no sideways scroll at 320.
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
      await stubContext(context, { signedIn: session, profile: { name: 'Ada', adult_declared_at: '2026-10-13T00:00:00Z' }, hasCell: true });
      const { page, errors } = await newPage(context);
      await toInterests(page);
      await pickChip(page, 'sports.racket.tennis', { click: false });
      await page.locator('#guided-signup [data-interest-id="sports.racket.tennis"]').click();
      const samples = [];
      for (const ms of [20, 60, 100]) {
        await page.waitForTimeout(ms === 20 ? 20 : 40);
        samples.push(await page.evaluate(() => ({
          clones: document.querySelectorAll('#guided-signup .it-fly').length,
          moved: [...document.querySelectorAll('#guided-signup .gs-tray *, #guided-signup .gs-chip')].map((el) => getComputedStyle(el).transform).filter((t) => t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)'),
          opacity: Number(getComputedStyle(document.querySelector('#guided-signup [data-pick-id="sports.racket.tennis"]') || document.body).opacity),
        })));
      }
      check(`reduced motion: no transform is applied during a pick, only a fade (${JSON.stringify(samples)})`, () => {
        for (const sample of samples) { assert.equal(sample.clones, 0); assert.deepEqual(sample.moved, []); }
        assert.ok(samples.some((sample) => sample.opacity < 1), 'the pick fades in');
      });
      await page.waitForTimeout(SETTLE);
      const landed = await trayState(page);
      check(`reduced motion: the pick still lands (${JSON.stringify(landed)})`, () => { assert.equal(landed.count, '1 picked'); assert.deepEqual(landed.picks, ['Tennis']); assert.equal(landed.live, 'Tennis added'); });
      await shot(page, 'signup-375-interests-reduced.png');
      await context.close();
      check(`reduced: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
    }
    for (const w of [1440, 375]) {
      const context = await browser.newContext({ viewport: { width: w, height: w === 375 ? 812 : 900 } });
      const stub = await stubContext(context, { signedIn: session, profile: { name: 'Ada', adult_declared_at: '2026-10-13T00:00:00Z' }, hasCell: true });
      const { page, errors } = await newPage(context);
      await toInterests(page);
      // A private pick opens the consent dialog first; nothing is added until Continue.
      await pickChip(page, PRIVATE_ID);
      await page.waitForSelector('#guided-signup dialog[open]', { timeout: 5000 }).catch(() => {});
      const dlg = await page.evaluate(() => {
        const d = document.querySelector('#guided-signup dialog[open]');
        return d ? { text: d.textContent.replace(/\s+/g, ' '), ticked: d.querySelector('[data-private-checkbox]').checked, cont: d.querySelector('[data-private-continue]').disabled, count: document.querySelector('#guided-signup [data-tray-count]').textContent.trim() } : null;
      });
      check(`${w}: a private pick opens the private-interest consent dialog before it is added (${JSON.stringify(dlg)})`, () => {
        assert.ok(dlg); assert.ok(dlg.text.includes('Private interests (like faith, health or orientation)')); assert.equal(dlg.ticked, false); assert.equal(dlg.cont, true); assert.equal(dlg.count, '0 picked');
      });
      await shot(page, `signup-${w}-interests-private-consent.png`);
      await page.locator('#guided-signup dialog[open] [data-private-checkbox]').check();
      await page.locator('#guided-signup dialog[open] [data-private-continue]').click();
      await page.waitForTimeout(SETTLE);
      const priv = await trayState(page);
      check(`${w}: Continue adds the private pick, and Next stays disabled until a public pick (${JSON.stringify(priv)})`, () => { assert.deepEqual(priv.picks, ['Scripture study']); assert.equal(priv.next, true); });
      await pickChip(page, 'sports.racket.tennis');
      await page.waitForTimeout(SETTLE);
      const enabled = (await trayState(page)).next === false;
      check(`${w}: Next is enabled once a public interest is picked`, () => assert.ok(enabled));
      // Fill to 12, then the 13th shows the cap message.
      for (const id of PUBLIC_IDS.filter((x) => x !== 'sports.racket.tennis').slice(0, 10)) await pickChip(page, id, { settle: 60 });
      await page.waitForTimeout(SETTLE);
      const twelve = await trayState(page);
      const thirteenth = PUBLIC_IDS.filter((x) => x !== 'sports.racket.tennis')[10];
      await pickChip(page, thirteenth, { force: true });
      await page.waitForTimeout(SETTLE);
      const capped = await page.evaluate(() => ({ error: document.querySelector('#guided-signup #signup-error')?.textContent, count: document.querySelector('#guided-signup [data-tray-count]').textContent.trim() }));
      check(`${w}: the 13th pick shows the cap message (${JSON.stringify({ twelve: twelve.count, ...capped })})`, () => {
        assert.equal(twelve.count, '12 picked'); assert.equal(capped.count, '12 picked'); assert.equal(capped.error, 'You can choose up to 12 interests. Remove one to add another.');
      });
      await a11yScreen(page, `${w} interests full`);
      await shot(page, `signup-${w}-interests-full.png`);
      await page.locator('#guided-signup .gs-primary').click();
      await page.waitForFunction(() => /You're in/.test(document.querySelector('#signup-screen-title')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
      const consent = stub.posts('/rest/v1/rpc/set_sensitive_consent').map((c) => c.body);
      const items = JSON.parse(stub.posts('/rest/v1/rpc/set_member_interests')[0]?.body || '{}').p_items || [];
      check(`${w}: a private pick gives the consent before set_member_interests (${consent.join(',')}; ${items.map((i) => i.points).join(',')})`, () => {
        assert.deepEqual(consent.map((b) => JSON.parse(b)), [{ p_consent: true }]);
        assert.equal(items.length, 12); assert.equal(items.reduce((sum, i) => sum + i.points, 0), 20); assert.equal(items[0].interest_id, PRIVATE_ID);
      });
      check(`${w} interests details: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }
    // 10. Full tray: a private chip shows the cap message and never asks for consent.
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await stubContext(context, { signedIn: session, profile: { name: 'Ada', adult_declared_at: '2026-10-13T00:00:00Z' }, hasCell: true });
      const { page, errors } = await newPage(context);
      await toInterests(page);
      for (const id of PUBLIC_IDS.slice(0, 12)) await pickChip(page, id, { settle: 60 });
      await page.waitForTimeout(SETTLE);
      await pickChip(page, PRIVATE_ID, { force: true });
      await page.waitForTimeout(SETTLE);
      const full = await page.evaluate(() => ({ dialog: Boolean(document.querySelector('#guided-signup dialog[open]')), error: document.querySelector('#guided-signup #signup-error')?.textContent, count: document.querySelector('#guided-signup [data-tray-count]').textContent.trim() }));
      check(`a private chip tapped with 12 picks shows the cap message and no consent dialog (${JSON.stringify(full)})`, () => {
        assert.equal(full.dialog, false); assert.equal(full.count, '12 picked'); assert.equal(full.error, 'You can choose up to 12 interests. Remove one to add another.');
      });
      // The 12-pick tray ends inside the screen and no lower than the Continue button; its picks scroll inside it.
      const cap = await page.evaluate(() => {
        const t = document.querySelector('#guided-signup .gs-tray');
        const r = t.getBoundingClientRect();
        return { bottom: Math.round(r.bottom), screen: window.innerHeight, button: Math.round(document.querySelector('#guided-signup .gs-primary').getBoundingClientRect().bottom), scrolls: t.scrollHeight > t.clientHeight };
      });
      check(`1440: the 12-pick tray stays inside the screen and the catalogue column, scrolling inside (${JSON.stringify(cap)})`, () => { assert.ok(cap.bottom <= cap.screen); assert.ok(cap.bottom <= cap.button + 1); assert.ok(cap.scrolls); });
      await shot(page, 'signup-1440-interests-full-private.png');
      check(`full private: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }
    {
      const context = await browser.newContext({ viewport: { width: 320, height: 640 } });
      await stubContext(context, { signedIn: session, profile: { name: 'Ada', adult_declared_at: '2026-10-13T00:00:00Z' }, hasCell: true });
      const { page, errors } = await newPage(context);
      await toInterests(page);
      const ids = ['sports.racket.tennis', 'games.board.chess', 'music.listening.jazz', 'sports.team.basketball', 'sports.racket.badminton', 'games.board.go'];
      for (const id of ids) { await pickChip(page, id); await page.waitForTimeout(SETTLE); }
      await a11yScreen(page, '320 interests');
      await shot(page, 'signup-320-interests.png');
      const collapsed = await checkTrayDisclosure(page, 320, ['Tennis', 'Chess', 'Jazz', 'Basketball', 'Badminton', 'Go']);
      check(`320: six picks do not fit one row, so "+n more" shows (${collapsed.shown} shown)`, () => assert.ok(collapsed.shown < 6 && collapsed.more));
      // Removing from the expanded tray flies the pick back (a clone mid-flight) and keeps the rest whole.
      await page.locator('#guided-signup [data-tray-more]').click();
      await page.waitForTimeout(200);
      await page.locator('#guided-signup [data-pick-id="sports.racket.tennis"]').click();
      await page.waitForTimeout(60);
      const flying = await page.evaluate(() => [...document.querySelectorAll('#guided-signup .it-fly')].map((el) => getComputedStyle(el).visibility));
      await page.waitForTimeout(SETTLE);
      const after = await trayLayout(page);
      check(`320: removing a pick from the expanded tray flies it back and leaves five (${JSON.stringify({ flying, after })})`, () => {
        assert.deepEqual(flying, ['visible']); assert.equal(after.total, 5); assert.deepEqual(after.clipped, []);
      });
      await shot(page, 'signup-320-interests-after-remove.png');
      // A tap within the flight: add, then remove 60 ms later. The reverse clone is visible and nothing stays hidden.
      await pickChip(page, 'music.listening.classical', { click: false });
      await page.locator('#guided-signup [data-interest-id="music.listening.classical"]').click();
      await page.waitForTimeout(60);
      await page.locator('#guided-signup [data-interest-id="music.listening.classical"]').click();
      await page.waitForTimeout(40);
      const rapid = await page.evaluate(() => ({
        clones: [...document.querySelectorAll('#guided-signup .it-fly')].map((el) => getComputedStyle(el).visibility),
      }));
      await page.waitForTimeout(SETTLE);
      const settledState = await page.evaluate(() => ({
        clones: document.querySelectorAll('#guided-signup .it-fly').length,
        hiddenStyle: [...document.querySelectorAll('#guided-signup [data-pick-id], #guided-signup [data-interest-id], #guided-signup [data-tray-more]')].filter((el) => el.style.visibility === 'hidden').length,
        pressed: document.querySelector('#guided-signup [data-interest-id="music.listening.classical"]').getAttribute('aria-pressed'),
      }));
      check(`320: a second tap mid-flight shows the reverse flight and leaves nothing hidden (${JSON.stringify({ rapid, settledState })})`, () => {
        assert.ok(rapid.clones.length >= 1); for (const v of rapid.clones) assert.equal(v, 'visible');
        assert.equal(settledState.clones, 0); assert.equal(settledState.hiddenStyle, 0); assert.equal(settledState.pressed, 'false');
      });
      check(`320 interests: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 11. Task 5: resume anywhere. A session on auth.html (#signup, ?complete-profile=1) opens the first incomplete
    //     screen; a completed member goes to the app.
    const DONE = [{ interest_id: 'games.board.chess', points: 20, mode: 'play' }];
    for (const w of [1440, 375]) {
      const context = await browser.newContext({ viewport: { width: w, height: w === 375 ? 812 : 900 } });
      const stub = await stubContext(context, { signedIn: session, profile: { name: 'Ada', adult_declared_at: '2026-10-13T00:00:00Z' } });
      const { page, errors } = await newPage(context);
      const ok = await checkStep(`${w}: a session with adult+name but no area opens #signup at Area`, () => openResumed(page, 'Where are you based?'));
      const step = ok ? await stepText(page) : '';
      check(`${w}: resumed Area shows "Step 5 of 6" on the email path (${step})`, () => assert.equal(step, 'Step 5 of 6'));
      check(`${w}: resuming sends no answer again`, () => { for (const n of ['declare_adult', 'set_home_city', 'set_member_interests']) assert.equal(stub.posts(`/rest/v1/rpc/${n}`).length, 0, n); });
      if (ok) { await a11yScreen(page, `${w} resume area`); await shot(page, `signup-${w}-resume-area.png`); }
      check(`resume ${w}: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const gUser = { ...user, user_metadata: { full_name: 'Grace Hopper' }, app_metadata: { provider: 'google' } };
      await stubContext(context, { signedIn: { ...session, user: gUser }, user: gUser, profile: { name: 'Grace Hopper', adult_declared_at: '2026-10-13T00:00:00Z' } });
      const { page, errors } = await newPage(context);
      const ok = await checkStep('google: a session with adult+name but no area opens #signup at Area', () => openResumed(page, 'Where are you based?'));
      const step = ok ? await stepText(page) : '';
      check(`google: resumed Area shows "Step 3 of 4" (${step})`, () => assert.equal(step, 'Step 3 of 4'));
      check(`google resume: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await stubContext(context, { signedIn: session, profile: { name: 'Ada', adult_declared_at: '2026-10-13T00:00:00Z' }, hasCell: true, interests: DONE });
      const { page, errors } = await newPage(context);
      await page.goto(`${BASE}/auth.html#signup`, { waitUntil: 'domcontentloaded' });
      const landed = await page.waitForURL(/\/app\.html/, { timeout: 15000 }).then(() => true, () => false);
      check(`a completed member opening auth.html#signup lands on /app.html (${page.url()})`, () => assert.ok(landed));
      check(`completed: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await stubContext(context, { signedIn: session, profile: { name: 'New Member', adult_declared_at: '2026-10-13T00:00:00Z' }, hasCell: true, interests: DONE });
      const { page, errors } = await newPage(context);
      const ok = await checkStep('?complete-profile=1 resumes at the first incomplete screen (Name)', () => openResumed(page, 'What should members call you?', '/auth.html?complete-profile=1'));
      const ui = ok ? await page.evaluate(() => ({ value: document.querySelector('#signup-name')?.value, step: document.querySelector('#guided-signup [data-signup-step]').textContent })) : {};
      check(`complete-profile: "New Member" is not prefilled, "Step 4 of 6" (${JSON.stringify(ui)})`, () => { assert.equal(ui.value, ''); assert.equal(ui.step, 'Step 4 of 6'); });
      check(`complete-profile: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 12. Task 5: login gains "Email me a code instead" (the same Code screen, shouldCreateUser false).
    for (const w of [1440, 375]) {
      const context = await browser.newContext({ viewport: { width: w, height: w === 375 ? 812 : 900 } });
      const stub = await stubContext(context, { profile: { name: 'Ada', adult_declared_at: '2026-10-13T00:00:00Z' }, hasCell: true, interests: DONE });
      const { page, errors } = await newPage(context);
      await page.goto(`${BASE}/auth.html#login`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#login-form', { timeout: 15000 });
      const codeButton = page.locator('[data-login-code]');
      const shown = await codeButton.isVisible().catch(() => false);
      const label = shown ? (await codeButton.textContent()).trim() : '';
      check(`${w}: login offers "Email me a code instead" (${label})`, () => assert.equal(label, 'Email me a code instead'));
      if (shown) {
        const box = await codeButton.boundingBox();
        check(`${w}: the code button is at least 44 px tall (${box?.height})`, () => assert.ok(box && box.height >= 44));
        await shot(page, `login-${w}-code-option.png`);
        await codeButton.click();
        await page.waitForTimeout(300);
        const note = (await page.locator('#login-note').textContent()).trim();
        check(`${w}: without an email the code button asks for one and sends nothing (${note})`, () => { assert.match(note, /Enter your email/); assert.equal(stub.posts('/auth/v1/otp').length, 0); });
        await page.locator('#login-form input[name="email"]').fill(EMAIL);
        const ok = await checkStep(`${w}: "Email me a code instead" opens the Code screen`, async () => { await codeButton.click(); await waitTitle(page, 'Enter the code'); });
        const sent = stub.posts('/auth/v1/otp').map((c) => JSON.parse(c.body || '{}'));
        check(`${w}: the login code goes out with shouldCreateUser false (${JSON.stringify(sent)})`, () => { assert.equal(sent.length, 1); assert.equal(sent[0].email, EMAIL); assert.equal(sent[0].create_user, false); });
        if (ok) {
          const ui = { step: await stepText(page), text: await page.locator('#guided-signup').textContent() };
          check(`${w}: the login Code screen shows no signup step label and names the address`, () => { assert.equal(ui.step, ''); assert.ok(ui.text.includes(EMAIL)); });
          await a11yScreen(page, `${w} login code`);
          await shot(page, `login-${w}-code-screen.png`);
          if (w === 375) {
            await page.locator('#guided-signup .gs-otp input').first().click();
            await page.keyboard.type(VERIFY_429);
            await page.waitForFunction((t) => document.querySelector('#guided-signup #signup-error')?.textContent.trim() === t, VERIFY_RATE_COPY, { timeout: 8000 }).catch(() => {});
            const msg = (await page.locator('#guided-signup #signup-error').textContent()).trim();
            check(`login verify 429: its own copy, never "not created" (${msg})`, () => assert.equal(msg, VERIFY_RATE_COPY));
            for (let i = 0; i < 6; i += 1) await page.keyboard.press('Backspace');
            await page.locator('#guided-signup .gs-otp input').first().click();
          } else await page.locator('#guided-signup .gs-otp input').first().click();
          await page.keyboard.type(GOOD);
          const landed = await page.waitForURL(/\/app\.html/, { timeout: 15000 }).then(() => true, () => false);
          check(`${w}: verifying the login code signs in and opens the app (${page.url()})`, () => assert.ok(landed));
        }
      }
      check(`login code ${w}: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 13. Task 5: verify 429 on the signup Code screen has its own copy (not the sign-up "account was not created").
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await stubContext(context);
      const { page, errors } = await newPage(context);
      await openGuided(page);
      await toCode(page);
      await page.locator('#guided-signup .gs-otp input').first().click();
      await page.keyboard.type(VERIFY_429);
      await page.waitForFunction(() => (document.querySelector('#guided-signup #signup-error')?.textContent || '').length > 0, null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(SETTLE);
      const msg = (await page.locator('#guided-signup #signup-error').textContent()).trim();
      check(`signup verify 429 shows "${VERIFY_RATE_COPY}" (got "${msg}")`, () => { assert.equal(msg, VERIFY_RATE_COPY); assert.ok(!/not created/.test(msg)); });
      await shot(page, 'signup-375-verify-rate-limited.png');
      check(`verify 429: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 14. Task 5: the old 4-step form is gone: no phone, gender or points input anywhere in auth.html.
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await stubContext(context);
      const { page, errors } = await newPage(context);
      const raw = await (await fetch(`${BASE}/auth.html`)).text();
      await page.goto(`${BASE}/auth.html#login`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#login-form', { timeout: 15000 });
      const dom = await page.evaluate(() => ({
        inputs: [...document.querySelectorAll('input, select, textarea')].map((el) => `${el.name || ''}|${el.type || ''}|${el.id || ''}`).filter((s) => /phone|tel|gender|point|budget/i.test(s)),
        oldForm: Boolean(document.querySelector('#signup-form, [data-signup-step-label], .budget, .gender-picker, .phone-field')),
      }));
      check(`no phone, gender or points input exists anywhere in auth.html (${JSON.stringify(dom)})`, () => {
        assert.deepEqual(dom.inputs, []); assert.equal(dom.oldForm, false);
        assert.ok(!/type="tel"|name="phone|name="gender"|passion points|budget-|signup-form/i.test(raw), 'the served auth.html still has old-form markup');
      });
      check(`old form: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 15. Task 5: once the Reveal is reached, browser Back onto a profile screen shows the Reveal again (the interests are
    //     saved: no stale Interests screen and no second save).
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const stub = await stubContext(context, { signedIn: session, profile: { name: 'Ada', adult_declared_at: '2026-10-13T00:00:00Z' } });
      const { page, errors } = await newPage(context);
      // Area, then Interests, then the Reveal: two profile screens behind it in history.
      await openResumed(page, 'Where are you based?');
      await page.locator('#guided-signup [data-area-city]').click();
      await page.locator('#signup-area-city-search').pressSequentially('Pun', { delay: 20 });
      await page.waitForSelector('#signup-area-city-results [role="option"]');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await buttonByText(page, 'Continue').first().click();
      await waitTitle(page, 'What are you into?');
      await pickChip(page, 'games.board.chess', { settle: SETTLE });
      const ok = await checkStep('back-from-reveal: Continue saves and shows the Reveal', async () => {
        await buttonByText(page, 'Continue').first().click();
        await page.waitForSelector('#guided-signup[data-screen="reveal"]', { timeout: 8000 });
        await page.waitForTimeout(SETTLE);
      });
      const seen = [];
      if (ok) {
        for (let i = 0; i < 2; i += 1) {
          await page.goBack({ waitUntil: 'commit' }).catch(() => {});
          await page.waitForTimeout(SETTLE);
          seen.push(await page.evaluate(() => (/\/app\.html/.test(location.pathname) ? 'app' : document.querySelector('#guided-signup')?.dataset.screen)));
        }
      }
      check(`browser Back after the Reveal never shows a profile screen again (${seen.join(' / ')})`, () => { assert.equal(seen.length, 2); for (const s of seen) assert.ok(['reveal', 'app'].includes(s), s); });
      check('back-from-reveal: the interests were saved once', () => assert.equal(stub.posts('/rest/v1/rpc/set_member_interests').length, 1));
      check(`back-from-reveal: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
      await context.close();
    }

    // 16. Task 5: in the expanded phone tray (it scrolls inside), a newly added pick is scrolled into view, so the flight
    //     lands on a visible slot.
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      await stubContext(context, { signedIn: session, profile: { name: 'Ada', adult_declared_at: '2026-10-13T00:00:00Z' }, hasCell: true });
      const { page, errors } = await newPage(context);
      await toInterests(page);
      const first = ['sports.racket.tennis', 'sports.racket.badminton', 'sports.racket.squash', 'sports.racket.padel', 'sports.team.cricket', 'sports.team.football', 'sports.team.basketball', 'games.board.chess', 'games.board.go'];
      for (const id of first) { await pickChip(page, id); await page.waitForTimeout(SETTLE); }
      await page.locator('#guided-signup [data-tray-more]').click();
      await page.waitForTimeout(SETTLE);
      const scrolls = await page.evaluate(() => { const l = document.querySelector('#guided-signup .gs-tray-list'); return { sh: l.scrollHeight, ch: l.clientHeight }; });
      const results = [];
      for (const id of ['music.listening.jazz', 'music.listening.classical', 'music.listening.indie_rock']) {
        await pickChip(page, id);
        await page.waitForTimeout(SETTLE);
        results.push(await page.evaluate((pid) => {
          const list = document.querySelector('#guided-signup .gs-tray-list').getBoundingClientRect();
          const r = document.querySelector(`#guided-signup [data-pick-id="${pid}"]`)?.getBoundingClientRect();
          return { pid, expanded: document.querySelector('#guided-signup .gs-tray').classList.contains('is-expanded'), inView: Boolean(r) && r.top >= list.top - 1 && r.bottom <= list.bottom + 1 };
        }, id));
      }
      check(`expanded tray scrolls inside (${JSON.stringify(scrolls)}) and each new pick is in view (${JSON.stringify(results)})`, () => {
        assert.ok(scrolls.sh > scrolls.ch, 'the expanded tray needs to scroll for this check');
        for (const r of results) { assert.ok(r.expanded, `${r.pid}: still expanded`); assert.ok(r.inView, `${r.pid}: below the tray's scroll`); }
      });
      await shot(page, 'signup-375-interests-tray-expanded-newest.png');
      check(`expanded tray: no uncaught page errors (${errors.join(' | ')})`, () => assert.deepEqual(errors, []));
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
