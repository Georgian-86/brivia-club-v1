// Message yourself (D-224, migration 0068). Pure helpers, no DOM, no network.
//
// A member can find themselves in Chat search and keep a private thread with themselves (links, drafts, reminders),
// like "Message yourself" in other messengers. The thread is stored like any other: sender and recipient are both the
// member, so only they can ever read it. It is never a connection: it is not a match, has no presence, typing or read
// receipts, and cannot be blocked, reported or removed (Delete chat still hides it on this device).

import { cleanQuery, matchesQuery } from './chat-search.js';

export const SELF_STATUS = 'Message yourself';
export const SELF_ROLE = 'Only you can see this chat';
// Words that find the self row even without the member's own name.
const SELF_WORDS = new Set(['you', 'me', 'myself', 'self']);

export const isSelfId = (id, memberId) => Boolean(memberId) && id !== undefined && id !== null && String(id) === String(memberId);

// The member as a chat partner: only what the chat draws (no email, phone or place).
export const selfChatPerson = (profile = {}) => {
  const base = String(profile.name || '').trim() || String(profile.full_name || '').trim();
  const image = profile.photoUrl || profile.image || '';
  return {
    id: String(profile.id || ''),
    name: base ? `${base} (You)` : 'You',
    avatarName: base || 'You',   // initials come from the name alone ("YB", never "Y(")
    image,
    photoUrl: image,
    role: SELF_ROLE,
    isSelf: true,
    tags: [],
    skills: '',
    lookingFor: '',
    shared: [],
  };
};

// The self row shows when every query word starts a word of the member's name or full name, or the query uses one of
// you / me / myself / self ("note to self", "message myself").
export const selfMatchesQuery = (profile = {}, query) => {
  const q = cleanQuery(query);
  if (!q || !profile.id) return false;
  if (q.toLowerCase().split(' ').some((w) => SELF_WORDS.has(w))) return true;
  const name = `${profile.name || ''} ${profile.full_name || ''}`;
  return matchesQuery({ name, text: '' }, q);
};
