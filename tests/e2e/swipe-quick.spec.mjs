// Quick swipes go through one after another (D-240, founder 2026-11-12: "why am I not able to swipe in one go"),
// stubbed Supabase. PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs node tests/e2e/swipe-quick.spec.mjs (:5267)
// SQ1 four left swipes 250 ms apart (each starting on the stack while the last card may still be flying out) pass four
//     cards, by touch on a phone and by mouse on a laptop, with normal and reduced motion.
// SQ2 a tap on the stack mid-flight (no drag) passes nothing more.
import { startAppStub } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const mk = (i) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-0000000026${String(i).padStart(2, '0')}`, name: `Person ${i}`, photo_url: null, cover_url: null, experience: 'Member', skills: ['Chess'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: [] });
const rows = Array.from({ length: 30 }, (_, i) => mk(i + 1));
const st = { rows, remaining: 30 };
const stub = await startAppStub({ port: 5267, state: st, deckRows: rows });
const browser = await chromium.launch();
const num = (name) => Number(String(name).replace(/\D/g, ''));
try {
  for (const [w, h, touch, motion] of [[390, 844, true, 'no-preference'], [390, 844, true, 'reduce'], [1440, 900, false, 'no-preference']]) {
    const tag = `${w} ${touch ? 'touch' : 'mouse'} ${motion}`;
    st.passed = new Set();
    const ctx = await stub.newContext(browser, { width: w, height: h }, { hasTouch: touch, isMobile: touch, reducedMotion: motion });
    const page = await stub.open(ctx, { path: '/app.html?view=home' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => document.querySelector('#swipe-name')?.textContent.trim());
    await page.waitForTimeout(4500);   // past the opening deal
    const cdp = touch ? await ctx.newCDPSession(page) : null;
    const box = await page.evaluate(() => { const r = document.querySelector('#swipe-stack').getBoundingClientRect(); return { cx: r.x + r.width / 2, y: r.y + r.height * 0.35, w: r.width }; });
    const swipeLeft = async () => {
      if (touch) {
        const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1 }];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(box.cx, box.y) });
        for (let i = 1; i <= 6; i += 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(box.cx - (box.w * 0.45 * i) / 6, box.y + i * 3) }); await page.waitForTimeout(10); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(box.cx, box.y); await page.mouse.down();
        for (let i = 1; i <= 8; i += 1) { await page.mouse.move(box.cx - (box.w * 0.6 * i) / 8, box.y + i); await page.waitForTimeout(12); }
        await page.mouse.up();
      }
    };
    const first = num(await page.textContent('#swipe-name'));
    for (let k = 0; k < 4; k += 1) { await swipeLeft(); await page.waitForTimeout(250); }
    await page.waitForTimeout(1200);
    const after = num(await page.textContent('#swipe-name'));
    check(`${tag} SQ1 four quick swipes pass four cards`, after - first === 4, `${first} -> ${after}`);
    // SQ2: a swipe, then a tap on the stack mid-flight: one card only.
    await swipeLeft();
    await page.waitForTimeout(120);
    if (touch) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(box.cx), y: Math.round(box.y), id: 2 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    else { await page.mouse.move(box.cx, box.y); await page.mouse.down(); await page.mouse.up(); }
    await page.waitForTimeout(1200);
    const tapped = num(await page.textContent('#swipe-name'));
    check(`${tag} SQ2 a tap mid-flight passes nothing more`, tapped - after === 1, `${after} -> ${tapped}`);
    check(`${tag} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
