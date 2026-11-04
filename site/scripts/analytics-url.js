// D-176: the URL that analytics may see. Sign-in hand-offs put one-time codes and tokens in the query and the hash
// (?code=…, #access_token=…), and invite or reset links can carry more, so every query parameter and the hash are
// dropped. Only `view` is kept, because the member app is one page and the view is the only way to tell its screens apart.
const KEEP = new Set(['view']);

export function scrubAnalyticsUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) if (KEEP.has(key)) kept.set(key, value);
  url.search = kept.toString();
  url.hash = '';
  return url.toString();
}

export function scrubAnalyticsEvent(event) {
  const url = scrubAnalyticsUrl(event && event.url);
  return url ? { ...event, url } : null;
}
