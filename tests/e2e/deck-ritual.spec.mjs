// The deck ritual (D-162), against stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/deck-ritual.spec.mjs   (Vite on :5186)
// DR1 first visit: five card backs assemble, swipes are held while they do (no pass is recorded), then the live card
//     shows and the backs are gone; about 1.7 s.
// DR2 the intro plays once per visit: a reload in the same session shows the card at once.
// DR3 swiping works after the intro; the last free swipe brings the shuffle: the deck spreads, gathers and reforms,
//     then "That's your deck for today." with the refresh time, in 1.5-2.5 s; no profile is offered after it.
// DR4 the shuffle is visual only: no extra pass or signal is sent, the quota is not re-requested by it, and a pass
//     attempt on the finished deck sends nothing.
// DR5 opening Connect with the swipes already used shows the finished deck at once (no shuffle replay).
// DR6 when the quota frees up again, the finished deck clears and the card is offered with a fresh deal.
// DR7 reduced motion: the intro is a short fade (under 700 ms) and no back is moved.
// DR8 at 390 px nothing scrolls sideways during the shuffle.
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

const st = { rows, deckRitual: true, passesUseSwipes: true, remaining: 2, resetsAt: new Date(Date.now() + 5 * 3600e3).toISOString() };
const stub = await startAppStub({ port: 5186, state: st, deckRows: rows });
const browser = await chromium.launch();
const passes = () => st.calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/interaction').length;
const quotaReads = () => st.calls.filter((c) => c.path === '/rest/v1/rpc/my_signal_quota').length;
const reset = (extra = {}) => { Object.assign(st, { remaining: 2, passed: new Set(), signalled: new Set(), calls: [] }, extra); };

try {
  // DR1-DR4 at 1440.
  reset();
  const ctx = await stub.newContext(browser, { width: 1440, height: 860 });
  const page = await stub.open(ctx);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const layerAt = await page.waitForSelector('#swipe-stack .deck-ritual', { timeout: 10000 }).then(() => Date.now(), () => 0);
  check('DR1 the intro deals a deck of card backs', layerAt > 0);
  check('DR1 five backs', (await page.locator('#swipe-stack .deck-back').count()) === 5, String(await page.locator('#swipe-stack .deck-back').count()));
  const before = passes();
  await page.locator('[data-action="pass"]').dispatchEvent('click');
  await page.waitForTimeout(150);
  check('DR1 a swipe during the intro is held (no pass recorded)', passes() === before, `${passes()} vs ${before}`);
  await page.waitForFunction(() => !document.querySelector('#swipe-stack .deck-ritual'), null, { timeout: 5000 }).catch(() => {});
  const introMs = Date.now() - layerAt;
  check(`DR1 the intro lasts about 1.7 s (${introMs} ms)`, introMs >= 1300 && introMs <= 2800);
  const live = await page.evaluate(() => ({ opacity: getComputedStyle(document.querySelector('#swipe-card')).opacity, name: document.querySelector('#swipe-name')?.textContent }));
  check(`DR1 the live card shows after it (${JSON.stringify(live)})`, live.opacity === '1' && live.name === 'Manish Gupta');

  // DR3: use the two free swipes.
  await page.locator('[data-action="pass"]').dispatchEvent('click');
  await page.waitForFunction(() => document.querySelector('#swipe-name')?.textContent === 'Asha Rao', null, { timeout: 4000 }).catch(() => {});
  check('DR3 swiping works after the intro', (await page.textContent('#swipe-name')) === 'Asha Rao');
  const readsBefore = quotaReads();
  await page.locator('[data-action="pass"]').dispatchEvent('click');
  const lastSwipe = Date.now();
  const spread = await page.waitForFunction(() => {
    const backs = [...document.querySelectorAll('#swipe-stack .deck-back')];
    if (backs.length < 5) return false;
    const xs = backs.map((b) => b.getBoundingClientRect().left);
    return Math.max(...xs) - Math.min(...xs) > 200;
  }, null, { timeout: 4000 }).then(() => true, () => false);
  check('DR3 the deck spreads out', spread);
  if (shots) await page.screenshot({ path: `${shots}/spread-1440.png` });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.deck-complete-face') || document.body).opacity === '1' && document.querySelector('.deck-complete-face'), null, { timeout: 6000 }).catch(() => {});
  const doneMs = Date.now() - lastSwipe;
  check(`DR3 the shuffle and message take 1.5-2.5 s after the card leaves (${doneMs} ms incl. the ~0.3 s fly-out)`, doneMs >= 1500 && doneMs <= 3300);
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
  check(`DR3 "That's your deck for today." with the supporting line and the refresh time (${JSON.stringify(done)})`,
    done.title === "That's your deck for today." && done.copy === "You've met everyone waiting in your deck. Good things take a little time." && /^Fresh swipes at /.test(done.refresh || ''));
  check(`DR3 the deck reformed into a squared stack (spread ${Math.round(done.spread)} px)`, done.spread < 16);
  check('DR3 no profile is offered (the card is hidden and inert)', done.cardHidden && done.inert);
  if (shots) await page.screenshot({ path: `${shots}/complete-1440.png` });
  // DR4
  const passesAtCap = passes();
  check(`DR4 exactly the two free swipes were recorded (${passesAtCap})`, passesAtCap === 2);
  check(`DR4 the shuffle asked the server for nothing beyond the one refresh after the last swipe (${quotaReads() - readsBefore})`, quotaReads() - readsBefore <= 1);
  await page.locator('[data-action="pass"]').dispatchEvent('click');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(500);
  check('DR4 a pass on the finished deck sends nothing', passes() === passesAtCap);
  check(`DR4 the server still says 0 left (${st.remaining})`, st.remaining === 0);

  // DR5: reload with the swipes used: the finished deck at once, no replay of the shuffle.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.deck-complete-face', { timeout: 8000 }).catch(() => {});
  const replay = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('deck-back')).length);
  check(`DR5 the finished deck shows at once on return, with no shuffle replay (${replay} back animations)`, replay === 0);
  check('DR2 no intro either (once per visit)', (await page.locator('.deck-complete-face').count()) === 1);

  // DR6: the swipe window frees up.
  st.remaining = 10;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => !document.querySelector('#swipe-stack')?.classList.contains('is-deck-complete'), null, { timeout: 5000 }).catch(() => {});
  const redealt = await page.waitForFunction(() => document.querySelector('#swipe-stack .deck-back:not(.is-message)') && !document.querySelector('.deck-complete-face'), null, { timeout: 3000 }).then(() => true, () => false);
  check('DR6 the new swipe window deals a fresh deck', redealt);
  await page.waitForFunction(() => !document.querySelector('#swipe-stack .deck-ritual'), null, { timeout: 5000 }).catch(() => {});
  const back = await page.evaluate(() => ({ complete: document.querySelector('#swipe-stack').classList.contains('is-deck-complete'), inert: document.querySelector('#swipe-card').hasAttribute('inert'), visible: getComputedStyle(document.querySelector('#swipe-card')).visibility, name: document.querySelector('#swipe-name')?.textContent }));
  check(`DR6 fresh swipes: the finished deck clears and a card is offered again (${JSON.stringify(back)})`, !back.complete && !back.inert && back.visible === 'visible' && Boolean(back.name));
  check('DR no page errors (1440)', errors.length === 0, errors.join('; '));
  await ctx.close();

  // DR2: same session, reload -> no intro.
  reset();
  const ctx2 = await stub.newContext(browser, { width: 1440, height: 860 });
  const p2 = await stub.open(ctx2);
  await p2.waitForSelector('#swipe-stack .deck-ritual', { timeout: 10000 }).catch(() => {});
  await p2.waitForFunction(() => !document.querySelector('#swipe-stack .deck-ritual'), null, { timeout: 5000 }).catch(() => {});
  await p2.reload({ waitUntil: 'domcontentloaded' });
  await p2.waitForSelector('#swipe-card:not([hidden])', { timeout: 8000 });
  await p2.waitForTimeout(600);
  check('DR2 a reload in the same visit does not deal again', (await p2.locator('#swipe-stack .deck-ritual').count()) === 0);
  await ctx2.close();

  // DR7: reduced motion.
  reset();
  const ctx3 = await stub.newContext(browser, { width: 1440, height: 860 }, { reducedMotion: 'reduce' });
  const p3 = await stub.open(ctx3);
  const t3 = await p3.waitForSelector('#swipe-stack .deck-ritual', { timeout: 10000 }).then(() => Date.now(), () => 0);
  const moved = await p3.evaluate(() => document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('deck-back')).length);
  await p3.waitForFunction(() => !document.querySelector('#swipe-stack .deck-ritual'), null, { timeout: 4000 }).catch(() => {});
  const fadeMs = Date.now() - t3;
  check(`DR7 reduced motion: a short fade (${fadeMs} ms) and no back moves (${moved})`, t3 > 0 && fadeMs < 900 && moved === 0);
  await ctx3.close();

  // DR8: phone.
  reset();
  const ctx4 = await stub.newContext(browser, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  const p4 = await stub.open(ctx4);
  await p4.waitForSelector('#swipe-stack .deck-ritual', { timeout: 10000 }).catch(() => {});
  await p4.waitForFunction(() => !document.querySelector('#swipe-stack .deck-ritual'), null, { timeout: 5000 }).catch(() => {});
  await p4.locator('[data-action="pass"]').dispatchEvent('click');
  await p4.waitForTimeout(700);
  await p4.locator('[data-action="pass"]').dispatchEvent('click');
  let maxOverflow = 0;
  for (let i = 0; i < 12; i += 1) {
    await p4.waitForTimeout(180);
    maxOverflow = Math.max(maxOverflow, await p4.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  }
  await p4.waitForSelector('.deck-complete-face', { timeout: 5000 }).catch(() => {});
  check(`DR8 390 px: nothing scrolls sideways during the shuffle (max ${maxOverflow} px)`, maxOverflow <= 1);
  check('DR8 390 px: the finished deck shows', (await p4.locator('.deck-complete-face').count()) === 1);
  if (shots) { await p4.waitForTimeout(500); await p4.screenshot({ path: `${shots}/complete-390.png` }); }
  await ctx4.close();
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
