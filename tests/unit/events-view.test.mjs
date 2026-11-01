// Explore events (D-117): pure helpers in events-view.js. Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_CATEGORIES, isEventCategory, eventDateBadge, eventTimeRange, distanceLabel, goingLabel, companionLabel,
  otherCompanions, normalizeEvent, withRsvp, nearbyEvents, filterEvents, eventCardMarkup, eventDetailMarkup,
  companionRowMarkup, companionNote,
} from '../../site/scripts/events-view.js';

// 2026-10-30 18:00 IST = 12:30 UTC; ends 21:00 IST.
const row = {
  id: 'e1', title: 'Acoustic Jam Session', description: 'An evening of music.', category: 'music', tags: ['Music', 'Networking', 'Chill'],
  venue_name: 'The Whitefield Social', venue_area: 'Whitefield, Bengaluru', starts_at: '2026-10-30T12:30:00Z', ends_at: '2026-10-30T15:30:00Z',
  image_key: 'jam', distance_km: 1, going_count: 12, companion_count: 8, going: false, wants_companion: false,
  friends: [{ id: 'f1', name: 'Asha Rao', photo_url: '' }],
};

test('categories: All first, then the mockup order, plus Culture', () => {
  assert.deepEqual(EVENT_CATEGORIES.map((c) => c.label), ['All', 'Tech', 'Music', 'Sports', 'Food', 'Art', 'Games', 'Networking', 'Culture']);
  assert.ok(isEventCategory('music'));
  assert.ok(!isEventCategory('<script>'));
});

test('date badge and time range read in IST', () => {
  assert.deepEqual(eventDateBadge(row.starts_at), { month: 'OCT', day: '30', weekday: 'Fri' });
  assert.equal(eventTimeRange(row.starts_at, row.ends_at), '6:00 PM – 9:00 PM');
  assert.equal(eventTimeRange(row.starts_at, null), '6:00 PM – Late');
  assert.equal(eventDateBadge('nope'), null);
  assert.equal(eventTimeRange('nope'), '');
});

test('distance is rounded km with a tilde, never metres, and blank without one', () => {
  assert.equal(distanceLabel(1), '~1 km');
  assert.equal(distanceLabel(0.3), '~1 km');
  assert.equal(distanceLabel(12.6), '~13 km');
  assert.equal(distanceLabel(null), '');
  assert.equal(distanceLabel(undefined), '');
});

test('going and companion lines', () => {
  assert.equal(goingLabel(0), 'Be the first to go');
  assert.equal(goingLabel(12), '12 going');
  assert.equal(goingLabel(12, 3), '+9 going');
  assert.equal(goingLabel(2, 2), '2 going');
  assert.equal(companionLabel(8), '8 looking for one');
  assert.equal(companionLabel(1, true), 'Be the first to look');
  assert.equal(otherCompanions({ companionCount: 3, wantsCompanion: true }), 2);
});

test('normalizeEvent keeps only known fields and caps friends and tags', () => {
  const e = normalizeEvent({ ...row, category: 'bogus', tags: ['a', 'b', 'c', 'd', 'e'], friends: [{}, {}, {}, {}], email: 'x@y.z' });
  assert.equal(e.category, 'networking');
  assert.equal(e.tags.length, 4);
  assert.equal(e.friends.length, 3);
  assert.equal('email' in e, false);
  assert.equal(normalizeEvent({ ...row, distance_km: null }).distanceKm, null);
});

test('withRsvp moves the counts once and companion implies going', () => {
  const e = normalizeEvent(row);
  const going = withRsvp(e, true, false);
  assert.deepEqual([going.going, going.wantsCompanion, going.goingCount, going.companionCount], [true, false, 13, 8]);
  const wants = withRsvp(going, true, true);
  assert.deepEqual([wants.goingCount, wants.companionCount], [13, 9]);
  const implied = withRsvp(e, false, true);
  assert.deepEqual([implied.going, implied.wantsCompanion, implied.goingCount, implied.companionCount], [true, true, 13, 9]);
  const off = withRsvp(wants, false, false);
  assert.deepEqual([off.going, off.wantsCompanion, off.goingCount, off.companionCount], [false, false, 12, 8]);
});

test('nearby keeps events within 15 km, nearest first; filter by category', () => {
  const list = [normalizeEvent({ ...row, id: 'a', distance_km: 9 }), normalizeEvent({ ...row, id: 'b', distance_km: 2 }),
    normalizeEvent({ ...row, id: 'c', distance_km: 40 }), normalizeEvent({ ...row, id: 'd', distance_km: null, category: 'tech' })];
  assert.deepEqual(nearbyEvents(list).map((e) => e.id), ['b', 'a']);
  assert.deepEqual(filterEvents(list, 'tech').map((e) => e.id), ['d']);
  assert.equal(filterEvents(list, 'all').length, 4);
});

test('card markup escapes text and labels the open button with the date and time', () => {
  const e = normalizeEvent({ ...row, title: '<b>Jam</b>' });
  const html = eventCardMarkup(e, { imageSrc: '/x.webp', friends: [{ name: 'Asha Rao', src: '' }] });
  assert.ok(!html.includes('<b>Jam</b>'));
  assert.match(html, /&lt;b&gt;Jam&lt;\/b&gt;/);
  assert.match(html, /aria-label="&lt;b&gt;Jam&lt;\/b&gt;, Friday 30 October, 6:00 PM – 9:00 PM"/);
  assert.match(html, /~1 km/);
  assert.match(html, /\+11 going/);
  assert.match(html, /8 looking for one/);
  assert.match(html, />AR</);
});

test('detail markup: switch state, the see-companions count excludes me, a hint until opted in', () => {
  const off = eventDetailMarkup(normalizeEvent(row));
  assert.match(off, /role="switch" data-event-wants aria-checked="false"/);
  assert.match(off, /See companions \(8\)/);
  assert.match(off, /id="event-see-hint"/);
  const on = eventDetailMarkup(normalizeEvent({ ...row, going: true, wants_companion: true, companion_count: 9 }));
  assert.match(on, /aria-checked="true"/);
  assert.match(on, /See companions \(8\)/);
  assert.match(on, /You're going/);
  assert.ok(!on.includes('event-see-hint'));
});

test('companion rows: shared interests, connections get Message, sent disables', () => {
  assert.match(companionRowMarkup({ id: 'p', name: 'Ravi', sharedInterests: 2 }), /2 shared interests[\s\S]*Say hi/);
  assert.match(companionRowMarkup({ id: 'p', name: 'Ravi', sharedInterests: 1 }), /1 shared interest</);
  assert.match(companionRowMarkup({ id: 'p', name: 'Ravi', isConnection: true }), /Already a connection[\s\S]*Message/);
  assert.match(companionRowMarkup({ id: 'p', name: 'Ravi' }, { sent: true }), /disabled>Request sent/);
  assert.match(companionNote('Jam'), /both going to Jam/);
});
