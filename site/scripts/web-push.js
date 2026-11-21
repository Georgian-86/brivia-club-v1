// Web notifications on this device (D-134). Optional and separate from location: a member turns them on in Settings,
// the browser asks for permission, the device's push subscription is stored (save_push_subscription, 0030) and the
// push-notify Edge Function sends to it. Off: the subscription is removed here and on the server.
// iPhone and iPad: web push works only for Brivia added to the Home Screen (iOS 16.4+); in a Safari tab it is said so.

// The VAPID public key is public by design (it identifies the sender to push services); the private key lives only in
// the Edge Function's secrets.
export const VAPID_PUBLIC_KEY = (import.meta.env?.VITE_VAPID_PUBLIC_KEY)
  || 'BGrzc-xQZBjPqwlgTMXdV7IXMysW66pmwG0c7hgIDn7-Vv44Cqfo4FN5_3htdTijwdilvKCa-6ivG3SrUoFRMD4';

export const urlBase64ToUint8Array = (base64) => {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = globalThis.atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const isIos = (nav) => /iPhone|iPad|iPod/.test(String(nav?.userAgent || '')) || (/Macintosh/.test(String(nav?.userAgent || '')) && Number(nav?.maxTouchPoints) > 1);
const standalone = (win) => Boolean(win?.navigator?.standalone) || Boolean(win?.matchMedia?.('(display-mode: standalone)')?.matches);

// What this device can do: 'unsupported' | 'ios-install' | 'denied' | 'ready' (can be turned on or is on).
export const pushSupport = ({ win = globalThis.window, nav = globalThis.navigator } = {}) => {
  if (!win?.isSecureContext || !nav?.serviceWorker || !('PushManager' in (win || {})) || !('Notification' in (win || {}))) {
    return isIos(nav) && !standalone(win) ? 'ios-install' : 'unsupported';
  }
  if (isIos(nav) && !standalone(win)) return 'ios-install';
  if (win.Notification.permission === 'denied') return 'denied';
  return 'ready';
};

// D-245: which iPhone browser this is, for the install steps. Only Safari and Chrome can add Brivia to the Home Screen
// in a way that gets notifications; inside another app (Instagram, WhatsApp, the Google app) Brivia opens in Safari first.
export const iosBrowser = (nav = globalThis.navigator) => {
  const ua = String(nav?.userAgent || '');
  if (/Instagram|FBAN|FBAV|FB_IAB|WhatsApp|Line\/|LinkedInApp|Snapchat|Twitter|GSA\//.test(ua)) return 'inapp';
  if (/CriOS/.test(ua)) return 'chrome';
  if (/FxiOS|EdgiOS|OPiOS|DuckDuckGo|Brave/.test(ua)) return 'other';
  return 'safari';
};
const SHARE = 'the Share button (a square with an arrow)';
export const installSteps = (browser) => {
  if (browser === 'safari') return [`Tap ${SHARE} at the bottom of Safari.`, 'Scroll down and tap “Add to Home Screen”, then “Add”.', 'Open Brivia from its new icon on your Home Screen.', 'Go to Settings and turn on Web notifications, then tap “Allow”.'];
  if (browser === 'chrome') return [`Tap ${SHARE} at the top right of Chrome.`, 'Tap “Add to Home Screen”, then “Add”.', 'Open Brivia from its new icon on your Home Screen.', 'Go to Settings and turn on Web notifications, then tap “Allow”.'];
  return ['Open thebriviaclub.com in Safari: tap ••• or the compass icon and choose “Open in Safari” (or copy the link below and paste it in Safari).', `In Safari, tap ${SHARE}, then “Add to Home Screen”.`, 'Open Brivia from its new icon on your Home Screen.', 'Go to Settings and turn on Web notifications, then tap “Allow”.'];
};

export const PUSH_COPY = Object.freeze({
  'ios-install': 'On iPhone, notifications work once Brivia is on your Home Screen. Tap the switch to see how (it takes 20 seconds).',
  unsupported: "This browser can't show Brivia notifications.",
  denied: 'Notifications are blocked for Brivia on this device. iPhone: Settings app › Notifications › Brivia › Allow. Android: tap the lock by the address, then Permissions › Notifications › Allow. Then try again.',
  // D-276: an icon added while the site was thebriviaclub.live keeps its permission on .live; since D-268 the app
  // opens .com inside that icon as an outside page, where iPhone reports notifications as blocked whatever Settings says.
  'denied-ios': 'Notifications are blocked for this Brivia icon. If Settings › Notifications › Brivia already says Allow, your icon is from before we moved to thebriviaclub.com: delete the Brivia icon from your Home Screen, open thebriviaclub.com in Safari, tap Share › Add to Home Screen, open the new icon and turn this on again.',
});

// The status line for a reason, worded for this device.
export const pushCopy = (reason, nav = globalThis.navigator) => (reason === 'denied' && isIos(nav) ? PUSH_COPY['denied-ios'] : PUSH_COPY[reason]);

export const createWebPush = ({ save, remove, win = globalThis.window, nav = globalThis.navigator, key = VAPID_PUBLIC_KEY } = {}) => {
  let registration = null;
  const register = async () => {
    if (registration) return registration;
    registration = await nav.serviceWorker.register('/sw.js', { scope: '/' });
    return registration;
  };
  const current = async () => {
    if (pushSupport({ win, nav }) !== 'ready') return null;
    const reg = await register();
    return reg.pushManager.getSubscription();
  };
  // On: permission (the browser asks once), subscribe, store. Returns { ok, reason? }.
  const enable = async () => {
    const support = pushSupport({ win, nav });
    if (support !== 'ready') return { ok: false, reason: support };
    const permission = win.Notification.permission === 'granted' ? 'granted' : await win.Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'denied' };
    const reg = await register();
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    const raw = sub.toJSON();
    const { error } = await save(raw.endpoint, raw.keys?.p256dh, raw.keys?.auth);
    if (error) return { ok: false, reason: 'save' };
    return { ok: true };
  };
  const disable = async () => {
    const sub = await current().catch(() => null);
    if (sub) { await remove(sub.endpoint).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
    return { ok: true };
  };
  const isOn = async () => Boolean(await current().catch(() => null)) && win.Notification?.permission === 'granted';
  // Close the system notifications with these ids (read on another device or here).
  const closeSystem = async (ids) => {
    try {
      const reg = registration || await nav.serviceWorker?.getRegistration?.('/');
      reg?.active?.postMessage({ type: 'brivia-close', ids });
    } catch { /* nothing to close */ }
  };
  return { enable, disable, isOn, closeSystem, register };
};
