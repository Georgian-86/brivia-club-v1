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
