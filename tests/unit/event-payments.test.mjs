// D-183: Razorpay helpers, the ticket email and Checkout options. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hmacSha256Hex, safeEqualHex, verifyPaymentSignature, verifyWebhookSignature, orderRequest, holdActive, HOLD_MS } from '../../supabase/functions/_shared/razorpay.js';
import { ticketEmail, ticketCode, ticketIcs, whenLines, base64Utf8, escapeHtml } from '../../supabase/functions/_shared/ticket-email.js';
import { checkoutOptions, CHECKOUT_SRC } from '../../site/scripts/payment-checkout.js';
import { RITUAL_CUES } from '../../site/scripts/notify-sound.js';

const nodeHmac = (secret, msg) => createHmac('sha256', secret).update(msg).digest('hex');

test('HMAC-SHA256 matches Node crypto (the Edge runtime uses the same Web Crypto)', async () => {
  assert.equal(await hmacSha256Hex('key_secret', 'order_ABC|pay_XYZ'), nodeHmac('key_secret', 'order_ABC|pay_XYZ'));
});

test('a genuine Checkout signature passes; a tampered order, payment or secret fails', async () => {
  const secret = 'rzp_test_secret_123';
  const signature = nodeHmac(secret, 'order_Nx1abcDEF234|pay_Qa9zyxWVU876');
  assert.equal(await verifyPaymentSignature({ orderId: 'order_Nx1abcDEF234', paymentId: 'pay_Qa9zyxWVU876', signature, secret }), true);
  assert.equal(await verifyPaymentSignature({ orderId: 'order_Nx1abcDEF999', paymentId: 'pay_Qa9zyxWVU876', signature, secret }), false);
  assert.equal(await verifyPaymentSignature({ orderId: 'order_Nx1abcDEF234', paymentId: 'pay_Qa9zyxWVU000', signature, secret }), false);
  assert.equal(await verifyPaymentSignature({ orderId: 'order_Nx1abcDEF234', paymentId: 'pay_Qa9zyxWVU876', signature, secret: 'other' }), false);
  assert.equal(await verifyPaymentSignature({ orderId: 'order|x', paymentId: 'pay_Qa9zyxWVU876', signature, secret }), false, 'ids are shape-checked');
  assert.equal(await verifyPaymentSignature({ orderId: 'order_Nx1abcDEF234', paymentId: 'pay_Qa9zyxWVU876', signature: '', secret }), false);
});

test('a webhook is accepted only with the signature of its exact raw body', async () => {
  const secret = 'whsec_brivia';
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1' } } } });
  const signature = nodeHmac(secret, body);
  assert.equal(await verifyWebhookSignature({ body, signature, secret }), true);
  assert.equal(await verifyWebhookSignature({ body: `${body} `, signature, secret }), false);
  assert.equal(await verifyWebhookSignature({ body, signature, secret: '' }), false);
  assert.equal(safeEqualHex('abcd', 'ABCD'), true);
  assert.equal(safeEqualHex('abcd', 'abce'), false);
  assert.equal(safeEqualHex('abcd', 'abc'), false);
  assert.equal(safeEqualHex('zz', 'zz'), false, 'only hex compares');
});

test('the order amount is the fee in paise, in INR, with the ids in notes; bad fees are refused', () => {
  const o = orderRequest({ feeInr: 1499, eventId: '0e460000-0000-4000-8000-0000000000a1', memberId: '11111111-1111-4111-8111-111111111111' });
  assert.equal(o.amount, 149900);
  assert.equal(o.currency, 'INR');
  assert.ok(o.receipt.length <= 40);
  assert.deepEqual(o.notes, { event_id: '0e460000-0000-4000-8000-0000000000a1', member_id: '11111111-1111-4111-8111-111111111111' });
  [0, -5, NaN, 'x', 600000].forEach((fee) => assert.throws(() => orderRequest({ feeInr: fee, eventId: 'e', memberId: 'm' })));
});

test('a hold is payable for 30 minutes only, and only while pending', () => {
  const now = Date.parse('2026-11-04T10:00:00Z');
  assert.equal(holdActive({ status: 'pending_payment', created_at: new Date(now - HOLD_MS + 1000).toISOString() }, now), true);
  assert.equal(holdActive({ status: 'pending_payment', created_at: new Date(now - HOLD_MS - 1).toISOString() }, now), false);
  assert.equal(holdActive({ status: 'confirmed', created_at: new Date(now).toISOString() }, now), false);
  assert.equal(holdActive(null, now), false);
});

const event = {
  id: '0e460000-0000-4000-8000-0000000000a1', title: 'The Candlelit Gambit <Chess Night>', starts_at: '2026-11-08T13:30:00Z', ends_at: '2026-11-08T16:30:00Z',
  venue_name: 'The Courtyard', venue_area: 'Indiranagar, Bengaluru', venue_address: null, map_url: 'https://maps.app.goo.gl/abc', image_url: 'https://x.supabase.co/storage/v1/object/public/event-posters/p.jpg',
};

test('ticket codes are BRV- and six unambiguous characters', () => {
  for (let i = 0; i < 200; i += 1) assert.match(ticketCode(), /^BRV-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(ticketCode(() => 0), 'BRV-AAAAAA');
});

test('times are shown in Indian time', () => {
  assert.deepEqual(whenLines(event.starts_at, event.ends_at), { date: 'Sunday, 8 November 2026', time: '7:00 PM – 10:00 PM IST' });
  assert.equal(whenLines('nope').date, 'Date to be announced');
  assert.deepEqual(whenLines('2026-11-08T13:30:00Z', '2026-11-10T16:30:00Z'),
    { date: 'Sunday, 8 November – Tuesday, 10 November 2026', time: '7:00 PM, 8 Nov – 10:00 PM, 10 Nov IST' }, 'D-197: several days');
  assert.equal(whenLines('2026-12-31T13:30:00Z', '2027-01-02T16:30:00Z').date, 'Thursday, 31 December 2026 – Saturday, 2 January 2027');
  assert.deepEqual(whenLines('2026-11-07T18:30:00Z', '2026-11-10T18:29:00Z').time, 'All day', 'D-198: untimed');
  assert.equal(whenLines('2026-11-07T18:30:00Z', '2026-11-08T18:29:00Z').time, 'All day');
  assert.equal(whenLines('2026-11-08T13:30:00Z', '2026-11-08T18:29:00Z').time, 'From 7:00 PM IST');
});

test('the invitation: the event, the guest, the code, paid or free, links, and every value escaped', () => {
  const mail = ticketEmail({ event, member: { name: 'Asha Rao' }, code: 'BRV-K7Q2MX', paidInr: 1499 });
  assert.equal(mail.subject, 'Your ticket: The Candlelit Gambit <Chess Night>');
  assert.match(mail.html, /The Candlelit Gambit &lt;Chess Night&gt;/);
  assert.doesNotMatch(mail.html, /<Chess Night>/, 'no raw HTML from the event');
  assert.match(mail.html, /Dear Asha,/);
  assert.match(mail.html, /Admit one/);
  assert.match(mail.html, /BRV-K7Q2MX/);
  assert.match(mail.html, /Paid · ₹1,499/);
  assert.match(mail.html, /Sunday, 8 November 2026/);
  assert.match(mail.html, /The Courtyard[\s\S]*Indiranagar, Bengaluru/);
  assert.match(mail.html, /href="https:\/\/thebriviaclub\.live\/app\.html\?view=events&amp;event=0e460000/);
  assert.match(mail.html, /Directions/);
  assert.match(mail.html, /event-posters\/p\.jpg/);
  assert.match(mail.text, /ADMIT ONE: The Candlelit Gambit <Chess Night>\nWhen: Sunday, 8 November 2026, 7:00 PM – 10:00 PM IST/);
  const free = ticketEmail({ event: { ...event, map_url: 'javascript:alert(1)', image_url: 'http://plain' }, member: {}, code: 'BRV-AAAAAA', paidInr: 0 });
  assert.match(free.html, /Free entry/);
  assert.match(free.html, /Dear there,|Dear Brivia,/);
  assert.doesNotMatch(free.html, /javascript:|http:\/\/plain/, 'only https links and images');
  assert.equal(escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

test('the calendar invite: UTC times, escaped text, CRLF and 75-octet lines', () => {
  const ics = ticketIcs({ event, code: 'BRV-K7Q2MX', now: new Date('2026-11-04T10:00:00Z') });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261108T133000Z\r\n/);
  assert.match(ics, /DTEND:20261108T163000Z\r\n/);
  assert.match(ics, /UID:BRV-K7Q2MX@thebriviaclub\.live/);
  assert.match(ics, /LOCATION:The Courtyard\\, Indiranagar\\, Bengaluru/);
  ics.split('\r\n').forEach((line) => assert.ok(new TextEncoder().encode(line).length <= 75, line));
  const noEnd = ticketIcs({ event: { ...event, ends_at: null }, code: 'BRV-AAAAAA', now: new Date('2026-11-04T10:00:00Z') });
  assert.match(noEnd, /DTEND:20261108T153000Z/, 'two hours when no end time');
  assert.equal(Buffer.from(base64Utf8('₹ ✓'), 'base64').toString('utf8'), '₹ ✓');
});

test('Checkout opens with the server order, in the club wine, and asks before closing', () => {
  const opts = checkoutOptions({ key_id: 'rzp_test_1', order_id: 'order_1', amount: 149900, currency: 'INR', description: 'Chess', prefill: { name: 'Asha', email: 'a@x.in' } }, { handler: () => {}, ondismiss: () => {} });
  assert.equal(opts.key, 'rzp_test_1');
  assert.equal(opts.order_id, 'order_1');
  assert.equal(opts.amount, 149900);
  assert.equal(opts.theme.color, '#5e0b28');
  assert.equal(opts.modal.confirm_close, true);
  assert.equal(typeof opts.handler, 'function');
  assert.equal(CHECKOUT_SRC, 'https://checkout.razorpay.com/v1/checkout.js');
});

test('the ticket sound: a rising horn line resolving on a long B-flat over a warm chord', () => {
  const { ticket } = RITUAL_CUES;
  const horn = ticket.notes.map((n) => n.midi);
  assert.deepEqual(horn, [65, 70, 74, 77, 82]);
  assert.ok(ticket.notes.at(-1).dur >= 0.8 && ticket.notes.at(-1).vib > 0);
  assert.ok(ticket.length <= 2.5 && ticket.level <= 0.7);
});
