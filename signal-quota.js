// The honest signal quota copy (UX_SPEC §B "Signal counter", D-026, D-032). Pure formatting, no storage: the quota
// lives only on the server (my_signal_quota(), send_signal) and in memory for the current page.
//
// quota = { remaining, resets_at, live_unanswered?, live_limit? } as my_signal_quota() / send_signal return it.
// resets_at is already rounded up to the hour by the server; it is shown as-is, in the member's local time.

const DEFAULT_LIVE_LIMIT = 100;

export const resetTimeLabel = (resetsAt) => {
  if (!resetsAt) return '';
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const liveLimit = (quota) => {
  const limit = Number(quota?.live_limit);
  return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIVE_LIMIT;
};

// Why the next signal would be refused by the server: 'daily' (no signals left today), 'live' (too many signals are
// waiting for an answer) or null. An unknown quota never blocks: the server is the only judge.
export const quotaBlocked = (quota) => {
  if (!quota || !Number.isFinite(Number(quota.remaining))) return null;
  if (Number(quota.remaining) <= 0) return 'daily';
  const live = Number(quota.live_unanswered);
  if (Number.isFinite(live) && quota.live_limit != null && live >= liveLimit(quota)) return 'live';
  return null;
};

// The counter line: "N signals left today", "1 signal left today", or "More at HH:MM" at 0.
export const quotaLabel = (quota) => {
  const blocked = quotaBlocked(quota);
  if (!quota || !Number.isFinite(Number(quota.remaining))) return '';
  if (blocked === 'daily') {
    const time = resetTimeLabel(quota.resets_at);
    return time ? `More at ${time}` : 'No signals left today';
  }
  if (blocked === 'live') return `You have ${liveLimit(quota)} signals waiting for an answer`;
  const remaining = Number(quota.remaining);
  return `${remaining} ${remaining === 1 ? 'signal' : 'signals'} left today`;
};

// The toast for a refused send (HTTP 429, SQLSTATE PT429): only the sender's own caps are ever shown. Any other
// error returns null so the caller shows its generic message.
export const quotaErrorText = (error, quota) => {
  const message = String(error?.message || '');
  if (message.includes('signal_quota_exhausted')) {
    const time = resetTimeLabel(quota?.resets_at);
    return time ? `You've used today's signals. More at ${time}.` : "You've used today's signals.";
  }
  if (message.includes('signal_live_cap')) return `You have ${liveLimit(quota)} signals waiting for an answer.`;
  return null;
};
