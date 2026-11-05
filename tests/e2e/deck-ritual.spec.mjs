// The deck ritual's daily-limit shuffle (D-179, D-180), against stubbed Supabase. Connect opens with the D-164 deal
// (deck-intro.js); this spec covers what happens when the day's free swipes run out.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/deck-ritual.spec.mjs   (Vite on :5186)
// DR1 the deck opens with the D-164 deal, and swiping works after it.
// DR2 the last free swipe brings the shuffle once its card has left: the deck fans, riffles and reforms, then "That's
//     your deck for today." with the refresh time; no profile is offered after it (the card is hidden and inert).
// DR3 the shuffle is visual only: exactly the free swipes are recorded, a pass on the finished deck sends nothing.
// DR4 opening Connect with the swipes already used shows the finished deck at once (no shuffle replay).
// DR5 when the quota frees up again, the finished deck clears and the card is offered again (dealt by D-164).
// DR6 reduced motion: the finished deck appears by a short fade (no back is moved).
// DR7 at 390 px nothing scrolls sideways during the shuffle.
// DR_SHOTS=<dir> saves frames.
import { mkdirSync } from 'node:fs';
import { startAppStub } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const mk = (n, name) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-0000000004${String(n).padStart(2, '0')}`, name, photo_url: null, cover_url: null, experience: 'X', skills: ['Chess', 'Guitar'], looking_for: [], distance_band: '~3 km', shared_interests: ['Chess'] });
const rows = [mk(1, 'Manish Gupta'), mk(2, 'Asha Rao'), mk(3, 'Ravi Menon'), mk(4, 'Isha Shah'), mk(5, 'Kabir Das')];
const shots = process.env.DR_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const st = { rows, passesUseSwipes: true, dailyLimit: 10, remaining: 2, resetsAt: new Date(Date.now() + 5 * 3600e3).toISOString() };
const stub = await startAppStub({ port: 5186, state: st, deckRows: rows });
const browser = await chromium.launch();
const passes = () => st.calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/interaction').length;
const reset = (extra = {}) => { Object.assign(st, { remaining: 2, passed: new Set(), signalled: new Set(), calls: [] }, extra); };
const settled = (page) => page.waitForFunction(() => document.querySelector('#swipe-card:not([hidden]) #swipe-name')?.textContent
  && !document.querySelector('#swipe-stack')?.classList.contains('is-intro'), null, { timeout: 10000 }).then(() => true, () => false);
const backAnimations = (page) => page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('deck-back')).length);

try {
  reset();
  const ctx = await stub.newContext(browser, { width: 1440, height: 860 });
  const page = await stub.open(ctx);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  check('DR1 the deck opens (the D-164 deal), and no ritual intro runs', await settled(page) && (await page.locator('#swipe-stack .deck-ritual').count()) === 0);
  await page.locator('[data-action="pass"]').dispatchEvent('click');
  await page.waitForFunction(() => document.querySelector('#swipe-name')?.textContent === 'Asha Rao', null, { timeout: 4000 }).catch(() => {});
  check('DR1 swiping works', (await page.textContent('#swipe-name')) === 'Asha Rao');
  await page.locator('[data-action="pass"]').dispatchEvent('click');
  const lastSwipe = Date.now();
  const spread = await page.waitForFunction(() => {
    const backs = [...document.querySelectorAll('#swipe-stack .deck-back')];
    if (backs.length < 5) return false;
    const xs = backs.map((b) => b.getBoundingClientRect().left);
    return Math.max(...xs) - Math.min(...xs) > 200;
  }, null, { timeout: 4000 }).then(() => true, () => false);
  check('DR2 the deck fans out', spread);
  if (shots) await page.screenshot({ path: `${shots}/spread-1440.png` });
  await page.waitForFunction(() => document.querySelector('.deck-complete-face') && getComputedStyle(document.querySelector('.deck-complete-face')).opacity === '1', null, { timeout: 6000 }).catch(() => {});
  const doneMs = Date.now() - lastSwipe;
  check(`DR2 the fast shuffle and message are done within 2.5 s of the last swipe (${doneMs} ms incl. the card's exit)`, doneMs >= 1000 && doneMs <= 2500);
  const done = await page.evaluate(() => {
    const backs = [...document.querySelectorAll('#swipe-stack .deck-back')].map((b) => b.getBoundingClientRect());
    return {
      title: document.querySelector('.deck-complete-title')?.textContent,
      copy: document.querySelector('.deck-complete-copy')?.textContent,
      refresh: document.querySelector('.deck-complete-refresh')?.textContent,
      spread: Math.max(...backs.map((r) => r.left)) - Math.min(...backs.map((r) => r.left)),
      cardHidden: getComputedStyle(document.querySelector('#swipe-card')).visibility === 'hidden',
      inert: document.querySelector('#swipe-card').hasAttribute('inert'),
    };
  });
  check(`DR2 "That's your deck for today." with the supporting line and the refresh time (${JSON.stringify(done)})`,
    done.title === "That's your deck for today." && done.copy === "You've met everyone waiting in your deck. Good things take a little time." && /^Fresh swipes at /.test(done.refresh || ''));
  check(`DR2 the deck reformed into a squared stack (spread ${Math.round(done.spread)} px)`, done.spread < 16);
  check('DR2 no profile is offered (the card is hidden and inert)', done.cardHidden && done.inert);
  if (shots) await page.screenshot({ path: `${shots}/complete-1440.png` });
  const atCap = passes();
  check(`DR3 exactly the two free swipes were recorded (${atCap})`, atCap === 2);
  await page.locator('[data-action="pass"]').dispatchEvent('click');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(500);
  check('DR3 a pass on the finished deck sends nothing', passes() === atCap && st.remaining === 0);
  // DR4
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.deck-complete-face', { timeout: 8000 }).catch(() => {});
  check(`DR4 the finished deck shows at once on return (${await backAnimations(page)} back animations)`, (await page.locator('.deck-complete-face').count()) === 1 && (await backAnimations(page)) === 0);
  // DR5
  st.remaining = 10;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => !document.querySelector('#swipe-stack')?.classList.contains('is-deck-complete'), null, { timeout: 5000 }).catch(() => {});
  const back = await page.evaluate(() => ({ complete: document.querySelector('#swipe-stack').classList.contains('is-deck-complete'), inert: document.querySelector('#swipe-card').hasAttribute('inert'), name: document.querySelector('#swipe-name')?.textContent, ritual: Boolean(document.querySelector('#swipe-stack .deck-ritual')) }));
  check(`DR5 fresh swipes: the finished deck clears and a card is offered again (${JSON.stringify(back)})`, !back.complete && !back.inert && Boolean(back.name) && !back.ritual);
  check('DR no page errors (1440)', errors.length === 0, errors.join('; '));
  await ctx.close();

  // DR6
  reset({ remaining: 0 });
  const ctx3 = await stub.newContext(browser, { width: 1440, height: 860 }, { reducedMotion: 'reduce' });
  const p3 = await stub.open(ctx3);
  await p3.waitForSelector('.deck-complete-face', { timeout: 8000 }).catch(() => {});
  check('DR6 reduced motion: the finished deck appears, no back moves', (await p3.locator('.deck-complete-face').count()) === 1 && (await backAnimations(p3)) === 0);
  await ctx3.close();

  // DR7
  reset();
  const ctx4 = await stub.newContext(browser, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  const p4 = await stub.open(ctx4);
  await settled(p4);
  await p4.locator('[data-action="pass"]').dispatchEvent('click');
  await p4.waitForTimeout(700);
  await p4.locator('[data-action="pass"]').dispatchEvent('click');
  let maxOverflow = 0;
  for (let i = 0; i < 12; i += 1) {
    await p4.waitForTimeout(150);
    maxOverflow = Math.max(maxOverflow, await p4.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  }
  await p4.waitForSelector('.deck-complete-face', { timeout: 5000 }).catch(() => {});
  check(`DR7 390 px: nothing scrolls sideways during the shuffle (max ${maxOverflow} px)`, maxOverflow <= 1);
  check('DR7 390 px: the finished deck shows', (await p4.locator('.deck-complete-face').count()) === 1);
  if (shots) { await p4.waitForTimeout(400); await p4.screenshot({ path: `${shots}/complete-390.png` }); }
  await ctx4.close();
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
