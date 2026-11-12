import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchEmoji } from '../../site/scripts/emoji-search.js';
import { chatEmojiCategories, EMOJI_TABS, emojiName } from '../../site/scripts/chat-emoji-data.js';

test('every emoji: nine tabs, well over a thousand emoji, chess and crying among them', () => {
  assert.equal(EMOJI_TABS.length, 9);
  const all = Object.values(chatEmojiCategories).flat();
  assert.ok(all.length > 1500, String(all.length));
  assert.ok(all.includes('♟️'), 'chess pawn');
  assert.ok(all.includes('😢') && all.includes('😭'), 'crying');
  assert.equal(emojiName('😭'), 'loudly crying face');
});

test('search: chess, cry, every word must match, aliases, nothing for nothing', () => {
  assert.ok(searchEmoji('chess').includes('♟️'));
  const cry = searchEmoji('cry');
  assert.ok(cry.includes('😢') && cry.includes('😭'), cry.join(''));
  assert.ok(searchEmoji('lol').includes('😂'));
  assert.ok(searchEmoji('red heart').includes('❤️'));
  assert.equal(searchEmoji('red heart').includes('💙'), false);
  assert.deepEqual(searchEmoji('   '), []);
  assert.ok(searchEmoji('heart', 5).length <= 5);
});
