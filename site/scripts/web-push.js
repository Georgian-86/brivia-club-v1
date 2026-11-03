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

const isIos = (nav) => /iPhone|iPad|iPod/.test(String(nav?.userAgent || '')) || (/Macintosh/.test(String(nav?.userAgent || '')) && Number(nav?.maxTouchPoints) > 1);
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

export const PUSH_COPY = Object.freeze({
  'ios-install': 'On iPhone, add Brivia to your Home Screen first (Share › Add to Home Screen), then turn this on there.',
  unsupported: "This browser can't show Brivia notifications.",
  denied: 'Notifications are blocked for Brivia. Allow them in your browser’s site settings, then try again.',
});

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
