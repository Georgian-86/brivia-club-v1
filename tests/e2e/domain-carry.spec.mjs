// D-269: a member signed in on thebriviaclub.live stays signed in on thebriviaclub.com. Real Chromium; both domains are
// served in-process (middleware.js for .live, dist/ for .com). Needs `npm run build` first.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/e2e/domain-carry.spec.mjs
// DC1 a signed-in .live visit lands on the same path on .com, signed in, with the app's preferences; address bar clean.
// DC2 the session is moved, not copied: .live no longer holds it.
// DC3 a .com browser that already has a session keeps its own.
// DC4 a carry link that did not come from .live is ignored (no login by crafted link).
// DC5 a signed-out .live visit is a plain move to the same path.
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import middleware from '../../middleware.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const KEY = 'sb-abcdefghijklmnop-auth-token';
const SESSION = JSON.stringify({ access_token: 'at', refresh_token: 'rt', user: { id: 'u1', email: 'a@b.c' } });

const browser = await chromium.launch();
const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
await context.route(/^https:\/\/thebriviaclub\.(live|com)\//, async (route) => {
  const r = route.request();
  const url = new URL(r.url());
  if (url.hostname === 'thebriviaclub.live') {
    const res = middleware(new Request(r.url(), { method: r.method(), headers: await r.allHeaders() }));
    if (!res) return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>live</title>' });
    return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  try {
    const body = await readFile(join('dist', file));
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] || 'application/octet-stream', body });
  } catch { return route.fulfill({ status: 404, body: '' }); }
});
await context.route(/supabase\.co|vercel-insights|_vercel/, (route) => route.abort());

const page = await context.newPage();
const store = (p) => p.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));

// Seed .live storage as a signed-in member would have it.
await page.goto('https://thebriviaclub.live/sw.js');
await page.evaluate(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('brivia-emoji-tone', 'medium'); }, [KEY, SESSION]);

await page.goto('https://thebriviaclub.live/about.html?ref=x');
await page.waitForURL(/thebriviaclub\.com\/about\.html/);
await page.waitForLoadState('domcontentloaded');
const com = await store(page);
check('DC1 lands on the same path on .com', page.url() === 'https://thebriviaclub.com/about.html?ref=x', page.url());
check('DC1 the session came along', com[KEY] === SESSION, JSON.stringify(com));
check('DC1 preferences came along', com['brivia-emoji-tone'] === 'medium');

await page.goto('https://thebriviaclub.live/sw.js');
const live = await store(page);
check('DC2 .live no longer holds the session', !(KEY in live) && live['brivia-emoji-tone'] === 'medium', JSON.stringify(live));

// DC3: .com already signed in as someone else; .live has another session.
await page.evaluate(([k]) => localStorage.setItem(k, '{"other":1}'), [KEY]);
await page.goto('https://thebriviaclub.com/about.html');
await page.evaluate(([k]) => localStorage.setItem(k, '{"mine":1}'), [KEY]);
await page.goto('https://thebriviaclub.live/careers.html');
await page.waitForURL(/thebriviaclub\.com\/careers\.html/);
await page.waitForLoadState('domcontentloaded');
check('DC3 an existing .com session is kept', (await store(page))[KEY] === '{"mine":1}');

// DC4: a crafted carry link opened directly (no .live referrer).
await page.evaluate(([k]) => localStorage.removeItem(k), [KEY]);
const evil = Buffer.from(JSON.stringify({ v: 1, items: { [KEY]: '{"attacker":1}' }, hash: '' })).toString('base64url');
await page.goto(`https://thebriviaclub.com/privacy.html#brivia-carry=${evil}`);
await page.waitForLoadState('domcontentloaded');
check('DC4 a carry not from .live is ignored', (await store(page))[KEY] === undefined);
check('DC4 the fragment is still cleared', !page.url().includes('brivia-carry'), page.url());

// DC5: signed-out .live visit.
await page.goto('https://thebriviaclub.live/sw.js');
await page.evaluate(() => localStorage.clear());
const landed = page.waitForRequest((r) => r.isNavigationRequest() && r.url().startsWith('https://thebriviaclub.com/'));
await page.goto('https://thebriviaclub.live/privacy.html?x=2');
const first = await landed;
check('DC5 signed-out visit is a plain move to the same path', first.url() === 'https://thebriviaclub.com/privacy.html?x=2', first.url());
check('DC5 nothing carried', !first.url().includes('#'));

await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
