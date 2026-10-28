import test from 'node:test';
import assert from 'node:assert/strict';
import { toActivityMap, withLike, likeSummary, threadComments, cleanCommentBody, loadActivity, addComment, recordShare, emptyActivity, COMMENT_MAX } from '../../site/scripts/post-activity.js';

test('toActivityMap reads the RPC rows and caps named likers at 3', () => {
  const map = toActivityMap([{ post_id: 'p', like_count: '4', liked_by_me: true, comment_count: 2, share_count: null, connection_likers: ['a', 'b', 'c', 'd'] }, { like_count: 1 }]);
  assert.equal(map.size, 1);
  assert.deepEqual(map.get('p'), { likeCount: 4, likedByMe: true, commentCount: 2, shareCount: 0, connectionLikers: ['a', 'b', 'c'] });
});

test('withLike moves the count with the flag, never below zero, and is a no-op when unchanged', () => {
  const a = { ...emptyActivity(), likeCount: 2 };
  assert.deepEqual(withLike(a, true), { ...a, likedByMe: true, likeCount: 3 });
  assert.equal(withLike(withLike(a, true), true).likeCount, 3);
  assert.equal(withLike({ ...emptyActivity(), likedByMe: true }, false).likeCount, 0);
  assert.equal(withLike(undefined, true).likeCount, 1);
});

test('likeSummary names connections only and counts the rest', () => {
  assert.equal(likeSummary({ likeCount: 0 }, ['A']), '');
  assert.equal(likeSummary({ likeCount: 1 }), '1 like');
  assert.equal(likeSummary({ likeCount: 5 }, []), '5 likes');
  assert.equal(likeSummary({ likeCount: 1 }, ['Asha']), 'Liked by Asha');
  assert.equal(likeSummary({ likeCount: 2 }, ['Asha', 'Bilal']), 'Liked by Asha and Bilal');
  assert.equal(likeSummary({ likeCount: 2 }, ['Asha']), 'Liked by Asha and 1 other');
  assert.equal(likeSummary({ likeCount: 6 }, ['Asha', 'Bilal', 'Chen']), 'Liked by Asha, Bilal and 4 others');
});

test('threadComments nests replies under their parent, oldest first, and lifts orphans to the top', () => {
  const t = (m) => new Date(Date.UTC(2026, 9, 28, 10, m)).toISOString();
  const rows = [
    { id: 'r2', parent_id: 'c1', created_at: t(5) },
    { id: 'c1', parent_id: null, created_at: t(1) },
    { id: 'r1', parent_id: 'c1', created_at: t(3) },
    { id: 'rr', parent_id: 'r1', created_at: t(4) },
    { id: 'c2', parent_id: null, created_at: t(2) },
    { id: 'o', parent_id: 'gone', created_at: t(0) },
  ];
  const tree = threadComments(rows);
  assert.deepEqual(tree.map((c) => c.id), ['o', 'c1', 'c2']);
  assert.deepEqual(tree[1].replies.map((c) => c.id), ['r1', 'r2']);
  assert.deepEqual(tree[1].replies[0].replies.map((c) => c.id), ['rr']);
  assert.deepEqual(threadComments(null), []);
});

test('cleanCommentBody trims and caps', () => {
  assert.equal(cleanCommentBody('  hi \r\n there  '), 'hi \n there');
  assert.equal(cleanCommentBody('x'.repeat(COMMENT_MAX + 5)).length, COMMENT_MAX);
  assert.equal(cleanCommentBody(null), '');
});

test('loadActivity reports a missing RPC as unavailable, other errors as available', async () => {
  const client = (error, data = null) => ({ rpc: async () => ({ data, error }) });
  assert.equal((await loadActivity(client({ code: 'PGRST202', message: 'Could not find the function' }), ['p'])).available, false);
  assert.equal((await loadActivity(client({ code: 'XX000', message: 'boom' }), ['p'])).available, true);
  const ok = await loadActivity(client(null, [{ post_id: 'p', like_count: 1 }]), ['p']);
  assert.equal(ok.map.get('p').likeCount, 1);
  assert.equal((await loadActivity({ rpc: async () => { throw new Error('offline'); } }, ['p'])).error.message, 'offline');
});

test('addComment refuses an empty body without a request; recordShare treats a repeat as done', async () => {
  let called = false;
  const client = { from: () => { called = true; return {}; } };
  assert.equal((await addComment(client, 'p', '   ')).error.message, 'empty');
  assert.equal(called, false);
  const shareClient = (error) => ({ from: () => ({ insert: async () => ({ error }) }) });
  assert.equal((await recordShare(shareClient({ code: '23505' }), 'p')).error, null);
  assert.equal((await recordShare(shareClient({ code: '42501' }), 'p')).error.code, '42501');
});
