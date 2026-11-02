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

test('categories: All first, then the mockup order, plus Culture, then the create form\'s others (D-121)', () => {
  assert.deepEqual(EVENT_CATEGORIES.map((c) => c.label), ['All', 'Tech', 'Music', 'Sports', 'Food', 'Art', 'Games', 'Networking', 'Culture',
    'Startups', 'Wellness', 'Outdoors', 'Learning', 'Workshops', 'Community', 'Other']);
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
  assert.match(html, /<p class="event-kicker">Music<span class="event-kicker-distance"> · ~1 km<\/span><\/p>/);
  assert.match(html, /\+11 going/);
  assert.match(html, />AR</);
  // D-118: a quiet card: no tags, no counts of companions, two controls (open, Find a companion).
  assert.ok(!html.includes('event-tags'));
  assert.equal((html.match(/<button\b/g) || []).length, 2);
  assert.match(html, /role="switch" aria-checked="false" data-event-companion="e1"><span>Find a companion<\/span><span class="sr-only"> for &lt;b&gt;Jam&lt;\/b&gt;<\/span>/);
  assert.match(eventCardMarkup(normalizeEvent({ ...row, wants_companion: true, going: true })), /role="switch" aria-checked="true"/);
});

test('detail markup: switch state, the see-companions count excludes me, a hint until opted in', () => {
  const off = eventDetailMarkup(normalizeEvent(row));
  assert.match(off, /role="switch" data-event-wants aria-checked="false"[^>]* disabled/);
  assert.match(off, /Find my companion/);
  assert.match(off, /8 people are looking for company/);
  const on = eventDetailMarkup(normalizeEvent({ ...row, going: true, wants_companion: true, companion_count: 9 }));
  assert.match(on, /aria-checked="true"/);
  assert.match(on, /My companions/);
  assert.match(on, /8 people are looking for company/, 'others only: my own opt-in is not counted');
  assert.match(on, /Registered/);
  assert.match(on, /data-event-unregister/);
  assert.ok(!/data-event-wants[^>]* disabled/.test(on));
});

test('companion rows: shared interests, connections get Message, sent disables', () => {
  assert.match(companionRowMarkup({ id: 'p', name: 'Ravi', sharedInterests: 2 }), /2 shared interests[\s\S]*Connect/);
  assert.match(companionRowMarkup({ id: 'p', name: 'Ravi', sharedInterests: 1 }), /1 shared interest</);
  assert.match(companionRowMarkup({ id: 'p', name: 'Ravi', isConnection: true }), /Already a connection[\s\S]*Message/);
  assert.match(companionRowMarkup({ id: 'p', name: 'Ravi' }, { sent: true }), /disabled>Request sent/);
  assert.match(companionNote('Jam'), /both going to Jam/);
});

// D-121 (0022): member events on the card and in the drawer.
import { feeLabel, spotsLeft, spotsLabel, registrationState, questionNote } from '../../site/scripts/events-view.js';
const member = {
  ...row, id: 'm1', status: 'published', is_mine: false, organizer: { id: 'o1', name: 'Kiran', photo_url: '' },
  image_url: 'https://x.supabase.co/storage/v1/object/public/event-posters/o1/p.jpg', gallery_urls: [], venue_address: '12 ITPL Road',
  map_url: 'https://maps.app.goo.gl/abc', place_id: 'in-bengaluru', capacity: 20, registered_count: 12, fee_inr: 1499, my_status: null, contact: null,
};

test('fee, spots and registration state', () => {
  assert.equal(feeLabel(0), 'Free');
  assert.equal(feeLabel(1499), '₹1,499');
  const e = normalizeEvent(member);
  assert.equal(spotsLeft(e), 8);
  assert.equal(spotsLabel(e), '8 spots left');
  assert.equal(spotsLabel({ ...e, registeredCount: 19 }), '1 spot left');
  assert.equal(spotsLabel({ ...e, registeredCount: 20 }), 'Registrations closed');
  assert.equal(spotsLabel(normalizeEvent(row)), '', 'the club\'s open events have no capacity');
  assert.equal(registrationState(e), 'open');
  assert.equal(registrationState({ ...e, registeredCount: 20 }), 'full');
  assert.equal(registrationState({ ...e, myStatus: 'pending_payment' }), 'pending');
  assert.equal(registrationState({ ...e, myStatus: 'confirmed', registeredCount: 20 }), 'confirmed', 'a member with a seat is never "full"');
  assert.equal(registrationState({ ...e, myStatus: 'expired' }), 'expired');
  assert.equal(registrationState({ ...e, status: 'cancelled' }), 'cancelled');
});

test('normalizeEvent without 0022 columns: published, open, free, no organiser; my status follows going', () => {
  const e = normalizeEvent({ ...row, going: true });
  assert.equal(e.status, 'published');
  assert.equal(e.capacity, null);
  assert.equal(e.feeInr, 0);
  assert.equal(e.organizer, null);
  assert.equal(e.myStatus, 'confirmed');
});

test('withRsvp: a paid registration is pending, seats move, cancelling clears the status', () => {
  const e = normalizeEvent(member);
  const reg = withRsvp(e, true, false);
  assert.equal(reg.myStatus, 'pending_payment');
  assert.equal(reg.registeredCount, 13);
  const confirmed = withRsvp(e, true, false, 'confirmed');
  assert.equal(confirmed.myStatus, 'confirmed');
  const off = withRsvp(confirmed, false, false);
  assert.equal(off.myStatus, null);
  assert.equal(off.registeredCount, 12);
  assert.equal(withRsvp(normalizeEvent({ ...member, fee_inr: 0 }), true, false).myStatus, 'confirmed');
});

test('card: poster, fee badge, seats line, Find a companion; a draft says only you can see it', () => {
  const e = normalizeEvent(member);
  const html = eventCardMarkup(e, { imageSrc: e.imageUrl });
  assert.match(html, /event-posters\/o1\/p\.jpg/);
  assert.match(html, /event-fee-badge is-paid">₹1,499</);
  assert.match(html, /₹1,499 · 8 spots left/);
  assert.match(html, /12 registered/);
  assert.match(html, /Find a companion/);
  const draft = eventCardMarkup(normalizeEvent({ ...member, status: 'draft', is_mine: true, starts_at: null, ends_at: null }));
  assert.match(draft, /event-status-badge">Draft/);
  assert.match(draft, /only you can see this/);
  assert.match(draft, /Date and time to be set/);
  assert.match(draft, /data-event-open-detail="m1">Manage/);
  assert.ok(!draft.includes('data-event-companion='));
  assert.ok(!eventCardMarkup(normalizeEvent({ ...member, title: '<img src=x onerror=1>' })).includes('<img src=x'), 'escaped');
});

test('drawer: host, Reserve for a paid event, map link, contact only when given, Ask a question', () => {
  const e = normalizeEvent(member);
  const html = eventDetailMarkup(e);
  assert.match(html, /Hosted by<\/span><strong>Kiran/);
  assert.match(html, /Reserve · ₹1,499/);
  assert.match(html, /confirmed once payment completes/);
  assert.match(html, /href="https:\/\/maps\.app\.goo\.gl\/abc" target="_blank" rel="noopener noreferrer nofollow"/);
  assert.match(html, /Looking for a companion\?/);
  assert.match(html, /Going solo\? Find someone attending the same event and make it a shared experience/);
  assert.match(html, /data-event-ask/);
  assert.ok(!html.includes('mailto:'));
  const withContact = eventDetailMarkup(normalizeEvent({ ...member, contact: { email: 'host@example.com', link: 'javascript:alert(1)' } }));
  assert.match(withContact, /href="mailto:host@example\.com"/);
  assert.ok(!withContact.includes('javascript:'), 'only https links render');
  assert.match(eventDetailMarkup({ ...e, registeredCount: 20 }), /disabled aria-disabled="true">Registrations closed/);
  assert.match(eventDetailMarkup({ ...e, myStatus: 'pending_payment', going: true }), /Payment pending[\s\S]*confirmed only after payment succeeds/);
});

test('drawer for the organiser: counts and tools, never companion choices; inline confirm', () => {
  const mine = normalizeEvent({ ...member, is_mine: true, contact: { email: 'me@example.com', public: false } });
  const html = eventDetailMarkup(mine);
  assert.match(html, /12 of 20 registered/);
  assert.match(html, /data-event-edit/);
  assert.match(html, /data-event-cancel/);
  assert.ok(!html.includes('data-event-delete'), 'a published event is cancelled, not deleted');
  assert.ok(!html.includes('data-event-ask'), 'no asking yourself');
  assert.ok(!html.includes('data-event-going'), 'the host is not offered Register or Reserve');
  assert.match(eventDetailMarkup(mine, { confirm: 'cancel' }), /role="alert">Cancel this event\?[\s\S]*data-event-confirm-yes="cancel"/);
  assert.match(eventDetailMarkup({ ...mine, status: 'draft' }), /Delete draft/);
});

test('companion row mentions shared goals when interests do not overlap; the question note is capped', () => {
  assert.match(companionRowMarkup({ id: 'p', name: 'Ravi', sharedInterests: 0, sharedBackground: 2 }), /2 goals or skills in common/);
  assert.ok(questionNote('Chess', 'x'.repeat(400)).length <= 280);
  assert.match(questionNote('Chess', 'Is parking free?'), /^Question about Chess: Is parking free\?$/);
});

test('tabs: the reference nine always; a new category only while an event uses it', async () => {
  const { visibleCategories } = await import('../../site/scripts/events-view.js');
  assert.deepEqual(visibleCategories([]).map((c) => c.key), ['all', 'tech', 'music', 'sports', 'food', 'art', 'games', 'networking', 'culture']);
  assert.deepEqual(visibleCategories([{ category: 'workshops' }]).map((c) => c.key).slice(-1), ['workshops']);
  assert.ok(visibleCategories([], 'education').some((c) => c.key === 'education'), 'the selected tab never vanishes');
});

test('an Other event shows its own category name', () => {
  const html = eventCardMarkup(normalizeEvent({ ...row, category: 'other', custom_category: 'Book club' }));
  assert.match(html, /event-kicker">Book club/);
  assert.match(eventCardMarkup(normalizeEvent({ ...row, category: 'music', custom_category: 'Ignored' })), /event-kicker">Music/);
});

test('Find my companion: one press does the next right thing for each member', async () => {
  const { companionStep } = await import('../../site/scripts/events-view.js');
  const e = normalizeEvent({ ...row, capacity: 10, registered_count: 2 });
  assert.equal(companionStep(e), 'join', 'free, not registered: one confirm registers and opts in');
  assert.equal(companionStep({ ...e, feeInr: 499 }), 'interest', 'paid, not registered: show interest (no payment) and opt in');
  assert.equal(companionStep({ ...e, registeredCount: 10 }), 'closed');
  assert.equal(companionStep({ ...e, myStatus: 'confirmed', going: true }), 'optin');
  assert.equal(companionStep({ ...e, myStatus: 'confirmed', going: true, wantsCompanion: true }), 'list');
  assert.equal(companionStep({ ...e, myStatus: 'confirmed', registeredCount: 10, going: true, wantsCompanion: true }), 'list', 'a full event still lists for someone with a seat');
  assert.equal(companionStep({ ...e, myStatus: 'pending_payment', going: true }), 'optin', 'a payment hold is in the pool (D-125)');
  assert.equal(companionStep({ ...e, feeInr: 499, myStatus: 'interested' }), 'optin');
  assert.equal(companionStep({ ...e, feeInr: 499, myStatus: 'interested', wantsCompanion: true, registeredCount: 10 }), 'list', 'an interest lists even when full');
  assert.equal(companionStep({ ...e, isMine: true }), 'host');
  assert.equal(companionStep({ ...e, status: 'cancelled' }), 'closed');
});

test('Find my companion on the card and in the drawer; Connect on each match', () => {
  const e = normalizeEvent(row);
  assert.match(eventCardMarkup(e), /class="event-companion-pill" role="switch" aria-checked="false" data-event-companion="e1"><span>Find a companion/);
  assert.match(eventCardMarkup({ ...e, wantsCompanion: true }), /aria-checked="true"/);
  assert.ok(!eventCardMarkup({ ...e, isMine: true }).includes('data-event-companion='), 'no companion button on your own event');
  const html = eventDetailMarkup(e);
  assert.match(html, /data-event-companions[^>]*>.*Find my companion/s);
  assert.match(html, /8 people are looking for company/);
  assert.match(companionRowMarkup({ id: 'p', name: 'Ravi', sharedInterests: 2 }), />Connect<span class="sr-only"> with Ravi/);
});

test('Show interest (D-125): a half registration for paid events, counted for companions, no seat held', async () => {
  const { canShowInterest, withInterest, interestedLabel, registrationState, mapLinkLabel } = await import('../../site/scripts/events-view.js');
  const paid = normalizeEvent({ ...row, fee_inr: 799, capacity: 10, registered_count: 2, interested_count: 3, brochure_url: 'https://x.supabase.co/storage/v1/object/public/event-brochures/u/b.pdf' });
  assert.equal(paid.interestedCount, 3);
  assert.match(paid.brochureUrl, /b\.pdf$/);
  assert.equal(normalizeEvent({ ...row, my_status: 'interested' }).myStatus, 'interested');
  assert.ok(canShowInterest(paid));
  assert.ok(canShowInterest(normalizeEvent(row)), 'free events take an interest too (D-126)');
  assert.match(eventDetailMarkup(normalizeEvent(row)), /Register<\/button><button type="button" class="event-interest-toggle"[^>]*>.*Show interest/s);
  assert.match(eventDetailMarkup(normalizeEvent(row)), /Not sure yet\? Show interest/);
  assert.ok(!canShowInterest({ ...paid, isMine: true }));
  assert.ok(!canShowInterest({ ...paid, myStatus: 'pending_payment' }));
  assert.equal(interestedLabel(0), '');
  let html = eventDetailMarkup(paid);
  assert.match(html, /data-event-interest aria-pressed="false">.*Show interest/s);
  assert.match(html, /Reserve · ₹799/);
  assert.match(html, /3 interested/);
  assert.match(eventCardMarkup(paid), /₹799 · 8 spots left · 3 interested/);
  const on = withInterest(paid, true, true);
  assert.equal(on.myStatus, 'interested');
  assert.equal(on.going, false);
  assert.equal(on.interestedCount, 4);
  assert.equal(on.registeredCount, 2, 'no seat is held');
  assert.equal(registrationState(on), 'interested');
  html = eventDetailMarkup(on);
  assert.match(html, /aria-pressed="true">.*Interested/s);
  assert.match(html, /data-event-wants aria-checked="true"[^>]*>(?!.*disabled)/, 'the companion switch works on an interest');
  assert.ok(!/data-event-wants[^>]*disabled/.test(html));
  const off = withInterest(on, false);
  assert.equal(off.myStatus, null);
  assert.equal(off.interestedCount, 3);
  assert.equal(off.wantsCompanion, false);
  const reserved = withRsvp(on, true, true, 'pending_payment');
  assert.equal(reserved.interestedCount, 3, 'reserving moves the interest into a hold');
  assert.equal(reserved.registeredCount, 3);
  assert.equal(mapLinkLabel('https://maps.app.goo.gl/x'), 'Open in Google Maps');
  assert.equal(mapLinkLabel('https://maps.apple.com/?q=x'), 'Open in Maps');
});

test('drawer: the brochure link only for a checked URL; the map link has its icon', () => {
  const e = normalizeEvent({ ...row, map_url: 'https://maps.app.goo.gl/abc' });
  assert.ok(!eventDetailMarkup(e).includes('event-brochure'), 'no brochure without a checked URL');
  const html = eventDetailMarkup(e, { brochureSrc: 'https://x.supabase.co/storage/v1/object/public/event-brochures/u/b.pdf' });
  assert.match(html, /class="event-brochure" href="https:\/\/x\.supabase\.co[^"]*b\.pdf" target="_blank" rel="noopener noreferrer">/);
  assert.match(html, /Event brochure/);
  assert.match(html, /class="event-map-link"[^>]*><svg[^>]*>.*<span>Open in Google Maps<\/span>/s);
  assert.ok(!eventDetailMarkup(e, { brochureSrc: 'javascript:alert(1)' }).includes('event-brochure'));
});
