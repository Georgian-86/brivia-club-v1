// Razorpay helpers shared by razorpay-order, razorpay-verify and razorpay-webhook (D-177). Plain JavaScript with Web
// Crypto only, so the same file runs in the Edge runtime (Deno) and in the Node unit tests
// (tests/unit/event-payments.test.mjs).
//
// Razorpay's rules (https://razorpay.com/docs/payments/server-integration/):
//   * Checkout success: signature = HMAC-SHA256(order_id + "|" + payment_id, key_secret), hex.
//   * Webhook: X-Razorpay-Signature = HMAC-SHA256(raw request body, webhook_secret), hex.
//   * Orders are created server-side with the amount in paise; the browser never decides the price.

const encoder = new TextEncoder();

export const hmacSha256Hex = async (secret, message) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(String(message)));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

// Constant-time comparison of two hex strings (no early exit on the first differing character).
export const safeEqualHex = (a, b) => {
  const x = String(a || '').toLowerCase();
  const y = String(b || '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(x) || !/^[0-9a-f]+$/.test(y)) return false;
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
};

const ID = /^[A-Za-z0-9_]{6,40}$/;
export const verifyPaymentSignature = async ({ orderId, paymentId, signature, secret }) => {
  if (!secret || !ID.test(String(orderId || '')) || !ID.test(String(paymentId || ''))) return false;
  return safeEqualHex(await hmacSha256Hex(secret, `${orderId}|${paymentId}`), signature);
};
export const verifyWebhookSignature = async ({ body, signature, secret }) => {
  if (!secret || typeof body !== 'string' || !signature) return false;
  return safeEqualHex(await hmacSha256Hex(secret, body), signature);
};

// The order for one held seat: the fee in paise, INR, a short receipt, and the ids in notes (the webhook matches on
// the stored order id first; the notes are only a fallback for support).
export const orderRequest = ({ feeInr, eventId, memberId }) => {
  const rupees = Math.round(Number(feeInr));
  if (!Number.isFinite(rupees) || rupees < 1 || rupees > 500000) throw new Error('invalid fee');
  return {
    amount: rupees * 100,
    currency: 'INR',
    receipt: `brv_${String(eventId).slice(0, 8)}_${String(memberId).slice(0, 8)}`,
    notes: { event_id: String(eventId), member_id: String(memberId) },
  };
};

// A hold counts while it is pending payment and under 30 minutes old (0022: brivia_rsvp_active).
export const HOLD_MS = 30 * 60 * 1000;
export const holdActive = (rsvp, now = Date.now()) => rsvp?.status === 'pending_payment' && now - Date.parse(rsvp.created_at || '') < HOLD_MS;
