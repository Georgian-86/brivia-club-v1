// Find a Companion (D-123, migration 0023): "Connect / Companions" at 1440 and 390. Cards for one event (the picker),
// their content (LOOKING FOR A COMPANION, photo, name, a band line only, headline, chips, "Going to <event>" with date
// and venue), Pass and Connect by button, drag and keyboard, a like that does not match (no chat), a like that does
// ("Looks like you're going together!", Start conversation opens Chat with "GOING TOGETHER · <EVENT>"), the profile on
// tap, the notification for the member who liked first, Explore's Find my companion landing here, and before 0023.
// PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/companions.spec.mjs   (Vite on :5188)
// COMPANION_SHOTS=<dir> saves the page, the match moment and the chat at both widths.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { axeViolations, textAudit, TYPE_FAMILIES } from './a11y.mjs';
import { startAppStub, PHOTO } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.COMPANION_SHOTS || '';
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const day = (n, h) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(h - 5, 30, 0, 0); return d.toISOString(); };
const id = (n) => `cccccccc-cccc-4ccc-8ccc-0000000000${String(n).padStart(2, '0')}`;
const person = (n, name, extra = {}) => ({ member_id: id(n), name, photo_url: PHOTO(id(n)), cover_url: null, headline: 'Product & AI', looking_for: ['Friends'],
  interests: ['Chess', 'Tech', 'Music'], shared_interests: ['Chess'], distance_band: '~3 km', shared_count: 1, ...extra });
const EVENTS = () => [
  { event_id: 'e-chess', title: 'Blitz Chess Meetup', starts_at: day(2, 10), ends_at: day(2, 13), venue_name: 'Battle Chess Skool', venue_area: 'Whitefield, Bengaluru' },
  { event_id: 'e-jam', title: 'Acoustic Jam Session', starts_at: day(3, 18), ends_at: day(3, 21), venue_name: 'The Whitefield Social', venue_area: 'Whitefield, Bengaluru' },
];
const DECKS = () => ({
  'e-chess': [person(1, 'Vishesh', { headline: 'Web developer' }), person(2, 'Aanya', { headline: 'SDE Intern @ Swiggy' }), person(3, 'Raghav'), person(4, 'Meera')],
  'e-jam': [person(5, 'Ira', { interests: ['Music'], shared_interests: ['Music'] })],
});
const st = { events: [], companionEvents: EVENTS(), companionDecks: DECKS(), likedMe: [id(2)], companionMatches: [] };
const stub = await startAppStub({ port: 5188, state: st });
const browser = await chromium.launch();
const errors = [];
const shot = async (page, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); };
const swipes = () => st.swipes || [];

try {
  for (const [w, h] of [[1440, 1000], [390, 844]]) {
    Object.assign(st, { companionEvents: EVENTS(), companionDecks: DECKS(), likedMe: [id(2)], companionMatches: [], swipes: [], matchIds: [], connectRequests: [] });
    st.calls.length = 0;
    const phone = w < 780;
    const ctx = await stub.newContext(browser, { width: w, height: h }, phone ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: '/app.html?view=companions&event=e-chess', errors });
    page.setDefaultTimeout(8000);
    await page.waitForSelector('.companion-card.is-current');
    await page.waitForTimeout(300);

    const head = await page.locator('.companions-head').innerText();
    check(`${w}: heading, note, picker and count (${JSON.stringify(head)})`, /CONNECT \/ COMPANIONS/.test(head) && /Find your\s*event companion\./.test(head) && /going solo to the same event/.test(head) && /4 looking for a companion/.test(head) && await page.locator('#companion-count .companion-face').count() === 3);
    check(`${w}: the picker lists the member's events, this one selected`, await page.locator('#companion-event').inputValue() === 'e-chess' && (await page.locator('#companion-event option').count()) === 2);
    check(`${w}: Connect is the current nav item (no new tab)`, await page.evaluate(() => [...document.querySelectorAll('[data-nav-host] [aria-current="page"]')].every((a) => a.dataset.nav === 'explore')) && (await page.locator('[data-nav-host="header"] [data-nav]').count()) === 5);
    const shown = await page.locator('.companion-card').evaluateAll((cards) => cards.filter((c) => getComputedStyle(c).display !== 'none').length);
    check(`${w}: ${phone ? 'one card' : 'three cards'} at a time (${shown})`, shown === (phone ? 1 : 3));
    const card = await page.locator('.companion-card.is-current').innerText();
    check(`${w}: the card: badge, name, band, headline, chips, Going to <event> with date and venue (${JSON.stringify(card)})`,
      /LOOKING FOR A COMPANION/.test(card) && /Vishesh/.test(card) && /~3 km away/.test(card) && /Web developer · Looking for Friends/.test(card)
      && /Chess/.test(card) && /GOING TO BLITZ CHESS MEETUP/.test(card) && /Battle Chess Skool/i.test(card) && /Swipe right to connect/.test(card));
    check(`${w}: a shared interest is marked`, await page.locator('.companion-card.is-current .companion-chips li.is-shared').count() === 1);
    check(`${w}: the event row carries the date and venue for screen readers and on hover`, /Wed \d{1,2} Nov|[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}/.test(await page.locator('.companion-card.is-current .companion-event').getAttribute('title') || ''));
    check(`${w}: no sideways scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const audit = await textAudit(page, { root: '.companions-view', families: TYPE_FAMILIES });
    check(`${w}: text >= 12 px in the club's two families`, audit.small.length === 0 && audit.family.length === 0, JSON.stringify([audit.small.slice(0, 3), audit.family.slice(0, 3)]));
    const axe = await axeViolations(page, { include: '.companions-view' });
    check(`${w}: axe on the companions page`, axe.length === 0, JSON.stringify(axe));
    await shot(page, `companions-${w}.png`);

    // Tap the photo: the full profile.
    await page.locator('.companion-card.is-current .companion-card-profile').click();
    await page.waitForSelector('#public-profile-modal');
    check(`${w}: tapping the photo opens the full profile`, /Vishesh/.test(await page.locator('#public-profile-modal').innerText()));
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.querySelector('#public-profile-modal')?.remove());

    // Pass by button.
    await page.locator('#companion-pass').click();
    await page.waitForFunction(() => /Aanya/.test(document.querySelector('.companion-card.is-current')?.innerText || ''));
    check(`${w}: Pass sends one pass for this event and shows the next person`, swipes().length === 1 && swipes()[0].p_like === false && swipes()[0].p_event === 'e-chess' && swipes()[0].p_target === id(1));
    check(`${w}: the count moves to 3`, /^3 looking for a companion/.test((await page.locator('#companion-count').innerText()).trim()));

    // Connect opens "Make the first move." (D-124); Cancel sends nothing and keeps the card.
    await page.locator('#companion-like').click();
    await page.waitForSelector('#connect-composer-dialog[open]');
    const composer = await page.locator('#connect-composer-dialog').innerText();
    check(`${w}: Connect opens the composer with a title, a prompt, suggestions and a counter (${JSON.stringify(composer.slice(0, 160))})`,
      /CONNECT WITH AANYA/.test(composer) && /Make the\s*first move\./.test(composer) && /Introduce yourself and tell them why you'd like to connect\./.test(composer)
      && await page.locator('#connect-composer-dialog .composer-suggestion').count() === 0 && await page.locator('#connect-composer-dialog [data-composer-another]').isVisible()
      && /^Hi Aanya! I'm going to Blitz Chess Meetup too/.test(await page.locator('#composer-message').inputValue()));
    check(`${w}: focus is in the message box`, await page.evaluate(() => document.activeElement?.id === 'composer-message'));
    const axeComposer = await axeViolations(page, { include: '#connect-composer-dialog' });
    check(`${w}: axe on the composer`, axeComposer.length === 0, JSON.stringify(axeComposer));
    await shot(page, `composer-${w}.png`);
    await page.locator('#connect-composer-dialog [data-composer-cancel]').last().click();
    await page.waitForFunction(() => !document.querySelector('#connect-composer-dialog').open);
    check(`${w}: Cancel sends nothing and Aanya stays`, (st.connectRequests || []).length === 0 && swipes().length === 1 && /Aanya/.test(await page.locator('.companion-card.is-current').innerText()));
    // A suggestion fills the box; the counter follows; Send request sends the request with the message, then the like.
    await page.locator('#companion-like').click();
    await page.waitForSelector('#connect-composer-dialog[open]');
    // D-154: one opener is already written; "Another idea" swaps it for the next, round the list.
    await page.locator('#connect-composer-dialog [data-composer-another]').click();
    const swapped = await page.locator('#composer-message').inputValue();
    check(`${w}: Another idea swaps the opener (${JSON.stringify(swapped)})`, /we both love chess/.test(swapped));
    await page.locator('#connect-composer-dialog [data-composer-another]').click();
    await page.locator('#connect-composer-dialog [data-composer-another]').click();
    const filled = await page.locator('#composer-message').inputValue();
    check(`${w}: a suggestion fills the message (${JSON.stringify(filled)})`, /^Hi Aanya! I'm going to Blitz Chess Meetup too/.test(filled) && new RegExp(`^${filled.length} / 500$`).test(await page.locator('#composer-count').innerText()));
    await page.locator('#connect-composer-dialog .composer-send').click();
    await page.waitForSelector('#companion-match-dialog[open]');
    const req = (st.connectRequests || []).at(-1) || {};
    check(`${w}: Send request carries the exact message, then the like for this event (${JSON.stringify(req)})`, req.p_to === id(2) && req.p_note === filled && swipes().at(-1).p_like === true && swipes().at(-1).p_target === id(2));
    const moment = await page.locator('#companion-match-dialog').innerText();
    check(`${w}: a mutual like shows "Looks like you're going together!" with the event (${JSON.stringify(moment)})`,
      /Looks like you're going\s*together!/.test(moment) && /You and Aanya both want to experience Blitz Chess Meetup together/.test(moment) && /Battle Chess Skool/.test(moment));
    check(`${w}: focus is on Start conversation`, await page.evaluate(() => document.activeElement?.hasAttribute('data-match-chat')));
    const axeMoment = await axeViolations(page, { include: '#companion-match-dialog' });
    check(`${w}: axe on the match moment`, axeMoment.length === 0, JSON.stringify(axeMoment));
    await shot(page, `match-${w}.png`);
    await page.locator('[data-match-later]').click();

    // Raghav has not liked me: a like is quiet (no match, no chat).
    const raghav = page.locator('.companion-card.is-current');
    await raghav.waitFor();
    check(`${w}: next is Raghav`, /Raghav/.test(await raghav.innerText()));
    const sendNote = async () => {
      await page.waitForSelector('#connect-composer-dialog[open]');
      await page.fill('#composer-message', 'Hey Raghav, up for a game before it starts?');
      await page.locator('#connect-composer-dialog .composer-send').click();
    };
    if (!phone) {
      const box = await raghav.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 12; i += 1) await page.mouse.move(box.x + box.width / 2 + i * 25, box.y + box.height / 2 + i);
      await page.mouse.up();
      await sendNote();
    } else {
      await page.locator('.companion-deck').focus();
      await page.keyboard.press('ArrowRight');
      await sendNote();
    }
    await page.waitForFunction(() => /Meera/.test(document.querySelector('.companion-card.is-current')?.innerText || ''));
    const like = swipes().at(-1);
    check(`${w}: ${phone ? '→' : 'a drag right'} likes Raghav (${JSON.stringify(like)})`, like.p_target === id(3) && like.p_like === true);
    check(`${w}: one like alone opens nothing (the request waits for Raghav)`, !(await page.locator('#companion-match-dialog').evaluate((d) => d.open)) && !st.matchIds.includes(id(3)) && st.connectRequests.at(-1).p_to === id(3));

    // ← passes; then the event is done and offers the other event.
    await page.locator('.companion-deck').focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForSelector('.companion-empty');
    check(`${w}: ← passes Meera, and the empty state offers the other event`, swipes().at(-1).p_like === false && /No one new for now/.test(await page.locator('.companion-empty').innerText()) && await page.locator('[data-companion-switch="e-jam"]').count() === 1);
    await page.locator('[data-companion-switch="e-jam"]').click();
    await page.waitForFunction(() => /Ira/.test(document.querySelector('.companion-card.is-current')?.innerText || ''));
    check(`${w}: another event has its own people`, /GOING TO ACOUSTIC JAM SESSION/.test(await page.locator('.companion-card.is-current').innerText()));

    // Start conversation from the match: Chat with the event in the header.
    await page.evaluate(() => window.scrollTo(0, 0));
    st.companionMatches = [{ match_id: 'cm-x', event_id: 'e-chess', event_title: 'Blitz Chess Meetup', starts_at: EVENTS()[0].starts_at, venue_name: 'Battle Chess Skool', other_id: id(2), other_name: 'Aanya', other_photo_url: PHOTO(id(2)), created_at: new Date().toISOString(), seen: false }];
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('app-auth-pending'));
    await page.waitForSelector('[data-companion-match="cm-x"]', { state: 'attached' });
    check(`${w}: the member who liked first is notified (badge and panel row)`, /\d/.test(await page.locator('#notification-badge').innerText()));
    await page.locator('#app-notification-button').click();
    await page.waitForSelector('[data-companion-match="cm-x"]', { state: 'visible' });
    check(`${w}: the row reads "You and Aanya are going together"`, /You and Aanya are going together/.test(await page.locator('.notification-companion').innerText()));
    await page.locator('[data-companion-match="cm-x"]').click();
    await page.waitForSelector('#companion-match-dialog[open]');
    await page.locator('[data-match-chat]').click();
    await page.waitForSelector('#chat-window:not([hidden])');
    await page.waitForFunction(() => /GOING TOGETHER/.test(document.querySelector('#chat-status')?.textContent || ''));
    const status = await page.locator('#chat-status').innerText();
    check(`${w}: Start conversation opens Chat with "GOING TOGETHER · BLITZ CHESS MEETUP · <date>" (${status})`, /GOING TOGETHER · BLITZ CHESS MEETUP · [A-Z]{3} \d{1,2} [A-Z]{3}/.test(status) && /Aanya/.test(await page.locator('#chat-name').innerText()));
    await shot(page, `chat-${w}.png`);
    await ctx.close();
  }

  // Before 0023: a calm message.
  {
    st.companionEvents = null;
    const ctx = await stub.newContext(browser, { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    const page = await stub.open(ctx, { path: '/app.html?view=companions', errors });
    await page.waitForSelector('.companion-empty');
    check('before 0023: "Companions open soon" with a way to Explore', /Companions open soon/.test(await page.locator('.companion-empty').innerText()) && await page.locator('[data-companion-explore]').count() === 1);
    await ctx.close();
  }
  // Not looking anywhere yet.
  {
    st.companionEvents = [];
    const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
    const page = await stub.open(ctx, { path: '/app.html?view=companions', errors });
    await page.waitForSelector('.companion-empty');
    check('not looking yet: says how to start, with Find an event', /Not looking for company yet/.test(await page.locator('.companion-empty').innerText()) && await page.locator('[data-companion-explore]').count() === 1);
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
