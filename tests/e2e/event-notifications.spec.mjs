// D-203 (0060): registrations for my event in the notification panel.
// EN1 two registrations for one event are one row ("Ravi and Asha registered for Goa Buildathon") with the poster; the bell
//     counts it. EN2 tapping it marks both read on the server and opens Explore on that event.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/event-notifications.spec.mjs   (Vite on :5176)
import { startAppStub, ME, ORIGIN } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000203';
const B = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000204';
const EV = 'm-reg-1';
const poster = `${ORIGIN}/storage/v1/object/public/event-posters/${ME}/goa.jpg`;
const at = (m) => new Date(Date.now() - m * 6e4).toISOString();
const note = (id, src, name, mins) => ({ id, notification_type: 'event_registered', source_user_id: src, name, photo_url: null, band: null, created_at: at(mins), read_at: null,
  dismissed_at: null, place_name: null, post_id: null, comment_id: null, snippet: 'Goa Buildathon', post_image_url: null, event_id: EV, event_image_url: poster });
const fresh = () => [note('00000000-0000-4000-8000-0000000002r1', A, 'Asha Rao', 30), note('00000000-0000-4000-8000-0000000002r2', B, 'Ravi Kumar', 10)];
const st = { matchIds: [], notifications: fresh(), posts: [] };
const stub = await startAppStub({ port: 5176, state: st });
const browser = await chromium.launch();
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    st.notifications = fresh();
    const ctx = await stub.newContext(browser, { width: w, height: h });
    const page = await stub.open(ctx, { path: '/app.html?view=home' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForSelector('#app-notification-button:not([hidden])', { timeout: 8000 });
    await page.waitForTimeout(400);
    const badge = await page.textContent('#notification-badge');
    check(`${w} EN1 the bell counts one unread row`, badge === '1', badge);
    await page.click('#app-notification-button');
    await page.waitForSelector('#notification-list', { state: 'visible' });
    const rows = await page.$$eval('[data-event-note]', (els) => els.map((el) => ({ title: el.querySelector('strong')?.textContent, thumb: Boolean(el.querySelector('.notification-post-thumb img')) })));
    check(`${w} EN1 one row naming both, with the poster`, rows.length === 1 && rows[0].title === 'Ravi and Asha registered for Goa Buildathon' && rows[0].thumb, JSON.stringify(rows));
    await page.locator('[data-event-note]').click();
    await page.waitForTimeout(700);
    const marked = st.calls.filter((c) => c.path === '/rest/v1/rpc/mark_notifications_read').map((c) => JSON.parse(c.body || '{}').p_ids || []).flat();
    check(`${w} EN2 both are marked read`, marked.includes('00000000-0000-4000-8000-0000000002r1') && marked.includes('00000000-0000-4000-8000-0000000002r2'), JSON.stringify(marked));
    check(`${w} EN2 it opens Explore`, (await page.evaluate(() => document.body.dataset.appView)) === 'events');
    check(`${w} no page errors`, errors.length === 0, errors.join('; '));
    await ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
