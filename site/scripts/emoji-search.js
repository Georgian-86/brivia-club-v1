// Emoji search (D-244): by English name ("chess" -> ♟️, "cry" -> 😢 😭), every word of the query must start a word of
// the name; a few everyday words map to Unicode's names ("lol" -> face with tears of joy). Pure, no DOM.
import { chatEmojiCategories, emojiName } from './chat-emoji-data.js';

const ALL = Object.values(chatEmojiCategories).flat();
const ALIASES = {
  lol: 'joy', haha: 'joy', laugh: 'joy', cry: 'cry', sad: 'sad', love: 'heart', ok: 'ok', yes: 'thumbs up', no: 'thumbs down',
  thanks: 'folded hands', pray: 'folded hands', clap: 'clapping', party: 'party', congrats: 'party', fire: 'fire', lit: 'fire',
  cool: 'sunglasses', hi: 'waving', hello: 'waving', bye: 'waving', think: 'thinking', wow: 'astonished', angry: 'angry',
  sleep: 'sleeping', sick: 'nauseated', money: 'money', coffee: 'hot beverage', tea: 'teacup', beer: 'beer', cake: 'cake',
  gift: 'gift', ball: 'ball', game: 'game', music: 'music', book: 'book', work: 'briefcase', home: 'house', car: 'car',
  plane: 'airplane', heart: 'heart', star: 'star', sun: 'sun', moon: 'moon', rain: 'rain', india: 'india', diya: 'diya',
};
const words = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export const searchEmoji = (query, limit = 160) => {
  const q = words(query);
  if (!q.length) return [];
  const hits = [];
  for (const e of ALL) {
    const name = words(emojiName(e));
    const has = (w) => (Array.isArray(w) ? w.every((x) => name.some((n) => n.startsWith(x))) : name.some((n) => n.startsWith(w)));
    // Each query word matches by itself or through its alias.
    const ok = q.every((w) => has(w) || (ALIASES[w] && has(words(ALIASES[w]))));
    if (ok) hits.push(e);
    if (hits.length >= limit) break;
  }
  return hits;
};
