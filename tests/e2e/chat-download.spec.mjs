// Download a photo, video or file sent in a chat (chat-download.js), against stubbed Supabase. Never a real project.
//
//   PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/chat-download.spec.mjs
//   E2E_SCREENSHOTS=<dir> also saves the thread at 375 and 1440 px.
//
// A thread with a photo and a PDF from them and an external GIF link:
// * the photo and the PDF each carry a "Download <name>" button (at least 32 px); the GIF does not;
// * pressing it asks Storage for a signed URL of that path in message-attachments and the browser downloads the file
//   under its own name (Storage's `download` option, so Content-Disposition: attachment);
// * the long-press menu of the photo offers Download, which does the same; a text message offers no Download;
// * a Storage error shows a toast and downloads nothing.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { startAppStub, ME } from './app-stub.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const PORT = Number(process.env.E2E_PORT || 5168);
const EXECUTABLE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SHOTS = process.env.E2E_SCREENSHOTS || '';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const id = (n) => `0e460000-0000-4000-8000-00000000d0${String(n).padStart(2, '0')}`;
const at = (n) => new Date(Date.now() - (10 - n) * 60000).toISOString();
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#5e0b28"/></svg>';

const messages = [
  { id: id(1), sender_id: A, recipient_id: ME, body: 'Here are the shots', created_at: at(1) },
  { id: id(2), sender_id: A, recipient_id: ME, body: '', created_at: at(2), message_type: 'image', attachment_path: `${A}/court.svg`, attachment_name: 'Court day', attachment_mime: 'image/svg+xml', attachment_size: 1000 },
  { id: id(3), sender_id: A, recipient_id: ME, body: '', created_at: at(3), message_type: 'document', attachment_path: `${A}/schedule.pdf`, attachment_name: 'Schedule.pdf', attachment_mime: 'application/pdf', attachment_size: 2000 },
  { id: id(4), sender_id: A, recipient_id: ME, body: '', created_at: at(4), message_type: 'gif', attachment_url: 'https://cdn.example/x.gif', attachment_path: null, attachment_name: 'Party GIF', attachment_mime: 'image/gif', attachment_size: 0 },
];

const results = [];
const check = (name, fn) => { try { fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', `${name}: ${error.message}`]); } };
const stub = await startAppStub({ port: PORT, state: { matchIds: [A], messages } });
const pageErrors = [];
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: EXECUTABLE });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  for (const [width, height] of [[1440, 900], [375, 812]]) {
    const tag = `${width}x${height}`;
    const phone = width < 600;
    const context = await stub.newContext(browser, { width, height }, { reducedMotion: 'reduce', acceptDownloads: true, ...(phone ? { isMobile: true, hasTouch: true } : {}) });
    const signs = [];
    let failSigns = false;
    await context.route(/\/storage\/v1\/object\/sign\/message-attachments\/.+$/, (route) => {
      const file = route.request().url().split('/').pop();
      signs.push(file);
      if (failSigns) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Object not found' }), headers: { 'access-control-allow-origin': '*' } });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: `/object/sign/message-attachments/${A}/${file}?token=stub` }), headers: { 'access-control-allow-origin': '*' } });
    });
    // The signed URL itself: inline for display, as an attachment when `download` is set (what Storage does).
    await context.route(/\/storage\/v1\/object\/sign\/message-attachments\/.+\?token=stub/, (route) => {
      const url = new URL(route.request().url());
      const file = url.pathname.split('/').pop();
      const headers = { 'access-control-allow-origin': '*' };
      const dl = url.searchParams.get('download');
      if (dl !== null) headers['content-disposition'] = `attachment; filename="${dl}"`;
      return route.fulfill({ status: 200, contentType: file.endsWith('.svg') ? 'image/svg+xml' : 'application/pdf', body: file.endsWith('.svg') ? SVG : '%PDF-1.4 stub', headers });
    });
    const page = await stub.open(context, { path: '/app.html?view=chat', errors: pageErrors });
    await page.waitForFunction(() => document.querySelector('#chat-list [data-chat-id]'), null, { timeout: 15000 });
    await page.locator('#chat-list .chat-row-copy > span').first().click({ timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll('#chat-messages [data-attachment-download]').length === 2, null, { timeout: 10000 });

    const buttons = await page.evaluate(() => [...document.querySelectorAll('#chat-messages .message')].map((m) => {
      const b = m.querySelector('[data-attachment-download]');
      const r = b?.getBoundingClientRect();
      return { id: m.dataset.messageId, label: b?.getAttribute('aria-label') || '', size: r ? Math.min(r.width, r.height) : 0 };
    }));
    check(`${tag}: the photo and the PDF have a Download button, the GIF and the text do not`, () => assert.deepEqual(buttons.map((b) => b.label), ['', 'Download Court day', 'Download Schedule.pdf', '']));
    check(`${tag}: the buttons are at least 32 px`, () => buttons.filter((b) => b.label).forEach((b) => assert.ok(b.size >= 32, String(b.size))));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `chat-download-${tag}.png`) });

    const before = signs.length;
    const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.locator(`[data-message-id="${id(3)}"] [data-attachment-download]`).click()]);
    check(`${tag}: the PDF downloads as Schedule.pdf (${pdf.suggestedFilename()})`, () => assert.equal(pdf.suggestedFilename(), 'Schedule.pdf'));
    check(`${tag}: one new signed URL for schedule.pdf`, () => assert.deepEqual(signs.slice(before).filter((f) => f === 'schedule.pdf').length, 1));

    // The long-press menu (right-click on desktop, a held press on a phone).
    const photo = page.locator(`[data-message-id="${id(2)}"]`);
    if (phone) {
      const box = await photo.boundingBox();
      await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true }));
      }, { x: box.x + 20, y: box.y + box.height - 20 });
      await page.waitForTimeout(700);
      await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true })), { x: box.x + 20, y: box.y + box.height - 20 });
    } else await photo.click({ button: 'right', position: { x: 20, y: 20 } });
    await page.waitForSelector('[data-message-action="download"]', { timeout: 5000 });
    const [img] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.locator('[data-message-action="download"]').click()]);
    check(`${tag}: menu Download saves the photo as "Court day.svg" (${img.suggestedFilename()})`, () => assert.equal(img.suggestedFilename(), 'Court day.svg'));

    await page.locator(`[data-message-id="${id(1)}"]`).click({ button: 'right' });
    await page.waitForSelector('[data-message-action]', { timeout: 5000 });
    const textActions = await page.evaluate(() => [...document.querySelectorAll('[data-message-action]')].map((b) => b.dataset.messageAction));
    check(`${tag}: a text message offers no Download (${textActions})`, () => assert.ok(!textActions.includes('download')));
    await page.locator('#chat-input').click();

    failSigns = true;
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await page.locator(`[data-message-id="${id(3)}"] [data-attachment-download]`).click();
    await page.waitForTimeout(800);
    const toast = await page.evaluate(() => document.querySelector('#app-toast')?.textContent || '');
    check(`${tag}: a Storage error downloads nothing and says so (${toast.trim()})`, () => { assert.equal(downloaded, false); assert.match(toast, /could not be downloaded/); });
    await context.close();
  }
  check(`no uncaught page errors (${pageErrors.join(' | ')})`, () => assert.deepEqual(pageErrors, []));
} finally {
  await browser?.close();
  await stub.close();
}
results.forEach(([status, name]) => console.log(`${status}  ${name}`));
const failed = results.filter(([status]) => status === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
