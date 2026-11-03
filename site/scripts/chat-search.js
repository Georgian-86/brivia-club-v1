// Chat search (D-152, migration 0044). Pure helpers, no DOM, no network.
//
// The Chat sidebar's search finds two things: conversations already in the inbox (matched here, on this device, by
// name, work or message text) and people (from the server's chat_people_search: connections even with no message
// yet, then members with a request either way, then anyone else the member may see). A person who already has a
// conversation in the first list is not repeated in the second.

export const cleanQuery = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

// Every word of the query appears in the text; a name word must match from its start ("yas" finds "Yashika", "ika"
// does not), any other text anywhere.
export const matchesQuery = ({ name = '', text = '' } = {}, query) => {
  const words = cleanQuery(query).toLowerCase().split(' ').filter(Boolean);
  if (!words.length) return true;
  const nameText = ` ${String(name).toLowerCase().replace(/\s+/g, ' ')}`;
  const other = String(text).toLowerCase();
  return words.every((w) => nameText.includes(` ${w}`) || other.includes(w));
};

export const STATUS = Object.freeze({
  connected: { label: 'Connected', action: 'Message' },
  request_received: { label: 'Wants to connect', action: 'Review request' },
  request_sent: { label: 'Request sent', action: '' },
  none: { label: 'Not connected', action: 'Connect' },
});

// chat_people_search row -> the shape the sidebar draws.
export const normalizePerson = (row = {}) => ({
  id: String(row.member_id || row.id || ''),
  name: String(row.name || '').trim() || 'Brivia member',
  photoUrl: row.photo_url || '',
  title: String(row.job_title || '').trim(),
  company: String(row.company_name || '').trim(),
  logoPath: String(row.logo_path || ''),
  bio: String(row.bio_preview || '').trim(),
  status: STATUS[row.status] ? row.status : 'none',
  hasConversation: Boolean(row.has_conversation),
  lastMessageAt: row.last_message_at || null,
});

// The people list without anyone already shown as a conversation, connections first (the server's order otherwise).
export const peopleResults = (rows = [], conversationIds = []) => {
  const shown = new Set(conversationIds.map(String));
  const seen = new Set();
  return rows.map(normalizePerson).filter((p) => {
    if (!p.id || shown.has(p.id) || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
};

// Before 0044 (or offline): connections this device already knows, matched by name and work.
export const localPeople = (people = [], connectionIds = [], query = '') => {
  const ids = new Set(connectionIds.map(String));
  return people.filter((p) => ids.has(String(p.id)) && matchesQuery({ name: p.name, text: `${p.role || ''} ${p.experience || ''}` }, query))
    .map((p) => ({ member_id: p.id, name: p.name, photo_url: p.image || p.photoUrl || '', status: 'connected', has_conversation: false }));
};
