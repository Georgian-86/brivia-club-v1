// The honest signal quota copy (UX_SPEC §B "Signal counter", D-026, D-032). Pure formatting, no storage: the quota
// lives only on the server (my_signal_quota(), send_signal) and in memory for the current page.
//
// quota = { remaining, resets_at, live_unanswered?, live_limit? } as my_signal_quota() / send_signal return it.
// D-156 (0045): the daily count is swipes, not only signals: a Pass and a Pitch on the deck each use one of the 10 free
// swipes a day (rolling 24 h), so at the daily cap Pass is blocked too. The live cap (unanswered signals) blocks Pitch only.
// resets_at is rounded up to the UTC hour by the server, so in a zone with a 30 or 45 minute offset (India, +5:30) it is
// not on the local hour. It is shown in the member's local time via toLocaleTimeString: "3 PM" when on the hour,
// "8:30 PM" otherwise (hour: 'numeric', plus minute: '2-digit' only when the minutes are not 0).

const DEFAULT_LIVE_LIMIT = 100;
const DEFAULT_DAILY_LIMIT = 10;

export const resetTimeLabel = (resetsAt) => {
  if (!resetsAt) return '';
  const date = new Date(resetsAt);
  if (Number.isNaN(date.getTime())) return '';
  const options = date.getMinutes() === 0 ? { hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' };
  return date.toLocaleTimeString([], options);
};

// D-261 (0079): a member on the unlimited list gets a limit of 100000 from the server; the app says "Unlimited swipes".
export const UNLIMITED_SWIPES = 100000;
export const isUnlimitedQuota = (quota) => Number(quota?.daily_limit) >= UNLIMITED_SWIPES;

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

// The counter line (iteration 3 R7; plain words since D-096; swipes since D-156): "N of 10 swipes left today" (10 =
// daily_limit from my_signal_quota), and at 0 "Your next swipe frees up at 3 PM". Without a reset time it never invents one.
export const quotaLabel = (quota) => {
  const blocked = quotaBlocked(quota);
  if (!quota || !Number.isFinite(Number(quota.remaining))) return '';
  if (isUnlimitedQuota(quota) && !blocked) return 'Unlimited swipes';
  if (blocked === 'live') return `You have ${liveLimit(quota)} signals waiting for an answer`;
  if (blocked === 'daily') {
    const time = resetTimeLabel(quota.resets_at);
    if (time) return `Your next swipe frees up at ${time}`;
  }
  const remaining = Math.max(Number(quota.remaining), 0);
  return `${remaining} of ${dailyLimit(quota)} swipes left today`;
};

// The notice beside the deck at a cap (empty when nothing blocks): it says plainly that no swipe is left.
export const quotaNotice = (quota) => {
  const blocked = quotaBlocked(quota);
  if (blocked === 'daily') {
    const time = resetTimeLabel(quota.resets_at);
    return time ? `You've used your ${dailyLimit(quota)} free swipes for today. More at ${time}.` : "You've used your free swipes for today.";
  }
  if (blocked === 'live') return `You have ${liveLimit(quota)} signals waiting for an answer. Passing is always free.`;
  return '';
};

// The toast for a refused send (HTTP 429, SQLSTATE PT429): only the sender's own caps are ever shown. Any other
// error returns null so the caller shows its generic message. The cap messages count only with SQLSTATE PT429 or
// HTTP 429, so another error that happens to carry the same words is never mistaken for a cap.
export const quotaErrorText = (error, quota, status = 0) => {
  if (!(error?.code === 'PT429' || status === 429)) return null;
  const message = String(error?.message || '');
  if (message.includes('signal_quota_exhausted') || message.includes('swipe_quota_exhausted')) {
    const time = resetTimeLabel(quota?.resets_at);
    return time ? `You've used today's swipes. More at ${time}.` : "You've used today's swipes.";
  }
  if (message.includes('signal_live_cap')) return `You have ${liveLimit(quota)} signals waiting for an answer.`;
  return null;
};

// D-225 (founder 2026-11-10: "display the message that free swipes over, fresh swipes tomm clearly on screen when the
// user tries to send requests"): the limit is said inside the request dialog, not in a toast that a modal can cover.
// When fresh swipes come, in the member's own day: "later today at 3 PM", "tomorrow at 3 PM", "on Friday at 9 AM".
// Without a reset time it says "tomorrow" (the window is a rolling 24 h); a reset time already past never claims a time.
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const freshSwipesLine = (resetsAt, now = new Date()) => {
  const time = resetTimeLabel(resetsAt);
  if (!time) return 'Fresh swipes tomorrow.';
  const at = new Date(resetsAt);
  if (at.getTime() <= now.getTime()) return 'Fresh swipes soon. Try again in a moment.';
  const days = Math.round((dayStart(at) - dayStart(now)) / 86400000);
  if (days <= 0) return `Fresh swipes later today at ${time}.`;
  if (days === 1) return `Fresh swipes tomorrow at ${time}.`;
  return `Fresh swipes on ${at.toLocaleDateString([], { weekday: 'long' })} at ${time}.`;
};

// The in-dialog limit: { kind: 'daily' | 'live', title, body } or null. From the cached quota, or from a refused send
// (PT429 / HTTP 429 with the cap's name), since the cache can be behind the server.
export const swipeLimitCopy = (quota, now = new Date(), error = null) => {
  const capped = Boolean(error) && (error.code === 'PT429' || error.status === 429);
  const message = capped ? String(error.message || '') : '';
  const kind = message.includes('signal_live_cap') ? 'live'
    : message.includes('signal_quota_exhausted') || message.includes('swipe_quota_exhausted') ? 'daily'
      : quotaBlocked(quota);
  if (kind === 'daily') {
    return {
      kind,
      title: "You're out of free swipes",
      body: `You've used all ${dailyLimit(quota)} of today's free swipes, so this request wasn't sent. ${freshSwipesLine(quota?.resets_at, now)}`,
    };
  }
  if (kind === 'live') {
    return {
      kind,
      title: 'Too many requests waiting',
      body: `You have ${liveLimit(quota)} requests waiting for an answer, so this request wasn't sent. Passing is always free.`,
    };
  }
  return null;
};
