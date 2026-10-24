// The first-run deck tutorial and the compact deck (D-094), stubbed Supabase (Vite on :5184). Never touches a real
// Supabase project. At 1440 and 375 px:
// * the tutorial opens over the deck once a card is on screen, as a modal dialog with a heading, both gestures and
//   "Don't show this again"; axe finds nothing; GOT IT has focus;
// * while it is open the arrow keys answer nothing (no pass, no pitch sheet);
// * closed without the tick it stays away for the visit (reload) and comes back on the next visit (a new session);
// * closed with the tick it never comes back; Escape closes it too;
// * the deck shows no round Pass / Pitch buttons, the arrow keys still pass, and Tab reaches Pass / Pitch as a bar.
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/deck-tutorial.spec.mjs
// E2E_SCREENSHOTS=<dir> saves the tutorial at both widths.
import assert from 'node:assert/strict';
import path from 'node:path';
import { startAppStub } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const SHOTS = process.env.E2E_SCREENSHOTS || '';
const state = { deckTutorial: true };
const stub = await startAppStub({ port: 5184, state });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let failures = 0;
const check = async (name, fn) => { try { await fn(); console.log('PASS ', name); } catch (e) { failures++; console.log('FAIL ', name, e.message.replace(/\s+/g, ' ').slice(0, 1200)); } };
const errors = [];
const tutorialOpen = (page) => page.evaluate(() => Boolean(document.querySelector('dialog.deck-tutorial[open]')));
const waitTutorial = (page) => page.waitForSelector('dialog.deck-tutorial[open]', { timeout: 8000 }).then(() => true, () => false);
const freshVisit = async (page) => { await page.evaluate(() => sessionStorage.clear()); await page.reload({ waitUntil: 'domcontentloaded' }); };

try {
  for (const [tag, viewport] of [['1440', { width: 1440, height: 900 }], ['375', { width: 375, height: 812 }]]) {
    state.passed?.clear(); state.signalled?.clear();
    const ctx = await stub.newContext(browser, viewport);
    const page = await stub.open(ctx, { errors });
    await page.waitForSelector('#swipe-card .view-info-button', { timeout: 10000 });
    const opened = await waitTutorial(page);
    await check(`${tag}: the tutorial opens over the deck on a first visit`, () => assert.equal(opened, true));
    await page.waitForTimeout(400);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `deck-tutorial-${tag}.png`) });
    const look = await page.evaluate(() => {
      const d = document.querySelector('dialog.deck-tutorial');
      const r = d.getBoundingClientRect();
      return {
        modal: d.matches(':modal'), title: d.querySelector('#deck-tutorial-title')?.textContent, labelled: d.getAttribute('aria-labelledby'),
        steps: [...d.querySelectorAll('.deck-tutorial-step h3')].map((h) => h.textContent), skip: d.querySelector('.deck-tutorial-skip')?.textContent.trim(),
        checked: d.querySelector('input[name="hide"]').checked, focused: document.activeElement?.className,
        inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
        small: [...d.querySelectorAll('*')].filter((el) => el.childElementCount === 0 && el.textContent.trim() && el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) < 12).length,
      };
    });
    await check(`${tag}: a modal with both gestures and an unticked "Don't show this again", GOT IT focused, on screen (${JSON.stringify(look)})`, () => {
      assert.equal(look.modal, true); assert.equal(look.labelled, 'deck-tutorial-title'); assert.ok(look.title);
      assert.deepEqual(look.steps, ['Swipe left to pass', 'Swipe right to pitch']);
      assert.equal(look.skip, "Don't show this again"); assert.equal(look.checked, false);
      assert.equal(look.focused, 'deck-tutorial-done'); assert.equal(look.inView, true); assert.equal(look.small, 0);
    });
    const ax = await axeViolations(page, { include: 'dialog.deck-tutorial' });
    await check(`${tag}: axe on the tutorial (${ax.join(' | ')})`, () => assert.deepEqual(ax, []));
    const before = stub.calls.length;
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ name: document.querySelector('#swipe-name')?.textContent, pitch: !document.querySelector('#pitch-modal')?.hidden }));
    await check(`${tag}: arrow keys do nothing while it is open (${JSON.stringify(after)})`, () => {
      assert.equal(after.pitch, false);
      assert.equal(stub.calls.slice(before).filter((c) => /interaction|send_signal/.test(c.path)).length, 0);
    });
    await page.click('.deck-tutorial-done');
    await page.waitForTimeout(300);
    await check(`${tag}: GOT IT closes it`, async () => assert.equal(await tutorialOpen(page), false));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#swipe-card .view-info-button', { timeout: 10000 });
    await page.waitForTimeout(1500);
    await check(`${tag}: not again on a reload in the same visit`, async () => assert.equal(await tutorialOpen(page), false));
    await freshVisit(page);
    await check(`${tag}: back on the next visit when the box was not ticked`, async () => assert.equal(await waitTutorial(page), true));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await check(`${tag}: Escape closes it`, async () => assert.equal(await tutorialOpen(page), false));
    await freshVisit(page);
    await waitTutorial(page);
    await page.click('.deck-tutorial-skip');
    await page.click('.deck-tutorial-done');
    await page.waitForFunction(() => !document.querySelector('dialog.deck-tutorial'));
    const stored = await page.evaluate(() => localStorage.getItem('brivia-deck-tutorial'));
    await freshVisit(page);
    await page.waitForSelector('#swipe-card .view-info-button', { timeout: 10000 });
    await page.waitForTimeout(1500);
    await check(`${tag}: ticked, it never comes back (stored "${stored}")`, async () => { assert.equal(stored, 'hidden'); assert.equal(await tutorialOpen(page), false); });
    // The compact deck: no round buttons on screen; the arrow keys still pass; Tab reaches Pass / Pitch as a bar.
    const bar = await page.evaluate(() => { const b = document.querySelector('.swipe-actions').getBoundingClientRect(); return { w: b.width, h: b.height }; });
    await check(`${tag}: no round Pass / Pitch on screen (${JSON.stringify(bar)})`, () => assert.ok(bar.w <= 1 && bar.h <= 1));
    const first = await page.evaluate(() => document.querySelector('#swipe-name')?.textContent);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction((name) => document.querySelector('#swipe-name')?.textContent !== name, first, { timeout: 5000 }).catch(() => {});
    const second = await page.evaluate(() => document.querySelector('#swipe-name')?.textContent);
    await check(`${tag}: the left arrow still passes (${first} -> ${second})`, () => assert.notEqual(second, first));
    await page.focus('.swipe-pass');
    const shown = await page.evaluate(() => [...document.querySelectorAll('.swipe-actions button')].map((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { w: Math.round(r.width), on: r.top >= 0 && r.bottom <= innerHeight, top: el.contains(hit) }; }));
    await check(`${tag}: keyboard focus shows Pass / Pitch as 56 px targets on top (${JSON.stringify(shown)})`, () => shown.forEach((b) => { assert.ok(b.w >= 56); assert.ok(b.on); assert.ok(b.top); }));
    await ctx.close();
  }
  await check('no page errors', () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  await stub.close();
}
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
