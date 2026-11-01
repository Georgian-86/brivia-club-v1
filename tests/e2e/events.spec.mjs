// Explore events (D-117, migration 0020): the nav reads Connect, Explore, Posts, Chat, Profile; Explore lists events
// near you (hero, Nearby Events, the "Find a companion" switch, category chips, cards with date, ~km, tags, going and
// "Find a companion"), and an event panel beside the grid at 1440 (a full-screen sheet at 390) with "I'm going",
// "Looking for a companion?" and "See companions". The community feed is unchanged under Posts. Before 0020 the page
// says events open soon and points to Posts.
// PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/events.spec.mjs   (Vite on :5186)
// EVENTS_SHOTS=<dir> also saves the page, the panel/sheet and the companions dialog at 390 and 1440.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { axeViolations, textAudit, TYPE_FAMILIES } from './a11y.mjs';
import { startAppStub, PHOTO } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.EVENTS_SHOTS || '';
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };

const day = (n, h, m = 0) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(h - 5, m - 30, 0, 0); return d.toISOString(); };
const ev = (id, title, category, tags, venue, km, dayN, start, end, extra = {}) => ({
  id, title, description: `${title}: good people, better company.`, category, tags, venue_name: venue, venue_area: 'Whitefield, Bengaluru',
  starts_at: day(dayN, start), ends_at: end === null ? null : day(dayN, end), image_key: '', distance_km: km, going_count: 10, companion_count: 4,
  going: false, wants_companion: false, friends: [], ...extra,
});
const FRIEND = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const events = () => [
  ev('e-jam', 'Acoustic Jam Session', 'music', ['Music', 'Networking', 'Chill'], 'The Whitefield Social', 1, 1, 18, 21, { image_key: 'jam', going_count: 12, companion_count: 8, friends: [{ id: FRIEND, name: 'Asha Band', photo_url: PHOTO(FRIEND) }] }),
  ev('e-tech', 'Tech & Coffee Night', 'tech', ['Tech', 'Startups', 'Networking'], 'Third Wave Coffee', 2, 2, 17, 20, { image_key: 'tech', going_count: 28, companion_count: 17 }),
  ev('e-chess', 'Blitz Chess Meetup', 'games', ['Games', 'Strategy', 'Community'], 'Battle Chess Skool', 2, 3, 10, 13, { image_key: 'chess' }),
  ev('e-dandiya', 'Dandiya Night', 'culture', ['Culture', 'Dance', 'Social'], 'The Courtyard', 1, 4, 19, null, { image_key: 'dandiya', going_count: 24, companion_count: 20 }),
  ev('e-badminton', 'Badminton & Chill', 'sports', ['Sports', 'Fitness', 'Community'], 'Play Arena', 5, 6, 18, 21, { image_key: 'badminton' }),
  ev('e-food', 'Food Explorers Club', 'food', ['Food', 'Exploration', 'Social'], 'Bengaluru Kitchen Club', 9, 9, 19, 22, { image_key: 'food' }),
  ev('e-far', 'Sunset Photo Walk', 'art', ['Art', 'Photography'], 'Varthur Lake', 40, 10, 17, 19, { image_key: 'photo', going_count: 0, companion_count: 0 }),
];
const companions = [
  { member_id: 'cccccccc-cccc-4ccc-8ccc-000000000001', name: 'Ravi Tune', photo_url: PHOTO('cccccccc-cccc-4ccc-8ccc-000000000001'), shared_interests: 3, is_connection: false },
  { member_id: FRIEND, name: 'Asha Band', photo_url: PHOTO(FRIEND), shared_interests: 1, is_connection: true },
];
const st = { matchIds: [FRIEND], events: events(), companions, companionDefault: false };
const stub = await startAppStub({ port: 5186, state: st });
const browser = await chromium.launch();
const errors = [];
const shot = async (page, name, full = false) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), fullPage: full }); };
const posted = (name) => st.calls.filter((c) => c.method === 'POST' && c.path === `/rest/v1/rpc/${name}`);
const visibleNav = (page) => page.evaluate(() => [...document.querySelectorAll('[data-nav-host] .app-nav-button')].filter((a) => a.offsetParent).map((a) => a.textContent.trim()));

try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    Object.assign(st, { events: events(), companionDefault: false, rsvps: [] });
    st.calls.length = 0;
    const phone = w < 780;
    const ctx = await stub.newContext(browser, { width: w, height: h }, phone ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: '/app.html?view=events', errors });
    page.setDefaultTimeout(8000);
    await page.waitForSelector('.event-card[data-event-id="e-jam"]');
    await page.locator('.event-card[data-event-id="e-jam"] .event-card-media img').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.event-card[data-event-id="e-jam"] .event-card-media img')?.naturalWidth > 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    check(`${w}: the nav reads Connect, Explore, Posts, Chat, Profile`, JSON.stringify(await visibleNav(page)) === JSON.stringify(['Connect', 'Explore', 'Posts', 'Chat', 'Profile']), JSON.stringify(await visibleNav(page)));
    check(`${w}: Explore is current`, await page.evaluate(() => [...document.querySelectorAll('[data-nav-host] [aria-current="page"]')].every((a) => a.dataset.nav === 'events')));
    const card = await page.evaluate(() => {
      const c = document.querySelector('.event-card[data-event-id="e-jam"]');
      return { text: c.innerText, img: c.querySelector('.event-card-media img')?.complete && c.querySelector('.event-card-media img')?.naturalWidth > 0, date: c.querySelector('.event-date')?.innerText.replace(/\s+/g, ' ') };
    });
    check(`${w}: the card shows title, time, venue, ~km, tags, going and companions (${JSON.stringify(card.text)})`,
      /Acoustic Jam Session/.test(card.text) && /6:00 PM – 9:00 PM/.test(card.text) && /The Whitefield Social, Whitefield/.test(card.text)
      && /~1 km/.test(card.text) && /Networking/.test(card.text) && /\+11 going/.test(card.text) && /8 looking for one/.test(card.text));
    check(`${w}: the card image loads and the date badge reads like "NOV 2 Mon" (${card.date})`, card.img && /^[A-Z]{3} \d{1,2} [A-Z][a-z]{2}$/.test(card.date));
    check(`${w}: no metres anywhere (distances are ~km)`, !(await page.locator('.events-view').innerText()).match(/\d+ m\b/));
    check(`${w}: an open-ended event ends Late`, /7:00 PM – Late/.test(await page.locator('.event-card[data-event-id="e-dandiya"]').innerText()));
    check(`${w}: no sideways scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const audit = await textAudit(page, { root: '.events-view', families: TYPE_FAMILIES });
    check(`${w}: text >= 12 px in the club's two families`, audit.small.length === 0 && audit.family.length === 0, JSON.stringify([audit.small.slice(0, 3), audit.family.slice(0, 3)]));
    const axe = await axeViolations(page, { include: '.events-view' });
    check(`${w}: axe on the events page`, axe.length === 0, JSON.stringify(axe));
    await shot(page, `events-${w}.png`);
    if (!phone) await shot(page, `events-${w}-full.png`, true);

    // Chips filter; Nearby keeps <= 15 km.
    await page.locator('[data-event-category="music"]').click();
    check(`${w}: Music shows only music`, (await page.locator('.event-card').count()) === 1 && await page.locator('[data-event-category="music"]').getAttribute('aria-pressed') === 'true');
    await page.locator('[data-event-category="all"]').click();
    await page.locator('#events-nearby').click();
    check(`${w}: Nearby Events hides the 40 km walk`, (await page.locator('.event-card').count()) === 6 && await page.locator('.event-card[data-event-id="e-far"]').count() === 0);
    await page.locator('#events-nearby').click();

    // Panel / sheet.
    if (phone) {
      check('390: no panel until a card is tapped', await page.locator('#event-detail').isHidden());
      await page.locator('.event-card[data-event-id="e-jam"] .event-open').click();
      await page.waitForSelector('#event-detail.is-sheet');
      check('390: the sheet is a modal dialog, focus on its title, no tab bar', await page.evaluate(() => document.querySelector('#event-detail').getAttribute('aria-modal') === 'true' && document.activeElement?.id === 'event-detail-title' && getComputedStyle(document.querySelector('.app-tabbar')).display === 'none'));
    } else {
      await page.waitForSelector('#event-detail:not([hidden]) #event-detail-title');
      check('1440: the panel shows the first event beside the grid', (await page.locator('#event-detail-title').innerText()) === 'Acoustic Jam Session');
      await page.locator('.event-card[data-event-id="e-tech"] .event-open').click();
      check('1440: a click selects that event', (await page.locator('#event-detail-title').innerText()) === 'Tech & Coffee Night' && await page.locator('.event-card[data-event-id="e-tech"].is-selected').count() === 1);
      await page.locator('.event-card[data-event-id="e-jam"] .event-open').click();
    }
    const detail = await page.locator('#event-detail').innerText();
    check(`${w}: the panel has the date, ~km, tags, copy, going, the companion switch and See companions (8)`,
      /~1 km/.test(detail) && /Chill/.test(detail) && /good people, better company/.test(detail) && /\+11 going/.test(detail) && /Looking for a companion\?/.test(detail) && /See companions \(8\)/.test(detail));
    await shot(page, `detail-${w}.png`);
    const axeDetail = await axeViolations(page, { include: '#event-detail' });
    check(`${w}: axe on the panel`, axeDetail.length === 0, JSON.stringify(axeDetail));

    // Going, then the companion switch (one RPC each, counts move once).
    await page.locator('[data-event-going]').click();
    await page.waitForFunction(() => document.querySelector('[data-event-going]')?.getAttribute('aria-pressed') === 'true');
    const goingCall = JSON.parse(posted('set_event_rsvp').at(-1)?.body || '{}');
    check(`${w}: "I'm going" saves going without touching the companion flag (${JSON.stringify(goingCall)})`, goingCall.p_event === 'e-jam' && goingCall.p_going === true && goingCall.p_wants_companion === null);
    check(`${w}: the count moves to +12`, /\+12 going/.test(await page.locator('#event-detail').innerText()));
    await page.locator('[data-event-wants]').click();
    await page.waitForFunction(() => document.querySelector('[data-event-wants]')?.getAttribute('aria-checked') === 'true');
    const wantsCall = JSON.parse(posted('set_event_rsvp').at(-1)?.body || '{}');
    check(`${w}: the companion switch saves wants_companion`, wantsCall.p_going === true && wantsCall.p_wants_companion === true);
    check(`${w}: focus stays on the switch`, await page.evaluate(() => document.activeElement?.hasAttribute('data-event-wants')));
    check(`${w}: See companions still counts others only (8)`, /See companions \(8\)/.test(await page.locator('#event-detail').innerText()));

    // Companions dialog.
    await page.locator('[data-event-companions]').click();
    await page.waitForSelector('#event-companions-dialog[open] .event-companion-row');
    const rows = await page.locator('#event-companions-list').innerText();
    check(`${w}: companions list shared interests first and offers Message to a connection`, /Ravi Tune[\s\S]*3 shared interests[\s\S]*Say hi[\s\S]*Asha Band[\s\S]*Already a connection[\s\S]*Message/.test(rows), rows);
    await shot(page, `companions-${w}.png`);
    const axeDialog = await axeViolations(page, { include: '#event-companions-dialog' });
    check(`${w}: axe on the companions dialog`, axeDialog.length === 0, JSON.stringify(axeDialog));
    await page.locator('[data-companion-hi]').click();
    await page.waitForFunction(() => document.querySelector('[data-companion-hi]')?.textContent === 'Request sent');
    const signal = JSON.parse(posted('send_signal').at(-1)?.body || '{}');
    check(`${w}: Say hi sends one ordinary signal with a note about the event (${JSON.stringify(signal)})`, posted('send_signal').length === 1 && signal.p_to === companions[0].member_id && /Acoustic Jam Session/.test(signal.p_note));
    await page.keyboard.press('Escape');
    check(`${w}: Escape closes the dialog`, !(await page.locator('#event-companions-dialog').evaluate((d) => d.open)));

    // Card chip opens the panel at the switch.
    if (phone) {
      await page.locator('[data-event-close]').click();
      check('390: ← closes the sheet and focus returns to the card', await page.locator('#event-detail').isHidden() && await page.evaluate(() => Boolean(document.activeElement?.closest('.event-card'))));
    }
    await page.locator('.event-card[data-event-id="e-tech"] [data-event-companion]').click();
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-event-wants'));
    check(`${w}: "Find a companion" on a card opens that event at the switch`, (await page.locator('#event-detail-title').innerText()) === 'Tech & Coffee Night');
    if (phone) await page.keyboard.press('Escape');

    // The page switch.
    await page.locator('#events-companion-default').click();
    await page.waitForFunction(() => document.querySelector('#events-companion-default')?.getAttribute('aria-checked') === 'true');
    check(`${w}: the page switch saves set_companion_default(true)`, JSON.parse(posted('set_companion_default').at(-1)?.body || '{}').p_on === true);

    // Posts is the old Explore feed.
    await page.locator('[data-nav-host] [data-nav="posts"]:visible').click();
    await page.waitForSelector('[data-view="posts"]:not([hidden])');
    check(`${w}: Posts shows the community feed`, /Share what/.test(await page.locator('[data-view="posts"] h1').innerText()) && new URL(page.url()).searchParams.get('view') === 'posts');
    await ctx.close();
  }

  // A shared post link still lands on Posts; explore.html without one lands on Explore.
  {
    const ctx = await stub.newContext(browser, { width: 1280, height: 800 });
    const page = await ctx.newPage();
    await page.goto(`${stub.url}/explore.html`);
    await page.waitForURL(/view=events/);
    check('explore.html goes to Explore (events)', /view=events/.test(page.url()));
    await page.goto(`${stub.url}/explore.html?post=p1`);
    await page.waitForURL(/view=posts/);
    check('explore.html?post= still goes to Posts', /view=posts&post=p1/.test(page.url()));
    await ctx.close();
  }

  // Before 0020: a calm message and a way to Posts; nothing breaks.
  {
    st.events = null;
    const ctx = await stub.newContext(browser, { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    const page = await stub.open(ctx, { path: '/app.html?view=events', errors });
    await page.waitForSelector('.events-empty');
    const text = await page.locator('.events-empty').innerText();
    check(`before 0020: "Events open soon" with a way to Posts (${JSON.stringify(text)})`, /Events open soon/.test(text) && await page.locator('.events-empty [data-nav="posts"]').count() === 1);
    await shot(page, 'events-before-0020-390.png');
    await ctx.close();
  }
  check(`no uncaught page errors (${JSON.stringify(errors.slice(0, 3))})`, errors.filter((e) => !/404|PGRST202/.test(e)).length === 0);
} catch (error) {
  console.log(`FAIL crashed: ${error.stack || error.message}`);
  failed += 1;
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} failed` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
