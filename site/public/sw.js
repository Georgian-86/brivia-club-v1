// Brivia service worker (D-134): Web Push only (no caching). A push shows one system notification per notification id
// (the tag), unless a Brivia tab is in front: then the page shows it in place instead (no duplicate). When a
// notification is read on any device, open pages tell this worker to close the system notification with that tag.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const front = pages.find((page) => page.focused || page.visibilityState === 'visible');
    // D-265: the daily nudges always go to the phone's own notification screen, even with Brivia open (founder: "i want
    // the notifications on the phone screen not in app notifications"). Everything else is shown in place when open.
    if (front && data.type !== 'nudge') { pages.forEach((page) => page.postMessage({ type: 'brivia-push', data })); return; }
    // D-138: the member's per-device "Push notification sound" choice, written by the page into Cache Storage (the
    // worker cannot read localStorage). Off: the system notification arrives silently (Android, desktop; iOS decides
    // in its own Settings > Notifications).
    let silent = false;
    try {
      const prefs = await (await caches.open('brivia-prefs')).match('/__brivia-prefs');
      if (prefs) silent = Boolean((await prefs.json()).pushSilent);
    } catch { silent = false; }
    await self.registration.showNotification(data.title || 'Brivia Club', {
      silent,
      body: data.body || 'Someone interesting crossed your path.',
      tag: data.tag || data.id || 'brivia',
      icon: '/apple-touch-icon.png',
      badge: '/favicon.svg',
      data: { url: data.url || '/app.html?view=nearby', id: data.id || null },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/app.html?view=nearby', self.location.origin).href;
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = pages.find((page) => page.url.startsWith(self.location.origin));
    if (open) { await open.focus(); open.postMessage({ type: 'brivia-open', url: target, id: event.notification.data?.id || null }); return; }
    await self.clients.openWindow(target);
  })());
});

// Read on another device (or in this page): close the system notifications for those ids.
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type !== 'brivia-close' || !Array.isArray(msg.ids)) return;
  event.waitUntil(self.registration.getNotifications().then((list) => {
    list.forEach((n) => { if (msg.ids.includes(n.tag)) n.close(); });
  }));
});
