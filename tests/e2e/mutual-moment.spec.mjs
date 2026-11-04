// D-165 N1: "It's mutual" shows for every new match, once per device: when my signal completes it, when the other
// member accepts (found by the ~30 s connection sync), and at the next load for a match made while I was away. Old
// matches on a device's first visit never replay. Run: PLAYWRIGHT_MODULE=... node tests/e2e/mutual-moment.spec.mjs
import { startAppStub, defaultDeckRows } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [ASHA, BILAL] = defaultDeckRows.map((row) => row.id);
const CHEN = 'cccccccc-cccc-4ccc-8ccc-000000000003';
const CHEN_ROW = { id: CHEN, name: 'Chen Rao', photo_url: null, cover_url: null, experience: 'Founder', skills: ['Chess'], looking_for: ['Friends'] };
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const st = { matchIds: [ASHA], routes: { 'rpc/get_candidates': { body: [CHEN_ROW] } } };
const stub = await startAppStub({ port: 5187, state: st });
const browser = await chromium.launch();
const errors = [];
const moment = (page) => page.locator('dialog.mutual-moment[open]');

try {
  const ctx = await stub.newContext(browser, { width: 390, height: 844 });
  const page = await stub.open(ctx, { path: '/app.html', errors });
  await page.waitForSelector('#swipe-card');
  await page.waitForTimeout(2500);
  check('first visit: an existing match does not replay', (await moment(page).count()) === 0);

  // The other member accepts (a match appears on the server): the sync finds it within ~30 s.
  st.matchIds.push(BILAL);
  await page.waitForSelector('dialog.mutual-moment[open] .mutual-title', { timeout: 40000 }).catch(() => {});
  const title = await moment(page).locator('.mutual-title').innerText().catch(() => '');
  check(`a match made by the other member shows the moment (${JSON.stringify(title)})`, /You and /.test(title) && /both said yes/.test(title));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.mutual-moment'));
  check('Escape closes it', (await moment(page).count()) === 0);

  // Reload: Bilal is already celebrated here; a match made while away (Chen) shows once.
  st.matchIds.push(CHEN);
  await page.reload();
  await page.waitForSelector('dialog.mutual-moment[open] .mutual-title', { timeout: 8000 }).catch(() => {});
  const away = await moment(page).locator('.mutual-title').innerText().catch(() => '');
  check(`a match made while away shows at the next load, for that person (${JSON.stringify(away)})`, away.includes('Chen'));
  await moment(page).locator('.mutual-later').click().catch(() => {});
  await page.reload();
  await page.waitForTimeout(3000);
  check('after that, a reload shows nothing', (await moment(page).count()) === 0);
  await ctx.close();
  check(`no page errors (${errors.join(' | ')})`, errors.length === 0);
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} failed` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
