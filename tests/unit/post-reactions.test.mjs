// Explore likes and saves client (polish wave C2). Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReactions, setReaction, createReactionGuard } from '../../site/scripts/post-reactions.js';

// A tiny supabase-js stand-in that records calls and answers from `script[table][op]`.
const fakeClient = (script = {}) => {
  const calls = [];
  return {
    calls,
    from(table) {
      const entry = { table, filters: [] };
      const result = (op) => script[table]?.[op] ?? { data: null, error: null };
      const chain = {
        select(cols) { entry.op = 'select'; entry.cols = cols; return chain; },
        insert(row) { entry.op = 'insert'; entry.row = row; calls.push(entry); return Promise.resolve(result('insert')); },
        delete() { entry.op = 'delete'; return chain; },
        eq(k, v) { entry.filters.push(['eq', k, v]); if (entry.op === 'delete' && entry.filters.length === 2) { calls.push(entry); return Promise.resolve(result('delete')); } return chain; },
        in(k, v) { entry.filters.push(['in', k, v]); calls.push(entry); return Promise.resolve(result('select')); },
      };
      return chain;
    },
  };
};

test('loadReactions returns the member\'s liked and saved sets', async () => {
  const client = fakeClient({
    community_post_likes: { select: { data: [{ post_id: 'a' }], error: null } },
    community_post_saves: { select: { data: [{ post_id: 'b' }, { post_id: 'a' }], error: null } },
  });
  const out = await loadReactions(client, 'me', ['a', 'b', 'c']);
  assert.deepEqual([...out.liked], ['a']);
  assert.deepEqual([...out.saved].sort(), ['a', 'b']);
  assert.equal(out.error, null);
});

test('loadReactions with no posts makes no request', async () => {
  const client = fakeClient();
  const out = await loadReactions(client, 'me', []);
  assert.equal(client.calls.length, 0);
  assert.equal(out.liked.size, 0);
  assert.equal(out.error, null);
});

test('loadReactions reports an error and empty sets', async () => {
  const client = fakeClient({ community_post_likes: { select: { data: null, error: { code: '500' } } } });
  const out = await loadReactions(client, 'me', ['a']);
  assert.ok(out.error);
  assert.equal(out.liked.size, 0);
});

test('setReaction inserts into the right table, and maps 23505 to success', async () => {
  const client = fakeClient({ community_post_saves: { insert: { error: { code: '23505' } } } });
  assert.deepEqual(await setReaction(client, 'save', 'p', 'me', true), { error: null });
  assert.deepEqual(client.calls[0].row, { post_id: 'p', member_id: 'me' });
  assert.equal(client.calls[0].table, 'community_post_saves');
  const liked = fakeClient();
  await setReaction(liked, 'like', 'p', 'me', true);
  assert.equal(liked.calls[0].table, 'community_post_likes');
});

test('setReaction keeps other errors, including 42501', async () => {
  const client = fakeClient({ community_post_likes: { insert: { error: { code: '42501' } } } });
  assert.equal((await setReaction(client, 'like', 'p', 'me', true)).error.code, '42501');
});

test('setReaction delete filters by post and member; a missing row is success', async () => {
  const client = fakeClient({ community_post_likes: { delete: { error: null } } });
  assert.deepEqual(await setReaction(client, 'like', 'p', 'me', false), { error: null });
  assert.deepEqual(client.calls[0].filters, [['eq', 'post_id', 'p'], ['eq', 'member_id', 'me']]);
});

test('setReaction rejects an unknown kind without a request', async () => {
  const client = fakeClient();
  assert.ok((await setReaction(client, 'boost', 'p', 'me', true)).error);
  assert.equal(client.calls.length, 0);
});

test('guard allows one request in flight per post and kind', () => {
  const guard = createReactionGuard();
  assert.equal(guard.begin('p:like'), true);
  assert.equal(guard.begin('p:like'), false);
  assert.equal(guard.begin('p:save'), true);
  guard.end('p:like');
  assert.equal(guard.begin('p:like'), true);
});

// C3 (carried from the C2 review): a thrown or rejected request never escapes; it comes back as { error }.
const rejectingClient = (how) => ({
  from() {
    const fail = () => (how === 'throw' ? (() => { throw new Error('network down'); })() : Promise.reject(new Error('network down')));
    let eqs = 0;
    let deleting = false;
    const chain = {
      select: () => chain,
      delete: () => { deleting = true; return chain; },
      eq: () => { eqs += 1; return deleting && eqs === 2 ? fail() : chain; },
      in: () => fail(),
      insert: () => fail(),
    };
    return chain;
  },
});

for (const how of ['reject', 'throw']) {
  test(`setReaction returns { error } when the request ${how}s`, async () => {
    const client = rejectingClient(how);
    const on = await setReaction(client, 'like', 'p', 'me', true);
    assert.ok(on.error instanceof Error);
    assert.equal(on.error.message, 'network down');
    const off = await setReaction(rejectingClient(how), 'save', 'p', 'me', false);
    assert.ok(off.error instanceof Error);
  });

  test(`loadReactions returns empty sets and { error } when the request ${how}s`, async () => {
    const out = await loadReactions(rejectingClient(how), 'me', ['a']);
    assert.ok(out.error instanceof Error);
    assert.equal(out.liked.size, 0);
    assert.equal(out.saved.size, 0);
  });
}

// C3 fix round: the view asks which keys are in flight, so a reload never overwrites a pending like or save.
test('guard.busy reports a key in flight', () => {
  const guard = createReactionGuard();
  assert.equal(guard.busy('p:like'), false);
  guard.begin('p:like');
  assert.equal(guard.busy('p:like'), true);
  assert.equal(guard.busy('p:save'), false);
  guard.end('p:like');
  assert.equal(guard.busy('p:like'), false);
});
