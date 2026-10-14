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
// * search results join the deck except members already matched with me and cards already swiped (Minor 2);
// * my own profile: details marked private, the area is place_label (read-only in the editor, "coming soon"), no
//   City/State anywhere, and a profile save sends no city, state or skills (D-036);
// * at 375 px the chips wrap without clipping and the action buttons are at least 44 px tall.
// E2E_SCREENSHOTS=<dir> saves 375 px and 1440 px screenshots: card with band and chips (with the quota counter), the
// zero-quota state, and the caught-up and no-members-yet empty states.
import { axeViolations, smallText, photoContrast } from './a11y.mjs';
import { startAppStub, ME, PHOTO } from './app-stub.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const PORT = Number(process.env.E2E_PORT || 5197);
const BASE = `http://127.0.0.1:${PORT}`;
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.E2E_SCREENSHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const B = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const C = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003';
const D = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004';
// Search-only members (Minor 2): M is already matched with me, N is new.
const M = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005';
const N = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000006';
// The stub wrongly adds city / state to deck rows: none of these strings may ever reach the page.
const LEAK = { city: 'Zanzibarton', state: 'Ungujastate' };
const LEAK_RE = /Zanzibarton|Ungujastate/;
const deckRows = [
  { id: A, name: 'Asha Band', photo_url: PHOTO(A), cover_url: null, experience: 'Product designer', skills: ['Badminton', 'Chess', 'Long-distance running', 'Poetry', 'Jazz piano'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: ['Badminton', 'Chess'], ...LEAK },
  { id: B, name: 'Bilal Place', photo_url: PHOTO(B), cover_url: null, experience: 'Engineer', skills: ['Badminton'], looking_for: ['Mentor'], distance_band: 'Pune', shared_interests: ['Badminton'], ...LEAK },
  { id: C, name: 'Chen Abroad', photo_url: PHOTO(C), cover_url: null, experience: 'Writer', skills: ['Badminton', 'Travel'], looking_for: ['Friends'], distance_band: 'Abroad', shared_interests: ['Badminton'], ...LEAK },
  { id: D, name: 'Dana Blank', photo_url: null, cover_url: null, experience: null, skills: [], looking_for: [], distance_band: '~10 km', shared_interests: [], ...LEAK },
];
const searchRows = [
  { id: A, name: 'Asha Band', photo_url: PHOTO(A), cover_url: null, experience: 'Product designer', skills: ['Badminton'], looking_for: ['Friends'] },
  { id: M, name: 'Kai Matched', photo_url: null, cover_url: null, experience: 'Chef', skills: ['Cooking'], looking_for: ['Friends'] },
  { id: N, name: 'Kai New', photo_url: null, cover_url: null, experience: 'Pilot', skills: ['Flying'], looking_for: ['Friends'] },
];

const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };

// One mutable stub serves every context; tests change it between page loads (tests/e2e/app-stub.mjs).
// onboarding: the my_onboarding_status answers in order (the last one repeats); 'error' answers HTTP 500.
// matchIds: members I am matched with (GET /rest/v1/matches); search: the rpc/search_members answer.
const fresh = () => ({ status: 'caught_up', emptyDeck: false, deckFail: false, matchAll: false, onboarding: [true], onboardingCalls: 0, passed: new Set(), signalled: new Set(), remaining: 30, resetsAt: null, matchIds: [], search: [], report: 'ok', rows: null, why: null, whyStatuses: null });
const st = { ...fresh(), calls: [], bodies: [] };
const resetStub = (patch = {}) => Object.assign(st, fresh(), patch);
const stub = await startAppStub({ port: PORT, state: st, deckRows });
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });
  const makeContext = (viewport) => stub.newContext(browser, viewport);
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
  await page.waitForFunction(() => document.querySelector('#swipe-left-count')?.textContent?.trim() === '30 of 30 signals left · 24-hour window', null, { timeout: 5000 }).catch(() => {});
  let card = await cardState(page);
  check(`card 1 shows the band "~3 km" (got "${card.band}")`, () => { assert.equal(card.band, '~3 km'); assert.equal(card.bandHidden, false); });
  check(`card 1 shows 2 "You both" chips then up to 3 tags (${JSON.stringify(card.chips)})`, () => {
    assert.deepEqual(card.shared, ['You both: Badminton', 'You both: Chess']);
    assert.deepEqual(card.chips, ['You both: Badminton', 'You both: Chess', 'Long-distance running', 'Poetry', 'Jazz piano']);
  });
  check(`the quota counter shows under the deck (got "${card.counter}")`, () => assert.equal(card.counter, '30 of 30 signals left · 24-hour window'));
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
  // Iteration 4, Task 10 (R11): honesty, glyphs, contrast, 12 px.
  const glyphs = await page.evaluate(() => {
    const pass = document.querySelector('[data-action="pass"]');
    const like = document.querySelector('[data-action="like"]');
    return {
      verified: document.querySelectorAll('.verified-mark').length,
      passLabel: pass?.getAttribute('aria-label'), likeLabel: like?.getAttribute('aria-label'),
      passSvg: Boolean(pass?.querySelector('svg[aria-hidden="true"]')), likeSvg: Boolean(like?.querySelector('svg[aria-hidden="true"]')),
      passText: pass?.textContent.trim(), likeText: like?.textContent.trim(),
      passBefore: getComputedStyle(pass, '::before').content, likeBefore: getComputedStyle(like, '::before').content,
      hintText: document.querySelector('.swipe-hint')?.textContent || '',
    };
  });
  check(`no verified mark on the card (${glyphs.verified})`, () => assert.equal(glyphs.verified, 0));
  check(`Pass and Pitch are SVG glyphs with aria-label "Pass" / "Pitch", no text glyphs (${JSON.stringify(glyphs)})`, () => {
    assert.equal(glyphs.passLabel, 'Pass'); assert.equal(glyphs.likeLabel, 'Pitch');
    assert.ok(glyphs.passSvg && glyphs.likeSvg);
    assert.equal(glyphs.passText, ''); assert.equal(glyphs.likeText, '');
    assert.ok(['none', 'normal', '""'].includes(glyphs.passBefore) && ['none', 'normal', '""'].includes(glyphs.likeBefore), 'no text glyph in ::before');
    assert.match(glyphs.hintText, /PITCH WITH PURPOSE/);
  });
  const bandNote = (p) => p.evaluate(() => { const el = document.querySelector('#swipe-band-note'); return { text: el?.textContent.trim() || '', visible: Boolean(el && !el.hidden && el.getClientRects().length) }; });
  const note1 = await bandNote(page);
  check(`a "~3 km" band has no area-filling note (${JSON.stringify(note1)})`, () => assert.equal(note1.visible, false));
  const deckContrast = await axeViolations(page, { rules: ['color-contrast'], include: '#swipe-card', decorative: ['.swipe-card-info::before'] });
  check(`axe color-contrast: the deck card has no violations (${deckContrast.join(' | ')})`, () => assert.deepEqual(deckContrast, []));
  const deckContrastAll = await axeViolations(page, { rules: ['color-contrast'], include: '.app-view[data-view="home"]' });
  check(`axe color-contrast: the whole deck view has no violations (${deckContrastAll.join(' | ')})`, () => assert.deepEqual(deckContrastAll, []));
  // The kicker, heading and hint sit on a photo, which axe cannot read: measure the worst pixel behind each box instead.
  const photoChecks = async (pg, tag) => {
    for (const sel of ['.home-kicker span', '.home-heading h1', '.home-heading h1 em', '.swipe-hint', '#swipe-left-count']) {
      const pc = await photoContrast(pg, sel);
      check(`${tag} deck text over the photo, ${sel}: worst-pixel contrast ${pc.ratio}:1 >= ${pc.required}:1 (${pc.color}, ${JSON.stringify(pc.images)})`, () => {
        assert.equal(pc.alpha, 1, 'text colour must be opaque');
        assert.ok(pc.images.urls >= 1 && pc.images.loaded === pc.images.urls, 'the background photo must have loaded');
        assert.ok(pc.ratio >= pc.required);
      });
    }
    await pg.evaluate(() => window.scrollTo(0, 0));
  };
  await photoChecks(page, '1440:');
  const deckSmall = await smallText(page, { root: '.app-view[data-view="home"]' });
  check(`deck: visible text is at least 12 px (${deckSmall.join(' | ')})`, () => assert.deepEqual(deckSmall, []));
  const quotaStyle = await page.evaluate(() => { const el = document.querySelector('#swipe-left-count'); const s = getComputedStyle(el); return { size: parseFloat(s.fontSize), color: s.color }; });
  check(`the quota line is at least 12 px in full ink (${JSON.stringify(quotaStyle)})`, () => { assert.ok(quotaStyle.size >= 12); assert.equal(quotaStyle.color, 'rgb(67, 4, 22)'); });
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
  const noteText = 'Distances appear as your area fills up.';
  const note2 = await bandNote(page);
  check(`under the place band "Pune" the note reads "${noteText}" (${JSON.stringify(note2)})`, () => { assert.equal(note2.text, noteText); assert.equal(note2.visible, true); });
  const noteContrast = await axeViolations(page, { rules: ['color-contrast'], include: '#swipe-card', decorative: ['.swipe-card-info::before'] });
  check(`axe color-contrast: the place-band card has no violations (${noteContrast.join(' | ')})`, () => assert.deepEqual(noteContrast, []));
  const noteSmall = await smallText(page, { root: '#swipe-card' });
  check(`the place-band card text is at least 12 px (${noteSmall.join(' | ')})`, () => assert.deepEqual(noteSmall, []));
  await page.locator('[data-action="pass"]').click();
  await waitForCard(page, 'Chen Abroad');
  card = await cardState(page);
  check(`card 3 shows "Abroad" and "You both: Badminton" (${JSON.stringify(card)})`, () => { assert.equal(card.band, 'Abroad'); assert.deepEqual(card.shared, ['You both: Badminton']); });
  const note3 = await bandNote(page);
  check(`under "Abroad" the area-filling note shows too (${JSON.stringify(note3)})`, () => { assert.equal(note3.text, noteText); assert.equal(note3.visible, true); });
  text = await pageText(page);
  check('cards 2-3: the page never shows the stub City/State', () => assert.ok(!LEAK_RE.test(text)));
  await page.locator('[data-action="pass"]').click();
  await waitForCard(page, 'Dana Blank');
  const note4 = await bandNote(page);
  check(`a "~10 km" band has no area-filling note (${JSON.stringify(note4)})`, () => assert.equal(note4.visible, false));

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
    assert.ok(!/met your orbit/i.test(caught.copy), 'the old promise copy is gone (iteration 3 R8)');
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

  // 6a. Legacy stored covers (hashed /assets/<name>-<hash>.PNG, original /Images/Cover%20images/<name>.PNG) must show the
  // bundled .webp on other members' swipe cards, and the image must actually load.
  const coverRows = [
    { id: A, name: 'Legacy Hashed', photo_url: null, cover_url: '/assets/163BDB0C-64AC-44E7-8663-55C323ADB4FE-Bcr88PbJ.PNG', experience: 'Chef', skills: ['Cooking'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: [] },
    { id: B, name: 'Legacy Original', photo_url: null, cover_url: '/Images/Cover%20images/2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG', experience: 'Pilot', skills: ['Flying'], looking_for: ['Friends'], distance_band: '~4 km', shared_interests: [] },
  ];
  resetStub({ rows: coverRows });
  const coverCtx = await makeContext({ width: 1440, height: 900 });
  page = await open(coverCtx);
  for (const name of ['Legacy Hashed', 'Legacy Original']) {
    await waitForCard(page, name);
    await page.waitForFunction(() => { const i = document.querySelector('#swipe-image'); return i && i.complete; }, null, { timeout: 8000 }).catch(() => {});
    const img = await page.evaluate(() => { const i = document.querySelector('#swipe-image'); return { src: i.getAttribute('src'), w: i.naturalWidth }; });
    check(`legacy cover on "${name}" resolves to a bundled .webp that loads (${img.src}, ${img.w}px)`, () => {
      assert.match(img.src, /\.webp(\?|$)/);
      assert.ok(img.w > 0, 'cover image did not load');
    });
    await page.locator('[data-action="pass"]').click();
  }
  await coverCtx.close();

  // 6b. Minor 2: search results join the deck, except members already matched with me or already swiped this session.
  resetStub({ matchIds: [M], search: searchRows });
  const searchCtx = await makeContext({ width: 1440, height: 900 });
  page = await open(searchCtx);
  await waitForCard(page, 'Asha Band');
  await page.locator('[data-action="pass"]').click();   // Asha is consumed (deck.seen)
  await waitForCard(page, 'Bilal Place');
  await page.locator('#open-discovery-filters').click();
  await page.locator('#drawer-filter-search').fill('Kai');
  await page.waitForTimeout(700);
  check('search: rpc/search_members was called', () => assert.ok(st.calls.some((c) => c.path === '/rest/v1/rpc/search_members')));
  await page.locator('.discovery-filter-close').click();
  const firstHit = await waitForCard(page, 'Kai New');
  check(`search: the first "Kai" card is the new member, not the matched one (got "${await cardName(page)}")`, () => assert.equal(firstHit, true));
  await page.locator('[data-action="pass"]').click();
  const noMoreKai = await waitForEmpty(page, 'No one in this deck matches these filters.');
  check('search: the matched member never joins the deck', () => assert.equal(noMoreKai, true));
  // Clear the search (works whether or not the empty state showed), then walk the rest of the deck.
  await page.locator('#open-discovery-filters').click();
  await page.locator('#drawer-filter-search').fill('');
  await page.locator('.discovery-filter-close').click();
  const seenNames = [];
  for (let i = 0; i < 8; i += 1) {
    const name = await page.waitForFunction(() => {
      const empty = document.querySelector('#home-empty-state');
      if (empty && !empty.hidden) return '(empty)';
      return document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() || false;
    }, null, { timeout: 8000 }).then((h) => h.jsonValue(), () => '(timeout)');
    if (name === '(empty)' || name === '(timeout)') { seenNames.push(name); break; }
    seenNames.push(name);
    await page.locator('[data-action="pass"]').click();
    await page.waitForFunction((n) => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim() !== n || !document.querySelector('#home-empty-state')?.hidden, name, { timeout: 8000 }).catch(() => {});
  }
  check(`search: after clearing, the deck has neither the passed nor the matched member (${seenNames.join(', ')})`, () => {
    assert.deepEqual(seenNames, ['Bilal Place', 'Chen Abroad', 'Dana Blank', '(empty)']);
  });
  await searchCtx.close();

  // 7. 375 px: chips wrap without clipping; the action buttons are at least 44 px tall.
  resetStub();
  const narrow = await makeContext({ width: 375, height: 812 });
  const small = await open(narrow);
  await waitForCard(small, 'Asha Band');
  await small.waitForTimeout(400);
  await photoChecks(small, '375:');
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
    assert.match(zero.text, /^No signals left today\. More at \d{1,2}(:\d\d)? ?[AP]M · Passing is always free\.$/i);
    assert.match(zero.hint, /^Your next signal frees up at \d{1,2}(:\d\d)? ?[AP]M$/i);
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
  // I-1 (D-036): my own details are private, the area is read-only, and the editor has no City/State; saving works.
  // Phase C Task 5: the details card and the stat tiles are gone; my area shows only as the hero's place_label line.
  const ownCard = await wpage.evaluate(() => ({
    removed: ['.profile-details-card', '#profile-stat-area', '#profile-email', '#profile-phone'].filter((sel) => document.querySelector(sel)),
    cityNodes: document.querySelectorAll('#profile-city, #profile-state, #profile-stat-city, #profile-stat-state').length,
  }));
  check(`own profile has no details card, stat tiles or City/State nodes (${JSON.stringify(ownCard)})`, () => {
    assert.deepEqual(ownCard.removed, []);
    assert.equal(ownCard.cityNodes, 0);
  });
  await wpage.locator('#profile-photo-editor').click();
  await wpage.waitForSelector('#profile-edit-form');
  const editor = await wpage.evaluate(() => ({
    cityInputs: document.querySelectorAll('#profile-edit-form input[name="city"], #profile-edit-form input[name="state"]').length,
    area: document.querySelector('#profile-edit-form [data-profile-area]')?.textContent?.replace(/\s+/g, ' ').trim() || '',
  }));
  check(`profile editor: no City/State inputs; the area is read-only with "coming soon" (${JSON.stringify(editor)})`, () => {
    assert.equal(editor.cityInputs, 0);
    assert.match(editor.area, /Kochi/);
    assert.match(editor.area, /Change your area: coming soon/);
  });
  const patchesBefore = st.calls.filter((c) => c.method === 'PATCH' && c.path === '/rest/v1/profiles').length;
  await wpage.locator('#profile-edit-form input[name="experience"]').fill('Founder and cook');
  await wpage.locator('#profile-edit-form [type="submit"]').click();
  await wpage.waitForFunction(() => /Profile updated and saved\./.test(document.querySelector('#app-toast')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const saveToast = await wpage.locator('#app-toast').textContent();
  const patches = st.calls.filter((c) => c.method === 'PATCH' && c.path === '/rest/v1/profiles').slice(patchesBefore).map((c) => JSON.parse(c.body || '{}'));
  check(`profile save still works and sends no city/state/skills (${patches.map((b) => Object.keys(b).join(',')).join(' ; ')})`, () => {
    assert.equal(saveToast, 'Profile updated and saved.');
    assert.equal(patches.length, 1);
    assert.equal(patches[0].experience, 'Founder and cook');
    ['city', 'state', 'skills', 'email', 'id'].forEach((key) => assert.ok(!(key in patches[0]), key));
  });
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

  // 7b. Iteration 4, Task 8 (R4): the card overflow (Report, Block) and the report dialog at 375 px.
  resetStub();
  const repCtx = await makeContext({ width: 375, height: 812 });
  const rep = await open(repCtx);
  await waitForCard(rep, 'Asha Band');
  await rep.waitForTimeout(300);
  rep.on('dialog', (d) => d.accept());
  const reportCalls = () => st.calls.filter((c) => c.path === '/rest/v1/rpc/report_member');
  const more = await rep.evaluate(() => { const b = document.querySelector('#swipe-card .card-more'); const r = b?.getBoundingClientRect(); return { label: b?.getAttribute('aria-label'), popup: b?.getAttribute('aria-haspopup'), w: Math.round(r?.width || 0), h: Math.round(r?.height || 0), tag: b?.tagName }; });
  check(`card overflow is a real 44x44 button labelled for the member (${JSON.stringify(more)})`, () => { assert.equal(more.tag, 'BUTTON'); assert.equal(more.label, 'More options for Asha Band'); assert.equal(more.popup, 'menu'); assert.ok(more.w >= 44 && more.h >= 44); });
  await rep.locator('#swipe-card .card-more').focus();
  await rep.keyboard.press('Enter');
  const menuItems = await rep.evaluate(() => ({ open: !document.querySelector('.card-more-menu')?.hidden, items: [...document.querySelectorAll('.card-more-menu [role="menuitem"]')].map((el) => el.textContent.trim()), expanded: document.querySelector('.card-more')?.getAttribute('aria-expanded') }));
  check(`the overflow opens with the keyboard: Report and Block (${JSON.stringify(menuItems)})`, () => { assert.equal(menuItems.open, true); assert.deepEqual(menuItems.items, ['Report', 'Block']); assert.equal(menuItems.expanded, 'true'); });
  await rep.keyboard.press('Escape');
  const menuClosed = await rep.evaluate(() => ({ hidden: document.querySelector('.card-more-menu')?.hidden, focus: document.activeElement?.className || '' }));
  check(`Escape closes the overflow menu and returns focus to it (${JSON.stringify(menuClosed)})`, () => { assert.equal(menuClosed.hidden, true); assert.match(menuClosed.focus, /card-more/); });
  await rep.keyboard.press('Enter');
  await rep.locator('.card-more-menu [data-card-action="report"]').click();
  await rep.waitForSelector('dialog.report-dialog[open]');
  const dlg = await rep.evaluate(() => {
    const d = document.querySelector('dialog.report-dialog');
    const radios = [...d.querySelectorAll('fieldset input[type="radio"]')];
    const box = d.getBoundingClientRect();
    const note = d.querySelector('textarea');
    const e = d.querySelector('[data-report-emergency]');
    return {
      legend: d.querySelector('fieldset legend')?.textContent?.trim(),
      labels: radios.map((r) => r.closest('label')?.textContent.trim()),
      values: radios.map((r) => r.value),
      targets: radios.map((r) => Math.round(r.closest('label').getBoundingClientRect().height)),
      noteMax: note?.getAttribute('maxlength'),
      noteLabel: d.querySelector(`label[for="${note?.id}"]`)?.textContent?.replace(/\s+/g, ' ').trim(),
      submit: d.querySelector('[data-report-submit]')?.textContent?.trim(),
      submitH: Math.round(d.querySelector('[data-report-submit]')?.getBoundingClientRect().height || 0),
      contact: d.textContent.includes('Urgent? Email thebrivia.club@gmail.com'),
      modal: d.matches(':modal'),
      inside: d.contains(document.activeElement),
      scroll: d.scrollWidth - d.clientWidth,
      pageScroll: document.documentElement.scrollWidth - window.innerWidth,
      fits: box.left >= 0 && box.right <= window.innerWidth + 0.5,
      emergency: Boolean(e) && !e.hidden && getComputedStyle(e).display !== 'none',
    };
  });
  check(`report dialog: modal, focus inside, fieldset legend "${dlg.legend}"`, () => { assert.equal(dlg.modal, true); assert.equal(dlg.inside, true); assert.match(dlg.legend, /Why are you reporting/); });
  check(`report reasons use the human labels and server values (${JSON.stringify(dlg.labels)})`, () => {
    assert.deepEqual(dlg.labels, ['Harassment or hate', 'Sexual or explicit content', 'Spam or scam', 'Fake profile or impersonation', 'May be under 18', 'I feel unsafe or threatened', 'Something else']);
    assert.deepEqual(dlg.values, ['harassment', 'explicit', 'spam', 'fake', 'underage', 'safety', 'other']);
  });
  check(`report dialog copy: note label, maxlength 500, button, contact line (${JSON.stringify([dlg.noteLabel, dlg.noteMax, dlg.submit])})`, () => {
    assert.match(dlg.noteLabel, /^Anything else we should know\? \(optional\)/);
    assert.match(dlg.noteLabel, /Kept for up to a year so we can review it\./);
    assert.equal(dlg.noteMax, '500'); assert.equal(dlg.submit, 'Report and block'); assert.equal(dlg.contact, true);
  });
  check(`report dialog at 375 px: no horizontal scroll, targets >= 44 px (${JSON.stringify([dlg.scroll, dlg.pageScroll, dlg.targets, dlg.submitH])})`, () => {
    assert.ok(dlg.scroll <= 0 && dlg.pageScroll <= 1 && dlg.fits);
    dlg.targets.forEach((h) => assert.ok(h >= 44)); assert.ok(dlg.submitH >= 44);
  });
  check('no 112 line before a reason is chosen', () => assert.equal(dlg.emergency, false));
  const emergency = async (value) => { await rep.locator(`dialog.report-dialog input[value="${value}"]`).check(); return rep.evaluate(() => { const e = document.querySelector('[data-report-emergency]'); return { shown: !e.hidden && getComputedStyle(e).display !== 'none', text: e.textContent.trim() }; }); };
  const eSafety = await emergency('safety'); const eUnder = await emergency('underage'); const eSpam = await emergency('spam');
  check(`the 112 line shows for safety and underage only (${JSON.stringify([eSafety.shown, eUnder.shown, eSpam.shown])})`, () => {
    assert.equal(eSafety.shown, true); assert.equal(eUnder.shown, true); assert.equal(eSpam.shown, false);
    assert.equal(eSafety.text, 'If anyone is in immediate danger, call 112.');
  });
  let escaped = false;
  for (let i = 0; i < 14; i += 1) { await rep.keyboard.press('Tab'); if (!await rep.evaluate(() => document.querySelector('dialog.report-dialog').contains(document.activeElement))) escaped = true; }
  check('Tab stays inside the report dialog (focus trap)', () => assert.equal(escaped, false));
  await rep.keyboard.press('Escape');
  await rep.waitForFunction(() => !document.querySelector('dialog.report-dialog[open]'));
  // The dialog's `close` event (which removes it and restores focus) is queued after `open` is removed, so wait, bounded.
  await rep.waitForFunction(() => /card-more/.test(document.activeElement?.className || ''), null, { timeout: 3000 }).catch(() => {});
  const back = await rep.evaluate(() => document.activeElement?.className || '');
  check(`Escape closes the dialog and returns focus to the overflow button (${back})`, () => assert.match(back, /card-more/));
  check('closing the dialog reported nothing', () => assert.equal(reportCalls().length, 0));
  await rep.locator('#swipe-card .card-more').click();
  await rep.locator('.card-more-menu [data-card-action="report"]').click();
  await rep.waitForSelector('dialog.report-dialog[open]');
  await rep.locator('[data-report-submit]').click();
  const noReason = await rep.evaluate(() => document.querySelector('[data-report-error]')?.textContent?.trim() || '');
  check(`submit with no reason shows "${noReason}" and sends nothing`, () => { assert.match(noReason, /Choose a reason/); assert.equal(reportCalls().length, 0); });
  st.report = 'cap';
  await rep.locator('dialog.report-dialog input[value="spam"]').check();
  const interBefore = passes().length;
  await rep.locator('[data-report-submit]').click();
  await rep.waitForFunction(() => /several reports/.test(document.querySelector('[data-report-error]')?.textContent || '')).catch(() => {});
  const capText = await rep.evaluate(() => ({ err: document.querySelector('[data-report-error]')?.textContent?.trim(), role: document.querySelector('[data-report-error]')?.getAttribute('role'), open: Boolean(document.querySelector('dialog.report-dialog')?.open) }));
  check(`PT429 shows the cap copy in role=alert and keeps the dialog open (${JSON.stringify(capText)})`, () => {
    assert.equal(capText.err, "You've sent several reports today. For anything urgent, email thebrivia.club@gmail.com.");
    assert.equal(capText.role, 'alert'); assert.equal(capText.open, true);
  });
  const capName = await cardName(rep);
  check(`after the cap the card did not advance (${capName})`, () => assert.equal(capName, 'Asha Band'));
  const capBody = JSON.parse(reportCalls().at(-1)?.body || '{}');
  check(`the RPC body is { p_target, p_reason, p_note } with a null note when empty (${JSON.stringify(capBody)})`, () => assert.deepEqual(capBody, { p_target: A, p_reason: 'spam', p_note: null }));
  st.report = 'ok';
  await rep.locator('dialog.report-dialog input[value="harassment"]').check();
  await rep.locator('dialog.report-dialog textarea').fill('  rude messages  ');
  await rep.locator('[data-report-submit]').click();
  await waitForCard(rep, 'Bilal Place');
  await rep.waitForFunction(() => !document.querySelector('dialog.report-dialog[open]'));
  const sent = JSON.parse(reportCalls().at(-1)?.body || '{}');
  check(`submit sends { p_target, p_reason, p_note } (${JSON.stringify(sent)})`, () => assert.deepEqual(sent, { p_target: A, p_reason: 'harassment', p_note: 'rude messages' }));
  await rep.waitForTimeout(300);
  const toastText = await rep.locator('#app-toast').textContent();
  check(`success toast names the member (${toastText})`, () => assert.equal(toastText, "Thanks. We've received your report, and you won't see Asha Band again."));
  check('the deck advanced like a Pass: one card fewer and NO pass interaction POST', () => assert.equal(passes().length, interBefore));
  const hiddenLocal = await rep.evaluate((id) => Object.entries(window.localStorage).some(([k, v]) => k.startsWith('brivia-blocked-users:') && JSON.parse(v).includes(id)), A);
  check('the reported member is also hidden locally like a block', () => assert.equal(hiddenLocal, true));
  await rep.locator('#swipe-card .card-more').click();
  await rep.locator('.card-more-menu [data-card-action="block"]').click();
  await waitForCard(rep, 'Chen Abroad');
  const blockPost = st.calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/brivia_blocks').map((c) => JSON.parse(c.body));
  check(`Block from the card inserts one brivia_blocks row and advances, with no pass (${JSON.stringify(blockPost)})`, () => { assert.deepEqual(blockPost, [{ blocker_id: ME, blocked_id: B }]); assert.equal(passes().length, interBefore); });
  // F7: a forced close while the report is in flight (Chrome closes a modal on a second Escape even when the first was
  // cancelled) still applies the outcome once the server answers: hidden locally, the toast, the deck advances.
  let releaseReport; st.reportHold = new Promise((resolve) => { releaseReport = resolve; });
  await rep.locator('#swipe-card .card-more').click();
  await rep.locator('.card-more-menu [data-card-action="report"]').click();
  await rep.waitForSelector('dialog.report-dialog[open]');
  await rep.locator('dialog.report-dialog input[value="spam"]').check();
  await rep.evaluate(() => { const t = document.querySelector('#app-toast'); if (t) t.textContent = ''; });
  const forcedBefore = reportCalls().length;
  await rep.locator('[data-report-submit]').click();
  for (let i = 0; i < 50 && reportCalls().length === forcedBefore; i += 1) await rep.waitForTimeout(100);
  await rep.evaluate(() => document.querySelector('dialog.report-dialog')?.close());
  await rep.waitForTimeout(200);
  releaseReport(); st.reportHold = null;
  const forcedAdvanced = await waitForCard(rep, 'Dana Blank');
  await rep.waitForTimeout(300);
  const forced = await rep.evaluate((id) => ({ toast: document.querySelector('#app-toast')?.textContent || '', hidden: Object.entries(window.localStorage).some(([k, v]) => k.startsWith('brivia-blocked-users:') && JSON.parse(v).includes(id)) }), C);
  check(`F7: a forced close mid-report still hides the member, shows the toast and advances (${JSON.stringify({ forcedAdvanced, ...forced })})`, () => {
    assert.equal(forcedAdvanced, true); assert.equal(forced.hidden, true);
    assert.equal(forced.toast, "Thanks. We've received your report, and you won't see Chen Abroad again.");
  });
  const roundButtons = await rep.evaluate(() => document.querySelectorAll('.swipe-actions button').length);
  check(`no third round action beside Pass and Pitch (${roundButtons} buttons)`, () => assert.equal(roundButtons, 2));
  await repCtx.close();

  // 7c. F7: reporting from a chat closes the chat and puts focus on the chat list, not on <body>.
  resetStub({ matchIds: [A] });
  const chatCtx = await makeContext({ width: 1280, height: 900 });
  const chatPage = await open(chatCtx);
  await chatPage.evaluate(() => document.querySelector('[data-nav="chat"]')?.click());
  await chatPage.waitForSelector(`#chat-list [data-chat-id="${A}"]`, { timeout: 8000 }).catch(() => {});
  await chatPage.locator(`#chat-list .chat-row-open[data-chat-id="${A}"]`).click();
  await chatPage.waitForSelector('#chat-more', { timeout: 5000 });
  await chatPage.locator('#chat-more').click();
  await chatPage.locator('[data-chat-action="report"]').click();
  await chatPage.waitForSelector('dialog.report-dialog[open]');
  await chatPage.locator('dialog.report-dialog input[value="harassment"]').check();
  await chatPage.locator('[data-report-submit]').click();
  await chatPage.waitForFunction(() => !document.querySelector('dialog.report-dialog'), null, { timeout: 5000 }).catch(() => {});
  await chatPage.waitForTimeout(400);
  const chatFocus = await chatPage.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.tagName, inChatView: Boolean(el?.closest('[data-view="chat"]')), windowHidden: document.querySelector('#chat-window')?.hidden, toast: document.querySelector('#app-toast')?.textContent || '' };
  });
  check(`F7: after a chat report the chat closes and focus is on the chat list (${JSON.stringify(chatFocus)})`, () => {
    assert.equal(chatFocus.windowHidden, true);
    assert.notEqual(chatFocus.tag, 'BODY'); assert.equal(chatFocus.inChatView, true);
    assert.match(chatFocus.toast, /won't see Asha Band again/);
  });
  await chatCtx.close();

  // 7d. Phase D, Task 3: "Why this person?" for testers only (rpc/deck_why answers a row only in the test world).
  const WHY_SHOTS = process.env.WHY_SHOTS || '';
  const whyCalls = () => st.calls.filter((c) => c.path === '/rest/v1/rpc/deck_why');
  const whyRowA = { shared_interests: ['Badminton', 'Chess'], distance_band: '~3 km', rank_keys: { has_shared: true, shared_count: 2, ring: 0, overlap_level: 3, tie_break: 'daily' } };
  const whyRowB = { shared_interests: ['Badminton'], distance_band: 'Pune', rank_keys: { has_shared: true, shared_count: 1, ring: 2, overlap_level: 2, tie_break: 'daily' } };
  const whyState = (page) => page.evaluate(() => {
    const toggle = document.querySelector('#why-toggle');
    const panel = document.querySelector('#why-panel');
    const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width } : null; };
    const visible = (el) => Boolean(el) && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
    return {
      toggle: visible(toggle), text: toggle?.textContent?.trim() || '', expanded: toggle?.getAttribute('aria-expanded'),
      controls: toggle?.getAttribute('aria-controls'), panel: visible(panel), panelText: panel?.innerText?.replace(/\s+/g, ' ').trim() || '',
      toggleBox: box(toggle), panelBox: box(panel), cardBox: box(document.querySelector('#swipe-card')),
      actions: [...document.querySelectorAll('.swipe-actions button')].map(box),
      fonts: panel ? [...panel.querySelectorAll('*')].filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((el) => parseFloat(getComputedStyle(el).fontSize)) : [],
      toggleFont: toggle ? parseFloat(getComputedStyle(toggle).fontSize) : 0,
      pageScroll: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  const overlaps = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  for (const [label, viewport] of [['1440', { width: 1440, height: 900 }], ['375', { width: 375, height: 812 }]]) {
    resetStub({ why: { [A]: whyRowA, [B]: whyRowB } });
    const whyStart = whyCalls().length;
    const testerCtx = await makeContext(viewport);
    const tp = await open(testerCtx);
    await waitForCard(tp, 'Asha Band');
    const shown = await tp.waitForFunction(() => { const t = document.querySelector('#why-toggle'); return t && !t.hidden && t.getBoundingClientRect().height > 0; }, null, { timeout: 5000 }).then(() => true, () => false);
    let w = await whyState(tp);
    check(`${label}: a tester sees "Why this person?" on the card, collapsed (${JSON.stringify([shown, w.text, w.expanded, w.controls])})`, () => {
      assert.equal(shown, true); assert.equal(w.text, 'Why this person?'); assert.equal(w.expanded, 'false');
      assert.equal(w.controls, 'why-panel'); assert.equal(w.panel, false);
    });
    check(`${label}: deck_why was asked for the shown card (${JSON.stringify(whyCalls().slice(whyStart).map((c) => c.body))})`, () => {
      assert.ok(whyCalls().length > whyStart); assert.deepEqual(JSON.parse(whyCalls()[whyStart].body), { p_target: A });
    });
    check(`${label}: the toggle is a 44 px target with text >= 12 px (${JSON.stringify([w.toggleBox?.height, w.toggleFont])})`, () => {
      assert.ok(w.toggleBox.height >= 44); assert.ok(w.toggleFont >= 12);
    });
    if (WHY_SHOTS) await tp.locator('#swipe-card').screenshot({ path: path.join(WHY_SHOTS, `why-closed-${label}.png`) });
    await tp.locator('#why-toggle').click();
    await tp.waitForTimeout(300);
    w = await whyState(tp);
    check(`${label}: the panel opens and lists the shared interests, the band and the rank keys (${w.panelText.slice(0, 160)})`, () => {
      assert.equal(w.expanded, 'true'); assert.equal(w.panel, true);
      assert.match(w.panelText, /You both: Badminton, Chess/);
      assert.match(w.panelText, /Distance: ~3 km/);
      assert.match(w.panelText, /Shares an interest Yes, 2 in common/);
      assert.match(w.panelText, /Interest overlap High/);
    });
    check(`${label}: the open panel stays inside the card, covers neither Pass nor Pitch, text >= 12 px, no page scroll (${JSON.stringify({ panel: w.panelBox, card: w.cardBox, fonts: [...new Set(w.fonts)], scroll: w.pageScroll })})`, () => {
      assert.ok(w.panelBox.top >= w.cardBox.top - 0.5 && w.panelBox.bottom <= w.cardBox.bottom + 0.5);
      assert.ok(w.panelBox.left >= w.cardBox.left - 0.5 && w.panelBox.right <= w.cardBox.right + 0.5);
      w.actions.forEach((a) => assert.ok(!overlaps(a, w.panelBox) && !overlaps(a, w.toggleBox)));
      assert.ok(w.fonts.length > 0); w.fonts.forEach((f) => assert.ok(f >= 12));
      assert.ok(w.pageScroll <= 1);
    });
    const whyAxe = await axeViolations(tp, { include: '#swipe-card', decorative: ['.swipe-card-info::before'] });
    check(`${label}: axe finds nothing on the card with the panel open (${whyAxe.join(' | ').slice(0, 300)})`, () => assert.deepEqual(whyAxe, []));
    if (WHY_SHOTS) await tp.locator('#swipe-card').screenshot({ path: path.join(WHY_SHOTS, `why-panel-${label}.png`) });
    if (WHY_SHOTS) await tp.screenshot({ path: path.join(WHY_SHOTS, `why-panel-page-${label}.png`) });
    // Keyboard: Enter on the focused toggle closes it, Space opens it again, Escape closes and keeps focus on it.
    await tp.locator('#why-toggle').focus();
    await tp.keyboard.press('Enter');
    const afterEnter = (await whyState(tp)).expanded;
    await tp.keyboard.press(' ');
    const afterSpace = (await whyState(tp)).expanded;
    await tp.keyboard.press('Escape');
    const afterEsc = await tp.evaluate(() => ({ expanded: document.querySelector('#why-toggle').getAttribute('aria-expanded'), focus: document.activeElement?.id, panelHidden: document.querySelector('#why-panel').hidden }));
    check(`${label}: keyboard toggles the panel; Escape closes it and keeps focus (${JSON.stringify([afterEnter, afterSpace, afterEsc])})`, () => {
      assert.equal(afterEnter, 'false'); assert.equal(afterSpace, 'true');
      assert.deepEqual(afterEsc, { expanded: 'false', focus: 'why-toggle', panelHidden: true });
    });
    // The next card: the panel starts closed and explains that card.
    await tp.locator('#why-toggle').click();
    await tp.locator('[data-action="pass"]').click();
    await waitForCard(tp, 'Bilal Place');
    await tp.waitForFunction(() => document.querySelector('#why-panel')?.dataset.for === 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002', null, { timeout: 5000 }).catch(() => {});
    w = await whyState(tp);
    const bExpanded = w.expanded;
    await tp.locator('#why-toggle').click();
    w = await whyState(tp);
    check(`${label}: the next card's panel starts closed and explains that card (${JSON.stringify([bExpanded, w.panelText.slice(0, 120)])})`, () => {
      assert.equal(bExpanded, 'false'); assert.match(w.panelText, /You both: Badminton/); assert.match(w.panelText, /Distance: Pune/);
      assert.match(w.panelText, /Distance tier Same area/); assert.doesNotMatch(w.panelText, /Chess/);
    });
    // A card deck_why has no row for (C): no button, the tester is still a tester.
    await tp.locator('[data-action="pass"]').click();
    await waitForCard(tp, 'Chen Abroad');
    await tp.waitForFunction(() => [...performance.getEntriesByType('resource')].filter((e) => e.name.includes('/rpc/deck_why')).length >= 3, null, { timeout: 5000 }).catch(() => {});
    await tp.waitForTimeout(300);
    w = await whyState(tp);
    check(`${label}: no button on a card deck_why has no row for (${JSON.stringify([w.toggle, whyCalls().length])})`, () => { assert.equal(w.toggle, false); assert.equal(w.panel, false); });
    await testerCtx.close();
  }

  // A real member: deck_why answers [] once; the client never asks again this session and shows no button.
  resetStub();
  const whyBefore = whyCalls().length;   // st.calls spans the whole run
  const realCtx = await makeContext({ width: 1440, height: 900 });
  const rp = await open(realCtx);
  await waitForCard(rp, 'Asha Band');
  await rp.waitForFunction(() => performance.getEntriesByType('resource').some((e) => e.name.includes('/rpc/deck_why')), null, { timeout: 5000 }).catch(() => {});
  await rp.waitForTimeout(300);
  const firstCalls = whyCalls().length - whyBefore;
  for (const next of ['Bilal Place', 'Chen Abroad', 'Dana Blank']) {
    await rp.locator('[data-action="pass"]').click();
    await waitForCard(rp, next);
  }
  await rp.waitForTimeout(500);
  const realWhy = await whyState(rp);
  check(`a real member asks rpc/deck_why once, never again after the negative, and sees no button (${JSON.stringify([firstCalls, whyCalls().length - whyBefore, realWhy.toggle])})`, () => {
    assert.equal(firstCalls, 1); assert.equal(whyCalls().length - whyBefore, 1); assert.equal(realWhy.toggle, false); assert.equal(realWhy.panel, false);
  });
  await realCtx.close();

  // Final fix 2: a transient deck_why error must not make a tester look like a non-tester for the whole session.
  // First answer 500, then 200-with-row: the next card asks again and the button appears.
  resetStub({ why: { [A]: whyRowA, [B]: whyRowB }, whyStatuses: [500] });
  const errBefore = whyCalls().length;
  const errCtx = await makeContext({ width: 1440, height: 900 });
  const ep = await open(errCtx);
  await waitForCard(ep, 'Asha Band');
  await ep.waitForFunction((n) => [...performance.getEntriesByType('resource')].filter((e) => e.name.includes('/rpc/deck_why')).length >= n, 1, { timeout: 5000 }).catch(() => {});
  await ep.waitForTimeout(300);
  let ew = await whyState(ep);
  check(`a deck_why 500 shows no button on that card (${JSON.stringify([ew.toggle, whyCalls().length - errBefore])})`, () => { assert.equal(ew.toggle, false); assert.equal(whyCalls().length - errBefore, 1); });
  await ep.locator('[data-action="pass"]').click();
  await waitForCard(ep, 'Bilal Place');
  const recovered = await ep.waitForFunction(() => { const t = document.querySelector('#why-toggle'); return t && !t.hidden && t.getBoundingClientRect().height > 0; }, null, { timeout: 5000 }).then(() => true, () => false);
  check(`after a 500 the next card asks again and the button appears (${JSON.stringify([recovered, whyCalls().length - errBefore])})`, () => { assert.equal(recovered, true); assert.equal(whyCalls().length - errBefore, 2); });
  await errCtx.close();

  // 404 / PGRST202 (0008 not applied): "not a tester", never asked again.
  resetStub({ why: { [A]: whyRowA, [B]: whyRowB }, whyStatuses: [404] });
  const nfBefore = whyCalls().length;
  const nfCtx = await makeContext({ width: 1440, height: 900 });
  const np = await open(nfCtx);
  await waitForCard(np, 'Asha Band');
  await np.waitForTimeout(500);
  for (const next of ['Bilal Place', 'Chen Abroad']) { await np.locator('[data-action="pass"]').click(); await waitForCard(np, next); }
  await np.waitForTimeout(500);
  const nfw = await whyState(np);
  check(`a deck_why 404 is asked once and never again (${JSON.stringify([whyCalls().length - nfBefore, nfw.toggle])})`, () => { assert.equal(whyCalls().length - nfBefore, 1); assert.equal(nfw.toggle, false); });
  await nfCtx.close();

  // Three consecutive errors in a session stop the asking (at most once per card until then).
  resetStub({ why: { [A]: whyRowA, [B]: whyRowB }, whyStatuses: [500, 500, 500, 500, 500] });
  const capBefore = whyCalls().length;
  const capCtx = await makeContext({ width: 1440, height: 900 });
  const cp = await open(capCtx);
  await waitForCard(cp, 'Asha Band');
  await cp.waitForTimeout(400);
  for (const next of ['Bilal Place', 'Chen Abroad', 'Dana Blank']) { await cp.locator('[data-action="pass"]').click(); await waitForCard(cp, next); await cp.waitForTimeout(400); }
  check(`after 3 consecutive deck_why errors the client stops asking (${whyCalls().length - capBefore} calls over 4 cards)`, () => assert.equal(whyCalls().length - capBefore, 3));
  await capCtx.close();

  {
  // 9. Founder live test (2026-10-14): the heavy swipe, the pitched card staying put, the cover placeholder and the
  // desktop alignment. SWIPE_SHOTS=<dir> saves mid-drag, stack, pitch-behind-sheet and layout screenshots.
  const SWIPE_SHOTS = process.env.SWIPE_SHOTS || '';
  const swipeShot = async (pg, name) => { if (SWIPE_SHOTS) await pg.screenshot({ path: path.join(SWIPE_SHOTS, name) }); };
  const signals = () => st.calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/rpc/send_signal');
  const cardBox = (pg) => pg.evaluate(() => { const r = document.querySelector('#swipe-card').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  // A slow mouse drag (each step 16 ms apart), held still before the release so the fling velocity is ~0.
  const slowDrag = async (pg, dx, { hold = true, from = null, release = true } = {}) => {
    const box = await cardBox(pg);
    const start = from || { x: box.cx, y: box.y + box.h * 0.3 };
    await pg.mouse.move(start.x, start.y);
    await pg.mouse.down();
    const steps = 14;
    for (let i = 1; i <= steps; i += 1) { await pg.mouse.move(start.x + (dx * i) / steps, start.y + i); await pg.waitForTimeout(16); }
    if (hold) await pg.waitForTimeout(160);
    if (release) await pg.mouse.up();
    return box;
  };
  const sheetOpen = (pg) => pg.evaluate(() => !document.querySelector('#pitch-modal')?.hidden);
  const rotationOf = (pg) => pg.evaluate(() => {
    const t = getComputedStyle(document.querySelector('#swipe-card')).transform;
    if (!t || t === 'none') return 0;
    const [a, b] = t.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
    return Math.round(Math.atan2(b, a) * (180 / Math.PI) * 10) / 10;
  });

  resetStub();
  const sw = await makeContext({ width: 1440, height: 900 });
  const sp = await open(sw);
  await waitForCard(sp, 'Asha Band');
  await sp.waitForTimeout(500);
  const stackState = await sp.evaluate(() => ({ next: !document.querySelector('#swipe-card-next')?.hidden, nextName: document.querySelector('#swipe-next-name')?.textContent?.trim(), aria: document.querySelector('#swipe-card-next')?.getAttribute('aria-hidden') }));
  check(`the next card waits underneath as a stack, decorative (${JSON.stringify(stackState)})`, () => assert.deepEqual(stackState, { next: true, nextName: 'Bilal Place', aria: 'true' }));
  await swipeShot(sp, 'stack-1440.png');

  // A short drag springs back: nothing sent, same card, no stamp left.
  let signalsBefore = signals().length;
  let passesBefore = passes().length;
  const w = (await cardBox(sp)).w;
  await slowDrag(sp, w * 0.2);
  await sp.waitForTimeout(600);
  const springState = await sp.evaluate(() => ({ name: document.querySelector('#swipe-name').textContent.trim(), transform: document.querySelector('#swipe-card').style.transform, pitch: document.querySelector('#swipe-card').style.getPropertyValue('--swipe-pitch'), sheet: !document.querySelector('#pitch-modal').hidden }));
  check(`a short drag (20% of the width) springs back and sends nothing (${JSON.stringify(springState)})`, () => {
    assert.equal(springState.name, 'Asha Band');
    assert.equal(springState.transform, '');
    assert.equal(springState.pitch, '0');
    assert.equal(springState.sheet, false);
    assert.equal(signals().length, signalsBefore);
    assert.equal(passes().length, passesBefore);
  });

  // Mid-drag: the card follows the pointer with a rotation and the stamp of the side.
  await slowDrag(sp, -w * 0.28, { release: false });
  const midLeft = await sp.evaluate(() => ({ pass: Number(getComputedStyle(document.querySelector('.swipe-stamp-pass')).opacity), pitch: Number(getComputedStyle(document.querySelector('.swipe-stamp-pitch')).opacity), held: document.querySelector('#swipe-card').classList.contains('is-held') }));
  const midLeftTurn = await rotationOf(sp);
  await swipeShot(sp, 'drag-left-1440.png');
  check(`mid-drag left: PASS stamp shows, the card turns left and lifts (${JSON.stringify({ ...midLeft, turn: midLeftTurn })})`, () => {
    assert.ok(midLeft.pass > 0.8 && midLeft.pitch === 0);
    assert.ok(midLeftTurn < -5 && midLeftTurn >= -12);
    assert.equal(midLeft.held, true);
  });
  await sp.mouse.move((await cardBox(sp)).cx, 300); // back near the centre, then let go: springs back
  await sp.waitForTimeout(200);
  await sp.mouse.up();
  await sp.waitForTimeout(600);
  await slowDrag(sp, w * 0.28, { release: false });
  const midRight = await sp.evaluate(() => Number(getComputedStyle(document.querySelector('.swipe-stamp-pitch')).opacity));
  const midRightTurn = await rotationOf(sp);
  await swipeShot(sp, 'drag-right-1440.png');
  check(`mid-drag right: PITCH stamp shows and the card turns right (${midRight}, ${midRightTurn})`, () => { assert.ok(midRight > 0.8); assert.ok(midRightTurn > 5 && midRightTurn <= 12); });
  await sp.mouse.up();
  await sp.waitForTimeout(600);

  // Drag right past 30%: the pitch sheet opens about this card, the card stays the current card, nothing is sent.
  const rightName = await cardName(sp);
  signalsBefore = signals().length;
  await slowDrag(sp, w * 0.45);
  await sp.waitForSelector('#pitch-modal:not([hidden])', { timeout: 3000 }).catch(() => {});
  await sp.waitForTimeout(700);
  const pitched = await sp.evaluate(() => ({ name: document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent?.trim(), pitchName: document.querySelector('#pitch-name')?.textContent?.trim(), parked: document.querySelector('#swipe-card').classList.contains('is-parked'), visible: (() => { const r = document.querySelector('#swipe-card').getBoundingClientRect(); return r.right > 0 && r.left < innerWidth; })() }));
  await swipeShot(sp, 'pitch-behind-sheet-1440.png');
  const sheetOpenNow = await sheetOpen(sp);
  check(`drag right past 30% opens the pitch for that card, which stays on screen (${JSON.stringify(pitched)})`, () => {
    assert.equal(sheetOpenNow, true);
    assert.equal(pitched.name, rightName);
    assert.equal(pitched.pitchName, rightName);
    assert.equal(pitched.parked, true);
    assert.equal(pitched.visible, true);
  });
  check('a right swipe alone sends nothing (mutual consent: only the sheet resolving sends)', () => assert.equal(signals().length, signalsBefore));
  // Sending the pitch: one signal with the note, then the card leaves.
  await sp.locator('#pitch-message').fill('Hello from a swipe');
  await sp.locator('.pitch-submit').click();
  await waitForCard(sp, 'Bilal Place');
  const swipeSent = signals().slice(signalsBefore).map((c) => JSON.parse(c.body || '{}'));
  check(`sending the pitch sends one signal with the note, then the deck advances (${JSON.stringify(swipeSent)})`, () => assert.deepEqual(swipeSent, [{ p_to: A, p_note: 'Hello from a swipe' }]));

  // Drag left past 30%: a Pass (one interaction POST) and the next card shows.
  passesBefore = passes().length;
  await sp.waitForTimeout(400);
  await slowDrag(sp, -w * 0.45);
  const leftOk = await waitForCard(sp, 'Chen Abroad');
  const passBodies = passes().slice(passesBefore).map((c) => JSON.parse(c.body || '{}'));
  check(`drag left past 30% passes and the next card shows (${JSON.stringify(passBodies)})`, () => { assert.equal(leftOk, true); assert.equal(passBodies.length, 1); assert.equal(passBodies[0].target_id, B); assert.equal(passBodies[0].event, 'pass'); });
  await sp.waitForTimeout(400);
  const settled = await sp.evaluate(() => ({ transform: document.querySelector('#swipe-card').style.transform, opacity: getComputedStyle(document.querySelector('#swipe-card')).opacity }));
  check(`the next card takes the front at rest (${JSON.stringify(settled)})`, () => { assert.equal(settled.transform, ''); assert.equal(settled.opacity, '1'); });

  // A fast short fling commits.
  await sp.waitForTimeout(200);
  {
    const box = await cardBox(sp);
    passesBefore = passes().length;
    // Raw CDP mouse events with timestamps 12 ms apart (Playwright's own moves are too slow to fling headless).
    const mcdp = await sw.newCDPSession(sp);
    const t0 = Date.now() / 1000;
    const ev = (type, x, dt, extra = {}) => mcdp.send('Input.dispatchMouseEvent', { type, x, y: box.y + 200, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, timestamp: t0 + dt, ...extra });
    await ev('mouseMoved', box.cx, 0, { buttons: 0, button: 'none' });
    await ev('mousePressed', box.cx, 0.01);
    for (let i = 1; i <= 4; i += 1) await ev('mouseMoved', box.cx - i * 20, 0.01 + i * 0.012);
    await ev('mouseReleased', box.cx - 80, 0.07);
    await mcdp.detach();
    const flung = await waitForCard(sp, 'Dana Blank');
    check(`a fast short fling left (80 px) commits a Pass (${passes().length - passesBefore})`, () => { assert.equal(flung, true); assert.equal(passes().length - passesBefore, 1); });
  }

  // No click-through: a drag that starts on VIEW PROFILE never opens the profile.
  await sp.waitForTimeout(400);
  {
    const btn = await sp.locator('#swipe-card .view-info-button').boundingBox();
    await slowDrag(sp, 70, { from: { x: btn.x + btn.width / 2, y: btn.y + btn.height / 2 } });
    await sp.waitForTimeout(500);
    const opened = await sp.evaluate(() => Boolean(document.querySelector('#public-profile-modal')));
    check('a drag starting on VIEW PROFILE does not open the profile (no click-through)', () => assert.equal(opened, false));
    await sp.locator('#swipe-card .view-info-button').click();
    const tapped = await sp.waitForSelector('#public-profile-modal', { timeout: 3000 }).then(() => true, () => false);
    check('a plain click on VIEW PROFILE still opens the profile', () => assert.equal(tapped, true));
    await sp.evaluate(() => document.querySelector('#public-profile-modal [data-public-profile-close]')?.click());
  }
  // Dana has no cover and no photo: the branded placeholder, never the alt text.
  const dana = await sp.evaluate(() => { const img = document.querySelector('#swipe-image'); return { name: document.querySelector('#swipe-name').textContent.trim(), placeholder: img.parentElement.classList.contains('is-placeholder'), imgShown: img.getClientRects().length > 0, src: img.getAttribute('src') }; });
  check(`no cover and no photo: the placeholder shows, the img (and its alt text) does not (${JSON.stringify(dana)})`, () => { assert.equal(dana.name, 'Dana Blank'); assert.equal(dana.placeholder, true); assert.equal(dana.imgShown, false); });
  await sw.close();

  // Buttons and arrow keys use the same motion; Pitch keeps the card until the sheet resolves.
  resetStub();
  const kb = await makeContext({ width: 1440, height: 900 });
  const kp = await open(kb);
  await waitForCard(kp, 'Asha Band');
  await kp.waitForTimeout(500);
  signalsBefore = signals().length;
  await kp.locator('[data-action="like"]').click();
  await kp.waitForSelector('#pitch-modal:not([hidden])');
  await kp.waitForTimeout(700);
  const btnPitch = { name: await cardName(kp), parked: await kp.evaluate(() => document.querySelector('#swipe-card').classList.contains('is-parked')) };
  check(`the Pitch button keeps the pitched card on screen behind the sheet (${JSON.stringify(btnPitch)})`, () => { assert.equal(btnPitch.name, 'Asha Band'); assert.equal(btnPitch.parked, true); assert.equal(signals().length, signalsBefore); });
  await kp.keyboard.press('Escape');
  const afterEsc = await waitForCard(kp, 'Bilal Place');
  const escSignals = signals().slice(signalsBefore).map((c) => JSON.parse(c.body || '{}'));
  check(`closing the sheet sends the plain like (D-018) and only then the card leaves (${JSON.stringify(escSignals)})`, () => { assert.equal(afterEsc, true); assert.deepEqual(escSignals, [{ p_to: A, p_note: null }]); });
  await kp.waitForTimeout(400);
  passesBefore = passes().length;
  await kp.locator('#swipe-card').focus().catch(() => {});
  await kp.keyboard.press('ArrowLeft');
  const arrowLeft = await waitForCard(kp, 'Chen Abroad');
  check(`ArrowLeft passes (${passes().length - passesBefore})`, () => { assert.equal(arrowLeft, true); assert.equal(passes().length - passesBefore, 1); });
  await kp.waitForTimeout(400);
  await kp.keyboard.press('ArrowRight');
  const arrowRight = await kp.waitForSelector('#pitch-modal:not([hidden])', { timeout: 3000 }).then(() => true, () => false);
  await kp.waitForTimeout(500);
  const arrowRightName = await cardName(kp);
  check(`ArrowRight opens the pitch for the current card, which stays (${arrowRightName})`, () => { assert.equal(arrowRight, true); assert.equal(arrowRightName, 'Chen Abroad'); });
  await kp.keyboard.press('Escape');
  await waitForCard(kp, 'Dana Blank');
  await kp.waitForTimeout(400);
  passesBefore = passes().length;
  await kp.locator('[data-action="pass"]').click();
  await kp.waitForTimeout(150);
  const midFly = await kp.evaluate(() => document.querySelector('#swipe-card').style.transform);
  await kp.waitForTimeout(500);
  check(`the Pass button flies the card off with the same motion (${midFly.slice(0, 60)})`, () => { assert.match(midFly, /translate3d\(-\d/); assert.equal(passes().length - passesBefore, 1); });
  await kb.close();

  // Reduced motion: no rotation while dragging, and a commit is a quick cross-fade.
  resetStub();
  const rm = await stub.newContext(browser, { width: 1440, height: 900 }, { reducedMotion: 'reduce' });
  const rp2 = await open(rm);
  await waitForCard(rp2, 'Asha Band');
  await rp2.waitForTimeout(500);
  await slowDrag(rp2, -w * 0.4, { release: false });
  const rmTurn = await rotationOf(rp2);
  await rp2.mouse.up();
  const rmNext = await waitForCard(rp2, 'Bilal Place');
  const rmAfter = await rp2.evaluate(() => getComputedStyle(document.querySelector('#swipe-card')).transform);
  check(`reduced motion: no rotation mid-drag (${rmTurn}) and the pass still works`, () => { assert.equal(rmTurn, 0); assert.equal(rmNext, true); });
  check(`reduced motion: the card rests with no transform (${rmAfter})`, () => assert.equal(rmAfter, 'none'));
  await rm.close();

  // Desktop alignment: the card top is below the top bar and Pass / Pitch sit centred under the card.
  for (const [vw, vh] of [[1920, 1080], [1366, 768], [1440, 900], [1280, 720]]) {
    resetStub();
    const lc = await makeContext({ width: vw, height: vh });
    const lp = await open(lc);
    await waitForCard(lp, 'Asha Band');
    await lp.waitForTimeout(600);
    const m = await lp.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const nav = r('.app-topbar'); const card = r('#swipe-card'); const pass = r('.swipe-pass'); const like = r('.swipe-like'); const hint = r('.swipe-hint');
      return { navBottom: Math.round(nav.bottom), cardTop: Math.round(card.top), cardBottom: Math.round(card.bottom), cardCx: Math.round(card.left + card.width / 2), actionsCx: Math.round((pass.left + like.right) / 2), actionsTop: Math.round(pass.top), hintBottom: Math.round(hint.bottom), vh: innerHeight };
    });
    if ([1920, 1366].includes(vw)) await swipeShot(lp, `layout-${vw}x${vh}.png`);
    check(`${vw}x${vh}: card top ${m.cardTop} is below the top bar (${m.navBottom}); controls under the card, centred (${m.actionsCx} vs ${m.cardCx}), all on screen (${m.hintBottom} <= ${m.vh})`, () => {
      assert.ok(m.cardTop >= m.navBottom);
      assert.ok(Math.abs(m.actionsCx - m.cardCx) <= 40);
      assert.ok(m.actionsTop > m.cardBottom);
      assert.ok(m.hintBottom <= m.vh);
    });
    if (vw === 1920) {
      const ax = await axeViolations(lp, { include: '.app-view[data-view="home"]', decorative: ['.swipe-card-info::before'] });
      check(`axe: the deck with the stack and stamps is clean (${ax.join(' | ')})`, () => assert.deepEqual(ax, []));
    }
    await lc.close();
  }

  // A cover that fails to load (a broken path) falls back to the placeholder, never the alt text.
  resetStub({ rows: [{ ...deckRows[0], photo_url: null, cover_url: '/assets/no-such-cover-xyz.webp' }, deckRows[1]] });
  const bc = await makeContext({ width: 1440, height: 900 });
  const bp = await open(bc);
  await waitForCard(bp, 'Asha Band');
  await bp.waitForFunction(() => document.querySelector('#swipe-image')?.parentElement?.classList.contains('is-placeholder'), null, { timeout: 4000 }).catch(() => {});
  const broken = await bp.evaluate(() => { const img = document.querySelector('#swipe-image'); return { placeholder: img.parentElement.classList.contains('is-placeholder'), imgShown: img.getClientRects().length > 0 }; });
  await swipeShot(bp, 'broken-cover-1440.png');
  check(`a broken cover shows the placeholder and no alt text (${JSON.stringify(broken)})`, () => { assert.equal(broken.placeholder, true); assert.equal(broken.imgShown, false); });
  await bc.close();

  // Touch: a horizontal touch drag swipes; a vertical one scrolls the page and leaves the card alone.
  resetStub();
  const tc = await stub.newContext(browser, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  const tp2 = await open(tc);
  await waitForCard(tp2, 'Asha Band');
  await tp2.waitForTimeout(500);
  const cdp = await tc.newCDPSession(tp2);
  const touch = async (points) => {
    const [first, ...rest] = points;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    for (const point of rest) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] }); await tp2.waitForTimeout(16); }
    await tp2.waitForTimeout(150);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const tbox = await cardBox(tp2);
  const scrollBefore = await tp2.evaluate(() => window.scrollY);
  const touchPassesBefore = passes().length;
  await touch(Array.from({ length: 12 }, (_, i) => ({ x: tbox.cx, y: Math.min(tbox.y + 300, 800) - i * 20 })));
  await tp2.waitForTimeout(500);
  const vertical = { name: await cardName(tp2), scrolled: (await tp2.evaluate(() => window.scrollY)) - scrollBefore, passes: passes().length - touchPassesBefore };
  check(`touch: a vertical drag scrolls the page and keeps the card (${JSON.stringify(vertical)})`, () => { assert.equal(vertical.name, 'Asha Band'); assert.ok(vertical.scrolled > 0); assert.equal(vertical.passes, 0); });
  const tbox2 = await cardBox(tp2);
  const ty = Math.max(tbox2.y + 120, 120);
  await touch(Array.from({ length: 14 }, (_, i) => ({ x: tbox2.cx - i * (tbox2.w * 0.04), y: ty + i })));
  const touchPass = await waitForCard(tp2, 'Bilal Place');
  check(`touch: a horizontal drag left past 30% passes (${passes().length - touchPassesBefore})`, () => { assert.equal(touchPass, true); assert.equal(passes().length - touchPassesBefore, 1); });
  await tc.close();
  }

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
  await stub.close();
}

results.forEach(([status, name]) => console.log(`${status}  ${name}`));
const failed = results.filter(([status]) => status === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
