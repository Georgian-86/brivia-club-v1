// One notification store for every device (D-134, migration 0030). The server table member_notification holds each
// notification once (a unique id); read_at and dismissed_at are set there. Every open session listens through Supabase
// Realtime (INSERT: a new one; UPDATE: read or dismissed on another device), so reading on the phone marks it read on
// the laptop too, and the laptop closes its system notification with that id. localStorage is never the source.
//
// createMemberNotifications({ api: { list, markRead, dismiss }, subscribe(onInsert, onUpdate) -> unsubscribe,
//   onNew(n), onChange(list), closeSystem(ids) })

export const normalizeNotification = (row = {}) => ({
  id: String(row.id || ''),
  type: String(row.notification_type || ''),
  sourceId: row.source_user_id ? String(row.source_user_id) : '',
  name: String(row.name || '').trim(),
  photoUrl: row.photo_url || '',
  band: row.band ? String(row.band) : '',
  place: String(row.place_name || '').trim(),
  postId: row.post_id ? String(row.post_id) : '',
  commentId: row.comment_id ? String(row.comment_id) : '',
  snippet: String(row.snippet || '').trim(),
  postImage: row.post_image_url || '',
  eventId: row.event_id ? String(row.event_id) : '',
  eventImage: row.event_image_url || '',
  createdAt: row.created_at || null,
  readAt: row.read_at || null,
  dismissedAt: row.dismissed_at || null,
});

// Fresh enough to announce (sound, card): created in the last 10 minutes.
export const isFresh = (n, now = Date.now()) => Boolean(n?.createdAt) && now - new Date(n.createdAt).getTime() < 10 * 60 * 1000;

export const createMemberNotifications = ({ api, subscribe, onNew = () => {}, onChange = () => {}, closeSystem = () => {} }) => {
  const byId = new Map();
  const announced = new Set();
  let stop = null;
  let ready = false;

  const list = () => [...byId.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const unread = () => list().filter((n) => !n.readAt && !n.dismissedAt);
  const emit = () => onChange(list());

  // A row the member has not seen anywhere yet: announce it once (sound and card), never again.
  const maybeAnnounce = (n) => {
    if (!ready || n.readAt || n.dismissedAt || announced.has(n.id) || !isFresh(n)) return;
    announced.add(n.id);
    onNew(n);
  };

  const load = async () => {
    const { data, error } = (await api.list()) || {};
    if (error) return { error };
    (data || []).map(normalizeNotification).forEach((n) => {
      const known = byId.get(n.id);
      byId.set(n.id, { ...known, ...n });
      if (!ready) announced.add(n.id);   // what was there before this session is not announced again
      else maybeAnnounce(n);
    });
    ready = true;
    emit();
    return { error: null };
  };

  // Realtime INSERT carries the raw row (no name): read the list again for the name and photo, then announce.
  const onInsert = async (row) => {
    if (!row?.id || byId.has(String(row.id))) return;
    await load();
  };
  // Realtime UPDATE: read or dismissed somewhere (maybe on another device). Close the system notification here too.
  const onUpdate = (row) => {
    const id = String(row?.id || '');
    const known = byId.get(id);
    if (!known) return;
    const next = { ...known, readAt: row.read_at || known.readAt, dismissedAt: row.dismissed_at || known.dismissedAt };
    byId.set(id, next);
    if (next.readAt || next.dismissedAt) closeSystem([id]);
    emit();
  };

  const start = async () => {
    await load();
    if (!stop && subscribe) stop = subscribe(onInsert, onUpdate);
  };
  const markRead = async (ids) => {
    const fresh = [...new Set((ids || []).map(String))].filter((id) => byId.has(id) && !byId.get(id).readAt);
    if (!fresh.length) return;
    const at = new Date().toISOString();
    fresh.forEach((id) => { byId.set(id, { ...byId.get(id), readAt: at }); announced.add(id); });
    closeSystem(fresh);
    emit();
    await api.markRead(fresh);
  };
  const dismiss = async (id) => {
    const n = byId.get(String(id));
    if (!n) return;
    const at = new Date().toISOString();
    byId.set(n.id, { ...n, readAt: n.readAt || at, dismissedAt: at });
    closeSystem([n.id]);
    emit();
    await api.dismiss(n.id);
  };
  return {
    start, load, markRead, dismiss, list, unread,
    stop: () => { stop?.(); stop = null; },
    // Test hooks (the same paths Realtime takes).
    _insert: onInsert, _update: onUpdate,
  };
};

// D-151 (0043): likes and comments on my notes, grouped per note and kind, newest first.
// [{ key, type, postId, postImage, people: [{ id, name, photoUrl }], snippet, createdAt, unread, ids }]
// D-234 (0071): post_new, a connection shared a new note (one row per note).
export const POST_TYPES = new Set(['post_like', 'post_comment', 'post_new', 'comment_reply']);   // D-260: comment_reply (0078)
export const groupPostNotifications = (list = [], now = Date.now(), days = 7) => {
  const groups = new Map();
  for (const n of list) {
    if (!POST_TYPES.has(n?.type) || !n.postId || n.dismissedAt) continue;
    if (n.createdAt && now - new Date(n.createdAt).getTime() > days * 86400000) continue;
    // Likes on one note are one row; D-253 (founder: "just show recent comment and say xyz and pqr others commented"):
    // comments on one note are one row too, showing the newest comment, its writer first.
    const key = n.type === 'post_comment' ? `c:${n.postId}` : n.type === 'comment_reply' ? `r:${n.postId}` : n.type === 'post_new' ? `n:${n.postId}` : `l:${n.postId}`;
    const g = groups.get(key) || { key, type: n.type, postId: n.postId, postImage: n.postImage, people: [], snippet: n.snippet, createdAt: n.createdAt, unread: false, ids: [] };
    const newest = !g.ids.length || String(n.createdAt) > String(g.createdAt);
    const person = { id: n.sourceId, name: n.name, photoUrl: n.photoUrl };
    const at = g.people.findIndex((p) => p.id === n.sourceId);
    if (newest) {
      if (at >= 0) g.people.splice(at, 1);
      g.people.unshift(person);
      if (n.type === 'post_comment' || n.type === 'comment_reply') { g.snippet = n.snippet; g.commentId = n.commentId || null; }
    } else if (at < 0) g.people.push(person);
    if (String(n.createdAt) > String(g.createdAt)) g.createdAt = n.createdAt;
    g.unread ||= !n.readAt;
    g.ids.push(n.id);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
};

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'A member';
// "Asha liked your note." · "Asha and Ravi liked your note." · "Asha and 3 others liked your note." ·
// "Asha commented on your note" / Where is this? (D-252: the comment as written, no quote marks)
// { full: true } (D-253): name the lead in full (an Admin account such as The Brivia Club), not by a first word.
export const postNotificationCopy = (g, { full = false } = {}) => {
  const people = g?.people || [];
  const lead = full && String(people[0]?.name || '').trim() ? String(people[0].name).trim() : firstName(people[0]?.name);
  if (g?.type === 'comment_reply') {
    // D-260: "Amar replied to your comment" · "Amar and 2 others replied to your comment", with the newest reply.
    const writers = people.length <= 1 ? lead : people.length === 2 ? `${lead} and ${firstName(people[1]?.name)}` : `${lead} and ${people.length - 1} others`;
    return { title: `${writers} replied to your comment`, line: g.snippet || '' };
  }
  if (g?.type === 'post_comment') {
    // D-253: "Amar commented" · "Amar and Diya commented" · "Amar and 3 others commented", with the newest comment.
    const writers = people.length <= 1 ? lead : people.length === 2 ? `${lead} and ${firstName(people[1]?.name)}` : `${lead} and ${people.length - 1} others`;
    return { title: `${writers} commented on your note`, line: g.snippet || '' };   // D-252: no quote marks (founder)
  }
  if (g?.type === 'post_new') return { title: `${lead} shared a new note`, line: g.snippet || 'Tap to see it.' };   // D-252: no quote marks
  const who = people.length === 1 ? lead : people.length === 2 ? `${lead} and ${firstName(people[1]?.name)}` : `${lead} and ${people.length - 1} others`;
  return { title: `${who} liked your note`, line: '' };
};

// D-203 (0060): registrations for my events, one row per event, newest first.
// [{ key, type, eventId, eventImage, title, people: [{ id, name, photoUrl }], createdAt, unread, ids }]
export const EVENT_TYPES = new Set(['event_registered']);
export const groupEventNotifications = (list = [], now = Date.now(), days = 7) => {
  const groups = new Map();
  for (const n of list) {
    if (!EVENT_TYPES.has(n?.type) || !n.eventId || n.dismissedAt) continue;
    if (n.createdAt && now - new Date(n.createdAt).getTime() > days * 86400000) continue;
    const key = `e:${n.eventId}`;
    const g = groups.get(key) || { key, type: n.type, eventId: n.eventId, eventImage: n.eventImage, title: n.snippet, people: [], createdAt: n.createdAt, unread: false, ids: [] };
    if (!g.people.some((p) => p.id === n.sourceId)) g.people.push({ id: n.sourceId, name: n.name, photoUrl: n.photoUrl });
    if (String(n.createdAt) > String(g.createdAt)) g.createdAt = n.createdAt;
    g.unread ||= !n.readAt;
    g.ids.push(n.id);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
};
// "Asha registered for Goa Buildathon" · "Asha and Ravi registered…" · "Asha and 3 others registered…"
export const eventNotificationCopy = (g) => {
  const people = g?.people || [];
  const lead = firstName(people[0]?.name);
  const who = people.length <= 1 ? lead : people.length === 2 ? `${lead} and ${firstName(people[1]?.name)}` : `${lead} and ${people.length - 1} others`;
  return { title: `${who} registered for ${g?.title || 'your event'}`, line: 'Tap to see your event.' };
};

