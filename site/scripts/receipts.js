// Delivered, Read and last active (D-150, migration 0042). Pure helpers, no DOM, no network.
//
// A message the member sent shows one tick when it is stored (Sent), two when it reached the other member's app
// (Delivered) and two in the brand's warm accent when they opened the conversation (Read). The server sets the times;
// before 0042 there are none, so every message shows Sent and nothing more.

export const receiptState = (message) => {
  if (!message || message.from !== 'me') return '';
  if (message.readAt) return 'read';
  if (message.deliveredAt) return 'delivered';
  return 'sent';
};

const LABEL = { sent: 'Sent', delivered: 'Delivered', read: 'Read' };
const ONE = '<path d="M1.6 6.4 4.3 9 9.6 3.2"/>';
const TWO = '<path d="M1.2 6.4 3.9 9 9.2 3.2"/><path d="M6.6 8.4 7.2 9l5.3-5.8"/>';

export const receiptMarkup = (state) => {
  if (!LABEL[state]) return '';
  const label = LABEL[state];
  return `<span class="message-receipt is-${state}" role="img" aria-label="${label}" title="${label}"><svg viewBox="0 0 14 12" aria-hidden="true">${state === 'sent' ? ONE : TWO}</svg></span>`;
};

// Only the newest of the member's own messages says the word ("Seen", "Delivered"): every bubble keeps its tick.
export const lastOwnMessageId = (messages) => {
  const list = messages || [];
  for (let i = list.length - 1; i >= 0; i -= 1) if (list[i]?.from === 'me') return String(list[i].id ?? '');
  return '';
};

// Applies a server row's receipt times to a message list; returns the same array when nothing changed.
export const applyReceipt = (messages, row) => {
  if (!Array.isArray(messages) || !row?.id) return messages;
  const index = messages.findIndex((m) => String(m.id) === String(row.id));
  if (index < 0) return messages;
  const current = messages[index];
  const deliveredAt = row.delivered_at || current.deliveredAt || '';
  const readAt = row.read_at || current.readAt || '';
  if (deliveredAt === (current.deliveredAt || '') && readAt === (current.readAt || '')) return messages;
  const next = messages.slice();
  next[index] = { ...current, deliveredAt, readAt };
  return next;
};

// Incoming messages the member has on screen but the server does not know they read yet.
export const needsReadReceipt = (messages) => (messages || []).some((m) => m?.from === 'them' && !m.readAt);
export const needsDeliveredReceipt = (rows, memberId) => (rows || []).some((r) => String(r?.recipient_id) === String(memberId) && !r.delivered_at && !r.read_at);

// "Active now" · "Active 5 min ago" · "Active 2 h ago" · "Active yesterday" · "Active 28 Oct" · ''.
export const lastActiveLabel = (active, lastSeenAt, now = Date.now()) => {
  if (active) return 'Active now';
  const at = Date.parse(lastSeenAt || '');
  if (!Number.isFinite(at)) return '';
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  if (minutes < 3) return 'Active now';
  if (minutes < 60) return `Active ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours} h ago`;
  const seen = new Date(at);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (at >= startOfToday - 86400000) return 'Active yesterday';
  const sameYear = seen.getFullYear() === today.getFullYear();
  return `Active ${seen.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })}`;
};
