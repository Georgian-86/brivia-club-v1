// Crossing paths (D-119, migration 0021): a quiet alert when a connection is nearby, only for members who turned it on.
// Checks: the pulse sends a coarse position in a POST body; the alert row ("<name> is nearby", the shared interest, Say
// hi, Mute) in the notification panel, the bell badge and the toast; Say hi opens the chat; Mute saves and the row goes;
// the Settings switch goes through the explainer (Not now changes nothing, Turn on saves and pulses, off saves);
// location not allowed: no pulse, the live cell is cleared and Settings says "Paused"; before 0021 the switch is hidden.
// PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/crossing-paths.spec.mjs   (Vite on :5187)
// NEARBY_SHOTS=<dir> also saves the panel, the explainer and the paused setting at 390 and 1440.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { axeViolations } from './a11y.mjs';
import { startAppStub, defaultDeckRows } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.NEARBY_SHOTS || '';
const [ASHA, BILAL] = defaultDeckRows.map((row) => row.id);
const BENGALURU = { latitude: 12.9756, longitude: 77.605 };
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const alertRow = () => ({ other_id: ASHA, created_at: new Date().toISOString(), shared_interest: 'Badminton' });
const fresh = (nearby) => ({ matchIds: [ASHA, BILAL], noPresence: true, nearby });
const st = fresh(null);
const stub = await startAppStub({ port: 5187, state: st });
const browser = await chromium.launch();
const errors = [];
const shot = async (page, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); };
const posted = (name) => st.calls.filter((c) => c.method === 'POST' && c.path === `/rest/v1/rpc/${name}`);
const located = { geolocation: BENGALURU };
// The stub grants clipboard permissions for its origin, which replaces context-wide grants: grant geolocation after.
const newContext = async (viewport, options = {}, { allow = true } = {}) => {
  const ctx = await stub.newContext(browser, viewport, options);
  if (allow) await ctx.grantPermissions(['geolocation', 'clipboard-read', 'clipboard-write'], { origin: stub.url });
  return ctx;
};
const openSettings = async (page) => {
  await page.evaluate(() => document.querySelector('[data-nav="profile"]')?.click());
  await page.locator('#profile-settings-button').click();
  await page.locator('[data-profile-setting="notifications"]').click();
};

try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    Object.assign(st, fresh({ enabled: true, alerts: [alertRow()] }));
    st.calls.length = 0;
    const ctx = await newContext({ width: w, height: h }, { ...located, ...(w < 780 ? { isMobile: true, hasTouch: true } : {}) });
    const page = await stub.open(ctx, { path: '/app.html?view=chat', errors });
    page.setDefaultTimeout(8000);
    await page.waitForFunction(() => Number(document.querySelector('#notification-badge')?.textContent || 0) >= 1);
    const pulse = posted('nearby_pulse')[0];
    const body = JSON.parse(pulse?.body || '{}');
    check(`${w}: the position goes to nearby_pulse in a POST body, never the URL`, Math.abs(body.p_lat - BENGALURU.latitude) < 1e-6 && !/12\.97/.test(pulse?.path + (pulse?.url || '')));
    const quiet = await page.evaluate(() => { const hour = new Date().getHours(); return hour >= 22 || hour < 7; });
    const toast = (await page.locator('#app-toast').textContent()).trim();
    check(`${w}: a toast says who is nearby, unless it is quiet hours (${JSON.stringify(toast)})`, quiet ? !/nearby/.test(toast) : toast === 'Asha Band is nearby. Say hi?');
    await page.locator('#app-notification-button').click();
    await page.waitForSelector('.notification-nearby');
    const row = await page.locator('.notification-nearby').innerText();
    check(`${w}: the panel row names the connection and the shared interest, never a place or distance (${JSON.stringify(row)})`,
      /Asha Band is nearby/.test(row) && /You both love badminton/.test(row) && /Say hi/i.test(row) && !/km|metres|Pune|Bengaluru/i.test(row));
    const targets = await page.evaluate(() => [...document.querySelectorAll('.notification-nearby button')].map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    check(`${w}: both actions are at least 44 px (${targets})`, targets.length === 2 && targets.every((t) => t >= 44));
    const axe = await axeViolations(page, { include: '.notification-nearby' });
    check(`${w}: axe on the alert row`, axe.length === 0, JSON.stringify(axe));
    await shot(page, `panel-${w}.png`);
    check(`${w}: opening the panel marks the alert seen (badge back to 0)`, await page.evaluate(() => document.querySelector('#notification-badge')?.hidden === true));
    await page.locator('[data-nearby-hi]').click();
    await page.waitForSelector('#chat-window:not([hidden]) #chat-name');
    check(`${w}: Say hi opens the chat with that connection`, (await page.locator('#chat-name').textContent()).includes('Asha'));
    await ctx.close();
  }

  // Mute: saves, the row goes.
  {
    Object.assign(st, fresh({ enabled: true, alerts: [alertRow()] }));
    st.calls.length = 0;
    const ctx = await newContext({ width: 1440, height: 900 }, located);
    const page = await stub.open(ctx, { path: '/app.html?view=chat', errors });
    await page.waitForFunction(() => Number(document.querySelector('#notification-badge')?.textContent || 0) >= 1);
    await page.locator('#app-notification-button').click();
    await page.locator('[data-nearby-mute]').click();
    await page.waitForFunction(() => !document.querySelector('.notification-nearby'));
    check('Mute sends set_nearby_muted(Asha, true) and the row goes', JSON.parse(posted('set_nearby_muted').at(-1)?.body || '{}').p_other === ASHA);
    await ctx.close();
  }

  // Settings: off by default; Not now changes nothing; Turn on saves and pulses; off saves.
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    Object.assign(st, fresh({ enabled: false, alerts: [] }));
    st.calls.length = 0;
    const ctx = await newContext({ width: w, height: h }, { ...located, ...(w < 780 ? { isMobile: true, hasTouch: true } : {}) });
    const page = await stub.open(ctx, { path: '/app.html?view=profile', errors });
    await openSettings(page);
    await page.waitForSelector('[data-nearby-setting]:not([hidden])');
    check(`${w}: Settings shows "Crossing paths", off by default`, /CROSSING PATHS/.test(await page.locator('[data-nearby-setting]').innerText()) && !(await page.locator('#profile-nearby-toggle').isChecked()));
    check(`${w}: nothing is sent while off`, posted('nearby_pulse').length === 0);
    await page.locator('[data-nearby-setting]').click();
    await page.waitForSelector('#crossing-paths-explainer');
    const text = await page.locator('#crossing-paths-explainer').innerText();
    check(`${w}: the explainer says who sees it, what they see and how to turn it off`, /Only connections/.test(text) && /Never your exact place/.test(text) && /Turn it off/.test(text));
    const axe = await axeViolations(page, { include: '#crossing-paths-explainer' });
    check(`${w}: axe on the explainer`, axe.length === 0, JSON.stringify(axe));
    await shot(page, `explainer-${w}.png`);
    await page.locator('[data-nearby-later]').click();
    check(`${w}: Not now leaves it off and saves nothing`, !(await page.locator('#profile-nearby-toggle').isChecked()) && posted('set_nearby_enabled').length === 0);
    await page.locator('[data-nearby-setting]').click();
    await page.locator('[data-nearby-confirm]').click();
    await page.waitForFunction(() => /Crossing paths is on/.test(document.querySelector('#notification-settings-feedback')?.textContent || ''));
    await page.waitForTimeout(300);
    check(`${w}: Turn on saves set_nearby_enabled(true) and sends a position`, JSON.parse(posted('set_nearby_enabled').at(-1)?.body || '{}').p_enabled === true && posted('nearby_pulse').length >= 1 && await page.locator('#profile-nearby-toggle').isChecked());
    await page.locator('[data-nearby-setting]').click();
    await page.waitForFunction(() => /Crossing paths is off/.test(document.querySelector('#notification-settings-feedback')?.textContent || ''));
    check(`${w}: off saves set_nearby_enabled(false)`, JSON.parse(posted('set_nearby_enabled').at(-1)?.body || '{}').p_enabled === false);
    await ctx.close();
  }

  // Location not allowed: no pulse, the live cell is cleared, Settings says Paused, no toast.
  {
    Object.assign(st, fresh({ enabled: true, alerts: [] }));
    st.calls.length = 0;
    const ctx = await newContext({ width: 390, height: 844 }, { isMobile: true, hasTouch: true }, { allow: false });
    const page = await stub.open(ctx, { path: '/app.html?view=profile', errors });
    await page.waitForTimeout(800);
    check('location not allowed: no position is sent and the live cell is cleared', posted('nearby_pulse').length === 0 && (st.nearby.cleared || 0) >= 1);
    await openSettings(page);
    await page.waitForSelector('[data-nearby-setting]:not([hidden])');
    await page.waitForFunction(() => /^Paused/.test(document.querySelector('[data-nearby-status]')?.textContent || ''));
    check('Settings shows the Paused line', /^Paused/.test(await page.locator('[data-nearby-status]').textContent()));
    await shot(page, 'paused-390.png');
    await ctx.close();
  }

  // Before 0021: the switch stays hidden and nothing breaks.
  {
    Object.assign(st, fresh(null));
    st.calls.length = 0;
    const ctx = await newContext({ width: 1440, height: 900 }, located);
    const page = await stub.open(ctx, { path: '/app.html?view=profile', errors });
    await openSettings(page);
    await page.waitForTimeout(400);
    check('before 0021: the switch stays hidden and nothing is sent', await page.locator('[data-nearby-setting]').isHidden() && posted('nearby_pulse').length === 0);
    await ctx.close();
  }
  check(`no uncaught page errors (${JSON.stringify(errors.slice(0, 3))})`, errors.filter((e) => !/404|PGRST202/.test(e)).length === 0);
} catch (error) {
  console.log(`FAIL crashed: ${error.stack || error.message}`);
  failed += 1;
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} failed` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
