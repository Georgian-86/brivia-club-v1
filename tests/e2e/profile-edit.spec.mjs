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
    if (SHOTS) await page.locator('#profile-edit-modal .profile-edit-dialog').screenshot({ path: path.join(SHOTS, `edit-filled-${w}.png`) });
    await page.locator('.profile-edit-save').click();
    await page.waitForFunction(() => !document.querySelector('#profile-edit-modal'));
    const items = JSON.parse(posted('set_member_interests').at(-1)?.body || '{}').p_items || [];
    check(`${w}: the new interests save with 20 points, modes kept`, JSON.stringify(items.map((i) => i.interest_id)) === JSON.stringify(['food.cooking.home', 'arts.writing.poetry', 'sports.racket.badminton']) && items.reduce((a, i) => a + i.points, 0) === 20 && items[0].mode === 'play', JSON.stringify(items));
    const patches = st.calls.filter((c) => c.method === 'PATCH' && c.path === '/rest/v1/profiles').map((c) => JSON.parse(c.body || '{}'));
    check(`${w}: the bio and the experience are saved to the member's row`, patches.some((p) => p.bio === 'Home cook and poetry reader in Ludhiana.') && patches.some((p) => p.experience === '3–7 years'), JSON.stringify(patches.map((p) => ({ bio: p.bio, experience: p.experience }))));
    check(`${w}: looking for keeps the saved value and adds a suggestion and a typed one`, patches.some((p) => JSON.stringify(p.looking_for) === JSON.stringify(['Friends', 'Mentor', 'Supper club'])), JSON.stringify(patches.map((p) => p.looking_for)));
    check(`${w}: the About card shows the bio`, (await page.locator('#profile-bio .profile-bio-text').textContent()) === 'Home cook and poetry reader in Ludhiana.');

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
