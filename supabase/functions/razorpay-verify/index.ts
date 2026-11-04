// razorpay-verify (D-177): Checkout's success handler posts { razorpay_order_id, razorpay_payment_id,
// razorpay_signature }. The signature is checked with the key secret; the order must be the caller's own hold; then
// confirm_event_payment (0022, service role only) confirms the seat and the ticket is emailed. If the hold had expired
// and the seat was taken meanwhile, the payment is refunded at once. Idempotent: razorpay-webhook may get there first.
//
// Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RESEND_API_KEY (the ticket).
import { CORS, json, adminClient, callerId } from '../_shared/http.ts';
import { verifyPaymentSignature } from '../_shared/razorpay.js';
import { sendTicket } from '../_shared/send-ticket.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!keyId || !keySecret) return json(503, { error: 'payments_not_configured' });
  const uid = await callerId(req);
  if (!uid) return json(401, { error: 'auth' });
  const body = await req.json().catch(() => ({}));
  const orderId = String(body.razorpay_order_id || '');
  const paymentId = String(body.razorpay_payment_id || '');
  if (!(await verifyPaymentSignature({ orderId, paymentId, signature: body.razorpay_signature, secret: keySecret }))) return json(400, { error: 'signature' });

  const admin = adminClient();
  const { data: rsvp } = await admin.from('event_rsvp').select('event_id,member_id').eq('payment_order_id', orderId).maybeSingle();
  if (!rsvp || rsvp.member_id !== uid) return json(404, { error: 'order' });
  const { data: outcome, error } = await admin.rpc('confirm_event_payment', { p_event: rsvp.event_id, p_member: uid, p_ref: paymentId });
  if (error) return json(500, { error: 'confirm' });
  if (outcome === 'full') {
    await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
      method: 'POST', headers: { authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, 'content-type': 'application/json' }, body: '{}',
    }).catch(() => null);
    return json(200, { status: 'full', refunded: true });
  }
  const ticket = await sendTicket(admin, rsvp.event_id, uid);
  return json(200, { status: 'confirmed', event_id: rsvp.event_id, ticket });
});
