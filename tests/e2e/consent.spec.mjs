// P0 consent e2e check (Ruling P4): runs app.html under Vite with every Supabase call stubbed.
// Never touches a real Supabase project. Playwright is NOT a repo dependency; see tests/e2e/README.md.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node tests/e2e/consent.spec.mjs
//
// Asserts: a like opens the pitch sheet and sends exactly ONE POST /rest/v1/rpc/send_signal when the sheet
// resolves (Ruling P13, D-032): submit carries the note; close / Escape / backdrop / next card send note null;
// nothing is POSTed before, and /rest/v1/connection_requests is never POSTed (raw inserts are revoked).
// Never /rest/v1/matches or /rest/v1/brivia_messages. Other members are read only through the candidate RPCs
// (/rest/v1/rpc/deck_candidates | get_candidates | search_members; never list_members since Iteration 3 Task 10),
// never /rest/v1/public_profiles or another member's /rest/v1/profiles row; the deck loads more cards when the
// queue runs out (after the passes are recorded), skills filters apply to the loaded deck, and name search reaches
// members on no deck page; a send_signal 'matched' shows "It's mutual"; the Requests list
// renders (escaped note, 44px equal-weight buttons), Accept calls /rest/v1/rpc/respond_connection_request
// and opens chat only if a match exists; crafted photo_url values cannot inject markup.
// Hardening (Iteration 2, Task 3b): the public-profile cover goes through safeImageUrl; repeated Like clicks
// while the sheet opens are ignored; Escape during a failing submit restores nothing; chat attachments link only https/same-origin URLs, escaped; a failed
// profile-photo upload shows an error and writes no data: URL.
// Final-review fixes (Ruling I11): member images (avatars, covers, post images) render only from the Supabase
// Storage origin (a third-party https URL never loads); profileToRow sends no created_at; blocking inserts and
// treats 23505 as success; no password is ever kept in localStorage (a stale cached one is scrubbed on load).
// Honest signal quota (Iteration 3, Task 9, D-026/D-032): the counter reads my_signal_quota ("30 signals left
// today", then 29 after one like); at 0 a Like keeps the card, sends nothing and shows "More at HH:MM"; a PT429 race
// puts the card back at the front; passes never call send_signal and nothing is kept in localStorage.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT || 5199);
const ORIGIN = 'https://stub.supabase.local';
const BASE = `http://127.0.0.1:${PORT}`;
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
// Optional: E2E_SCREENSHOTS=<dir> saves screenshots of the quota states (for visual review).
const SHOTS = process.env.E2E_SCREENSHOTS || '';

const ME = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CARA = '33333333-3333-4333-8333-333333333333';
const DEV = '44444444-4444-4444-8444-444444444444';
const EVE = '55555555-5555-4555-8555-555555555555'; // not in the deck: loaded via rpc/get_candidates
const ago = (ms) => new Date(Date.now() - ms).toISOString();
// deck_candidates rows (0004, Task 7 shape): no email / phone / city / state columns, exactly like the RPC returns.
// The deck never wraps around (Task 10), so each like step below needs its own card.
const deckRow = (id, name, experience, skill, extra = {}) => ({ id, name, photo_url: '', cover_url: null, experience, skills: [skill], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: [], ...extra });
const publicRows = [
  deckRow(BOB, 'Bob Lane', 'Designer', 'Design', { looking_for: ['Cofounder'], photo_url: 'javascript:window.__xss=1', shared_interests: ['Design'] }),
  deckRow(CARA, 'Cara Moss', 'Engineer', 'Climbing'),
  deckRow(DEV, 'Dev Rao', 'Writer', 'Poetry'),
  deckRow('22222222-2222-4222-8222-000000000004', 'Fay Hill', 'Baker', 'Baking'),
  deckRow('22222222-2222-4222-8222-000000000005', 'Gus Pike', 'Pilot', 'Flying'),
  deckRow('22222222-2222-4222-8222-000000000006', 'Hal Reed', 'Potter', 'Pottery'),
];
// A stranger whose photo_url tries to break out of the src attribute.
const eveRow = { id: EVE, name: 'Eve Stone', city: 'Delhi', experience: 'Analyst', skills: ['Chess'], looking_for: ['Friends'], photo_url: 'x" onerror="window.__xss=1', created_at: ago(4000) };
const ownRow = { id: ME, name: 'Alex Me', full_name: 'Alex Me', email: 'alex@test.brivia.club', phone: '+910000000000', city: 'Pune', experience: 'Founder', skills: ['Design'], looking_for: ['Cofounder'], gender: 'Prefer not to say', created_at: ago(9000) };

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const accessToken = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: ME, role: 'authenticated', exp, aud: 'authenticated' })}.sig`;
const user = { id: ME, aud: 'authenticated', role: 'authenticated', email: ownRow.email, user_metadata: { name: 'Alex Me' }, app_metadata: {}, created_at: ago(9000) };
const session = { access_token: accessToken, refresh_token: 'stub-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };

const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };

const waitForServer = async () => {
  for (let i = 0; i < 100; i += 1) {
    try { const res = await fetch(`${BASE}/app.html`); if (res.ok) return; } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('vite did not start');
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(([key, value]) => { window.localStorage.setItem(key, value); }, ['sb-stub-auth-token', JSON.stringify(session)]);

  const state = { matchedWith: new Set(), insertedRequests: new Set(), answered: new Set(), holdInsert: null, holdRpc: null, remaining: 30, passed: new Set() };
  const calls = [];
  const bodies = [];
  await context.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathName = url.pathname;
    const postData = request.postData();
    calls.push({ method, path: pathName, search: decodeURIComponent(url.search), body: postData });
    const json = (status, payload) => {
      const body = payload === undefined ? '' : JSON.stringify(payload);
      bodies.push({ path: pathName, body });
      return route.fulfill({ status, contentType: 'application/json', body, headers: { 'access-control-allow-origin': '*' } });
    };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (pathName.startsWith('/auth/v1/')) return json(200, pathName.endsWith('/user') ? user : session);
    if (pathName === '/rest/v1/profiles') {
      const wantsObject = (request.headers().accept || '').includes('vnd.pgrst.object');
      return json(200, wantsObject ? ownRow : [ownRow]);
    }
    if (pathName === '/rest/v1/public_profiles') return json(403, { code: '42501', message: 'permission denied for view public_profiles' });
    if (pathName === '/rest/v1/rpc/deck_candidates') return json(200, publicRows.filter((row) => !state.passed.has(row.id) && !state.insertedRequests.has(row.id)).slice(0, 12));
    if (pathName === '/rest/v1/rpc/deck_status') return json(200, 'caught_up');
    if (pathName === '/rest/v1/interaction' && method === 'POST') { state.passed.add(JSON.parse(postData || '{}').target_id); return route.fulfill({ status: 201, body: '', headers: { 'access-control-allow-origin': '*' } }); }
    if (pathName === '/rest/v1/rpc/get_candidates') {
      const { p_ids: ids = [] } = JSON.parse(postData || '{}');
      return json(200, [...publicRows, eveRow].filter((row) => ids.includes(row.id)).slice(0, 50));
    }
    if (pathName === '/rest/v1/rpc/search_members') return json(200, []);
    if (pathName === '/rest/v1/rpc/my_onboarding_status') return json(200, [{ interests: 2, points: 20, has_cell: true, place_label: 'Pune', completed: true }]);
    if (pathName === '/rest/v1/matches') {
      if (method !== 'GET') return json(403, { code: '42501', message: 'clients cannot write matches' });
      const filter = url.searchParams.get('or') || '';
      const rows = [...state.matchedWith].filter((id) => filter.includes(id) || !filter.includes('and(')).map((id) => ({ user1_id: ME, user2_id: id }));
      return json(200, rows);
    }
    // send_signal (D-032): one row; 'matched' when a match row exists afterwards, otherwise 'sent' for every
    // recipient state (a repeat send included). Charged once per call.
    if (pathName === '/rest/v1/rpc/send_signal') {
      if (state.holdInsert) await state.holdInsert;
      const { p_to: to } = JSON.parse(postData || '{}');
      state.insertedRequests.add(to);
      state.remaining = Math.max(0, state.remaining - 1);
      return json(200, [{ status: state.matchedWith.has(to) ? 'matched' : 'sent', remaining: state.remaining, resets_at: '2026-10-04T15:00:00+00:00' }]);
    }
    if (pathName === '/rest/v1/rpc/my_signal_quota') return json(200, [{ daily_limit: 30, remaining: state.remaining, resets_at: null, live_unanswered: 0, live_limit: 100 }]);
    if (pathName === '/rest/v1/connection_requests') {
      // Raw inserts are revoked (0004): the client must never POST here.
      if (method === 'POST') return json(403, { code: '42501', message: 'permission denied for table connection_requests' });
      return json(200, [
        { from_id: DEV, note: '<b>climb</b> with me?', created_at: ago(60000) },
        { from_id: EVE, note: null, created_at: ago(120000) },
      ].filter((row) => !state.answered.has(row.from_id)));
    }
    if (pathName === '/rest/v1/rpc/respond_connection_request') {
      if (state.holdRpc) await state.holdRpc;
      const { p_from: from, p_accept: acceptIt } = JSON.parse(postData || '{}');
      state.answered.add(from);
      // EVE stands for a blocked pair: the server records a silent decline and creates no match (Ruling P12).
      if (acceptIt && from !== EVE) state.matchedWith.add(from);
      return route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } });
    }
    if (pathName.startsWith('/rest/v1/')) return json(200, []);
    return json(200, {});
  });
  // Nothing leaves the machine: block every other external origin (fonts, CDNs).
  await context.route((url) => !url.href.startsWith(BASE) && !url.href.startsWith(ORIGIN), (route) => route.abort());
  await context.routeWebSocket(/stub\.supabase\.local/, (ws) => ws.close());

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.body.classList.contains('app-auth-pending'), null, { timeout: 15000 });
  await page.waitForFunction((names) => names.includes(document.querySelector('#swipe-name')?.textContent?.trim()), publicRows.map((r) => r.name), { timeout: 15000 })
    .catch(async (error) => { console.log('deck did not render:', page.url(), await page.locator('#swipe-name').textContent(), JSON.stringify(calls.map((c) => `${c.method} ${c.path}${c.search}`))); throw error; });
  await page.waitForTimeout(800);
  check('stayed on app.html (stubbed session accepted)', () => assert.match(page.url(), /app\.html/));

  const toast = () => page.locator('#app-toast').textContent();
  const posts = (p) => calls.filter((call) => call.method === 'POST' && call.path === p);

  const requestPosts = () => posts('/rest/v1/rpc/send_signal');
  const rawRequestPosts = () => posts('/rest/v1/connection_requests');
  const signalBody = (call) => { const b = JSON.parse(call.body || '{}'); return { to: b.p_to, note: b.p_note }; };
  const matchWrites = () => calls.filter((c) => c.path === '/rest/v1/matches' && c.method !== 'GET');
  const cardRow = async () => { const name = (await page.locator('#swipe-name').textContent()).trim(); return publicRows.find((row) => name.startsWith(row.name.split(' ')[0])); };
  const waitForToast = (re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('#app-toast')?.textContent || ''), re.source, { timeout: 5000 });
  const likeAndOpenSheet = async () => {
    await page.waitForFunction(() => document.querySelector('#pitch-modal')?.hidden);
    const row = await cardRow();
    await page.locator('[data-action="like"]').click();
    await page.waitForSelector('#pitch-modal:not([hidden])');
    await page.waitForTimeout(500); // past the 280 ms card advance
    return row;
  };
  const resetToast = () => page.evaluate(() => { const t = document.querySelector('#app-toast'); if (t) t.textContent = ''; });

  // 1. Like + submit: nothing before the sheet resolves, then exactly ONE POST carrying the note.
  let before = requestPosts().length;
  const bob = await likeAndOpenSheet();
  check('no request POST while the pitch sheet is open (P13)', () => assert.equal(requestPosts().length, before));
  await page.locator('#pitch-message').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);
  check('arrow keys while typing a pitch do not like/advance', () => { assert.equal(requestPosts().length, before); });
  let releaseInsert;
  state.holdInsert = new Promise((resolve) => { releaseInsert = resolve; });
  await page.locator('#pitch-message').fill('Hello, shall we talk design?');
  await resetToast();
  await page.locator('.pitch-submit').click();
  await page.waitForTimeout(150);
  const disabledInFlight = await page.locator('.pitch-submit').isDisabled();
  await page.locator('.pitch-submit').click({ force: true }).catch(() => {}); // double submit attempt
  await page.evaluate(() => document.querySelector('#pitch-form').requestSubmit());
  releaseInsert(); state.holdInsert = null;
  await page.waitForFunction(() => document.querySelector('#pitch-modal')?.hidden);
  await waitForToast(/Signal sent/);
  await page.waitForTimeout(300);
  const submitPosts = requestPosts().slice(before);
  check('pitch submit disabled while in flight', () => assert.equal(disabledInFlight, true));
  check(`like + submit = exactly one POST (got ${submitPosts.length})`, () => assert.equal(submitPosts.length, 1));
  check('that one POST carries the note and the liked person (p_to, p_note only)', () => {
    assert.deepEqual(JSON.parse(submitPosts[0].body), { p_to: bob.id, p_note: 'Hello, shall we talk design?' });
  });
  const submitToast = await toast();
  check(`submit toast is "Signal sent" (got "${submitToast}")`, () => assert.equal(submitToast, 'Signal sent'));
  check('pitch never POSTs /rest/v1/brivia_messages', () => assert.equal(posts('/rest/v1/brivia_messages').length, 0));

  // 2. Like + close (×): one POST, note null. The stubbed matches lookup returns a row -> "It's mutual".
  before = requestPosts().length;
  const cara = await likeAndOpenSheet();
  state.matchedWith.add(cara.id);
  check(`no POST before the sheet resolves (${cara.name})`, () => assert.equal(requestPosts().length, before));
  await resetToast();
  await page.locator('#pitch-modal .overlay-close').click();
  await waitForToast(/It's mutual/);
  await page.waitForTimeout(300);
  let resolved = requestPosts().slice(before);
  check(`like + close = one POST with note null (got ${resolved.length})`, () => { assert.equal(resolved.length, 1); assert.deepEqual(signalBody(resolved[0]), { to: cara.id, note: null }); });
  const mutualToast = await toast();
  check(`mutual toast (got "${mutualToast}")`, () => assert.equal(mutualToast, `It's mutual. Say hi to ${cara.name}.`));

  // 3. Like + Escape: one POST, note null, "Signal sent".
  before = requestPosts().length;
  const dev = await likeAndOpenSheet();
  await resetToast();
  await page.keyboard.press('Escape');
  await waitForToast(/Signal sent/);
  await page.waitForTimeout(300);
  resolved = requestPosts().slice(before);
  check(`like + Escape = one POST with note null (got ${resolved.length})`, () => { assert.equal(resolved.length, 1); assert.deepEqual(signalBody(resolved[0]), { to: dev.id, note: null }); });
  const escToast = await toast();
  check(`plain like toast is "Signal sent" (got "${escToast}")`, () => assert.equal(escToast, 'Signal sent'));

  // 4. Like + backdrop: one POST, note null, "Signal sent".
  before = requestPosts().length;
  const again = await likeAndOpenSheet();
  await resetToast();
  await page.locator('#pitch-modal .app-overlay-backdrop').click({ position: { x: 5, y: 5 } });
  await waitForToast(/Signal sent|It's mutual/);
  await page.waitForTimeout(300);
  resolved = requestPosts().slice(before);
  check(`like + backdrop = one POST with note null (got ${resolved.length})`, () => { assert.equal(resolved.length, 1); assert.deepEqual(signalBody(resolved[0]), { to: again.id, note: null }); });
  const dupToast = await toast();
  check(`like + backdrop toast reads "Signal sent" (got "${dupToast}")`, () => assert.equal(dupToast, 'Signal sent'));

  // 5. Like, then move to the next card with the sheet open: one POST for the liked person, note null.
  before = requestPosts().length;
  const liked = await likeAndOpenSheet();
  await page.evaluate(() => document.querySelector('[data-action="pass"]').click());
  await page.waitForTimeout(600);
  resolved = requestPosts().slice(before);
  check(`like + next card = one POST with note null (got ${resolved.length})`, () => { assert.equal(resolved.length, 1); assert.deepEqual(signalBody(resolved[0]), { to: liked.id, note: null }); });
  const sheetHidden = await page.locator('#pitch-modal').isHidden();
  check('moving to the next card closes the pitch sheet', () => assert.equal(sheetHidden, true));
  check('no writes to /rest/v1/matches at any point', () => assert.equal(matchWrites().length, 0));
  check('a like never POSTs /rest/v1/connection_requests (raw inserts are revoked)', () => assert.equal(rawRequestPosts().length, 0));
  check('the like outcome comes from send_signal: no matches lookup for a like', () => assert.ok(!calls.some((c) => c.path === '/rest/v1/matches' && c.search.includes('and('))));
  await page.waitForTimeout(3000); // let the last toast clear

  // 4. Requests list in the notifications panel.
  // Opening the panel refetches requests and re-renders the list; wait for that before measuring.
  const refetch = page.waitForResponse((res) => res.url().includes('/rest/v1/connection_requests') && res.request().method() === 'GET');
  await page.locator('#app-notification-button').click();
  await refetch;
  await page.waitForTimeout(200);
  await page.waitForSelector('[data-request-from]');
  check('requests query is to_id=me and status=pending', () => assert.ok(calls.some((c) => c.method === 'GET' && c.path === '/rest/v1/connection_requests' && c.search.includes(`to_id=eq.${ME}`) && c.search.includes('status=eq.pending'))));
  const requestItem = page.locator(`[data-request-from="${DEV}"]`);
  const noteText = await requestItem.locator('.notification-request-note').textContent();
  const noteHasTag = await requestItem.locator('.notification-request-note b').count();
  const accept = requestItem.locator('[data-request-respond="accept"]');
  const decline = requestItem.locator('[data-request-respond="decline"]');
  const [acceptBox, declineBox] = [await accept.boundingBox(), await decline.boundingBox()];
  const senderName = await requestItem.locator('strong').textContent();
  check(`request sender name is Dev Rao (got "${senderName}")`, () => assert.equal(senderName, 'Dev Rao'));
  check('request note escaped (rendered as text, no <b> element)', () => { assert.equal(noteText, '<b>climb</b> with me?'); assert.equal(noteHasTag, 0); });
  const labels = [await accept.getAttribute('aria-label'), await decline.getAttribute('aria-label')];
  check(`aria-labels present (${labels.join(' | ')})`, () => { assert.match(labels[0], /^Accept connection request from Dev Rao$/); assert.match(labels[1], /^Decline connection request from Dev Rao$/); });
  check(`Accept/Decline >=44px and equal size (${acceptBox.width}x${acceptBox.height}, ${declineBox.width}x${declineBox.height})`, () => {
    assert.ok(acceptBox.height >= 44 && declineBox.height >= 44);
    assert.equal(Math.round(acceptBox.width), Math.round(declineBox.width));
  });
  let releaseRpc;
  state.holdRpc = new Promise((resolve) => { releaseRpc = resolve; });
  await accept.click();
  await page.waitForTimeout(150);
  const bothDisabled = (await page.locator(`[data-request-from="${DEV}"] [data-request-respond="accept"]`).isDisabled())
    && (await page.locator(`[data-request-from="${DEV}"] [data-request-respond="decline"]`).isDisabled());
  releaseRpc(); state.holdRpc = null;
  await page.waitForFunction((id) => !document.querySelector(`[data-request-from="${id}"]`), DEV);
  await page.waitForTimeout(300);
  const acceptToast = await toast();
  check('Accept/Decline disabled while the RPC is in flight', () => assert.equal(bothDisabled, true));
  check('Accept calls /rest/v1/rpc/respond_connection_request with p_accept=true', () => {
    const rpc = posts('/rest/v1/rpc/respond_connection_request');
    assert.equal(rpc.length, 1);
    assert.deepEqual(JSON.parse(rpc[0].body), { p_from: DEV, p_accept: true });
  });
  check(`accept toast (got "${acceptToast}")`, () => assert.equal(acceptToast, "It's mutual. Say hi to Dev Rao."));
  check('accept checks matches in both orders', () => assert.ok(calls.some((c) => c.path === '/rest/v1/matches' && /and\(user1_id\.eq\.[^,]+,user2_id\.eq\.[^)]+\),and\(/.test(c.search))));
  check('accept refreshed connections from matches', () => assert.ok(calls.filter((c) => c.path === '/rest/v1/matches' && c.method === 'GET' && !c.search.includes('and(')).length >= 2));

  // 4b. A stranger's request: sender loaded via rpc/get_candidates; a crafted photo_url cannot inject markup.
  const eveItem = page.locator(`[data-request-from="${EVE}"]`);
  const eveName = await eveItem.locator('strong').textContent();
  check(`unknown sender loaded from rpc/get_candidates (got "${eveName}")`, () => {
    assert.equal(eveName, 'Eve Stone');
    assert.ok(calls.some((c) => c.method === 'POST' && c.path === '/rest/v1/rpc/get_candidates' && JSON.parse(c.body || '{}').p_ids?.includes(EVE)));
  });
  const injected = await page.evaluate(() => ({
    xss: window.__xss,
    onerrorImgs: document.querySelectorAll('img[onerror]').length,
    jsSrcImgs: [...document.querySelectorAll('img')].filter((img) => /^javascript:/i.test(img.getAttribute('src') || '')).length,
    eveImgSrc: document.querySelector(`[data-request-from="${'55555555-5555-4555-8555-555555555555'}"] img`)?.getAttribute('src') || null,
  }));
  check(`crafted photo_url values inject nothing (${JSON.stringify(injected)})`, () => {
    assert.equal(injected.xss, undefined);
    assert.equal(injected.onerrorImgs, 0);
    assert.equal(injected.jsSrcImgs, 0);
    assert.equal(injected.eveImgSrc, null, 'crafted photo_url should fall back to the initials avatar');
  });
  // Accepting a blocked pair: the RPC succeeds but no match exists -> neutral toast, no chat.
  await resetToast();
  await eveItem.locator('[data-request-respond="accept"]').click();
  await page.waitForFunction((id) => !document.querySelector(`[data-request-from="${id}"]`), EVE);
  await waitForToast(/\S/);
  const blockedToast = await toast();
  check(`accept with no resulting match shows a neutral toast (got "${blockedToast}")`, () => assert.equal(blockedToast, 'Request answered.'));

  // 5. Chat list now contains the mutual and accepted people only.
  await page.evaluate(() => document.querySelector('[data-nav="chat"]')?.click());
  await page.waitForTimeout(400);
  const chatText = await page.locator('[data-view="chat"]').innerText();
  check('chat list shows matched people (mutual like + accepted)', () => { assert.ok(chatText.includes(cara.name), 'mutual person missing'); assert.ok(chatText.includes('Dev Rao'), 'accepted person missing'); });
  check('chat list does not show the unmatched liked person', () => assert.ok(!chatText.includes(bob.name)));
  check('chat list does not show the blocked-pair accept', () => assert.ok(!chatText.includes('Eve Stone')));

  // 6. Privacy: others are read only through the candidate RPCs; no other-member email/phone in any stubbed body or the DOM.
  check('profiles table read only for own id', () => {
    const profileReads = calls.filter((c) => c.path === '/rest/v1/profiles');
    assert.ok(profileReads.length >= 1);
    profileReads.forEach((c) => assert.ok(c.search.includes(`id=eq.${ME}`), c.search));
  });
  check('deck loaded via rpc/deck_candidates { p_limit: 12 }, never rpc/list_members', () => {
    const first = calls.find((c) => c.path === '/rest/v1/rpc/deck_candidates');
    assert.ok(first, 'no deck_candidates call');
    assert.deepEqual(JSON.parse(first.body || '{}'), { p_limit: 12 });
    assert.equal(calls.filter((c) => c.path === '/rest/v1/rpc/list_members').length, 0);
  });
  check('never reads /rest/v1/public_profiles (closed directory)', () => assert.equal(calls.filter((c) => c.path === '/rest/v1/public_profiles').length, 0));
  check('get_candidates never sent more than 50 ids or my own id', () => {
    calls.filter((c) => c.path === '/rest/v1/rpc/get_candidates').forEach((c) => {
      const ids = JSON.parse(c.body || '{}').p_ids || [];
      assert.ok(ids.length >= 1 && ids.length <= 50, `${ids.length} ids`);
      assert.ok(!ids.includes(ME));
    });
  });
  check('no response body about others carries email/phone keys', () => {
    bodies.filter((b) => b.path !== '/rest/v1/profiles' && !b.path.startsWith('/auth/')).forEach((b) => assert.ok(!/"(email|phone|phone_country_code|phone_number)"/.test(b.body), `${b.path}: ${b.body.slice(0, 120)}`));
  });
  check('no uncaught page errors', () => assert.deepEqual(consoleErrors, []));
  await page.screenshot({ path: process.env.E2E_SCREENSHOT || path.join(process.env.TMPDIR || '/tmp', 'consent-e2e.png') });

  // 7. Deck paging, filters, search and post authors (Iteration 2 Task 2; deck_candidates since Iteration 3 Task 10)
  // in a fresh context: a 30-member deck served 12 at a time by a deck_candidates stub that hides passed members
  // (like the server's 7-day pass memory), plus one member (Quinn) who is in no deck batch and is reachable only
  // through search_members.
  const memberId = (i) => `66666666-6666-4666-8666-${String(i).padStart(12, '0')}`;
  const QUINN = '77777777-7777-4777-8777-777777777777';
  const POST_AUTHOR = memberId(36);
  const directory = Array.from({ length: 30 }, (_, k) => ({ id: memberId(k + 1), name: `Member ${k + 1}`, photo_url: '', cover_url: null, experience: 'Builder', skills: ['Build'], looking_for: ['Friends'], distance_band: '~10 km', shared_interests: [] }));
  directory[4].skills = ['Pottery'];
  const postAuthorRow = { id: POST_AUTHOR, name: 'Member 36', city: 'Mumbai', experience: 'Builder', skills: ['Build'], looking_for: ['Friends'], photo_url: '' };
  // gender: a stub that wrongly sends one (the server returns null since D-038 R4) must still never render it.
  const quinnRow = { id: QUINN, name: 'Quinn Far', city: 'Leh', gender: 'Zygender', experience: 'Guide', skills: ['Trekking'], looking_for: ['Friends'], photo_url: '', created_at: ago(500000) };
  const deckPassed = new Set();
  const deckCalls = [];
  const deckBodies = [];
  const deckContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await deckContext.addInitScript(([key, value]) => { window.localStorage.setItem(key, value); }, ['sb-stub-auth-token', JSON.stringify(session)]);
  await deckContext.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathName = url.pathname;
    const postData = request.postData();
    deckCalls.push({ method, path: pathName, search: decodeURIComponent(url.search), body: postData });
    const json = (status, payload) => { const body = JSON.stringify(payload); deckBodies.push({ path: pathName, body }); return route.fulfill({ status, contentType: 'application/json', body, headers: { 'access-control-allow-origin': '*' } }); };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (pathName.startsWith('/auth/v1/')) return json(200, pathName.endsWith('/user') ? user : session);
    if (pathName === '/rest/v1/profiles') return json(200, (request.headers().accept || '').includes('vnd.pgrst.object') ? ownRow : [ownRow]);
    if (pathName === '/rest/v1/public_profiles') return json(403, { code: '42501', message: 'permission denied for view public_profiles' });
    const args = JSON.parse(postData || '{}');
    if (pathName === '/rest/v1/rpc/deck_candidates') return json(200, directory.filter((row) => !deckPassed.has(row.id)).slice(0, Math.max(1, Math.min(Number(args.p_limit) || 12, 20))));
    if (pathName === '/rest/v1/rpc/deck_status') return json(200, 'caught_up');
    if (pathName === '/rest/v1/interaction' && method === 'POST') { deckPassed.add(args.target_id); return route.fulfill({ status: 201, body: '', headers: { 'access-control-allow-origin': '*' } }); }
    if (pathName === '/rest/v1/rpc/get_candidates') return json(200, [...directory, postAuthorRow, quinnRow].filter((row) => (args.p_ids || []).slice(0, 50).includes(row.id)));
    if (pathName === '/rest/v1/rpc/my_onboarding_status') return json(200, [{ interests: 2, points: 20, has_cell: true, place_label: 'Pune', completed: true }]);
    if (pathName === '/rest/v1/rpc/search_members') {
      const q = String(args.p_query || '').trim().toLowerCase();
      return json(200, q ? [...directory, quinnRow].filter((row) => row.name.toLowerCase().includes(q)).slice(0, 20) : []);
    }
    if (pathName === '/rest/v1/community_posts') return json(200, [
      { id: 'post-1', author_id: POST_AUTHOR, image_url: `${ORIGIN}/storage/v1/object/public/community-posts/${POST_AUTHOR}/a.jpg`, image_path: `${POST_AUTHOR}/a.jpg`, caption: 'Hello from page two', created_at: ago(5000) },
      { id: 'post-2', author_id: ME, image_url: 'https://tracker.example/pixel.gif', image_path: `${ME}/p.jpg`, caption: 'My own post', created_at: ago(6000) },
    ]);
    if (pathName.startsWith('/rest/v1/')) return json(200, []);
    return json(200, {});
  });
  await deckContext.route((url) => !url.href.startsWith(BASE) && !url.href.startsWith(ORIGIN), (route) => route.abort());
  await deckContext.routeWebSocket(/stub\.supabase\.local/, (ws) => ws.close());
  const deckPage = await deckContext.newPage();
  const deckErrors = [];
  deckPage.on('pageerror', (error) => deckErrors.push(String(error)));
  await deckPage.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
  const cardName = () => deckPage.evaluate(() => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() || '');
  const waitForCard = (name) => deckPage.waitForFunction((n) => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() === n, name, { timeout: 8000 })
    .catch(async (error) => { console.log(`card "${name}" did not show (got "${await cardName()}")`, JSON.stringify(deckCalls.filter((c) => c.path.startsWith('/rest/v1/rpc/')).map((c) => `${c.path} ${c.body}`))); throw error; });
  const setFilter = (selector, value) => deckPage.evaluate(([sel, v]) => { const input = document.querySelector(sel); input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); }, [selector, value]);
  const deckRpcCalls = () => deckCalls.filter((c) => c.path === '/rest/v1/rpc/deck_candidates').map((c) => JSON.parse(c.body || '{}'));
  await waitForCard(directory[0].name);
  check(`deck shows the server's first card (${directory[0].name}) from one deck_candidates call`, () => assert.deepEqual(deckRpcCalls(), [{ p_limit: 12 }]));

  // A skills filter applies to the loaded deck; clearing it restores the server order.
  await setFilter('#filter-skills-input', 'Pottery');
  await waitForCard(directory[4].name);
  await setFilter('#filter-skills-input', '');
  await waitForCard(directory[0].name);
  check('a skills filter narrows the loaded deck without another deck_candidates call', () => assert.equal(deckRpcCalls().length, 1));

  // Passing all 12 cards: the 12 passes are recorded, then the next batch loads (no wrap-around to card 1).
  for (let i = 0; i < 12; i += 1) {
    await deckPage.evaluate(() => document.querySelector('[data-action="pass"]').click());
    await deckPage.waitForFunction((n) => (document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() || '') !== n, directory[i].name, { timeout: 6000 }).catch(() => {});
  }
  await waitForCard(directory[12].name);
  check('the end of the queue loads the next batch after the 12 passes are stored', () => {
    assert.deepEqual(deckRpcCalls(), [{ p_limit: 12 }, { p_limit: 12 }]);
    const second = deckCalls.findIndex((c, i) => c.path === '/rest/v1/rpc/deck_candidates' && deckCalls.slice(0, i).some((p) => p.path === '/rest/v1/rpc/deck_candidates'));
    assert.equal(deckCalls.slice(0, second).filter((c) => c.method === 'POST' && c.path === '/rest/v1/interaction').length, 12);
  });
  // Search needs 2+ non-space characters (D-038 R4): a one-letter query is never sent, and the field says so.
  await setFilter('#drawer-filter-search', ' Q ');
  await deckPage.waitForTimeout(500);
  check('a one-letter search sends no rpc/search_members call', () => assert.equal(deckCalls.filter((c) => c.path === '/rest/v1/rpc/search_members').length, 0));
  const searchHint = await deckPage.evaluate(() => { const i = document.querySelector('#drawer-filter-search'); return `${i.placeholder} | ${i.getAttribute('aria-label')}`; });
  check(`the search field states the 2-letter minimum ("${searchHint}")`, () => assert.ok(/2\+ letters/.test(searchHint) && /at least 2 letters/.test(searchHint)));
  // Name search reaches a member in no deck batch.
  await setFilter('#drawer-filter-search', 'Quinn');
  await waitForCard('Quinn Far');
  check('name search calls rpc/search_members with the typed query', () => assert.ok(deckCalls.some((c) => c.path === '/rest/v1/rpc/search_members' && JSON.parse(c.body || '{}').p_query === 'Quinn')));
  const quinnText = await deckPage.evaluate(() => document.querySelector('#swipe-card')?.textContent || '');
  check('a searched card never shows its row city (Leh)', () => assert.ok(!/\bLeh\b/.test(quinnText)));
  const quinnPage = await deckPage.evaluate(() => document.body.innerText);
  check('another member\'s gender is never rendered (Zygender)', () => assert.ok(!/Zygender/.test(quinnPage) && !/Zygender/.test(quinnText)));
  await setFilter('#drawer-filter-search', '');
  check('the paging context never calls rpc/list_members', () => assert.equal(deckCalls.filter((c) => c.path === '/rest/v1/rpc/list_members').length, 0));

  // Post authors come from get_candidates (never my own id); my own post uses my profile.
  const postsPage = await deckContext.newPage();
  postsPage.on('pageerror', (error) => deckErrors.push(String(error)));
  await postsPage.goto(`${BASE}/app.html?view=posts`, { waitUntil: 'domcontentloaded' });
  await postsPage.waitForFunction(() => /Hello from page two/.test(document.querySelector('#community-post-list')?.textContent || ''), null, { timeout: 10000 });
  await postsPage.waitForTimeout(300);
  const postText = await postsPage.locator('#community-post-list').innerText();
  check(`post authors resolved (page-2 member and me) (${postText.replace(/\s+/g, ' ').slice(0, 120)})`, () => {
    assert.match(postText, /member 36/i, 'page-2 author name missing');
    assert.match(postText, /alex me/i, 'own name missing');
  });
  const postImages = await postsPage.evaluate(() => ({
    srcs: [...document.querySelectorAll('#community-post-list img')].map((img) => img.getAttribute('src') || ''),
    missing: document.querySelectorAll('#community-post-list .community-post-image-missing').length,
  }));
  check(`post images load only from Supabase storage; others show a placeholder (${JSON.stringify(postImages)})`, () => {
    assert.ok(postImages.srcs.includes(`${ORIGIN}/storage/v1/object/public/community-posts/${POST_AUTHOR}/a.jpg`), 'storage post image missing');
    assert.ok(!postImages.srcs.some((src) => /tracker\.example/.test(src)), 'a third-party post image auto-loads');
    assert.equal(postImages.missing, 1);
  });
  check('post authors loaded via rpc/get_candidates without my id', () => {
    const authorCalls = deckCalls.filter((c) => c.path === '/rest/v1/rpc/get_candidates').map((c) => JSON.parse(c.body || '{}').p_ids || []);
    assert.ok(authorCalls.some((ids) => ids.includes(POST_AUTHOR)), JSON.stringify(authorCalls));
    authorCalls.forEach((ids) => { assert.ok(!ids.includes(ME)); assert.ok(ids.length <= 50); });
  });
  check('paging context: never /rest/v1/public_profiles, profiles only for my id', () => {
    assert.equal(deckCalls.filter((c) => c.path === '/rest/v1/public_profiles').length, 0);
    deckCalls.filter((c) => c.path === '/rest/v1/profiles').forEach((c) => assert.ok(c.search.includes(`id=eq.${ME}`) && !c.search.includes('neq'), c.search));
  });
  check('paging context: no response body about others carries email/phone keys', () => {
    deckBodies.filter((b) => b.path !== '/rest/v1/profiles' && !b.path.startsWith('/auth/')).forEach((b) => assert.ok(!/"(email|phone|phone_country_code|phone_number)"/.test(b.body), b.path));
  });
  check('paging context: no uncaught page errors', () => assert.deepEqual(deckErrors, []));
  await deckContext.close();

  // 8. Client hardening (Iteration 2, Task 3b) in a fresh context: crafted cover / attachment URLs, the
  // double-click like, Escape during an in-flight failing pitch submit, and a
  // failed profile-photo upload (never a data: URL).
  const HANA = '88888888-8888-4888-8888-000000000001'; // cover_url is plain http -> must not be used
  const IVAN = '88888888-8888-4888-8888-000000000002';
  const JO = '88888888-8888-4888-8888-000000000003';
  const KIT = '88888888-8888-4888-8888-000000000004'; // matched; chat thread carries crafted attachments
  const IVAN_PHOTO = `${ORIGIN}/storage/v1/object/public/profile-photos/${IVAN}/face.jpg`;
  const STALE_PASSWORD = 'hunter2-stale-secret';
  const hardRows = [
    { id: HANA, name: 'Hana Cover', city: 'Pune', experience: 'Climber', skills: ['Climbing'], looking_for: ['Friends'], photo_url: 'https://tracker.example/face.png', cover_url: 'http://evil.example/cover.png', created_at: ago(1000) },
    { id: IVAN, name: 'Ivan Next', city: 'Pune', experience: 'Cook', skills: ['Cooking'], looking_for: ['Friends'], photo_url: IVAN_PHOTO, cover_url: '', created_at: ago(2000) },
    { id: JO, name: 'Jo Third', city: 'Pune', experience: 'Runner', skills: ['Running'], looking_for: ['Friends'], photo_url: '', cover_url: '', created_at: ago(3000) },
    // The deck no longer wraps around (Task 10): two more cards for the later like steps.
    { id: '88888888-8888-4888-8888-000000000005', name: 'Lena Fourth', experience: 'Singer', skills: ['Singing'], looking_for: ['Friends'], photo_url: '', cover_url: '' },
    { id: '88888888-8888-4888-8888-000000000006', name: 'Milo Fifth', experience: 'Sailor', skills: ['Sailing'], looking_for: ['Friends'], photo_url: '', cover_url: '' },
  ].map((row) => ({ ...row, distance_band: 'Pune', shared_interests: [] }));
  const kitRow = { id: KIT, name: 'Kit Chat', city: 'Pune', experience: 'Painter', skills: ['Painting'], looking_for: ['Friends'], photo_url: '', created_at: ago(4000) };
  const kitMessages = [
    { id: 'm1', sender_id: KIT, recipient_id: ME, body: '', created_at: ago(50000), message_type: 'image', attachment_url: 'https://cdn.example/a.png?q="><img src=x onerror="window.__xss=2', attachment_name: 'a.png', attachment_mime: 'image/png', attachment_size: 10 },
    { id: 'm2', sender_id: KIT, recipient_id: ME, body: '', created_at: ago(40000), message_type: 'document', attachment_url: 'javascript:window.__xss=3', attachment_name: 'evil.pdf', attachment_mime: 'application/pdf', attachment_size: 10 },
    { id: 'm3', sender_id: KIT, recipient_id: ME, body: '', created_at: ago(30000), message_type: 'video', attachment_url: 'http://insecure.example/v.mp4', attachment_name: 'v.mp4', attachment_mime: 'video/mp4', attachment_size: 10 },
    { id: 'm4', sender_id: KIT, recipient_id: ME, body: '', created_at: ago(20000), message_type: 'image', attachment_url: null, attachment_path: `${KIT}/ok.png`, attachment_name: 'ok.png', attachment_mime: 'image/png', attachment_size: 10 },
    { id: 'm6', sender_id: KIT, recipient_id: ME, body: '', created_at: ago(9000), message_type: 'gif', attachment_url: 'https://tracker.example/pixel.gif', attachment_path: null, attachment_name: 'track.gif', attachment_mime: 'image/gif', attachment_size: 0 },
    { id: 'm7', sender_id: KIT, recipient_id: ME, body: '', created_at: ago(8000), message_type: 'gif', attachment_url: 'https://media.giphy.com/media/ok/giphy.gif', attachment_path: null, attachment_name: 'good.gif', attachment_mime: 'image/gif', attachment_size: 0 },
    // Legacy row: only a (formerly public) URL, no path -> "Attachment unavailable".
    { id: 'm5', sender_id: KIT, recipient_id: ME, body: '', created_at: ago(10000), message_type: 'image', attachment_url: 'https://cdn.example/legacy.png', attachment_path: null, attachment_name: 'legacy.png', attachment_mime: 'image/png', attachment_size: 10 },
  ];
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const hard = { calls: [], holdInsert: null, failInsert: false, capInsert: false };
  const hardContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await hardContext.addInitScript(([key, value]) => { window.localStorage.setItem(key, value); }, ['sb-stub-auth-token', JSON.stringify(session)]);
  // An older build cached the signup password in the stored profile: it must be scrubbed on load.
  await hardContext.addInitScript(([id, secret]) => {
    if (window.sessionStorage.getItem('stale-seeded')) return;
    window.sessionStorage.setItem('stale-seeded', '1');
    window.localStorage.setItem('brivia-member-profile', JSON.stringify({ id, name: 'Alex Me', loginPassword: secret, password: secret }));
    window.localStorage.setItem('loginPassword', secret);
  }, [ME, STALE_PASSWORD]);
  await hardContext.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathName = url.pathname;
    const postData = request.postData();
    hard.calls.push({ method, path: pathName, search: decodeURIComponent(url.search), body: postData, prefer: request.headers().prefer || '' });
    const json = (status, payload) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload), headers: { 'access-control-allow-origin': '*' } });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (pathName.startsWith('/auth/v1/')) return json(200, pathName.endsWith('/user') ? user : session);
    // Private chat media: createSignedUrl POSTs /object/sign/<bucket>/<path>; the image GET carries ?token=.
    if (pathName.startsWith('/storage/v1/object/sign/message-attachments/')) {
      if (method === 'POST') return json(200, { signedURL: `${pathName.replace('/storage/v1', '')}?token=stubtoken` });
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'access-control-allow-origin': '*' } });
    }
    if (pathName.startsWith('/storage/v1/object/')) return json(400, { statusCode: '400', error: 'Bucket not found', message: 'Bucket not found' });
    if (pathName === '/rest/v1/profiles') return json(200, (request.headers().accept || '').includes('vnd.pgrst.object') ? ownRow : [ownRow]);
    const args = JSON.parse(postData || '{}');
    if (pathName === '/rest/v1/rpc/deck_candidates') return json(200, hardRows);
    if (pathName === '/rest/v1/rpc/deck_status') return json(200, 'caught_up');
    if (pathName === '/rest/v1/rpc/get_candidates') return json(200, [...hardRows, kitRow].filter((row) => (args.p_ids || []).includes(row.id)));
    if (pathName === '/rest/v1/rpc/search_members') return json(200, []);
    if (pathName === '/rest/v1/rpc/my_onboarding_status') return json(200, [{ interests: 2, points: 20, has_cell: true, place_label: 'Pune', completed: true }]);
    if (pathName === '/rest/v1/matches') {
      const filter = url.searchParams.get('or') || '';
      return json(200, filter.includes('and(') && !filter.includes(KIT) ? [] : [{ user1_id: ME, user2_id: KIT }]);
    }
    if (pathName === '/rest/v1/brivia_messages') return json(200, method === 'GET' ? kitMessages : []);
    // The block already exists (e.g. blocked from another device): the insert hits the primary key.
    if (pathName === '/rest/v1/brivia_blocks' && method === 'POST') return json(409, { code: '23505', message: 'duplicate key value violates unique constraint "brivia_blocks_pkey"', details: null, hint: null });
    if (pathName === '/rest/v1/rpc/report_member') return route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } });
    if (pathName === '/rest/v1/rpc/send_signal') {
      if (hard.holdInsert) await hard.holdInsert;
      if (hard.failInsert) return json(500, { code: 'XX000', message: 'stub failure' });
      return json(200, [{ status: 'sent', remaining: 20, resets_at: '2026-10-04T15:00:00+00:00' }]);
    }
    if (pathName === '/rest/v1/rpc/my_signal_quota') return json(200, [{ daily_limit: 30, remaining: 20, resets_at: '2026-10-04T15:00:00+00:00', live_unanswered: 4, live_limit: 100 }]);
    if (pathName === '/rest/v1/connection_requests') {
      if (method === 'POST') return json(403, { code: '42501', message: 'permission denied for table connection_requests' });
      return json(200, []);
    }
    if (pathName.startsWith('/rest/v1/')) return json(200, []);
    return json(200, {});
  });
  await hardContext.route((url) => !url.href.startsWith(BASE) && !url.href.startsWith(ORIGIN), (route) => route.abort());
  await hardContext.routeWebSocket(/stub\.supabase\.local/, (ws) => ws.close());
  const hardPage = await hardContext.newPage();
  const hardErrors = [];
  hardPage.on('pageerror', (error) => hardErrors.push(String(error)));
  await hardPage.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
  const hardCard = () => hardPage.evaluate(() => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() || '');
  await hardPage.waitForFunction(() => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() === 'Hana Cover', null, { timeout: 15000 });
  await hardPage.waitForTimeout(500);
  const trackerRefs = await hardPage.evaluate(() => [...document.querySelectorAll('*')]
    .filter((el) => /tracker\.example/.test(`${el.getAttribute('src') || ''} ${el.getAttribute('style') || ''}`)).map((el) => el.tagName));
  check(`a third-party https photo_url never auto-loads (elements referencing it: ${JSON.stringify(trackerRefs)})`, () => assert.deepEqual(trackerRefs, []));
  const stored = await hardPage.evaluate(() => Object.keys(window.localStorage).map((key) => [key, window.localStorage.getItem(key) || '']));
  check(`no password is kept in localStorage after load (${stored.length} keys)`, () => {
    assert.ok(!stored.some(([, value]) => value.includes(STALE_PASSWORD)), 'a cached password survived');
    assert.ok(!stored.some(([key]) => key === 'loginPassword'), 'the loginPassword key survived');
    assert.ok(!stored.some(([, value]) => /"(loginPassword|password|passwordConfirm)"/.test(value)), 'a password field is cached');
  });
  const rowKeys = await hardPage.evaluate(async () => Object.keys((await import('/supabase.js')).profileToRow({ name: 'X', createdAt: '2001-01-01T00:00:00.000Z' }, 'id-1')));
  check(`profileToRow never sends created_at (keys ${rowKeys.join(',')})`, () => assert.ok(!rowKeys.includes('created_at')));
  const staticProfile = readFileSync(path.join(repoRoot, 'profile.html'), 'utf8');
  check('profile.html shows no password and no copy-password button', () => assert.ok(!/password/i.test(staticProfile)));
  const hardPosts = () => hard.calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/rpc/send_signal');
  const hardSignal = (call) => { const b = JSON.parse(call.body || '{}'); return [b.p_to, b.p_note]; };
  const hardToast = () => hardPage.locator('#app-toast').textContent();
  const hardResetToast = () => hardPage.evaluate(() => { const t = document.querySelector('#app-toast'); if (t) t.textContent = ''; });
  const hardWaitToast = (re) => hardPage.waitForFunction((src) => new RegExp(src).test(document.querySelector('#app-toast')?.textContent || ''), re.source, { timeout: 5000 });

  // 8a. Public-profile cover goes through safeImageUrl: a plain-http cover falls back to the default cover.
  await hardPage.locator('[data-action="full-info"]').click();
  await hardPage.waitForSelector('#public-profile-modal');
  const coverCss = await hardPage.evaluate(() => document.querySelector('#public-profile-modal .public-profile-cover')?.style.backgroundImage || '');
  check(`public-profile cover never uses an unsafe URL (got ${coverCss.slice(0, 80)})`, () => {
    assert.ok(coverCss.startsWith('url('), 'cover not set');
    assert.ok(!/evil\.example|javascript:/i.test(coverCss));
  });
  await hardPage.evaluate(() => document.querySelector('#public-profile-modal [data-public-profile-close]')?.click());
  await hardPage.waitForFunction(() => !document.querySelector('#public-profile-modal'));

  // 8b. Double-clicking Like opens the sheet once and sends nothing until the sheet resolves.
  let hardBefore = hardPosts().length;
  await hardPage.locator('[data-action="like"]').dblclick();
  await hardPage.waitForTimeout(600);
  const sheetOpenAfterDbl = await hardPage.locator('#pitch-modal').isVisible();
  check(`double-click Like: sheet open, no request yet (posts ${hardPosts().length - hardBefore})`, () => {
    assert.equal(sheetOpenAfterDbl, true);
    assert.equal(hardPosts().length - hardBefore, 0);
  });
  await hardResetToast();
  await hardPage.keyboard.press('Escape');
  await hardWaitToast(/Signal sent/);
  await hardPage.waitForTimeout(300);
  let hardResolved = hardPosts().slice(hardBefore);
  check(`double-click Like then Escape = exactly one POST, note null (got ${hardResolved.length})`, () => {
    assert.equal(hardResolved.length, 1);
    assert.deepEqual(hardSignal(hardResolved[0]), [HANA, null]);
  });
  const plainToast = await hardToast();
  check(`plain like toast is "Signal sent" (got "${plainToast}")`, () => assert.equal(plainToast, 'Signal sent'));

  // 8c. Escape while a pitch submit is in flight, and the submit then fails: the like is NOT restored behind
  // the hidden sheet, so moving to the next card sends nothing more.
  await hardPage.waitForFunction(() => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() === 'Ivan Next');
  const ivanImage = await hardPage.evaluate(() => document.querySelector('#swipe-image')?.getAttribute('src') || '');
  check(`a Supabase storage photo_url renders (got ${ivanImage.slice(0, 90)})`, () => assert.equal(ivanImage, IVAN_PHOTO));
  hardBefore = hardPosts().length;
  await hardPage.locator('[data-action="like"]').click();
  await hardPage.waitForSelector('#pitch-modal:not([hidden])');
  await hardPage.waitForTimeout(600);
  let releaseHard;
  hard.holdInsert = new Promise((resolve) => { releaseHard = resolve; });
  hard.failInsert = true;
  await hardPage.locator('#pitch-message').fill('A note for Ivan');
  await hardResetToast();
  await hardPage.locator('.pitch-submit').click();
  await hardPage.waitForTimeout(150);
  await hardPage.keyboard.press('Escape');
  await hardPage.waitForTimeout(150);
  releaseHard(); hard.holdInsert = null;
  await hardWaitToast(/could not be sent/);
  hard.failInsert = false;
  await hardPage.waitForTimeout(300);
  const failedPosts = hardPosts().length - hardBefore;
  const afterFail = { card: await hardCard(), toast: await hardToast() };
  check(`a failed pitch submit brings Ivan back to the front with the retry copy (${JSON.stringify(afterFail)})`, () => {
    assert.equal(afterFail.card, 'Ivan Next');
    assert.equal(afterFail.toast, "Your signal could not be sent. They're back at the front so you can try again.");
  });
  await hardPage.evaluate(() => document.querySelector('[data-action="pass"]').click());
  await hardPage.waitForTimeout(700);
  check(`Escape during a failing submit: one (failed) POST, nothing restored or re-sent later (posts ${failedPosts} then ${hardPosts().length - hardBefore})`, () => {
    assert.equal(failedPosts, 1);
    assert.equal(hardPosts().length - hardBefore, 1);
  });
  const sheetHiddenAfterEsc = await hardPage.locator('#pitch-modal').isHidden();
  check('pitch sheet stays hidden after Escape + failure', () => assert.equal(sheetHiddenAfterEsc, true));
  const noteLimit = await hardPage.locator('#pitch-message').getAttribute('maxlength');
  check(`pitch note is limited to 500 characters (maxlength ${noteLimit})`, () => assert.equal(noteLimit, '500'));

  // 8b2. Two click events reach the Like button while the sheet is opening (Enter/Space pressed twice before
  // focus moves to the note, or a touch ghost click): the second is ignored, so the like is not sent as a
  // plain like and the sheet stays open for the note.
  await hardPage.waitForFunction(() => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim());
  const currentName = await hardCard();
  const doubleRow = [...hardRows, kitRow].find((row) => currentName.startsWith(row.name.split(' ')[0]));
  hardBefore = hardPosts().length;
  await hardPage.evaluate(() => { const like = document.querySelector('[data-action="like"]'); like.click(); like.click(); });
  await hardPage.waitForTimeout(600);
  const sheetOpenAfterDouble = await hardPage.locator('#pitch-modal').isVisible();
  check(`double Like click while opening: sheet open, no request yet (posts ${hardPosts().length - hardBefore})`, () => {
    assert.equal(sheetOpenAfterDouble, true);
    assert.equal(hardPosts().length - hardBefore, 0);
  });
  await hardResetToast();
  await hardPage.keyboard.press('Escape');
  await hardWaitToast(/Signal sent/).catch(() => {}); // the old code had already resolved the like (no toast now)
  await hardPage.waitForTimeout(300);
  hardResolved = hardPosts().slice(hardBefore);
  check(`double Like click then Escape = exactly one POST to ${doubleRow?.name}, note null (got ${hardResolved.length})`, () => {
    assert.equal(hardResolved.length, 1);
    assert.deepEqual(hardSignal(hardResolved[0]), [doubleRow?.id, null]);
  });

  // 8d. Chat attachments: src/href escaped; only https (or same-origin) URLs become links or media.
  await hardPage.evaluate(() => document.querySelector('[data-nav="chat"]')?.click());
  await hardPage.waitForSelector(`[data-chat-id="${KIT}"]`, { timeout: 8000 });
  await hardPage.locator(`[data-chat-id="${KIT}"]`).click();
  await hardPage.waitForSelector('#chat-messages img.message-attachment-image', { timeout: 8000 });
  await hardPage.waitForTimeout(300);
  const attach = await hardPage.evaluate(() => ({
    xss: window.__xss,
    onerror: document.querySelectorAll('#chat-messages [onerror]').length,
    jsHrefs: [...document.querySelectorAll('#chat-messages a')].filter((a) => /^\s*javascript:/i.test(a.getAttribute('href') || '')).length,
    httpMedia: [...document.querySelectorAll('#chat-messages img, #chat-messages video, #chat-messages a')].filter((el) => /^http:/i.test(el.getAttribute('src') || el.getAttribute('href') || '')).length,
    okImg: [...document.querySelectorAll('#chat-messages img')].some((img) => /^https:\/\/stub\.supabase\.local\/storage\/v1\/object\/sign\/message-attachments\/[^?]+\/ok\.png\?token=stubtoken$/.test(img.getAttribute('src') || '')),
    legacyImg: [...document.querySelectorAll('#chat-messages img')].some((img) => /legacy\.png/.test(img.getAttribute('src') || '')),
    legacyText: [...document.querySelectorAll('#chat-messages .message-attachment')].some((el) => /legacy\.png/.test(el.textContent) && /ATTACHMENT UNAVAILABLE/.test(el.textContent)),
    names: document.querySelector('#chat-messages')?.textContent || '',
  }));
  check(`crafted attachment URLs inject nothing and non-https is not linked (${JSON.stringify({ ...attach, names: undefined })})`, () => {
    assert.equal(attach.xss, undefined);
    assert.equal(attach.onerror, 0);
    assert.equal(attach.jsHrefs, 0);
    assert.equal(attach.httpMedia, 0);
    assert.equal(attach.okImg, true, 'a path row renders through its signed URL');
    assert.equal(attach.legacyImg, false, 'a url-only legacy row is not rendered as media');
    assert.equal(attach.legacyText, true, 'a url-only legacy row shows "Attachment unavailable"');
    assert.match(attach.names, /evil\.pdf/, 'an unsafe document still shows its name');
  });

  const signCalls = hard.calls.filter((c) => c.method === 'POST' && c.path.startsWith('/storage/v1/object/sign/message-attachments/'));
  check(`chat media: signed once per path with a 3600 s expiry, cached across renders (${signCalls.length} sign calls)`, () => {
    assert.equal(signCalls.length, 1);
    assert.equal(JSON.parse(signCalls[0].body).expiresIn, 3600);
    assert.equal(decodeURIComponent(signCalls[0].path), `/storage/v1/object/sign/message-attachments/${KIT}/ok.png`);
  });
  const gifState = await hardPage.evaluate(() => ({
    trackerImg: [...document.querySelectorAll('#chat-messages img')].some((i) => /tracker\.example/.test(i.getAttribute('src') || '')),
    trackerLink: [...document.querySelectorAll('#chat-messages a')].find((a) => /tracker\.example/.test(a.getAttribute('href') || ''))?.getAttribute('rel') || null,
    giphyImg: [...document.querySelectorAll('#chat-messages img')].some((i) => /^https:\/\/media\.giphy\.com\//.test(i.getAttribute('src') || '')),
  }));
  check(`external GIF: allowlisted host auto-loads, other host is a noopener link only (${JSON.stringify(gifState)})`, () => {
    assert.equal(gifState.trackerImg, false);
    assert.equal(gifState.trackerLink, 'noopener noreferrer');
    assert.equal(gifState.giphyImg, true);
  });
  check('chat media never uses a public URL', () => assert.equal(hard.calls.filter((c) => c.path.includes('/object/public/message-attachments')).length, 0));

  // 8e. Local attachment preview (blob: URL) renders through an escaped src.
  await hardPage.setInputFiles('#chat-photo-input', { name: 'p.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });
  await hardPage.waitForSelector('#chat-attachment-preview img', { timeout: 5000 });
  const previewSrc = await hardPage.locator('#chat-attachment-preview img').first().getAttribute('src');
  check(`local attachment preview uses a blob: URL (got ${String(previewSrc).slice(0, 20)})`, () => assert.match(previewSrc || '', /^blob:/));
  await hardPage.evaluate(() => document.querySelector('[data-remove-chat-file]')?.click());
  const VIDEO_WARNING = "Videos can include the place they were filmed. Send only if you're comfortable sharing that.";
  const warningState = () => hardPage.evaluate(() => { const n = document.querySelector('#chat-video-warning'); return n ? { text: n.textContent, visible: !n.hidden && n.getBoundingClientRect().height > 0 } : null; });
  const imageWarning = await warningState();
  check(`no video warning without a video (${JSON.stringify(imageWarning)})`, () => assert.equal(imageWarning?.visible, false));
  await hardPage.setInputFiles('#chat-photo-input', { name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not-a-real-video') });
  await hardPage.waitForSelector('#chat-attachment-preview .chat-attachment-chip', { timeout: 5000 });
  const videoWarning = await warningState();
  check(`selecting a video shows the exact warning inline before Send (${JSON.stringify(videoWarning)})`, () => {
    assert.equal(videoWarning?.text, VIDEO_WARNING);
    assert.equal(videoWarning?.visible, true);
  });
  await hardPage.evaluate(() => document.querySelector('[data-remove-chat-file]')?.click());
  const afterRemove = await warningState();
  check('removing the video hides the warning again', () => assert.equal(afterRemove?.visible, false));
  // 8e2. A chat image that cannot be re-encoded is refused inline in the composer: nothing uploaded, nothing sent.
  const chatCallsBefore = hard.calls.length;
  await hardPage.setInputFiles('#chat-photo-input', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not an image') });
  await hardPage.waitForSelector('#chat-attachment-preview .chat-attachment-chip', { timeout: 5000 });
  await hardPage.locator('#chat-form button[type="submit"]').click();
  await hardPage.waitForFunction(() => !document.querySelector('#chat-attachment-error')?.hidden, null, { timeout: 8000 });
  const chatError = await hardPage.evaluate(() => ({ text: document.querySelector('#chat-attachment-error')?.textContent, role: document.querySelector('#chat-attachment-error')?.getAttribute('role'), toast: document.querySelector('#app-toast')?.textContent || '' }));
  const chatUploads = hard.calls.slice(chatCallsBefore).filter((c) => c.method !== 'GET' && (c.path.startsWith('/storage/v1/object/message-attachments') || c.path === '/rest/v1/brivia_messages'));
  check(`unprocessable chat image: inline error, no upload, no message, no toast (${JSON.stringify(chatError)})`, () => {
    assert.equal(chatError.text, "We couldn't process this photo. Try a JPG or PNG.");
    assert.equal(chatError.role, 'alert');
    assert.ok(!/process this photo/.test(chatError.toast));
    assert.equal(chatUploads.length, 0);
  });
  await hardPage.evaluate(() => document.querySelector('[data-remove-chat-file]')?.click());
  // 8e3. Two images, the 2nd unprocessable, plus text: the whole send aborts (no upload, no message row) and the
  // composer keeps its text and files so the member can remove the bad one. A .heic with an empty type is refused too.
  await hardPage.fill('#chat-input', 'hello both');
  await hardPage.setInputFiles('#chat-photo-input', { name: 'good.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });
  await hardPage.setInputFiles('#chat-photo-input', { name: 'shot.heic', mimeType: '', buffer: Buffer.from('heic bytes the browser cannot decode') });
  await hardPage.waitForFunction(() => document.querySelectorAll('#chat-attachment-preview .chat-attachment-chip').length === 2, null, { timeout: 5000 });
  const multiBefore = hard.calls.length;
  await hardPage.locator('#chat-form button[type="submit"]').click();
  await hardPage.waitForFunction(() => !document.querySelector('#chat-attachment-error')?.hidden, null, { timeout: 8000 });
  const multi = await hardPage.evaluate(() => ({ text: document.querySelector('#chat-attachment-error')?.textContent, input: document.querySelector('#chat-input')?.value, chips: document.querySelectorAll('#chat-attachment-preview .chat-attachment-chip').length }));
  const multiWrites = hard.calls.slice(multiBefore).filter((c) => c.method !== 'GET' && (c.path.startsWith('/storage/v1/object/message-attachments') || c.path === '/rest/v1/brivia_messages'));
  check(`2 images, 2nd unprocessable: nothing uploaded or sent, composer intact (${JSON.stringify(multi)})`, () => {
    assert.equal(multi.text, "We couldn't process this photo. Try a JPG or PNG.");
    assert.equal(multi.input, 'hello both');
    assert.equal(multi.chips, 2);
    assert.equal(multiWrites.length, 0);
  });
  await hardPage.evaluate(() => { document.querySelectorAll('[data-remove-chat-file]').forEach((b) => b.click()); });
  await hardPage.fill('#chat-input', '');

  // 8f. A failed profile-photo upload fails visibly and never stores a data: URL.
  await hardPage.evaluate(() => document.querySelector('[data-nav="profile"]')?.click());
  await hardPage.waitForSelector('#profile-photo-editor', { timeout: 8000 });
  await hardPage.locator('#profile-photo-editor').click();
  await hardPage.waitForSelector('#profile-edit-form');
  // 8f0. An unprocessable photo shows the inline error beside the field; nothing is uploaded or written.
  const editCallsBefore = hard.calls.length;
  await hardPage.setInputFiles('#profile-edit-form [name="photoFile"]', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('this is not an image') });
  await hardPage.locator('#profile-edit-form [type="submit"]').click();
  await hardPage.waitForFunction(() => !document.querySelector('#profile-photo-error')?.hidden, null, { timeout: 8000 });
  const editError = await hardPage.evaluate(() => ({ text: document.querySelector('#profile-photo-error')?.textContent, linked: document.querySelector('[name="photoFile"]')?.getAttribute('aria-describedby') }));
  const editWrites = hard.calls.slice(editCallsBefore).filter((c) => c.method !== 'GET' && (c.path.startsWith('/storage/') || c.path === '/rest/v1/profiles'));
  check(`unprocessable profile photo: inline error linked by aria-describedby, nothing uploaded (${JSON.stringify(editError)})`, () => {
    assert.equal(editError.text, "We couldn't process this photo. Try a JPG or PNG.");
    assert.equal(editError.linked, 'profile-photo-error');
    assert.equal(editWrites.length, 0);
  });
  // 8f1. A good photo with an unprocessable cover: both are compressed before either is uploaded, so nothing is stored.
  const coverCallsBefore = hard.calls.length;
  await hardPage.setInputFiles('#profile-edit-form [name="photoFile"]', { name: 'ok.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });
  await hardPage.setInputFiles('#profile-edit-form [name="coverFile"]', { name: 'bad-cover.png', mimeType: 'image/png', buffer: Buffer.from('this is not an image') });
  await hardPage.locator('#profile-edit-form [type="submit"]').click();
  await hardPage.waitForFunction(() => !document.querySelector('#profile-cover-error')?.hidden, null, { timeout: 8000 });
  const coverWrites = hard.calls.slice(coverCallsBefore).filter((c) => c.method !== 'GET' && (c.path.startsWith('/storage/') || c.path === '/rest/v1/profiles'));
  check('bad cover: inline cover error and the good photo was not uploaded either (no orphan)', () => assert.equal(coverWrites.length, 0));
  await hardPage.setInputFiles('#profile-edit-form [name="coverFile"]', []);
  await hardPage.setInputFiles('#profile-edit-form [name="photoFile"]', { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });
  await hardPage.locator('#profile-edit-form [type="submit"]').click();
  // Settles when the editor shows a result, or closes (the old data-URL fallback "succeeded" and closed it).
  await hardPage.waitForFunction(() => { const t = document.querySelector('#profile-edit-feedback')?.textContent || ''; return !document.querySelector('#profile-edit-form') || (t && !/Saving/.test(t)); }, null, { timeout: 8000 });
  const photoFeedback = await hardPage.evaluate(() => document.querySelector('#profile-edit-feedback')?.textContent || '(editor closed)');
  const profileWrites = hard.calls.filter((c) => c.path === '/rest/v1/profiles' && c.method !== 'GET');
  check(`failed photo upload is visible (got "${photoFeedback}")`, () => assert.match(photoFeedback, /photo could not be uploaded/i));
  check(`failed photo upload writes no profile row and no data: URL (${profileWrites.length} writes)`, () => {
    assert.equal(profileWrites.length, 0);
    assert.ok(!profileWrites.some((c) => /data:/.test(c.body || '')));
  });
  // 8f2. Iteration 3, Task 8: profiles.skills is server-owned. The editor shows it read-only, and a save (no photo)
  // still succeeds with a row that carries no skills key.
  const skillsInputs = await hardPage.locator('#profile-edit-form [name="skills"]').count();
  check('profile editor has no editable skills field (server-owned)', () => assert.equal(skillsInputs, 0));
  await hardPage.setInputFiles('#profile-edit-form [name="photoFile"]', []);
  await hardPage.locator('#profile-edit-form [name="name"]').fill('Alex Renamed');
  const writesBeforeSave = hard.calls.length;
  await hardPage.locator('#profile-edit-form [type="submit"]').click();
  await hardPage.waitForFunction(() => !document.querySelector('#profile-edit-form'), null, { timeout: 8000 }).catch(() => {});
  const saveWrites = hard.calls.slice(writesBeforeSave).filter((c) => c.path === '/rest/v1/profiles' && c.method !== 'GET');
  const saveToast = await hardPage.locator('#app-toast').textContent();
  check(`profile save still works without skills (${saveWrites.map((c) => `${c.method} ${Object.keys(JSON.parse(c.body || '{}')).join(',')}`).join(' ; ')}; toast "${saveToast}")`, () => {
    assert.equal(saveWrites.length, 1);
    assert.equal(saveWrites[0].method, 'PATCH');
    const row = JSON.parse(saveWrites[0].body || '{}');
    assert.equal(row.name, 'Alex Renamed');
    assert.ok(!('skills' in row));
    assert.match(saveToast, /Profile updated and saved/);
  });
  // 8g. Blocking someone who is already blocked server-side: insert (never upsert) and 23505 counts as success.
  await hardPage.evaluate(() => document.querySelector('#profile-edit-form [data-profile-edit-close], .profile-edit-close')?.click());
  await hardPage.evaluate(() => document.querySelector('[data-nav="chat"]')?.click());
  await hardPage.waitForSelector(`[data-chat-id="${KIT}"]`, { timeout: 8000 });
  await hardPage.locator(`[data-chat-id="${KIT}"]`).click();
  await hardPage.waitForSelector('#chat-more', { timeout: 8000 });
  hardPage.once('dialog', (dialog) => dialog.accept());
  await hardResetToast();
  await hardPage.evaluate(() => { document.querySelector('#chat-more')?.click(); document.querySelector('#chat-more-menu [data-chat-action="block"]')?.click(); });
  await hardPage.waitForFunction(() => /blocked|Block/.test(document.querySelector('#app-toast')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const blockToast = await hardToast();
  const blockPosts = hard.calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/brivia_blocks');
  check(`block of an already-blocked member succeeds (toast "${blockToast}")`, () => assert.match(blockToast, /Kit Chat is blocked/));
  check(`block uses a plain insert, not an upsert (${JSON.stringify(blockPosts.map((c) => [c.search, c.prefer]))})`, () => {
    assert.equal(blockPosts.length, 1);
    assert.ok(!/on_conflict/.test(blockPosts[0].search) && !/resolution=/.test(blockPosts[0].prefer));
  });
  // 8h. Iteration 4, Task 8 (R4): "Report and block" in the chat ••• menu, after "Block user".
  await hardPage.evaluate(([key]) => window.localStorage.removeItem(key), [`brivia-blocked-users:${ME}`]);
  await hardPage.evaluate((id) => { document.querySelector(`[data-chat-id="${id}"]`)?.click(); }, KIT);
  await hardPage.waitForSelector('#chat-more', { timeout: 8000 });
  await hardPage.evaluate(() => document.querySelector('#chat-more')?.click());
  const chatItems = await hardPage.evaluate(() => [...document.querySelectorAll('#chat-more-menu button')].map((b) => b.textContent.trim()));
  check(`chat menu lists "Report and block" after "Block user" (${JSON.stringify(chatItems)})`, () => {
    assert.ok(chatItems.indexOf('Report and block') > chatItems.indexOf('Block user') && chatItems.indexOf('Block user') >= 0);
  });
  await hardPage.evaluate(() => document.querySelector('#chat-more-menu [data-chat-action="report"]')?.click());
  await hardPage.waitForSelector('dialog.report-dialog[open]', { timeout: 5000 }).catch(() => {});
  await hardPage.locator('dialog.report-dialog input[value="explicit"]').check().catch(() => {});
  await hardPage.locator('dialog.report-dialog textarea').fill('sent a photo').catch(() => {});
  await hardPage.locator('[data-report-submit]').click().catch(() => {});
  await hardPage.waitForFunction(() => document.querySelector('#chat-window')?.hidden === true, null, { timeout: 5000 }).catch(() => {});
  const chatReport = hard.calls.filter((c) => c.path === '/rest/v1/rpc/report_member').map((c) => JSON.parse(c.body || '{}'));
  const chatState = await hardPage.evaluate(([id]) => ({ closed: document.querySelector('#chat-window')?.hidden === true, dialog: Boolean(document.querySelector('dialog.report-dialog[open]')), blocked: Object.entries(window.localStorage).some(([k, v]) => k.startsWith('brivia-blocked-users:') && JSON.parse(v).includes(id)), toast: document.querySelector('#app-toast')?.textContent || '' }), [KIT]);
  check(`chat: Report and block sends the RPC (${JSON.stringify(chatReport)})`, () => assert.deepEqual(chatReport, [{ p_target: KIT, p_reason: 'explicit', p_note: 'sent a photo' }]));
  check(`chat: on success the chat closes and the member is blocked locally (${JSON.stringify(chatState)})`, () => { assert.equal(chatState.closed, true); assert.equal(chatState.dialog, false); assert.equal(chatState.blocked, true); assert.match(chatState.toast, /We've received your report, and you won't see Kit Chat again\./); });
  await hardPage.evaluate(() => { document.querySelector('[data-nav="profile"]')?.click(); });
  await hardPage.evaluate(() => { document.querySelector('#profile-settings-button')?.click(); document.querySelector('[data-profile-setting="block"]')?.click(); });
  await hardPage.waitForSelector('#profile-blocked-modal', { timeout: 5000 }).catch(() => {});
  const blockedNote = await hardPage.evaluate(() => document.querySelector('#profile-blocked-modal')?.textContent || '');
  check('Blocked users says unblocking does not cancel a report', () => assert.match(blockedNote, /Unblocking doesn't cancel a report you've made\./));
  check('hardening context: no uncaught page errors', () => assert.deepEqual(hardErrors, []));
  await hardContext.close();

  // 9. Honest signal quota (Iteration 3, Task 9, D-026/D-032) in a fresh context with a 24-member deck. The quota is
  // the server's (my_signal_quota / send_signal); nothing about it is kept in localStorage.
  const quotaMember = (i) => ({ id: `99999999-9999-4999-8999-${String(i).padStart(12, '0')}`, name: `Quota ${i}`, experience: 'Member', skills: ['Badminton'], looking_for: ['Friends'], photo_url: '', cover_url: '', distance_band: '~3 km', shared_interests: ['Badminton'], created_at: ago(10000 + i * 1000) });
  const quotaDeck = Array.from({ length: 28 }, (_, k) => quotaMember(k + 1));
  const RESETS_AT = '2026-10-04T15:00:00+00:00';
  const q = { remaining: 30, resetsAt: null, race: false, fail: false, limitedUnknown: false, calls: [], passed: new Set(), signalled: new Set() };
  const quotaContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await quotaContext.addInitScript(([key, value]) => { window.localStorage.setItem(key, value); }, ['sb-stub-auth-token', JSON.stringify(session)]);
  await quotaContext.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathName = url.pathname;
    const postData = request.postData();
    q.calls.push({ method, path: pathName, body: postData });
    const json = (status, payload) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload), headers: { 'access-control-allow-origin': '*' } });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (pathName.startsWith('/auth/v1/')) return json(200, pathName.endsWith('/user') ? user : session);
    if (pathName === '/rest/v1/profiles') return json(200, (request.headers().accept || '').includes('vnd.pgrst.object') ? ownRow : [ownRow]);
    const args = JSON.parse(postData || '{}');
    if (pathName === '/rest/v1/rpc/deck_candidates') return json(200, quotaDeck.filter((row) => !q.passed.has(row.id) && !q.signalled.has(row.id)).slice(0, args.p_limit || 12));
    if (pathName === '/rest/v1/rpc/my_onboarding_status') return json(200, [{ interests: 2, points: 20, has_cell: true, place_label: 'Pune', completed: true }]);
    if (pathName === '/rest/v1/rpc/my_signal_quota') return json(200, [{ daily_limit: 30, remaining: q.remaining, resets_at: q.resetsAt, live_unanswered: 0, live_limit: 100 }]);
    if (pathName === '/rest/v1/rpc/send_signal') {
      if (q.fail) return json(500, { code: 'XX000', message: 'stub failure', details: null, hint: null });
      // A 429 without a known cap message (e.g. a gateway limit): the client refreshes the quota and keeps the card.
      if (q.limitedUnknown) return json(429, { code: 'PT429', message: 'too many requests', details: null, hint: null });
      if (q.race) {
        // Another tab used the last signals: the server refuses (not charged) and the quota now reads 0.
        q.remaining = 0; q.resetsAt = RESETS_AT;
        return json(429, { code: 'PT429', message: 'signal_quota_exhausted', details: null, hint: null });
      }
      q.remaining = Math.max(0, q.remaining - 1); q.resetsAt = RESETS_AT; q.signalled.add(args.p_to);
      return json(200, [{ status: 'sent', remaining: q.remaining, resets_at: q.resetsAt }]);
    }
    if (pathName === '/rest/v1/interaction' && method === 'POST') { q.passed.add(args.target_id); return route.fulfill({ status: 201, body: '', headers: { 'access-control-allow-origin': '*' } }); }
    if (pathName.startsWith('/rest/v1/')) return json(200, []);
    return json(200, {});
  });
  await quotaContext.route((url) => !url.href.startsWith(BASE) && !url.href.startsWith(ORIGIN), (route) => route.abort());
  await quotaContext.routeWebSocket(/stub\.supabase\.local/, (ws) => ws.close());
  const quotaPage = await quotaContext.newPage();
  const quotaErrors = [];
  quotaPage.on('pageerror', (error) => quotaErrors.push(String(error)));
  await quotaPage.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
  const qCard = () => quotaPage.evaluate(() => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() || '');
  const qCounter = () => quotaPage.evaluate(() => document.querySelector('#swipe-left-count')?.textContent?.trim() || '');
  const qWaitCounter = (text) => quotaPage.waitForFunction((t) => document.querySelector('#swipe-left-count')?.textContent?.trim() === t, text, { timeout: 6000 }).catch(() => {});
  const qWaitToast = (re) => quotaPage.waitForFunction((src) => new RegExp(src).test(document.querySelector('#app-toast')?.textContent || ''), re.source, { timeout: 6000 }).catch(() => {});
  const qSignals = () => q.calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/rpc/send_signal');
  const qQuotaReads = () => q.calls.filter((c) => c.path === '/rest/v1/rpc/my_signal_quota');
  await quotaPage.waitForFunction(() => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim(), null, { timeout: 15000 });
  await qWaitCounter('30 signals left today');
  const firstCounter = await qCounter();
  check(`quota counter reads "30 signals left today" from my_signal_quota (got "${firstCounter}")`, () => {
    assert.equal(firstCounter, '30 signals left today');
    assert.ok(qQuotaReads().length >= 1, 'my_signal_quota was not read at boot');
  });
  const resetLabel = await quotaPage.evaluate((iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), RESETS_AT);
  // One like resolves: the counter drops to 29 (the stub decrements) and the quota is read again.
  const readsBefore = qQuotaReads().length;
  await quotaPage.locator('[data-action="like"]').click();
  await quotaPage.waitForSelector('#pitch-modal:not([hidden])');
  await quotaPage.waitForTimeout(500);
  await quotaPage.keyboard.press('Escape');
  await qWaitToast(/Signal sent/);
  await qWaitCounter('29 signals left today');
  const afterOne = await qCounter();
  if (SHOTS) await quotaPage.screenshot({ path: path.join(SHOTS, 'quota-1280-counter.png') });
  check(`after one like the counter reads "29 signals left today" (got "${afterOne}")`, () => assert.equal(afterOne, '29 signals left today'));
  check('my_signal_quota is read again after send_signal', () => assert.ok(qQuotaReads().length > readsBefore));
  // F1: a failed signal never loses the person. A 500, then a 429 without a cap message: the card comes back to the
  // front each time, with the retry copy; the unknown 429 also reads the quota again.
  const likeAndEscape = async () => {
    await quotaPage.locator('[data-action="like"]').click();
    await quotaPage.waitForSelector('#pitch-modal:not([hidden])');
    await quotaPage.waitForTimeout(500);
    const advanced = await qCard();
    await quotaPage.evaluate(() => { const t = document.querySelector('#app-toast'); if (t) t.textContent = ''; });
    await quotaPage.keyboard.press('Escape');
    return advanced;
  };
  await quotaPage.waitForTimeout(400);
  for (const [flag, label] of [['fail', 'HTTP 500'], ['limitedUnknown', 'a 429 without a cap message']]) {
    const failCard = await qCard();
    const readsAt = qQuotaReads().length;
    q[flag] = true;
    const advancedPast = await likeAndEscape();
    await qWaitToast(/could not be sent/);
    await quotaPage.waitForFunction((n) => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() === n, failCard, { timeout: 4000 }).catch(() => {});
    await quotaPage.waitForTimeout(300);
    q[flag] = false;
    const failState = { card: await qCard(), toast: await quotaPage.locator('#app-toast').textContent() };
    check(`${label} from send_signal brings the card back to the front (${failCard} -> ${advancedPast} -> ${failState.card})`, () => {
      assert.notEqual(advancedPast, failCard);
      assert.equal(failState.card, failCard);
      assert.equal(failState.toast, "Your signal could not be sent. They're back at the front so you can try again.");
    });
    if (flag === 'limitedUnknown') check('a 429 without a cap message reads my_signal_quota again', () => assert.ok(qQuotaReads().length > readsAt));
  }
  // A PT429 race (the cached quota said 29): the card comes back to the front, the honest toast shows, and the
  // counter refreshes to "0 signals left · more at HH:MM".
  await quotaPage.waitForTimeout(400);
  const raceCard = await qCard();
  q.race = true;
  await quotaPage.locator('[data-action="like"]').click();
  await quotaPage.waitForSelector('#pitch-modal:not([hidden])');
  await quotaPage.waitForTimeout(500);
  const advancedTo = await qCard();
  await quotaPage.keyboard.press('Escape');
  await qWaitToast(/today's signals/);
  await quotaPage.waitForFunction((n) => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() === n, raceCard, { timeout: 4000 }).catch(() => {});
  await quotaPage.waitForTimeout(400);
  const raceState = { card: await qCard(), toast: await quotaPage.locator('#app-toast').textContent(), counter: await qCounter() };
  check(`PT429 signal_quota_exhausted puts the card back at the front (${raceCard} -> ${advancedTo} -> ${raceState.card})`, () => {
    assert.notEqual(advancedTo, raceCard, 'the like did not advance the deck');
    assert.equal(raceState.card, raceCard);
  });
  check(`PT429 shows the honest toast and refreshes the counter (${JSON.stringify(raceState)})`, () => {
    assert.equal(raceState.toast, `You've used today's signals. More at ${resetLabel}.`);
    assert.equal(raceState.counter, `0 signals left · more at ${resetLabel}`);
  });
  q.race = false;
  // At 0: Like keeps the same card, opens no pitch, sends nothing, and the honest state shows.
  const zeroBefore = qSignals().length;
  await quotaPage.evaluate(() => { const t = document.querySelector('#app-toast'); if (t) t.textContent = ''; });
  // A tap on the aria-disabled button (Playwright's click() refuses aria-disabled elements by design).
  await quotaPage.evaluate(() => document.querySelector('[data-action="like"]').click());
  await quotaPage.waitForTimeout(700);
  const zeroState = await quotaPage.evaluate(() => ({
    card: document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() || '',
    pitchOpen: !document.querySelector('#pitch-modal')?.hidden,
    limitVisible: !document.querySelector('#swipe-limit-state')?.hidden,
    limitText: document.querySelector('#swipe-limit-state')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    toast: document.querySelector('#app-toast')?.textContent || '',
    ariaDisabled: document.querySelector('[data-action="like"]')?.getAttribute('aria-disabled'),
  }));
  if (SHOTS) await quotaPage.screenshot({ path: path.join(SHOTS, 'quota-1280-zero.png') });
  check(`at 0 a Like keeps the same card and opens no pitch (${JSON.stringify(zeroState)})`, () => {
    assert.equal(zeroState.card, raceCard);
    assert.equal(zeroState.pitchOpen, false);
  });
  check('at 0 a Like makes no send_signal call', () => assert.equal(qSignals().length, zeroBefore));
  check(`at 0 the notice reads "No signals left today. More at HH:MM · Passing is always free." and Pitch is aria-disabled (${JSON.stringify(zeroState)})`, () => {
    assert.equal(zeroState.limitVisible, true);
    assert.match(zeroState.limitText, new RegExp(`No signals left today\\. More at ${resetLabel} · Passing is always free\\.`));
    assert.match(zeroState.toast, /More at/);
    assert.equal(zeroState.ariaDisabled, 'true');
  });
  // 20 passes: free, no send_signal call, and no swipe counter in localStorage.
  const passBefore = qSignals().length;
  for (let i = 0; i < 20; i += 1) {
    const name = await qCard();
    if (!name) break;
    await quotaPage.locator('[data-action="pass"]').click();
    await quotaPage.waitForFunction((n) => (document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() || '') !== n, name, { timeout: 4000 }).catch(() => {});
  }
  await quotaPage.waitForTimeout(300);
  const swipeKeys = await quotaPage.evaluate(() => Object.keys(window.localStorage).filter((key) => /brivia-daily-swipes|swipe|quota|signal/i.test(key)));
  check(`20 passes keep no swipe/quota key in localStorage (${JSON.stringify(swipeKeys)})`, () => assert.deepEqual(swipeKeys, []));
  check(`20 passes make no send_signal call (${qSignals().length - passBefore})`, () => assert.equal(qSignals().length - passBefore, 0));
  // F4: a cached cap clears. The server quota is back (stub at 30): Like re-reads it, and the pitch opens.
  q.remaining = 30; q.resetsAt = null;
  await quotaPage.evaluate(() => document.querySelector('[data-action="like"]').click());
  const reopened = await quotaPage.waitForSelector('#pitch-modal:not([hidden])', { timeout: 4000 }).then(() => true, () => false);
  const afterClear = await quotaPage.evaluate(() => ({ ariaDisabled: document.querySelector('[data-action="like"]')?.getAttribute('aria-disabled'), notice: !document.querySelector('#swipe-limit-state')?.hidden }));
  check(`a cached cap clears when my_signal_quota says signals are back: the pitch opens (${JSON.stringify(afterClear)})`, () => {
    assert.equal(reopened, true);
    assert.equal(afterClear.ariaDisabled, null);
    assert.equal(afterClear.notice, false);
  });
  await quotaPage.waitForTimeout(450);
  await quotaPage.keyboard.press('Escape');
  await qWaitToast(/Signal sent/);
  // F4: the quota is read again when the tab becomes visible.
  q.remaining = 0; q.resetsAt = RESETS_AT;
  await quotaPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const capShown = await quotaPage.waitForFunction(() => !document.querySelector('#swipe-limit-state')?.hidden, null, { timeout: 4000 }).then(() => true, () => false);
  q.remaining = 30; q.resetsAt = null;
  await quotaPage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const capCleared = await quotaPage.waitForFunction(() => document.querySelector('#swipe-limit-state')?.hidden, null, { timeout: 4000 }).then(() => true, () => false);
  check(`visibilitychange re-reads the quota: the cap shows, then clears (${capShown}, ${capCleared})`, () => { assert.equal(capShown, true); assert.equal(capCleared, true); });
  // F5: Pass then Like within 100 ms: exactly one pass and no signal for that person.
  await quotaPage.waitForTimeout(400);
  const doubleName = await qCard();
  const doubleId = quotaDeck.find((row) => row.name === doubleName)?.id;
  const passCalls = () => q.calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/interaction').map((c) => JSON.parse(c.body || '{}'));
  const passesBefore = passCalls().length;
  const signalsBefore = qSignals().length;
  await quotaPage.evaluate(() => { document.querySelector('[data-action="pass"]').click(); window.setTimeout(() => document.querySelector('[data-action="like"]').click(), 50); });
  await quotaPage.waitForTimeout(900);
  const doubleState = {
    passes: passCalls().slice(passesBefore).map((b) => b.target_id === doubleId),
    signals: qSignals().slice(signalsBefore).map((c) => JSON.parse(c.body || '{}').p_to),
    pitchOpen: await quotaPage.evaluate(() => !document.querySelector('#pitch-modal')?.hidden),
  };
  check(`Pass then Like within 100 ms: one pass for ${doubleName}, no signal, no pitch (${JSON.stringify(doubleState)})`, () => {
    assert.deepEqual(doubleState.passes, [true]);
    assert.ok(!doubleState.signals.includes(doubleId));
    assert.equal(doubleState.pitchOpen, false);
  });
  check('quota context: never POSTs /rest/v1/connection_requests', () => assert.equal(q.calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/connection_requests').length, 0));
  check('quota context: no uncaught page errors', () => assert.deepEqual(quotaErrors, []));
  await quotaContext.close();

  // 10. Iteration 4, Task 9 (R2 withdraw, R5 client): PRIVACY & ACCOUNT in the profile settings menu. Own context per
  // sign-in method so the stub can answer as a password member or a Google-only member.
  const makePrivacyContext = async (provider, label) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const pUser = { ...user, app_metadata: { provider, providers: [provider] } };
    const pSession = { ...session, user: pUser };
    await ctx.addInitScript(([key, value]) => { window.localStorage.setItem(key, value); }, ['sb-stub-auth-token', JSON.stringify(pSession)]);
    const st = {
      consentAt: '2026-10-05T10:00:00+00:00', calls: [], files: { 'profile-photos': ['p1.jpg'], 'profile-covers': [], 'message-attachments': Array.from({ length: 230 }, (_, i) => `m${String(i).padStart(3, '0')}.png`), 'community-posts': ['c1.jpg'] },
      failDeleteAt: 0, deleteCount: 0, rpcMode: [], rpcCalls: [], holdList: null, tokenCalls: 0, listsServed: 0,
    };
    await ctx.route(`${BASE}/privacy.html**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>privacy stub</title><p>stub</p>' }));
    await ctx.route(`${ORIGIN}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const pathName = url.pathname;
      const postData = request.postData();
      st.calls.push({ method, path: pathName, search: decodeURIComponent(url.search), body: postData });
      const json = (status, payload) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload), headers: { 'access-control-allow-origin': '*' } });
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (pathName === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') { st.tokenCalls += 1; st.reauthed = true; return json(200, pSession); }
      if (pathName === '/auth/v1/authorize') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>oauth stub</title>' });
      if (pathName.startsWith('/auth/v1/')) return json(200, pathName.endsWith('/user') ? pUser : pSession);
      const listMatch = pathName.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
      if (listMatch && method === 'POST') {
        if (st.holdList) await st.holdList;
        const body = JSON.parse(postData || '{}');
        st.listsServed += 1;
        const names = st.files[listMatch[1]] || [];
        return json(200, names.slice(body.offset || 0, (body.offset || 0) + (body.limit || 100)).map((name) => ({ name, id: `id-${name}`, metadata: {} })));
      }
      const delMatch = pathName.match(/^\/storage\/v1\/object\/([^/]+)$/);
      if (delMatch && method === 'DELETE') {
        st.deleteCount += 1;
        if (st.failDeleteAt && st.deleteCount === st.failDeleteAt) return json(500, { statusCode: '500', error: 'Internal', message: 'storage unavailable' });
        const { prefixes = [] } = JSON.parse(postData || '{}');
        st.files[delMatch[1]] = (st.files[delMatch[1]] || []).filter((n) => !prefixes.includes(`${ME}/${n}`));
        return json(200, prefixes.map((name) => ({ name })));
      }
      if (pathName === '/rest/v1/profiles') { const row = { ...ownRow, sensitive_consent_at: st.consentAt }; return json(200, (request.headers().accept || '').includes('vnd.pgrst.object') ? row : [row]); }
      if (pathName === '/rest/v1/rpc/set_sensitive_consent') { st.consentAt = JSON.parse(postData || '{}').p_consent ? new Date().toISOString() : null; return route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } }); }
      if (pathName === '/rest/v1/rpc/delete_my_account') {
        st.rpcCalls.push(JSON.parse(postData || '{}'));
        const mode = st.rpcMode.shift() || 'ok';
        if (mode === 'reauth' && !st.reauthed) return json(400, { code: 'P0001', message: 'reauth_required', details: null, hint: null });
        if (mode === 'boom') return json(500, { code: 'XX000', message: 'boom' });
        return route.fulfill({ status: 204, body: '', headers: { 'access-control-allow-origin': '*' } });
      }
      if (pathName === '/rest/v1/rpc/deck_candidates') return json(200, []);
      if (pathName === '/rest/v1/rpc/deck_status') return json(200, 'caught_up');
      if (pathName === '/rest/v1/rpc/get_candidates' || pathName === '/rest/v1/rpc/search_members') return json(200, []);
      if (pathName === '/rest/v1/rpc/my_onboarding_status') return json(200, [{ interests: 2, points: 20, has_cell: true, place_label: 'Pune', completed: true }]);
      if (pathName === '/rest/v1/rpc/my_signal_quota') return json(200, [{ daily_limit: 30, remaining: 30, resets_at: null, live_unanswered: 0, live_limit: 100 }]);
      if (pathName.startsWith('/rest/v1/')) return json(200, []);
      return json(200, {});
    });
    await ctx.route((url) => !url.href.startsWith(BASE) && !url.href.startsWith(ORIGIN), (route) => route.abort());
    await ctx.routeWebSocket(/stub\.supabase\.local/, (ws) => ws.close());
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-nav="profile"]', { state: 'attached', timeout: 15000 });
    await page.waitForFunction(() => !document.body.classList.contains('app-auth-pending'), null, { timeout: 15000 });
    await page.evaluate(() => document.querySelector('[data-nav="profile"]')?.click());
    await page.waitForSelector('#profile-settings-button', { timeout: 8000 });
    return { ctx, page, st, errors, label };
  };
  const openSettingsItem = async (page, name) => {
    await page.locator('#profile-settings-button').click();
    await page.locator(`[data-profile-setting="${name}"]`).click();
  };
  const activeInside = (page, sel) => page.evaluate((s) => Boolean(document.querySelector(s)?.contains(document.activeElement)), sel);

  const pw = await makePrivacyContext('email', 'password member');
  const pwItems = await pw.page.evaluate(() => { document.querySelector('#profile-settings-button').click(); return [...document.querySelectorAll('#profile-settings-menu button')].map((b) => ({ text: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height) })); });
  check(`profile settings menu has PRIVACY & ACCOUNT (${JSON.stringify(pwItems.map((i) => i.text))})`, () => { assert.ok(pwItems.some((i) => i.text === 'PRIVACY & ACCOUNT')); assert.ok(pwItems.every((i) => i.h >= 44), 'menu targets under 44 px'); });
  await pw.page.locator('[data-profile-setting="privacy"]').click();
  await pw.page.waitForSelector('dialog.privacy-dialog[data-privacy="account"][open]', { timeout: 5000 }).catch(() => {});
  const acct = await pw.page.evaluate(() => {
    const d = document.querySelector('dialog[data-privacy="account"]');
    return d ? {
      status: d.querySelector('[data-privacy-status]')?.textContent.trim(), withdraw: Boolean(d.querySelector('[data-privacy-withdraw]')), del: d.querySelector('[data-privacy-delete]')?.textContent.trim(),
      links: [...d.querySelectorAll('a')].map((a) => a.getAttribute('href')), noHScroll: d.scrollWidth <= d.clientWidth, docNoHScroll: document.documentElement.scrollWidth <= window.innerWidth,
      small: [...d.querySelectorAll('button, a')].filter((b) => !b.closest('[hidden]') && !b.hidden && b.getBoundingClientRect().height < 43.5).map((b) => b.textContent.trim()),
      fonts: [...d.querySelectorAll('p, small, li, label, a, button, span')].filter((e) => e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.textContent.trim().slice(0, 20)),
    } : null;
  });
  check(`account section: consent status, withdraw, links, delete (${JSON.stringify(acct)})`, () => {
    assert.ok(acct);
    assert.match(acct.status, /consent given on 5 October 2026/);
    assert.equal(acct.withdraw, true);
    assert.equal(acct.del, 'Delete my account');
    assert.ok(acct.links.includes('/privacy.html') && acct.links.includes('mailto:thebrivia.club@gmail.com'));
    assert.ok(acct.noHScroll && acct.docNoHScroll, 'horizontal scroll at 375 px');
    assert.deepEqual(acct.small, []);
    assert.deepEqual(acct.fonts, []);
  });
  await pw.page.keyboard.press('Escape');
  await pw.page.waitForFunction(() => !document.querySelector('dialog[data-privacy="account"]'), null, { timeout: 3000 }).catch(() => {});
  const escClosed = await pw.page.evaluate(() => !document.querySelector('dialog[data-privacy="account"]'));
  const escFocus = await pw.page.evaluate(() => document.activeElement?.id);
  check(`Escape closes the account dialog and focus returns to the settings button (${escClosed}, ${escFocus})`, () => { assert.equal(escClosed, true); assert.equal(escFocus, 'profile-settings-button'); });

  // R2 withdraw: Keep sends nothing; Withdraw and delete calls set_sensitive_consent(false), the member stays in the app.
  await openSettingsItem(pw.page, 'privacy');
  await pw.page.waitForSelector('dialog[data-privacy="account"][open]');
  await pw.page.locator('[data-privacy-withdraw]').click();
  await pw.page.waitForSelector('dialog[data-privacy="withdraw"][open]', { timeout: 5000 }).catch(() => {});
  const wd = await pw.page.evaluate(() => { const d = document.querySelector('dialog[data-privacy="withdraw"]'); return d ? { text: d.textContent.replace(/\s+/g, ' '), buttons: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()) } : null; });
  check(`withdraw dialog uses the R2 copy and buttons (${JSON.stringify(wd)})`, () => {
    assert.ok(wd);
    assert.ok(wd.text.includes("Withdraw consent? We'll delete your private interests now and spread their points across your other interests. You can add them again later."));
    assert.ok(wd.buttons.includes('Withdraw and delete') && wd.buttons.includes('Keep'));
  });
  const trapOk = [];
  for (let i = 0; i < 6; i += 1) { await pw.page.keyboard.press('Tab'); trapOk.push(await activeInside(pw.page, 'dialog[data-privacy="withdraw"]')); }
  await pw.page.keyboard.press('Shift+Tab');
  trapOk.push(await activeInside(pw.page, 'dialog[data-privacy="withdraw"]'));
  check(`withdraw dialog traps focus (${trapOk})`, () => assert.ok(trapOk.every(Boolean)));
  await pw.page.locator('[data-privacy-keep]').click();
  await pw.page.waitForFunction(() => !document.querySelector('dialog[data-privacy="withdraw"]'), null, { timeout: 3000 }).catch(() => {});
  const afterKeep = await pw.page.evaluate(() => ({ withdrawOpen: Boolean(document.querySelector('dialog[data-privacy="withdraw"]')), focusIsWithdraw: document.activeElement?.hasAttribute('data-privacy-withdraw') }));
  check(`Keep closes the dialog, returns focus, and sends nothing (${JSON.stringify(afterKeep)})`, () => {
    assert.equal(afterKeep.withdrawOpen, false); assert.equal(afterKeep.focusIsWithdraw, true);
    assert.equal(pw.st.calls.filter((c) => c.path === '/rest/v1/rpc/set_sensitive_consent').length, 0);
  });
  await pw.page.locator('[data-privacy-withdraw]').click();
  await pw.page.waitForSelector('dialog[data-privacy="withdraw"][open]');
  await pw.page.locator('[data-privacy-confirm-withdraw]').click();
  await pw.page.waitForFunction(() => /consent not given/.test(document.querySelector('[data-privacy-status]')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const afterWd = await pw.page.evaluate(() => ({ status: document.querySelector('[data-privacy-status]')?.textContent.trim(), withdrawBtn: Boolean(document.querySelector('[data-privacy-withdraw]:not([hidden])')), url: location.pathname, wdOpen: Boolean(document.querySelector('dialog[data-privacy="withdraw"]')) }));
  const wdCalls = pw.st.calls.filter((c) => c.path === '/rest/v1/rpc/set_sensitive_consent').map((c) => JSON.parse(c.body || '{}'));
  check(`withdraw calls set_sensitive_consent {p_consent:false}, the member stays in the app and the status updates (${JSON.stringify([wdCalls, afterWd])})`, () => {
    assert.deepEqual(wdCalls, [{ p_consent: false }]);
    assert.equal(afterWd.url, '/app.html'); assert.equal(afterWd.wdOpen, false);
    assert.match(afterWd.status, /consent not given/); assert.equal(afterWd.withdrawBtn, false);
  });

  // R5 delete dialog.
  await pw.page.locator('[data-privacy-delete]').click();
  await pw.page.waitForSelector('dialog[data-privacy="delete"][open]', { timeout: 5000 }).catch(() => {});
  const dd = await pw.page.evaluate(() => {
    const d = document.querySelector('dialog[data-privacy="delete"]');
    if (!d) return null;
    const input = d.querySelector('#privacy-delete-confirm');
    const btn = d.querySelector('[data-privacy-confirm-delete]');
    return { text: d.textContent.replace(/\s+/g, ' '), label: d.querySelector('label[for="privacy-delete-confirm"]')?.textContent.trim(), hasInput: Boolean(input), aria: btn?.getAttribute('aria-disabled'), alert: d.querySelector('[data-privacy-error]')?.getAttribute('role'), noH: d.scrollWidth <= d.clientWidth };
  });
  check(`delete dialog lists what is deleted and what remains, labelled input, aria-disabled button (${JSON.stringify({ ...dd, text: dd?.text.slice(0, 80) })})`, () => {
    assert.ok(dd && dd.hasInput);
    assert.equal(dd.label, 'Type DELETE to confirm');
    assert.equal(dd.aria, 'true'); assert.equal(dd.alert, 'alert'); assert.ok(dd.noH);
    for (const re of [/Your messages, which disappear from other people's chats too/, /can't be undone/i, /Reports you made are kept for up to a year/, /Reports about you/, /consent and this deletion is kept for 1 year/, /Files other people sent you stay in their own folders/, /backups/, /about an hour/, /Other devices/]) assert.match(dd.text, re);
  });
  const trap2 = [];
  for (let i = 0; i < 8; i += 1) { await pw.page.keyboard.press('Tab'); trap2.push(await activeInside(pw.page, 'dialog[data-privacy="delete"]')); }
  check(`delete dialog traps focus (${trap2})`, () => assert.ok(trap2.every(Boolean)));
  const listsBefore = pw.st.listsServed;
  await pw.page.locator('#privacy-delete-confirm').fill('nope');
  await pw.page.locator('[data-privacy-confirm-delete]').click({ force: true });
  await pw.page.waitForTimeout(200);
  const gate1 = await pw.page.evaluate(() => document.querySelector('[data-privacy-confirm-delete]').getAttribute('aria-disabled'));
  check(`a wrong word keeps the delete button aria-disabled and does nothing (${gate1}, lists ${pw.st.listsServed - listsBefore})`, () => { assert.equal(gate1, 'true'); assert.equal(pw.st.listsServed, listsBefore); assert.equal(pw.st.rpcCalls.length, 0); });
  await pw.page.locator('#privacy-delete-confirm').fill('  delete ');
  const gate2 = await pw.page.evaluate(() => document.querySelector('[data-privacy-confirm-delete]').getAttribute('aria-disabled'));
  check(`"  delete " (trim, upper-case) enables the button (${gate2})`, () => assert.notEqual(gate2, 'true'));
  // Escape is ignored while a request is in flight.
  let release; pw.st.holdList = new Promise((resolve) => { release = resolve; });
  pw.st.failDeleteAt = 3; // the 3rd Storage remove fails (1st: photos, 2nd: first attachment batch): mid-way
  await pw.page.locator('[data-privacy-confirm-delete]').click();
  await pw.page.waitForTimeout(300);
  await pw.page.keyboard.press('Escape');
  const busyOpen = await pw.page.evaluate(() => Boolean(document.querySelector('dialog[data-privacy="delete"][open]')));
  check(`Escape does nothing while the request is in flight (${busyOpen})`, () => assert.equal(busyOpen, true));
  pw.st.holdList = null; release();
  await pw.page.waitForFunction(() => (document.querySelector('[data-privacy-error]')?.textContent || '').length > 0, null, { timeout: 10000 }).catch(() => {});
  const storageFail = await pw.page.evaluate(() => ({ text: document.querySelector('[data-privacy-error]')?.textContent.trim(), role: document.querySelector('[data-privacy-error]')?.getAttribute('role') }));
  check(`mid-way storage failure shows the storage copy, deletes nothing else (${JSON.stringify(storageFail)}; rpc calls ${pw.st.rpcCalls.length})`, () => {
    assert.match(storageFail.text, /^We removed some of your files but couldn't finish\. Nothing else was deleted\. Try again\./);
    assert.match(storageFail.text, /thebrivia\.club@gmail\.com/);
    assert.equal(pw.st.rpcCalls.length, 0);
    assert.ok(pw.st.files['message-attachments'].length > 0 && pw.st.files['message-attachments'].length < 230, `left ${pw.st.files['message-attachments'].length}`);
    assert.ok(pw.st.calls.filter((c) => c.method === 'DELETE').every((c) => (JSON.parse(c.body || '{}').prefixes || []).length <= 100));
  });
  check('a failed deletion never signs out', () => assert.equal(pw.st.calls.filter((c) => c.path === '/auth/v1/logout').length, 0));
  // Retry: storage finishes, then the RPC fails once (rpc copy), then needs a recent sign-in (password), then succeeds.
  pw.st.failDeleteAt = 0; pw.st.rpcMode = ['boom', 'reauth'];
  await pw.page.locator('[data-privacy-confirm-delete]').click();
  await pw.page.waitForFunction(() => /account still exists/.test(document.querySelector('[data-privacy-error]')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  const rpcFail = await pw.page.evaluate(() => document.querySelector('[data-privacy-error]')?.textContent.trim());
  check(`rpc failure after storage shows the rpc copy (${rpcFail})`, () => {
    assert.equal(rpcFail, 'Your photos and files are gone, but your account still exists. Try again to finish, or email thebrivia.club@gmail.com.');
    assert.deepEqual(Object.values(pw.st.files).map((f) => f.length), [0, 0, 0, 0]);
  });
  await pw.page.locator('[data-privacy-confirm-delete]').click();
  await pw.page.waitForSelector('#privacy-delete-password', { timeout: 10000 }).catch(() => {});
  const reauthUi = await pw.page.evaluate(() => ({ label: document.querySelector('label[for="privacy-delete-password"]')?.textContent.trim(), type: document.querySelector('#privacy-delete-password')?.type, google: Boolean(document.querySelector('[data-privacy-google]:not([hidden])')), url: location.pathname }));
  check(`reauth_required asks a password member for their password (${JSON.stringify(reauthUi)})`, () => { assert.equal(reauthUi.label, 'Confirm your password'); assert.equal(reauthUi.type, 'password'); assert.equal(reauthUi.google, false); assert.equal(reauthUi.url, '/app.html'); });
  await pw.page.locator('#privacy-delete-password').fill('correct horse');
  const navigated = pw.page.waitForURL(/\/privacy\.html\?deleted=1$/, { timeout: 15000 }).then(() => true, () => false);
  await pw.page.locator('[data-privacy-confirm-delete]').click();
  const landed = await navigated;
  const leftovers = landed ? await pw.page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('brivia-'))) : ['n/a'];
  check(`password re-auth signs in again and retries; success lands on /privacy.html?deleted=1 (${landed}; token calls ${pw.st.tokenCalls}; rpc calls ${pw.st.rpcCalls.length})`, () => {
    assert.equal(landed, true); assert.equal(pw.st.tokenCalls, 1); assert.equal(pw.st.rpcCalls.length, 3);
    assert.ok(pw.st.rpcCalls.every((a) => a.p_confirm === 'DELETE'));
    assert.deepEqual(leftovers, []);
  });
  check(`signOut ran only after the RPC succeeded (local scope)`, () => { const logout = pw.st.calls.filter((c) => c.path === '/auth/v1/logout'); assert.equal(logout.length, 1); assert.match(logout[0].search, /scope=local/); });
  check('privacy context (password): no uncaught page errors', () => assert.deepEqual(pw.errors, []));
  await pw.ctx.close();

  // Google-only member: "Sign in with Google again" with a return marker; the delete dialog reopens after return.
  const gg = await makePrivacyContext('google', 'google member');
  gg.st.rpcMode = ['reauth'];
  await openSettingsItem(gg.page, 'privacy');
  await gg.page.locator('[data-privacy-delete]').click();
  await gg.page.locator('#privacy-delete-confirm').fill('DELETE');
  await gg.page.locator('[data-privacy-confirm-delete]').click();
  await gg.page.waitForSelector('[data-privacy-google]', { timeout: 10000 }).catch(() => {});
  const ggUi = await gg.page.evaluate(() => ({ btn: document.querySelector('[data-privacy-google]')?.textContent.trim(), pwField: Boolean(document.querySelector('[data-privacy-password-row]:not([hidden])')) }));
  check(`a Google-only member gets a Google button, no password field (${JSON.stringify(ggUi)})`, () => { assert.equal(ggUi.btn, 'Sign in with Google again'); assert.equal(ggUi.pwField, false); });
  await gg.page.locator('[data-privacy-google]').click();
  await gg.page.waitForURL(/\/auth\/v1\/authorize/, { timeout: 10000 }).catch(() => {});
  const authReq = gg.st.calls.find((c) => c.path === '/auth/v1/authorize');
  check(`Google re-auth starts OAuth (${authReq?.search}); the return marker is proven by the reopen below`, () => { assert.ok(authReq); assert.match(authReq.search, /provider=google/); });
  await gg.page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
  const reopened2 = await gg.page.waitForSelector('dialog[data-privacy="delete"][open]', { timeout: 15000 }).then(() => true, () => false);
  const markerAfter = await gg.page.evaluate(() => window.sessionStorage.getItem('brivia-reauth-delete'));
  check(`after returning from Google the delete dialog reopens and the marker is consumed (${reopened2}, ${markerAfter})`, () => { assert.equal(reopened2, true); assert.equal(markerAfter, null); });
  check('privacy context (google): no uncaught page errors', () => assert.deepEqual(gg.errors, []));
  await gg.ctx.close();
} finally {
  await browser?.close();
  try { process.kill(-vite.pid, 'SIGTERM'); } catch { vite.kill('SIGTERM'); }
}

results.forEach(([status, name]) => console.log(`${status}  ${name}`));
const failed = results.filter(([status]) => status === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
