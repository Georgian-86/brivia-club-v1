// razorpay-webhook (D-166): Razorpay's server-to-server notice, so a seat is confirmed (and its ticket sent) even when
// the member closed the tab mid-payment. Deploy with JWT verification off (Razorpay sends no Supabase token); every
// request is authenticated by X-Razorpay-Signature over the raw body. Events: payment.captured and order.paid.
// Matching is by the order id stored on the hold (razorpay-order), never by the notes alone. Idempotent.
//
// Secrets: RAZORPAY_WEBHOOK_SECRET (set in Razorpay > Webhooks), RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (refunds),
// RESEND_API_KEY (the ticket).
import { json, adminClient } from '../_shared/http.ts';
import { verifyWebhookSignature } from '../_shared/razorpay.js';
import { sendTicket } from '../_shared/send-ticket.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
  if (!secret) return json(503, { error: 'webhook_not_configured' });
  const raw = await req.text();
  if (!(await verifyWebhookSignature({ body: raw, signature: req.headers.get('x-razorpay-signature'), secret }))) return json(401, { error: 'signature' });
  let payload: any = null;
  try { payload = JSON.parse(raw); } catch { return json(400, { error: 'body' }); }
  if (!['payment.captured', 'order.paid'].includes(payload?.event)) return json(200, { ignored: payload?.event || 'unknown' });
  const payment = payload?.payload?.payment?.entity;
  const orderId = payment?.order_id || payload?.payload?.order?.entity?.id;
  const paymentId = payment?.id;
  if (!orderId || !paymentId) return json(200, { ignored: 'no_payment' });

  const admin = adminClient();
  const { data: rsvp } = await admin.from('event_rsvp').select('event_id,member_id').eq('payment_order_id', orderId).maybeSingle();
  if (!rsvp) return json(200, { ignored: 'unknown_order' });
  const { data: outcome, error } = await admin.rpc('confirm_event_payment', { p_event: rsvp.event_id, p_member: rsvp.member_id, p_ref: paymentId });
  if (error) return json(500, { error: 'confirm' });
  if (outcome === 'full') {
    const keyId = Deno.env.get('RAZORPAY_KEY_ID'); const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    if (keyId && keySecret) {
      await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
        method: 'POST', headers: { authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`, 'content-type': 'application/json' }, body: '{}',
      }).catch(() => null);
    }
    return json(200, { status: 'full' });
  }
  const ticket = await sendTicket(admin, rsvp.event_id, rsvp.member_id);
  return json(200, { status: 'confirmed', ticket });
});
