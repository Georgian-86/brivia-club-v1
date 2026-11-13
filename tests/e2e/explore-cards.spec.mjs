// Polish wave C3: the Explore view's post cards (wine header bar, 5:4 media, wine action bar: like, comment, share,
// save), against stubbed Supabase. Never touches a real Supabase project. Playwright and axe-core are NOT repo
// dependencies; see tests/e2e/README.md.
//
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node tests/e2e/explore-cards.spec.mjs
//
// Asserts:
// E1 columns: 1 at 375 and 390, 2 at 768, 4 at 1280, 1440 and 1920 (distinct card offsetLeft values); smaller cards
//    since D-092: at most 340 px wide on a phone and 300 px from 1280.
// E2 every card's media box is 5:4 (width / height 1.25 ± 0.01; founder 2026-10-22 "a bit too long"), the whole card is
//    close to square (height / width 1.1 to 1.35) from 768 px, and every card in a row has the same height.
// E3 the header and action bars are --brivia-wine; their text is >= 4.5:1 against it (computed, not axe); every action
//    is >= 44 x 44 px.
// E4 a double tap on Like sends one POST and leaves aria-pressed="true"; a 403 rolls back with the toast "That didn't
//    save. Please try again." and reloads the reactions; a 42501 (RLS refused: the post is gone or no longer visible)
//    rolls back and reloads with NO toast.
// E5 Save persists across a reload (the stub returns the saved row).
// E6 Share opens the share sheet (D-101); its "More options" calls navigator.share with { title, url } only (no caption, no name); without it the clipboard gets the URL
//    and the toast reads "Link copied."
// E7 card-shaped skeletons while community_posts is delayed 1 s, aria-busy cleared after; axe clean (posts view and the
//    detail sheet, 375 and 1440); no sideways scroll at 320.
// Also: Comment opens the post detail (image, caption, author, date) whose one action is "Reply in chat" (matched:
// opens the chat with the composer prefilled `Re: “<caption, first 60 chars>” `) or "View profile" (not matched);
// ?post=<id> opens the detail once posts load, and /explore.html?post=<id> forwards there; when 0012 is absent
// (relation does not exist) Like and Save are hidden; "New post" is a wide wine button that opens the composer.
// EXPLORE_SHOTS=<dir> only saves screenshots (loaded at 320, 375, 390, 768, 1280x800, 1440x900, 1920x1080; the skeleton;
// liked and saved; the detail sheet), then exits.
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { axeViolations, textAudit } from './a11y.mjs';
import { startAppStub, ORIGIN, ME } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const PORT = Number(process.env.E2E_PORT || 5189);
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.EXPLORE_SHOTS || '';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const B = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const VIEWPORTS = {
  320: { width: 320, height: 720 }, 375: { width: 375, height: 812 }, 390: { width: 390, height: 844 }, 768: { width: 768, height: 1024 },
  1280: { width: 1280, height: 800 }, 1440: { width: 1440, height: 900 }, 1920: { width: 1920, height: 1080 },
};
const PHONE = { isMobile: true, hasTouch: true };
const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
const preset = (file) => `/Images/Cover%20images/${file}`;
const LONG = 'Sunday morning rally at the club courts, then filter coffee and a long argument about racket tension. Who is in next week?';
const POSTS = [
  { id: 'post-1', author_id: A, image_url: preset('94978B9F-A399-43FC-AC48-0A41088B5D27.PNG'), image_path: '', caption: LONG, created_at: ago(1) },
  { id: 'post-2', author_id: B, image_url: preset('2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG'), image_path: '', caption: 'First chess club night. Bring a board.', created_at: ago(3) },
  { id: 'post-3', author_id: A, image_url: `${ORIGIN}/storage/v1/object/public/community-posts/${A}/court.jpg`, image_path: `${A}/court.jpg`, caption: 'Court booked.', created_at: ago(5) },
  { id: 'post-4', author_id: ME, image_url: preset('3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG'), image_path: '', caption: 'Poetry at the bookshop on Thursday, anyone?', created_at: ago(8) },
  { id: 'post-5', author_id: B, image_url: 'https://tracker.example/p.jpg', image_path: '', caption: 'A post whose image is not ours shows the placeholder.', created_at: ago(20) },
  { id: 'post-6', author_id: A, image_url: preset('3453059c-4864-46f7-ae45-6f7049939b9f.png'), image_path: '', caption: 'Weekend walk by the backwaters.', created_at: ago(30) },
];
const AUTHORS = [
  { id: A, name: 'Asha Band', photo_url: `${ORIGIN}/storage/v1/object/public/profile-photos/${A}/p.jpg`, cover_url: null, experience: 'Product designer', skills: ['Badminton'], looking_for: ['Friends'] },
  { id: B, name: 'Bilal Place', photo_url: null, cover_url: null, experience: 'Engineer', skills: ['Chess'], looking_for: ['Mentor'] },
];
const TOAST_FAIL = "That didn't save. Please try again.";

const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };

// A scenario that throws (a missing element, a timeout) is one FAIL, and the run goes on.
const scenario = async (name, fn) => { try { await fn(); } catch (error) { results.push(['FAIL', `${name}: ${String(error.message).split('\n')[0]}`]); } };
const baseRoutes = () => ({ 'rpc/get_candidates': { body: AUTHORS } });
const st = { matchIds: [], posts: POSTS, routes: baseRoutes() };
const stub = await startAppStub({ port: PORT, state: st });
const pageErrors = [];
let browser;
const posts = (method, table) => st.calls.filter((c) => c.method === method && c.path === `/rest/v1/${table}`);
try {
  browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });
  const open = async (width, { pagePath = '/app.html?view=posts', extra = {}, init, wait = true } = {}) => {
    const viewport = VIEWPORTS[width];
    const context = await stub.newContext(browser, viewport, { reducedMotion: 'reduce', ...(width <= 780 ? PHONE : {}), ...extra });
    if (init) await context.addInitScript(init);
    const page = await stub.open(context, { path: pagePath, errors: pageErrors });
    page.setDefaultTimeout(5000);
    if (wait) {
      await page.waitForFunction((n) => document.querySelectorAll('#community-post-list .post-card').length >= n, POSTS.length, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
    return { context, page };
  };
  // Records every toast text (the #app-toast element is reused, so a MutationObserver sees each message).
  const watchToasts = (page) => page.evaluate(() => {
    window.__toasts = [];
    const toast = document.querySelector('#app-toast');
    new MutationObserver(() => { if (toast.textContent) window.__toasts.push(toast.textContent); }).observe(toast, { childList: true, characterData: true, subtree: true });
  });
  const toasts = (page) => page.evaluate(() => window.__toasts || []);
  const pressed = (page, id, kind) => page.evaluate(([id, kind]) => {
    const button = document.querySelector(`.post-card[data-post-id="${id}"] [data-post-action="${kind}"]`);
    return button ? { pressed: button.getAttribute('aria-pressed'), label: button.querySelector('.post-card-label')?.textContent.trim() } : null;
  }, [id, kind]);

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    st.matchIds = [A];
    for (const width of [320, 375, 390, 768, 1280, 1440, 1920]) {
      const { context, page } = await open(width);
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SHOTS, `explore-${width}.png`) });
      await page.screenshot({ path: path.join(SHOTS, `explore-${width}-full.png`), fullPage: true });
      await context.close();
    }
    st.routes = { ...baseRoutes(), 'GET community_posts': { delayMs: 8000 } };
    for (const width of [375, 1440]) {
      const { context, page } = await open(width, { wait: false });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(SHOTS, `explore-skeleton-${width}.png`) });
      await context.close();
    }
    st.routes = { ...baseRoutes(), 'GET community_post_likes': { body: [{ post_id: 'post-1' }, { post_id: 'post-2' }] }, 'GET community_post_saves': { body: [{ post_id: 'post-1' }, { post_id: 'post-3' }] } };
    for (const width of [375, 1440]) {
      const { context, page } = await open(width);
      await page.locator('.post-card[data-post-id="post-2"] [data-post-action="share"]').hover().catch(() => {});
      await page.screenshot({ path: path.join(SHOTS, `explore-liked-saved-${width}.png`) });
      await page.locator('.post-card[data-post-id="post-1"] [data-post-action="like"]').focus();
      await page.keyboard.press('Tab');
      await page.screenshot({ path: path.join(SHOTS, `explore-focus-${width}.png`) });
      await context.close();
    }
    st.routes = baseRoutes();
    for (const width of [375, 768, 1440]) {
      for (const [tag, id] of [['matched', 'post-1'], ['unmatched', 'post-2']]) {
        const { context, page } = await open(width);
        await page.locator(`.post-card[data-post-id="${id}"] [data-post-action="comment"]`).click();
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(SHOTS, `explore-detail-${tag}-${width}.png`) });
        await context.close();
      }
    }
    {
      const { context, page } = await open(375);
      await page.locator('.post-card[data-post-id="post-1"] [data-post-action="comment"]').click();
      await page.waitForTimeout(600);
      await page.locator('[data-post-detail-action]').click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(SHOTS, 'explore-reply-chat-375.png') });
      await context.close();
    }
    console.log(`Screenshots saved to ${SHOTS}`);
  } else {
    // E1 + E2 + E3: columns, 5:4 media, equal heights per row, wine bars and their contrast, 44 px targets.
    for (const width of [375, 390, 768, 1280, 1440, 1920]) await scenario(`E1-E3 at ${width}`, async () => {
      const { context, page } = await open(width);
      const m = await page.evaluate(() => {
        // rgb()/rgba() are 0-255; color(srgb r g b / a) (what color-mix computes to) is 0-1.
        const parse = (c) => {
          const n = (c.match(/[\d.]+/g) || []).map(Number);
          if (!c.startsWith('color(srgb')) return n;
          return [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1];
        };
        const lum = ([r, g, b]) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        // Text colour over its bar: alpha-blend the text over the bar, then the WCAG ratio.
        const ratio = (fg, bg) => {
          const [r, g, b, a = 1] = parse(fg); const back = parse(bg).slice(0, 3);
          const blended = [r, g, b].map((v, i) => v * a + back[i] * (1 - a));
          const [l1, l2] = [lum(blended), lum(back)].sort((x, y) => y - x);
          return (l1 + 0.05) / (l2 + 0.05);
        };
        const probe = document.createElement('div'); probe.style.background = 'var(--brivia-wine)'; document.body.append(probe);
        const wine = getComputedStyle(probe).backgroundColor; probe.remove();
        const cards = [...document.querySelectorAll('#community-post-list .post-card')];
        const rows = {};
        cards.forEach((card) => { const top = Math.round(card.getBoundingClientRect().top + window.scrollY); (rows[top] ||= []).push(Math.round(card.getBoundingClientRect().height)); });
        const textIn = (el) => [...el.querySelectorAll('*')].filter((n) => [...n.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim()) && n.getClientRects().length);
        const contrast = [];
        cards.forEach((card) => {
          for (const bar of [card.querySelector('.post-card-head'), card.querySelector('.post-card-actions')]) {
            const bg = getComputedStyle(bar).backgroundColor;
            textIn(bar).forEach((n) => contrast.push({ text: n.textContent.trim().slice(0, 20), ratio: Number(ratio(getComputedStyle(n).color, bg).toFixed(2)) }));
          }
        });
        const small = [...document.querySelectorAll('#community-post-list .post-card-action, #community-post-list .post-card-author')]
          .map((b) => b.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).map((r) => [Math.round(r.width), Math.round(r.height)]);
        return {
          count: cards.length,
          columns: new Set(cards.map((c) => c.offsetLeft)).size,
          ratios: cards.map((c) => { const r = c.querySelector('.post-card-media').getBoundingClientRect(); return Number((r.width / r.height).toFixed(3)); }),
          shapes: cards.map((c) => { const r = c.getBoundingClientRect(); return Number((r.height / r.width).toFixed(3)); }),
          cardWidth: Math.round(cards[0].getBoundingClientRect().width),
          rows: Object.values(rows),
          wine,
          heads: [...new Set(cards.map((c) => getComputedStyle(c.querySelector('.post-card-head')).backgroundColor))],
          bars: [...new Set(cards.map((c) => getComputedStyle(c.querySelector('.post-card-actions')).backgroundColor))],
          minContrast: contrast.reduce((min, c) => (c.ratio < min.ratio ? c : min), { ratio: 99 }),
          small,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      const expected = width <= 390 ? 1 : width === 768 ? 2 : width < 1360 ? 3 : 4; // D-096: more air, 4 columns from 1360 px
      check(`E1 ${width}: ${expected} column(s) (${m.columns}; ${m.count} cards)`, () => { assert.equal(m.count, POSTS.length); assert.equal(m.columns, Math.min(expected, m.count)); });
      check(`E1 ${width}: smaller cards (${m.cardWidth} px wide)`, () => assert.ok(m.cardWidth <= (width <= 390 ? 350 : 310), String(m.cardWidth)));
      check(`E2 ${width}: every media box is 5:4 and cards in a row share a height (${JSON.stringify({ ratios: m.ratios, rows: m.rows })})`, () => {
        m.ratios.forEach((r) => assert.ok(Math.abs(r - 1.25) <= 0.01, String(r)));
        m.rows.forEach((row) => assert.ok(Math.max(...row) - Math.min(...row) <= 1, JSON.stringify(row)));
      });
      check(`E2 ${width}: the whole card reads close to square (height / width ${JSON.stringify([...new Set(m.shapes)])}, ${m.cardWidth} px wide)`, () => {
        // D-107: every card now ends in a 40 px footer, so the bound moved from 1.35 to 1.5 (wide) and 1.4 to 1.5 (phone).
        m.shapes.forEach((r) => assert.ok(width >= 768 ? r >= 1.1 && r <= 1.5 : r <= 1.5, String(r)));
        assert.ok(m.cardWidth <= 440, `card ${m.cardWidth} px wide`);
      });
      check(`E3 ${width}: header and action bars are --brivia-wine, text >= 4.5:1, targets >= 44 px (${JSON.stringify({ wine: m.wine, heads: m.heads, bars: m.bars, min: m.minContrast, small: m.small })})`, () => {
        assert.deepEqual(m.heads, [m.wine]); assert.deepEqual(m.bars, [m.wine]);
        assert.ok(m.minContrast.ratio >= 4.5, JSON.stringify(m.minContrast));
        assert.deepEqual(m.small, []);
      });
      check(`${width}: no horizontal page scroll (${m.overflow})`, () => assert.ok(m.overflow <= 0));
      if (width === 375 || width === 1440) {
        const type = await textAudit(page, { root: '[data-view="posts"]' });
        check(`${width}: Explore text is >= 12 px (${JSON.stringify(type.small)})`, () => assert.deepEqual(type.small, []));
        const axe = await axeViolations(page, { include: '[data-view="posts"]' });
        check(`E7 ${width}: axe finds no violations on Explore (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
        const newPost = await page.evaluate(() => {
          const button = document.querySelector('#open-community-post');
          const list = document.querySelector('#community-post-list').getBoundingClientRect();
          const r = button.getBoundingClientRect();
          return { text: button.textContent.trim(), bg: getComputedStyle(button).backgroundColor, width: Math.round(r.width), listWidth: Math.round(list.width), above: r.bottom <= list.top, height: Math.round(r.height) };
        });
        check(`${width}: "New post" is a wide wine button above the feed (${JSON.stringify(newPost)})`, () => {
          assert.match(newPost.text, /new post/i); assert.equal(newPost.bg, m.wine); assert.equal(newPost.above, true);
          assert.ok(newPost.height >= 44); assert.ok(newPost.width >= Math.min(320, newPost.listWidth) - 1, `${newPost.width} vs ${newPost.listWidth}`);
        });
        await page.locator('#open-community-post').click();
        const composer = await page.evaluate(() => !document.querySelector('#community-post-form').hidden);
        check(`${width}: New post opens the composer`, () => assert.equal(composer, true));
      }
      await context.close();
    });

    // No sideways scroll at 320 (loaded and with the detail sheet open).
    await scenario('scenario 1', async () => {
      const { context, page } = await open(320);
      const loaded = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.locator('.post-card[data-post-id="post-1"] [data-post-action="comment"]').click();
      await page.waitForTimeout(400);
      const sheet = await page.evaluate(() => {
        const d = document.querySelector('#post-detail'); const r = d?.getBoundingClientRect();
        return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, inside: Boolean(r && r.left >= 0 && r.right <= window.innerWidth + 0.5) };
      });
      check(`320: no sideways scroll loaded or with the detail open (${JSON.stringify({ loaded, sheet })})`, () => { assert.ok(loaded <= 0); assert.ok(sheet.page <= 0); assert.equal(sheet.inside, true); });
      await context.close();
    });

    // E4: a double tap on Like sends one POST and stays liked.
    await scenario('scenario 2', async () => {
      st.routes = { ...baseRoutes(), 'POST community_post_likes': { delayMs: 400 } };
      const { context, page } = await open(375);
      const before = posts('POST', 'community_post_likes').length;
      await page.locator('.post-card[data-post-id="post-2"] [data-post-action="like"]').dblclick();
      await page.waitForTimeout(1200);
      const after = posts('POST', 'community_post_likes').length;
      const deletes = posts('DELETE', 'community_post_likes').length;
      const state = await pressed(page, 'post-2', 'like');
      const body = JSON.parse(posts('POST', 'community_post_likes').at(-1)?.body || '{}');
      check(`E4: a double tap on Like sends one POST and leaves it pressed (${JSON.stringify({ sent: after - before, deletes, state, body })})`, () => {
        assert.equal(after - before, 1); assert.equal(deletes, 0);
        assert.deepEqual(state, { pressed: 'true', label: 'Liked' });
        assert.deepEqual(body, { post_id: 'post-2', member_id: ME });
      });
      await context.close();
    });
    await scenario('scenario 3', async () => {
      st.routes = { ...baseRoutes(), 'POST community_post_likes': { status: 403, delayMs: 400 } };
      const { context, page } = await open(375);
      await watchToasts(page);
      const reads = posts('GET', 'community_post_likes').length;
      await page.locator('.post-card[data-post-id="post-3"] [data-post-action="like"]').click();
      const optimistic = await pressed(page, 'post-3', 'like');
      await page.waitForTimeout(1200);
      const state = await pressed(page, 'post-3', 'like');
      const seen = await toasts(page);
      const reloaded = posts('GET', 'community_post_likes').length - reads;
      check(`E4: a 403 rolls back with the toast and reloads the reactions (${JSON.stringify({ optimistic, state, seen, reloaded })})`, () => {
        assert.equal(optimistic.pressed, 'true');
        assert.deepEqual(state, { pressed: 'false', label: 'Like' });
        assert.ok(seen.includes(TOAST_FAIL), JSON.stringify(seen));
        assert.ok(reloaded >= 1);
      });
      await context.close();
    });
    await scenario('scenario 4', async () => {
      // 42501: RLS refused the write (the post is gone or no longer visible): reload, no toast.
      st.routes = { ...baseRoutes(), 'POST community_post_saves': { status: 403, code: '42501', message: 'new row violates row-level security policy for table "community_post_saves"' } };
      const { context, page } = await open(375);
      await watchToasts(page);
      const reads = posts('GET', 'community_post_saves').length;
      await page.locator('.post-card[data-post-id="post-3"] [data-post-action="save"]').click();
      await page.waitForTimeout(1200);
      const state = await pressed(page, 'post-3', 'save');
      const seen = await toasts(page);
      const reloaded = posts('GET', 'community_post_saves').length - reads;
      check(`E4: a 42501 rolls back and reloads with no toast (${JSON.stringify({ state, seen, reloaded })})`, () => {
        assert.deepEqual(state, { pressed: 'false', label: 'Save' });
        assert.deepEqual(seen, []);
        assert.ok(reloaded >= 1);
      });
      await context.close();
    });

    // E5: Save persists across a reload.
    await scenario('scenario 5', async () => {
      st.routes = baseRoutes();
      const { context, page } = await open(375);
      await page.locator('.post-card[data-post-id="post-6"] [data-post-action="save"]').click();
      await page.waitForTimeout(600);
      const body = JSON.parse(posts('POST', 'community_post_saves').at(-1)?.body || '{}');
      const now = await pressed(page, 'post-6', 'save');
      st.routes = { ...baseRoutes(), 'GET community_post_saves': { body: [{ post_id: body.post_id }] } };
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelectorAll('#community-post-list .post-card').length >= 6, null, { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(600);
      const reloaded = await pressed(page, 'post-6', 'save');
      const others = await pressed(page, 'post-1', 'save');
      check(`E5: Save persists across a reload (${JSON.stringify({ body, now, reloaded, others })})`, () => {
        assert.deepEqual(body, { post_id: 'post-6', member_id: ME });
        assert.deepEqual(now, { pressed: 'true', label: 'Saved' });
        assert.deepEqual(reloaded, { pressed: 'true', label: 'Saved' });
        assert.deepEqual(others, { pressed: 'false', label: 'Save' });
      });
      await context.close();
      st.routes = baseRoutes();
    });

    // E6: Share uses navigator.share with no caption; without it the clipboard gets the URL.
    await scenario('scenario 6', async () => {
      const init = () => { window.__shared = []; Object.defineProperty(navigator, 'share', { configurable: true, value: async (data) => { window.__shared.push(data); } }); };
      const { context, page } = await open(375, { init });
      await page.locator('.post-card[data-post-id="post-1"] [data-post-action="share"]').click();
      // D-101: Share opens the share sheet; "More options" is the system share sheet.
      await page.locator('#post-share [data-share-native]').click();
      await page.waitForTimeout(300);
      const shared = await page.evaluate(() => window.__shared);
      check(`E6: Share calls navigator.share with { title, url } only (${JSON.stringify(shared)})`, () => {
        assert.equal(shared.length, 1);
        assert.deepEqual(Object.keys(shared[0]).sort(), ['title', 'url']);
        assert.equal(shared[0].url, `${stub.url}/explore.html?post=post-1`);
        assert.doesNotMatch(JSON.stringify(shared[0]), /Sunday|Asha/);
      });
      await context.close();
    });
    // VFIX 3: on phones the "Link copied." toast never lands on the action bar of the post just shared (nor on the tab
    // bar); on desktop it stays where it was (bottom right).
    await scenario('toast clear of the action bar', async () => {
      const init = () => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); };
      for (const width of [320, 375, 390, 1440]) {
        for (const where of ['low', 'high']) {
          const { context, page } = await open(width, { init });
          await watchToasts(page);
          const card = page.locator('.post-card[data-post-id="post-2"]');
          // Scroll so the action bar sits just above the tab bar ('low') or just under the header ('high').
          await page.evaluate((where) => {
            const bar = document.querySelector('.post-card[data-post-id="post-2"] .post-card-actions');
            const r = bar.getBoundingClientRect();
            const target = where === 'low' ? innerHeight - 90 - r.height : 70;
            window.scrollBy(0, r.top - target);
          }, where);
          await page.waitForTimeout(300);
          await card.locator('[data-post-action="share"]').click();
          await page.locator('#post-share [data-share-copy]').click();
          await page.waitForTimeout(450);
          const m = await page.evaluate(() => {
            const t = document.querySelector('#app-toast').getBoundingClientRect();
            const b = document.querySelector('.post-card[data-post-id="post-2"] .post-card-actions').getBoundingClientRect();
            const tab = document.querySelector('.app-tabbar')?.getBoundingClientRect();
            const hit = (a, c) => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;
            return { toast: [t.left, t.top, t.right, t.bottom].map(Math.round), bar: [b.left, b.top, b.right, b.bottom].map(Math.round), onBar: hit(t, b), onTabs: Boolean(tab && tab.height && getComputedStyle(document.querySelector('.app-tabbar')).display !== 'none' && hit(t, tab)), inside: t.left >= 0 && t.right <= innerWidth && t.top >= 0 && t.bottom <= innerHeight, shown: document.querySelector('#app-toast').classList.contains('show'), scroll: document.documentElement.scrollWidth - innerWidth };
          });
          if (width < 1000) check(`toast ${width} (${where}): "Link copied." is clear of the action bar and the tab bar, inside the viewport (${JSON.stringify(m)})`, () => {
            assert.equal(m.shown, true); assert.equal(m.onBar, false, 'toast covers the action bar'); assert.equal(m.onTabs, false, 'toast covers the tab bar');
            assert.equal(m.inside, true); assert.equal(m.scroll, 0);
          });
          else check(`toast ${width} (${where}): desktop keeps the toast bottom right (${JSON.stringify(m)})`, () => {
            assert.equal(m.shown, true); assert.ok(m.toast[2] >= 1440 - 40 && m.toast[3] >= 900 - 110, 'toast moved on desktop');
          });
          await context.close();
        }
      }
    });
    await scenario('scenario 7', async () => {
      const init = () => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); };
      const { context, page } = await open(1440, { init });
      await watchToasts(page);
      await page.locator('.post-card[data-post-id="post-2"] [data-post-action="share"]').click();
      await page.locator('#post-share [data-share-copy]').click();
      await page.waitForTimeout(400);
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      const seen = await toasts(page);
      check(`E6: without navigator.share the clipboard gets the URL and "Link copied." shows (${JSON.stringify({ clip, seen })})`, () => {
        assert.equal(clip, `${stub.url}/explore.html?post=post-2`);
        assert.ok(seen.includes('Link copied.'));
      });
      // The shared link lands on the post: explore.html forwards ?post= to the Explore view, which opens the detail.
      await page.goto(clip, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#post-detail[open]'), null, { timeout: 10000 }).catch(() => {});
      const landed = await page.evaluate(() => ({ url: location.pathname + location.search, view: document.body.dataset.appView, caption: document.querySelector('#post-detail[open] .post-detail-caption')?.textContent }));
      check(`a shared link opens the post (${JSON.stringify(landed)})`, () => {
        assert.equal(landed.view, 'posts'); assert.equal(landed.caption, 'First chess club night. Bring a board.');
      });
      await context.close();
    });

    // Comment opens the detail: image, caption, author, date; matched -> "Reply in chat" prefilled; else "View profile".
    await scenario('scenario 8', async () => {
      st.matchIds = [A];
      const { context, page } = await open(375);
      const comment = page.locator('.post-card[data-post-id="post-1"] [data-post-action="comment"]');
      await comment.click();
      await page.waitForFunction(() => document.querySelector('#post-detail[open] [data-post-detail-action]:not([aria-busy="true"])'), null, { timeout: 5000 }).catch(() => {});
      const detail = await page.evaluate(() => {
        const d = document.querySelector('#post-detail[open]');
        if (!d) return null;
        return {
          modal: d.matches(':modal'),
          img: d.querySelector('.post-detail-media img')?.getAttribute('src') || null,
          caption: d.querySelector('.post-detail-caption')?.textContent,
          author: d.querySelector('.post-detail-author')?.textContent.trim(),
          date: d.querySelector('time')?.textContent.trim(),
          actions: [...d.querySelectorAll('[data-post-detail-action]')].map((b) => b.textContent.trim()),
        };
      });
      check(`detail (matched): image, caption, author, date and one action "Reply in chat" (${JSON.stringify(detail)})`, () => {
        assert.ok(detail); assert.equal(detail.modal, true);
        assert.ok(detail.img); assert.equal(detail.caption, LONG); assert.equal(detail.author, 'Asha Band'); assert.ok(detail.date);
        assert.deepEqual(detail.actions, ['Reply in chat']);
      });
      const axe = await axeViolations(page, { include: '#post-detail' });
      check(`375: axe finds no violations in the post detail (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const closed = await page.evaluate(() => ({ open: Boolean(document.querySelector('#post-detail[open]')), focus: document.activeElement?.dataset.postAction, post: document.activeElement?.closest('.post-card')?.dataset.postId }));
      check(`detail: Escape closes it and focus returns to Comment (${JSON.stringify(closed)})`, () => assert.deepEqual(closed, { open: false, focus: 'comment', post: 'post-1' }));
      await comment.click();
      await page.waitForFunction(() => document.querySelector('#post-detail[open] [data-post-detail-action]:not([aria-busy="true"])'), null, { timeout: 5000 }).catch(() => {});
      await page.locator('[data-post-detail-action]').click();
      await page.waitForTimeout(800);
      const chat = await page.evaluate(() => ({ view: document.body.dataset.appView, open: !document.querySelector('#chat-window')?.hidden, name: document.querySelector('#chat-name')?.textContent, value: document.querySelector('#chat-input')?.value, focused: document.activeElement?.id, detail: Boolean(document.querySelector('#post-detail[open]')) }));
      check(`Reply in chat opens the chat with the composer prefilled (${JSON.stringify(chat)})`, () => {
        assert.equal(chat.view, 'chat'); assert.equal(chat.open, true); assert.equal(chat.name, 'Asha Band'); assert.equal(chat.detail, false);
        assert.equal(chat.value, `Re: “${Array.from(LONG).slice(0, 60).join('')}” `);
        assert.equal(chat.focused, 'chat-input');
      });
      await context.close();
    });
    await scenario('scenario 9', async () => {
      st.matchIds = [];
      const { context, page } = await open(1440);
      await page.locator('.post-card[data-post-id="post-2"] [data-post-action="comment"]').click();
      await page.waitForFunction(() => document.querySelector('#post-detail[open] [data-post-detail-action]:not([aria-busy="true"])'), null, { timeout: 5000 }).catch(() => {});
      const actions = await page.evaluate(() => [...document.querySelectorAll('#post-detail[open] [data-post-detail-action]')].map((b) => b.textContent.trim()));
      const axe = await axeViolations(page, { include: '#post-detail' });
      check(`1440: axe finds no violations in the post detail (${axe.join(' | ')})`, () => assert.deepEqual(axe, []));
      await page.locator('[data-post-detail-action]').click();
      await page.waitForTimeout(500);
      const profile = await page.evaluate(() => ({ modal: document.querySelector('#public-profile-modal')?.getAttribute('aria-label') || null, detail: Boolean(document.querySelector('#post-detail[open]')) }));
      check(`detail (not matched): the one action is "View profile", which opens the profile (${JSON.stringify({ actions, profile })})`, () => {
        assert.deepEqual(actions, ['View profile']);
        assert.equal(profile.modal, 'Bilal Place public profile'); assert.equal(profile.detail, false);
      });
      await context.close();
    });

    // Mutual consent: matched with A only, B's post offers only "View profile" (the stub honours the or= pair).
    await scenario('matched with A, not B', async () => {
      st.matchIds = [A];
      const { context, page } = await open(375);
      const actionsFor = async (id) => {
        await page.locator(`.post-card[data-post-id="${id}"] [data-post-action="comment"]`).click();
        await page.waitForFunction(() => document.querySelector('#post-detail[open] [data-post-detail-action]:not([aria-busy="true"])'), null, { timeout: 5000 }).catch(() => {});
        const actions = await page.evaluate(() => [...document.querySelectorAll('#post-detail[open] [data-post-detail-action]')].map((b) => b.textContent.trim()));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        return actions;
      };
      const b = await actionsFor('post-2');
      const a = await actionsFor('post-1');
      check(`matched with A only: B's post offers only "View profile", A's "Reply in chat" (${JSON.stringify({ a, b })})`, () => {
        assert.deepEqual(b, ['View profile']); assert.deepEqual(a, ['Reply in chat']);
      });
      await context.close();
      st.matchIds = [];
    });

    // ?post=<id> opens the detail once the posts load.
    await scenario('scenario 10', async () => {
      const { context, page } = await open(375, { pagePath: '/app.html?view=posts&post=post-6', wait: false });
      const opened = await page.waitForFunction(() => document.querySelector('#post-detail[open] .post-detail-caption')?.textContent, null, { timeout: 10000 }).then((h) => h.jsonValue()).catch(() => null);
      check(`?post=<id> opens that post's detail once posts load (${opened})`, () => assert.equal(opened, 'Weekend walk by the backwaters.'));
      await context.close();
    });

    // 0012 not applied yet: Like and Save are hidden, Comment and Share stay.
    await scenario('scenario 11', async () => {
      const missing = (table) => ({ status: 404, code: '42P01', message: `relation "public.${table}" does not exist` });
      st.routes = { ...baseRoutes(), 'GET community_post_likes': missing('community_post_likes'), 'GET community_post_saves': missing('community_post_saves') };
      const { context, page } = await open(375);
      const visible = await page.evaluate(() => [...document.querySelectorAll('.post-card[data-post-id="post-1"] [data-post-action]')].filter((b) => b.getClientRects().length).map((b) => b.dataset.postAction));
      check(`without 0012 Like and Save are hidden (${JSON.stringify(visible)})`, () => assert.deepEqual(visible, ['comment', 'share']));
      const cards = await page.evaluate(() => document.querySelectorAll('.post-card').length);
      check(`without 0012 every post card still renders (${cards})`, () => assert.equal(cards, POSTS.length));
      await context.close();
      // PostgREST schema-cache wording for a missing table (PGRST205) degrades the same way.
      const cache = (table) => ({ status: 404, code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` });
      st.routes = { ...baseRoutes(), 'GET community_post_likes': cache('community_post_likes'), 'GET community_post_saves': cache('community_post_saves') };
      const second = await open(375);
      const visible2 = await second.page.evaluate(() => [...document.querySelectorAll('.post-card[data-post-id="post-1"] [data-post-action]')].filter((b) => b.getClientRects().length).map((b) => b.dataset.postAction));
      check(`PGRST205 (schema cache) hides Like and Save too (${JSON.stringify(visible2)})`, () => assert.deepEqual(visible2, ['comment', 'share']));
      await second.context.close();
      st.routes = baseRoutes();
    });

    // E7: card-shaped skeletons while community_posts is delayed 1 s; aria-busy cleared after.
    await scenario('scenario 12', async () => {
      st.routes = { ...baseRoutes(), 'GET community_posts': { delayMs: 1000 } };
      for (const width of [375, 1440]) {
        const { context, page } = await open(width, { wait: false });
        const during = await page.waitForFunction(() => {
          const list = document.querySelector('#community-post-list');
          const sk = [...list.querySelectorAll('.skeleton-posts')].filter((el) => el.getBoundingClientRect().height > 0);
          if (list.getAttribute('aria-busy') !== 'true' || !sk.length) return null;
          const media = sk[0].querySelector('.skeleton-post-media').getBoundingClientRect();
          return { count: sk.length, head: Boolean(sk[0].querySelector('.skeleton-post-head')), actions: Boolean(sk[0].querySelector('.skeleton-post-actions')), ratio: Number((media.width / media.height).toFixed(3)), width: Math.round(sk[0].getBoundingClientRect().width), height: Math.round(sk[0].getBoundingClientRect().height) };
        }, null, { timeout: 900 }).then((h) => h.jsonValue()).catch(() => null);
        await page.waitForFunction(() => document.querySelectorAll('#community-post-list .post-card').length >= 6, null, { timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(300);
        const after = await page.evaluate(() => {
          const list = document.querySelector('#community-post-list');
          const card = list.querySelector('.post-card').getBoundingClientRect();
          return { busy: list.getAttribute('aria-busy'), skeletons: list.querySelectorAll('.skeleton').length, width: Math.round(card.width), shortest: Math.min(...[...list.querySelectorAll('.post-card')].map((c) => Math.round(c.getBoundingClientRect().height))) };
        });
        check(`E7 ${width}: card-shaped skeletons while loading, aria-busy cleared after (${JSON.stringify({ during, after })})`, () => {
          assert.ok(during, 'skeletons with aria-busy within 900 ms');
          assert.equal(during.head && during.actions, true);
          assert.ok(Math.abs(during.ratio - 1.25) <= 0.01, String(during.ratio));
          assert.ok(Math.abs(during.width - after.width) <= 1, `${during.width} vs ${after.width}`);
          assert.ok(Math.abs(during.height - after.shortest) <= 24, `${during.height} vs ${after.shortest}`);
          assert.equal(after.busy, null); assert.equal(after.skeletons, 0);
        });
        await context.close();
      }
      st.routes = baseRoutes();
    });

    check(`no uncaught page errors (${JSON.stringify(pageErrors.slice(0, 5))})`, () => assert.deepEqual(pageErrors, []));
  }
} finally {
  await browser?.close();
  await stub.close();
}
if (!SHOTS) {
  for (const [status, name] of results) console.log(`${status}  ${name}`);
  const failed = results.filter(([status]) => status === 'FAIL').length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
