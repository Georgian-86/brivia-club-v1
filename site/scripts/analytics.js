// D-176: Vercel Web Analytics (page views) and Speed Insights (Core Web Vitals). Both are cookieless and keep no
// per-visitor identifier across days; URLs are scrubbed first (analytics-url.js). They only report on the deployed
// site: in `vite dev` the scripts log to the console instead of sending anything.
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { scrubAnalyticsEvent } from './analytics-url.js';

try {
  inject({ beforeSend: scrubAnalyticsEvent });
  injectSpeedInsights({ beforeSend: scrubAnalyticsEvent });
} catch {
  // Analytics must never break a page.
}
