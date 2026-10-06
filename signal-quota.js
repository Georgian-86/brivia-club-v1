// The honest signal quota copy (UX_SPEC §B "Signal counter", D-026, D-032). Pure formatting, no storage: the quota
// lives only on the server (my_signal_quota(), send_signal) and in memory for the current page.
//
// quota = { remaining, resets_at, live_unanswered?, live_limit? } as my_signal_quota() / send_signal return it.
// resets_at is already rounded up to the hour by the server; it is shown in the member's local time as a plain hour
// ("3 PM", hour: 'numeric'). Minutes appear only for a time that is not on the hour (the server never sends one).

const DEFAULT_LIVE_LIMIT = 100;
const DEFAULT_DAILY_LIMIT = 30;

export const resetTimeLabel = (resetsAt) => {
  if (!resetsAt) return '';
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) return '';
  const options = date.getMinutes() === 0 ? { hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' };
  return date.toLocaleTimeString([], options);
};

const dailyLimit = (quota) => {
  const limit = Number(quota?.daily_limit);
  return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_DAILY_LIMIT;
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

// The counter line (iteration 3 R7): "N of 30 signals left · 24-hour window" (30 = daily_limit from my_signal_quota),
// and at 0 "Your next signal frees up at 3 PM". Without a reset time it never invents one.
export const quotaLabel = (quota) => {
  const blocked = quotaBlocked(quota);
  if (!quota || !Number.isFinite(Number(quota.remaining))) return '';
  if (blocked === 'live') return `You have ${liveLimit(quota)} signals waiting for an answer`;
  if (blocked === 'daily') {
    const time = resetTimeLabel(quota.resets_at);
    if (time) return `Your next signal frees up at ${time}`;
  }
  const remaining = Math.max(Number(quota.remaining), 0);
  return `${remaining} of ${dailyLimit(quota)} signals left · 24-hour window`;
};

// The notice beside the deck at a cap (empty when nothing blocks): it says plainly that no signal is left.
export const quotaNotice = (quota) => {
  const blocked = quotaBlocked(quota);
  if (blocked === 'daily') {
    const time = resetTimeLabel(quota.resets_at);
    return time ? `No signals left today. More at ${time} · Passing is always free.` : 'No signals left today · Passing is always free.';
  }
  if (blocked === 'live') return `You have ${liveLimit(quota)} signals waiting for an answer · Passing is always free.`;
  return '';
};

// The toast for a refused send (HTTP 429, SQLSTATE PT429): only the sender's own caps are ever shown. Any other
// error returns null so the caller shows its generic message. The cap messages count only with SQLSTATE PT429 or
// HTTP 429, so another error that happens to carry the same words is never mistaken for a cap.
export const quotaErrorText = (error, quota, status = 0) => {
  if (!(error?.code === 'PT429' || status === 429)) return null;
  const message = String(error?.message || '');
  if (message.includes('signal_quota_exhausted')) {
    const time = resetTimeLabel(quota?.resets_at);
    return time ? `You've used today's signals. More at ${time}.` : "You've used today's signals.";
  }
  if (message.includes('signal_live_cap')) return `You have ${liveLimit(quota)} signals waiting for an answer.`;
  return null;
};
