// D-134: the shared notification store, the chime and web-push support. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemberNotifications, normalizeNotification, isFresh } from '../../site/scripts/member-notifications.js';
import { pushSupport, urlBase64ToUint8Array, VAPID_PUBLIC_KEY, PUSH_COPY, iosBrowser, installSteps } from '../../site/scripts/web-push.js';

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

test('web push: iPhone in a Safari tab must add to Home Screen; denied and unsupported say so; the VAPID key is a P-256 point', () => {
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', serviceWorker: {} };
  const winTab = { isSecureContext: true, PushManager: {}, Notification: { permission: 'default' }, navigator: { standalone: false }, matchMedia: () => ({ matches: false }) };
  assert.equal(pushSupport({ win: winTab, nav: iphone }), 'ios-install');
  assert.equal(pushSupport({ win: { ...winTab, navigator: { standalone: true } }, nav: iphone }), 'ready');
  const desktop = { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/130', serviceWorker: {} };
  assert.equal(pushSupport({ win: { ...winTab, Notification: { permission: 'denied' } }, nav: desktop }), 'denied');
  assert.equal(pushSupport({ win: { isSecureContext: true }, nav: { userAgent: 'x' } }), 'unsupported');
  assert.match(PUSH_COPY['ios-install'], /Home Screen/);
  const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  assert.equal(key.length, 65);
  assert.equal(key[0], 4);
});

// D-151 (0043): likes and comments on my notes.
import { groupPostNotifications, postNotificationCopy } from '../../site/scripts/member-notifications.js';
test('groupPostNotifications: likes per note in one row, each comment its own row, newest first', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  const n = (id, type, postId, sourceId, name, at, extra = {}) => ({ id, type, postId, sourceId, name, createdAt: at, readAt: null, dismissedAt: null, snippet: '', ...extra });
  const list = [
    n('1', 'post_like', 'p1', 'a', 'Asha Rao', '2026-11-04T10:00:00Z', { readAt: 'x' }),
    n('2', 'post_like', 'p1', 'b', 'Ravi', '2026-11-04T11:00:00Z'),
    n('3', 'post_comment', 'p1', 'b', 'Ravi', '2026-11-04T11:30:00Z', { snippet: 'Where?' }),
    n('4', 'post_like', 'p2', 'c', 'Meera', '2026-10-20T11:00:00Z'),
    n('5', 'nearby_appeared', '', 'd', 'D', '2026-11-04T11:59:00Z'),
    n('6', 'post_like', 'p3', 'e', 'E', '2026-11-04T09:00:00Z', { dismissedAt: 'x' }),
  ];
  const groups = groupPostNotifications(list, now);
  assert.deepEqual(groups.map((g) => g.key), ['c:3', 'l:p1']);
  assert.deepEqual(groups[1].ids, ['1', '2']);
  assert.equal(groups[1].unread, true);
  assert.equal(groups[1].people.length, 2);
});
test('postNotificationCopy: one, two, many likers; a comment quotes its words', () => {
  assert.equal(postNotificationCopy({ type: 'post_like', people: [{ name: 'Asha Rao' }] }).title, 'Asha liked your note');
  assert.equal(postNotificationCopy({ type: 'post_like', people: [{ name: 'Asha' }, { name: 'Ravi K' }] }).title, 'Asha and Ravi liked your note');
  assert.equal(postNotificationCopy({ type: 'post_like', people: [{ name: 'Asha' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] }).title, 'Asha and 3 others liked your note');
  assert.deepEqual(postNotificationCopy({ type: 'post_comment', people: [{ name: 'Ravi' }], snippet: 'Where?' }), { title: 'Ravi commented on your note', line: 'Where?' });
  assert.equal(postNotificationCopy({ type: 'post_like', people: [{ name: '' }] }).title, 'A member liked your note');
});

// D-234 (0071): a connection shared a new note.
test('post_new: one row per note, titled "<name> shared a new note" with the caption', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const list = [
    { id: 'p1', type: 'post_new', sourceId: 'a', name: 'Asha Rao', postId: 'n1', snippet: 'Evening at the club', createdAt: '2026-11-10T11:00:00Z' },
    { id: 'p2', type: 'post_new', sourceId: 'b', name: 'Ravi Kumar', postId: 'n2', snippet: null, createdAt: '2026-11-10T11:30:00Z', readAt: '2026-11-10T11:31:00Z' },
    { id: 'l1', type: 'post_like', sourceId: 'b', name: 'Ravi Kumar', postId: 'n1', createdAt: '2026-11-10T10:00:00Z' },
  ];
  const groups = groupPostNotifications(list, now);
  assert.deepEqual(groups.map((g) => [g.key, g.type, g.unread]), [['n:n2', 'post_new', false], ['n:n1', 'post_new', true], ['l:n1', 'post_like', true]]);
  assert.deepEqual(postNotificationCopy(groups[1]), { title: 'Asha shared a new note', line: 'Evening at the club' });
  assert.deepEqual(postNotificationCopy(groups[0]), { title: 'Ravi shared a new note', line: 'Tap to see it.' });
});

// D-245: the iPhone steps follow the browser the member is in.
test('web push: iPhone install steps for Safari, Chrome, and inside another app', () => {
  const ua = (tail) => ({ userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 ${tail}` });
  assert.equal(iosBrowser(ua('Version/18.0 Safari/604.1')), 'safari');
  assert.equal(iosBrowser(ua('CriOS/130.0 Safari/604.1')), 'chrome');
  assert.equal(iosBrowser(ua('GSA/350.0 Safari/604.1')), 'inapp');
  assert.equal(iosBrowser(ua('Instagram 350.0')), 'inapp');
  assert.equal(iosBrowser(ua('FxiOS/130.0')), 'other');
  assert.match(installSteps('safari')[1], /Add to Home Screen/);
  assert.match(installSteps('chrome')[0], /top right of Chrome/);
  assert.match(installSteps('inapp')[0], /Open in Safari/);
  assert.equal(installSteps('safari').length, 4);
});
