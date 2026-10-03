// P0 consent e2e check (Ruling P4): runs app.html under Vite with every Supabase call stubbed.
// Never touches a real Supabase project. Playwright is NOT a repo dependency; see tests/e2e/README.md.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node tests/e2e/consent.spec.mjs
//
// Asserts: a like opens the pitch sheet and sends exactly ONE /rest/v1/connection_requests POST when the
// sheet resolves (Ruling P13): submit carries the note; close / Escape / backdrop / next card send note
// null; nothing is POSTed before. Never /rest/v1/matches or /rest/v1/brivia_messages. Other members are
// read from /rest/v1/public_profiles only; a stubbed match row shows "It's mutual"; the Requests list
// renders (escaped note, 44px equal-weight buttons), Accept calls /rest/v1/rpc/respond_connection_request
// and opens chat only if a match exists; crafted photo_url values cannot inject markup.
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

const ME = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CARA = '33333333-3333-4333-8333-333333333333';
const DEV = '44444444-4444-4444-8444-444444444444';
const EVE = '55555555-5555-4555-8555-555555555555'; // not in the deck: loaded via public_profiles?id=in.(…)
const ago = (ms) => new Date(Date.now() - ms).toISOString();
// public_profiles rows: no email / phone columns, exactly like the view.
const publicRows = [
  { id: BOB, name: 'Bob Lane', city: 'Pune', experience: 'Designer', skills: ['Design'], looking_for: ['Cofounder'], photo_url: 'javascript:window.__xss=1', created_at: ago(1000) },
  { id: CARA, name: 'Cara Moss', city: 'Pune', experience: 'Engineer', skills: ['Climbing'], looking_for: ['Friends'], photo_url: '', created_at: ago(2000) },
  { id: DEV, name: 'Dev Rao', city: 'Pune', experience: 'Writer', skills: ['Poetry'], looking_for: ['Friends'], photo_url: '', created_at: ago(3000) },
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

  const state = { matchedWith: new Set(), insertedRequests: new Set(), answered: new Set(), holdInsert: null, holdRpc: null };
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
    if (pathName === '/rest/v1/public_profiles') {
      const ids = (url.searchParams.get('id') || '').match(/in\.\((.*)\)/)?.[1]?.split(',');
      return json(200, ids ? [...publicRows, eveRow].filter((row) => ids.includes(row.id)) : publicRows);
    }
    if (pathName === '/rest/v1/matches') {
      if (method !== 'GET') return json(403, { code: '42501', message: 'clients cannot write matches' });
      const filter = url.searchParams.get('or') || '';
      const rows = [...state.matchedWith].filter((id) => filter.includes(id) || !filter.includes('and(')).map((id) => ({ user1_id: ME, user2_id: id }));
      return json(200, rows);
    }
    if (pathName === '/rest/v1/connection_requests') {
      if (method === 'POST') {
        if (state.holdInsert) await state.holdInsert;
        const row = JSON.parse(postData || '{}');
        const key = `${row.from_id}>${row.to_id}`;
        if (state.insertedRequests.has(key)) return json(409, { code: '23505', message: 'duplicate key value violates unique constraint', details: null, hint: null });
        state.insertedRequests.add(key);
        return route.fulfill({ status: 201, body: '', headers: { 'access-control-allow-origin': '*' } });
      }
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

  const requestPosts = () => posts('/rest/v1/connection_requests');
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
  await waitForToast(/Request sent to/);
  await page.waitForTimeout(300);
  const submitPosts = requestPosts().slice(before);
  check('pitch submit disabled while in flight', () => assert.equal(disabledInFlight, true));
  check(`like + submit = exactly one POST (got ${submitPosts.length})`, () => assert.equal(submitPosts.length, 1));
  check('that one POST carries the note and the liked person', () => {
    const body = JSON.parse(submitPosts[0].body);
    assert.deepEqual({ from: body.from_id, to: body.to_id, note: body.note }, { from: ME, to: bob.id, note: 'Hello, shall we talk design?' });
  });
  const submitToast = await toast();
  check(`submit toast is "Request sent to ${bob.name}" (got "${submitToast}")`, () => assert.equal(submitToast, `Request sent to ${bob.name}`));
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
  check(`like + close = one POST with note null (got ${resolved.length})`, () => { assert.equal(resolved.length, 1); const b = JSON.parse(resolved[0].body); assert.equal(b.to_id, cara.id); assert.equal(b.note, null); });
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
  check(`like + Escape = one POST with note null (got ${resolved.length})`, () => { assert.equal(resolved.length, 1); const b = JSON.parse(resolved[0].body); assert.equal(b.to_id, dev.id); assert.equal(b.note, null); });
  const escToast = await toast();
  check(`plain like toast is "Signal sent" (got "${escToast}")`, () => assert.equal(escToast, 'Signal sent'));

  // 4. Like + backdrop: one POST, note null (a repeat like of the same person gets 23505 -> same "Signal sent").
  before = requestPosts().length;
  const again = await likeAndOpenSheet();
  await resetToast();
  await page.locator('#pitch-modal .app-overlay-backdrop').click({ position: { x: 5, y: 5 } });
  await waitForToast(/Signal sent|It's mutual/);
  await page.waitForTimeout(300);
  resolved = requestPosts().slice(before);
  check(`like + backdrop = one POST with note null (got ${resolved.length})`, () => { assert.equal(resolved.length, 1); const b = JSON.parse(resolved[0].body); assert.equal(b.to_id, again.id); assert.equal(b.note, null); });
  const dupToast = await toast();
  check(`duplicate (23505) like still reads "Signal sent" (got "${dupToast}")`, () => assert.equal(dupToast, 'Signal sent'));

  // 5. Like, then move to the next card with the sheet open: one POST for the liked person, note null.
  before = requestPosts().length;
  const liked = await likeAndOpenSheet();
  await page.evaluate(() => document.querySelector('[data-action="pass"]').click());
  await page.waitForTimeout(600);
  resolved = requestPosts().slice(before);
  check(`like + next card = one POST with note null (got ${resolved.length})`, () => { assert.equal(resolved.length, 1); const b = JSON.parse(resolved[0].body); assert.equal(b.to_id, liked.id); assert.equal(b.note, null); });
  const sheetHidden = await page.locator('#pitch-modal').isHidden();
  check('moving to the next card closes the pitch sheet', () => assert.equal(sheetHidden, true));
  check('no writes to /rest/v1/matches at any point', () => assert.equal(matchWrites().length, 0));
  check('like checks matches in both orders', () => assert.ok(calls.some((c) => c.path === '/rest/v1/matches' && /and\(user1_id\.eq\.[^,]+,user2_id\.eq\.[^)]+\),and\(/.test(c.search))));
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
  check('accept refreshed connections from matches', () => assert.ok(calls.filter((c) => c.path === '/rest/v1/matches' && c.method === 'GET' && !c.search.includes('and(')).length >= 2));

  // 4b. A stranger's request: sender loaded via public_profiles?id=in.(…); a crafted photo_url cannot inject markup.
  const eveItem = page.locator(`[data-request-from="${EVE}"]`);
  const eveName = await eveItem.locator('strong').textContent();
  check(`unknown sender loaded from public_profiles (got "${eveName}")`, () => {
    assert.equal(eveName, 'Eve Stone');
    assert.ok(calls.some((c) => c.path === '/rest/v1/public_profiles' && c.search.includes(`id=in.(${EVE})`)));
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

  // 6. Privacy: others are read only through public_profiles; no other-member email/phone in any stubbed body or the DOM.
  check('profiles table read only for own id', () => {
    const profileReads = calls.filter((c) => c.path === '/rest/v1/profiles');
    assert.ok(profileReads.length >= 1);
    profileReads.forEach((c) => assert.ok(c.search.includes(`id=eq.${ME}`), c.search));
  });
  check('other members read via public_profiles', () => assert.ok(calls.some((c) => c.path === '/rest/v1/public_profiles')));
  check('no response body about others carries email/phone keys', () => {
    bodies.filter((b) => b.path !== '/rest/v1/profiles' && !b.path.startsWith('/auth/')).forEach((b) => assert.ok(!/"(email|phone|phone_country_code|phone_number)"/.test(b.body), `${b.path}: ${b.body.slice(0, 120)}`));
  });
  check('no uncaught page errors', () => assert.deepEqual(consoleErrors, []));
  await page.screenshot({ path: process.env.E2E_SCREENSHOT || path.join(process.env.TMPDIR || '/tmp', 'consent-e2e.png') });
} finally {
  await browser?.close();
  try { process.kill(-vite.pid, 'SIGTERM'); } catch { vite.kill('SIGTERM'); }
}

results.forEach(([status, name]) => console.log(`${status}  ${name}`));
const failed = results.filter(([status]) => status === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
