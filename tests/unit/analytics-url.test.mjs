import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubAnalyticsUrl, scrubAnalyticsEvent } from '../../site/scripts/analytics-url.js';

const B = 'https://thebriviaclub.com';

test('drops sign-in codes and tokens from the query and hash', () => {
  assert.equal(scrubAnalyticsUrl(`${B}/app.html?oauth=1&code=abc123#access_token=x&refresh_token=y`), `${B}/app.html`);
  assert.equal(scrubAnalyticsUrl(`${B}/auth.html#type=recovery&access_token=x`), `${B}/auth.html`);
});

test('keeps only the app view', () => {
  assert.equal(scrubAnalyticsUrl(`${B}/app.html?view=chat&thread=42`), `${B}/app.html?view=chat`);
  assert.equal(scrubAnalyticsUrl(`${B}/`), `${B}/`);
});

test('an event with an unreadable URL is not sent', () => {
  assert.equal(scrubAnalyticsEvent({ type: 'pageview', url: 'not a url' }), null);
  assert.equal(scrubAnalyticsEvent(undefined), null);
  assert.deepEqual(scrubAnalyticsEvent({ type: 'pageview', url: `${B}/careers.html?ref=x` }), { type: 'pageview', url: `${B}/careers.html` });
});
