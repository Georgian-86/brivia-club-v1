// Edit profile (D-104, founder 2026-10-28): interests editable (chips + search, saved with set_member_interests, the
// daily limit explained), Experience as a dropdown, the saved area in the city box, a Bio (0016) saved to the member's
// row and shown to others through member_bio.
// PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/profile-edit.spec.mjs   (Vite on :5184)
// EDIT_SHOTS=<dir> saves the dialog at 1440 and 390.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { axeViolations } from './a11y.mjs';
import { startAppStub, ownRow } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.EDIT_SHOTS || '';
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const NODES = [
  { id: 'food.cooking.home', parent_id: 'food.cooking', level: 3, label: 'Everyday home cooking', sensitive: false },
  { id: 'style.fashion.fashion', parent_id: 'style.fashion', level: 3, label: 'Fashion', sensitive: false },
  { id: 'arts.writing.poetry', parent_id: 'arts.writing', level: 3, label: 'Poetry', sensitive: false },
  { id: 'sports.racket.badminton', parent_id: 'sports.racket', level: 3, label: 'Badminton', sensitive: false },
  { id: 'music.listening.jazz', parent_id: 'music.listening', level: 3, label: 'Jazz', sensitive: false },
  { id: 'beliefs.faith.private', parent_id: 'beliefs.faith', level: 3, label: 'A private belief', sensitive: true },
];
const MINE = [
  { interest_id: 'food.cooking.home', label: 'Everyday home cooking', points: 7, mode: 'play' },
  { interest_id: 'style.fashion.fashion', label: 'Fashion', points: 7, mode: 'teach' },
  { interest_id: 'arts.writing.poetry', label: 'Poetry', points: 6, mode: 'play' },
];
const fresh = (extra = {}) => ({ own: { ...ownRow, name: 'Simranjeet Kaur', experience: '', bio: null }, placeLabel: 'Ludhiana (city-wide)', myInterests: MINE.map((r) => ({ ...r })), routes: { interest_node: { body: NODES } }, ...extra });
const st = fresh();
const stub = await startAppStub({ port: 5184, state: st });
const browser = await chromium.launch();
const errors = [];
const posted = (name) => st.calls.filter((c) => c.method === 'POST' && c.path === `/rest/v1/rpc/${name}`);
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    Object.assign(st, fresh());
    st.calls.length = 0;
    const ctx = await stub.newContext(browser, { width: w, height: h }, w < 780 ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: '/app.html?view=profile', errors });
    page.setDefaultTimeout(8000);
    const about = await page.locator('#profile-bio').isVisible();
    check(`${w}: the profile shows an About card once the bio column exists`, about);
    const heroBefore = await page.evaluate(() => { const q = document.querySelector('#profile-hero-bio'); return { hidden: q.hidden, text: q.textContent, old: /Same curiosity/.test(document.body.innerText) }; });
    check(`${w}: D-113 no bio yet: nothing under the name in the hero (the old fixed line is gone)`, heroBefore.hidden && !heroBefore.text && !heroBefore.old, JSON.stringify(heroBefore));
    await page.locator('#profile-bio [data-profile-edit]').click();
    await page.waitForSelector('#profile-edit-modal [data-picker="profile-interests-edit"] [data-chip-remove]');
    const ui = await page.evaluate(() => {
      const m = document.querySelector('#profile-edit-modal');
      const sel = m.querySelector('select[name="experience"]');
      return {
        chips: [...m.querySelectorAll('[data-picker="profile-interests-edit"] .b-chip-label')].map((x) => x.textContent.trim()),
        datalist: m.querySelectorAll('datalist').length,
        looking: [...m.querySelectorAll('[data-picker="profile-looking-edit"] .b-chip-label')].map((x) => x.textContent.trim()),
        experience: sel ? [...sel.options].map((o) => o.textContent) : null,
        area: m.querySelector('[data-area-search]')?.value,
        bio: Boolean(m.querySelector('textarea[name="bio"]')),
      };
    });
    check(`${w}: the saved interests are editable chips`, JSON.stringify(ui.chips) === JSON.stringify(['Everyday home cooking', 'Fashion', 'Poetry']), JSON.stringify(ui.chips));
    check(`${w}: Experience is a dropdown with the signup choices`, ui.experience?.includes('3–7 years') && ui.experience[0] === 'Choose one', JSON.stringify(ui.experience));
    check(`${w}: the city box shows the saved area`, ui.area === 'Ludhiana', ui.area);
    check(`${w}: a Bio field is there`, ui.bio);
    check(`${w}: no native datalist; Looking for is chips`, ui.datalist === 0 && Array.isArray(ui.looking), JSON.stringify(ui));
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `edit-${w}.png`) }); }
    const axe = await axeViolations(page, { include: '#profile-edit-modal [data-picker], #profile-edit-modal .profile-edit-bio, #profile-edit-modal select[name="experience"], #profile-edit-modal [data-profile-area]' });
    check(`${w}: axe on the new interests, experience, area and bio fields`, axe.length === 0, JSON.stringify(axe));

    // Edit: remove Fashion, add Badminton (search), never offer a private interest; experience; bio.
    await page.locator('[data-chip-remove="style.fashion.fashion"]').click();
    const interestInput = page.locator('[data-picker="profile-interests-edit"] [data-picker-input]');
    await interestInput.fill('priv');
    const privateOffered = await page.locator('#profile-interests-edit-list [data-value]').count();
    check(`${w}: private interests are never offered`, privateOffered === 0);
    await interestInput.fill('badm');
    const look = await page.evaluate(() => { const list = document.querySelector('#profile-interests-edit-list'); const li = list.querySelector('li'); const cs = li && getComputedStyle(li); return { bullets: cs?.listStyleType, display: cs?.display, minH: Math.round(li?.getBoundingClientRect().height || 0), shadow: getComputedStyle(list).boxShadow !== 'none', radius: getComputedStyle(list).borderTopLeftRadius }; });
    check(`${w}: the interest list is the brand listbox (no bullets, 44 px rows, a panel attached to the field)`, look.bullets === 'none' && look.display === 'flex' && look.minH >= 44 && look.shadow && look.radius === '0px', JSON.stringify(look));
    await page.locator('#profile-interests-edit-list [data-value="sports.racket.badminton"]').click();
    // Looking for: a suggestion and a value of the member's own
    const lookInput = page.locator('[data-picker="profile-looking-edit"] [data-picker-input]');
    await lookInput.fill('Mentor');
    await page.locator('#profile-looking-edit-list [data-value="Mentor"]').click();
    await lookInput.fill('Supper club');
    await lookInput.press('Enter');
    await page.locator('select[name="experience"]').selectOption('3–7 years');
    await page.locator('textarea[name="bio"]').fill('Home cook and poetry reader in Ludhiana.');
    // D-113: the emoji panel under the bio adds an emoji at the end and keeps the count right.
    await page.locator('#profile-edit-modal .emoji-field-toggle').click();
    await page.locator('#profile-edit-modal .emoji-field-panel [data-emoji-tab="food"]').click();
    const emoji = await page.locator('#profile-edit-modal .emoji-field-emoji').first().getAttribute('data-emoji');
    await page.locator('#profile-edit-modal .emoji-field-emoji').first().click();
    const withEmoji = await page.evaluate(() => ({ value: document.querySelector('textarea[name="bio"]').value, count: document.querySelector('[data-bio-count]').textContent, focus: document.activeElement?.name }));
    check(`${w}: D-113 the emoji panel inserts ${emoji} into the bio, updates the count and keeps the focus in the box`, withEmoji.value === `Home cook and poetry reader in Ludhiana.${emoji}` && withEmoji.count === String(withEmoji.value.length) && withEmoji.focus === 'bio', JSON.stringify(withEmoji));
    if (SHOTS) await page.locator('#profile-edit-modal .profile-edit-bio').screenshot({ path: path.join(SHOTS, `edit-emoji-${w}.png`) });
    const emojiAxe = await axeViolations(page, { include: '#profile-edit-modal .emoji-field' });
    check(`${w}: D-113 axe on the open emoji panel`, emojiAxe.length === 0, JSON.stringify(emojiAxe));
    await page.keyboard.press('Escape');
    const panelClosed = await page.evaluate(() => ({ hidden: document.querySelector('#profile-edit-modal .emoji-field-panel')?.hidden, modal: Boolean(document.querySelector('#profile-edit-modal')) }));
    check(`${w}: D-113 Escape closes the emoji panel, not the dialog`, panelClosed.hidden === true && panelClosed.modal, JSON.stringify(panelClosed));
    await page.locator('textarea[name="bio"]').fill('Home cook and poetry reader in Ludhiana.');
    if (SHOTS) await page.locator('#profile-edit-modal .profile-edit-dialog').screenshot({ path: path.join(SHOTS, `edit-filled-${w}.png`) });
    await page.locator('.profile-edit-save').click();
    await page.waitForFunction(() => !document.querySelector('#profile-edit-modal'));
    const items = JSON.parse(posted('set_member_interests').at(-1)?.body || '{}').p_items || [];
    check(`${w}: the new interests save with 20 points, modes kept`, JSON.stringify(items.map((i) => i.interest_id)) === JSON.stringify(['food.cooking.home', 'arts.writing.poetry', 'sports.racket.badminton']) && items.reduce((a, i) => a + i.points, 0) === 20 && items[0].mode === 'play', JSON.stringify(items));
    const patches = st.calls.filter((c) => c.method === 'PATCH' && c.path === '/rest/v1/profiles').map((c) => JSON.parse(c.body || '{}'));
    check(`${w}: the bio and the experience are saved to the member's row`, patches.some((p) => p.bio === 'Home cook and poetry reader in Ludhiana.') && patches.some((p) => p.experience === '3–7 years'), JSON.stringify(patches.map((p) => ({ bio: p.bio, experience: p.experience }))));
    check(`${w}: looking for keeps the saved value and adds a suggestion and a typed one`, patches.some((p) => JSON.stringify(p.looking_for) === JSON.stringify(['Friends', 'Mentor', 'Supper club'])), JSON.stringify(patches.map((p) => p.looking_for)));
    check(`${w}: the About card shows the bio`, (await page.locator('#profile-bio .profile-bio-text').textContent()) === 'Home cook and poetry reader in Ludhiana.');
    const heroAfter = await page.evaluate(() => { const q = document.querySelector('#profile-hero-bio'); return { hidden: q.hidden, text: q.textContent }; });
    check(`${w}: D-113 the hero shows the saved bio under the name`, !heroAfter.hidden && heroAfter.text === 'Home cook and poetry reader in Ludhiana.', JSON.stringify(heroAfter));
    if (SHOTS) await page.locator('.profile-hero').screenshot({ path: path.join(SHOTS, `hero-bio-${w}.png`) });

    // Unchanged interests send nothing; the daily limit is explained and nothing else is saved.
    const before = posted('set_member_interests').length;
    await page.evaluate(() => document.querySelector('#profile-photo-editor')?.click());
    await page.waitForSelector('#profile-edit-modal [data-chip-remove]');
    st.myInterests = MINE.map((r) => ({ ...r }));
    await page.locator('.profile-edit-save').click();
    await page.waitForFunction(() => !document.querySelector('#profile-edit-modal'));
    check(`${w}: saving without changing interests sends no interest save`, posted('set_member_interests').length === before);
    await page.evaluate(() => document.querySelector('#profile-photo-editor')?.click());
    await page.waitForSelector('#profile-edit-modal [data-chip-remove]');
    st.routes['rpc/set_member_interests'] = { status: 429, code: 'PT429', message: 'try again later' };
    await page.locator('#profile-edit-modal [data-picker="profile-interests-edit"] [data-chip-remove]').first().click();
    await page.locator('.profile-edit-save').click();
    await page.waitForFunction(() => /3 times a day/.test(document.querySelector('#profile-edit-feedback')?.textContent || ''));
    check(`${w}: the daily interest limit is explained and the dialog stays open`, await page.locator('#profile-edit-modal').isVisible());
    delete st.routes['rpc/set_member_interests'];
    await ctx.close();
  }

  // D-109: with the founder's catalogue (0017) the list is A-Z under letter headings; search reaches all of it; an
  // interest the member holds outside the catalogue stays and saves; "Add … as your own interest" (add_member_interest).
  const CATALOG = [
    ...NODES.filter((n) => !['sports.racket.badminton', 'arts.writing.poetry'].includes(n.id)).map((n) => ({ ...n, catalog_order: null })),
    { id: 'arts.visual.abstract_art', parent_id: 'arts.visual', level: 3, label: 'Abstract Art', sensitive: false, catalog_order: 1 },
    { id: 'sports.racket.badminton', parent_id: 'sports.racket', level: 3, label: 'Badminton', sensitive: false, catalog_order: 2 },
    { id: 'arts.writing.poetry', parent_id: 'arts.writing', level: 3, label: 'Poetry', sensitive: false, catalog_order: 3 },
    { id: 'food.cooking.zymology', parent_id: 'food.cooking', level: 3, label: 'Zymology', sensitive: false, catalog_order: 4 },
  ];
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    Object.assign(st, fresh({ routes: { interest_node: { body: CATALOG }, 'rpc/add_member_interest': { body: 'member.custom.kite_surfing_club' } } }));
    st.calls.length = 0;
    const ctx = await stub.newContext(browser, { width: w, height: h }, w < 780 ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: '/app.html?view=profile', errors });
    page.setDefaultTimeout(8000);
    await page.locator('#profile-bio [data-profile-edit]').click();
    await page.waitForSelector('#profile-edit-modal [data-picker="profile-interests-edit"] [data-chip-remove]');
    const input = page.locator('[data-picker="profile-interests-edit"] [data-picker-input]');
    await input.click();
    await page.waitForSelector('#profile-interests-edit-list:not([hidden]) .b-listbox-heading');
    const list = await page.evaluate(() => {
      const l = document.querySelector('#profile-interests-edit-list');
      return { headings: [...l.querySelectorAll('.b-listbox-heading')].map((x) => x.textContent), options: [...l.querySelectorAll('.b-option')].map((x) => x.textContent) };
    });
    check(`${w}: A-Z headings over the catalogue only (${JSON.stringify(list)})`, JSON.stringify(list.headings) === '["A","B","Z"]' && JSON.stringify(list.options) === '["Abstract Art","Badminton","Zymology"]');
    const axe = await axeViolations(page, { include: '#profile-edit-modal [data-picker="profile-interests-edit"]' });
    check(`${w}: axe on the open A-Z list`, axe.length === 0, JSON.stringify(axe));
    if (SHOTS) await page.locator('#profile-edit-modal .profile-edit-dialog').screenshot({ path: path.join(SHOTS, `catalog-${w}.png`) });
    await input.fill('zym');
    check(`${w}: search finds Zymology`, (await page.locator('#profile-interests-edit-list .b-option').first().textContent()) === 'Zymology');
    await input.fill('Kite  surfing club');
    const add = page.locator('#profile-interests-edit-list .b-option-add');
    check(`${w}: "Add … as your own interest" is offered (${await add.textContent().catch(() => 'none')})`, (await add.textContent()) === 'Add “Kite surfing club” as your own interest');
    if (SHOTS) await page.locator('#profile-edit-modal .profile-edit-dialog').screenshot({ path: path.join(SHOTS, `own-${w}.png`) });
    await add.click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-picker="profile-interests-edit"] .b-chip-label')].some((x) => x.textContent === 'Kite surfing club'));
    check(`${w}: add_member_interest got the clean label`, JSON.parse(posted('add_member_interest').at(-1)?.body || '{}').p_label === 'Kite surfing club');
    await page.locator('.profile-edit-save').click();
    await page.waitForFunction(() => !document.querySelector('#profile-edit-modal'));
    const items = JSON.parse(posted('set_member_interests').at(-1)?.body || '{}').p_items || [];
    check(`${w}: the own interest saves, and an interest outside the catalogue stays (${JSON.stringify(items.map((i) => i.interest_id))})`, items.some((i) => i.interest_id === 'member.custom.kite_surfing_club') && items.some((i) => i.interest_id === 'food.cooking.home') && items.reduce((a, i) => a + i.points, 0) === 20);
    // A refused label: the toast says why, no chip.
    st.routes['rpc/add_member_interest'] = { status: 400, code: '22023', message: 'not allowed' };
    await page.evaluate(() => document.querySelector('#profile-bio [data-profile-edit]')?.click());
    await page.waitForSelector('#profile-edit-modal [data-chip-remove]');
    await input.fill('Rude words here');
    await page.locator('#profile-interests-edit-list .b-option-add').click();
    await page.waitForFunction(() => /can't be added/.test(document.querySelector('#app-toast')?.textContent || ''));
    check(`${w}: a refused label explains itself and adds no chip`, !(await page.locator('[data-picker="profile-interests-edit"] .b-chip-label', { hasText: 'Rude words here' }).count()));
    await ctx.close();
  }
  // Before 0017 (no catalog_order): no A-Z headings and no "own interest" row.
  {
    Object.assign(st, fresh());
    const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
    const page = await stub.open(ctx, { path: '/app.html?view=profile', errors });
    await page.locator('#profile-bio [data-profile-edit]').click();
    await page.waitForSelector('#profile-edit-modal [data-chip-remove]');
    await page.locator('[data-picker="profile-interests-edit"] [data-picker-input]').fill('Kite surfing club');
    await page.waitForTimeout(150);
    check('without 0017: no headings and no "own interest" row', await page.locator('#profile-interests-edit-list :is(.b-listbox-heading, .b-option-add)').count() === 0);
    await ctx.close();
  }

  // Others see the bio through member_bio when they open the profile.
  {
    Object.assign(st, fresh({ matchIds: ['aaaaaaaa-aaaa-4aaa-8aaa-000000000001'], routes: { interest_node: { body: NODES }, 'rpc/member_bio': { body: 'Designer who runs every Sunday.' } } }));
    const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
    const page = await stub.open(ctx, { path: '/app.html?view=chat', errors });
    await page.waitForSelector('.chat-row [data-public-profile-id]');
    await page.locator('.chat-row-copy strong[data-public-profile-id]').first().click();
    await page.waitForSelector('#public-profile-modal .public-profile-bio');
    check('another member\'s bio shows on their profile', (await page.locator('#public-profile-modal .public-profile-bio').textContent()) === 'Designer who runs every Sunday.');
    await ctx.close();
  }
  check('no page errors', errors.length === 0, JSON.stringify(errors));
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
