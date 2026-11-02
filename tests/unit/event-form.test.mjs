// Create Event (D-121): the pure form rules in event-form.js (the server repeats them in save_member_event, 0022).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_FORM_CATEGORIES, emptyDraft, draftFromEvent, validateEventDraft, firstErrorField, toServerFields, serverErrorField,
  serverErrorMessage, imageFileProblem, previewEvent, isMapUrl, istInstant, todayIst,
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

test('publishing names every missing field, first in form order', () => {
  const errors = validateEventDraft({ ...emptyDraft(), title: 'x' }, { publish: true, now: NOW });
  for (const f of ['category', 'description', 'date', 'startTime', 'endTime', 'venueName', 'venueAddress', 'city', 'capacity']) assert.ok(errors[f], f);
  assert.equal(firstErrorField(errors), 'category');
});

test('dates and times: future only (IST), end after start', () => {
  assert.match(validateEventDraft({ ...good(), date: '2026-11-01' }, { publish: true, now: NOW }).date, /today or a later date/);
  assert.match(validateEventDraft({ ...good(), date: '2026-11-02', startTime: '11:00', endTime: '13:00' }, { publish: true, now: NOW }).startTime, /not passed/);
  assert.deepEqual(validateEventDraft({ ...good(), date: '2026-11-02', startTime: '12:30', endTime: '13:00' }, { publish: true, now: NOW }), {});
  assert.match(validateEventDraft({ ...good(), endTime: '17:00' }, { publish: true, now: NOW }).endTime, /after the start/);
  assert.match(validateEventDraft({ ...good(), endTime: '18:00' }, { now: NOW }).endTime, /after the start/, 'also for drafts');
  assert.equal(istInstant('2026-11-07', '18:00').toISOString(), '2026-11-07T12:30:00.000Z');
  assert.equal(todayIst(new Date('2026-11-01T19:00:00Z')), '2026-11-02', 'after 18:30 UTC it is already tomorrow in IST');
});

test('an already published event may keep a start that has passed', () => {
  const d = { ...good(), date: '2026-11-02', startTime: '11:00', endTime: '15:00', status: 'published', originalStart: '2026-11-02T05:30:00.000Z' };
  assert.deepEqual(validateEventDraft(d, { publish: true, now: NOW }), {});
  assert.ok(validateEventDraft({ ...d, startTime: '11:30' }, { publish: true, now: NOW }).startTime);
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
