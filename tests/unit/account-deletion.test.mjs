// Account deletion client logic (Iteration 4, Task 9, R5). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteAccount, consentStatusCopy, reauthMethod, clearBriviaKeys, STORAGE_FAILED_COPY, RPC_FAILED_COPY, deletionErrorCopy } from '../../account-deletion.js';

const UID = 'u-1';
const BUCKETS = ['profile-photos', 'profile-covers', 'message-attachments', 'community-posts'];

// A fake Storage: files[bucket] is a Set of object names under the member's folder.
const makeHarness = ({ files = {}, failRemoveOnce = null, failList = null, rpcResult = { error: null } } = {}) => {
  const store = Object.fromEntries(BUCKETS.map((b) => [b, new Set(files[b] || [])]));
  const log = { lists: [], removes: [], rpc: [], signOut: [], clear: 0, events: [] };
  let removeFailed = false;
  const storage = {
    from: (bucket) => ({
      list: async (prefix, opts) => {
        log.lists.push({ bucket, prefix, ...opts });
        if (failList === bucket) return { data: null, error: { message: 'list failed' } };
        const names = [...store[bucket]].sort();
        return { data: names.slice(opts.offset, opts.offset + opts.limit).map((name) => ({ name, id: `id-${name}` })), error: null };
      },
      remove: async (paths) => {
        log.removes.push({ bucket, paths });
        if (failRemoveOnce === bucket && !removeFailed && log.removes.filter((r) => r.bucket === bucket).length === 2) { removeFailed = true; return { data: null, error: { message: 'network' } }; }
        paths.forEach((p) => store[bucket].delete(p.replace(`${UID}/`, '')));
        return { data: paths, error: null };
      },
    }),
  };
  const rpc = async (name, args) => { log.rpc.push({ name, args }); log.events.push('rpc'); return rpcResult; };
  const signOut = async (opts) => { log.signOut.push(opts); log.events.push('signOut'); };
  const clearLocal = () => { log.clear += 1; };
  return { store, log, args: { storage, rpc, signOut, clearLocal, buckets: BUCKETS, uid: UID } };
};
const names = (n, prefix = 'f') => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(3, '0')}`);

test('230 objects in one bucket are all removed across pages before the RPC, in batches of at most 100', async () => {
  const h = makeHarness({ files: { 'message-attachments': names(230) } });
  const result = await deleteAccount(h.args);
  assert.deepEqual(result, { ok: true });
  assert.equal(h.store['message-attachments'].size, 0);
  const removed = h.log.removes.filter((r) => r.bucket === 'message-attachments');
  assert.ok(removed.every((r) => r.paths.length <= 100));
  assert.equal(removed.reduce((n, r) => n + r.paths.length, 0), 230);
  assert.ok(removed[0].paths[0].startsWith(`${UID}/`));
  assert.ok(h.log.lists.every((l) => l.limit === 100 && l.prefix === UID));
  assert.ok(h.log.lists.some((l) => l.offset === 200), 'pages through offsets');
  assert.deepEqual(h.log.events, ['rpc', 'signOut']);
  assert.deepEqual(h.log.rpc, [{ name: 'delete_my_account', args: { p_confirm: 'DELETE' } }]);
});

test('every bucket is emptied, and a list of 0 items ends the loop', async () => {
  const h = makeHarness({ files: { 'profile-photos': ['a.jpg'], 'community-posts': ['b.jpg', 'c.jpg'] } });
  await deleteAccount(h.args);
  BUCKETS.forEach((b) => assert.equal(h.store[b].size, 0));
  BUCKETS.forEach((b) => assert.ok(h.log.lists.some((l) => l.bucket === b)));
});

test('a storage error returns stage storage and calls neither the RPC nor signOut', async () => {
  const h = makeHarness({ files: { 'profile-photos': ['a.jpg'] }, failList: 'profile-covers' });
  const result = await deleteAccount(h.args);
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'storage');
  assert.equal(h.log.rpc.length, 0);
  assert.equal(h.log.signOut.length, 0);
  assert.equal(h.log.clear, 0);
});

test('an RPC reauth_required error returns stage reauth and does not sign out', async () => {
  const h = makeHarness({ rpcResult: { error: { code: 'P0001', message: 'reauth_required' } } });
  const result = await deleteAccount(h.args);
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'reauth');
  assert.equal(h.log.signOut.length, 0);
  assert.equal(h.log.clear, 0);
});

test('an RPC storage_not_empty error returns stage storage', async () => {
  const h = makeHarness({ rpcResult: { error: { code: 'P0001', message: 'storage_not_empty' } } });
  const result = await deleteAccount(h.args);
  assert.equal(result.stage, 'storage');
  assert.equal(h.log.signOut.length, 0);
});

test('any other RPC error returns stage rpc and does not sign out', async () => {
  const h = makeHarness({ rpcResult: { error: { message: 'boom' } } });
  const result = await deleteAccount(h.args);
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'rpc');
  assert.equal(h.log.signOut.length, 0);
  assert.equal(h.log.clear, 0);
});

test('an RPC that throws is an rpc-stage failure', async () => {
  const h = makeHarness();
  h.args.rpc = async () => { throw new Error('offline'); };
  const result = await deleteAccount(h.args);
  assert.equal(result.stage, 'rpc');
  assert.equal(h.log.signOut.length, 0);
});

test('success signs out with scope local, then clears local data; a signOut error is ignored', async () => {
  const h = makeHarness();
  h.args.signOut = async (opts) => { h.log.signOut.push(opts); throw new Error('user not found'); };
  const result = await deleteAccount(h.args);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(h.log.signOut, [{ scope: 'local' }]);
  assert.equal(h.log.clear, 1);
});

test('retry after a partial failure finishes the job', async () => {
  const h = makeHarness({ files: { 'message-attachments': names(230) }, failRemoveOnce: 'message-attachments' });
  const first = await deleteAccount(h.args);
  assert.equal(first.ok, false);
  assert.equal(first.stage, 'storage');
  assert.equal(h.log.rpc.length, 0);
  assert.ok(h.store['message-attachments'].size > 0 && h.store['message-attachments'].size < 230);
  const second = await deleteAccount(h.args);
  assert.deepEqual(second, { ok: true });
  assert.equal(h.store['message-attachments'].size, 0);
  assert.equal(h.log.rpc.length, 1);
});

test('a bucket that never empties fails with stage storage instead of looping forever', async () => {
  const h = makeHarness({ files: { 'profile-photos': ['stuck.jpg'] } });
  const from = h.args.storage.from;
  h.args.storage.from = (b) => ({ ...from(b), remove: async () => ({ data: [], error: null }) });
  const result = await deleteAccount(h.args);
  assert.equal(result.stage, 'storage');
  assert.equal(h.log.rpc.length, 0);
});

test('error copy is the exact R5 text', () => {
  assert.equal(STORAGE_FAILED_COPY, "We removed some of your files but couldn't finish. Nothing else was deleted. Try again.");
  assert.equal(RPC_FAILED_COPY, 'Your photos and files are gone, but your account still exists. Try again to finish, or email thebrivia.club@gmail.com.');
  assert.match(deletionErrorCopy('storage'), /^We removed some of your files but couldn't finish\. Nothing else was deleted\. Try again\./);
  assert.match(deletionErrorCopy('storage'), /thebrivia\.club@gmail\.com/);
  assert.equal(deletionErrorCopy('rpc'), RPC_FAILED_COPY);
});

test('reauthMethod: email identity -> password, Google only -> oauth', () => {
  assert.equal(reauthMethod({ app_metadata: { provider: 'email', providers: ['email'] } }), 'password');
  assert.equal(reauthMethod({ app_metadata: { provider: 'google', providers: ['google'] } }), 'oauth');
  assert.equal(reauthMethod({ app_metadata: { provider: 'google', providers: ['google', 'email'] } }), 'password');
  assert.equal(reauthMethod({ app_metadata: {} }), 'password');
});

test('consentStatusCopy: given on a date, or not given', () => {
  assert.equal(consentStatusCopy(null), 'Private interests: consent not given.');
  assert.match(consentStatusCopy('2026-10-05T10:00:00Z'), /^Private interests: consent given on 5 October 2026\.$/);
});

test('clearBriviaKeys removes only brivia-* keys', () => {
  const data = new Map([['brivia-a', '1'], ['brivia-hidden-chats:x', '2'], ['sb-abc-auth-token', '4'], ['sb-auth', '3']]);
  const store = { removeItem: (k) => data.delete(k) };
  Object.defineProperty(store, 'keys', { value: () => [...data.keys()] });
  // emulate Object.keys(store) on a Storage by defining enumerable props
  data.forEach((_, k) => Object.defineProperty(store, k, { value: '', enumerable: true, configurable: true }));
  const origRemove = store.removeItem;
  store.removeItem = (k) => { origRemove(k); delete store[k]; };
  clearBriviaKeys(store, undefined);
  assert.deepEqual([...data.keys()], ['sb-auth']);
});
