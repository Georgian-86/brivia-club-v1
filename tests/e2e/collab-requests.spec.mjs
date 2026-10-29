// "See who wants to collaborate with you" (D-108): the notification panel shows one section with stacked faces, "N
// people want to connect" and Review; Review opens a sheet with one request at a time. Connect (button, right drag,
// ArrowRight) accepts and shows "You're connected." with Message; Not now (button, left drag, ArrowLeft) declines
// quietly; a failed answer keeps the card; the end reads "You're all caught up."; no dating-app words; axe clean.
// PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/collab-requests.spec.mjs   (Vite on :5183)
// COLLAB_SHOTS=<dir> also saves the panel, the sheet and the connected state at 390 and 1440.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { axeViolations } from './a11y.mjs';
import { startAppStub, defaultDeckRows } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.COLLAB_SHOTS || '';
const [ASHA, BILAL] = defaultDeckRows.map((row) => row.id);
const CARA = 'cccccccc-cccc-4ccc-8ccc-000000000003';
const ago = (m) => new Date(Date.now() - m * 6e4).toISOString();
const freshRequests = () => [
  { from_id: ASHA, note: 'Saw you play badminton at Kadavanthra. Want to start a weekend doubles group?', created_at: ago(5) },
  { from_id: BILAL, note: null, created_at: ago(30) },
  { from_id: CARA, note: 'Building a chess club for founders.', created_at: ago(90) },
];
const CARA_ROW = { id: CARA, name: 'Cara Quill', photo_url: null, cover_url: null, experience: 'Founder', skills: ['Chess'], looking_for: ['Cofounder'] };
const FORBIDDEN = /\b(match|matched|like|liked|pass|swipe|crush|heart|date|dating)\b/i;

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const st = { requests: freshRequests(), routes: { 'rpc/get_candidates': { body: [CARA_ROW] } } };
const stub = await startAppStub({ port: 5183, state: st });
const browser = await chromium.launch();
const errors = [];
const shot = async (page, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); };
const rpcCount = () => st.calls.filter((c) => c.path === '/rest/v1/rpc/respond_connection_request').length;

try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    Object.assign(st, { requests: freshRequests(), responses: [], matchIds: [], respondFail: false, calls: st.calls });
    const ctx = await stub.newContext(browser, { width: w, height: h }, w < 780 ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: '/app.html', errors });
    page.setDefaultTimeout(6000);
    await page.waitForFunction(() => !document.querySelector('#notification-badge')?.hidden);
    await page.locator('#app-notification-button').click();
    await page.waitForSelector('.notification-collab [data-collab-review]');
    const section = await page.locator('.notification-collab').evaluate((el) => ({ text: el.innerText, faces: el.querySelectorAll('.notification-collab-faces .notification-avatar').length }));
    check(`${w}: one section "See who wants to collaborate with you", 3 faces, "3 people want to connect" (${JSON.stringify(section)})`,
      /See who wants to collaborate with you/.test(section.text) && /3 people want to connect/.test(section.text) && section.faces === 3 && !/accept|decline/i.test(section.text));
    check(`${w}: no Accept / Decline buttons anywhere`, await page.locator('[data-request-respond]').count() === 0);
    await shot(page, `panel-${w}.png`);

    await page.locator('[data-collab-review]').click();
    await page.waitForSelector('dialog.collab-review[open] .collab-card');
    await page.waitForTimeout(450);  // the opening rise
    const first = await page.evaluate(() => {
      const d = document.querySelector('dialog.collab-review');
      const r = d.querySelector('.collab-panel').getBoundingClientRect();
      return { count: d.querySelector('.collab-count')?.textContent, name: d.querySelector('.collab-name')?.textContent, shared: [...d.querySelectorAll('.collab-shared li')].map((li) => li.textContent), note: d.querySelector('.collab-note-text')?.textContent, focus: document.activeElement?.dataset.collabDecide, panelOpen: document.querySelector('#app-notification-panel')?.matches(':popover-open'), bottom: Math.round(r.bottom), width: Math.round(r.width), text: d.innerText };
    });
    check(`${w}: the sheet shows "1 of 3", the name, shared interests and their note; focus on Connect (${JSON.stringify({ ...first, text: undefined })})`,
      first.count === '1 of 3' && first.name === 'Asha Band' && first.shared.includes('Badminton') && /weekend doubles/.test(first.note) && first.focus === 'connect' && !first.panelOpen);
    check(`${w}: no dating-app words in the sheet (${(first.text.match(FORBIDDEN) || [''])[0]})`, !FORBIDDEN.test(first.text));
    if (w < 780) check(`390: a bottom sheet, full width (${first.bottom}/${h}, ${first.width})`, Math.abs(first.bottom - h) <= 1 && first.width === w);
    else check(`1440: a centred card up to 440 px (${first.width})`, first.width <= 440 && first.bottom < h);
    const axe = await axeViolations(page, { include: 'dialog.collab-review' });
    check(`${w}: axe finds no violations in the sheet (${axe.join(' | ')})`, axe.length === 0);
    await shot(page, `sheet-${w}.png`);

    // Connect on Asha: the accept RPC, then "You're connected." with Message.
    await page.locator('dialog.collab-review [data-collab-decide="connect"]').click();
    await page.waitForSelector('dialog.collab-review [data-collab-message]');
    check(`${w}: Connect answers with p_accept true`, JSON.stringify(st.responses.at(-1)) === JSON.stringify({ p_from: ASHA, p_accept: true }));
    const done = await page.locator('dialog.collab-review .collab-state').innerText();
    check(`${w}: "You're connected." offers Message Asha (${JSON.stringify(done)})`, /You're connected\./.test(done) && /Message Asha/.test(done));
    await shot(page, `connected-${w}.png`);
    if (w < 780) {
      // Message: the sheet closes and Asha's chat opens.
      await page.locator('dialog.collab-review [data-collab-message]').click();
      await page.waitForFunction(() => !document.querySelector('dialog.collab-review') && !document.querySelector('#chat-window')?.hidden);
      check('390: Message opens the chat with Asha', (await page.locator('#chat-name').textContent()) === 'Asha Band');
      await page.locator('#app-notification-button').click();
      await page.locator('[data-collab-review]').click();
      await page.waitForSelector('dialog.collab-review[open] .collab-card');
    } else {
      await page.locator('dialog.collab-review [data-collab-next]').click();
    }

    // Bilal: a left drag past the threshold declines quietly.
    await page.waitForSelector(`dialog.collab-review .collab-card[data-from="${BILAL}"]`);
    const box = await page.locator('dialog.collab-review .collab-card').boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) await page.mouse.move(box.x + box.width / 2 - i * 20, y);
    await page.mouse.up();
    await page.waitForSelector(`dialog.collab-review .collab-card[data-from="${CARA}"]`);
    check(`${w}: a left drag declines with p_accept false (${JSON.stringify(st.responses.at(-1))})`, JSON.stringify(st.responses.at(-1)) === JSON.stringify({ p_from: BILAL, p_accept: false }));
    check(`${w}: no toast for a quiet decline`, !(await page.locator('#app-toast').textContent()).trim() || !/declin/i.test(await page.locator('#app-toast').textContent()));

    // Cara: a failed answer keeps the card and shows the toast; one RPC per tap even when tapped twice.
    st.respondFail = true;
    const before = rpcCount();
    await page.locator('dialog.collab-review [data-collab-decide="connect"]').click();
    await page.locator('dialog.collab-review [data-collab-decide="connect"]').click({ force: true, timeout: 300 }).catch(() => {});
    await page.waitForFunction(() => /could not be updated/.test(document.querySelector('#app-toast')?.textContent || ''));
    await page.waitForTimeout(300);
    const kept = await page.evaluate(() => ({ card: document.querySelector('dialog.collab-review .collab-card')?.dataset.from, enabled: !document.querySelector('[data-collab-decide="connect"]')?.disabled, count: document.querySelector('.collab-count')?.textContent }));
    check(`${w}: a failed Connect keeps the card, re-enables the buttons, one RPC (${JSON.stringify({ ...kept, rpcs: rpcCount() - before })})`, kept.card === CARA && kept.enabled && kept.count === (w < 780 ? '2 of 2' : '3 of 3') && rpcCount() - before === 1);
    st.respondFail = false;
    await page.keyboard.press('ArrowLeft');
    await page.waitForSelector('dialog.collab-review .collab-state h3');
    check(`${w}: ArrowLeft declines and the end reads "You're all caught up."`, (await page.locator('dialog.collab-review .collab-state h3').textContent()) === "You're all caught up." && JSON.stringify(st.responses.at(-1)) === JSON.stringify({ p_from: CARA, p_accept: false }));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.collab-review'));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ focus: document.activeElement?.id, badge: document.querySelector('#notification-badge')?.hidden }));
    check(`${w}: Escape closes, focus returns to the bell, the request count clears (${JSON.stringify(after)})`, after.focus === 'app-notification-button' && after.badge === true);
    await ctx.close();
  }

  // Reduced motion: the card fades instead of flying (no transform during the exit).
  Object.assign(st, { requests: freshRequests(), responses: [], matchIds: [] });
  const ctx = await stub.newContext(browser, { width: 1440, height: 900 }, { reducedMotion: 'reduce' });
  const page = await stub.open(ctx, { path: '/app.html', errors });
  await page.waitForFunction(() => !document.querySelector('#notification-badge')?.hidden);
  await page.locator('#app-notification-button').click();
  await page.locator('[data-collab-review]').click();
  await page.waitForSelector('dialog.collab-review[open] .collab-card');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(60);
  const motion = await page.evaluate(() => { const c = document.querySelector('.collab-card'); return { transform: c?.style.transform || '', opacity: c?.style.opacity }; });
  check(`reduced motion: the card fades, it does not fly (${JSON.stringify(motion)})`, motion.transform === '' && motion.opacity === '0');
  await ctx.close();
  check(`no uncaught page errors (${JSON.stringify(errors.slice(0, 3))})`, errors.length === 0);
} catch (error) {
  console.log(`FAIL crashed: ${error.stack || error.message}`);
  failed += 1;
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} failed` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
