// D-203: registrations for my events in the notification panel, and the gallery's photo viewer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNotification, groupEventNotifications, eventNotificationCopy } from '../../site/scripts/member-notifications.js';
import { wrapIndex } from '../../site/scripts/photo-viewer.js';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const row = (id, who, at, extra = {}) => normalizeNotification({ id, notification_type: 'event_registered', source_user_id: who, name: `${who} Rao`,
  event_id: 'ev1', snippet: 'Goa Buildathon', event_image_url: 'https://x/p.webp', created_at: at, ...extra });

test('one row per event: everyone who registered, newest first, unread if any is', () => {
  const list = [row('a', 'Asha', '2026-11-05T10:00:00Z', { read_at: '2026-11-05T10:01:00Z' }), row('b', 'Ravi', '2026-11-05T11:00:00Z'),
    row('c', 'Meera', '2026-11-05T09:00:00Z', { event_id: 'ev2', snippet: 'Chess night' }),
    row('d', 'Old', '2026-10-20T09:00:00Z', { event_id: 'ev3' }), row('e', 'Gone', '2026-11-05T11:30:00Z', { dismissed_at: '2026-11-05T11:31:00Z' }),
    normalizeNotification({ id: 'f', notification_type: 'post_like', post_id: 'p1', created_at: '2026-11-05T11:00:00Z' })];
  const groups = groupEventNotifications(list, NOW);
  assert.deepEqual(groups.map((g) => [g.eventId, g.people.map((p) => p.id), g.unread]), [['ev1', ['Asha', 'Ravi'], true], ['ev2', ['Meera'], true]]);
  assert.equal(groups[0].eventImage, 'https://x/p.webp');
  assert.deepEqual(groups[0].ids.sort(), ['a', 'b']);
});

test('the copy names who registered and for what', () => {
  assert.equal(eventNotificationCopy({ title: 'Goa Buildathon', people: [{ name: 'Asha Rao' }] }).title, 'Asha registered for Goa Buildathon');
  assert.equal(eventNotificationCopy({ title: 'Goa Buildathon', people: [{ name: 'Asha' }, { name: 'Ravi K' }] }).title, 'Asha and Ravi registered for Goa Buildathon');
  assert.equal(eventNotificationCopy({ title: 'X', people: [{ name: 'Asha' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] }).title, 'Asha and 3 others registered for X');
  assert.equal(eventNotificationCopy({ people: [] }).title, 'A member registered for your event');
});

test('the photo viewer wraps around both ways', () => {
  assert.equal(wrapIndex(3, 3), 0);
  assert.equal(wrapIndex(-1, 3), 2);
  assert.equal(wrapIndex(1, 3), 1);
  assert.equal(wrapIndex(5, 0), 0);
});
