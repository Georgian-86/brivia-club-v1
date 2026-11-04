// D-168: every motion moment fires (D-164 deal-in, D-165 N1-N10, D-174 mutual), watched frame by frame in a real browser
// against the stubbed Supabase. Run: PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/motion.spec.mjs
import { startAppStub, defaultDeckRows, PHOTO, ME } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [ASHA, BILAL] = defaultDeckRows.map((r) => r.id);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };
const day = (n, h) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
const ev = (i, title) => ({ id: `ev-${i}`, title, description: `${title}.`, category: 'tech', tags: ['Tech'], venue_name: 'Hall', venue_area: 'Kochi',
  starts_at: day(i + 1, 10), ends_at: day(i + 1, 12), image_key: '', distance_km: 2, going_count: 3, companion_count: 1, going: false, wants_companion: false, friends: [] });
const nid = (n) => `dddddddd-dddd-4ddd-8ddd-0000000000${String(n).padStart(2, '0')}`;
const nearbyPerson = (n, name) => ({ member_id: nid(n), name, photo_url: PHOTO(nid(n)), cover_url: null, headline: 'Designer', bio: 'Hi', looking_for: ['Friends'], skills: [], interests: ['Chess'], shared_interests: ['Chess'], shared_count: 1, distance_band: '1', place_name: 'Kochi', here_now: true, asked_me: false });
const st = { matchIds: [ASHA], events: Array.from({ length: 10 }, (_, i) => ev(i, `Event ${i + 1}`)), nearby: { enabled: true, pulses: [{}] }, nearbyPeople: [nearbyPerson(1, 'Yashika')],
  routes: { 'rpc/nearby_discover': { delayMs: 2500, body: [nearbyPerson(1, 'Yashika')] } } };
const stub = await startAppStub({ port: 5191, state: st });
const browser = await chromium.launch();
const recorder = () => {
  window.__seen = {};
  const mark = (k, v = true) => { if (!window.__seen[k]) window.__seen[k] = v; };
  const pills = new Set();
  const tick = () => {
    const q = (s) => document.querySelector(s);
    if (q('#swipe-stack.is-intro')) mark('intro');
    if (q('.deck-intro-gloss')) mark('gloss');
    if (q('.chip-shared.is-shimmer')) mark('shimmer');
    const card = q('#swipe-card'); if (card && card.style.rotate && card.style.rotate !== 'none' && card.style.rotate !== '0deg') mark('tilt', card.style.rotate);
    if (q('.swipe-card.is-tilting')) mark('tiltLight');
    document.querySelectorAll('.connect-mode-pill').forEach((pill, i) => { if (!pill.offsetWidth) return; pills.add(i + ':' + getComputedStyle(pill).transform); if (pills.size > 3) mark('pillSlid'); mark('pill'); });
    if (q('.nearby-row .companion-card.is-skeleton, .companion-card.is-skeleton')) mark('radar');
    if (q('.pitch-letter')) mark('letter');
    const empty = q('#home-empty-state'); if (empty && !empty.hidden && /matrix3d|rotateY|rotate3d/.test(empty.style.transform || '')) mark('flip', empty.style.transform.slice(0, 40));
    if (q('dialog.mutual-moment[open]')) mark('mutual');
    if (q('.message.is-arriving')) mark('bubble');
    const evc = [...document.querySelectorAll('.event-card')].find((c) => c.style.opacity && Number(c.style.opacity) < 1); if (evc) mark('reveal');
    const icon = [...document.querySelectorAll('[data-nav-host] [data-nav="chat"], [data-nav-host] [data-nav="chat"] .app-nav-icon')].find((el) => /matrix|scale/.test(el.style.transform || '')); if (icon) mark('chatPop');
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const seen = (page) => page.evaluate(() => window.__seen);
try {
  // Desktop: deal-in, shimmer, tilt, pill, radar, letter, caught-up flip.
  {
    const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
    await ctx.addInitScript(recorder);
    const page = await stub.open(ctx, { path: '/app.html' });
    await page.waitForSelector('#swipe-card'); await page.waitForTimeout(800);
    await page.waitForFunction(() => !document.querySelector('#swipe-stack.is-intro'), null, { timeout: 8000 }); await page.waitForTimeout(300);
    let s = await seen(page);
    check('1 deck deal-in plays on load', !!s.intro && !!s.gloss);
    check('2 "You both" chips shimmer', !!s.shimmer);
    const box = await page.locator('#swipe-card').boundingBox();
    for (let i = 0; i <= 10; i++) { await page.mouse.move(box.x + box.width * (0.2 + i * 0.06), box.y + box.height * 0.3); await page.waitForTimeout(40); }
    await page.waitForTimeout(400);
    s = await seen(page);
    check('3 desktop card tilt follows the mouse', !!s.tilt && !!s.tiltLight, `rotate=${s.tilt}`);
    await page.mouse.move(5, 5);
    // Pitch (sent) -> letter to Chat + Chat tab pop.
    await page.locator('[data-action="like"]').dispatchEvent('click');
    await page.waitForSelector('#pitch-modal:not([hidden]) .pitch-no-note');
    await page.waitForTimeout(450); await page.locator('#pitch-modal .pitch-no-note').click();
    await page.waitForTimeout(1300);
    s = await seen(page);
    check('4 pitch letter flies to the Chat tab, and the tab pops', !!s.letter && !!s.chatPop);
    // Pass the last card -> caught-up flip.
    await page.waitForTimeout(600);
    for (let i = 0; i < 4 && await page.locator('#swipe-card:visible').count(); i++) { await page.locator('[data-action="pass"]').dispatchEvent('click').catch(() => {}); await page.waitForTimeout(800); }
    await page.waitForTimeout(400);
    s = await seen(page);
    check('5 "You\'re caught up" flips in after the last card', !!s.flip, `${s.flip || ''}`);
    // Pill slide + radar.
    await page.locator('.app-view[data-view="home"] [data-connect-mode="nearby"]').click();
    await page.waitForTimeout(1200);
    s = await seen(page);
    check('6 Curated / Nearby pill slides', !!s.pill && !!s.pillSlid);
    check('7 Nearby radar sweep while loading', !!s.radar);
    await ctx.close();
  }
  // Mutual (my swipe completes a match).
  {
    Object.assign(st, { matchAll: true, matchIds: [], signalled: new Set(), passed: new Set() });
    const ctx = await stub.newContext(browser, { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    await ctx.addInitScript(recorder);
    const page = await stub.open(ctx, { path: '/app.html' });
    await page.waitForSelector('#swipe-card'); await page.waitForTimeout(2200);
    await page.locator('[data-action="like"]').dispatchEvent('click');
    await page.waitForSelector('#pitch-modal:not([hidden]) .pitch-no-note', { timeout: 3000 }).then(async () => { await page.waitForTimeout(450); await page.locator('#pitch-modal .pitch-no-note').click(); }).catch(() => {});
    await page.waitForTimeout(1500);
    const s = await seen(page);
    check('8 "It\'s mutual" when the match completes', !!s.mutual);
    await ctx.close();
    st.matchAll = false;
  }
  // Chat bubble + events reveal.
  {
    Object.assign(st, { matchIds: [ASHA], signalled: new Set(), passed: new Set() });
    st.messages = [{ id: 'm1', sender_id: ASHA, recipient_id: ME, body: 'Shall we play on Saturday?', created_at: new Date(Date.now() - 6e5).toISOString() }];
    const ctx = await stub.newContext(browser, { width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    await ctx.addInitScript(recorder);
    const page = await stub.open(ctx, { path: '/app.html?view=chat' });
    await page.waitForSelector('#chat-list [data-chat-id]'); await page.locator('#chat-list [data-chat-id]').first().click();
    await page.waitForTimeout(1200);
    const before = (await seen(page)).bubble;
    st.messages.push({ id: 'm2', sender_id: ASHA, recipient_id: ME, body: 'See you at 7?', created_at: new Date().toISOString() });
    await page.waitForTimeout(7000);
    const s = await seen(page);
    check('9 a new chat message rises in (old ones do not replay)', !before && !!s.bubble);
    await page.goto(`${stub.url}/app.html?view=events`);
    await page.waitForSelector('.event-card:not(.event-card-skeleton)'); await page.waitForTimeout(300);
    await page.mouse.wheel(0, 900); await page.waitForTimeout(600);
    const s2 = await seen(page);
    check('10 event cards fade up as they scroll in', !!s2.reveal);
    await ctx.close();
  }
} finally { await browser.close(); await stub.close(); }
const failedCount = results.filter((r) => !r.ok).length;
console.log(failedCount ? `${failedCount} failed` : 'ALL PASSED');
process.exit(failedCount ? 1 : 0);
