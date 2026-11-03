// D-137: the Brivia sound kit in the app. Counts real Web Audio playback (buffer starts) per cue: nothing before the
// first gesture; one pass cue per left swipe (button, ← key or drag); one pitch cue per right swipe, none again when the
// pitched card leaves; nothing with Sounds off; a report's card leaves silently; Settings has the switch and a volume.
// PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/sounds.spec.mjs   (Vite on :5196)
import { startAppStub, PHOTO } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const row = (n, name) => ({ id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${n}`, name, photo_url: PHOTO(`aaaaaaaa-aaaa-4aaa-8aaa-00000000000${n}`), cover_url: null, experience: 'Designer', skills: ['Chess'], looking_for: ['Friends'], distance_band: '~3 km', shared_interests: ['Chess'] });
const rows = [row(1, 'Asha One'), row(2, 'Bilal Two'), row(3, 'Cara Three'), row(4, 'Dev Four'), row(5, 'Esha Five'), row(6, 'Faiz Six')];
const st = { rows };
const stub = await startAppStub({ port: 5196, state: st });
const browser = await chromium.launch();
const errors = [];
// Every buffer started on an AudioContext, named by its length (notify 2.0 s, pass 1.3 s, pitch 1.2 s).
const instrument = () => {
  window.__cues = [];
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    const d = this.buffer?.duration || 0;
    if (!(this.context instanceof OfflineAudioContext) && d > 0.5) window.__cues.push(d > 1.6 ? 'notify' : d > 1.25 ? 'pass' : 'pitch');
    return start.apply(this, args);
  };
};
const cues = (page) => page.evaluate(() => [...window.__cues]);
const name = (page) => page.locator('#swipe-name').textContent();
const nextCard = async (page, before) => page.waitForFunction((b) => document.querySelector('#swipe-name')?.textContent !== b, before, { timeout: 5000 });

try {
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    st.passed = new Set(); st.signalled = new Set();
    const ctx = await stub.newContext(browser, { width: w, height: h }, mobile ? { isMobile: true, hasTouch: true } : {});
    await ctx.addInitScript(instrument);
    await ctx.addInitScript(() => { try { sessionStorage.setItem('brivia-deck-tutorial-seen', '1'); } catch {} });
    const page = await stub.open(ctx, { path: '/app.html', errors });
    page.setDefaultTimeout(6000);
    await page.waitForSelector('#swipe-name:not(:empty)');
    check(`${w}: nothing plays before a gesture`, (await cues(page)).length === 0, JSON.stringify(await cues(page)));
    // The first real gesture unlocks audio and pre-renders the cues.
    if (mobile) await page.touchscreen.tap(w / 2, 4); else await page.mouse.click(5, 5);
    await page.waitForTimeout(400);
    const tutorial = page.locator('[data-deck-tutorial] button, .deck-tutorial button').first();
    if (await tutorial.isVisible().catch(() => false)) { await tutorial.click(); await page.waitForTimeout(300); }
    const base = (await cues(page)).length;

    let before = await name(page);
    await page.locator('[data-action="pass"]').dispatchEvent('click');
    await nextCard(page, before);
    check(`${w}: Pass button → one pass cue`, JSON.stringify((await cues(page)).slice(base)) === '["pass"]', JSON.stringify(await cues(page)));

    before = await name(page);
    await page.locator('#swipe-card').focus();
    await page.keyboard.press('ArrowLeft');
    await nextCard(page, before);
    check(`${w}: ← key → one more pass cue`, JSON.stringify((await cues(page)).slice(base)) === '["pass","pass"]', JSON.stringify(await cues(page)));

    // A left drag.
    before = await name(page);
    const box = await page.locator('#swipe-card').boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    for (let i = 1; i <= 14; i += 1) await page.mouse.move(box.x + box.width / 2 - i * 22, y);
    await page.mouse.up();
    await nextCard(page, before);
    check(`${w}: left drag → one more pass cue`, JSON.stringify((await cues(page)).slice(base)) === '["pass","pass","pass"]', JSON.stringify(await cues(page)));

    // Right: the pitch cue when the sheet opens, and not again when the pitched card leaves.
    before = await name(page);
    await page.locator('[data-action="like"]').dispatchEvent('click');
    await page.waitForSelector('#pitch-modal:not([hidden])');
    check(`${w}: Pitch → one pitch cue`, JSON.stringify((await cues(page)).slice(base + 3)) === '["pitch"]', JSON.stringify(await cues(page)));
    await page.waitForTimeout(450);
    await page.locator('#pitch-modal .pitch-no-note').click();
    await nextCard(page, before);
    await page.waitForTimeout(300);
    check(`${w}: the pitched card leaves without a second cue`, JSON.stringify((await cues(page)).slice(base + 3)) === '["pitch"]', JSON.stringify(await cues(page)));

    // Sounds off: swipes are silent.
    await page.evaluate(() => localStorage.setItem('brivia-notify-sound', 'off'));
    before = await name(page);
    await page.locator('[data-action="pass"]').dispatchEvent('click');
    await nextCard(page, before);
    check(`${w}: Sounds off → silent`, (await cues(page)).length === base + 4, JSON.stringify(await cues(page)));
    await page.evaluate(() => localStorage.removeItem('brivia-notify-sound'));

    // Settings: one SOUNDS switch and a SOUND VOLUME slider; moving it saves and previews the notification cue once.
    await page.evaluate(() => document.querySelector('[data-nav="profile"]')?.click());
    await page.locator('#profile-settings-button').click();
    await page.locator('[data-profile-setting="notifications"]').click();
    await page.waitForSelector('#profile-sound-volume');
    const set = await page.evaluate(() => ({ on: document.querySelector('#profile-sound-toggle').checked, vol: document.querySelector('#profile-sound-volume').value, label: document.querySelector('[data-sound-volume-value]').textContent }));
    check(`${w}: Settings shows Sounds on and the volume at 70% (${JSON.stringify(set)})`, set.on && set.vol === '70' && set.label === '70%');
    const n0 = (await cues(page)).length;
    await page.locator('#profile-sound-volume').fill('40');
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({ stored: localStorage.getItem('brivia-sound-volume'), label: document.querySelector('[data-sound-volume-value]').textContent }));
    check(`${w}: the volume saves (${JSON.stringify(after)}) and previews once`, after.stored === '40' && after.label === '40%' && JSON.stringify((await cues(page)).slice(n0)) === '["notify"]', JSON.stringify(await cues(page)));
    if (process.env.SOUND_SHOTS) await page.locator('#profile-notification-settings-modal').screenshot({ path: `${process.env.SOUND_SHOTS}/settings-${w}.png` });
    await page.locator('#profile-sound-toggle').evaluate((el) => el.click());
    check(`${w}: Sounds off disables the volume`, await page.locator('#profile-sound-volume').isDisabled());
    check(`${w}: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
