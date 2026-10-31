// Pitch in chat (D-112, 0019): a pitch (a connection request with a note) reaches the receiver's Chat as a message
// request. The inbox shows it under "Message requests" (row label ends ", message request"); the thread shows the pitch
// bubble, "Not connected yet", Accept and Decline and no enabled composer. Accept opens the chat without connecting
// ("Not connected" in the head, the composer works); Decline and End chat (⋯) close it; the sender sees their own
// bubble and "Waiting for them to accept". P0002 reads "That request is no longer open." and the row leaves; another
// failure keeps the buttons. Before 0019 (my_pitch_threads 404 / PGRST202) the inbox is as before. Not now in the
// review sheet drops the thread; Connect turns it into a normal conversation. axe clean on the inbox and an open request.
// PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/pitch-chat.spec.mjs   (Vite on :5202)
// PITCH_SHOTS=<dir> also saves the inbox, an open request and an open chat at 390 and 1440.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { axeViolations } from './a11y.mjs';
import { startAppStub, defaultDeckRows } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const SHOTS = process.env.PITCH_SHOTS || '';
const [ASHA, BILAL] = defaultDeckRows.map((row) => row.id);
const CARA = 'cccccccc-cccc-4ccc-8ccc-000000000003';
const DANA = 'dddddddd-dddd-4ddd-8ddd-000000000004';   // never loads: "A Brivia member"
const CARA_ROW = { id: CARA, name: 'Cara Quill', photo_url: null, cover_url: null, experience: 'Founder', skills: ['Chess'], looking_for: ['Cofounder'] };
const ago = (m) => new Date(Date.now() - m * 6e4).toISOString();
const ASHA_NOTE = 'Saw you play badminton at Kadavanthra. Want to start a weekend doubles group?';
const pitch = (other_id, direction, note, minutes, chat_open = false) => ({ other_id, direction, note, created_at: ago(minutes), chat_open });

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const st = { routes: { 'rpc/get_candidates': { body: [CARA_ROW] } } };
const stub = await startAppStub({ port: 5202, state: st });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { headless: true, executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const shot = async (page, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); };
const callCount = (rpc) => st.calls.filter((c) => c.path === `/rest/v1/rpc/${rpc}`).length;
const reset = (extra) => {
  st.routes = { 'rpc/get_candidates': { body: [CARA_ROW] } };
  Object.assign(st, { pitchAccepts: [], pitchEnds: [], responses: [], sent: [], matchIds: [], respondFail: false, ...extra });
};
const openContext = async (w, h) => {
  const ctx = await stub.newContext(browser, { width: w, height: h }, w < 780 ? { isMobile: true, hasTouch: true } : {});
  const page = await stub.open(ctx, { path: '/app.html?view=chat', errors });
  page.setDefaultTimeout(6000);
  return { ctx, page };
};
const row = (page, id) => page.locator(`#chat-list .chat-row-open[data-chat-id="${id}"]`);
const openRow = async (page, id) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await row(page, id).click();
  await page.waitForFunction((pid) => !document.querySelector('#chat-window')?.hidden && document.querySelector('#chat-avatar')?.dataset.publicProfileId === pid, id);
};
const backToInbox = async (page) => {
  if (await page.locator('#chat-window').isHidden()) return;
  if (await page.locator('#chat-close').isVisible()) await page.locator('#chat-close').click();
  else await page.locator('#chat-back').click();
  await page.waitForFunction(() => document.querySelector('#chat-window')?.hidden);
};
const threadState = (page) => page.evaluate(() => {
  const input = document.querySelector('#chat-input');
  const send = document.querySelector('#chat-form button[type="submit"]');
  return {
    bubble: document.querySelector('#chat-messages .pitch-bubble .pitch-note')?.textContent || '',
    mine: Boolean(document.querySelector('#chat-messages .pitch-bubble--me')),
    status: document.querySelector('#chat-messages .pitch-status')?.textContent || '',
    accept: Boolean(document.querySelector('#chat-messages [data-pitch-action="accept"]')),
    decline: Boolean(document.querySelector('#chat-messages [data-pitch-action="decline"]')),
    composerEnabled: Boolean(input && !input.disabled && !input.closest('[inert]') && send && !send.disabled),
    chip: (() => { const c = document.querySelector('#chat-pitch-chip'); return c && !c.hidden ? c.textContent : ''; })(),
    name: document.querySelector('#chat-name')?.textContent || '',
  };
});
const toast = (page) => page.locator('#app-toast').textContent();

try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    // 1. The receiver's inbox: two message requests (Asha, and Dana whose card never loads) and my own pitch to Bilal.
    reset({
      pitchThreads: [pitch(ASHA, 'in', ASHA_NOTE, 5), pitch(DANA, 'in', 'Can we talk about the chess league?', 20), pitch(BILAL, 'out', 'Fancy a doubles game on Sunday?', 60)],
      requests: [{ from_id: ASHA, note: ASHA_NOTE, created_at: ago(5) }, { from_id: CARA, note: null, created_at: ago(90) }],
    });
    const { ctx, page } = await openContext(w, h);
    await page.waitForSelector('#chat-list .chat-requests', { timeout: 8000 }).catch(() => {});
    const inbox = await page.evaluate(() => {
      const section = document.querySelector('#chat-list .chat-requests');
      return {
        title: section?.querySelector('.chat-section-title')?.textContent || '',
        requestIds: [...(section?.querySelectorAll('.chat-row-open') || [])].map((b) => b.dataset.chatId),
        labels: [...(section?.querySelectorAll('.chat-row-open') || [])].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
        firstInList: document.querySelector('#chat-list .chat-inbox-scroll')?.querySelector('.chat-requests, .chat-row') === section,
        names: [...(section?.querySelectorAll('.chat-row-copy strong') || [])].map((s) => s.textContent),
      };
    });
    check(`${w}: "Message requests" heads the inbox with Asha and Dana (${JSON.stringify(inbox)})`,
      inbox.title === 'Message requests' && inbox.firstInList && inbox.requestIds.join() === [ASHA, DANA].join());
    const named = await page.locator('#chat-list .chat-requests').getByRole('button', { name: /, message request$/ }).count();
    check(`${w}: each request row's accessible name ends ", message request" (${named}, ${JSON.stringify(inbox.labels)})`, named === 2 && inbox.labels.every((l) => l.endsWith(', message request')));
    check(`${w}: a request whose person did not load reads "A Brivia member" (${JSON.stringify(inbox.names)})`, inbox.names[1]?.startsWith('A Brivia member'));
    const bilalRow = await page.evaluate((id) => {
      const b = document.querySelector(`#chat-list .chat-row-open[data-chat-id="${id}"]`);
      return { inRequests: Boolean(b?.closest('.chat-requests')), chip: b?.querySelector('.chat-row-chip')?.textContent || '' };
    }, BILAL);
    check(`${w}: my own pitch sits with the conversations, chip "Not connected" (${JSON.stringify(bilalRow)})`, !bilalRow.inRequests && bilalRow.chip === 'Not connected');
    // The new parts of the inbox: the requests section and a "Not connected" chip. (The older conversation row nests its
    // profile trigger in the row button, and the 390 switch has its own findings: both predate D-112, not checked here.)
    const axeInbox = [...await axeViolations(page, { include: '#chat-list .chat-requests' }), ...await axeViolations(page, { include: '#chat-list .chat-row.is-pitch .chat-row-meta' })];
    check(`${w}: axe finds no violations in the message requests and the chip (${axeInbox.join(' | ')})`, axeInbox.length === 0);
    await shot(page, `inbox-${w}.png`);

    // 2. Asha's request: the pitch bubble, "Not connected yet", Accept and Decline, no enabled composer.
    await openRow(page, ASHA);
    const request = await threadState(page);
    check(`${w}: an open request shows the pitch, "Not connected yet", Accept and Decline, composer off (${JSON.stringify(request)})`,
      request.bubble === ASHA_NOTE && !request.mine && request.status === 'Not connected yet' && request.accept && request.decline && !request.composerEnabled && !request.chip);
    const axeRequest = await axeViolations(page, { include: '#chat-window' });
    check(`${w}: axe finds no violations in an open request (${axeRequest.join(' | ')})`, axeRequest.length === 0);
    await shot(page, `request-${w}.png`);

    // 3. Decline: one end_pitch_chat, the row leaves, the thread closes, the review sheet no longer lists Asha.
    const endsBefore = callCount('end_pitch_chat');
    await page.locator('#chat-messages [data-pitch-action="decline"]').click();
    await page.waitForFunction((id) => !document.querySelector(`#chat-list .chat-row-open[data-chat-id="${id}"]`) && document.querySelector('#chat-window')?.hidden, ASHA).catch(() => {});
    check(`${w}: Decline calls end_pitch_chat once with p_other Asha (${JSON.stringify(st.pitchEnds)})`, callCount('end_pitch_chat') - endsBefore === 1 && st.pitchEnds.at(-1)?.p_other === ASHA);
    check(`${w}: the declined row leaves and the thread closes`, await row(page, ASHA).count() === 0 && await page.locator('#chat-window').isHidden());
    await page.locator('#app-notification-button').click();
    await page.waitForSelector('.notification-collab [data-collab-review]');
    await page.locator('[data-collab-review]').click();
    await page.waitForSelector('dialog.collab-review[open] .collab-card');
    const sheet = await page.evaluate(() => ({ count: document.querySelector('.collab-count')?.textContent, name: document.querySelector('.collab-name')?.textContent }));
    check(`${w}: the review sheet no longer lists Asha (${JSON.stringify(sheet)})`, sheet.count === '1 of 1' && sheet.name === 'Cara Quill');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.collab-review'));

    // 4. My pitch to Bilal: my own bubble, "Waiting for them to accept", composer off.
    await openRow(page, BILAL);
    const waiting = await threadState(page);
    check(`${w}: an outgoing pitch shows my bubble and "Waiting for them to accept", composer off (${JSON.stringify(waiting)})`,
      waiting.mine && waiting.bubble === 'Fancy a doubles game on Sunday?' && waiting.status === 'Waiting for them to accept' && !waiting.accept && !waiting.composerEnabled);
    await backToInbox(page);

    // 5. Dana's request is no longer open (P0002 on Accept): the note, and the row leaves.
    await openRow(page, DANA);
    check(`${w}: the thread of an unloaded person reads "A Brivia member"`, (await threadState(page)).name === 'A Brivia member');
    st.routes['rpc/accept_pitch_chat'] = { status: 400, code: 'P0002', message: 'no pending connection request' };
    await page.locator('#chat-messages [data-pitch-action="accept"]').click();
    await page.waitForFunction(() => /no longer open/.test(document.querySelector('#app-toast')?.textContent || ''));
    await page.waitForTimeout(200);
    check(`${w}: P0002 toasts "That request is no longer open." and the row leaves`, (await toast(page)).trim() === 'That request is no longer open.' && await row(page, DANA).count() === 0);
    await ctx.close();
  }

  for (const [w, h] of [[1440, 900], [390, 844]]) {
    // 6. Accept: a 500 keeps the buttons; then one RPC for a double click, the composer, "Not connected", a send, End chat.
    reset({ pitchThreads: [pitch(ASHA, 'in', ASHA_NOTE, 5)], requests: [{ from_id: ASHA, note: ASHA_NOTE, created_at: ago(5) }] });
    st.routes['rpc/accept_pitch_chat'] = { status: 500 };
    const { ctx, page } = await openContext(w, h);
    await page.waitForSelector(`#chat-list .chat-requests .chat-row-open[data-chat-id="${ASHA}"]`, { timeout: 8000 });
    await openRow(page, ASHA);
    await page.locator('#chat-messages [data-pitch-action="accept"]').click();
    await page.waitForFunction(() => /could not be updated/.test(document.querySelector('#app-toast')?.textContent || ''));
    await page.waitForTimeout(200);
    const kept = await threadState(page);
    check(`${w}: a failed Accept toasts "That request could not be updated. Please try again." and keeps the buttons (${JSON.stringify(kept)})`,
      (await toast(page)).trim() === 'That request could not be updated. Please try again.' && kept.accept && kept.decline && !kept.composerEnabled
      && !(await page.locator('#chat-messages [data-pitch-action="accept"]').isDisabled()));
    st.routes['rpc/accept_pitch_chat'] = { delayMs: 400 };
    const acceptsBefore = callCount('accept_pitch_chat');
    await page.locator('#chat-messages [data-pitch-action="accept"]').dblclick();
    await page.waitForFunction(() => !document.querySelector('#chat-input')?.disabled && !document.querySelector('[data-pitch-action="accept"]'), null, { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(500);
    const open = await threadState(page);
    check(`${w}: Accept (double click) calls accept_pitch_chat once (${callCount('accept_pitch_chat') - acceptsBefore})`, callCount('accept_pitch_chat') - acceptsBefore === 1 && st.pitchAccepts.at(-1)?.p_from === ASHA);
    check(`${w}: after Accept the composer works, the head shows "Not connected", the pitch stays (${JSON.stringify(open)})`,
      open.composerEnabled && open.chip === 'Not connected' && open.bubble === ASHA_NOTE && !open.accept && !open.status);
    const rowAfter = await page.evaluate((id) => { const b = document.querySelector(`#chat-list .chat-row-open[data-chat-id="${id}"]`); return { inRequests: Boolean(b?.closest('.chat-requests')), chip: b?.querySelector('.chat-row-chip')?.textContent || '' }; }, ASHA);
    if (w >= 780) check(`${w}: the accepted row moves to the conversations with "Not connected" (${JSON.stringify(rowAfter)})`, !rowAfter.inRequests && rowAfter.chip === 'Not connected');
    await page.locator('#chat-input').fill('Great, Sunday at 7?');
    await page.locator('#chat-form button[type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#chat-input')?.value);
    check(`${w}: sending posts to brivia_messages (${JSON.stringify(st.sent)})`, st.sent.length === 1 && st.sent[0].recipient_id === ASHA && st.sent[0].body === 'Great, Sunday at 7?');
    await shot(page, `open-${w}.png`);
    await page.locator('#chat-more').click();
    const menu = await page.evaluate(() => [...document.querySelectorAll('#chat-more-menu button')].filter((b) => !b.hidden).map((b) => b.textContent));
    check(`${w}: the ⋯ menu offers End chat, not Remove connection (${JSON.stringify(menu)})`, menu.includes('End chat') && !menu.includes('Remove connection'));
    const endsBefore = callCount('end_pitch_chat');
    await page.locator('#chat-more-menu button', { hasText: 'End chat' }).click();
    await page.waitForFunction((id) => !document.querySelector(`#chat-list .chat-row-open[data-chat-id="${id}"]`) && document.querySelector('#chat-window')?.hidden, ASHA).catch(() => {});
    check(`${w}: End chat calls end_pitch_chat once, the row leaves (${JSON.stringify(st.pitchEnds)})`, callCount('end_pitch_chat') - endsBefore === 1 && st.pitchEnds.at(-1)?.p_other === ASHA && await row(page, ASHA).count() === 0);
    await ctx.close();
  }

  // 7. Before 0019: my_pitch_threads answers 404 / PGRST202. The inbox is as before and the console stays clean.
  {
    reset({ pitchThreads: [pitch(ASHA, 'in', ASHA_NOTE, 5)], requests: [{ from_id: ASHA, note: ASHA_NOTE, created_at: ago(5) }], matchIds: [BILAL] });
    st.routes['rpc/my_pitch_threads'] = { status: 404, code: 'PGRST202', message: 'Could not find the function public.my_pitch_threads' };
    const consoleLines = [];
    const asked = callCount('my_pitch_threads');
    const ctx = await stub.newContext(browser, { width: 1440, height: 900 });
    ctx.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource|Realtime messages channel/.test(m.text())) consoleLines.push(`${m.type()}: ${m.text()}`); });
    const page = await stub.open(ctx, { path: '/app.html?view=chat', errors });
    await page.waitForSelector(`#chat-list .chat-row-open[data-chat-id="${BILAL}"]`, { timeout: 8000 });
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => ({ heading: Boolean(document.querySelector('.chat-requests, .chat-section-title')), chips: document.querySelectorAll('.chat-row-chip').length, rows: document.querySelectorAll('#chat-list .chat-row').length }));
    check(`404: no "Message requests", no chips, the inbox as before (${JSON.stringify(before)})`, !before.heading && before.chips === 0 && before.rows === 1);
    check(`404: my_pitch_threads was asked once and the console is clean (${callCount('my_pitch_threads') - asked}, ${JSON.stringify(consoleLines)})`, callCount('my_pitch_threads') - asked === 1 && consoleLines.length === 0);
    await ctx.close();
  }

  // 8. The review sheet: Not now drops the pitch thread; Connect (a match) turns Cara's into a normal conversation.
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    reset({
      pitchThreads: [pitch(ASHA, 'in', ASHA_NOTE, 5), pitch(CARA, 'in', 'Building a chess club for founders.', 90)],
      requests: [{ from_id: ASHA, note: ASHA_NOTE, created_at: ago(5) }, { from_id: CARA, note: 'Building a chess club for founders.', created_at: ago(90) }],
    });
    const { ctx, page } = await openContext(w, h);
    await page.waitForSelector(`#chat-list .chat-requests .chat-row-open[data-chat-id="${CARA}"]`, { timeout: 8000 });
    await page.locator('#app-notification-button').click();
    await page.locator('[data-collab-review]').click();
    await page.waitForSelector(`dialog.collab-review .collab-card[data-from="${ASHA}"]`);
    await page.locator('dialog.collab-review [data-collab-decide="later"]').click();
    await page.waitForSelector(`dialog.collab-review .collab-card[data-from="${CARA}"]`);
    await page.waitForTimeout(200);
    check(`${w}: Not now in the review sheet removes Asha's request row from the inbox`, await row(page, ASHA).count() === 0);
    await page.locator('dialog.collab-review [data-collab-decide="connect"]').click();
    await page.waitForSelector('dialog.collab-review [data-collab-message]');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.collab-review'));
    await page.waitForTimeout(300);
    const cara = await page.evaluate((id) => { const b = document.querySelector(`#chat-list .chat-row-open[data-chat-id="${id}"]`); return { present: Boolean(b), inRequests: Boolean(b?.closest('.chat-requests')), chip: Boolean(b?.querySelector('.chat-row-chip')), section: Boolean(document.querySelector('.chat-requests')) }; }, CARA);
    check(`${w}: Connect turns Cara's request into a normal conversation (${JSON.stringify(cara)})`, cara.present && !cara.inRequests && !cara.chip && !cara.section);
    await ctx.close();
  }
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
