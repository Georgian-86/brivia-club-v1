// Phase C, Task 2: one member navigation (header at desktop, tab bar at <= 780 px), against stubbed Supabase.
// Never touches a real Supabase project. Playwright is NOT a repo dependency; see tests/e2e/README.md.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node tests/e2e/app-shell.spec.mjs
//
// Asserts (375 px and 1440 px unless noted):
// * exactly one visible member nav: the header nav at 1440 px, the tab bar at 375 px, on every view;
// * no .profile-board-nav, #app-logout-button or .chat-sidebar-brand in the DOM; the .profile-sidebar (D-092) has no
//   control and is aria-hidden;
// * tab bar items are at least 44 x 44 px with labels of at least 12 px (375 px);
// * ?view=chat, #profile, ?view=home, a tab click (no reload) and Back: aria-current matches the visible [data-view];
// * a long name and area cause no horizontal page scroll (375 px);
// * Tab reaches each tab bar item and its focus outline is visible (375 px);
// * a conversation shows the chat badge in header and tab bar; no conversation hides it;
// * axe (full default rule set): no violations on the nav.
// * type (Phase C Task 4): on Connect, Explore, Chat (list and an open conversation), Profile, the notification panel
//   and the discovery-filter drawer, every visible text node (and ::before/::after text) is >= 12 px and set in
//   Bodoni Moda or Instrument Sans; visible h1/h2 use Bodoni Moda; a Bodoni Moda 500 italic face is loaded.
// * nothing clipped: the chat badge inside its nav item and the viewport, the deck card's VIEW PROFILE inside the card,
//   the chat compose placeholder inside its field (375 px and 1440 px).
// * profile (Phase C Task 5), new and complete member, 375 px and 1440 px: hero, "Complete your profile", interests,
//   looking for, experience in DOM order; the removed stat grid, dashboard, quick stats, details and login cards are
//   gone; the own email appears only in the ⚙ menu's "Signed in as" line; the checklist reads "1 of 5" and its first
//   item opens the editor; a complete member sees only "Profile complete"; interest bars are points/20 wide and a
//   private interest is labelled Private; one my_interests call per visit; a failed load offers Retry; a long name
//   and area cause no horizontal scroll; type audit and axe clean on the profile.
// * feel (Phase C Task 6, 375 px): a deck_candidates delayed 3 s shows the deck skeleton with the home view aria-busy
//   within 300 ms, the card replaces it with CLS < 0.1 (counted once the app is shown); a deck_candidates 500 leaves no
//   skeleton after 2 s and shows Try again, which shows the skeleton while it retries; the chat list and the posts feed
//   show skeletons and are aria-busy while delayed; the deck caught-up, inbox, posts and notifications empty states each
//   offer a button ("Write the first post" focuses the caption, "Notification settings" opens them); under reduced
//   motion .app-nav-button transitions are 0s and the shimmer is off; the post submit is aria-busy while the insert is
//   pending. Delays and failures use app-stub's per-route `routes` overrides.
// * final review fixes (run alone with APP_SHELL_FINAL_ONLY=1): at 375x667 and 390x844 the tab bar is hidden while the
//   filter drawer, a public profile, the report dialog, the profile editor, the notification / blocked / removed /
//   privacy dialogs or the pitch sheet is open, and every visible control in them is the top element at its centre; a
//   tap at SEND PITCH's centre sends exactly one rpc/send_signal; the "Profile under review" notice (at the gate and after
//   a deck refill) shows no tab bar; at 375 px an open chat thread hides the tab bar (the composer and Send on top) and
//   Back to the list shows it; the ⚙ menu stays open after a blur to nowhere or a click on "Signed in as" and the next
//   item click runs (PRIVACY & ACCOUNT, LOG OUT) while Tab / Shift+Tab out close it; a refill that throws (a malformed
//   deck_candidates answer) ends in Try again with no skeleton or uncaught error; at 375 px every visible text field,
//   textarea and select is >= 16 px (no iOS focus zoom) in each view and dialog; re-tapping Profile on the profile reads
//   my_interests no more and shows no skeleton.
// APP_SHOTS=<dir> only saves full-page screenshots of home, posts, chat and profile at 375 px and 1440 px, then exits
// (the Phase C before/after review), and runs no checks. It also saves the dialogs, the profile states, the loading
// states, the deck error and the empty posts and notifications (Phase C Tasks 4-6), and the pitch sheet (375, 1440), an
// open chat thread and the under-review notice (375) (final review). Shots at <= 780 px emulate a phone (isMobile,
// hasTouch: overlay scrollbars), so they match what a phone shows.
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { axeViolations, textAudit, TYPE_FAMILIES } from './a11y.mjs';
import { startAppStub, STILL, defaultDeckRows } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
// Pass / Pitch are out of sight since D-094 (a swipe answers the card): press them the way a keyboard user would.
const tap = (locator, sel) => (/data-action="(pass|like)"/.test(sel) ? locator.dispatchEvent('click', null, { timeout: 5000 }) : locator.click({ timeout: 5000 }));
const PORT = Number(process.env.E2E_PORT || 5195);
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.APP_SHOTS || '';
const FINAL_ONLY = Boolean(process.env.APP_SHELL_FINAL_ONLY);
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const NARROW = { width: 375, height: 812 };
const WIDE = { width: 1440, height: 900 };
const VIEWS = ['home', 'events', 'posts', 'chat', 'profile'];
// The nav item that is current for a rendered [data-view] section: the deck section is the Connect tab.
const NAV_FOR_VIEW = { home: 'explore', posts: 'posts', chat: 'chat', profile: 'profile' };
// Dialogs and menus opened by clicking these selectors in order (Phase C Task 4 pre-review).
const DIALOGS = [
  ['profile-edit', 'profile', ['#profile-photo-editor']],
  ['settings-menu', 'profile', ['#profile-settings-button']],
  ['report-dialog', 'explore', ['#card-more', '#card-more-menu [data-card-action="report"]']],
  ['post-composer', 'posts', ['#open-community-post']],
];

// Phase C Task 5: two profile states. A new member has 3 interests and nothing else; a complete member has a photo, a
// chosen (non-default) cover, 4 interests (one private), what they are looking for and their experience.
const ME_ID = '11111111-1111-4111-8111-111111111111';
const OWN_EMAIL = 'alex@test.brivia.club';
const NEW_MEMBER = {
  own: { id: ME_ID, name: 'Alex Me', full_name: 'Alex Me', email: OWN_EMAIL, phone: '+91 98765 43210', city: null, state: null, experience: '', skills: ['Badminton', 'Chess', 'Poetry'], looking_for: [], photo_url: null, cover_url: null, created_at: new Date(Date.now() - 9e6).toISOString() },
  myInterests: [
    { interest_id: 'sports.racket.badminton', label: 'Badminton', points: 10, mode: 'play' },
    { interest_id: 'games.board.chess', label: 'Chess', points: 6, mode: 'learn' },
    { interest_id: 'arts.writing.poetry', label: 'Poetry', points: 4, mode: 'play' },
  ],
};
const COMPLETE_MEMBER = {
  own: { ...NEW_MEMBER.own, experience: 'Product designer, 6 years', looking_for: ['Friends', 'Mentor', 'Co-founder'], photo_url: `https://stub.supabase.local/storage/v1/object/public/profile-photos/${ME_ID}/p.jpg`, cover_url: '/Images/Cover%20images/F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG' },
  myInterests: [
    { interest_id: 'sports.racket.badminton', label: 'Badminton', points: 8, mode: 'play' },
    { interest_id: 'games.board.chess', label: 'Chess', points: 5, mode: 'teach' },
    { interest_id: 'wellbeing.private.meditation', label: 'Meditation', points: 4, mode: 'private' },
    { interest_id: 'arts.writing.poetry', label: 'Poetry', points: 3, mode: 'learn' },
  ],
};
const useMember = (member) => { st.own = member.own; st.myInterests = member.myInterests; };
const clearMember = () => { delete st.own; delete st.myInterests; };

const results = [];
const check =(name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };

const st = { matchIds: [] };
const stub = await startAppStub({ port: PORT, state: st });
const pageErrors = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });
  const open = async (viewport, pagePath = '/app.html', extra = {}) => {
    const context = await stub.newContext(browser, viewport, { reducedMotion: 'reduce', ...extra });
    const page = await stub.open(context, { path: pagePath, errors: pageErrors });
    return { context, page };
  };
  const settle = (page) => page.waitForTimeout(700);

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    // Phone-width shots emulate a phone (overlay scrollbars, touch): headless desktop Chromium otherwise reserves a
    // 15 px classic scrollbar at 375 px and the header avatar looks cut off at the right edge (Phase C polish).
    const PHONE = { isMobile: true, hasTouch: true };
    const shotOptions = (viewport) => (viewport.width <= 780 ? PHONE : {});
    const openShot = (viewport, pagePath) => open(viewport, pagePath, shotOptions(viewport));
    st.matchIds = [A];
    for (const [tag, viewport] of [['375', NARROW], ['1440', WIDE]]) {
      for (const view of VIEWS) {
        const { context, page } = await openShot(viewport, `/app.html?view=${view === 'home' ? 'explore' : view}`);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(SHOTS, `app-${view}-${tag}.png`), fullPage: true });
        await context.close();
      }
    }
    // The dialogs and menus whose text grew in Phase C Task 4, at 375 px: profile edit, the profile settings menu, the
    // report dialog (deck card overflow) and the post composer.
    for (const [name, view, steps] of DIALOGS) {
      const { context, page } = await openShot(NARROW, `/app.html?view=${view}`);
      await page.waitForTimeout(1500);
      for (const sel of steps) { await tap(page.locator(sel).first(), sel); await page.waitForTimeout(500); }
      await page.screenshot({ path: path.join(SHOTS, `app-${name}-375.png`) });
      await context.close();
    }
    // Phase C final review: the pitch sheet (375 and 1440 px), an open chat thread and the "Profile under review" notice
    // (375 px). The ⚙ menu open at 375 px is app-settings-menu-375.png above.
    let finalShots = 0;
    for (const [tag, viewport] of [['375', NARROW], ['1440', WIDE]]) {
      const { context, page } = await openShot(viewport);
      await page.waitForTimeout(1500);
      await page.locator('[data-action="like"]').dispatchEvent('click', null, { timeout: 5000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SHOTS, `app-pitch-sheet-${tag}.png`) });
      await context.close();
      finalShots += 1;
    }
    st.messages = [{ id: 'msg-1', sender_id: A, recipient_id: ME_ID, body: 'Shall we play on Saturday?', created_at: new Date(Date.now() - 6e5).toISOString() }];
    {
      const { context, page } = await openShot(NARROW, '/app.html?view=chat');
      await page.waitForTimeout(1500);
      await page.locator('#chat-list [data-chat-id]').first().click({ timeout: 5000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SHOTS, 'app-chat-thread-375.png') });
      await context.close();
      finalShots += 1;
    }
    delete st.messages;
    {
      Object.assign(st, { onboarding: [false], onboardingCalls: 0, own: { ...NEW_MEMBER.own, adult_declared_at: new Date(Date.now() - 9e6).toISOString() } });
      const context = await stub.newContext(browser, NARROW, { reducedMotion: 'reduce', ...PHONE });
      const page = await context.newPage();
      await page.goto(`${stub.url}/app.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-under-review]', { timeout: 15000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SHOTS, 'app-under-review-375.png') });
      await context.close();
      Object.assign(st, { onboarding: [true], onboardingCalls: 0 });
      delete st.own;
      finalShots += 1;
    }
    // Phase C Task 5: the profile of a new member and of a complete member, at 375 px and 1440 px.
    for (const [name, member] of [['new', NEW_MEMBER], ['complete', COMPLETE_MEMBER]]) {
      useMember(member);
      for (const [tag, viewport] of [['375', NARROW], ['1440', WIDE]]) {
        const { context, page } = await openShot(viewport, '/app.html?view=profile');
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(SHOTS, `app-profile-${name}-${tag}.png`), fullPage: true });
        await context.close();
      }
    }
    clearMember();
    // Phase C Task 6: the loading states (every first load delayed 6 s, shot after 1.2 s) and the deck error, the empty
    // posts feed and the empty notifications panel, at 375 px and 1440 px.
    let extra = 0;
    for (const [tag, viewport] of [['375', NARROW], ['1440', WIDE]]) {
      st.routes = { 'rpc/deck_candidates': { delayMs: 6000 }, 'GET brivia_messages': { delayMs: 6000 }, 'GET community_posts': { delayMs: 6000 }, 'rpc/my_interests': { delayMs: 6000 } };
      for (const view of VIEWS) {
        const { context, page } = await openShot(viewport, `/app.html?view=${view === 'home' ? 'explore' : view}`);
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(SHOTS, `app-loading-${view}-${tag}.png`) });
        await context.close();
        extra += 1;
      }
      delete st.routes;
      st.deckFail = true;
      {
        const { context, page } = await openShot(viewport);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(SHOTS, `app-deck-error-${tag}.png`) });
        await context.close();
      }
      st.deckFail = false;
      st.matchIds = []; st.posts = [];
      {
        const { context, page } = await openShot(viewport, '/app.html?view=posts');
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(SHOTS, `app-posts-empty-${tag}.png`) });
        await page.locator('#app-notification-button').click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(SHOTS, `app-notifications-empty-${tag}.png`) });
        await context.close();
      }
      delete st.posts; st.matchIds = [A];
      extra += 3;
    }
    console.log(`saved ${VIEWS.length * 2 + DIALOGS.length + 4 + extra + finalShots} screenshots to ${SHOTS}`);
  } else {
    // Phase C final review fixes (one fix wave). APP_SHELL_FINAL_ONLY=1 runs only this section (a quicker loop).
    // Is the tab bar drawn? (display, visibility and a box).
    const tabbarShown = (page) => page.evaluate(() => {
      const bar = document.querySelector('.app-tabbar');
      if (!bar) return false;
      const s = getComputedStyle(bar);
      return s.display !== 'none' && s.visibility !== 'hidden' && bar.getBoundingClientRect().height > 0;
    });
    // Every visible interactive control inside `root`, scrolled into view, is the top element at its centre
    // (elementFromPoint): nothing (the fixed tab bar above all) covers it. Full-screen backdrops are not controls.
    const coveredControls = (page, root) => page.evaluate((sel) => {
      const box = document.querySelector(sel);
      if (!box) return { found: false, count: 0, covered: [] };
      const name = (el) => (el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : ''} "${(el.textContent || el.placeholder || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 24)}"` : 'null');
      const controls = [...box.querySelectorAll('button, a[href], input, textarea, select, [role="button"], summary')].filter((el) => {
        if (el.closest('[hidden]') || /backdrop/.test(String(el.className))) return false;
        const s = getComputedStyle(el); const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
      });
      const covered = [];
      for (const el of controls) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const ok = hit && (el === hit || el.contains(hit) || [...(el.labels || [])].some((label) => label.contains(hit)));
        if (!ok) covered.push(`${name(el)} under ${name(hit)}`);
      }
      return { found: true, count: controls.length, covered };
    }, root);
    const sendSignals = () => st.calls.filter((c) => c.path === '/rest/v1/rpc/send_signal').length;

    // F1 (critical) + F3: at 375x667 and 390x844 the tab bar is hidden while any overlay or dialog is open, and every
    // control inside it is on top; tapping SEND PITCH sends exactly one signal.
    const OVERLAYS = [
      ['discovery filter drawer', 'explore', ['#open-discovery-filters'], '#discovery-filter-drawer'],
      ['public profile', 'explore', ['#swipe-card .view-info-button'], '#public-profile-modal'],
      ['report dialog', 'explore', ['#card-more', '#card-more-menu [data-card-action="report"]'], 'dialog.report-dialog'],
      ['profile edit', 'profile', ['#profile-photo-editor'], '#profile-edit-modal'],
      ['notification settings', 'profile', ['#profile-settings-button', '[data-profile-setting="notifications"]'], '#profile-notification-settings-modal'],
      ['blocked users', 'profile', ['#profile-settings-button', '[data-profile-setting="block"]'], '#profile-blocked-modal'],
      ['removed connections', 'profile', ['#profile-settings-button', '[data-profile-setting="removed"]'], '#profile-removed-connections-modal'],
      ['privacy & account', 'profile', ['#profile-settings-button', '[data-profile-setting="privacy"]'], 'dialog.privacy-dialog'],
      ['pitch sheet', 'explore', ['[data-action="like"]'], '#pitch-modal'],
    ];
    for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
      const tag = `${viewport.width}x${viewport.height}`;
      const { context, page } = await open(viewport);
      for (const [label, view, steps, root] of OVERLAYS) {
        st.passed.clear(); st.signalled.clear();
        await page.goto(`${stub.url}/app.html?view=${view}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !document.body.classList.contains('app-auth-pending'), null, { timeout: 15000 });
        if (view === 'explore') await page.waitForFunction(() => document.querySelector('#swipe-name')?.textContent.trim() && !document.querySelector('#swipe-card')?.hidden, null, { timeout: 8000 }).catch(() => {});
        await settle(page);
        for (const sel of steps) await tap(page.locator(sel).first(), sel).catch((error) => console.log(`${label}: ${sel} failed: ${error.message.split('\n')[0]}`));
        await page.waitForFunction((sel) => { const el = document.querySelector(sel); return el && !el.hidden; }, root, { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(450);
        const result = await coveredControls(page, root);
        const bar = await tabbarShown(page);
        check(`${tag} ${label} open: the tab bar is hidden and every control in it is on top (${JSON.stringify({ bar, ...result })})`, () => {
          assert.equal(result.found, true); assert.ok(result.count >= 1); assert.deepEqual(result.covered, []); assert.equal(bar, false);
        });
        if (label === 'pitch sheet') {
          // A real tap at SEND PITCH's centre (no actionability wait, so a covering tab bar would take it).
          const before = sendSignals();
          const box = await page.locator('.pitch-submit').boundingBox();
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await page.waitForTimeout(800);
          const after = await page.evaluate(() => ({ sheet: !document.querySelector('#pitch-modal')?.hidden, view: document.body.dataset.appView }));
          check(`${tag}: tapping SEND PITCH sends exactly one rpc/send_signal and stays on Connect (${JSON.stringify({ signals: sendSignals() - before, ...after })})`, () => {
            assert.equal(sendSignals() - before, 1); assert.equal(after.sheet, false); assert.equal(after.view, 'explore');
          });
          const back = await tabbarShown(page);
          check(`${tag}: the tab bar shows again after the pitch sheet closes (${back})`, () => assert.equal(back, true));
        }
      }
      await context.close();
    }
    st.passed.clear(); st.signalled.clear(); st.remaining = 30;

    // F3: the "Profile under review" notice (375 px) shows no tab bar, at the sign-in gate and when a deck refill finds
    // the member under review.
    for (const [label, state] of [['at the gate', { onboarding: [false] }], ['after a deck refill', { onboarding: [true, false], emptyDeck: true, status: 'complete_profile' }]]) {
      Object.assign(st, state, { onboardingCalls: 0, own: { ...NEW_MEMBER.own, adult_declared_at: new Date(Date.now() - 9e6).toISOString() } });
      const context = await stub.newContext(browser, { width: 375, height: 667 }, { reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', (error) => pageErrors.push(String(error)));
      await page.goto(`${stub.url}/app.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-under-review]', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const review = await page.evaluate(() => {
        const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 30);
        return { notice: Boolean(document.querySelector('[data-under-review]')), bottomHit: Boolean(hit?.closest('[data-under-review]')) };
      });
      const bar = await tabbarShown(page);
      check(`375 under review ${label}: no tab bar over the notice (${JSON.stringify({ bar, ...review })})`, () => {
        assert.equal(review.notice, true); assert.equal(bar, false); assert.equal(review.bottomHit, true);
      });
      await context.close();
      Object.assign(st, { onboarding: [true], onboardingCalls: 0, emptyDeck: false, status: 'caught_up' });
      delete st.own;
    }

    // F7: an open chat thread at 375 px hides the tab bar (the composer and Send are on top); Back to the list shows it.
    st.matchIds = [A];
    st.messages = [{ id: 'msg-1', sender_id: A, recipient_id: ME_ID, body: 'Shall we play on Saturday?', created_at: new Date(Date.now() - 6e5).toISOString() }];
    {
      const { context, page } = await open(NARROW, '/app.html?view=chat');
      await page.waitForFunction(() => document.querySelector('#chat-list [data-chat-id]'), null, { timeout: 8000 }).catch(() => {});
      await settle(page);
      const listBar = await tabbarShown(page);
      await page.locator('#chat-list [data-chat-id]').first().click({ timeout: 5000 }).catch((error) => console.log(`chat open failed: ${error.message.split('\n')[0]}`));
      await settle(page);
      const threadBar = await tabbarShown(page);
      const compose = await page.evaluate(() => ['#chat-input', '#chat-form button[type="submit"]'].map((sel) => {
        const el = document.querySelector(sel); const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { sel, onTop: Boolean(hit && (el === hit || el.contains(hit))), inViewport: r.bottom <= window.innerHeight + 0.5 && r.top >= 0 };
      }));
      await page.locator('#chat-back').click({ timeout: 5000 }).catch(() => {});
      await settle(page);
      const backBar = await tabbarShown(page);
      check(`375 chat: the list shows the tab bar, an open thread hides it, Back shows it again (${JSON.stringify({ listBar, threadBar, backBar })})`, () => {
        assert.equal(listBar, true); assert.equal(threadBar, false); assert.equal(backBar, true);
      });
      check(`375 chat thread: the composer and Send are on top and inside the viewport (${JSON.stringify(compose)})`, () => compose.forEach((c) => { assert.ok(c.onTop, `${c.sel} covered`); assert.ok(c.inViewport, `${c.sel} off screen`); }));
      await context.close();
    }
    delete st.messages; st.matchIds = [];

    // F2: the ⚙ menu survives a focus loss to nowhere (Safari and macOS Firefox do not focus a clicked button; a click
    // on the "Signed in as" line focuses nothing): it stays open and the next click runs its item. Tab out still closes.
    for (const [tag, viewport] of [['375', NARROW], ['1440', WIDE]]) {
      const { context, page } = await open(viewport, '/app.html?view=profile');
      await settle(page);
      const menuOpen = () => page.evaluate(() => { const m = document.querySelector('#profile-settings-menu'); return m.matches('[popover]') ? m.matches(':popover-open') : !m.hidden; });
      const openByKeyboard = async () => { await page.evaluate(() => document.querySelector('#profile-settings-button').focus()); await page.keyboard.press('Enter'); await page.waitForTimeout(150); };
      await openByKeyboard();
      for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
      await page.waitForTimeout(150);
      const tabOut = await menuOpen();
      await openByKeyboard();
      await page.keyboard.press('Shift+Tab');
      await page.waitForTimeout(150);
      const shiftTabOut = await menuOpen();
      await openByKeyboard();
      await page.evaluate(() => document.activeElement.blur());
      await page.waitForTimeout(150);
      const afterBlur = await menuOpen();
      await page.locator('[data-profile-setting="privacy"]').click({ timeout: 2000 }).catch(() => {});
      const privacy = await page.waitForSelector('dialog.privacy-dialog[open]', { timeout: 3000 }).then(() => true).catch(() => false);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await openByKeyboard();
      const line = await page.locator('#profile-settings-menu .profile-settings-account').boundingBox();
      if (line) { await page.mouse.move(line.x + line.width / 2, line.y + line.height / 2); await page.mouse.down(); await page.mouse.up(); }
      await page.waitForTimeout(150);
      const afterLine = await menuOpen();
      await page.locator('[data-profile-setting="logout"]').click({ timeout: 2000 }).catch(() => {});
      const loggedOut = await page.waitForURL(/\/auth\.html/, { timeout: 5000 }).then(() => true).catch(() => false);
      check(`${tag}: ⚙ menu: Tab out and Shift+Tab out close it (${JSON.stringify({ tabOut, shiftTabOut })})`, () => { assert.equal(tabOut, false); assert.equal(shiftTabOut, false); });
      check(`${tag}: ⚙ menu: a blur to nowhere keeps it open and PRIVACY & ACCOUNT then opens its dialog (${JSON.stringify({ afterBlur, privacy })})`, () => { assert.equal(afterBlur, true); assert.equal(privacy, true); });
      check(`${tag}: ⚙ menu: a click on "Signed in as" keeps it open and LOG OUT then signs out (${JSON.stringify({ afterLine, loggedOut })})`, () => { assert.equal(afterLine, true); assert.equal(loggedOut, true); });
      await context.close();
    }

    // F4: a refill that throws (a malformed deck_candidates answer) ends in the retry state, never an endless skeleton.
    {
      st.rows = [defaultDeckRows[0]];
      const errors = [];
      const context = await stub.newContext(browser, NARROW, { reducedMotion: 'reduce' });
      const page = await stub.open(context, { errors });
      await page.waitForFunction(() => document.querySelector('#swipe-name')?.textContent.trim(), null, { timeout: 8000 }).catch(() => {});
      await settle(page);
      st.routes = { 'rpc/deck_candidates': { body: { malformed: true } } };
      await page.locator('[data-action="pass"]').dispatchEvent('click', null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const state = await page.evaluate(() => {
        const action = document.querySelector('#deck-empty-action');
        return { skeletons: [...document.querySelectorAll('[data-view="home"] .skeleton')].filter((el) => el.getClientRects().length).length, retry: action?.dataset.deckAction, visible: Boolean(action?.getClientRects().length), busy: document.querySelector('[data-view="home"]')?.getAttribute('aria-busy') };
      });
      check(`375: a refill that throws: no skeleton after 2 s, not busy, Try again visible, no uncaught error (${JSON.stringify({ ...state, errors })})`, () => {
        assert.equal(state.skeletons, 0); assert.notEqual(state.busy, 'true'); assert.equal(state.retry, 'retry'); assert.equal(state.visible, true); assert.deepEqual(errors, []);
      });
      await context.close();
      delete st.routes; st.rows = null; st.passed.clear();
    }

    // F5: no iOS focus zoom: at 375 px every visible text field, textarea and select is >= 16 px, in every view and dialog.
    {
      const smallFields = (page) => page.evaluate(() => {
        const fields = [...document.querySelectorAll('input, textarea, select')].filter((el) => {
          if (el.tagName === 'INPUT' && ['radio', 'checkbox', 'range', 'file', 'hidden', 'button', 'submit', 'reset', 'color', 'image'].includes(el.type)) return false;
          const s = getComputedStyle(el); const r = el.getBoundingClientRect();
          return !el.closest('[hidden]') && r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none';
        });
        return { count: fields.length, small: fields.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => `${el.tagName.toLowerCase()}#${el.id || el.className} ${getComputedStyle(el).fontSize}`), scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      });
      st.matchIds = [A];
      st.messages = [{ id: 'msg-1', sender_id: A, recipient_id: ME_ID, body: 'Shall we play on Saturday?', created_at: new Date(Date.now() - 6e5).toISOString() }];
      const STATES = [
        ['Connect', 'explore', []], ['discovery filters', 'explore', ['#open-discovery-filters']], ['pitch sheet', 'explore', ['[data-action="like"]']],
        ['report dialog', 'explore', ['#card-more', '#card-more-menu [data-card-action="report"]']],
        ['Explore posts', 'posts', []], ['post composer', 'posts', ['#open-community-post']],
        ['Chat list', 'chat', []], ['Chat thread', 'chat', ['#chat-list [data-chat-id]']],
        ['Profile', 'profile', []], ['profile edit', 'profile', ['#profile-photo-editor']],
      ];
      const { context, page } = await open(NARROW);
      let seen = 0;
      for (const [label, view, steps] of STATES) {
        await page.goto(`${stub.url}/app.html?view=${view}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !document.body.classList.contains('app-auth-pending'), null, { timeout: 15000 });
        await page.waitForTimeout(900);
        for (const sel of steps) { await tap(page.locator(sel).first(), sel).catch((error) => console.log(`${label}: ${sel} failed: ${error.message.split('\n')[0]}`)); await page.waitForTimeout(400); }
        const fields = await smallFields(page);
        seen += fields.count;
        check(`375 ${label}: every visible text field is >= 16 px, no sideways scroll (${JSON.stringify(fields)})`, () => { assert.deepEqual(fields.small, []); assert.equal(fields.scroll, false); });
      }
      check(`375: the field-size audit saw text fields (${seen})`, () => assert.ok(seen >= 8));
      await context.close();
      delete st.messages; st.matchIds = []; st.passed.clear(); st.signalled.clear(); st.remaining = 30;
    }

    // F10: tapping Profile while on the profile does not read my_interests again or flash the skeleton.
    {
      const calls = () => st.calls.filter((c) => c.path === '/rest/v1/rpc/my_interests').length;
      const { context, page } = await open(NARROW, '/app.html?view=profile');
      await page.waitForFunction(() => document.querySelectorAll('#profile-interests [data-interest-row]').length === 3, null, { timeout: 8000 }).catch(() => {});
      await settle(page);
      const before = calls();
      await page.locator('.app-tabbar [data-nav="profile"]').click();
      const flash = await page.evaluate(() => document.querySelectorAll('#profile-interests .skeleton').length);
      await page.waitForTimeout(600);
      const again = calls() - before;
      await page.locator('.app-tabbar [data-nav="posts"]').click();
      await settle(page);
      await page.locator('.app-tabbar [data-nav="profile"]').click();
      await page.waitForFunction(() => document.querySelectorAll('#profile-interests [data-interest-row]').length === 3, null, { timeout: 8000 }).catch(() => {});
      await settle(page);
      const revisit = calls() - before;
      check(`375: re-tapping Profile on the profile reads my_interests no more and shows no skeleton; a new visit reads it once (${JSON.stringify({ again, flash, revisit })})`, () => {
        assert.equal(again, 0); assert.equal(flash, 0); assert.equal(revisit, 1);
      });
      await context.close();
    }

    // Phase C polish (founder screenshot review). P1: a heading that takes focus from script (tabindex="-1", for screen
    // readers) shows no ring, while a real control reached by Tab still does.
    const focusRing = (page) => page.evaluate(() => {
      const el = document.activeElement; const s = getComputedStyle(el);
      return { el: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`, style: s.outlineStyle, width: s.outlineWidth, ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 };
    });
    {
      st.deckFail = true;
      const { context, page } = await open(NARROW);
      await page.waitForFunction(() => document.activeElement?.id === 'deck-empty-title', null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(300);
      const title = await focusRing(page);
      await page.keyboard.press('Tab');
      const tabbed = await focusRing(page);
      check(`P1 375 deck 500: the focused title "Your deck could not load." shows no focus ring (${JSON.stringify(title)})`, () => {
        assert.equal(title.el, 'h2#deck-empty-title'); assert.equal(title.ring, false);
      });
      check(`P1 375 deck 500: Tab to Try again shows a visible ring (${JSON.stringify(tabbed)})`, () => {
        assert.equal(tabbed.el, 'button#deck-empty-action'); assert.equal(tabbed.ring, true); assert.ok(parseFloat(tabbed.width) >= 2);
      });
      // The chat heading takes script focus after a report from an open thread (F7); profile and posts h1 the same way.
      const headings = [];
      for (const [view, sel] of [['chat', '[data-view="chat"] .view-heading h1'], ['posts', '[data-view="posts"] h1'], ['profile', '[data-view="profile"] h1']]) {
        await page.locator(`.app-tabbar [data-nav="${view}"]`).click();
        await settle(page);
        headings.push({ view, ...(await page.evaluate((s) => {
          const h = [...document.querySelectorAll(s)].find((el) => el.getClientRects().length);
          if (!h) return { found: false };
          h.setAttribute('tabindex', '-1'); h.focus();
          const cs = getComputedStyle(h);
          return { found: document.activeElement === h, ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 };
        }, sel)) });
      }
      check(`P1 375: chat, posts and profile headings focused from script show no ring (${JSON.stringify(headings)})`, () => headings.forEach((h) => { assert.equal(h.found, true, h.view); assert.equal(h.ring, false, h.view); }));
      await context.close();
      st.deckFail = false;
    }
    {
      Object.assign(st, { onboarding: [false], onboardingCalls: 0, own: { ...NEW_MEMBER.own, adult_declared_at: new Date(Date.now() - 9e6).toISOString() } });
      const context = await stub.newContext(browser, NARROW, { reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.goto(`${stub.url}/app.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-under-review]', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(600);
      const review = await focusRing(page);
      await page.keyboard.press('Tab');
      const tabbed = await focusRing(page);
      check(`P1 375 under review: the focused h1 shows no ring; Tab to a control shows one (${JSON.stringify({ review, tabbed })})`, () => {
        assert.equal(review.el, 'h1#under-review-title'); assert.equal(review.ring, false); assert.equal(tabbed.ring, true);
      });
      await context.close();
      Object.assign(st, { onboarding: [true], onboardingCalls: 0 });
      delete st.own;
    }
    // P3: at 375 px the Explore sort <select> keeps 16 px (no iOS zoom) but reads as a quiet control: regular weight,
    // small caps like its SORT label, the row's height, and no shift when the value changes.
    {
      const { context, page } = await open(NARROW, '/app.html?view=posts');
      await settle(page);
      const sortState = () => page.evaluate(() => {
        const sel = document.querySelector('#community-post-sort'); const s = getComputedStyle(sel);
        const label = sel.closest('label'); const bar = document.querySelector('.community-feed-toolbar');
        return { size: s.fontSize, weight: Number(s.fontWeight), caps: s.fontVariantCaps, transform: s.textTransform, height: sel.getBoundingClientRect().height, label: label.getBoundingClientRect().height, bar: bar.getBoundingClientRect().height };
      });
      const sort = await sortState();
      await page.locator('#community-post-sort').selectOption('oldest');
      await page.waitForTimeout(200);
      const changed = await sortState();
      check(`P3 375: the sort select is 16 px, regular weight, small caps, as tall as its row (${JSON.stringify(sort)})`, () => {
        assert.equal(sort.size, '16px'); assert.ok(sort.weight <= 400); assert.match(sort.caps, /small-caps/); assert.equal(sort.transform, 'lowercase');
        assert.ok(Math.abs(sort.height - sort.label) <= 1); assert.ok(sort.height <= 40);
      });
      check(`P3 375: changing the sort does not shift the toolbar (${JSON.stringify({ before: sort.bar, after: changed.bar })})`, () => assert.equal(changed.bar, sort.bar));
      await context.close();
    }
    // P4: on a phone (mobile emulation: overlay scrollbars), the header avatar sits >= 8 px inside the right edge.
    {
      const context = await stub.newContext(browser, NARROW, { reducedMotion: 'reduce', isMobile: true, hasTouch: true });
      const page = await stub.open(context, { errors: pageErrors });
      await settle(page);
      const edge = await page.evaluate(() => ({ right: document.querySelector('.app-topbar .app-avatar-button').getBoundingClientRect().right, client: document.documentElement.clientWidth }));
      check(`P4 375 phone: the header avatar's right edge <= clientWidth - 8 (${JSON.stringify(edge)})`, () => assert.ok(edge.right <= edge.client - 8));
      await context.close();
    }

    // Everything before the final fixes; APP_SHELL_FINAL_ONLY=1 skips it.
    earlier: {
    if (FINAL_ONLY) break earlier;
    // Which member navs are visible, and which section is shown.
    const navState = (page) => page.evaluate(() => {
      const visible = (el) => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
      const navs = [...document.querySelectorAll('nav, [data-nav-host]')].filter((el) => el.querySelector('[data-nav]') && visible(el));
      const current = (host) => [...document.querySelectorAll(`[data-nav-host="${host}"] [aria-current="page"]`)].map((el) => el.dataset.nav);
      const shown = [...document.querySelectorAll('[data-view]')].filter((el) => !el.hidden).map((el) => el.dataset.view);
      return {
        visibleNavs: [...new Set(navs.map((el) => el.dataset.navHost || el.className || el.tagName))],
        headerItems: [...document.querySelectorAll('[data-nav-host="header"] [data-nav]')].map((el) => el.dataset.nav),
        tabbarItems: [...document.querySelectorAll('[data-nav-host="tabbar"] [data-nav]')].map((el) => el.dataset.nav),
        header: current('header'), tabbar: current('tabbar'), shown,
      };
    });
    const routeMatches = (s, expectedView) => {
      assert.deepEqual(s.shown, [expectedView]);
      assert.deepEqual(s.header, [NAV_FOR_VIEW[expectedView]]);
      assert.deepEqual(s.tabbar, [NAV_FOR_VIEW[expectedView]]);
    };

    // 1. Exactly one visible member nav, per viewport and view.
    for (const [tag, viewport, expected] of [['1440', WIDE, 'header'], ['375', NARROW, 'tabbar']]) {
      const { context, page } = await open(viewport);
      for (const view of VIEWS) {
        await page.evaluate((v) => document.querySelector(`[data-nav-host] [data-nav="${v === 'home' ? 'explore' : v}"]`)?.click(), view);
        await settle(page);
        const s = await navState(page);
        check(`${tag}: ${view} shows exactly one member nav, the ${expected} (${JSON.stringify(s.visibleNavs)})`, () => assert.deepEqual(s.visibleNavs, [expected]));
      }
      const s = await navState(page);
      check(`${tag}: header and tab bar list explore, events, posts, chat, profile (${JSON.stringify([s.headerItems, s.tabbarItems])})`, () => {
        assert.deepEqual(s.headerItems, ['explore', 'events', 'posts', 'chat', 'profile']);
        assert.deepEqual(s.tabbarItems, ['explore', 'events', 'posts', 'chat', 'profile']);
      });
      // 2. The duplicate navs are gone (the chat view has been rendered above).
      const gone = await page.evaluate(() => ['.profile-board-nav', '#app-logout-button', '.chat-sidebar-brand'].filter((sel) => document.querySelector(sel)));
      check(`${tag}: no .profile-board-nav, #app-logout-button or .chat-sidebar-brand (${gone.join(', ')})`, () => assert.deepEqual(gone, []));
      // D-092: the profile's brand sidebar is back by founder request, as a quiet panel only: hidden from assistive
      // tech and with no control in it (never a second, dead navigation).
      const sidebar = await page.evaluate(() => { const el = document.querySelector('.profile-sidebar'); return el ? { hidden: el.getAttribute('aria-hidden'), controls: el.querySelectorAll('a, button, input, select, textarea, [tabindex]').length } : null; });
      check(`${tag}: the profile sidebar is presentational only (${JSON.stringify(sidebar)})`, () => { assert.ok(sidebar); assert.equal(sidebar.hidden, 'true'); assert.equal(sidebar.controls, 0); });
      const filters = await page.evaluate(() => { const b = document.querySelector('#open-discovery-filters'); return { inHeading: Boolean(b?.closest('.home-heading')), controls: b?.getAttribute('aria-controls'), expanded: b?.getAttribute('aria-expanded'), label: b?.getAttribute('aria-label') }; });
      check(`${tag}: #open-discovery-filters sits in .home-heading with its aria attributes (${JSON.stringify(filters)})`, () => assert.deepEqual(filters, { inHeading: true, controls: 'discovery-filter-drawer', expanded: 'false', label: 'Open discovery filters' }));
      // 8. axe on the visible nav (full default rule set).
      await page.evaluate(() => document.querySelector('[data-nav-host] [data-nav="explore"]')?.click());
      await settle(page);
      const navSel = expected === 'header' ? '.app-header-nav' : '.app-tabbar';
      const axe = await axeViolations(page, { include: navSel }).catch((error) => [`axe could not run: ${error.message.split('\n')[0]}`]);
      check(`${tag}: axe finds no violations on ${navSel} (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
      await context.close();
    }

    // 3. Tab bar targets and labels (375 px).
    {
      const { context, page } = await open(NARROW);
      const items = await page.evaluate(() => [...document.querySelectorAll('.app-tabbar [data-nav]')].map((el) => {
        const r = el.getBoundingClientRect();
        const sizes = [...el.querySelectorAll('*')].filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && !n.closest('[hidden]')).map((n) => parseFloat(getComputedStyle(n).fontSize));
        const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) ? [parseFloat(getComputedStyle(el).fontSize)] : [];
        return { nav: el.dataset.nav, w: Math.round(r.width), h: Math.round(r.height), sizes: [...own, ...sizes], label: el.textContent.trim() };
      }));
      check(`375: five tab bar items (D-117), each >= 44x44 px with >= 12 px labels (${JSON.stringify(items)})`, () => {
        assert.equal(items.length, 5);
        items.forEach((it) => { assert.ok(it.w >= 44 && it.h >= 44, `${it.nav} is ${it.w}x${it.h}`); assert.ok(it.sizes.length >= 1 && it.sizes.every((s) => s >= 12), `${it.nav} label ${it.sizes}`); });
      });
      check(`375: tab labels read Connect, Explore, Posts, Chat, Profile (${items.map((i) => i.label).join(', ')})`, () => assert.deepEqual(items.map((i) => i.label), ['Connect', 'Explore', 'Posts', 'Chat', 'Profile']));
      const bar = await page.evaluate(() => { const el = document.querySelector('.app-tabbar'); if (!el) return { missing: true }; const r = el.getBoundingClientRect(); return { bottom: Math.round(r.bottom), vh: window.innerHeight, position: getComputedStyle(el).position }; });
      check(`375: the tab bar is fixed to the bottom (${JSON.stringify(bar)})`, () => { assert.equal(bar.position, 'fixed'); assert.equal(bar.bottom, bar.vh); });

      // 6. Keyboard: Tab reaches each tab bar item, with a visible outline.
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      const reached = {};
      for (let i = 0; i < 120 && Object.keys(reached).length < 5; i += 1) {
        await page.keyboard.press('Tab');
        const f = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el?.closest('.app-tabbar')) return null;
          const s = getComputedStyle(el);
          return { nav: el.dataset.nav, outline: `${s.outlineStyle} ${s.outlineWidth}`, visible: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 };
        });
        if (f && !reached[f.nav]) reached[f.nav] = f;
      }
      check(`375: Tab reaches every tab bar item with a visible focus outline (${JSON.stringify(reached)})`, () => {
        assert.deepEqual(Object.keys(reached).sort(), ['chat', 'events', 'explore', 'posts', 'profile']);
        Object.values(reached).forEach((f) => assert.ok(f.visible, `${f.nav}: ${f.outline}`));
      });
      await context.close();
    }

    // 4. Routing: aria-current follows the visible [data-view] (URL entry, hash, alias, click, Back).
    for (const [tag, viewport] of [['1440', WIDE], ['375', NARROW]]) {
      const { context, page } = await open(viewport, '/app.html?view=chat');
      let s = await navState(page);
      check(`${tag}: ?view=chat shows chat and Chat is current (${JSON.stringify(s)})`, () => routeMatches(s, 'chat'));
      await page.goto(`${stub.url}/app.html#profile`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !document.body.classList.contains('app-auth-pending'), null, { timeout: 15000 });
      s = await navState(page);
      check(`${tag}: #profile shows profile and Profile is current (${JSON.stringify(s)})`, () => routeMatches(s, 'profile'));
      await page.goto(`${stub.url}/app.html?view=home`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !document.body.classList.contains('app-auth-pending'), null, { timeout: 15000 });
      await settle(page);
      s = await navState(page);
      check(`${tag}: ?view=home shows the deck and Connect is current (${JSON.stringify(s)})`, () => routeMatches(s, 'home'));
      await page.evaluate(() => { window.__noReload = true; });
      const host = tag === '1440' ? 'header' : 'tabbar';
      await page.locator(`[data-nav-host="${host}"] [data-nav="posts"]`).click({ timeout: 5000 }).catch((error) => console.log(`click failed: ${error.message.split('\n')[0]}`));
      await settle(page);
      s = await navState(page);
      const kept = await page.evaluate(() => ({ marker: window.__noReload === true, url: location.search }));
      check(`${tag}: clicking Explore in the ${host} switches without a reload (${JSON.stringify(kept)}; ${JSON.stringify(s)})`, () => { routeMatches(s, 'posts'); assert.equal(kept.marker, true); assert.equal(kept.url, '?view=posts'); });
      await page.goBack();
      await settle(page);
      s = await navState(page);
      const back = await page.evaluate(() => ({ marker: window.__noReload === true, url: location.search }));
      check(`${tag}: Back returns to the deck with Connect current (${JSON.stringify(back)}; ${JSON.stringify(s)})`, () => { routeMatches(s, 'home'); assert.equal(back.marker, true); });
      await context.close();
    }

    // 4b. A nav click runs setView: the target view re-renders, the page scrolls to the top, one history entry per click.
    for (const [tag, viewport] of [['1440', WIDE], ['375', NARROW]]) {
      const { context, page } = await open(viewport);
      const host = tag === '1440' ? 'header' : 'tabbar';
      const clickTab = async (view) => {
        await page.evaluate(() => window.scrollTo(0, 400));
        // Blank the rendered chat list and profile name just before the click: only a setView re-render (synchronous in
        // the click) brings them back within 100 ms, before any periodic sync could.
        await page.evaluate(() => { document.querySelector('#chat-list').innerHTML = ''; document.querySelector('#profile-name').textContent = ''; });
        await page.locator(`[data-nav-host="${host}"] [data-nav="${view}"]`).click({ timeout: 5000 }).catch((error) => console.log(`click failed: ${error.message.split('\n')[0]}`));
        await page.waitForTimeout(100);
        const rendered = await page.evaluate(() => ({ rows: document.querySelectorAll('#chat-list .chat-inbox-scroll').length, name: document.querySelector('#profile-name').textContent.trim() }));
        await page.waitForTimeout(800);
        return rendered;
      };
      // The app pushes its Back guard entry once the community data has loaded; count clicks only after that.
      await page.waitForFunction(() => window.history.state?.briviaAppBackGuard === true, null, { timeout: 8000 }).catch(() => {});
      const startLength = await page.evaluate(() => history.length);
      const afterChat = await clickTab('chat');
      const chat = await page.evaluate((r) => ({ rows: r.rows, y: window.scrollY, len: history.length }), afterChat);
      check(`${tag}: clicking Chat re-renders the chat list and scrolls to the top (${JSON.stringify(chat)})`, () => { assert.equal(chat.rows, 1); assert.equal(chat.y, 0); });
      const afterProfile = await clickTab('profile');
      const prof = await page.evaluate((r) => ({ name: r.name, y: window.scrollY, len: history.length }), afterProfile);
      check(`${tag}: clicking Profile fills the profile name and scrolls to the top (${JSON.stringify(prof)})`, () => { assert.equal(prof.name, 'Alex Me'); assert.equal(prof.y, 0); });
      await clickTab('posts');
      await clickTab('explore');
      const conn = await page.evaluate(() => ({ y: window.scrollY, len: history.length }));
      check(`${tag}: clicking Connect scrolls to the top (${JSON.stringify(conn)})`, () => assert.equal(conn.y, 0));
      check(`${tag}: one history entry per click (${startLength} -> ${chat.len}, ${prof.len}, ${conn.len})`, () => { assert.equal(chat.len, startLength + 1); assert.equal(prof.len, startLength + 2); assert.equal(conn.len, startLength + 4); });
      await page.goBack();
      await settle(page);
      let s = await navState(page);
      check(`${tag}: Back from Connect returns to Explore (${JSON.stringify(s)})`, () => routeMatches(s, 'posts'));
      await page.goBack();
      await settle(page);
      s = await navState(page);
      check(`${tag}: Back again returns to Profile (${JSON.stringify(s)})`, () => routeMatches(s, 'profile'));
      await context.close();
    }

    // 5. A long name and area: no horizontal page scroll at 375 px on any view.
    st.own = { id: '11111111-1111-4111-8111-111111111111', name: 'Maximiliana Alexandrina Featherstonehaugh-Worthington', full_name: 'Maximiliana Alexandrina Featherstonehaugh-Worthington', email: 'alex@test.brivia.club', phone: '', city: null, state: null, experience: 'Founder', skills: ['Badminton'], looking_for: ['Friends'], created_at: new Date(Date.now() - 9e6).toISOString() };
    st.placeLabel = 'Thiruvananthapuram Technopark Kazhakkoottam Phase Three';
    {
      const { context, page } = await open(NARROW);
      for (const view of VIEWS) {
        await page.evaluate((v) => document.querySelector(`.app-tabbar [data-nav="${v === 'home' ? 'explore' : v}"]`)?.click(), view);
        await settle(page);
        const sw = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
        check(`375: long name and area, ${view}: no horizontal page scroll (${JSON.stringify(sw)})`, () => assert.ok(sw.scroll <= sw.client));
      }
      await context.close();
    }
    delete st.own; delete st.placeLabel;

    // 7. The chat badge counts unread messages (D-100): hidden with no conversation, hidden for a conversation with
    //    nothing unread, shown in header and tab bar with one unread message.
    const unreadOne = [{ id: 'msg-badge', sender_id: A, recipient_id: '11111111-1111-4111-8111-111111111111', body: 'Hi', created_at: new Date(Date.now() - 6e4).toISOString() }];
    for (const [label, matchIds, expectShown, messages] of [['no conversation', [], false, []], ['one conversation, nothing unread', [A], false, []], ['one conversation', [A], true, unreadOne]]) {
      st.matchIds = matchIds;
      st.messages = messages;
      const { context, page } = await open(WIDE);
      if (expectShown) await page.waitForFunction(() => [...document.querySelectorAll('[data-chat-badge]')].some((b) => !b.hidden), null, { timeout: 8000 }).catch(() => {});
      else await settle(page);
      const badges = await page.evaluate(() => [...document.querySelectorAll('[data-chat-badge]')].map((b) => ({ host: b.closest('[data-nav-host]')?.dataset.navHost, hidden: b.hidden, text: b.textContent.trim() })));
      check(`${label}: the chat badge in header and tab bar (${JSON.stringify(badges)})`, () => {
        assert.deepEqual(badges.map((b) => b.host).sort(), ['header', 'tabbar']);
        badges.forEach((b) => { assert.equal(b.hidden, !expectShown); if (expectShown) assert.equal(b.text, '1'); });
        assert.equal(badges.length, 2);
      });
      await context.close();
    }
    // 9. One type system (Phase C Task 4): 12 px floor, two families, Bodoni headings, a real Bodoni italic.
    st.matchIds = [A];
    st.posts = [{ id: 'post-1', author_id: A, image_url: null, image_path: null, caption: 'Morning rally at the club courts', created_at: new Date(Date.now() - 36e5).toISOString() }];
    st.messages = [{ id: 'msg-1', sender_id: A, recipient_id: '11111111-1111-4111-8111-111111111111', body: 'Shall we play on Saturday?', created_at: new Date(Date.now() - 6e5).toISOString() }];
    for (const [tag, viewport] of [['375', NARROW], ['1440', WIDE]]) {
      const { context, page } = await open(viewport);
      await page.waitForTimeout(1200);
      const audit = async (state) => {
        const { small, family } = await textAudit(page, { families: TYPE_FAMILIES });
        const headings = await page.evaluate(() => [...document.querySelectorAll('h1, h2')].filter((h) => h.getClientRects().length && !h.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(h).visibility !== 'hidden' && h.textContent.trim())
          .filter((h) => !/^["']?Bodoni Moda/.test(getComputedStyle(h).fontFamily)).map((h) => `${h.tagName.toLowerCase()}${h.className ? `.${String(h.className).trim().split(/\s+/).join('.')}` : ''} {${getComputedStyle(h).fontFamily.split(',')[0]}} "${h.textContent.trim().slice(0, 24)}"`));
        const uniq = (list) => [...new Set(list)];
        check(`${tag} ${state}: every visible text is >= 12 px (${uniq(small).join(' | ')})`, () => assert.deepEqual(small, []));
        check(`${tag} ${state}: every visible text is Bodoni Moda or Instrument Sans (${uniq(family).join(' | ')})`, () => assert.deepEqual(family, []));
        check(`${tag} ${state}: visible h1/h2 use Bodoni Moda (${uniq(headings).join(' | ')})`, () => assert.deepEqual(headings, []));
      };
      const go = async (view) => { await page.evaluate((v) => document.querySelector(`[data-nav-host]:not([hidden]) [data-nav="${v}"], [data-nav-host] [data-nav="${v}"]`)?.click(), view); await settle(page); };
      await go('explore');
      await audit('Connect deck');
      // 10a. (before the notification panel marks the bell read) the badges sit inside their controls and the viewport.
      await page.waitForFunction(() => [...document.querySelectorAll('[data-chat-badge]')].some((b) => !b.hidden), null, { timeout: 8000 }).catch(() => {});
      const badge = await page.evaluate(() => {
        const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const inside = (a, o) => a.l >= o.l - 0.5 && a.t >= o.t - 0.5 && a.r <= o.r + 0.5 && a.b <= o.b + 0.5;
        const vp = { l: 0, t: 0, r: document.documentElement.clientWidth, b: window.innerHeight };
        const shown = [...document.querySelectorAll('[data-chat-badge]')].filter((b) => !b.hidden && b.getClientRects().length && b.getBoundingClientRect().width);
        const bell = document.querySelector('#notification-badge');
        return {
          chat: shown.map((b) => ({ host: b.closest('[data-nav-host]').dataset.navHost, inItem: inside(r(b), r(b.closest('[data-nav]'))), inViewport: inside(r(b), vp), box: r(b) })),
          bell: bell && !bell.hidden && bell.getClientRects().length ? { inViewport: inside(r(bell), vp), box: r(bell) } : null,
        };
      });
      check(`${tag}: the chat badge's box is fully inside its nav item and the viewport, the bell badge inside the viewport (${JSON.stringify(badge)})`, () => {
        assert.equal(badge.chat.length, 1);
        badge.chat.forEach((b) => { assert.ok(b.inItem, `${b.host} badge outside its nav item`); assert.ok(b.inViewport, `${b.host} badge outside the viewport`); });
        assert.ok(badge.bell, 'the unread notification badge is shown');
        assert.ok(badge.bell.inViewport, 'notification badge outside the viewport');
      });
      await page.locator('#open-discovery-filters').click();
      await settle(page);
      await audit('discovery-filter drawer');
      await page.locator('.discovery-filter-close').click();
      await settle(page);
      await page.locator('#app-notification-button').click();
      await settle(page);
      await audit('notification panel');
      await page.locator('#app-notification-button').click();
      await settle(page);
      await go('posts');
      await audit('Explore posts');
      await go('chat');
      await audit('Chat list');
      await page.locator('#chat-list [data-chat-id]').first().click({ timeout: 5000 }).catch((error) => console.log(`chat open failed: ${error.message.split('\n')[0]}`));
      await settle(page);
      await audit('Chat conversation');
      await go('profile');
      await audit('Profile');
      // The ⚙ menu's five 44 px items are all on screen and on top (the hero used to clip the first one).
      await page.locator('#profile-settings-button').click();
      await settle(page);
      await audit('profile settings menu');
      const menuHits = await page.evaluate(() => [...document.querySelectorAll('#profile-settings-menu button')].map((b) => {
        const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { item: b.textContent.trim(), onTop: b.contains(hit), height: Math.round(r.height) };
      }));
      check(`${tag}: every profile settings menu item is visible and on top, >= 44 px (${JSON.stringify(menuHits)})`, () => {
        assert.equal(menuHits.length, 5);
        menuHits.forEach((m) => { assert.ok(m.onTop, `${m.item} is covered`); assert.ok(m.height >= 44, `${m.item} is ${m.height}px`); });
      });
      // Close it with a click where ⚙ is: the gear itself as a popover, the sheet's scrim (which covers ⚙) on a phone.
      { const gear = await page.locator('#profile-settings-button').boundingBox(); await page.mouse.click(gear.x + gear.width / 2, gear.y + gear.height / 2); await page.waitForTimeout(150); }
      // Keyboard (fix round 1): Enter on ⚙ opens it, Tab walks the five items in order, Escape closes it and focus
      // returns to ⚙; a view change and a resize close it too.
      const menuState = () => page.evaluate(() => {
        const m = document.querySelector('#profile-settings-menu');
        return { open: m.matches('[popover]') ? m.matches(':popover-open') : !m.hidden, expanded: document.querySelector('#profile-settings-button').getAttribute('aria-expanded'), focus: document.activeElement?.id || document.activeElement?.textContent.trim() };
      });
      const closedFirst = await menuState();
      await page.evaluate(() => document.querySelector('#profile-settings-button').focus());
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      const afterEnter = await menuState();
      const tabbed = [];
      for (let i = 0; i < 5; i += 1) { await page.keyboard.press('Tab'); tabbed.push((await menuState()).focus); }
      const stillOpen = (await menuState()).open;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const afterEscape = await menuState();
      check(`${tag}: keyboard ⚙ menu: Enter opens, Tab reaches each item in order, Escape closes and returns focus to ⚙ (${JSON.stringify({ closedFirst, afterEnter, tabbed, stillOpen, afterEscape })})`, () => {
        assert.equal(closedFirst.open, false);
        assert.equal(afterEnter.open, true); assert.equal(afterEnter.expanded, 'true');
        assert.deepEqual(tabbed, ['NOTIFICATIONS', 'BLOCKED USERS', 'REMOVED CONNECTIONS', 'PRIVACY & ACCOUNT', 'LOG OUT']);
        assert.equal(stillOpen, true);
        assert.equal(afterEscape.open, false); assert.equal(afterEscape.expanded, 'false'); assert.equal(afterEscape.focus, 'profile-settings-button');
      });
      await page.locator('#profile-settings-button').click();
      await page.waitForTimeout(150);
      const beforeNav = (await menuState()).open;
      await go('posts');
      const afterNav = (await menuState()).open;
      await go('profile');
      await page.locator('#profile-settings-button').click();
      await page.waitForTimeout(150);
      await page.setViewportSize({ width: viewport.width - 20, height: viewport.height });
      await page.waitForTimeout(300);
      const afterResize = (await menuState()).open;
      await page.setViewportSize(viewport);
      await settle(page);
      check(`${tag}: the ⚙ menu closes on a view change and on resize (${JSON.stringify({ beforeNav, afterNav, afterResize })})`, () => {
        assert.equal(beforeNav, true); assert.equal(afterNav, false); assert.equal(afterResize, false);
      });
      const italic = await page.evaluate(async () => {
        await document.fonts.load('italic 500 20px "Bodoni Moda"');
        return [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Bodoni Moda' && f.style === 'italic').map((f) => `${f.weight} ${f.status}`);
      });
      check(`${tag}: a Bodoni Moda 500 italic face is declared and loaded (${JSON.stringify(italic)})`, () => assert.ok(italic.includes('500 loaded')));
      // 10. Nothing clipped (Phase C Task 4 pre-review): the chat badge, the deck card's VIEW PROFILE, the compose placeholder.
      await go('explore');
      await page.evaluate(() => window.scrollTo(0, 0));
      const card = await page.evaluate(() => {
        const c = document.querySelector('#swipe-card').getBoundingClientRect();
        const b = document.querySelector('#swipe-card .view-info-button').getBoundingClientRect();
        return { cardBottom: Math.round(c.bottom), buttonBottom: Math.round(b.bottom), cardRight: Math.round(c.right), buttonRight: Math.round(b.right) };
      });
      check(`${tag}: the deck card's VIEW PROFILE is not cut off by the card (${JSON.stringify(card)})`, () => { assert.ok(card.buttonBottom <= card.cardBottom, 'button below the card edge'); assert.ok(card.buttonRight <= card.cardRight); });
      await go('chat');
      await page.locator('#chat-list [data-chat-id]').first().click({ timeout: 5000 }).catch(() => {});
      await settle(page);
      const ph = await page.evaluate(() => {
        const i = document.querySelector('.chat-compose input'); const s = getComputedStyle(i); const ps = getComputedStyle(i, '::placeholder');
        const ctx = document.createElement('canvas').getContext('2d'); ctx.font = `${ps.fontStyle} ${ps.fontWeight} ${ps.fontSize} ${ps.fontFamily}`;
        return { text: Math.ceil(ctx.measureText(i.placeholder).width), room: Math.floor(i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)), size: ps.fontSize };
      });
      check(`${tag}: the chat compose placeholder fits its field (${JSON.stringify(ph)})`, () => { assert.ok(ph.text <= ph.room); assert.ok(parseFloat(ph.size) >= 12); });
      await context.close();
    }
    delete st.posts; delete st.messages;

    // 12. Post images (Phase D Task 2): a preset illustration identifier (the seed's posts) renders the shipped asset
    // through normalizeCoverUrl; an external URL and a preset-shaped name with no asset show the placeholder.
    {
      const before = st.posts;
      const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
      st.posts = [
        { id: 'post-preset', author_id: A, image_url: '/Images/Cover%20images/94978B9F-A399-43FC-AC48-0A41088B5D27.PNG', image_path: '', caption: 'Preset illustration', created_at: ago(1) },
        { id: 'post-external', author_id: A, image_url: 'https://tracker.example/p.jpg', image_path: '', caption: 'External image', created_at: ago(2) },
        { id: 'post-unknown', author_id: A, image_url: '/Images/Cover%20images/NOT-A-PRESET.PNG', image_path: '', caption: 'Unknown preset', created_at: ago(3) },
      ];
      const { context, page } = await open(WIDE, '/app.html?view=posts');
      await page.waitForFunction(() => document.querySelectorAll('#community-post-list .post-card').length >= 3, null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(800);
      const cards = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#community-post-list .post-card')].map((c) => {
        const img = c.querySelector('.post-card-media img');
        return [c.querySelector('.post-card-caption')?.textContent, { src: img?.getAttribute('src') || null, loaded: Boolean(img && img.complete && img.naturalWidth > 0), missing: Boolean(c.querySelector('.community-post-image-missing')) }];
      })));
      check(`posts: a preset identifier renders the shipped asset; external and unknown show the placeholder (${JSON.stringify(cards)})`, () => {
        const preset = cards['Preset illustration'];
        assert.ok(preset && preset.src, 'the preset post has an <img>');
        assert.match(preset.src, /^\/(assets|media)\//);
        assert.ok(/\.webp$/.test(preset.src) || /94978B9F/.test(preset.src), preset.src);
        assert.equal(preset.loaded, true, 'the preset image loads');
        assert.equal(preset.missing, false);
        for (const caption of ['External image', 'Unknown preset']) {
          assert.equal(cards[caption]?.src, null, `${caption} has no <img>`);
          assert.equal(cards[caption]?.missing, true, `${caption} shows the placeholder`);
        }
      });
      await context.close();
      st.posts = before;
    }

    // 11. Profile (Phase C Task 5): hero, then "Complete your profile", then interests, looking for, experience.
    st.matchIds = [];
    const interestCalls = () => st.calls.filter((c) => c.path === '/rest/v1/rpc/my_interests').length;
    const profileOrder = (page) => page.evaluate(() => {
      const ids = ['.profile-hero', '#profile-checklist', '#profile-interests', '#profile-looking-for', '#profile-experience'];
      const nodes = ids.map((sel) => document.querySelector(sel));
      const follows = nodes.every((n, i) => n && (i === 0 || (nodes[i - 1].compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)));
      return { found: ids.filter((_, i) => nodes[i]), follows };
    });
    for (const [tag, viewport] of [['375', NARROW], ['1440', WIDE]]) {
      useMember(NEW_MEMBER);
      const before = interestCalls();
      const { context, page } = await open(viewport, '/app.html?view=profile');
      await page.waitForFunction(() => document.querySelector('#profile-interests [data-interest-row]'), null, { timeout: 8000 }).catch(() => {});
      await settle(page);
      const order = await profileOrder(page);
      check(`${tag}: profile shows hero, then checklist, then interests, looking for, experience, in DOM order (${JSON.stringify(order)})`, () => { assert.equal(order.found.length, 5); assert.equal(order.follows, true); });
      const removed = await page.evaluate(() => ['.profile-stat-grid', '.profile-dashboard', '.profile-quick-stats', '.profile-details-card', '.profile-login-card'].filter((sel) => document.querySelector(sel)));
      check(`${tag}: none of the removed sections is in the DOM (${removed.join(', ')})`, () => assert.deepEqual(removed, []));
      // The member's own email: only in the ⚙ menu's "Signed in as" line (never in text or attributes elsewhere).
      const email = await page.evaluate((own) => {
        const menu = document.querySelector('#profile-settings-menu');
        const hits = [];
        for (const el of document.querySelectorAll('body *')) {
          if (menu && (el === menu || menu.contains(el))) continue;
          const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
          if (ownText.includes(own)) hits.push(`${el.tagName.toLowerCase()}#${el.id} text`);
          for (const attr of el.attributes) if (attr.value.includes(own)) hits.push(`${el.tagName.toLowerCase()}#${el.id} [${attr.name}]`);
          if ('value' in el && String(el.value || '').includes(own)) hits.push(`${el.tagName.toLowerCase()}#${el.id} value`);
        }
        const line = menu?.querySelector('.profile-settings-account');
        return { hits, line: line?.textContent.replace(/\s+/g, ' ').trim() || '', lineTag: line?.tagName, lineTabIndex: line?.tabIndex, first: menu?.firstElementChild === line };
      }, OWN_EMAIL);
      check(`${tag}: no element contains the member's email outside the ⚙ menu; the menu starts with "Signed in as" (${JSON.stringify(email)})`, () => {
        assert.deepEqual(email.hits, []);
        assert.equal(email.line, `Signed in as ${OWN_EMAIL}`);
        assert.equal(email.lineTag, 'P'); assert.equal(email.first, true); assert.ok(email.lineTabIndex < 0);
      });
      const list = await page.evaluate(() => {
        const box = document.querySelector('#profile-checklist');
        return {
          text: box?.textContent.replace(/\s+/g, ' ').trim() || '',
          items: [...(box?.querySelectorAll('[data-checklist-item]') || [])].map((b) => ({ key: b.dataset.checklistItem, tag: b.tagName, done: b.dataset.done, text: b.textContent.replace(/\s+/g, ' ').trim() })),
          bar: box?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') || null,
        };
      });
      check(`${tag}: checklist reads "1 of 5" for a new member (${JSON.stringify(list)})`, () => {
        assert.match(list.text, /Complete your profile/);
        assert.match(list.text, /1 of 5/);
        assert.equal(list.bar, '1');
        assert.deepEqual(list.items.map((i) => i.key), ['photo', 'cover', 'interests', 'looking', 'experience']);
        assert.ok(list.items.every((i) => i.tag === 'BUTTON'));
        assert.deepEqual(list.items.filter((i) => i.done === 'true').map((i) => i.key), ['interests']);
      });
      await page.locator('#profile-checklist [data-checklist-item]').first().click({ timeout: 5000 }).catch((error) => console.log(`checklist click failed: ${error.message.split('\n')[0]}`));
      const editorOpen = await page.waitForSelector('#profile-edit-modal', { timeout: 3000 }).then(() => true).catch(() => false);
      check(`${tag}: the checklist's first item opens the profile editor`, () => assert.equal(editorOpen, true));
      await page.evaluate(() => document.querySelector('#profile-edit-modal [data-profile-edit-close]')?.click());
      const rows = await page.evaluate(() => [...document.querySelectorAll('#profile-interests [data-interest-row]')].map((r) => ({ label: r.querySelector('.profile-interest-label')?.textContent.trim(), bar: r.querySelector('.profile-interest-bar i')?.style.width || '', private: Boolean(r.querySelector('.profile-interest-private')) })));
      check(`${tag}: interests list each label with a bar whose width is points/20 (${JSON.stringify(rows)})`, () => assert.deepEqual(rows, [
        { label: 'Badminton', bar: '50%', private: false }, { label: 'Chess', bar: '30%', private: false }, { label: 'Poetry', bar: '20%', private: false },
      ]));
      check(`${tag}: one my_interests call for the profile visit (${interestCalls() - before})`, () => assert.equal(interestCalls() - before, 1));
      const empties = await page.evaluate(() => ({
        looking: document.querySelector('#profile-looking-for')?.textContent.replace(/\s+/g, ' ').trim(),
        experience: document.querySelector('#profile-experience')?.textContent.replace(/\s+/g, ' ').trim(),
      }));
      check(`${tag}: empty Looking for and Experience offer an action (${JSON.stringify(empties)})`, () => {
        assert.match(empties.looking, /Looking for/); assert.match(empties.experience, /Experience/);
      });
      const { small, family } = await textAudit(page, { root: '[data-view="profile"]', families: TYPE_FAMILIES });
      check(`${tag} new member profile: every visible text is >= 12 px in the two families (${[...small, ...family].join(' | ')})`, () => { assert.deepEqual(small, []); assert.deepEqual(family, []); });
      const axe = await axeViolations(page, { include: '[data-view="profile"]' }).catch((error) => [`axe could not run: ${error.message.split('\n')[0]}`]);
      check(`${tag}: axe clean on the new member's profile (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
      await context.close();

      // A complete member: a single "Profile complete" line; a private interest is labelled Private.
      useMember(COMPLETE_MEMBER);
      const done = await open(viewport, '/app.html?view=profile');
      await done.page.waitForFunction(() => document.querySelectorAll('#profile-interests [data-interest-row]').length === 4, null, { timeout: 8000 }).catch(() => {});
      await settle(done.page);
      const full = await done.page.evaluate(() => {
        const box = document.querySelector('#profile-checklist');
        return {
          text: box?.textContent.replace(/\s+/g, ' ').trim() || '',
          items: box?.querySelectorAll('[data-checklist-item]').length ?? -1,
          bar: Boolean(box?.querySelector('[role="progressbar"]')),
          rows: [...document.querySelectorAll('#profile-interests [data-interest-row]')].map((r) => ({ label: r.querySelector('.profile-interest-label')?.textContent.trim(), bar: r.querySelector('.profile-interest-bar i')?.style.width || '', private: r.querySelector('.profile-interest-private')?.textContent.trim() || '' })),
          chips: [...document.querySelectorAll('#profile-looking-for li')].map((li) => li.textContent.trim()),
          experience: document.querySelector('#profile-experience p')?.textContent.trim(),
        };
      });
      check(`${tag}: a complete member sees only "Profile complete" (${JSON.stringify({ text: full.text, items: full.items, bar: full.bar })})`, () => {
        assert.equal(full.text, 'Profile complete'); assert.equal(full.items, 0); assert.equal(full.bar, false);
      });
      check(`${tag}: a private interest is labelled Private; bars follow points/20 (${JSON.stringify(full.rows)})`, () => assert.deepEqual(full.rows, [
        { label: 'Badminton', bar: '40%', private: '' }, { label: 'Chess', bar: '25%', private: '' }, { label: 'Meditation', bar: '20%', private: 'Private' }, { label: 'Poetry', bar: '15%', private: '' },
      ]));
      check(`${tag}: Looking for shows chips and Experience the member's text (${JSON.stringify({ chips: full.chips, experience: full.experience })})`, () => {
        assert.deepEqual(full.chips, ['Friends', 'Mentor', 'Co-founder']); assert.equal(full.experience, 'Product designer, 6 years');
      });
      const axe2 = await axeViolations(done.page, { include: '[data-view="profile"]' }).catch((error) => [`axe could not run: ${error.message.split('\n')[0]}`]);
      check(`${tag}: axe clean on the complete member's profile (${axe2.join(' | ')})`, () => assert.deepEqual(axe2, []));
      await done.context.close();
    }
    // Interests that fail to load: "Couldn't load your interests" with a Retry that loads them.
    {
      useMember(NEW_MEMBER);
      st.myInterestsFail = true;
      const { context, page } = await open(NARROW, '/app.html?view=profile');
      await page.waitForFunction(() => /Couldn.t load your interests/.test(document.querySelector('#profile-interests')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
      const failed = await page.evaluate(() => ({ text: document.querySelector('#profile-interests')?.textContent.replace(/\s+/g, ' ').trim(), retry: Boolean(document.querySelector('#profile-interests [data-interests-retry]')) }));
      st.myInterestsFail = false;
      await page.locator('#profile-interests [data-interests-retry]').click({ timeout: 5000 }).catch(() => {});
      await page.waitForFunction(() => document.querySelectorAll('#profile-interests [data-interest-row]').length === 3, null, { timeout: 8000 }).catch(() => {});
      const retried = await page.evaluate(() => document.querySelectorAll('#profile-interests [data-interest-row]').length);
      check(`375: interests that fail show "Couldn't load your interests" with Retry, and Retry loads them (${JSON.stringify({ failed, retried })})`, () => {
        assert.match(failed.text, /Couldn.t load your interests/); assert.equal(failed.retry, true); assert.equal(retried, 3);
      });
      await context.close();
    }
    // Long name and area: no horizontal scroll at 375 on the profile.
    {
      useMember({ ...NEW_MEMBER, own: { ...NEW_MEMBER.own, name: 'Maximiliana Alexandrina Featherstonehaugh-Worthington', experience: 'Principal interdisciplinary-design-and-research-practitioner at a very long company name', looking_for: ['Weekend badminton partners for doubles', 'A co-founder for a climate-tech venture'] } });
      st.placeLabel = 'Thiruvananthapuram Technopark Kazhakkoottam Phase Three';
      const { context, page } = await open(NARROW, '/app.html?view=profile');
      await settle(page);
      const sw = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      check(`375: long name and area on the profile: no horizontal scroll (${JSON.stringify(sw)})`, () => assert.ok(sw.scroll <= sw.client));
      await context.close();
      delete st.placeLabel;
    }
    clearMember();

    // Phase C Task 6 (feel): skeletons while loading, never after a failure; empty states with a next step; reduced
    // motion; a busy post button.
    const visibleSkeletons = (page, scope) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} .skeleton`)].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }).length, scope);
    {
      st.routes = { 'rpc/deck_candidates': { delayMs: 3000 } };
      const context = await stub.newContext(browser, NARROW, { reducedMotion: 'reduce' });
      // CLS counts from the moment the app is shown (the auth gate lifts): before that the page is hidden, and the Vite
      // dev server injects the CSS from JS, which shifts the unstyled markup (a dev-only artefact; the build links it).
      await context.addInitScript(() => {
        window.__cls = 0;
        window.__shownAt = Infinity;
        new MutationObserver(() => { if (window.__shownAt === Infinity && document.body && !document.body.classList.contains('app-auth-pending')) window.__shownAt = performance.now(); }).observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] });
        new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput && entry.startTime >= window.__shownAt) window.__cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
      });
      const page = await stub.open(context, { errors: pageErrors });
      const early = await page.waitForFunction(() => {
        const section = document.querySelector('[data-view="home"]');
        const sk = [...(section?.querySelectorAll('.skeleton') || [])].some((el) => el.getBoundingClientRect().height > 0);
        return sk && section.getAttribute('aria-busy') === 'true';
      }, null, { timeout: 300 }).then(() => true).catch(() => false);
      const motion = await page.evaluate(() => ({
        nav: [...document.querySelectorAll('.app-nav-button')].filter((el) => el.getClientRects().length).map((el) => getComputedStyle(el).transitionDuration),
        shimmer: [...document.querySelectorAll('.skeleton')].map((el) => getComputedStyle(el).animationName),
      }));
      await page.waitForFunction(() => !document.querySelector('#swipe-card')?.hidden && document.querySelector('#swipe-name')?.textContent.trim(), null, { timeout: 8000 }).catch(() => {});
      await settle(page);
      const after = await page.evaluate(() => ({ busy: document.querySelector('[data-view="home"]')?.getAttribute('aria-busy'), cls: window.__cls, shownAt: window.__shownAt, name: document.querySelector('#swipe-name')?.textContent.trim() }));
      const left = await visibleSkeletons(page, '[data-view="home"]');
      check(`375: deck_candidates delayed 3 s: skeleton visible and container aria-busy within 300 ms (${early})`, () => assert.equal(early, true));
      check(`375: the card replaces the skeleton, CLS < 0.1 (${JSON.stringify({ ...after, left })})`, () => {
        // CLS is counted from __shownAt: it must be a real time, or the sum is vacuously 0 (final review 6a).
        assert.ok(Number.isFinite(after.shownAt), `__shownAt is ${after.shownAt}`);
        assert.equal(after.name, 'Asha Band'); assert.equal(left, 0); assert.notEqual(after.busy, 'true'); assert.ok(after.cls < 0.1);
      });
      check(`reduced motion: transition-duration 0s on .app-nav-button and no shimmer animation (${JSON.stringify(motion)})`, () => {
        assert.ok(motion.nav.length > 0); motion.nav.forEach((d) => d.split(',').forEach((x) => assert.equal(x.trim(), '0s')));
        assert.ok(motion.shimmer.length > 0); motion.shimmer.forEach((n) => assert.equal(n, 'none'));
      });
      await context.close();
      delete st.routes;
    }
    {
      st.deckFail = true;
      const { context, page } = await open(NARROW);
      await page.waitForTimeout(2000);
      const state = await page.evaluate(() => {
        const action = document.querySelector('#deck-empty-action');
        return { skeletons: [...document.querySelectorAll('.skeleton')].filter((el) => el.getClientRects().length).length, retry: action?.dataset.deckAction, visible: Boolean(action?.getClientRects().length), busy: document.querySelector('[data-view="home"]')?.getAttribute('aria-busy') };
      });
      check(`375: deck_candidates 500: no .skeleton after 2 s and the retry action is visible (${JSON.stringify(state)})`, () => {
        assert.equal(state.skeletons, 0); assert.equal(state.retry, 'retry'); assert.equal(state.visible, true); assert.notEqual(state.busy, 'true');
      });
      // Retry while the deck still fails: the skeleton shows while it loads, and the retry state comes back.
      st.routes = { 'rpc/deck_candidates': { delayMs: 1200, status: 500 } };
      await page.locator('#deck-empty-action').click();
      const during = await page.waitForFunction(() => document.querySelector('[data-view="home"]')?.getAttribute('aria-busy') === 'true', null, { timeout: 600 }).then(() => true).catch(() => false);
      await page.waitForTimeout(2000);
      const again = await page.evaluate(() => ({ skeletons: [...document.querySelectorAll('.skeleton')].filter((el) => el.getClientRects().length).length, retry: document.querySelector('#deck-empty-action')?.dataset.deckAction }));
      check(`375: Try again shows the deck skeleton, then the retry state again (${JSON.stringify({ during, ...again })})`, () => {
        assert.equal(during, true); assert.equal(again.skeletons, 0); assert.equal(again.retry, 'retry');
      });
      await context.close();
      st.deckFail = false;
      delete st.routes;
    }
    {
      st.matchIds = [A];
      st.routes = { 'GET brivia_messages': { delayMs: 3000 }, 'GET community_posts': { delayMs: 3000 } };
      const chat = await open(NARROW, '/app.html?view=chat');
      const chatState = await chat.page.waitForFunction(() => {
        const list = document.querySelector('#chat-list');
        return list?.getAttribute('aria-busy') === 'true' && [...list.querySelectorAll('.skeleton')].some((el) => el.getBoundingClientRect().height > 0);
      }, null, { timeout: 1500 }).then(() => true).catch(() => false);
      await chat.page.waitForFunction(() => document.querySelector('#chat-list [data-chat-id]'), null, { timeout: 10000 }).catch(() => {});
      const chatAfter = await visibleSkeletons(chat.page, '#chat-list');
      const chatBusy = await chat.page.evaluate(() => document.querySelector('#chat-list')?.getAttribute('aria-busy'));
      check(`375: the chat list shows a skeleton and is aria-busy while delayed, then the threads (${JSON.stringify({ chatState, chatAfter, chatBusy })})`, () => {
        assert.equal(chatState, true); assert.equal(chatAfter, 0); assert.notEqual(chatBusy, 'true');
      });
      await chat.context.close();
      st.routes = { 'GET community_posts': { delayMs: 3000 } };
      const posts = await open(NARROW, '/app.html?view=posts');
      const postsState = await posts.page.waitForFunction(() => {
        const list = document.querySelector('#community-post-list');
        return list?.getAttribute('aria-busy') === 'true' && [...list.querySelectorAll('.skeleton')].some((el) => el.getBoundingClientRect().height > 0);
      }, null, { timeout: 1500 }).then(() => true).catch(() => false);
      await posts.page.waitForFunction(() => document.querySelector('#community-post-list .community-post-empty'), null, { timeout: 10000 }).catch(() => {});
      const postsAfter = await visibleSkeletons(posts.page, '#community-post-list');
      check(`375: posts show a skeleton and are aria-busy while delayed, then the feed (${JSON.stringify({ postsState, postsAfter })})`, () => {
        assert.equal(postsState, true); assert.equal(postsAfter, 0);
      });
      await posts.context.close();
      delete st.routes;
      st.matchIds = [];
    }
    {
      // Every empty state offers a next step: deck caught up, inbox, posts, notifications.
      st.emptyDeck = true; st.status = 'caught_up'; st.matchIds = []; st.posts = [];
      const actionIn = (page, sel) => page.evaluate((s) => {
        const box = document.querySelector(s);
        const controls = [...(box?.querySelectorAll('button, a[href]') || [])].filter((el) => el.getClientRects().length);
        return { found: Boolean(box), text: box?.textContent.replace(/\s+/g, ' ').trim().slice(0, 80), actions: controls.map((el) => el.textContent.trim()) };
      }, sel);
      const home = await open(NARROW);
      await home.page.waitForFunction(() => document.querySelector('#home-empty-state')?.dataset.cause === 'caught_up', null, { timeout: 8000 }).catch(() => {});
      const deckEmpty = await actionIn(home.page, '#home-empty-state');
      await home.page.locator('#app-notification-button').click();
      await home.page.waitForTimeout(300);
      const notes = await actionIn(home.page, '#notification-list');
      await home.page.locator('#notification-list [data-notification-settings]').click({ timeout: 3000 }).catch(() => {});
      const settingsOpen = await home.page.evaluate(() => Boolean(document.querySelector('#profile-notification-settings-modal')));
      await home.context.close();
      const chat = await open(NARROW, '/app.html?view=chat');
      await settle(chat.page);
      const inbox = await actionIn(chat.page, '.inbox-empty');
      await chat.context.close();
      const posts = await open(NARROW, '/app.html?view=posts');
      await posts.page.waitForFunction(() => document.querySelector('#community-post-list .community-post-empty'), null, { timeout: 8000 }).catch(() => {});
      const postsEmpty = await actionIn(posts.page, '#community-post-list .community-post-empty');
      await posts.page.locator('#community-post-list [data-post-first]').click({ timeout: 3000 }).catch(() => {});
      await posts.page.waitForTimeout(200);
      const focused = await posts.page.evaluate(() => document.activeElement === document.querySelector('#community-post-form textarea'));
      await posts.context.close();
      for (const [name, state] of [['deck caught up', deckEmpty], ['inbox', inbox], ['posts', postsEmpty], ['notifications', notes]]) {
        check(`375: the ${name} empty state contains a button or link (${JSON.stringify(state)})`, () => { assert.equal(state.found, true); assert.ok(state.actions.length >= 1); });
      }
      check(`375: "Write the first post" focuses the composer's caption (${focused})`, () => assert.equal(focused, true));
      check(`375: the notifications empty state opens the notification settings (${settingsOpen})`, () => assert.equal(settingsOpen, true));
      st.emptyDeck = false; delete st.posts;
    }
    {
      // The post submit button is aria-busy while the insert is pending.
      st.routes = { 'POST community_posts': { delayMs: 2500 } };
      const { context, page } = await open(NARROW, '/app.html?view=posts');
      await settle(page);
      await page.locator('#open-community-post').click();
      await page.locator('#community-post-image').setInputFiles({ name: 'still.png', mimeType: 'image/png', buffer: STILL });
      await page.locator('#community-post-caption').fill('A quiet win today.');
      await page.locator('.community-post-submit').click();
      const busy = await page.waitForFunction(() => {
        const b = document.querySelector('.community-post-submit');
        return b?.getAttribute('aria-busy') === 'true' && b.disabled;
      }, null, { timeout: 2000 }).then(() => true).catch(() => false);
      await page.waitForFunction(() => document.querySelector('.community-post-submit')?.getAttribute('aria-busy') !== 'true', null, { timeout: 8000 }).catch(() => {});
      const done = await page.evaluate(() => ({ busy: document.querySelector('.community-post-submit')?.getAttribute('aria-busy'), disabled: document.querySelector('.community-post-submit')?.disabled }));
      check(`375: post submit is aria-busy while the insert is pending, then restored (${JSON.stringify({ busy, ...done })})`, () => {
        assert.equal(busy, true); assert.notEqual(done.busy, 'true'); assert.equal(done.disabled, false);
      });
      await context.close();
      delete st.routes;
    }

    } // earlier
    st.matchIds = [];
    check(`no uncaught page errors (${pageErrors.join(' | ')})`, () => assert.deepEqual(pageErrors, []));
  }
} finally {
  await browser?.close();
  await stub.close();
}

results.forEach(([status, name]) => console.log(`${status}  ${name}`));
const failed = results.filter(([status]) => status === 'FAIL').length;
if (!SHOTS) console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
