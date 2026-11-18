// D-269: thebriviaclub.live hands a signed-in member over to thebriviaclub.com without a new sign-in.
//
// Browsers keep logins in storage per domain, so a plain domain 301 would sign every .live member out. Instead, on the
// bare .live host a person's page visit gets a tiny page that packs this browser's .live storage (the Supabase session
// and the app's own small preferences) into the URL fragment and moves to the same path on .com, where
// site/public/carry.js unpacks it before the app starts. The fragment never reaches a server. Crawlers, link previews,
// assets and anything that is not a page visit get a plain 301 with the path kept, so search engines see a permanent
// move. /sw.js stays served on .live so an existing push service worker keeps working.
//
// Vercel Routing Middleware (any framework): returning nothing lets the request continue to the static files.

export const PRIMARY = 'https://thebriviaclub.com';
export const OLD_HOSTS = ['thebriviaclub.live'];
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|slack|discord|embedly|linkedin|pinterest|vkshare|skype|headless|lighthouse|curl|wget|python|httpclient|go-http/i;

export const isPageVisit = (request) => {
  if (request.method !== 'GET') return false;
  const ua = request.headers.get('user-agent') || '';
  if (!ua || BOT.test(ua)) return false;
  const accept = request.headers.get('accept') || '';
  if (!accept.includes('text/html')) return false;
  const dest = request.headers.get('sec-fetch-dest');
  return !dest || dest === 'document';
};

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export const handoffPage = (target) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="canonical" href="${escapeAttr(target)}"><title>Brivia Club</title>
<script>
(function () {
  var target = ${JSON.stringify(target)};
  var dest = target + location.hash;
  try {
    var items = {}, size = 0, session = /^sb-.+-auth-token/;
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); items[k] = localStorage.getItem(k); size += k.length + items[k].length; }
    if (size > 48000) { for (var key in items) { if (!session.test(key) && key.indexOf('brivia-') !== 0) delete items[key]; } }
    if (Object.keys(items).length) {
      var json = JSON.stringify({ v: 1, items: items, hash: location.hash || '' });
      var bytes = new TextEncoder().encode(json), bin = '';
      for (var j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
      dest = target + '#brivia-carry=' + btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      // Move, not copy: the session now lives on .com, so a later .live visit cannot bring back a stale one.
      for (var s in items) { if (session.test(s)) localStorage.removeItem(s); }
    }
  } catch (e) { /* storage blocked: a plain move */ }
  location.replace(dest);
})();
</script></head>
<body style="background:#f5f1e9"><noscript><a href="${escapeAttr(target)}">Continue to Brivia Club</a></noscript></body></html>`;

export default function middleware(request) {
  const url = new URL(request.url);
  if (!OLD_HOSTS.includes(url.hostname)) return undefined;
  if (url.pathname === '/sw.js') return undefined;
  const target = PRIMARY + url.pathname + url.search;
  if (!isPageVisit(request)) return Response.redirect(target, 301);
  return new Response(handoffPage(target), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}
