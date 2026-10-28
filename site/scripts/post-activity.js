// Post activity on Explore (D-101, founder 2026-10-28): likes, threaded comments and shares that other members see.
// Pure helpers plus thin supabase-js calls (migration 0015). Nothing here throws: a failure comes back as { error }.
//
// * post_activity(ids) -> per visible post: like_count, liked_by_me, comment_count, share_count and up to 3 of MY
//   connections who liked it (the only likers ever named). Until 0015 is applied the RPC is missing: available = false.
// * community_post_comments: { id, post_id, author_id, parent_id, body, created_at }. threadComments() turns the flat
//   rows into threads: a reply sits under the comment it answers; a reply whose parent I cannot see (deleted, or its
//   author is hidden from me) becomes a top-level comment instead of vanishing.

export const COMMENT_MAX = 1000;
const missingRpc = (error) => /PGRST202|42883|does not exist|schema cache|404/i.test(`${error?.code || ''} ${error?.message || ''} ${error?.status || ''}`);
const missingTable = (error) => /42P01|PGRST205|does not exist|schema cache/i.test(`${error?.code || ''} ${error?.message || ''}`);

export const emptyActivity = () => ({ likeCount: 0, likedByMe: false, commentCount: 0, shareCount: 0, connectionLikers: [] });

export const toActivityMap = (rows) => {
  const map = new Map();
  for (const row of rows || []) {
    if (!row?.post_id) continue;
    map.set(String(row.post_id), {
      likeCount: Math.max(0, Number(row.like_count) || 0),
      likedByMe: row.liked_by_me === true,
      commentCount: Math.max(0, Number(row.comment_count) || 0),
      shareCount: Math.max(0, Number(row.share_count) || 0),
      connectionLikers: Array.isArray(row.connection_likers) ? row.connection_likers.map(String).slice(0, 3) : [],
    });
  }
  return map;
};

export const loadActivity = async (client, postIds) => {
  if (!postIds?.length) return { map: new Map(), available: true, error: null };
  try {
    const { data, error } = await client.rpc('post_activity', { p_post_ids: postIds.slice(0, 100) });
    if (error) return { map: new Map(), available: !missingRpc(error), error };
    return { map: toActivityMap(data), available: true, error: null };
  } catch (error) {
    return { map: new Map(), available: true, error };
  }
};

// A like flips the counts at once (optimistic); the caller reloads the server truth on an error.
export const withLike = (activity, on) => {
  const a = activity || emptyActivity();
  if (a.likedByMe === on) return a;
  return { ...a, likedByMe: on, likeCount: Math.max(0, a.likeCount + (on ? 1 : -1)) };
};

// "Liked by Asha", "Liked by Asha and Bilal", "Liked by Asha and 4 others", "4 likes", "" (none). Names are my connections.
export const likeSummary = (activity, names = []) => {
  const count = activity?.likeCount || 0;
  if (!count) return '';
  const known = names.filter(Boolean).slice(0, 2);
  if (!known.length) return `${count} ${count === 1 ? 'like' : 'likes'}`;
  const others = count - known.length;
  if (others <= 0) return `Liked by ${known.join(' and ')}`;
  return `Liked by ${known.join(', ')} and ${others} ${others === 1 ? 'other' : 'others'}`;
};

export const countLabel = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Flat rows -> [{ ...row, replies: [...] }] sorted oldest first at every level.
export const threadComments = (rows) => {
  const list = (rows || []).filter((r) => r?.id).map((r) => ({ ...r, id: String(r.id), parent_id: r.parent_id ? String(r.parent_id) : null, replies: [] }));
  const byId = new Map(list.map((c) => [c.id, c]));
  const at = (c) => Date.parse(c.created_at) || 0;
  const roots = [];
  for (const c of list) {
    const parent = c.parent_id && c.parent_id !== c.id ? byId.get(c.parent_id) : null;
    if (parent) parent.replies.push(c); else roots.push(c);
  }
  const sort = (items) => { items.sort((x, y) => at(x) - at(y)); items.forEach((c) => sort(c.replies)); return items; };
  return sort(roots);
};

export const cleanCommentBody = (value) => String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, COMMENT_MAX);

export const loadComments = async (client, postId) => {
  try {
    const { data, error } = await client.from('community_post_comments')
      .select('id,post_id,author_id,parent_id,body,created_at').eq('post_id', postId).order('created_at', { ascending: true }).limit(500);
    if (error) return { rows: [], available: !missingTable(error), error };
    return { rows: data || [], available: true, error: null };
  } catch (error) {
    return { rows: [], available: true, error };
  }
};

export const addComment = async (client, postId, body, parentId = null) => {
  const text = cleanCommentBody(body);
  if (!text) return { row: null, error: new Error('empty') };
  try {
    const { data, error } = await client.from('community_post_comments')
      .insert({ post_id: postId, body: text, parent_id: parentId || null }).select('id,post_id,author_id,parent_id,body,created_at').single();
    return { row: error ? null : data, error: error || null };
  } catch (error) {
    return { row: null, error };
  }
};

export const deleteComment = async (client, commentId) => {
  try {
    const { error } = await client.from('community_post_comments').delete().eq('id', commentId);
    return { error: error || null };
  } catch (error) {
    return { error };
  }
};

// One share row per member and post; a repeat (23505) is already counted, so it is success.
export const recordShare = async (client, postId) => {
  try {
    const { error } = await client.from('community_post_shares').insert({ post_id: postId });
    return { error: error && error.code !== '23505' ? error : null };
  } catch (error) {
    return { error };
  }
};

// The chat message a post is shared with: a neutral line and the link (never the caption or the author's name).
export const sharedPostMessage = (url) => `Shared a post with you on Brivia Club: ${url}`;

// The post id of a message that is a shared post (the line above, or a bare post link), else null. Chat shows it as a
// post card; the inbox row says "Shared a post". Only http(s) links to /explore.html?post=<id> count, on any host (a
// preview deployment shares its own host); the card itself is read from the database, never from the link.
const SHARED_POST_RE = /^(?:Shared a post with you on Brivia Club:\s*)?(https?:\/\/[^\s/]+\/explore\.html\?post=([A-Za-z0-9-]{1,64}))\s*$/;
export const parseSharedPost = (text) => {
  const match = SHARED_POST_RE.exec(String(text ?? '').trim());
  return match ? match[2] : null;
};
