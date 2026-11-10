// D-228 (founder 2026-11-10: "make the onboarding and app very smooth and fast"): while a member is on the sign-up or
// login page, the app's own files are fetched quietly in the background, so that finishing sign-up or logging in
// opens the app from the browser's cache instead of downloading ~560 KB first. The built files are immutable (vercel.json
// caches /assets for a year), so the app page uses exactly these. Plain low-priority fetch, not <link rel="prefetch">,
// because Safari does not support prefetch links. Skipped on Data Saver and 2G.

// The built scripts and styles a page loads: same-site /assets/*.js or *.css, each once.
export const appAssetUrls = (html) => {
  const found = String(html || '').match(/(?:src|href)="(\/assets\/[A-Za-z0-9._-]+\.(?:js|css))"/g) || [];
  return [...new Set(found.map((attr) => attr.slice(attr.indexOf('"') + 1, -1)))];
};

export const shouldPrefetch = (nav = {}) => {
  const c = nav?.connection;
  if (c?.saveData) return false;
  return !(c && /(^|-)2g$/.test(String(c.effectiveType || '')));
};

// Once per page, when the browser is idle. Errors are ignored: this only ever saves time.
export const prefetchApp = ({ page = '/app.html', win = globalThis.window } = {}) => {
  if (!win?.fetch || !shouldPrefetch(win.navigator)) return;
  const run = async () => {
    try {
      const res = await win.fetch(page, { credentials: 'same-origin', priority: 'low' });
      if (!res.ok) return;
      for (const url of appAssetUrls(await res.text())) {
        await win.fetch(url, { credentials: 'same-origin', priority: 'low' }).then((r) => r.arrayBuffer()).catch(() => {});
      }
    } catch { /* offline or blocked: the app simply loads as before */ }
  };
  if (win.requestIdleCallback) win.requestIdleCallback(() => { void run(); }, { timeout: 5000 });
  else win.setTimeout(() => { void run(); }, 2500);
};
