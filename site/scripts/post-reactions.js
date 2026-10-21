// Likes and saves on Explore posts (polish wave C2): the persistence helpers, written against a supabase-js client.
//
// Tables public.community_post_likes and public.community_post_saves (migration 0012): own rows only. A duplicate
// insert (23505) means the row already exists, which is the state the member asked for, so it counts as success. A
// delete of a missing row is success too. Any other error is returned so the view can restore the server truth.
//
// Error contract for the view (Explore, app.js):
// * 42501 means RLS refused the write: the post is gone or no longer visible to this member (deleted, author blocked,
//   moved out of reach). The caller reloads the server truth with loadReactions and shows NO toast: nothing the member
//   can retry, and a toast would hint at why the post went away.
// * Any other error code (or a thrown / rejected request, e.g. offline) also reloads with loadReactions, and shows the
//   toast "That didn't save. Please try again."
// Neither helper ever throws or rejects: a failure always comes back as { error }.

const TABLES = { like: 'community_post_likes', save: 'community_post_saves' };

export const loadReactions = async (client, memberId, postIds) => {
  const empty = { liked: new Set(), saved: new Set(), error: null };
  if (!memberId || !postIds?.length) return empty;
  const read = (table) => client.from(table).select('post_id').eq('member_id', memberId).in('post_id', postIds);
  let likes;
  let saves;
  try {
    [likes, saves] = await Promise.all([read(TABLES.like), read(TABLES.save)]);
  } catch (error) {
    return { ...empty, error };
  }
  const error = likes?.error || saves?.error || null;
  if (error) return { ...empty, error };
  return {
    liked: new Set((likes.data || []).map((row) => row.post_id)),
    saved: new Set((saves.data || []).map((row) => row.post_id)),
    error: null,
  };
};

export const setReaction = async (client, kind, postId, memberId, on) => {
  const table = TABLES[kind];
  if (!table) return { error: new Error(`Unknown reaction: ${kind}`) };
  try {
    if (on) {
      const { error } = await client.from(table).insert({ post_id: postId, member_id: memberId });
      return { error: error && error.code !== '23505' ? error : null };
    }
    const { error } = await client.from(table).delete().eq('post_id', postId).eq('member_id', memberId);
    return { error: error || null };
  } catch (error) {
    return { error };
  }
};

// One request in flight per post and kind: begin('postId:like') is false until end('postId:like').
export const createReactionGuard = () => {
  const busy = new Set();
  return {
    begin(key) { if (busy.has(key)) return false; busy.add(key); return true; },
    end(key) { busy.delete(key); },
  };
};
