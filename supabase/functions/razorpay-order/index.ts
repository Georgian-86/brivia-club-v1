// razorpay-order (D-166): creates the Razorpay order for the caller's held seat. Body { event_id }. The amount is the
// event's fee from the database (never the browser's); the hold must be live (pending payment, under 30 minutes; the
// app places it first with set_event_rsvp). Answers what Razorpay Checkout needs, or { status: 'confirmed' } when the
// seat is already paid.
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.
import { CORS, json, adminClient, callerId, UUID } from '../_shared/http.ts';
import { orderRequest, holdActive } from '../_shared/razorpay.js';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!keyId || !keySecret) return json(503, { error: 'payments_not_configured' });
  const uid = await callerId(req);
  if (!uid) return json(401, { error: 'auth' });
  const { event_id: eventId } = await req.json().catch(() => ({}));
  if (!UUID.test(String(eventId || ''))) return json(400, { error: 'event' });

  const admin = adminClient();
  const [{ data: event }, { data: rsvp }, { data: profile }, { data: user }] = await Promise.all([
    admin.from('club_event').select('id,title,fee_inr,is_published,cancelled_at,starts_at').eq('id', eventId).maybeSingle(),
    admin.from('event_rsvp').select('status,created_at,payment_order_id').eq('event_id', eventId).eq('member_id', uid).maybeSingle(),
    admin.from('profiles').select('name,full_name').eq('id', uid).maybeSingle(),
    admin.auth.admin.getUserById(uid),
  ]);
  if (!event || !event.is_published || event.cancelled_at || !(event.fee_inr > 0)) return json(409, { error: 'not_payable' });
  if (rsvp?.status === 'confirmed') return json(200, { status: 'confirmed' });
  if (!holdActive(rsvp)) return json(409, { error: 'hold_expired' });

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, 'content-type': 'application/json' },
    body: JSON.stringify(orderRequest({ feeInr: event.fee_inr, eventId, memberId: uid })),
  });
  const order = await res.json().catch(() => null);
  if (!res.ok || !order?.id) return json(502, { error: 'order_failed' });
  const { error: saveError } = await admin.from('event_rsvp').update({ payment_order_id: order.id }).eq('event_id', eventId).eq('member_id', uid);
  if (saveError) return json(500, { error: 'order_not_saved' });
  return json(200, {
    status: 'pending', key_id: keyId, order_id: order.id, amount: order.amount, currency: order.currency,
    name: 'The Brivia Club', description: String(event.title || 'Event ticket').slice(0, 250),
    prefill: { name: profile?.full_name || profile?.name || '', email: user?.user?.email || '' },
  });
});
