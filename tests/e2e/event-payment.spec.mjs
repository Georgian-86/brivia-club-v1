// Event payments and tickets (D-166), against stubbed Supabase and a stand-in for Razorpay Checkout.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/event-payment.spec.mjs   (Vite on :5188)
// EP1 Reserve on a paid event holds the seat, asks razorpay-order for the order, and opens Checkout with the server's
//     order id, key and amount, in the club wine.
// EP2 a successful payment is verified by razorpay-verify with Razorpay's three fields; the drawer shows Registered and
//     the toast says the ticket is on its way.
// EP3 closing Checkout keeps the hold: "Payment not completed…" and a "Complete payment · ₹499" button that reopens it.
// EP4 before Razorpay is set up (503): "Online payment opens soon…", the seat stays held.
// EP5 the last seat gone while paying: the refund toast.
// EP6 a free event: Register asks event-ticket for the ticket; the toast promises an email only if one was sent.
import { startAppStub } from './app-stub.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const day = (n, h) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(h - 5, 30, 0, 0); return d.toISOString(); };
const base = (id, title, extra = {}) => ({
  id, title, description: `${title}.`, category: 'games', tags: [], venue_name: 'The Courtyard', venue_area: 'Indiranagar, Bengaluru',
  venue_address: '', starts_at: day(3, 19), ends_at: day(3, 22), image_key: '', distance_km: 2, going_count: 3, companion_count: 1,
  going: false, wants_companion: false, friends: [], status: 'published', is_mine: false, organizer: { id: 'dddddddd-dddd-4ddd-8ddd-000000000001', name: 'Kiran Host', photo_url: null },
  image_url: '', gallery_urls: [], map_url: '', place_id: 'in-bengaluru', capacity: 20, registered_count: 3, fee_inr: 0, my_status: null, contact: null, ...extra,
});
const events = () => [base('paid-1', 'The Candlelit Gambit', { fee_inr: 499 }), base('free-1', 'Sunday Board Games')];
const st = { events: events(), companionDefault: false };
const stub = await startAppStub({ port: 5188, state: st });
const browser = await chromium.launch();

// Razorpay Checkout stand-in: records its options, then pays, closes or waits as the test says (window.__rzpMode).
const FAKE_CHECKOUT = `window.Razorpay = function (opts) {
  this.on = function () {};
  this.open = function () {
    window.__rzpOpened = (window.__rzpOpened || 0) + 1;
    window.__rzpOpts = { key: opts.key, order_id: opts.order_id, amount: opts.amount, currency: opts.currency, color: opts.theme && opts.theme.color, confirm: opts.modal && opts.modal.confirm_close };
    setTimeout(function () {
      if (window.__rzpMode === 'dismiss') opts.modal.ondismiss();
      else opts.handler({ razorpay_order_id: opts.order_id, razorpay_payment_id: 'pay_TEST123456', razorpay_signature: 'f'.repeat(64) });
    }, 250);
  };
};`;

const openEvent = async (id) => {
  st.events = events(); st.payCalls = []; st.rsvps = [];
  const ctx = await stub.newContext(browser, { width: 1280, height: 860 });
  await ctx.route('https://checkout.razorpay.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_CHECKOUT }));
  const page = await stub.open(ctx, { path: '/app.html?view=events' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.waitForSelector(`.event-card[data-event-id="${id}"]`, { timeout: 10000 });
  await page.locator(`.event-card[data-event-id="${id}"] .event-open`).click();
  await page.waitForSelector('#event-detail:not([hidden]) [data-event-going]', { timeout: 5000 });
  return { ctx, page, errors };
};
const toastSays = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.querySelector('#app-toast')?.textContent || ''), re.source, { timeout: 6000 }).then(() => true, () => false);
const calls = (fn) => (st.payCalls || []).filter((c) => c.fn === fn);

try {
  // EP1 + EP2
  {
    st.pay = {};
    const { ctx, page, errors } = await openEvent('paid-1');
    await page.locator('#event-detail [data-event-going]').click();
    const paid = await toastSays(page, /You're in\. Payment confirmed\. Your ticket is on its way to your inbox\./);
    const opts = await page.evaluate(() => window.__rzpOpts);
    check('EP1 Reserve holds the seat first', (st.rsvps || []).some((r) => r.p_event === 'paid-1' && r.p_going === true));
    check('EP1 razorpay-order is asked for this event', calls('razorpay-order').length === 1 && calls('razorpay-order')[0].args.event_id === 'paid-1', JSON.stringify(st.payCalls));
    check(`EP1 Checkout opens with the server's order, key and amount, in the club wine (${JSON.stringify(opts)})`, opts?.order_id === 'order_TEST000001' && opts.key === 'rzp_test_key' && opts.amount === 49900 && opts.currency === 'INR' && opts.color === '#5e0b28' && opts.confirm === true);
    const v = calls('razorpay-verify')[0]?.args || {};
    check(`EP2 razorpay-verify gets Razorpay's three fields (${JSON.stringify(v)})`, v.razorpay_order_id === 'order_TEST000001' && v.razorpay_payment_id === 'pay_TEST123456' && /^f{64}$/.test(v.razorpay_signature || ''));
    check('EP2 the toast: in, paid, ticket on its way', paid, await page.textContent('#app-toast'));
    const registered = await page.waitForFunction(() => /Registered/.test(document.querySelector('#event-detail .event-registered')?.textContent || ''), null, { timeout: 4000 }).then(() => true, () => false);
    check('EP2 the drawer shows Registered', registered);
    check('EP no page errors (paid)', errors.length === 0, errors.join('; '));
    await ctx.close();
  }
  // EP3
  {
    st.pay = {};
    const { ctx, page } = await openEvent('paid-1');
    await page.evaluate(() => { window.__rzpMode = 'dismiss'; });
    await page.locator('#event-detail [data-event-going]').click();
    check('EP3 closing Checkout keeps the hold', await toastSays(page, /Payment not completed\. Your seat stays held for 30 minutes\./), await page.textContent('#app-toast'));
    const pay = page.locator('#event-detail [data-event-pay]');
    await pay.waitFor({ timeout: 4000 }).catch(() => {});
    check(`EP3 "Complete payment · ₹499" is offered (${await pay.textContent().catch(() => '')})`, /Complete payment · ₹499/.test(await pay.textContent().catch(() => '')));
    await page.evaluate(() => { window.__rzpMode = 'pay'; });
    await pay.click();
    check('EP3 it reopens Checkout and the seat is confirmed', await toastSays(page, /Payment confirmed/) && calls('razorpay-order').length === 2 && (await page.evaluate(() => window.__rzpOpened)) === 2);
    await ctx.close();
  }
  // EP4
  {
    st.pay = { order: 'not_configured' };
    const { ctx, page } = await openEvent('paid-1');
    await page.locator('#event-detail [data-event-going]').click();
    check('EP4 before Razorpay is set up: payment opens soon, the seat stays held', await toastSays(page, /Online payment opens soon\. Your seat is held for 30 minutes\./), await page.textContent('#app-toast'));
    check('EP4 Checkout never opened', !(await page.evaluate(() => window.__rzpOpened)));
    await ctx.close();
  }
  // EP5
  {
    st.pay = { verify: 'full' };
    const { ctx, page } = await openEvent('paid-1');
    await page.locator('#event-detail [data-event-going]').click();
    check('EP5 the last seat went while paying: refunded', await toastSays(page, /the last seat went while you paid\. Your payment is being refunded\./), await page.textContent('#app-toast'));
    await ctx.close();
  }
  // EP6
  {
    st.pay = {};
    const { ctx, page, errors } = await openEvent('free-1');
    await page.locator('#event-detail [data-event-going]').click();
    check('EP6 a free registration asks for its ticket', await toastSays(page, /You're in\. Your ticket is on its way to your inbox\./) && calls('event-ticket')[0]?.args.event_id === 'free-1', JSON.stringify(st.payCalls));
    check('EP6 no Checkout for a free event', !(await page.evaluate(() => window.__rzpOpened)) && calls('razorpay-order').length === 0);
    check('EP no page errors (free)', errors.length === 0, errors.join('; '));
    await ctx.close();
    st.pay = { ticketSent: false };
    const second = await openEvent('free-1');
    await second.page.locator('#event-detail [data-event-going]').click();
    check('EP6 no email promised when none was sent', await toastSays(second.page, /^You're in\. See you there\.$/), await second.page.textContent('#app-toast'));
    await second.ctx.close();
  }
} finally {
  await browser.close();
  await stub.close();
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
