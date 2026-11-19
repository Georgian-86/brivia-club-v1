// Message reactions (D-244, 0075), against stubbed Supabase.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/message-reactions.spec.mjs   (Vite on :5176)
// RX1 reactions read with the thread show as chips under the bubbles; mine is marked (aria-pressed).
// RX2 a long press opens the menu with six quick reactions and "+"; a press reacts at once and calls react_to_message.
// RX3 a press on my chip removes it; a press on theirs reacts with the same emoji.
// RX4 "+" opens every emoji with search ("chess" finds ♟️); a pick reacts; Escape closes it and focus returns to the bubble.
// RX5 no axe violations in the menu, the chips or the picker; no page errors.
// RX6 before 0075 (PGRST202): no reaction row in the menu.
// RX_SHOTS=<dir> saves the menu, the chips and the picker.
import { mkdirSync } from 'node:fs';
import { startAppStub, ME } from './app-stub.mjs';
import { axeViolations } from './a11y.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000244';
const id = (n) => `0e750000-0000-4000-8000-00000000000${n}`;
const rows = [{ id: OTHER, name: 'Vinit Rao', photo_url: null, cover_url: null, experience: 'X', skills: [], looking_for: [], distance_band: '~3 km', shared_interests: [] }];
const at = (m) => new Date(Date.now() - m * 6e4).toISOString();
const messages = [
  { id: id(1), sender_id: ME, recipient_id: OTHER, body: 'Chess tonight?', created_at: at(20), delivered_at: at(19), read_at: at(18), edited_at: null, unsent_at: null },
  { id: id(2), sender_id: OTHER, recipient_id: ME, body: 'Sure, 8 pm at the cafe', created_at: at(10), delivered_at: at(10), read_at: at(9), edited_at: null, unsent_at: null },
  { id: id(3), sender_id: OTHER, recipient_id: ME, body: 'Bring the clock', created_at: at(2), delivered_at: at(2), read_at: null, edited_at: null, unsent_at: null },
];
const reaction = (n, who, emoji, m = 5) => ({ message_id: id(n), member_id: who, emoji, created_at: at(m) });
const shots = process.env.RX_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const st = { rows, matchIds: [OTHER], messages, lastSeen: {}, routes: {
  'rpc/message_reactions_for': { body: [reaction(1, OTHER, '😂', 15), reaction(2, ME, '❤️', 8)] },
} };
const stub = await startAppStub({ port: 5176, state: st, deckRows: rows });
const browser = await chromium.launch();
const openThread = async () => {
  const ctx = await stub.newContext(browser, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  const page = await stub.open(ctx, { path: '/app.html?view=chat' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector('.chat-row-open', { timeout: 8000 });
  await page.locator('.chat-row-open', { hasText: 'Vinit' }).click();
  await page.waitForSelector('#chat-messages .message[data-message-id]', { timeout: 8000 });
  await page.waitForTimeout(900);
  return { ctx, page, errors };
};
const bubbleSel = (n) => `#chat-messages .message[data-message-id="${id(n)}"]`;
const longPress = async (page, n) => {
  const box = await page.locator(bubbleSel(n)).boundingBox();
  const x = box.x + box.width / 2; const y = box.y + 12;
  await page.evaluate(({ sel, x, y }) => document.querySelector(sel).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true })), { sel: bubbleSel(n), x, y });
  await page.waitForTimeout(600);
  await page.evaluate(({ sel, x, y }) => document.querySelector(sel).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y })), { sel: bubbleSel(n), x, y });
  await page.waitForTimeout(200);
};
const chips = (page, n) => page.$$eval(`${bubbleSel(n)} .message-reaction`, (els) => els.map((el) => `${el.textContent.trim()}${el.getAttribute('aria-pressed') === 'true' ? '*' : ''}`));
const reactCalls = () => st.calls.filter((c) => c.path === '/rest/v1/rpc/react_to_message').map((c) => JSON.parse(c.body || '{}'));

try {
  const { ctx, page, errors } = await openThread();
  // RX1
  check('RX1 their reaction on my message shows', JSON.stringify(await chips(page, 1)) === '["😂"]', JSON.stringify(await chips(page, 1)));
  check('RX1 my reaction is marked', JSON.stringify(await chips(page, 2)) === '["❤️*"]', JSON.stringify(await chips(page, 2)));
  if (shots) await page.screenshot({ path: `${shots}/chips.png` });

  // RX2
  await longPress(page, 3);
  const quick = await page.$$eval('.message-menu .message-menu-reacts [data-message-react]', (els) => els.map((el) => el.textContent.trim()));
  check('RX2 the menu opens with six quick reactions', quick.length === 6 && quick[0] === '❤️', JSON.stringify(quick));
  check('RX2 and a "+" for every emoji', await page.locator('.message-menu [data-message-react-more]').count() === 1);
  check('RX2 the menu stays inside the screen', await page.$eval('.message-menu', (el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
  check('RX2 the reaction buttons are 44 px', (await page.$$eval('.message-menu .message-react', (els) => els.map((el) => el.getBoundingClientRect().height))).every((h) => h >= 44));
  const menuAxe = await axeViolations(page, { include: '.message-menu' });
  check('RX5 the menu has no axe violations', menuAxe.length === 0, JSON.stringify(menuAxe));
  if (shots) await page.screenshot({ path: `${shots}/menu.png` });
  st.routes['rpc/react_to_message'] = { body: [reaction(3, ME, '😮', 0)] };
  await page.locator('.message-menu [data-message-react="😮"]').click();
  await page.waitForTimeout(300);
  check('RX2 the menu closes', await page.locator('.message-menu').count() === 0);
  check('RX2 the chip shows on the bubble', JSON.stringify(await chips(page, 3)) === '["😮*"]', JSON.stringify(await chips(page, 3)));
  check('RX2 react_to_message was called', reactCalls().some((a) => a.p_message === id(3) && a.p_emoji === '😮'), JSON.stringify(reactCalls()));

  // RX3
  st.routes['rpc/react_to_message'] = { body: [] };
  st.routes['rpc/message_reactions_for'] = { body: [reaction(1, OTHER, '😂', 15), reaction(3, ME, '😮', 0)] };   // the server now
  await page.locator(`${bubbleSel(2)} .message-reaction`).click();
  await page.waitForTimeout(300);
  check('RX3 a press on my chip removes it', (await chips(page, 2)).length === 0, JSON.stringify(await chips(page, 2)));
  st.routes['rpc/react_to_message'] = { body: [reaction(1, OTHER, '😂', 15), reaction(1, ME, '😂', 0)] };
  st.routes['rpc/message_reactions_for'] = { body: [reaction(1, OTHER, '😂', 15), reaction(1, ME, '😂', 0), reaction(3, ME, '😮', 0)] };
  await page.locator(`${bubbleSel(1)} .message-reaction`).click();
  await page.waitForTimeout(300);
  check('RX3 a press on their chip adds mine (count 2)', JSON.stringify(await chips(page, 1)) === '["😂2*"]', JSON.stringify(await chips(page, 1)));
  const chipAxe = await axeViolations(page, { include: '#chat-messages' });
  check('RX5 the chips have no axe violations', chipAxe.length === 0, JSON.stringify(chipAxe));

  // RX4
  await longPress(page, 2);
  await page.locator('.message-menu [data-message-react-more]').click();
  await page.waitForSelector('.reaction-picker');
  await page.fill('.reaction-picker [data-emoji-search]', 'chess');
  await page.waitForTimeout(150);
  const found = await page.$$eval('.reaction-picker .emoji-field-emoji', (els) => els.map((el) => el.dataset.emoji));
  check('RX4 search "chess" finds ♟️', found.some((e) => e.startsWith('♟')), JSON.stringify(found));
  const pickBox = await page.$eval('.reaction-picker', (el) => { const r = (el.closest('.message-menu, .reaction-picker-card') || el).getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right), w: innerWidth, h: innerHeight }; });
  check('RX4 the picker stays inside the screen', pickBox.l >= 0 && pickBox.r <= pickBox.w && pickBox.t >= 0 && pickBox.b <= pickBox.h, JSON.stringify(pickBox));
  const pickAxe = await axeViolations(page, { include: '.reaction-picker' });
  check('RX5 the picker has no axe violations', pickAxe.length === 0, JSON.stringify(pickAxe));
  if (shots) await page.screenshot({ path: `${shots}/picker.png` });
  await page.fill('.reaction-picker [data-emoji-search]', '');
  await page.keyboard.press('Escape');
  check('RX4 Escape closes the picker', await page.locator('.reaction-picker').count() === 0);
  check('RX4 Escape keeps the chat open', await page.locator('#chat-window:not([hidden])').count() === 1);
  check('RX4 focus returns to the bubble', await page.evaluate(() => document.activeElement?.dataset?.messageId) === id(2));
  await longPress(page, 2);
  await page.locator('.message-menu [data-message-react-more]').click();
  await page.fill('.reaction-picker [data-emoji-search]', 'chess');
  st.routes['rpc/react_to_message'] = { body: [reaction(2, ME, found[0], 0)] };
  await page.locator('.reaction-picker .emoji-field-emoji').first().click();
  await page.waitForTimeout(300);
  check('RX4 a pick reacts', reactCalls().some((a) => a.p_message === id(2) && a.p_emoji === found[0]) && (await chips(page, 2))[0]?.startsWith('♟'), JSON.stringify(await chips(page, 2)));
  check('RX4 the picker closes after a pick', await page.locator('.reaction-picker').count() === 0);
  check('RX5 no page errors', errors.length === 0, errors.join('; '));
  await ctx.close();

  // RX6
  st.routes = { 'rpc/message_reactions_for': { status: 404, code: 'PGRST202', message: 'Could not find the function' } };
  const late = await openThread();
  await longPress(late.page, 3);
  check('RX6 before 0075 the menu has no reaction row', await late.page.locator('.message-menu .message-menu-reacts').count() === 0 && await late.page.locator('.message-menu .message-menu-item').count() > 0);
  await late.ctx.close();
} finally {
  await browser.close();
  await stub.close();
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('message-reactions: ALL PASSED');
