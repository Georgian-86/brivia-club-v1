// Nearby (D-131, migration 0029): "Connect / Nearby" at 1440 and 390 (touch). Checks: the Curated / Nearby switch on
// Connect; switch off -> "Turn on Crossing Paths" -> the explainer (discovery wording) -> on, a pulse, cards; the card
// (bar, name, city and a band only, never metres; "You both:" chips; Here now; View profile); the radius picker (1 / 3 /
// 5 km) and refresh; Pass by button and by key (nearby_pass); Connect opens "Make the first move." prefilled with the
// founder's opener and sends nearby_connect; a mutual connect shows "Well, look who crossed paths!" and Start
// conversation opens Chat; the quiet state; a Nearby request says "Someone nearby wants to connect with you" (panel and
// one toast); a crossing-paths match for the member who connected first (toast and panel row); an alerts-only consent
// from before 0029 ("Nearby is new"); location blocked (paused); before 0029 ("Nearby opens soon"); Settings copy; axe.
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/nearby.spec.mjs   (Vite on :5186)
// NEARBY_VIEW_SHOTS=<dir> saves the deck, the composer, the match moment and the states at both widths.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { axeViolations } from './a11y.mjs';
import { startAppStub, PHOTO } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.NEARBY_VIEW_SHOTS || '';
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const id = (n) => `dddddddd-dddd-4ddd-8ddd-0000000000${String(n).padStart(2, '0')}`;
const person = (n, name, band, extra = {}) => ({
  member_id: id(n), name, photo_url: PHOTO(id(n)), cover_url: '/Images/Cover%20images/AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG',
  headline: 'Product designer', bio: 'Weekend chess and long walks.', looking_for: ['Hackathon Buddy', 'Mentor'], skills: ['Figma', 'React'],
  interests: ['Badminton', 'Chess', 'Cafe hopping'], shared_interests: ['Badminton'], shared_count: 1, distance_band: band, place_name: 'Bengaluru',
  here_now: true, asked_me: false, ...extra,
});
const PEOPLE = () => [person(1, 'Yashika', '1'), person(2, 'Kabir', '1', { here_now: false }), person(3, 'Meera', '3', { asked_me: true })];
const BENGALURU = { latitude: 12.9756, longitude: 77.605 };
const st = { matchIds: [], noPresence: true, nearby: { enabled: false }, nearbyPeople: PEOPLE(), nearbyLikedMe: [id(3)] };
const stub = await startAppStub({ port: 5186, state: st });
const browser = await chromium.launch();
const errors = [];
const shot = async (page, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); };
const reset = (extra = {}) => {
  Object.assign(st, { matchIds: [], nearby: { enabled: false }, nearbyPeople: PEOPLE(), nearbyLikedMe: [id(3)], nearbyPassed: [], nearbyConnects: [], nearbyMatches: [], nearbyConsent: true, nearbyDiscovers: [], requests: [], notifications: null, markedRead: [], pushCalls: 0, radiusSaved: null }, extra);
  st.calls.length = 0;
};
const newContext = async (viewport, options = {}, { allow = true } = {}) => {
  const ctx = await stub.newContext(browser, viewport, { geolocation: BENGALURU, ...options });
  if (allow) await ctx.grantPermissions(['geolocation', 'clipboard-read', 'clipboard-write'], { origin: stub.url });
  return ctx;
};
const currentName = (page) => page.evaluate(() => document.querySelector('.nearby-card.is-current .companion-name')?.textContent || '');

try {
  for (const [w, h] of [[1440, 1000], [390, 844]]) {
    const phone = w < 780;
    reset();
    const ctx = await newContext({ width: w, height: h }, phone ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: '/app.html', errors });
    page.setDefaultTimeout(8000);

    // The switch on Connect.
    await page.waitForSelector('[data-view="home"] [data-connect-mode="nearby"]');
    check(`${w}: Connect shows Curated (pressed) and Nearby`, await page.evaluate(() => document.querySelector('[data-view="home"] [data-connect-mode="curated"]')?.getAttribute('aria-pressed') === 'true'));
    await page.locator('[data-view="home"] [data-connect-mode="nearby"]').click();
    await page.waitForSelector('[data-view="nearby"]:not([hidden])');
    const head = await page.evaluate(() => ({
      url: location.search, nav: document.querySelector('[data-nav-host] [aria-current="page"]')?.dataset.nav,
      h1: document.querySelector('#nearby-heading')?.textContent, sub: document.querySelector('.nearby-sub')?.textContent,
      lead: document.querySelector('.nearby-lead')?.textContent, radius: [...document.querySelectorAll('#nearby-radius option')].map((o) => o.textContent),
    }));
    check(`${w}: Nearby opens under Connect (${JSON.stringify(head)})`, head.url.includes('view=nearby') && head.nav === 'explore' && head.h1 === 'People around you.'
      && head.sub === 'Discover interesting people crossing paths with you.' && head.lead === 'Good people might be closer than you think.' && head.radius.join() === '1 km,3 km,5 km,10 km');

    // Off -> Turn on -> explainer -> cards.
    await page.waitForSelector('[data-nearby-turn-on]');
    check(`${w}: switch off says "Turn on Crossing Paths to discover people around you."`, /Turn on Crossing Paths to discover people around you\./.test(await page.locator('#nearby-deck').innerText()));
    await shot(page, `nearby-off-${w}.png`);
    await page.locator('[data-nearby-turn-on]').click();
    await page.waitForSelector('#crossing-paths-explainer');
    const explainer = await page.locator('#crossing-paths-explainer').innerText();
    check(`${w}: the explainer asks for discovery consent in plain words`, /Discover people around you/.test(explainer) && /Never your exact place/.test(explainer) && /under 1 km, 1–3 km or 3–5 km/.test(explainer));
    await page.locator('[data-nearby-confirm]').click();
    await page.waitForSelector('.nearby-card.is-current');
    check(`${w}: turning on saves, pulses in a POST body, then discovers within 1 km`, st.nearby.enabled === true && (st.nearby.pulses || []).length >= 1 && st.nearbyDiscovers.at(-1)?.p_radius_km === 1);
    await page.waitForTimeout(400);
    const card = await page.locator('.nearby-card.is-current').innerText();
    check(`${w}: the card shows the bar, name, headline, city and band, shared interest, Here now, bio, skills (${JSON.stringify(card)})`,
      /LOOKING FOR · HACKATHON BUDDY, MENTOR/i.test(card) && /Yashika/.test(card) && /Product designer/.test(card) && /Bengaluru · Under 1 km away/.test(card)
      && /You both: Badminton/.test(card) && /Here now/.test(card) && /Weekend chess/.test(card) && /Figma/.test(card) && /View profile/i.test(card));
    check(`${w}: never metres or coordinates on the page`, !/\b\d+\s?m\b(?! ?away)|\b\d+ ?metres?\b|12\.97|77\.60/.test(await page.locator('[data-view="nearby"]').innerText()));
    check(`${w}: the radius line`, (await page.locator('#nearby-radius-line').innerText()) === 'People within 1 km of you');
    await shot(page, `nearby-deck-${w}.png`);
    const axe = await axeViolations(page, { include: '[data-view="nearby"]' });
    check(`${w}: axe finds nothing serious on Nearby (${JSON.stringify(axe)})`, axe.length === 0);

    // Radius 3 km brings Meera in.
    await page.locator('#nearby-radius').selectOption('3');
    await page.waitForFunction(() => document.querySelector('#nearby-radius-line')?.textContent === 'People within 3 km of you');
    await page.waitForTimeout(300);
    check(`${w}: 3 km asks again with p_radius_km 3`, st.nearbyDiscovers.at(-1)?.p_radius_km === 3);

    // Pass by button, then by key.
    await page.locator('#nearby-pass').click();
    await page.waitForFunction(() => document.querySelector('.nearby-card.is-current .companion-name')?.textContent === 'Kabir');
    check(`${w}: Pass records nearby_pass for Yashika`, st.nearbyPassed.includes(id(1)));
    await page.locator('#nearby-deck').focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('.nearby-card.is-current .companion-name')?.textContent === 'Meera');
    check(`${w}: ← passes Kabir`, st.nearbyPassed.includes(id(2)));
    check(`${w}: Meera's card says she wants to connect`, /Wants to connect with you/.test(await page.locator('.nearby-card.is-current').innerText()));

    // Connect: the composer, prefilled; Meera connected first, so it is mutual.
    await page.locator('#nearby-like').click();
    await page.waitForSelector('#connect-composer-dialog[open]');
    const composer = await page.evaluate(() => ({ text: document.querySelector('#composer-message')?.value, title: document.querySelector('#composer-title')?.textContent, name: document.querySelector('[data-composer-name]')?.textContent }));
    check(`${w}: "Make the first move." opens prefilled with the founder's opener (${JSON.stringify(composer)})`,
      composer.text === "Hi! Saw you're nearby. Let's connect and share our interests." && /Make the first move\./.test(composer.title) && composer.name === 'Meera');
    await shot(page, `nearby-composer-${w}.png`);
    await page.locator('#composer-message').fill("Hi Meera! Saw you're nearby. Coffee?");
    await page.locator('.composer-send').click();
    await page.waitForSelector('#nearby-match-dialog[open]');
    const match = await page.locator('#nearby-match-dialog').innerText();
    check(`${w}: a mutual connect shows "Well, look who crossed paths!"`, /Well, look who\s+crossed paths!/.test(match) && /Meera/.test(match));
    check(`${w}: nearby_connect carried the edited note`, st.nearbyConnects.at(-1)?.p_to === id(3) && st.nearbyConnects.at(-1)?.p_note === "Hi Meera! Saw you're nearby. Coffee?");
    await page.waitForTimeout(500);
    await shot(page, `nearby-match-${w}.png`);
    await page.locator('#nearby-match-dialog [data-match-chat]').click();
    await page.waitForFunction(() => document.body.dataset.appView === 'chat');
    check(`${w}: Start conversation opens Chat`, true);
    const badgeAfter = await page.evaluate(() => document.querySelector('.notification-companion')?.textContent || '');
    check(`${w}: the member who saw the match moment gets no second "crossed paths" row`, !/crossed paths/.test(badgeAfter));

    // Quiet: back to Nearby with nobody left.
    await page.evaluate(() => { history.pushState({}, '', '/app.html?view=nearby'); dispatchEvent(new PopStateEvent('popstate')); });
    await page.waitForSelector('[data-view="nearby"]:not([hidden])');
    await page.waitForFunction(() => /little quiet around here/.test(document.querySelector('#nearby-deck')?.innerText || ''));
    check(`${w}: the quiet state offers to look further`, /It's a little quiet around here\.[\s\S]*Check back as more people cross paths\./.test(await page.locator('#nearby-deck').innerText()) && await page.locator('[data-nearby-widen="5"]').count() === 1);
    await shot(page, `nearby-quiet-${w}.png`);
    await ctx.close();
  }

  // The other side: a Nearby request, then the crossing-paths match for the member who connected first.
  {
    reset({ nearby: { enabled: true, pulses: [{}] }, requests: [{ from_id: id(1), note: "Hi! Saw you're nearby. Let's connect and share our interests.", created_at: new Date().toISOString(), via: 'nearby' }] });
    st.nearbyPeople = PEOPLE();
    const ctx = await newContext({ width: 1440, height: 1000 });
    const page = await stub.open(ctx, { path: '/app.html', errors });
    await page.waitForFunction(() => /Someone nearby wants to connect with you/.test(document.querySelector('#app-toast')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
    const toast = await page.evaluate(() => document.querySelector('#app-toast')?.textContent || '');
    check(`a Nearby request toasts "Someone nearby wants to connect with you." (${toast})`, /Someone nearby wants to connect with you/.test(toast));
    await page.locator('#app-notification-button').click();
    const panel = await page.locator('#app-notification-panel').innerText();
    check('the panel says "Someone nearby wants to connect with you"', /Someone nearby wants to connect with you/.test(panel));
    await page.locator('[data-collab-review]').click();
    await page.waitForSelector('dialog.collab-review[open]');
    check('the review card says "Crossed paths nearby"', /Crossed paths nearby/.test(await page.locator('dialog.collab-review').innerText()));
    await page.keyboard.press('Escape');
    // Reload: no second toast for the same request.
    st.nearbyMatches = [{ other_id: id(2), name: 'Kabir', photo_url: PHOTO(id(2)), matched_at: new Date().toISOString() }];
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('app-auth-pending'));
    await page.waitForFunction(() => /crossed paths/.test(document.querySelector('#app-toast')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
    const toast2 = await page.evaluate(() => document.querySelector('#app-toast')?.textContent || '');
    check(`the member who connected first is told "Well, look who crossed paths!" (${toast2})`, /Well, look who crossed paths! You and Kabir are connected\./.test(toast2));
    await page.locator('#app-notification-button').click();
    const panel2 = await page.locator('#app-notification-panel').innerText();
    check('…and the panel lists "You and Kabir crossed paths"', /You and Kabir crossed paths/.test(panel2));
    check('the same Nearby request is not toasted again after a reload', !/Someone nearby/.test(toast2));
    await shot(page, 'nearby-panel-1440.png');
    await ctx.close();
  }

  // An alerts-only switch from before 0029: "Nearby is new".
  {
    reset({ nearby: { enabled: true }, nearbyConsent: false });
    const ctx = await newContext({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    const page = await stub.open(ctx, { path: '/app.html?view=nearby', errors });
    await page.waitForFunction(() => /Nearby is new/.test(document.querySelector('#nearby-deck')?.innerText || ''));
    check('a pre-0029 switch asks for discovery consent ("Nearby is new")', await page.locator('[data-nearby-turn-on]').count() === 1);
    await shot(page, 'nearby-consent-390.png');
    await ctx.close();
  }

  // D-134: "Someone crossed your path." The same stub is the one server for a laptop and a phone.
  {
    reset({ nearby: { enabled: true }, nearbyPeople: PEOPLE(), notifications: [] });
    const note = (n, extra = {}) => ({ id: `n-${n}`, notification_type: 'nearby_appeared', source_user_id: id(n === 1 ? 2 : 1), name: n === 1 ? 'Kabir' : 'Yashika', photo_url: PHOTO(id(2)), band: '1', place_name: 'Bengaluru', created_at: new Date().toISOString(), read_at: null, dismissed_at: null, ...extra });
    const laptop = await newContext({ width: 1440, height: 1000 });
    const phone = await newContext({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    const lp = await stub.open(laptop, { path: '/app.html?view=nearby', errors });
    const pp = await stub.open(phone, { path: '/app.html?view=nearby', errors });
    await lp.waitForSelector('.nearby-card.is-current');
    await pp.waitForSelector('.nearby-card.is-current');
    const sizes = await lp.evaluate(() => ({ w: Math.round(document.querySelector('.nearby-card.is-current').getBoundingClientRect().width), refresh: document.querySelector('#nearby-refresh')?.innerText.trim(), radii: [...document.querySelectorAll('#nearby-radius option')].map((o) => o.value).join() }));
    check(`compact card on desktop (≤ 362 px), "Refresh" labelled, radii 1/3/5/10 (${JSON.stringify(sizes)})`, sizes.w <= 362 && sizes.refresh === 'Refresh' && sizes.radii === '1,3,5,10');
    const phoneFit = await pp.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, w: Math.round(document.querySelector('.nearby-card.is-current').getBoundingClientRect().width) }));
    check(`the card fits the phone, no horizontal overflow (${JSON.stringify(phoneFit)})`, phoneFit.overflow <= 0 && phoneFit.w <= 362);
    await lp.locator('#nearby-radius').selectOption('10');
    await lp.waitForFunction(() => document.querySelector('#nearby-radius-line')?.textContent === 'People within 10 km of you');
    check('10 km is saved for notifications (set_nearby_radius)', st.radiusSaved === 10);

    // A new nearby person: the in-section notice on the laptop, once, and the push function is called after the pulse.
    st.notifications.push(note(1));
    const pushBefore = st.pushCalls || 0;
    await lp.locator('#nearby-refresh').click();
    await lp.waitForSelector('.nearby-notice', { timeout: 8000 }).catch(() => {});
    const notice = await lp.evaluate(() => document.querySelector('.nearby-notice')?.innerText || '');
    check(`D-138 the notice: "Someone interesting crossed your path." with who, how far, where, when and Discover (${JSON.stringify(notice)})`,
      /Someone interesting crossed your path\./.test(notice) && /You and Kabir were within 1 km of each other, near Bengaluru\./.test(notice) && /Just now · Discover who you crossed paths with\./.test(notice) && /Discover/i.test(notice));
    check('the push function runs after the pulse', (st.pushCalls || 0) > pushBefore);
    await lp.waitForTimeout(400);
    await shot(lp, 'nearby-notice-1440.png');
    await lp.waitForTimeout(3300);
    check('seen for 3 s on the laptop: read on the server', (st.notifications.find((x) => x.id === 'n-1') || {}).read_at && st.markedRead.includes('n-1'));

    // The phone: the same notification is already read; no notice, not counted as unread.
    await pp.locator('#nearby-refresh').click();
    await pp.waitForTimeout(1500);
    const phoneState = await pp.evaluate(() => ({ notice: Boolean(document.querySelector('.nearby-notice')), badge: document.querySelector('#notification-badge')?.hidden ? 0 : Number(document.querySelector('#notification-badge')?.textContent || 0), unreadRow: Boolean(document.querySelector('#notification-list .notification-companion.is-unread [data-crossed-view]')) }));
    check(`read on the laptop, so the phone shows it as read: no notice, not unread (${JSON.stringify(phoneState)})`, !phoneState.notice && !phoneState.unreadRow);

    // Never twice: another refresh on the laptop brings no second notice for n-1.
    await lp.evaluate(() => { const s = document.querySelector('#nearby-notice'); s.innerHTML = ''; s.hidden = true; });
    await lp.waitForTimeout(4000);   // past the pulse loop's own timing
    await lp.locator('#nearby-refresh').click();
    await lp.waitForTimeout(1200);
    check('the same notification is never shown twice', !(await lp.evaluate(() => Boolean(document.querySelector('.nearby-notice')))));

    // Dismiss: read and dismissed on the server.
    st.notifications.push(note(2));
    await lp.locator('#nearby-refresh').click();
    await lp.waitForSelector('.nearby-notice', { timeout: 8000 }).catch(() => {});
    await lp.locator('[data-notice-dismiss]').evaluate((b) => b.click());
    await lp.waitForTimeout(500);
    const n2 = st.notifications.find((x) => x.id === 'n-2') || {};
    check('dismiss: dismissed and read on the server', Boolean(n2.dismissed_at && n2.read_at));

    // Settings: web notifications and the sound, independent of location.
    await lp.evaluate(() => document.querySelector('[data-nav="profile"]')?.click());
    await lp.locator('#profile-settings-button').click();
    await lp.locator('[data-profile-setting="notifications"]').click();
    await lp.waitForSelector('#profile-push-toggle');
    const settings = await lp.locator('.notification-settings-dialog').innerText();
    check('Settings: WEB NOTIFICATIONS, NOTIFICATION SOUND, SWIPE SOUNDS, PUSH NOTIFICATION SOUND and SOUND VOLUME (D-138)', ['WEB NOTIFICATIONS', 'NOTIFICATION SOUND', 'SWIPE SOUNDS', 'PUSH NOTIFICATION SOUND', 'SOUND VOLUME'].every((t) => settings.includes(t)));
    await lp.locator('label:has(#profile-sound-toggle)').click();
    check('the sound switch is saved for this device', (await lp.evaluate(() => localStorage.getItem('brivia-notify-sound'))) === 'off');
    await laptop.close();
    await phone.close();
  }

  // D-133: the mobile "Location is off" bug. The Permissions API says 'denied' (stale, as on iPhones) while the browser
  // actually allows location: Nearby must ask the browser itself and show people.
  {
    reset({ nearby: { enabled: true } });
    const ctx = await newContext({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => {
      const query = navigator.permissions?.query?.bind(navigator.permissions);
      if (query) navigator.permissions.query = (d) => (d?.name === 'geolocation' ? Promise.resolve({ state: 'denied', addEventListener() {}, removeEventListener() {} }) : query(d));
    });
    const page = await stub.open(ctx, { path: '/app.html?view=nearby', errors });
    await page.waitForSelector('.nearby-card.is-current', { timeout: 10000 }).catch(() => {});
    check('a stale "denied" from the Permissions API no longer blocks Nearby: the browser is asked and people show', await page.locator('.nearby-card.is-current').count() === 1 && (st.nearby.pulses || []).length >= 1);
    await ctx.close();
  }

  // Location truly blocked (iPhone): the permission state with iPhone steps; allowing it and tapping Try again asks the
  // browser afresh and shows people.
  {
    reset({ nearby: { enabled: true } });
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const ctx = await newContext({ width: 390, height: 844 }, { isMobile: true, hasTouch: true, userAgent: IPHONE }, { allow: false });
    const page = await stub.open(ctx, { path: '/app.html?view=nearby', errors });
    await page.waitForFunction(() => /Location permission needed/.test(document.querySelector('#nearby-deck')?.innerText || ''), null, { timeout: 12000 }).catch(() => {});
    const text = await page.locator('#nearby-deck').innerText();
    check(`blocked on an iPhone: "Location permission needed" with the iPhone steps (${JSON.stringify(text.slice(0, 160))})`, /Location permission needed/.test(text) && /Safari Websites/.test(text) && /Try again/i.test(text));
    await shot(page, 'nearby-denied-390.png');
    const pulsesBefore = (st.nearby.pulses || []).length;
    await ctx.grantPermissions(['geolocation'], { origin: stub.url });
    // The button's own click (Playwright's scroll-into-view fights the page's smooth scrolling near the tab bar).
    await page.locator('[data-nearby-retry]').evaluate((b) => b.click());
    await page.waitForSelector('.nearby-card.is-current', { timeout: 10000 }).catch(() => {});
    check('allowed, then Try again: a fresh request, a pulse, people show', await page.locator('.nearby-card.is-current').count() === 1 && (st.nearby.pulses || []).length > pulsesBefore);
    await ctx.close();
  }

  // Timeout and no position are their own states; Try again recovers.
  for (const [code, title] of [[3, 'That took too long'], [2, 'Location unavailable']]) {
    reset({ nearby: { enabled: true } });
    const ctx = await newContext({ width: 1440, height: 1000 });
    await ctx.addInitScript((c) => {
      const real = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
      navigator.geolocation.getCurrentPosition = (ok, fail, opts) => (window.__geoFail ?? true ? setTimeout(() => fail({ code: c, message: 'stub' }), 20) : real(ok, fail, opts));
    }, code);
    const page = await stub.open(ctx, { path: '/app.html?view=nearby', errors });
    await page.waitForFunction((t) => (document.querySelector('#nearby-deck')?.innerText || '').includes(t), title, { timeout: 12000 }).catch(() => {});
    check(`code ${code}: "${title}" with Try again`, (await page.locator('#nearby-deck').innerText()).includes(title) && await page.locator('[data-nearby-retry]').count() === 1);
    if (code === 3) await shot(page, 'nearby-timeout-1440.png');
    await page.evaluate(() => { window.__geoFail = false; });
    await page.locator('[data-nearby-retry]').evaluate((b) => b.click());
    await page.waitForSelector('.nearby-card.is-current', { timeout: 10000 }).catch(() => {});
    check(`code ${code}: Try again asks again and recovers`, await page.locator('.nearby-card.is-current').count() === 1);
    await ctx.close();
  }

  // Before 0029, and the Settings copy.
  {
    reset({ nearby: { enabled: true, pulses: [{}] } });
    st.nearbyPeople = null;
    const ctx = await newContext({ width: 1440, height: 1000 });
    const page = await stub.open(ctx, { path: '/app.html?view=nearby', errors });
    await page.waitForFunction(() => /Nearby opens soon/.test(document.querySelector('#nearby-deck')?.innerText || ''));
    check('before 0029 Nearby says it opens soon', true);
    await page.evaluate(() => document.querySelector('[data-nav="profile"]')?.click());
    await page.locator('#profile-settings-button').click();
    await page.locator('[data-profile-setting="notifications"]').click();
    await page.waitForSelector('[data-nearby-setting]:not([hidden])');
    const setting = await page.locator('[data-nearby-setting]').innerText();
    check(`Settings: "Discover when other Brivia members are nearby. Only members who enable this feature can discover you." (${JSON.stringify(setting)})`,
      /Discover when other Brivia members are nearby\. Only members who enable this feature can discover you\./.test(setting));
    await ctx.close();
  }
  const serious = errors.filter((e) => !/Failed to load|PGRST202|404|400/.test(e));
  check(`no uncaught page errors (${JSON.stringify(serious.slice(0, 3))})`, serious.length === 0);
} catch (error) {
  check('harness', false, error?.stack || error);
} finally {
  await browser.close();
  await stub.close();
}
console.log(`${failed ? 'FAILED' : 'OK'}: ${failed} failed`);
process.exit(failed ? 1 : 0);
