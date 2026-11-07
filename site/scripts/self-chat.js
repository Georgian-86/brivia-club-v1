// D-224: "You · Message yourself", a private thread with yourself at the top of Chats (notes, links, photos, files
// to keep). Pure helpers, no DOM. The thread is keyed by the member's own id, like any thread by the other person's id;
// its rows have sender_id = recipient_id = the member (migration 0068).

export const SELF_CHAT_LABEL = 'Message yourself';
export const SELF_CHAT_EMPTY = 'Notes, links and files just for you';

// The thread's "person": the member's own card, named "You" in the list, with the full name in the header.
export const selfChatPerson = (profile = {}) => {
  const name = String(profile.name || '').trim();
  const image = profile.photoUrl || profile.image || profile.photo || '';
  return {
    id: profile.id,
    name: name ? `${name} (You)` : 'You',
    fullName: name,
    image,
    photoUrl: image,
    role: SELF_CHAT_LABEL,
    isSelf: true,
    tags: [],
    shared: [],
  };
};

export const isSelfChat = (person, memberId) => Boolean(person && memberId && String(person.id) === String(memberId));

// Search finds it by "you", "me", "myself", "self", "notes", "message yourself" (two letters or more), or the member's
// own name (any word, from its start): typing your own name to message yourself finds it (founder screenshot, "radh").
const SELF_WORDS = ['you', 'me', 'myself', 'yourself', 'self', 'notes', 'message yourself'];
export const selfChatMatches = (query, profile = {}) => {
  const q = String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return true;
  if (q.length >= 2 && SELF_WORDS.some((word) => word.startsWith(q))) return true;
  const name = String(profile.name || '').toLowerCase().trim();
  if (!name) return false;
  if (name.startsWith(q)) return true;
  return name.split(/\s+/).some((part) => part.startsWith(q));
};
