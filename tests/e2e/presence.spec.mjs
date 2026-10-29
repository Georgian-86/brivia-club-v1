// Active status in chat (D-110, migration 0018): a connection seen in the last few minutes gets one green dot on their
// avatar in the chat list, nothing else (the open chat's head is unchanged); others get nothing. Settings has
// "Show when I'm active"; turning it off saves set_presence_visible(false) and the dots go. Before 0018 nothing shows,
// nothing breaks and the switch is hidden.
// PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/presence.spec.mjs   (Vite on :5185)
// PRESENCE_SHOTS=<dir> also saves the chat list and the open chat at 390 and 1440.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { axeViolations } from './a11y.mjs';
import { startAppStub, defaultDeckRows } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.PRESENCE_SHOTS || '';
const [ASHA, BILAL] = defaultDeckRows.map((row) => row.id);
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const fresh = (extra = {}) => ({ matchIds: [ASHA, BILAL], activeIds: [ASHA], presenceVisible: true, noPresence: false, touches: 0, ...extra });
const st = fresh();
const stub = await startAppStub({ port: 5185, state: st });
const browser = await chromium.launch();
const errors = [];
const shot = async (page, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); };
const posted = (name) => st.calls.filter((c) => c.method === 'POST' && c.path === `/rest/v1/rpc/${name}`);
const dots = (page) => page.evaluate(() => [...document.querySelectorAll('#chat-list .chat-row')].map((row) => ({ id: row.querySelector('[data-chat-id]')?.dataset.chatId, dot: Boolean(row.querySelector('.presence-dot')), sr: row.querySelector('.sr-only')?.textContent || '' })));

try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    Object.assign(st, fresh());
    st.calls.length = 0;
    const ctx = await stub.newContext(browser, { width: w, height: h }, w < 780 ? { isMobile: true, hasTouch: true } : {});
    const page = await stub.open(ctx, { path: '/app.html?view=chat', errors });
    page.setDefaultTimeout(8000);
    await page.waitForSelector('#chat-list .chat-row .presence-dot');
    const list = await dots(page);
    check(`${w}: only the active connection has a dot, named for screen readers (${JSON.stringify(list)})`,
      list.find((r) => r.id === ASHA)?.dot === true && list.find((r) => r.id === ASHA)?.sr === ', active now' && list.find((r) => r.id === BILAL)?.dot === false);
    check(`${w}: the app touched its own presence on load`, st.touches >= 1);
    const asked = JSON.parse(posted('connection_presence').at(-1)?.body || '{}').p_ids || [];
    check(`${w}: it asks about connections only (${JSON.stringify(asked)})`, asked.length === 2 && asked.includes(ASHA) && asked.includes(BILAL));
    await shot(page, `list-${w}.png`);
    // The chat list's older axe findings (a button inside the row button, the inbox tabs) predate D-110; the dot is
    // checked for what it could break: hidden from screen readers, nothing focusable inside it.
    const axe = await axeViolations(page, { include: '#chat-list .chat-row', rules: ['aria-hidden-focus', 'image-alt', 'color-contrast'] });
    check(`${w}: axe on the rows with the dot`, axe.length === 0, JSON.stringify(axe));

    // One dot only (founder, 2026-10-29): the open chat's head stays as it was.
    await page.locator(`#chat-list [data-chat-id="${ASHA}"]`).click();
    await page.waitForSelector('#chat-window:not([hidden]) #chat-name');
    await page.waitForTimeout(200);
    const head = await page.evaluate(() => ({ dots: document.querySelectorAll('#chat-window .presence-dot, #chat-presence').length, after: getComputedStyle(document.querySelector('#chat-avatar'), '::after').content, status: document.querySelector('#chat-status')?.textContent, total: document.querySelectorAll('.presence-dot').length }));
    check(`${w}: one dot in all, on the list avatar; the open chat's head is unchanged (${JSON.stringify(head)})`, head.dots === 0 && ['none', 'normal'].includes(head.after) && head.status === 'MEMBER / PRIVATE THREAD' && head.total === 1);
    await shot(page, `chat-${w}.png`);
    await ctx.close();
  }

  // Settings: the switch is on by default; off saves and the dots go at once.
  {
    Object.assign(st, fresh());
    const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
    const page = await stub.open(ctx, { path: '/app.html?view=profile', errors });
    await page.locator('#profile-settings-button').click();
    await page.locator('[data-profile-setting="notifications"]').click();
    await page.waitForSelector('[data-presence-setting]:not([hidden])');
    const row = await page.locator('[data-presence-setting]').innerText();
    check(`Settings shows "Show when I'm active", on (${JSON.stringify(row)})`, /SHOW WHEN I'M ACTIVE/.test(row) && await page.locator('#profile-presence-toggle').isChecked());
    await page.locator('[data-presence-setting]').click();
    await page.waitForFunction(() => /Active status is off/.test(document.querySelector('#notification-settings-feedback')?.textContent || ''));
    check('turning it off sends set_presence_visible(false)', JSON.parse(posted('set_presence_visible').at(-1)?.body || '{}').p_visible === false);
    await page.locator('.profile-settings-close').click();
    await page.evaluate(() => document.querySelector('[data-nav="chat"]')?.click());
    await page.waitForSelector('#chat-list .chat-row');
    await page.waitForTimeout(300);
    check('with the switch off, no dots', (await dots(page)).every((r) => !r.dot));
    await ctx.close();
  }

  // Before 0018: no dots, no errors, no toast, the switch hidden, the loop stops.
  {
    Object.assign(st, fresh({ noPresence: true }));
    st.calls.length = 0;
    const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
    const page = await stub.open(ctx, { path: '/app.html?view=chat', errors });
    await page.waitForSelector('#chat-list .chat-row');
    await page.waitForTimeout(500);
    check('before 0018: no dots and no connection_presence call', (await dots(page)).every((r) => !r.dot) && posted('connection_presence').length === 0);
    check('before 0018: no toast', !(await page.locator('#app-toast').textContent()).trim());
    await page.evaluate(() => document.querySelector('[data-nav="profile"]')?.click());
    await page.locator('#profile-settings-button').click();
    await page.locator('[data-profile-setting="notifications"]').click();
    await page.waitForTimeout(400);
    check('before 0018: the switch stays hidden', await page.locator('[data-presence-setting]').isHidden());
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
