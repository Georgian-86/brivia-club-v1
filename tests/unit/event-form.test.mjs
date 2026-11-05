// Create Event (D-121): the pure form rules in event-form.js (the server repeats them in save_member_event, 0022).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_FORM_CATEGORIES, emptyDraft, draftFromEvent, validateEventDraft, firstErrorField, toServerFields, serverErrorField,
  serverErrorMessage, imageFileProblem, previewEvent, isMapUrl, istInstant, todayIst, addDays, MAX_EVENT_DAYS, eventSpan,
} from '../../site/scripts/event-form.js';

const NOW = new Date('2026-11-02T06:30:00Z'); // 12:00 IST
const good = () => ({
  ...emptyDraft(), title: 'Bangalore Chess Meetup', category: 'games', description: 'Rapid games, a friendly ladder and good talk.',
  date: '2026-11-07', startTime: '18:00', endTime: '21:00', venueName: 'Battle Chess Skool', venueAddress: '12 ITPL Main Road',
  placeId: 'in-bengaluru', city: 'Bengaluru', capacity: '30',
});

test('fourteen categories, two rows of seven, Other last', () => {
  assert.deepEqual(EVENT_FORM_CATEGORIES.map((c) => c.label), ['Tech', 'Startups', 'Networking', 'Music', 'Sports', 'Chess & Games', 'Food & Drinks',
    'Art & Culture', 'Wellness', 'Outdoors', 'Learning', 'Workshops', 'Community', 'Other']);
});

test('Other needs your own name when publishing; it travels tidied and only with Other', () => {
  assert.match(validateEventDraft({ ...good(), category: 'other' }, { publish: true, now: NOW }).customCategory, /Name your category/);
  assert.deepEqual(validateEventDraft({ ...good(), category: 'other', customCategory: 'Book club' }, { publish: true, now: NOW }), {});
  assert.ok(validateEventDraft({ ...good(), category: 'other', customCategory: '<b>' }, { now: NOW }).customCategory);
  assert.equal(toServerFields({ ...good(), category: 'other', customCategory: '  Book   club ' }).custom_category, 'Book club');
  assert.equal(toServerFields({ ...good(), category: 'games', customCategory: 'Book club' }).custom_category, '');
  assert.equal(serverErrorField({ message: 'invalid custom_category' }), 'customCategory');
});

test('a complete draft publishes; a draft needs only a name', () => {
  assert.deepEqual(validateEventDraft(good(), { publish: true, now: NOW }), {});
  assert.deepEqual(validateEventDraft({ ...emptyDraft(), title: 'Half an idea' }, { now: NOW }), {});
  assert.ok(validateEventDraft(emptyDraft(), { now: NOW }).title);
});

test('publishing names every missing field, first in form order; times and capacity are optional (D-198)', () => {
  const errors = validateEventDraft({ ...emptyDraft(), title: 'x' }, { publish: true, now: NOW });
  for (const f of ['category', 'description', 'date', 'venueName', 'venueAddress', 'city']) assert.ok(errors[f], f);
  for (const f of ['startTime', 'endTime', 'capacity']) assert.equal(errors[f], undefined, f);
  assert.equal(firstErrorField(errors), 'category');
  assert.deepEqual(validateEventDraft({ ...good(), startTime: '', endTime: '', capacity: '' }, { publish: true, now: NOW }), {});
  assert.equal(toServerFields({ ...good(), capacity: '' }).capacity, '', 'empty: unlimited');
});

test('dates and times (IST): an event may have started, never ended; end after start', () => {
  assert.deepEqual(validateEventDraft({ ...good(), date: '2026-10-31', endDate: '2026-11-07' }, { publish: true, now: NOW }), {}, 'under way since 31 Oct');
  assert.match(validateEventDraft({ ...good(), date: '2026-11-01' }, { publish: true, now: NOW }).date, /already ended/);
  assert.match(validateEventDraft({ ...good(), date: '2026-10-30', endDate: '2026-11-01' }, { publish: true, now: NOW }).endDate, /already ended/);
  assert.deepEqual(validateEventDraft({ ...good(), date: '2026-11-02', startTime: '11:00', endTime: '13:00' }, { publish: true, now: NOW }), {}, 'started an hour ago');
  assert.match(validateEventDraft({ ...good(), date: '2026-11-02', startTime: '09:00', endTime: '11:00' }, { publish: true, now: NOW }).date, /already ended/);
  assert.deepEqual(validateEventDraft({ ...good(), date: '2026-11-02', startTime: '', endTime: '' }, { publish: true, now: NOW }), {}, 'all day today');
  assert.match(validateEventDraft({ ...good(), endTime: '17:00' }, { publish: true, now: NOW }).endTime, /after the start/);
  assert.match(validateEventDraft({ ...good(), endTime: '18:00' }, { now: NOW }).endTime, /after the start/, 'also for drafts');
  assert.equal(istInstant('2026-11-07', '18:00').toISOString(), '2026-11-07T12:30:00.000Z');
  assert.equal(todayIst(new Date('2026-11-01T19:00:00Z')), '2026-11-02', 'after 18:30 UTC it is already tomorrow in IST');
});

test('D-198: untimed events are stored 00:00 to 23:59 IST and read back untimed', () => {
  const span = eventSpan({ date: '2026-11-07', endDate: '2026-11-09', startTime: '', endTime: '' });
  assert.equal(span.starts.toISOString(), '2026-11-06T18:30:00.000Z');
  assert.equal(span.ends.toISOString(), '2026-11-09T18:29:00.000Z');
  assert.equal(eventSpan({ date: '2026-11-07', startTime: '18:00', endTime: '' }).ends, null, 'a timed one-day event stays open-ended');
  const d = draftFromEvent({ id: 'e', title: 'T', startsAt: span.starts.toISOString(), endsAt: span.ends.toISOString() });
  assert.deepEqual([d.date, d.startTime, d.endDate, d.endTime], ['2026-11-07', '', '2026-11-09', '']);
});

test('capacity, fee, contact and map link rules', () => {
  assert.ok(validateEventDraft({ ...good(), capacity: '0' }, { publish: true, now: NOW }).capacity);
  assert.ok(validateEventDraft({ ...good(), capacity: '2.5' }, { publish: true, now: NOW }).capacity);
  assert.match(validateEventDraft({ ...good(), capacity: '5', registeredCount: 8 }, { publish: true, now: NOW }).capacity, /8 people/);
  assert.ok(validateEventDraft({ ...good(), paid: true, fee: '' }, { publish: true, now: NOW }).fee);
  assert.ok(validateEventDraft({ ...good(), paid: true, fee: '0' }, { publish: true, now: NOW }).fee);
  assert.deepEqual(validateEventDraft({ ...good(), paid: true, fee: '499' }, { publish: true, now: NOW }), {});
  assert.ok(validateEventDraft({ ...good(), contactEmail: 'nope' }, { publish: true, now: NOW }).contactEmail);
  assert.ok(validateEventDraft({ ...good(), contactLink: 'http://x.in' }, { publish: true, now: NOW }).contactLink);
  assert.ok(validateEventDraft({ ...good(), contactPublic: true }, { publish: true, now: NOW }).contactPublic);
  assert.ok(isMapUrl('https://maps.app.goo.gl/abc'));
  assert.ok(isMapUrl('https://www.google.com/maps/place/x'));
  assert.ok(!isMapUrl('https://evil.example/maps'));
  assert.ok(!isMapUrl('javascript:alert(1)'));
  assert.ok(validateEventDraft({ ...good(), mapUrl: 'https://evil.example' }, { publish: true, now: NOW }).mapUrl);
});

test('server body: fee 0 when free, pin only when set, trimmed text', () => {
  const body = toServerFields({ ...good(), title: '  Chess  ', paid: false, fee: '300', pin: { lat: 12.9, lng: 77.7 } });
  assert.equal(body.title, 'Chess');
  assert.equal(body.fee_inr, '0');
  assert.deepEqual(body.pin, { lat: 12.9, lng: 77.7 });
  assert.equal(body.place_id, 'in-bengaluru');
  assert.ok(!('pin' in toServerFields(good())));
  assert.equal(toServerFields({ ...good(), paid: true, fee: '499' }).fee_inr, '499');
});

test('server errors map back to fields and messages', () => {
  assert.equal(serverErrorField({ code: '22023', message: 'invalid end_time' }), 'endTime');
  assert.equal(serverErrorField({ code: '22023', message: 'invalid place_id' }), 'city');
  assert.equal(serverErrorField({ message: 'boom' }), null);
  assert.match(serverErrorMessage({ code: 'P0001', message: 'event_limit' }), /10 events today/);
  assert.match(serverErrorMessage({ code: '42501', message: 'not your event' }), /organiser/);
});

test('photos from the device gallery: any photo the browser reads (HEIC too), up to 25 MB; never SVG or a document', () => {
  assert.equal(imageFileProblem({ type: 'image/png', size: 1000 }), '');
  assert.equal(imageFileProblem({ type: 'image/heic', size: 1000 }), '');
  assert.equal(imageFileProblem({ type: '', name: 'IMG_0042.HEIC', size: 1000 }), '', 'browsers often send no type for HEIC');
  assert.equal(imageFileProblem({ type: 'image/jpeg', size: 18 * 1024 * 1024 }), '', 'a phone original is fine (it is shrunk first)');
  assert.match(imageFileProblem({ type: 'image/jpeg', size: 26 * 1024 * 1024 }), /25 MB/);
  assert.match(imageFileProblem({ type: 'image/svg+xml', size: 10 }), /Choose a photo/);
  assert.match(imageFileProblem({ type: 'application/pdf', name: 'a.pdf', size: 10 }), /Choose a photo/);
});

test('edit round-trip: a listed event fills the form in IST', () => {
  const d = draftFromEvent({ id: 'e', status: 'published', title: 'T', category: 'games', description: 'd', startsAt: '2026-11-07T12:30:00Z', endsAt: '2026-11-07T15:30:00Z',
    venueName: 'V', venueAddress: 'A', venueArea: 'Bengaluru', placeId: 'in-bengaluru', mapUrl: '', capacity: 30, feeInr: 499,
    contact: { email: 'h@example.com', public: true }, imageUrl: '', gallery: [], registeredCount: 3 });
  assert.equal(d.date, '2026-11-07');
  assert.equal(d.startTime, '18:00');
  assert.equal(d.endTime, '21:00');
  assert.equal(d.city, 'Bengaluru');
  assert.equal(d.paid, true);
  assert.equal(d.fee, '499');
  assert.equal(d.contactPublic, true);
  assert.equal(d.registeredCount, 3);
});

test('preview event: placeholders until filled, spots from capacity, fee', () => {
  const p = previewEvent(emptyDraft());
  assert.equal(p.title, 'Your event name');
  assert.equal(p.startsAt, null);
  const q = previewEvent({ ...good(), paid: true, fee: '250' }, { organizer: { id: 'me', name: 'Me' } });
  assert.equal(q.capacity, 30);
  assert.equal(q.feeInr, 250);
  assert.equal(q.startsAt, '2026-11-07T12:30:00.000Z');
  assert.equal(q.organizer.name, 'Me');
});

test('D-197: an event can run over several days, ending after it starts and at most a year on', () => {
  assert.equal(addDays('2026-11-28', 5), '2026-12-03');
  assert.deepEqual(validateEventDraft({ ...good(), endDate: '2026-11-07' }, { publish: true, now: NOW }), {}, 'the same day is fine');
  assert.deepEqual(validateEventDraft({ ...good(), endDate: '2026-11-09', endTime: '17:00' }, { publish: true, now: NOW }), {}, 'ends earlier in the day, two days on');
  assert.match(validateEventDraft({ ...good(), endDate: '2026-11-06' }, { publish: true, now: NOW }).endDate, /before the start/);
  assert.match(validateEventDraft({ ...good(), endDate: addDays('2026-11-07', MAX_EVENT_DAYS + 1) }, { now: NOW }).endDate, /at most a year/);
  assert.deepEqual(validateEventDraft({ ...good(), endDate: addDays('2026-11-07', MAX_EVENT_DAYS) }, { publish: true, now: NOW }), {});
  assert.match(validateEventDraft({ ...good(), endDate: '2026-11-07', endTime: '17:00' }, { publish: true, now: NOW }).endTime, /after the start/);
  assert.equal(toServerFields({ ...good(), endDate: '2026-11-09' }).end_date, '2026-11-09');
  assert.equal(toServerFields(good()).end_date, '', 'blank: the server ends it on the start date');
  assert.equal(serverErrorField({ code: '22023', message: 'invalid end_date' }), 'endDate');
  const d = draftFromEvent({ id: 'e', status: 'published', title: 'T', startsAt: '2026-11-07T12:30:00Z', endsAt: '2026-11-09T11:30:00Z' });
  assert.equal(d.endDate, '2026-11-09');
  assert.equal(d.endTime, '17:00');
  const p = previewEvent({ ...good(), endDate: '2026-11-09', endTime: '17:00' });
  assert.equal(p.endsAt, '2026-11-09T11:30:00.000Z');
});
