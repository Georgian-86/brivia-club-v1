// Launch polish (D-092), stubbed Supabase (Vite on :5185). Never touches a real Supabase project. At 1440 and 390 px:
// * login: the divider reads OR, exactly midway between LOG IN and the Google button, 12-16 px from each (D-095);
// * the public profile dialog: name and band, no invented bio, each interest once, Message only for a match (it opens
//   that chat), Escape closes and focus returns;
// * "Find your people": no capsule cloud; Skills & interests is a dropdown (Popular first), picks stay open, typing +
//   Enter picks, arrows move, Escape closes the list (not the drawer), an outside press closes it, a chip removes;
// * Edit profile: the area changes by city search (set_home_city) or "Use my location" (set_home_location), the
//   3-a-day limit says so, the hero follows; no "coming soon";
// * the profile page: the brand sidebar (desktop, no controls) and the framed photo with EDIT PROFILE and ⚙;
// * the chat GIF picker says so when no GIF can load (never an empty picker).
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/launch-polish.spec.mjs
import assert from 'node:assert/strict';
import { startAppStub, defaultDeckRows, ME } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const A = defaultDeckRows[0].id;
const messages = [{ id: 'm1', sender_id: A, recipient_id: ME, content: 'Hi there', created_at: new Date(Date.now() - 6e5).toISOString() }];
const state = {
  matchIds: [A], messages,
  routes: {
    place: { body: [{ id: 'in-pune', name: 'Pune', region: 'Maharashtra', country: 'IN' }, { id: 'in-puducherry', name: 'Puducherry', region: 'Puducherry', country: 'IN' }] },
    'rpc/set_home_city': { body: 'Pune' },
    'rpc/set_home_location': { body: 'Thane' },
  },
};
const stub = process.env.BASE ? null : await startAppStub({ port: 5185, state });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log('PASS ', name); } catch (e) { failures++; console.log('FAIL ', name, e.message.replace(/\s+/g, ' ').slice(0, 1200)); } };
const errors = [];

try {
  for (const [tag, viewport] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844 }]]) {
    // 0. Login (signed out): OR sits exactly midway between LOG IN and the Google button, and the card fits the screen.
    {
      const out = await browser.newContext({ viewport });
      await out.route('https://stub.supabase.local/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }));
      const login = await out.newPage();
      await login.goto(`${stub.url}/auth.html#login`, { waitUntil: 'load' });
      await login.waitForSelector('.auth-login.is-active #login-form');
      await login.waitForTimeout(600);
      const gaps = await login.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        const submit = r('.auth-login #login-form .auth-submit'); const or = r('.auth-login .auth-divider span'); const g = r('.auth-login .auth-google-trigger');
        return { above: Math.round(or.top - submit.bottom), below: Math.round(g.top - or.bottom), text: document.querySelector('.auth-login .auth-divider').textContent.trim(), googleBottom: Math.round(g.bottom), h: innerHeight };
      });
      await check(`${tag} login: the divider reads OR, midway between LOG IN and Google (${JSON.stringify(gaps)})`, () => {
        assert.equal(gaps.text, 'OR'); assert.ok(Math.abs(gaps.above - gaps.below) <= 1); assert.ok(gaps.above >= 10 && gaps.above <= 17, 'OR gap'); assert.ok(gaps.googleBottom <= gaps.h);
      });
      await out.close();
    }
    // 1. The public profile dialog, from the deck card (Asha is a match in this stub).
    let ctx = await stub.newContext(browser, viewport);
    let page = await stub.open(ctx, { errors });
    await page.waitForSelector('#swipe-card .view-info-button', { timeout: 10000 });
    await page.click('#swipe-card .view-info-button');
    await page.waitForSelector('#public-profile-modal');
    const dialog = await page.evaluate(() => {
      const d = document.querySelector('#public-profile-modal');
      const chips = [...d.querySelectorAll('.public-profile-chips li')].map((n) => n.textContent);
      return { text: d.innerText.replace(/\s+/g, ' '), chips, name: d.querySelector('h2')?.textContent, band: d.querySelector('.public-profile-location')?.textContent, message: d.querySelector('[data-public-profile-message]')?.textContent || null, focus: document.activeElement?.className };
    });
    await check(`${tag} profile dialog: name, band, each interest once, no invented bio (${dialog.text})`, () => {
      assert.equal(dialog.name, 'Asha Band'); assert.equal(dialog.band, '~3 km');
      assert.equal(new Set(dialog.chips).size, dialog.chips.length);
      assert.doesNotMatch(dialog.text, /open to meaningful connections/i);
      assert.equal(dialog.focus, 'public-profile-close');
    });
    await check(`${tag} profile dialog: axe clean`, async () => assert.deepEqual(await axeViolations(page, { include: '#public-profile-modal' }), []));
    await check(`${tag} profile dialog: Message for a match opens that chat`, async () => {
      assert.equal(dialog.message, 'Message Asha');
      await page.click('[data-public-profile-message]');
      await page.waitForFunction(() => !document.querySelector('#public-profile-modal') && !document.querySelector('#chat-window')?.hidden, null, { timeout: 4000 });
      assert.equal(await page.textContent('#chat-name'), 'Asha Band');
    });
    await ctx.close();

    // 2. A non-match: no Message button; Escape closes.
    state.matchIds = []; state.messages = [];
    ctx = await stub.newContext(browser, viewport);
    page = await stub.open(ctx, { errors });
    await page.waitForSelector('#swipe-card .view-info-button', { timeout: 10000 });
    await page.click('#swipe-card .view-info-button');
    await page.waitForSelector('#public-profile-modal');
    await check(`${tag} profile dialog: no Message for someone you are not matched with; Escape closes`, async () => {
      assert.equal(await page.locator('[data-public-profile-message]').count(), 0);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#public-profile-modal').count(), 0);
    });

    // 3. Find your people: the dropdown.
    await page.click('#open-discovery-filters');
    await page.waitForSelector('#discovery-filter-drawer:not([hidden])');
    const dd = () => page.evaluate(() => ({
      open: document.querySelector('#filter-skills-input').getAttribute('aria-expanded'),
      groups: [...document.querySelectorAll('#filter-skills-suggestions .discovery-filter-option-label')].map((n) => n.textContent),
      first: document.querySelector('#filter-skills-suggestions [role=option]')?.textContent || null,
      chips: [...document.querySelectorAll('#filter-skills-selected .discovery-filter-selected-chip span:first-child')].map((n) => n.textContent),
      drawer: !document.querySelector('#discovery-filter-drawer').hidden,
      capsules: document.querySelectorAll('.discovery-filter-pop, #filter-popular').length,
    }));
    await check(`${tag} filters: no capsule cloud; the list is closed until the field is used`, async () => { const s = await dd(); assert.equal(s.capsules, 0); assert.equal(s.open, 'false'); });
    await page.click('#filter-skills-input');
    await check(`${tag} filters: the field opens the dropdown, Popular first`, async () => { const s = await dd(); assert.equal(s.open, 'true'); assert.deepEqual(s.groups, ['Popular', 'All']); assert.equal(s.first, 'Chess'); });
    await page.click('#filter-skills-suggestions [role=option] >> nth=0');
    await page.keyboard.type('gui'); await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await check(`${tag} filters: click, typing + Enter and the arrow keys each add a pick; the list stays open`, async () => { const s = await dd(); assert.equal(s.chips.length, 3); assert.deepEqual(s.chips.slice(0, 2), ['Chess', 'Guitar']); assert.equal(s.open, 'true'); });
    await page.keyboard.press('Escape');
    await check(`${tag} filters: Escape closes the list, not the drawer`, async () => { const s = await dd(); assert.equal(s.open, 'false'); assert.equal(s.drawer, true); });
    await page.click('#filter-skills-input'); await page.click('.discovery-filter-note');
    await check(`${tag} filters: a press outside closes the list`, async () => assert.equal((await dd()).open, 'false'));
    await page.click('#filter-skills-selected .discovery-filter-selected-chip');
    await check(`${tag} filters: a chip removes its pick and focus goes back to the field`, async () => {
      assert.equal((await dd()).chips.length, 2);
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'filter-skills-input');
    });
    await check(`${tag} filters: axe clean`, async () => assert.deepEqual(await axeViolations(page, { include: '.discovery-filter-panel' }), []));
    await ctx.close();
    state.matchIds = [A]; state.messages = messages;

    // 4. The profile page and Edit profile: change the area.
    ctx = await stub.newContext(browser, viewport);
    await ctx.addInitScript(() => { Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (ok) => setTimeout(() => ok({ coords: { latitude: 19.2, longitude: 72.97, accuracy: 900 } }), 30) }, configurable: true }); });
    page = await stub.open(ctx, { path: '/app.html?view=profile', errors });
    await page.waitForSelector('#profile-photo-editor', { state: 'visible', timeout: 10000 });
    const hero = await page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      const frame = document.querySelector('.profile-photo-frame');
      const sidebar = document.querySelector('.profile-sidebar');
      return { frame: box(frame), avatar: box(document.querySelector('#profile-avatar')), edit: box(document.querySelector('#profile-photo-editor')), gear: box(document.querySelector('#profile-settings-button')), sidebarShown: getComputedStyle(sidebar).display !== 'none', sidebarControls: sidebar.querySelectorAll('a, button, input, [tabindex]').length, quote: document.querySelector('.profile-hero-quote')?.textContent, status: document.querySelectorAll('.profile-status').length, tapInset: getComputedStyle(document.querySelector('#profile-photo-editor'), '::after').top };
    });
    await check(`${tag} profile: the photo fills a framed card; EDIT PROFILE and ⚙ are 44 px (on phones 32 px with a 44 px tap area, D-098); quote shown; no status pill`, () => {
      assert.ok(Math.abs(hero.avatar.w - (hero.frame.w - (tag === '390' ? 12 : 16))) <= 1, JSON.stringify(hero));
      const min = tag === '390' ? 32 : 44;
      assert.ok(hero.edit.h >= min && hero.gear.w >= min && hero.gear.h >= min, JSON.stringify(hero));
      if (tag === '390') assert.equal(hero.tapInset, '-6px');
      assert.match(hero.quote, /Same curiosity/); assert.equal(hero.status, 0);
    });
    await check(`${tag} profile: the brand sidebar shows on desktop only, with no controls`, () => { assert.equal(hero.sidebarShown, tag === '1440'); assert.equal(hero.sidebarControls, 0); });
    await page.click('#profile-photo-editor');
    await page.waitForSelector('#profile-edit-modal');
    const area = () => page.evaluate(() => ({ current: document.querySelector('[data-area-current]').textContent, status: document.querySelector('[data-area-status]').textContent, hero: document.querySelector('#profile-location').textContent, options: [...document.querySelectorAll('#profile-area-results button')].length, text: document.querySelector('[data-profile-area]').textContent, nested: Boolean(document.querySelector('[data-profile-area] [name="lookingFor"]')) }));
    await check(`${tag} edit profile: the area block is closed and says nothing about "coming soon"`, async () => { const s = await area(); assert.equal(s.nested, false); assert.doesNotMatch(s.text, /coming soon/i); });
    await page.fill('[data-area-search]', 'Pu'); await page.waitForFunction(() => document.querySelectorAll('#profile-area-results button').length === 2, null, { timeout: 4000 });
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-area-current]').textContent === 'Pune', null, { timeout: 4000 }).catch(() => {});
    await check(`${tag} edit profile: a picked city is saved (set_home_city) and the hero follows`, async () => {
      const s = await area(); assert.equal(s.current, 'Pune'); assert.equal(s.hero, 'Pune'); assert.equal(s.status, 'Your area is now Pune.');
      assert.ok(stub.calls.some((c) => c.path === '/rest/v1/rpc/set_home_city'), 'no set_home_city call');
    });
    state.routes['rpc/set_home_location'] = { status: 429, code: 'PT429', message: 'try again later' };
    await page.click('[data-area-geo]'); await page.waitForTimeout(600);
    await check(`${tag} edit profile: the 3-a-day limit says so`, async () => assert.match((await area()).status, /3 times today/));
    state.routes['rpc/set_home_location'] = { body: 'Thane' };
    await page.click('[data-area-geo]'); await page.waitForTimeout(600);
    await check(`${tag} edit profile: "Use my location" saves the area (set_home_location)`, async () => { const s = await area(); assert.equal(s.current, 'Thane'); assert.equal(s.hero, 'Thane'); });
    await ctx.close();

    // 5. Chat: the GIF picker when no GIF can load (Giphy is not reachable here).
    ctx = await stub.newContext(browser, viewport);
    await ctx.route(/media\.giphy\.com/, (route) => route.abort());
    page = await stub.open(ctx, { path: '/app.html?view=chat', errors });
    await page.waitForFunction(() => document.querySelector('#chat-list [data-chat-id]'), null, { timeout: 10000 });
    await page.locator('#chat-list .chat-row-copy > span').first().click();
    await page.waitForSelector('#chat-attach-toggle', { state: 'visible' });
    await page.click('#chat-attach-toggle'); await page.click('#chat-attachment-menu [data-chat-picker="gif"]');
    await page.waitForTimeout(600);
    await check(`${tag} chat: a GIF picker with no loadable GIF says so`, async () => assert.equal(await page.locator('#chat-gif-picker .chat-gif-empty').count(), 1));
    await ctx.close();
  }
  await check('no page errors', () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  await stub?.close();
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
