import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_REACTIONS, canReact, reactionsByMessage, groupReactions, nextReaction, withMyReaction, chipLabel, sameReactions } from '../../site/scripts/message-reactions.js';

const id = '0e750000-0000-4000-8000-0000000000a1';
test('quick row and who can be reacted to', () => {
  assert.equal(QUICK_REACTIONS.length, 6);
  assert.ok(canReact({ id }));
  assert.ok(!canReact({ id, unsentAt: '2026-11-12' }));
  assert.ok(!canReact({ id: 'local-1' }));
});
test('rows group into chips in arrival order, with mine marked', () => {
  const map = reactionsByMessage([
    { message_id: id, member_id: 'b', emoji: '😂', created_at: '2026-11-12T10:02:00Z' },
    { message_id: id, member_id: 'a', emoji: '❤️', created_at: '2026-11-12T10:01:00Z' },
    { message_id: id, member_id: 'c', emoji: '😂', created_at: '2026-11-12T10:03:00Z' },
    { message_id: null, member_id: 'x', emoji: '😂' },
  ]);
  const groups = groupReactions(map.get(id), 'b');
  assert.deepEqual(groups, [{ emoji: '❤️', count: 1, mine: false }, { emoji: '😂', count: 2, mine: true }]);
  assert.match(chipLabel(groups[1]), /including yours/);
  assert.match(chipLabel(groups[0]), /Tap to react/);
  assert.match(chipLabel({ emoji: '😂', count: 1, mine: true }), /^You reacted/);
});
test('the same emoji removes mine, another replaces it', () => {
  const list = [{ memberId: 'a', emoji: '❤️', at: '1' }, { memberId: 'b', emoji: '😂', at: '2' }];
  assert.equal(nextReaction(list, 'a', '❤️'), null);
  assert.equal(nextReaction(list, 'a', '😂'), '😂');
  assert.equal(nextReaction(list, 'z', '😂'), '😂');
  assert.deepEqual(withMyReaction(list, 'a', null).map((r) => r.memberId), ['b']);
  assert.deepEqual(withMyReaction(list, 'a', '🔥', '3').map((r) => r.emoji), ['😂', '🔥']);
  assert.ok(sameReactions(list, list.map((r) => ({ ...r }))));
  assert.ok(!sameReactions(list, withMyReaction(list, 'a', '🔥')));
});
