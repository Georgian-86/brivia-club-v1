// D-134: the shared notification store, the chime and web-push support. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemberNotifications, normalizeNotification, isFresh } from '../../site/scripts/member-notifications.js';
import { createChime, soundEnabled, setSoundEnabled, CHIME_NOTES } from '../../site/scripts/notify-sound.js';
import { pushSupport, urlBase64ToUint8Array, VAPID_PUBLIC_KEY, PUSH_COPY } from '../../site/scripts/web-push.js';

const row = (id, extra = {}) => ({ id, notification_type: 'nearby_appeared', source_user_id: `s-${id}`, name: `Person ${id}`, band: '1', created_at: new Date().toISOString(), read_at: null, dismissed_at: null, ...extra });
const harness = (rows) => {
  const server = { rows: rows.slice(), marked: [], dismissed: [] };
  const seen = { news: [], closed: [], changes: 0 };
  const store = createMemberNotifications({
    api: { list: async () => ({ data: server.rows }), markRead: async (ids) => { server.marked.push(...ids); return {}; }, dismiss: async (id) => { server.dismissed.push(id); return {}; } },
    subscribe: () => () => {},
    onNew: (n) => seen.news.push(n.id), onChange: () => { seen.changes += 1; }, closeSystem: (ids) => seen.closed.push(...ids),
  });
  return { store, server, seen };
};

test('what was already there when the app opened is not announced again', async () => {
  const h = harness([row('a')]);
  await h.store.start();
  assert.deepEqual(h.seen.news, []);
  assert.equal(h.store.unread().length, 1);
});

test('a new notification is announced once, never twice (Realtime insert, then a re-read)', async () => {
  const h = harness([]);
  await h.store.start();
  h.server.rows.push(row('b'));
  await h.store._insert({ id: 'b' });
  await h.store._insert({ id: 'b' });
  await h.store.load();
  assert.deepEqual(h.seen.news, ['b']);
});

test('an old or already-read row is never announced', async () => {
  const h = harness([]);
  await h.store.start();
  h.server.rows.push(row('old', { created_at: new Date(Date.now() - 3600 * 1000).toISOString() }), row('read', { read_at: new Date().toISOString() }));
  await h.store.load();
  assert.deepEqual(h.seen.news, []);
  assert.equal(isFresh(normalizeNotification(row('x'))), true);
});

test('read on another device: the Realtime update marks it read here and closes the system notification', async () => {
  const h = harness([row('c')]);
  await h.store.start();
  h.store._update({ id: 'c', read_at: new Date().toISOString() });
  assert.equal(h.store.unread().length, 0);
  assert.deepEqual(h.seen.closed, ['c']);
});

test('marking read: only unread ones go to the server, once; dismiss marks read too', async () => {
  const h = harness([row('d'), row('e')]);
  await h.store.start();
  await h.store.markRead(['d', 'd', 'zz']);
  await h.store.markRead(['d']);
  assert.deepEqual(h.server.marked, ['d']);
  await h.store.dismiss('e');
  assert.deepEqual(h.server.dismissed, ['e']);
  assert.equal(h.store.unread().length, 0);
  assert.ok(h.seen.closed.includes('d') && h.seen.closed.includes('e'));
});

test('the chime: never before an interaction, once per notification, and off when muted', () => {
  const nodes = [];
  const fakeCtx = function () { return { currentTime: 0, state: 'running', destination: {}, resume: async () => {},
    createGain: () => ({ gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (x) => x }),
    createOscillator: () => { const o = { type: '', frequency: { value: 0 }, connect: (x) => x, start() { nodes.push(o.frequency.value); }, stop() {} }; return o; } }; };
  const listeners = {};
  const doc = { addEventListener: (t, fn) => { listeners[t] = fn; } };
  let on = true;
  const chime = createChime({ win: { AudioContext: fakeCtx }, doc, enabled: () => on });
  assert.equal(chime.play('n1'), false);   // autoplay rules: nothing before an interaction
  listeners.pointerdown();
  assert.equal(chime.play('n1'), true);
  assert.equal(chime.play('n1'), false);   // never twice for one notification
  assert.equal(nodes.length, CHIME_NOTES.length);
  on = false;
  assert.equal(chime.play('n2'), false);
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(soundEnabled(storage), true);
  setSoundEnabled(false, storage);
  assert.equal(soundEnabled(storage), false);
});

test('web push: iPhone in a Safari tab must add to Home Screen; denied and unsupported say so; the VAPID key is a P-256 point', () => {
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', serviceWorker: {} };
  const winTab = { isSecureContext: true, PushManager: {}, Notification: { permission: 'default' }, navigator: { standalone: false }, matchMedia: () => ({ matches: false }) };
  assert.equal(pushSupport({ win: winTab, nav: iphone }), 'ios-install');
  assert.equal(pushSupport({ win: { ...winTab, navigator: { standalone: true } }, nav: iphone }), 'ready');
  const desktop = { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/130', serviceWorker: {} };
  assert.equal(pushSupport({ win: { ...winTab, Notification: { permission: 'denied' } }, nav: desktop }), 'denied');
  assert.equal(pushSupport({ win: { isSecureContext: true }, nav: { userAgent: 'x' } }), 'unsupported');
  assert.match(PUSH_COPY['ios-install'], /Add to Home Screen/);
  const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  assert.equal(key.length, 65);
  assert.equal(key[0], 4);
});
