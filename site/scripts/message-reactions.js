// D-244 (0075): react to a chat message with one emoji (founder 2026-11-12: "there must be an option to leave the message
// on react (through emojis)"). The long-press menu opens with a row of quick reactions and a "+" for every emoji; the
// reactions sit as small chips under the bubble. One reaction per member per message: a new emoji replaces mine, the
// same one again removes it (the server does the same). Pure helpers, unit-tested; the DOM lives in app.js.
export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];

const SERVER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const canReact = (message) => Boolean(message && SERVER_ID.test(String(message.id || '')) && !message.unsentAt);

// rows: [{ message_id, member_id, emoji, created_at }] -> Map(messageId -> rows), each list oldest first.
export const reactionsByMessage = (rows) => {
  const map = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row?.message_id || !row.emoji) return;
    const key = String(row.message_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ memberId: String(row.member_id), emoji: String(row.emoji), at: row.created_at || '' });
  });
  map.forEach((list) => list.sort((a, b) => String(a.at).localeCompare(String(b.at))));
  return map;
};

// One chip per emoji, in the order each emoji first arrived: { emoji, count, mine }.
export const groupReactions = (list, meId) => {
  const groups = [];
  (list || []).forEach((r) => {
    let g = groups.find((x) => x.emoji === r.emoji);
    if (!g) { g = { emoji: r.emoji, count: 0, mine: false }; groups.push(g); }
    g.count += 1;
    if (String(r.memberId) === String(meId)) g.mine = true;
  });
  return groups;
};

// My reaction after pressing `emoji` (the server's rule): the same one removes it, another replaces it.
export const nextReaction = (list, meId, emoji) => {
  const mine = (list || []).find((r) => String(r.memberId) === String(meId));
  return mine && mine.emoji === emoji ? null : emoji;
};

// The list after my change, for an instant paint before the server answers.
export const withMyReaction = (list, meId, emoji, at = new Date().toISOString()) => {
  const others = (list || []).filter((r) => String(r.memberId) !== String(meId));
  return emoji ? [...others, { memberId: String(meId), emoji, at }] : others;
};

export const chipLabel = ({ emoji, count, mine }) => {
  if (mine && count === 1) return `You reacted ${emoji}. Tap to remove`;
  if (mine) return `${emoji} ${count} reactions, including yours. Tap to remove yours`;
  return `${emoji} ${count === 1 ? '1 reaction' : `${count} reactions`}. Tap to react ${emoji}`;
};

// Two lists hold the same reactions (skip a repaint when a sync brings nothing new).
export const sameReactions = (a = [], b = []) => a.length === b.length
  && a.every((r, i) => r.memberId === b[i].memberId && r.emoji === b[i].emoji);
