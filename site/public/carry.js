// D-269: the .com half of the .live → .com hand-off (the .live half is /middleware.js). Runs as a classic script at
// the top of every page, before the app's modules and the Supabase client read storage. It accepts a carry only when
// the previous page was on thebriviaclub.live, never overwrites a session this browser already has on .com, and never
// overwrites a value already set here. The fragment is removed from the address bar first, whatever happens.
(function () {
  try {
    var m = /^#brivia-carry=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (!m) return;
    history.replaceState(history.state, '', location.pathname + location.search);
    if (!/^https:\/\/thebriviaclub\.live(\/|$)/.test(document.referrer || '')) return;
    var b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    var bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || data.v !== 1 || !data.items) return;
    var session = /^sb-.+-auth-token/, hasSession = false;
    for (var j = 0; j < localStorage.length; j++) { if (session.test(localStorage.key(j))) hasSession = true; }
    for (var key in data.items) {
      var value = data.items[key];
      if (typeof value !== 'string') continue;
      if (session.test(key) && hasSession) continue;
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    }
    if (typeof data.hash === 'string' && /^#/.test(data.hash) && data.hash.indexOf('brivia-carry') < 0) {
      history.replaceState(history.state, '', location.pathname + location.search + data.hash);
    }
  } catch (e) { /* a bad carry is ignored: the member simply signs in */ }
})();
