// Iteration 3, Task 10: the location-first deck on rpc/deck_candidates (UX_SPEC §B), against stubbed Supabase.
// Never touches a real Supabase project. Playwright is NOT a repo dependency; see tests/e2e/README.md.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node tests/e2e/deck.spec.mjs
//
// Asserts:
// * the deck comes only from POST rpc/deck_candidates { p_limit: 12 } (never rpc/list_members) and keeps the server order;
// * the card shows the server's distance_band ("~3 km", "Pune", "Abroad") and up to 2 "You both: X" chips, then up to
//   3 profile tags; the card, the public-profile modal and the page never show a City/State, even when the stub wrongly
//   adds them to rows; there is no PLACE filter;
// * Pass sends exactly one POST /rest/v1/interaction { viewer_id, target_id, event: 'pass' };
// * Like on a card with tags: [] and shared_interests: [] opens the pitch with the neutral line, with no page error (A5);
// * after the last card an empty deck_candidates + deck_status() 'caught_up' shows "You're caught up." with
//   "Search members"; the deck does NOT wrap back to card 1;
// * each deck_status value ('no_members_yet', 'complete_profile', 'caught_up'), a failed load and the filters case show
//   their copy and their one action (Invite copies location.origin and toasts "Link copied"; complete_profile re-reads
//   my_onboarding_status: completed -> the error state, not completed -> /auth.html?complete-profile=1, unreadable ->
//   "Finish profile"; Search members focuses the search box; Try again reloads; Clear filters brings the card back);
//   focus moves to the empty-state title when the deck empties;
// * zero quota: plain copy, Pitch aria-disabled and described by the notice, the 1440 px card stays below the top bar;
// * a 'matched' like from the deck shows the mutual toast;
// * at 375 px the chips wrap without clipping and the action buttons are at least 44 px tall.
// E2E_SCREENSHOTS=<dir> saves 375 px and 1440 px screenshots: card with band and chips (with the quota counter), the
// zero-quota state, and the caught-up and no-members-yet empty states.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT || 5197);
const ORIGIN = 'https://stub.supabase.local';
const BASE = `http://127.0.0.1:${PORT}`;
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.E2E_SCREENSHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };

const ME = '11111111-1111-4111-8111-111111111111';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const B = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const C = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003';
const D = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004';
// The stub wrongly adds city / state to deck rows: none of these strings may ever reach the page.
const LEAK = { city: 'Zanzibarton', state: 'Ungujastate' };
const LEAK_RE = /Zanzibarton|Ungujastate/;
const STILL = readFileSync(path.join(repoRoot, 'assets/badminton-premium-no-shuttle.png'));
const PHOTO = (id) => `${ORIGIN}/storage/v1/object/public/profile-photos/${id}/p.jpg`;
const deckRows = [
  { id: A, name: 'Asha Band', photo_url: PHOTO(A), cover_url: null, experience: 'Product designer', skills: ['Badminton', 'Chess', 'Long-distance running', 'Poetry', 'Jazz piano'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: ['Badminton', 'Chess'], ...LEAK },
  { id: B, name: 'Bilal Place', photo_url: PHOTO(B), cover_url: null, experience: 'Engineer', skills: ['Badminton'], looking_for: ['Mentor'], distance_band: 'Pune', shared_interests: ['Badminton'], ...LEAK },
  { id: C, name: 'Chen Abroad', photo_url: PHOTO(C), cover_url: null, experience: 'Writer', skills: ['Badminton', 'Travel'], looking_for: ['Friends'], distance_band: 'Abroad', shared_interests: ['Badminton'], ...LEAK },
  { id: D, name: 'Dana Blank', photo_url: null, cover_url: null, experience: null, skills: [], looking_for: [], distance_band: '~10 km', shared_interests: [], ...LEAK },
];
const ownRow = { id: ME, name: 'Alex Me', full_name: 'Alex Me', email: 'alex@test.brivia.club', phone: '', city: null, state: null, experience: 'Founder', skills: ['Badminton'], looking_for: ['Friends'], created_at: new Date(Date.now() - 9e6).toISOString() };

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const exp = Math.floor(Date.now() / 1000) + 3600;
const accessToken = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: ME, role: 'authenticated', exp, aud: 'authenticated' })}.sig`;
const user = { id: ME, aud: 'authenticated', role: 'authenticated', email: ownRow.email, user_metadata: { name: 'Alex Me' }, app_metadata: {}, created_at: ownRow.created_at };
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
  // One mutable stub serves every context; tests change it between page loads.
  // onboarding: the my_onboarding_status answers in order (the last one repeats); 'error' answers HTTP 500.
  const fresh = () => ({ status: 'caught_up', emptyDeck: false, deckFail: false, matchAll: false, onboarding: [true], onboardingCalls: 0, passed: new Set(), signalled: new Set(), remaining: 30, resetsAt: null });
  const st = { ...fresh(), calls: [], bodies: [] };
  const resetStub = (patch = {}) => Object.assign(st, fresh(), patch);
  const makeContext = async (viewport) => {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(([key, value]) => { window.localStorage.setItem(key, value); }, ['sb-stub-auth-token', JSON.stringify(session)]);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    await context.route(`${ORIGIN}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const pathName = url.pathname;
      const postData = request.postData();
      st.calls.push({ method, path: pathName, body: postData });
      const json = (status, payload) => { const body = JSON.stringify(payload); st.bodies.push({ path: pathName, body }); return route.fulfill({ status, contentType: 'application/json', body, headers: { 'access-control-allow-origin': '*' } }); };
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (pathName.startsWith('/auth/v1/')) return json(200, pathName.endsWith('/user') ? user : session);
      // Member photos: a neutral still from the repo (no real person), so screenshots show a real card.
      if (pathName.startsWith('/storage/v1/object/public/')) return route.fulfill({ status: 200, contentType: 'image/png', body: STILL, headers: { 'access-control-allow-origin': '*' } });
      if (pathName === '/rest/v1/profiles') return json(200, (request.headers().accept || '').includes('vnd.pgrst.object') ? ownRow : [ownRow]);
      const args = JSON.parse(postData || '{}');
      if (pathName === '/rest/v1/rpc/my_onboarding_status') {
        const answer = st.onboarding[Math.min(st.onboardingCalls, st.onboarding.length - 1)];
        st.onboardingCalls += 1;
        if (answer === 'error') return json(500, { code: 'XX000', message: 'stub failure' });
        return json(200, [{ interests: 2, points: 20, has_cell: true, place_label: 'Kochi', completed: answer }]);
      }
      if (pathName === '/rest/v1/rpc/deck_candidates') {
        if (st.deckFail) return json(500, { code: 'XX000', message: 'stub failure' });
        if (st.emptyDeck) return json(200, []);
        return json(200, deckRows.filter((row) => !st.passed.has(row.id) && !st.signalled.has(row.id)).slice(0, Number(args.p_limit) || 12));
      }
      if (pathName === '/rest/v1/rpc/deck_status') return json(200, st.status);
      if (pathName === '/rest/v1/rpc/my_signal_quota') return json(200, [{ daily_limit: 30, remaining: st.remaining, resets_at: st.resetsAt, live_unanswered: 0, live_limit: 100 }]);
      if (pathName === '/rest/v1/rpc/send_signal') {
        st.signalled.add(args.p_to); st.remaining = Math.max(0, st.remaining - 1); st.resetsAt = '2026-10-04T15:00:00+00:00';
        return json(200, [{ status: st.matchAll ? 'matched' : 'sent', remaining: st.remaining, resets_at: st.resetsAt }]);
      }
      if (pathName === '/rest/v1/interaction' && method === 'POST') {
        if (args.event === 'pass') st.passed.add(args.target_id);
        return route.fulfill({ status: 201, body: '', headers: { 'access-control-allow-origin': '*' } });
      }
      if (pathName === '/rest/v1/rpc/list_members') return json(200, deckRows);
      if (pathName.startsWith('/rest/v1/')) return json(200, []);
      return json(200, {});
    });
    await context.route((url) => !url.href.startsWith(BASE) && !url.href.startsWith(ORIGIN), (route) => route.abort());
    await context.routeWebSocket(/stub\.supabase\.local/, (ws) => ws.close());
    return context;
  };
  const pageErrors = [];
  const open = async (context) => {
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) pageErrors.push(`console: ${message.text()}`); });
    await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('app-auth-pending'), null, { timeout: 15000 });
    return page;
  };
  const cardName = (page) => page.evaluate(() => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() || '');
  // Both waits resolve to true / false (logged), so a failed state shows up as a FAIL line, not a crash.
  const waitForCard = (page, name) => page.waitForFunction((n) => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() === n, name, { timeout: 8000 })
    .then(() => true, async () => { console.log(`card "${name}" did not show (got "${await cardName(page)}")`); return false; });
  const waitForEmpty = (page, title) => page.waitForFunction((t) => { const el = document.querySelector('#home-empty-state'); return el && !el.hidden && document.querySelector('#deck-empty-title')?.textContent?.trim() === t; }, title, { timeout: 8000 })
    .then(() => true, async () => { console.log(`empty state "${title}" did not show:`, await page.evaluate(() => document.querySelector('#home-empty-state')?.outerHTML?.slice(0, 300))); return false; });
  const cardState = (page) => page.evaluate(() => ({
    band: document.querySelector('#swipe-location')?.textContent?.trim() || '',
    bandHidden: document.querySelector('#swipe-location')?.hidden,
    shared: [...document.querySelectorAll('#swipe-tags .chip-shared')].map((el) => el.textContent.trim()),
    chips: [...document.querySelectorAll('#swipe-tags > span')].map((el) => el.textContent.trim()),
    counter: document.querySelector('#swipe-left-count')?.textContent?.trim() || '',
  }));
  const pageText = (page) => page.evaluate(() => `${document.body.innerText}\n${document.documentElement.outerHTML}`);
  const passes = () => st.calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/interaction');
  const deckCalls = () => st.calls.filter((c) => c.path === '/rest/v1/rpc/deck_candidates');

  // 1. The card: band, "You both" chips, server order, no City/State (1440 px).
  resetStub();
  const wide = await makeContext({ width: 1440, height: 900 });
  let page = await open(wide);
  await waitForCard(page, 'Asha Band');
  await page.waitForFunction(() => document.querySelector('#swipe-left-count')?.textContent?.trim() === '30 signals left today', null, { timeout: 5000 }).catch(() => {});
  let card = await cardState(page);
  check(`card 1 shows the band "~3 km" (got "${card.band}")`, () => { assert.equal(card.band, '~3 km'); assert.equal(card.bandHidden, false); });
  check(`card 1 shows 2 "You both" chips then up to 3 tags (${JSON.stringify(card.chips)})`, () => {
    assert.deepEqual(card.shared, ['You both: Badminton', 'You both: Chess']);
    assert.deepEqual(card.chips, ['You both: Badminton', 'You both: Chess', 'Long-distance running', 'Poetry', 'Jazz piano']);
  });
  check(`the quota counter shows under the deck (got "${card.counter}")`, () => assert.equal(card.counter, '30 signals left today'));
  check('the deck loads from rpc/deck_candidates { p_limit: 12 } and never rpc/list_members', () => {
    assert.ok(deckCalls().length >= 1);
    deckCalls().forEach((c) => assert.deepEqual(JSON.parse(c.body || '{}'), { p_limit: 12 }));
    assert.equal(st.calls.filter((c) => c.path === '/rest/v1/rpc/list_members').length, 0);
  });
  const placeFilter = await page.evaluate(() => ({ input: Boolean(document.querySelector('#filter-location-input')), text: /\bPLACE\b/.test(document.querySelector('#discovery-filter-drawer')?.textContent || '') }));
  check(`the filter drawer has no PLACE field (${JSON.stringify(placeFilter)})`, () => assert.deepEqual(placeFilter, { input: false, text: false }));
  await shot(page, 'deck-1440-card-band-chips.png');
  let text = await pageText(page);
  check('card 1: the page never shows the stub City/State', () => assert.ok(!LEAK_RE.test(text)));
  // The public-profile modal: the band, never a City/State.
  await page.locator('[data-action="full-info"]').click();
  await page.waitForSelector('#public-profile-modal');
  const modal = await page.evaluate(() => ({ location: document.querySelector('#public-profile-modal .public-profile-location')?.textContent?.trim() ?? null, text: document.querySelector('#public-profile-modal')?.outerHTML || '' }));
  check(`public profile shows the band and no City/State (${modal.location})`, () => { assert.equal(modal.location, '~3 km'); assert.ok(!LEAK_RE.test(modal.text)); });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#public-profile-modal'));

  // 2. Pass: exactly one POST /rest/v1/interaction { viewer_id, target_id, event: 'pass' }; the next card shows "Pune".
  let before = passes().length;
  await page.locator('[data-action="pass"]').click();
  await waitForCard(page, 'Bilal Place');
  await page.waitForTimeout(200);
  const passBodies = passes().slice(before).map((c) => JSON.parse(c.body || '{}'));
  check(`Pass sends one POST /rest/v1/interaction with event 'pass' (${JSON.stringify(passBodies)})`, () => assert.deepEqual(passBodies, [{ viewer_id: ME, target_id: A, event: 'pass' }]));
  card = await cardState(page);
  check(`card 2 shows "Pune" and "You both: Badminton" (${JSON.stringify(card)})`, () => { assert.equal(card.band, 'Pune'); assert.deepEqual(card.shared, ['You both: Badminton']); });
  await page.locator('[data-action="pass"]').click();
  await waitForCard(page, 'Chen Abroad');
  card = await cardState(page);
  check(`card 3 shows "Abroad" and "You both: Badminton" (${JSON.stringify(card)})`, () => { assert.equal(card.band, 'Abroad'); assert.deepEqual(card.shared, ['You both: Badminton']); });
  text = await pageText(page);
  check('cards 2-3: the page never shows the stub City/State', () => assert.ok(!LEAK_RE.test(text)));
  await page.locator('[data-action="pass"]').click();
  await waitForCard(page, 'Dana Blank');

  // 3. A5: Like on a card with no tags and no shared interests opens the pitch with the neutral line.
  const errorsBefore = pageErrors.length;
  await page.locator('[data-action="like"]').click();
  await page.waitForSelector('#pitch-modal:not([hidden])');
  const pitch = await page.locator('#pitch-message').inputValue();
  check(`A5: the neutral pitch line for a card with no tags/shared (got "${pitch}")`, () => assert.equal(pitch, "Hey Dana Blank, I'd love to connect and exchange ideas."));
  await page.waitForTimeout(450);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => /Signal sent/.test(document.querySelector('#app-toast')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  check('A5: no page error from the like', () => assert.deepEqual(pageErrors.slice(errorsBefore), []));

  // 4. The end of the deck: one more deck_candidates (empty), then deck_status 'caught_up'. No wrap-around.
  const caughtShown = await waitForEmpty(page, "You're caught up.");
  check('after the last card: "You\'re caught up."', () => assert.equal(caughtShown, true));
  const caught = await page.evaluate(() => ({
    card: getComputedStyle(document.querySelector('#swipe-card')).display !== 'none',
    actions: getComputedStyle(document.querySelector('.swipe-actions')).display !== 'none',
    copy: document.querySelector('#deck-empty-copy')?.textContent?.trim() || '',
    action: document.querySelector('#deck-empty-action')?.textContent?.trim() || '',
    buttons: document.querySelectorAll('#home-empty-state button, #home-empty-state a').length,
    focused: document.activeElement?.id || '',
    titleTabindex: document.querySelector('#deck-empty-title')?.getAttribute('tabindex'),
  }));
  check(`when the deck empties, focus moves to the empty-state title (focused "${caught.focused}")`, () => { assert.equal(caught.focused, 'deck-empty-title'); assert.equal(caught.titleTabindex, '-1'); });
  check(`caught up: the copy and one "Search members" action (${JSON.stringify(caught)})`, () => {
    assert.match(caught.copy, /New people near you show up as they join\./);
    assert.equal(caught.action, 'Search members');
    assert.equal(caught.buttons, 1);
  });
  check('caught up: the deck does not wrap back to card 1 (card and Pass/Pitch not displayed)', () => { assert.equal(caught.card, false); assert.equal(caught.actions, false); });
  check(`the queue end asked deck_candidates once more, then deck_status (${deckCalls().length} deck calls)`, () => {
    assert.equal(deckCalls().length, 2);
    assert.ok(st.calls.some((c) => c.path === '/rest/v1/rpc/deck_status'));
  });
  check('every pass was recorded before the next deck_candidates call', () => {
    const idx = st.calls.findIndex((c, i) => c.path === '/rest/v1/rpc/deck_candidates' && i > 0 && st.calls.slice(0, i).some((p) => p.path === '/rest/v1/rpc/deck_candidates'));
    assert.equal(st.calls.slice(0, idx).filter((c) => c.method === 'POST' && c.path === '/rest/v1/interaction').length, 3);
  });
  await shot(page, 'deck-1440-empty-caught-up.png');
  await page.locator('#deck-empty-action').click();
  await page.waitForTimeout(250);
  const searchFocus = await page.evaluate(() => ({ drawer: !document.querySelector('#discovery-filter-drawer')?.hidden, focused: document.activeElement?.id || '' }));
  check(`"Search members" opens search and focuses it (${JSON.stringify(searchFocus)})`, () => { assert.equal(searchFocus.drawer, true); assert.equal(searchFocus.focused, 'drawer-filter-search'); });
  await page.keyboard.press('Escape');

  // 5. Each deck_status value: copy and its one action.
  resetStub({ emptyDeck: true, status: 'no_members_yet' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const noMembersShown = await waitForEmpty(page, 'Your area is just opening.');
  check('no_members_yet: "Your area is just opening."', () => assert.equal(noMembersShown, true));
  let action = await page.locator('#deck-empty-action').textContent();
  check(`no_members_yet: one "Invite a friend" action (got "${action?.trim()}")`, () => assert.equal(action?.trim(), 'Invite a friend'));
  await shot(page, 'deck-1440-empty-no-members-yet.png');
  await page.locator('#deck-empty-action').click();
  await page.waitForFunction(() => /Link copied/.test(document.querySelector('#app-toast')?.textContent || ''), null, { timeout: 4000 }).catch(() => {});
  const copied = { toast: await page.locator('#app-toast').textContent(), clip: await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR ${e.message}`) };
  check(`Invite copies location.origin and toasts "Link copied" (${JSON.stringify(copied)})`, () => { assert.equal(copied.toast, 'Link copied'); assert.equal(copied.clip, BASE); });

  // complete_profile (F6): the status is re-read first. Still completed -> the error state with "Try again"
  // (never a dead end); not completed -> straight to onboarding; unreadable -> "Finish profile".
  resetStub({ emptyDeck: true, status: 'complete_profile', onboarding: [true] });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const raceShown = await waitForEmpty(page, 'Your deck could not load.');
  action = await page.locator('#deck-empty-action').textContent();
  check(`complete_profile while my_onboarding_status says completed -> "Your deck could not load." + "Try again" (got "${action?.trim()}")`, () => { assert.equal(raceShown, true); assert.equal(action?.trim(), 'Try again'); });
  check('complete_profile re-reads my_onboarding_status before choosing the state', () => assert.ok(st.onboardingCalls >= 2));

  resetStub({ emptyDeck: true, status: 'complete_profile', onboarding: [true, 'error'] });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const finishShown = await waitForEmpty(page, 'Finish your orbit to see people near you.');
  action = await page.locator('#deck-empty-action').textContent();
  check(`complete_profile with an unreadable status -> "Finish profile" (got "${action?.trim()}")`, () => { assert.equal(finishShown, true); assert.equal(action?.trim(), 'Finish profile'); });
  // auth.html routes on by itself with the stubbed session, so record every navigation rather than the final URL.
  const visited = [];
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) visited.push(frame.url()); });
  await page.locator('#deck-empty-action').click();
  await page.waitForTimeout(1500);
  check(`"Finish profile" opens /auth.html?complete-profile=1 (${JSON.stringify(visited)})`, () => assert.ok(visited.some((url) => /\/auth\.html\?complete-profile=1$/.test(url))));
  await page.close();

  resetStub({ emptyDeck: true, status: 'complete_profile', onboarding: [true, false] });
  const visitedReplace = [];
  page = await wide.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) visitedReplace.push(frame.url()); });
  await page.goto(`${BASE}/app.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check(`complete_profile while not completed -> location.replace('/auth.html?complete-profile=1') (${JSON.stringify(visitedReplace)})`, () => assert.ok(visitedReplace.some((url) => /\/auth\.html\?complete-profile=1$/.test(url))));

  // auth.html routes on by itself (stubbed session); continue in a fresh page rather than racing its redirect.
  await page.close();
  resetStub({ emptyDeck: true, status: 'caught_up' });
  page = await open(wide);
  const caughtFirst = await waitForEmpty(page, "You're caught up.");
  check('caught_up on an empty first load shows "You\'re caught up."', () => assert.equal(caughtFirst, true));

  // F11: a deck that cannot load shows "Your deck could not load." with "Try again", which loads it.
  resetStub({ deckFail: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const errorShown = await waitForEmpty(page, 'Your deck could not load.');
  action = await page.locator('#deck-empty-action').textContent();
  check(`a failed deck_candidates shows the error state with "Try again" (got "${action?.trim()}")`, () => { assert.equal(errorShown, true); assert.equal(action?.trim(), 'Try again'); });
  st.deckFail = false;
  await page.locator('#deck-empty-action').click();
  const retried = await waitForCard(page, 'Asha Band');
  check('"Try again" loads the deck', () => assert.equal(retried, true));
  // F11: a 'matched' result from the deck shows the mutual toast.
  st.matchAll = true;
  await page.locator('[data-action="like"]').click();
  await page.waitForSelector('#pitch-modal:not([hidden])');
  await page.waitForTimeout(450);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => /It's mutual/.test(document.querySelector('#app-toast')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const mutual = await page.locator('#app-toast').textContent();
  check(`a matched like from the deck shows "It's mutual. Say hi to Asha Band." (got "${mutual}")`, () => assert.equal(mutual, "It's mutual. Say hi to Asha Band."));

  // 6. Filters: nothing in the loaded deck matches -> the filters copy and "Clear filters"; clearing brings card 1 back.
  resetStub();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForCard(page, 'Asha Band');
  const deckCallsBeforeFilter = deckCalls().length;
  await page.locator('#open-discovery-filters').click();
  await page.locator('#filter-skills-input').fill('Underwater basket weaving');
  const filtersShown = await waitForEmpty(page, 'No one in this deck matches these filters.');
  check('filters: "No one in this deck matches these filters."', () => assert.equal(filtersShown, true));
  action = await page.locator('#deck-empty-action').textContent();
  check(`filters: one "Clear filters" action (got "${action?.trim()}")`, () => assert.equal(action?.trim(), 'Clear filters'));
  check('filters: an unmatched filter does not consume the deck or call deck_status', () => assert.ok(deckCalls().length - deckCallsBeforeFilter <= 1));
  // Close the drawer with its button: Escape inside a type=search input clears the field natively.
  await page.locator('.discovery-filter-close').click();
  const filtersAfterClose = await waitForEmpty(page, 'No one in this deck matches these filters.');
  check('filters: the empty state stays after the drawer closes', () => assert.equal(filtersAfterClose, true));
  await page.locator('#deck-empty-action').click();
  const clearedBack = await waitForCard(page, 'Asha Band');
  check('"Clear filters" brings card 1 back', () => assert.equal(clearedBack, true));
  await wide.close();

  // 7. 375 px: chips wrap without clipping; the action buttons are at least 44 px tall.
  resetStub();
  const narrow = await makeContext({ width: 375, height: 812 });
  const small = await open(narrow);
  await waitForCard(small, 'Asha Band');
  await small.waitForTimeout(400);
  const layout = await small.evaluate(() => {
    const tags = document.querySelector('#swipe-tags');
    const cardBox = document.querySelector('#swipe-card').getBoundingClientRect();
    const chips = [...tags.children].map((el) => el.getBoundingClientRect());
    const rows = new Set(chips.map((r) => Math.round(r.top))).size;
    const buttons = [...document.querySelectorAll('.swipe-actions button')].map((el) => Math.round(el.getBoundingClientRect().height));
    return {
      rows,
      clipped: chips.filter((r) => r.right > cardBox.right + 0.5 || r.left < cardBox.left - 0.5).length,
      overflow: tags.scrollWidth - tags.clientWidth,
      wrap: getComputedStyle(tags).flexWrap,
      buttons,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  check(`375 px: chips wrap and do not clip (${JSON.stringify(layout)})`, () => {
    assert.equal(layout.wrap, 'wrap');
    assert.ok(layout.rows >= 2, 'expected the chips to wrap onto 2+ rows');
    assert.equal(layout.clipped, 0);
    assert.ok(layout.overflow <= 1);
    assert.ok(layout.pageOverflow <= 1, 'horizontal page scroll');
  });
  check(`375 px: Pass/Pitch are at least 44 px tall (${layout.buttons})`, () => layout.buttons.forEach((h) => assert.ok(h >= 44)));
  await small.locator('#swipe-card').scrollIntoViewIfNeeded();
  await shot(small, 'deck-375-card-band-chips.png');
  await small.locator('.swipe-hint').scrollIntoViewIfNeeded();
  await shot(small, 'deck-375-quota-counter.png');

  // Zero quota at both widths: the card stays, with the honest notice.
  resetStub({ remaining: 0, resetsAt: '2026-10-04T15:00:00+00:00' });
  await small.reload({ waitUntil: 'domcontentloaded' });
  await waitForCard(small, 'Asha Band');
  await small.waitForFunction(() => !document.querySelector('#swipe-limit-state')?.hidden, null, { timeout: 5000 }).catch(() => {});
  const zeroState = (p) => p.evaluate(() => {
    const like = document.querySelector('[data-action="like"]');
    return {
      text: document.querySelector('#swipe-limit-copy')?.textContent || '',
      hint: document.querySelector('#swipe-left-count')?.textContent || '',
      role: document.querySelector('#swipe-limit-state')?.getAttribute('role'),
      ariaDisabled: like?.getAttribute('aria-disabled'),
      describedBy: like?.getAttribute('aria-describedby'),
      focusable: like ? !like.disabled && like.tabIndex >= 0 : false,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      cardTop: document.querySelector('#swipe-card')?.getBoundingClientRect().top,
      barBottom: document.querySelector('.app-topbar')?.getBoundingClientRect().bottom,
    };
  });
  const zero = await zeroState(small);
  check(`375 px zero quota: plain copy, no horizontal scroll (${JSON.stringify(zero)})`, () => {
    assert.match(zero.text, /^No signals left today\. More at .+ · Passing is always free\.$/);
    assert.match(zero.hint, /^0 signals left · more at .+$/);
    assert.ok(zero.overflow <= 1);
  });
  check(`zero quota: Pitch is aria-disabled, described by the notice and still focusable; the notice has no role=status (${JSON.stringify(zero)})`, () => {
    assert.equal(zero.ariaDisabled, 'true');
    assert.equal(zero.describedBy, 'swipe-limit-copy');
    assert.equal(zero.focusable, true);
    assert.equal(zero.role, null);
  });
  await small.locator('#swipe-limit-state').scrollIntoViewIfNeeded();
  await shot(small, 'deck-375-zero-quota.png');
  const wide2 = await makeContext({ width: 1440, height: 900 });
  const wpage = await open(wide2);
  await waitForCard(wpage, 'Asha Band');
  await wpage.waitForFunction(() => !document.querySelector('#swipe-limit-state')?.hidden, null, { timeout: 5000 }).catch(() => {});
  await wpage.waitForTimeout(300);
  const wideZero = await zeroState(wpage);
  check(`1440 px zero quota: the card top is at or below the top bar (card ${wideZero.cardTop}, bar ${wideZero.barBottom})`, () => assert.ok(wideZero.cardTop >= wideZero.barBottom - 0.5));
  await shot(wpage, 'deck-1440-zero-quota.png');
  // My own profile's location line is my_onboarding_status().place_label.
  await wpage.evaluate(() => document.querySelector('[data-nav="profile"]')?.click());
  await wpage.waitForFunction(() => document.querySelector('#profile-location')?.textContent?.trim() === 'Kochi', null, { timeout: 5000 }).catch(() => {});
  const ownArea = await wpage.evaluate(() => document.querySelector('#profile-location')?.textContent?.trim() || '');
  check(`own profile location line is place_label "Kochi" (got "${ownArea}")`, () => assert.equal(ownArea, 'Kochi'));
  await wide2.close();

  // Empty states at 375 px: the one action is at least 44 px tall.
  for (const [status, title, file] of [['caught_up', "You're caught up.", 'deck-375-empty-caught-up.png'], ['no_members_yet', 'Your area is just opening.', 'deck-375-empty-no-members-yet.png']]) {
    resetStub({ emptyDeck: true, status });
    await small.reload({ waitUntil: 'domcontentloaded' });
    await waitForEmpty(small, title);
    const box = await small.locator('#deck-empty-action').boundingBox();
    const overflow = await small.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`375 px ${status}: the action is at least 44 px tall (${Math.round(box?.height || 0)} px), no horizontal scroll`, () => { assert.ok((box?.height || 0) >= 44); assert.ok(overflow <= 1); });
    await small.locator('#home-empty-state').scrollIntoViewIfNeeded();
    await shot(small, file);
  }
  await narrow.close();

  // 8. Privacy across the run.
  const storedKeys = await (async () => { const ctx = await makeContext({ width: 800, height: 600 }); const p2 = await open(ctx); await p2.waitForTimeout(800); const keys = await p2.evaluate(() => Object.entries(window.localStorage).map(([k, v]) => `${k}=${v}`)); await ctx.close(); return keys; })();
  check(`no localStorage entry holds a quota, a swipe count, a band or coordinates (${storedKeys.length} keys)`, () => {
    storedKeys.forEach((entry) => assert.ok(!/remaining|resets_at|daily-swipes|distance_band|~3 km|latitude|longitude|"lat"|"lng"/.test(entry), entry.slice(0, 120)));
  });
  check('no response body about others carries email/phone keys', () => {
    st.bodies.filter((b) => b.path !== '/rest/v1/profiles' && !b.path.startsWith('/auth/')).forEach((b) => assert.ok(!/"(email|phone)"/.test(b.body), b.path));
  });
  check('no rpc/list_members call at any point', () => assert.equal(st.calls.filter((c) => c.path === '/rest/v1/rpc/list_members').length, 0));
  check(`no uncaught page errors (${pageErrors.length})`, () => assert.deepEqual(pageErrors, []));
} finally {
  await browser?.close();
  try { process.kill(-vite.pid, 'SIGTERM'); } catch { vite.kill('SIGTERM'); }
}

results.forEach(([status, name]) => console.log(`${status}  ${name}`));
const failed = results.filter(([status]) => status === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
