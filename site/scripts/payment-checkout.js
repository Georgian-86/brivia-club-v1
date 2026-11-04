// Razorpay Checkout for a held event seat (D-166). The order comes from the razorpay-order Edge Function (the server sets
// the amount); this only opens Checkout and reports what happened. The seat is confirmed on the server
// (razorpay-verify, or razorpay-webhook if the tab closes), never here.
//
// openCheckout(order) resolves { status: 'paid', response } | { status: 'dismissed' } | { status: 'failed', reason }.

export const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const WINE = '#5e0b28';

// The options Razorpay Checkout takes, from the server's order answer (pure, unit-tested).
export const checkoutOptions = (order, handlers = {}) => ({
  key: order.key_id,
  order_id: order.order_id,
  amount: order.amount,
  currency: order.currency || 'INR',
  name: order.name || 'The Brivia Club',
  description: order.description || 'Event ticket',
  prefill: { name: order.prefill?.name || '', email: order.prefill?.email || '' },
  theme: { color: WINE, backdrop_color: 'rgba(42, 25, 26, 0.55)' },
  retry: { enabled: true, max_count: 3 },
  modal: { confirm_close: true, ondismiss: handlers.ondismiss },
  handler: handlers.handler,
});

let loading = null;
export const loadCheckout = (doc = globalThis.document, win = globalThis.window) => {
  if (win?.Razorpay) return Promise.resolve(win.Razorpay);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => (win.Razorpay ? resolve(win.Razorpay) : reject(new Error('checkout unavailable')));
    script.onerror = () => { loading = null; reject(new Error('checkout unavailable')); };
    doc.head.append(script);
  });
  return loading;
};

export const openCheckout = async (order, { doc = globalThis.document, win = globalThis.window } = {}) => {
  let Razorpay;
  try { Razorpay = await loadCheckout(doc, win); } catch { return { status: 'failed', reason: 'unavailable' }; }
  return new Promise((resolve) => {
    let settled = false;
    const done = (result) => { if (!settled) { settled = true; resolve(result); } };
    const checkout = new Razorpay(checkoutOptions(order, {
      handler: (response) => done({ status: 'paid', response }),
      ondismiss: () => done({ status: 'dismissed' }),
    }));
    // A failed attempt keeps Checkout open for a retry (retry.enabled); closing it afterwards is a dismissal.
    checkout.on?.('payment.failed', () => {});
    checkout.open();
  });
};
