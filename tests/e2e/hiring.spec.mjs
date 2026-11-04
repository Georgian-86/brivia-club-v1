// Hiring (D-141) against the stubbed Supabase, at 1440 and 390. Before 0037 nothing shows. A seeker sees a hirer's card
// bar ("HIRING · …"), the role strip, the profile banner first with Ask about this role, the Ask sheet (a short note is
// refused by the field; the ask goes through ask_about_role), the once-a-day notification row, the Hiring lens and the
// "Open to roles" card. A hirer sees "You're hiring" (Add a role refuses a link, then posts), HIRING in the eyebrow,
// "Asking about: …" on a request, and "Fake job or recruitment scam" when reporting a hirer. Sheets are bottom sheets
// with 16 px inputs on phones; no page scrolls sideways; axe is clean on every sheet.
// PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/hiring.spec.mjs   (Vite on :5191)
// HIRING_SHOTS=<dir> also saves each screen at 390 and 1440.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { axeViolations } from './a11y.mjs';
import { startAppStub, defaultDeckRows, ownRow } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.HIRING_SHOTS || '';
const [ASHA, BILAL] = defaultDeckRows.map((row) => row.id);
const ROLE_A = 'a0a00000-0000-4000-8000-000000000001';
const ROLE_B = 'a0a00000-0000-4000-8000-000000000002';
const MY_ROLE = 'a0a00000-0000-4000-8000-000000000009';
const missing = { status: 404, code: 'PGRST202', message: 'Could not find the function' };
const ashaHiring = [{
  member_id: ASHA, best_title: 'Frontend Developer', fits: true,
  roles: [
    { id: ROLE_A, title: 'Frontend Developer', family: 'software', level: 'mid', work_mode: 'hybrid', help: 'refer', company: 'Lumen Labs', about: 'React and TypeScript, a small product team.', opened_days: 3, fit: 0.86, accepting: true, asked: false },
    { id: ROLE_B, title: 'Design Intern', family: 'design', level: 'intern', work_mode: 'onsite', help: 'refer', company: null, about: null, opened_days: 3, fit: 0.2, accepting: true, asked: false },
  ],
}];
const seekerIntent = [{ titles: ['Frontend Developer', 'React Developer'], families: ['software'], level: 'mid', work_modes: ['hybrid', 'remote'], visibility: 'hirers', findable: false, private_company: null, consented_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
const seekerRoutes = () => ({
  'rpc/my_role_intent': { body: seekerIntent },
  'rpc/my_hiring_roles': { body: [] },
  'rpc/member_hiring': { body: ashaHiring },
  'rpc/hiring_suggestions': { body: [{ id: ASHA, fit: 0.86, role_title: 'Frontend Developer', distance_band: '~3 km' }] },
  'rpc/my_sent_role_asks': { body: [] },
  'rpc/member_open_to': { body: [] },
  'rpc/ask_about_role': { body: [{ status: 'sent', remaining: 29, resets_at: null, asks_left: 2 }] },
});
const myRole = { id: MY_ROLE, title: 'Backend Engineer', family: 'software', level: 'senior', work_mode: 'remote', help: 'hiring', company: null, about: null, status: 'open', paused_by_report: false, opened_at: new Date().toISOString(), expires_at: new Date(Date.now() + 27 * 864e5).toISOString(), waiting_asks: 1, banner_live: true, live_from: new Date().toISOString().slice(0, 10) };
const hirerRoutes = () => ({
  'rpc/my_role_intent': { body: [] },
  'rpc/my_hiring_roles': { body: [myRole] },
  'rpc/member_hiring': { body: ashaHiring },
  'rpc/my_role_asks': { body: [{ seeker_id: BILAL, role_id: MY_ROLE, role_title: 'Backend Engineer', created_at: new Date().toISOString() }] },
  'rpc/hiring_suggestions': { body: [] },
  'rpc/member_open_to': { body: [{ titles: ['Backend Engineer'], level: 'senior', work_modes: ['remote'] }] },
  'rpc/save_hiring_role': { body: 'a0a00000-0000-4000-8000-00000000000a' },
});

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const st = { routes: seekerRoutes() };
const stub = await startAppStub({ port: 5191, state: st });
const browser = await chromium.launch();
const errors = [];
const shot = async (page, name, full = false) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name), fullPage: full }); };
const callsTo = (name) => st.calls.filter((c) => c.path === `/rest/v1/rpc/${name}`);
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const sheetChecks = async (page, w, label) => {
  const box = await page.locator('dialog.hiring-sheet[open]').boundingBox();
  const vp = page.viewportSize();
  if (w < 640) {
    check(`${w}: ${label} is a bottom sheet (${JSON.stringify(box)})`, Math.abs(box.y + box.height - vp.height) <= 1 && box.width >= vp.width - 1);
    const small = await page.locator('dialog.hiring-sheet[open]').evaluate((d) => [...d.querySelectorAll('input:not([type=radio]):not([type=checkbox]), select, textarea')].filter((el) => el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.id || el.name));
    check(`${w}: ${label} inputs are 16 px`, small.length === 0, JSON.stringify(small));
  } else check(`${w}: ${label} is a centred card`, box.width <= 501 && box.y > 0);
  const tiny = await page.locator('dialog.hiring-sheet[open]').evaluate((d) => [...d.querySelectorAll('button:not(.b-chip-remove)')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim() || b.className || b.outerHTML.slice(0, 80)));
  // .b-chip-remove is the shared chip × (D-105: 32 px with a 6 px hit margin), the same as in Edit profile.
  check(`${w}: ${label} buttons are 44 px or more`, tiny.length === 0, JSON.stringify(tiny));
  const axe = await axeViolations(page, { include: 'dialog.hiring-sheet[open]' });
  check(`${w}: ${label} axe clean`, axe.length === 0, axe.join(' | '));
};

try {
  // 0. Before 0037: the RPCs are missing and nothing hiring-shaped appears.
  {
    st.routes = { 'rpc/my_role_intent': missing, 'rpc/my_hiring_roles': missing, 'rpc/member_hiring': missing };
    const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
    const page = await stub.open(ctx, { errors });
    await page.waitForSelector('#swipe-card:not([hidden]) #swipe-name');
    await page.waitForTimeout(500);
    check('before 0037: the bar keeps LOOKING FOR', /LOOKING FOR/.test(await page.locator('#swipe-card-label').innerText()));
    check('before 0037: no strip, no lens', await page.locator('#swipe-hiring').isHidden() && await page.locator('#filter-hiring-group').isHidden() && await page.locator('#hiring-toggle').isHidden());
    check('before 0037: member_hiring never asked', callsTo('member_hiring').length === 0);
    await ctx.close();
  }

  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const mobile = { ...(w < 780 ? { isMobile: true, hasTouch: true } : {}), deviceScaleFactor: SHOTS ? 2 : 1 };
    // 1. The seeker.
    st.routes = seekerRoutes();
    st.own = { ...ownRow, looking_for: ['Job Referral', 'Friends'] };
    st.calls.length = 0;
    let ctx = await stub.newContext(browser, { width: w, height: h }, mobile);
    let page = await stub.open(ctx, { errors });
    page.setDefaultTimeout(8000);
    await page.waitForFunction(() => /HIRING/.test(document.querySelector('#swipe-card-label')?.textContent || ''));
    const bar = await page.locator('#swipe-card-label').evaluate((el) => ({ text: el.textContent, clipped: el.scrollWidth > el.clientWidth + 1 }));
    check(`${w}: the bar reads HIRING and is never clipped (${JSON.stringify(bar)})`, /^HIRING/.test(bar.text) && !bar.clipped);
    const strip = await page.locator('#swipe-hiring').innerText().catch(() => '');
    check(`${w}: the strip names the fitting role (${JSON.stringify(strip)})`, /Frontend Developer · Hybrid/.test(strip) && /Fits what you're open to/.test(strip) && /Can refer/.test(strip));
    check(`${w}: no duplicate "Hiring" chip on the card`, !(await page.locator('#swipe-tags').innerText()).match(/^Hiring$/m));
    check(`${w}: the deck never scrolls sideways`, await noSideScroll(page));
    await shot(page, `deck-seeker-${w}.png`);

    // D-162/D-166: the one-tap Hiring switch beside the filter button turns the same lens on and off.
    const toggle = page.locator('#hiring-toggle');
    check(`${w}: the Hiring switch shows, off`, await toggle.isVisible() && await toggle.getAttribute('aria-checked') === 'false' && await toggle.getAttribute('role') === 'switch');
    const tb = await toggle.boundingBox();
    const mb = await page.locator('#open-discovery-filters').boundingBox();
    check(`${w}: the switch is 44 px and sits beside the filter button, right-aligned on phones (${JSON.stringify(tb)} vs ${JSON.stringify(mb)})`, tb.height >= 44 && Math.abs((tb.y + tb.height / 2) - (mb.y + mb.height / 2)) <= 1 && tb.x > mb.x + mb.width && (w < 850 ? Math.abs(tb.x + tb.width - (w - (mb.x))) <= 2 : tb.x - (mb.x + mb.width) <= 12) && tb.x + tb.width <= w);
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('#hiring-toggle')?.getAttribute('aria-checked') === 'true');
    check(`${w}: the toggle turns the drawer's lens on too`, await page.evaluate(() => document.querySelector('#filter-hiring')?.checked === true));
    check(`${w}: with the toggle on, only the fitting hirer is in the deck (${await page.locator('#discovery-filter-result').textContent()})`, /Asha/.test(await page.locator('#swipe-name').innerText()) && /^1 person match/.test(await page.locator('#discovery-filter-result').textContent()));
    check(`${w}: the deck still never scrolls sideways with the toggle on`, await noSideScroll(page));
    const axeToggle = await axeViolations(page, { include: '[data-view="home"] .home-tools' });
    check(`${w}: the filter button and Hiring switch are axe clean`, axeToggle.length === 0, axeToggle.join(' | '));
    await shot(page, `deck-toggle-on-${w}.png`);
    await toggle.click();
    await page.waitForFunction(() => document.querySelector('#hiring-toggle')?.getAttribute('aria-checked') === 'false');
    check(`${w}: a second tap turns it off`, await page.evaluate(() => document.querySelector('#filter-hiring')?.checked === false) && /All people/.test(await page.locator('#discovery-filter-result').textContent()));

    await page.locator('[data-action="full-info"]').click();
    await page.waitForSelector('#public-profile-modal .hiring-banner');
    await page.waitForTimeout(600);  // the dialog's opening fade
    const first = await page.locator('.public-profile-body > *:first-child').getAttribute('class');
    check(`${w}: the banner comes first in the profile`, /hiring-banner/.test(first || ''));
    const banner = await page.locator('.hiring-banner').innerText();
    check(`${w}: the banner lists both roles, the fit, the consent line`, /Frontend Developer/.test(banner) && /Design Intern/.test(banner) && /Fits what you're open to/.test(banner) && /chooses who to connect with/.test(banner));
    check(`${w}: one primary Ask, one quiet Ask`, await page.locator('.hiring-banner .hiring-ask').count() === 1 && await page.locator('.hiring-banner .hiring-quiet').count() === 1);
    await shot(page, `profile-banner-${w}.png`);

    await page.locator('.hiring-banner .hiring-ask').click();
    await page.waitForSelector('dialog.hiring-sheet[open] #hiring-ask-note');
    await page.waitForTimeout(250);
    check(`${w}: the Ask sheet carries the safety line`, /Never pay a fee/.test(await page.locator('dialog.hiring-sheet[open]').innerText()));
    await sheetChecks(page, w, 'Ask sheet');
    await shot(page, `ask-sheet-${w}.png`);
    await page.locator('#hiring-ask-note').fill('Hi');
    await page.locator('dialog.hiring-sheet[open] .hiring-primary').click();
    check(`${w}: a short note is refused by the field`, /at least 20 characters/.test(await page.locator('[data-error="note"]').innerText()) && callsTo('ask_about_role').length === 0);
    await page.locator('#hiring-ask-note').fill('Four years of React and TypeScript, shipped a design system at a fintech.');
    await page.locator('dialog.hiring-sheet[open] .hiring-primary').click();
    await page.waitForSelector('dialog.hiring-sheet', { state: 'detached' });
    const asked = callsTo('ask_about_role').map((c) => JSON.parse(c.body));
    check(`${w}: the ask goes to ask_about_role with the role and the note`, asked.length === 1 && asked[0].p_role === ROLE_A && /React/.test(asked[0].p_note));
    const afterAsk = await page.locator('.hiring-banner').innerHTML();
    check(`${w}: the button now says Asked`, /hiring-asked/.test(afterAsk), afterAsk.slice(0, 600));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#public-profile-modal', { state: 'detached' });

    // The notification row, once a day.
    await page.locator('#app-notification-button').click();
    await page.waitForSelector('.notification-hiring');
    check(`${w}: the row says someone near you is hiring`, /Someone near you is hiring/.test(await page.locator('.notification-hiring').innerText()));
    await shot(page, `notification-${w}.png`);
    await page.locator('[data-hiring-row]').click();
    await page.waitForTimeout(300);
    check(`${w}: See them turns on the Hiring lens`, await page.evaluate(() => document.querySelector('#filter-hiring')?.checked === true));
    check(`${w}: the lens keeps only the fitting hirer`, /Asha/.test(await page.locator('#swipe-name').innerText()));
    await ctx.close();

    // The seeker's own profile card.
    ctx = await stub.newContext(browser, { width: w, height: h }, mobile);
    page = await stub.open(ctx, { path: '/app.html?view=profile', errors });
    await page.waitForSelector('#profile-hiring:not([hidden]) .hiring-pill-row');
    const own = await page.locator('#profile-hiring').innerText();
    check(`${w}: "Open to roles" lists the roles and who sees them`, /Open to roles/.test(own) && /Frontend Developer/.test(own) && /Only members who are hiring see this/.test(own));
    check(`${w}: the profile never scrolls sideways`, await noSideScroll(page));
    await page.locator('#profile-hiring').scrollIntoViewIfNeeded();
    await shot(page, `profile-seeker-${w}.png`);
    await page.locator('[data-hiring-intent]').click();
    await page.waitForSelector('dialog.hiring-sheet[open] [name="visibility"]');
    await page.waitForTimeout(250);
    await sheetChecks(page, w, 'Roles you\'re open to sheet');
    await shot(page, `intent-sheet-${w}.png`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog.hiring-sheet', { state: 'detached' });
    // Edit profile's Looking for offers the three hiring values (founder, 2026-11-03: "there is no job opportunities").
    await page.locator('#profile-photo-editor').click();
    const lookInput = page.locator('[data-picker="profile-looking-edit"] [data-picker-input]');
    await lookInput.waitFor();
    const offered = [];
    for (const [q, value] of [['job', 'Job Opportunities'], ['hiri', 'Hiring'], ['can give', 'Can Give Referrals']]) {
      await lookInput.fill(q);
      if (await page.locator(`#profile-looking-edit-list [data-value="${value}"]`).count()) offered.push(value);
    }
    check(`${w}: Edit profile's Looking for offers Job Opportunities, Hiring and Can Give Referrals (${offered.join(', ')})`, offered.length === 3);
    await ctx.close();

    // 2. The hirer.
    st.routes = hirerRoutes();
    st.own = { ...ownRow, looking_for: ['Hiring'] };
    st.requests = [{ from_id: BILAL, note: 'I have run Postgres at scale for six years. Happy to share more.', created_at: new Date().toISOString() }];
    st.calls.length = 0;
    ctx = await stub.newContext(browser, { width: w, height: h }, mobile);
    page = await stub.open(ctx, { path: '/app.html?view=profile', errors });
    await page.waitForSelector('#profile-hiring:not([hidden]) .hiring-card-roles');
    const hirerCard = await page.locator('#profile-hiring').innerText();
    check(`${w}: "You're hiring" shows the role, its state and the waiting ask`, /You're hiring/.test(hirerCard) && /Backend Engineer/.test(hirerCard) && /1 ask waiting/.test(hirerCard) && /Open/.test(hirerCard));
    check(`${w}: the hero eyebrow says HIRING`, /HIRING/.test(await page.locator('.profile-hero-copy .app-eyebrow').innerText()));
    await page.locator('#profile-hiring').scrollIntoViewIfNeeded();
    await shot(page, `profile-hirer-${w}.png`);
    await page.locator('[data-hiring-add]').click();
    await page.waitForSelector('dialog.hiring-sheet[open] #hiring-about');
    await page.waitForTimeout(250);
    await sheetChecks(page, w, 'Add a role sheet');
    await shot(page, `add-role-${w}.png`);
    await page.locator('dialog.hiring-sheet[open] [data-picker="hiring-role-pick"] input').first().fill('Frontend Developer');
    await page.keyboard.press('Enter');
    await page.locator('#hiring-about').fill('Apply at lumen.io/jobs');
    await page.locator('dialog.hiring-sheet[open] .hiring-primary').click();
    check(`${w}: a link in the line is refused by the field`, /Links and contact details go in chat/.test(await page.locator('[data-error="about"]').innerText()) && callsTo('save_hiring_role').length === 0);
    await page.locator('#hiring-about').fill('React and TypeScript, a small product team.');
    await page.locator('dialog.hiring-sheet[open] .hiring-primary').click();
    await page.waitForSelector('dialog.hiring-sheet', { state: 'detached' });
    const saved = callsTo('save_hiring_role').map((c) => JSON.parse(c.body));
    check(`${w}: Post role calls save_hiring_role (${JSON.stringify(saved[0] || {})})`, saved.length === 1 && saved[0].p_title === 'Frontend Developer' && saved[0].p_family === 'software' && saved[0].p_work_mode === 'hybrid');

    // The request card tag.
    await page.locator('#app-notification-button').click();
    await page.locator('[data-collab-review]').click();
    await page.waitForSelector('dialog.collab-review[open] .collab-role');
    check(`${w}: the request says what it asks about`, /Asking about: Backend Engineer/.test(await page.locator('.collab-role').innerText()));
    await page.waitForTimeout(450);
    await shot(page, `request-tag-${w}.png`);
    await page.keyboard.press('Escape');
    await ctx.close();

    // The fake-job report reason on a hirer's card.
    ctx = await stub.newContext(browser, { width: w, height: h }, mobile);
    page = await stub.open(ctx, { errors });
    await page.waitForFunction(() => /HIRING/.test(document.querySelector('#swipe-card-label')?.textContent || ''));
    await page.locator('#card-more').click();
    await page.locator('[data-card-action="report"]').click();
    await page.waitForSelector('dialog.report-dialog[open]');
    check(`${w}: reporting a hirer offers "Fake job or recruitment scam" first`, /Fake job or recruitment scam/.test(await page.locator('.report-reasons .report-reason').first().innerText()));
    await ctx.close();
  }
  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (error) {
  console.error(error); if (errors.length) console.error('page errors:', errors.slice(0, 5));
  failed += 1;
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
