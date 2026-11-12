// Edit, unsend and delete for me (D-157, 0046), against stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/message-actions.spec.mjs   (Vite on :5175)
// MA1 a long press (touch, 390 px) on my fresh message opens the menu: Reply (D-191), Copy, Edit, Unsend, Delete for me;
//     on theirs: Reply, Copy and Delete for me; on my 20-minute-old message no Edit. Escape closes it and focus returns to the bubble.
// MA2 Edit puts the text in the composer with the "Editing message" bar; Send calls edit_message, the bubble shows
//     the new text and "Edited"; no new message is inserted.
// MA3 Unsend asks once, then the bubble reads "You unsent a message" and the inbox row says so too.
// MA4 Delete for me asks once, then the bubble leaves the thread (desktop right-click opens the same menu).
// MA5 keyboard: Enter on a focused bubble opens the menu; arrows move; the items are 44 px tall.
// MA6 before 0046 (PGRST202): the action says "Editing and unsending open soon." and nothing changes.
// MA_SHOTS=<dir> saves the menu, the editing bar and the unsent bubble.
import { mkdirSync } from 'node:fs';
import { startAppStub, ME } from './app-stub.mjs';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000157';
const id = (n) => `0e460000-0000-4000-8000-00000000000${n}`;
const rows = [{ id: OTHER, name: 'Asha Rao', photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] }];
const at = (m) => new Date(Date.now() - m * 6e4).toISOString();
const seed = () => [
  { id: id(1), sender_id: ME, recipient_id: OTHER, body: 'An older note', created_at: at(20), delivered_at: at(19), read_at: at(18), edited_at: null, unsent_at: null },
  { id: id(2), sender_id: OTHER, recipient_id: ME, body: 'Coffee this week?', created_at: at(10), delivered_at: at(10), read_at: at(9), edited_at: null, unsent_at: null },
  { id: id(3), sender_id: ME, recipient_id: OTHER, body: 'Thursdya works', created_at: at(2), delivered_at: null, read_at: null, edited_at: null, unsent_at: null },
  { id: id(4), sender_id: ME, recipient_id: OTHER, body: 'Near the station?', created_at: at(1), delivered_at: null, read_at: null, edited_at: null, unsent_at: null },
];
const shots = process.env.MA_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const st = { rows, matchIds: [OTHER], messages: seed(), lastSeen: {} };
const stub = await startAppStub({ port: 5175, state: st, deckRows: rows });
const browser = await chromium.launch();
const openThread = async (viewport, extra = {}) => {
  const ctx = await stub.newContext(browser, viewport, extra);
  const page = await stub.open(ctx, { path: '/app.html?view=chat' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.chat-row-open', { timeout: 8000 });
  await page.locator('.chat-row-open', { hasText: 'Asha' }).click();
  await page.waitForSelector('#chat-messages .message[data-message-id]', { timeout: 8000 });
  await page.waitForTimeout(800);
  return { ctx, page, errors };
};
const bubble = (page, n) => page.locator(`#chat-messages .message[data-message-id="${id(n)}"]`);
// A touch long press: pointerdown, hold, pointerup (touch pointers, as a phone sends them).
const longPress = async (page, n) => {
  const box = await bubble(page, n).boundingBox();
  const x = box.x + box.width / 2; const y = box.y + box.height / 2;
  await page.evaluate(({ sel, x, y }) => {
    const el = document.querySelector(sel);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true }));
  }, { sel: `#chat-messages .message[data-message-id="${id(n)}"]`, x, y });
  await page.waitForTimeout(600);
  await page.evaluate(({ sel, x, y }) => document.querySelector(sel).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y })), { sel: `#chat-messages .message[data-message-id="${id(n)}"]`, x, y });
};
const menuItems = (page) => page.$$eval('.message-menu .message-menu-item[role="menuitem"]', (els) => els.map((el) => el.textContent.trim()));

try {
  // Phone: MA1-MA3.
  {
    const { ctx, page, errors } = await openThread({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
    await longPress(page, 3);
    check('MA1 long press on my fresh message lists Reply, Copy, Edit, Unsend, Delete for me', JSON.stringify(await menuItems(page)) === '["Reply","Copy","Edit","Unsend","Delete for me"]', JSON.stringify(await menuItems(page)));
    const inView = await page.$eval('.message-menu', (el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
    check('MA1 the menu stays inside the 390 px screen', inView);
    if (shots) await page.screenshot({ path: `${shots}/menu-390.png` });
    await page.keyboard.press('Escape');
    check('MA1 Escape closes the menu', await page.locator('.message-menu').count() === 0);
    check('MA1 focus returns to the bubble', await page.evaluate(() => document.activeElement?.dataset?.messageId) === id(3));
    await longPress(page, 2);
    check('MA1 their message: Reply, Copy and Delete for me', JSON.stringify(await menuItems(page)) === '["Reply","Copy","Delete for me"]', JSON.stringify(await menuItems(page)));
    await page.keyboard.press('Escape');
    await longPress(page, 1);
    check('MA1 my 20-minute-old message has no Edit', JSON.stringify(await menuItems(page)) === '["Reply","Copy","Unsend","Delete for me"]', JSON.stringify(await menuItems(page)));
    await page.keyboard.press('Escape');

    // MA2
    const sentBefore = (st.sent || []).length;
    await longPress(page, 3);
    await page.locator('.message-menu [data-message-action="edit"]').click();
    check('MA2 the composer holds the text', await page.inputValue('#chat-input') === 'Thursdya works');
    check('MA2 the Editing bar shows', await page.locator('#chat-edit-bar:not([hidden])').count() === 1);
    if (shots) await page.screenshot({ path: `${shots}/editing-390.png` });
    await page.fill('#chat-input', 'Thursday works');
    await page.locator('#chat-form button[type="submit"]').first().click();
    await page.waitForTimeout(500);
    check('MA2 edit_message was called with the new text', st.messageActions?.some((c) => c.fn === 'edit_message' && c.args.p_id === id(3) && c.args.p_body === 'Thursday works'), JSON.stringify(st.messageActions));
    check('MA2 the bubble shows the new text', (await bubble(page, 3).locator('.message-copy').textContent()) === 'Thursday works');
    check('MA2 the bubble says Edited', await bubble(page, 3).locator('.message-edited').count() === 1);
    check('MA2 the bar is gone and the composer is empty', await page.locator('#chat-edit-bar:not([hidden])').count() === 0 && await page.inputValue('#chat-input') === '');
    check('MA2 no new message was inserted', (st.sent || []).length === sentBefore);

    // MA3
    await longPress(page, 4);
    await page.locator('.message-menu [data-message-action="unsend"]').click();
    check('MA3 Unsend asks first', (await page.textContent('.message-menu-title')) === 'Unsend for everyone?');
    check('MA3 nothing is sent before the confirm', !st.messageActions.some((c) => c.fn === 'unsend_message'));
    await page.locator('.message-menu [data-message-confirm="unsend"]').click();
    await page.waitForTimeout(500);
    check('MA3 the bubble reads "You unsent a message"', (await bubble(page, 4).textContent()).includes('You unsent a message'));
    check('MA3 the bubble is marked unsent', await bubble(page, 4).evaluate((el) => el.classList.contains('is-unsent')));
    if (shots) await page.screenshot({ path: `${shots}/unsent-390.png` });
    await page.locator('#chat-back').click().catch(() => {});
    await page.waitForTimeout(300);
    const preview = await page.locator('.chat-row-open', { hasText: 'Asha' }).locator('.chat-row-copy span').last().textContent();
    check('MA3 the inbox row says "You unsent a message"', preview === 'You unsent a message', preview);
    check('MA phone: no page errors', errors.length === 0, errors.join('; '));
    await ctx.close();
  }
  // Desktop: MA4, MA5.
  {
    const { ctx, page, errors } = await openThread({ width: 1440, height: 900 });
    await bubble(page, 2).click({ button: 'right' });
    check('MA4 right-click opens the menu', await page.locator('.message-menu').count() === 1);
    await page.locator('.message-menu [data-message-action="delete"]').click();
    check('MA4 Delete for me asks first', (await page.textContent('.message-menu-title')) === 'Delete for you?');
    await page.locator('.message-menu [data-message-confirm="delete"]').click();
    await page.waitForTimeout(500);
    check('MA4 the message leaves the thread', await bubble(page, 2).count() === 0);
    check('MA4 delete_message_for_me was called', st.messageActions.some((c) => c.fn === 'delete_message_for_me' && c.args.p_id === id(2)));
    // MA5
    await bubble(page, 1).focus();
    await page.keyboard.press('Enter');
    check('MA5 Enter on a focused bubble opens the menu', await page.locator('.message-menu').count() === 1);
    const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
    await page.keyboard.press('ArrowDown');
    const second = await page.evaluate(() => document.activeElement?.textContent?.trim());
    check('MA5 arrows move through the items', first === 'Reply' && second === 'Copy', `${first} -> ${second}`);
    await page.waitForTimeout(250); // past the 0.14 s opening animation (it starts at 98% scale)
    const heights = await page.$$eval('.message-menu [role="menuitem"]', (els) => els.map((el) => el.getBoundingClientRect().height));
    check('MA5 every item is at least 44 px tall', heights.every((h) => h >= 44), JSON.stringify(heights));
    if (shots) await page.screenshot({ path: `${shots}/menu-1440.png` });
    await page.keyboard.press('Escape');
    check('MA desktop: no page errors', errors.length === 0, errors.join('; '));
    await ctx.close();
  }
  // MA6 before 0046.
  st.messages = seed(); st.noMessageActions = true; st.messageActions = [];
  {
    const { ctx, page, errors } = await openThread({ width: 1440, height: 900 });
    await bubble(page, 4).click({ button: 'right' });
    await page.locator('.message-menu [data-message-action="unsend"]').click();
    await page.locator('.message-menu [data-message-confirm="unsend"]').click();
    await page.waitForTimeout(500);
    const toast = await page.textContent('#app-toast');
    check('MA6 the toast says it opens soon', /Editing and unsending open soon\./.test(toast || ''), toast);
    check('MA6 the message is unchanged', (await bubble(page, 4).textContent()).includes('Near the station?'));
    check('MA6 no page errors', errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
