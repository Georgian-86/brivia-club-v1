import test from 'node:test';
import assert from 'node:assert/strict';
import middleware, { isPageVisit, handoffPage } from '../../middleware.js';

const BROWSER = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', accept: 'text/html,application/xhtml+xml', 'sec-fetch-dest': 'document' };
const req = (url, headers = BROWSER, method = 'GET') => new Request(url, { headers, method });

test('the .com site and previews pass straight through', () => {
  assert.equal(middleware(req('https://thebriviaclub.com/app.html')), undefined);
  assert.equal(middleware(req('https://brivia-club-git-x-golus-projects.vercel.app/')), undefined);
});

test('a person opening a .live page gets the hand-off page aimed at the same path on .com', async () => {
  const res = middleware(req('https://thebriviaclub.live/explore.html?post=42'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
  const html = await res.text();
  assert.match(html, /var target = "https:\/\/thebriviaclub\.com\/explore\.html\?post=42";/);
  assert.match(html, /location\.replace\(dest\)/);
});

test('crawlers, previews, assets and non-GET get a real 301 with the path kept', () => {
  for (const r of [
    req('https://thebriviaclub.live/about.html?x=1', { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)', accept: 'text/html' }),
    req('https://thebriviaclub.live/', { 'user-agent': 'WhatsApp/2.23', accept: 'text/html' }),
    req('https://thebriviaclub.live/og-image.jpg', { ...BROWSER, accept: 'image/avif,image/*', 'sec-fetch-dest': 'image' }),
    req('https://thebriviaclub.live/app.html', BROWSER, 'HEAD'),
    req('https://thebriviaclub.live/app.html', { accept: 'text/html' }),
  ]) {
    const res = middleware(r);
    assert.equal(res.status, 301, r.url);
    const u = new URL(r.url);
    assert.equal(res.headers.get('location'), `https://thebriviaclub.com${u.pathname}${u.search}`);
  }
});

test('the push service worker stays served on .live', () => {
  assert.equal(middleware(req('https://thebriviaclub.live/sw.js', { ...BROWSER, accept: '*/*', 'sec-fetch-dest': 'serviceworker' })), undefined);
});

test('isPageVisit needs a browser asking for a document', () => {
  assert.equal(isPageVisit(req('https://x/', BROWSER)), true);
  assert.equal(isPageVisit(req('https://x/', { ...BROWSER, 'sec-fetch-dest': 'iframe' })), false);
});

test('the target is escaped in the noscript link', () => {
  assert.doesNotMatch(handoffPage('https://thebriviaclub.com/"><x'), /href="https:\/\/thebriviaclub\.com\/"><x/);
});
