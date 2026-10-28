// Chat read state (founder, 2026-10-28, D-100): pure, no DOM, no storage.
//
// The inbox counts unread MESSAGES, not conversations. There are no server read receipts, so the member's own browser
// keeps, per conversation, the time of the newest message they have seen ({ baseline, read: { [personId]: iso } }).
// A message from the other member newer than that is unread. `baseline` is set on the first run of this build, so
// messages from before it count as read (the old build forgot its read state on every reload).

const validTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const time = (value) => (validTime(value) ? Date.parse(value) : NaN);

export const parseReadState = (raw, now = new Date().toISOString()) => {
  let saved = null;
  try { saved = typeof raw === 'string' ? JSON.parse(raw) : null; } catch { saved = null; }
  const read = {};
  if (saved && typeof saved.read === 'object' && saved.read) {
    for (const [id, at] of Object.entries(saved.read)) if (validTime(at)) read[id] = at;
  }
  return { baseline: validTime(saved?.baseline) ? saved.baseline : now, read };
};

export const serializeReadState = (state) => JSON.stringify({ baseline: state.baseline, read: state.read });

export const lastReadAt = (state, personId) => state.read[String(personId)] || state.baseline;

// Messages are { from: 'me' | 'them', createdAt }. A message without a time is never counted, and neither is one sent
// before the member's own latest reply (they answered it, so they read it, on this device or another).
export const unreadCount = (messages, since) => {
  const list = messages || [];
  const replied = list.reduce((latest, m) => (m?.from === 'me' && time(m.createdAt) > latest ? time(m.createdAt) : latest), -Infinity);
  const after = Math.max(Number.isFinite(time(since)) ? time(since) : -Infinity, replied);
  return list.filter((m) => m?.from === 'them' && time(m.createdAt) > after).length;
};

// The newest message time in `messages`, or 0 when there is none.
export const lastContactAt = (messages) => (messages || []).reduce((latest, m) => {
  const at = time(m?.createdAt);
  return Number.isFinite(at) && at > latest ? at : latest;
}, 0);

// Marks everything in `messages` as seen for personId. Never moves the read time backwards.
export const markRead = (state, personId, messages) => {
  const latest = lastContactAt(messages);
  const key = String(personId);
  if (!latest || latest <= time(lastReadAt(state, key))) return state;
  return { ...state, read: { ...state.read, [key]: new Date(latest).toISOString() } };
};

// Newest conversation first; conversations with no message keep their order after the rest.
export const sortByLastContact = (people, messagesFor) => people
  .map((person, index) => ({ person, index, at: lastContactAt(messagesFor(person.id)) }))
  .sort((a, b) => (b.at - a.at) || (a.index - b.index))
  .map(({ person }) => person);

export const unreadTotal = (ids, messagesFor, readAtFor) => ids.reduce((sum, id) => sum + unreadCount(messagesFor(id), readAtFor(id)), 0);
