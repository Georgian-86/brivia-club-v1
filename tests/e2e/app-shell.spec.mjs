// Phase C, Task 2: one member navigation (header at desktop, tab bar at <= 780 px), against stubbed Supabase.
// Never touches a real Supabase project. Playwright is NOT a repo dependency; see tests/e2e/README.md.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node tests/e2e/app-shell.spec.mjs
//
// Asserts (375 px and 1440 px unless noted):
// * exactly one visible member nav: the header nav at 1440 px, the tab bar at 375 px, on every view;
// * no .profile-sidebar, .profile-board-nav, #app-logout-button or .chat-sidebar-brand in the DOM;
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
// APP_SHOTS=<dir> only saves full-page screenshots of home, posts, chat and profile at 375 px and 1440 px, then exits
// (the Phase C before/after review), and runs no checks.
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { axeViolations, textAudit, TYPE_FAMILIES } from './a11y.mjs';
import { startAppStub } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const PORT = Number(process.env.E2E_PORT || 5195);
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.APP_SHOTS || '';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const NARROW = { width: 375, height: 812 };
const WIDE = { width: 1440, height: 900 };
const VIEWS = ['home', 'posts', 'chat', 'profile'];
// The nav item that is current for a rendered [data-view] section: the deck section is the Connect tab.
const NAV_FOR_VIEW = { home: 'explore', posts: 'posts', chat: 'chat', profile: 'profile' };
// Dialogs and menus opened by clicking these selectors in order (Phase C Task 4 pre-review).
const DIALOGS = [
  ['profile-edit', 'profile', ['#profile-photo-editor']],
  ['settings-menu', 'profile', ['#profile-settings-button']],
  ['report-dialog', 'explore', ['#card-more', '#card-more-menu [data-card-action="report"]']],
  ['post-composer', 'posts', ['#open-community-post']],
];

const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };

const st = { matchIds: [] };
const stub = await startAppStub({ port: PORT, state: st });
const pageErrors = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });
  const open = async (viewport, pagePath = '/app.html') => {
    const context = await stub.newContext(browser, viewport, { reducedMotion: 'reduce' });
    const page = await stub.open(context, { path: pagePath, errors: pageErrors });
    return { context, page };
  };
  const settle = (page) => page.waitForTimeout(700);

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    st.matchIds = [A];
    for (const [tag, viewport] of [['375', NARROW], ['1440', WIDE]]) {
      for (const view of VIEWS) {
        const { context, page } = await open(viewport, `/app.html?view=${view === 'home' ? 'explore' : view}`);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(SHOTS, `app-${view}-${tag}.png`), fullPage: true });
        await context.close();
      }
    }
    // The dialogs and menus whose text grew in Phase C Task 4, at 375 px: profile edit, the profile settings menu, the
    // report dialog (deck card overflow) and the post composer.
    for (const [name, view, steps] of DIALOGS) {
      const { context, page } = await open(NARROW, `/app.html?view=${view}`);
      await page.waitForTimeout(1500);
      for (const sel of steps) { await page.locator(sel).first().click({ timeout: 5000 }); await page.waitForTimeout(500); }
      await page.screenshot({ path: path.join(SHOTS, `app-${name}-375.png`) });
      await context.close();
    }
    console.log(`saved ${VIEWS.length * 2 + DIALOGS.length} screenshots to ${SHOTS}`);
  } else {
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
      check(`${tag}: header and tab bar list explore, posts, chat, profile (${JSON.stringify([s.headerItems, s.tabbarItems])})`, () => {
        assert.deepEqual(s.headerItems, ['explore', 'posts', 'chat', 'profile']);
        assert.deepEqual(s.tabbarItems, ['explore', 'posts', 'chat', 'profile']);
      });
      // 2. The duplicate navs are gone (the chat view has been rendered above).
      const gone = await page.evaluate(() => ['.profile-sidebar', '.profile-board-nav', '#app-logout-button', '.chat-sidebar-brand'].filter((sel) => document.querySelector(sel)));
      check(`${tag}: no .profile-sidebar, .profile-board-nav, #app-logout-button or .chat-sidebar-brand (${gone.join(', ')})`, () => assert.deepEqual(gone, []));
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
      check(`375: four tab bar items, each >= 44x44 px with >= 12 px labels (${JSON.stringify(items)})`, () => {
        assert.equal(items.length, 4);
        items.forEach((it) => { assert.ok(it.w >= 44 && it.h >= 44, `${it.nav} is ${it.w}x${it.h}`); assert.ok(it.sizes.length >= 1 && it.sizes.every((s) => s >= 12), `${it.nav} label ${it.sizes}`); });
      });
      check(`375: tab labels read Connect, Explore, Chat, Profile (${items.map((i) => i.label).join(', ')})`, () => assert.deepEqual(items.map((i) => i.label), ['Connect', 'Explore', 'Chat', 'Profile']));
      const bar = await page.evaluate(() => { const el = document.querySelector('.app-tabbar'); if (!el) return { missing: true }; const r = el.getBoundingClientRect(); return { bottom: Math.round(r.bottom), vh: window.innerHeight, position: getComputedStyle(el).position }; });
      check(`375: the tab bar is fixed to the bottom (${JSON.stringify(bar)})`, () => { assert.equal(bar.position, 'fixed'); assert.equal(bar.bottom, bar.vh); });

      // 6. Keyboard: Tab reaches each tab bar item, with a visible outline.
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      const reached = {};
      for (let i = 0; i < 120 && Object.keys(reached).length < 4; i += 1) {
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
        assert.deepEqual(Object.keys(reached).sort(), ['chat', 'explore', 'posts', 'profile']);
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

    // 7. The chat badge: hidden with no conversation; shown in header and tab bar with one.
    for (const [label, matchIds, expectShown] of [['no conversation', [], false], ['one conversation', [A], true]]) {
      st.matchIds = matchIds;
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
      await page.locator('#profile-settings-button').click();
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
