// Explore: events near you (D-117). Pure helpers (no DOM, no Supabase) for events-page.js, unit-tested in
// tests/unit/events-view.test.mjs. Rows come from list_events (0020): distance_km is already whole km (>= 1) or null
// (no home cell, or a city pick), so the page never sees a location, only a rounded distance (CLAUDE.md).

// Events are in the launch cities (India), so their times read in IST wherever the member is.
export const EVENT_TIME_ZONE = 'Asia/Kolkata';

export const EVENT_CATEGORIES = Object.freeze([
  { key: 'all', label: 'All' },
  { key: 'tech', label: 'Tech' },
  { key: 'music', label: 'Music' },
  { key: 'sports', label: 'Sports' },
  { key: 'food', label: 'Food' },
  { key: 'art', label: 'Art' },
  { key: 'college', label: 'College Fest' },   // D-209
  { key: 'games', label: 'Games' },
  { key: 'networking', label: 'Networking' },
  { key: 'culture', label: 'Culture' },
  // D-121 (0022): the create form's other categories, so member events can be filtered too.
  { key: 'startups', label: 'Startups' },
  { key: 'wellness', label: 'Wellness' },
  { key: 'outdoors', label: 'Outdoors' },
  { key: 'education', label: 'Learning' },
  { key: 'workshops', label: 'Workshops' },
  { key: 'community', label: 'Community' },
  { key: 'other', label: 'Other' },
].map(Object.freeze));
const CATEGORY_KEYS = new Set(EVENT_CATEGORIES.map((c) => c.key));
export const isEventCategory = (key) => CATEGORY_KEYS.has(String(key || ''));
// The tabs Explore always shows (the founder's reference); the create form's other categories get a tab only while an
// event in them is listed (D-121), so the row stays as designed.
// D-209: College Fest takes Games' place in the fixed row; Games still shows while a games event is listed.
export const BASE_CATEGORY_KEYS = Object.freeze(['all', 'tech', 'music', 'sports', 'food', 'art', 'college', 'networking', 'culture']);
export const visibleCategories = (events = [], current = 'all') => {
  const used = new Set(events.map((e) => e.category));
  return EVENT_CATEGORIES.filter((c) => BASE_CATEGORY_KEYS.includes(c.key) || used.has(c.key) || c.key === current);
};

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const toDate = (value) => { if (value === null || value === undefined || value === '') return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; };
const parts = (date, options) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: EVENT_TIME_ZONE, ...options })
  .formatToParts(date).map((p) => [p.type, p.value]));

// { month: 'OCT', day: '30', weekday: 'Thu' } in IST, or null for a bad date.
export const eventDateBadge = (startsAt) => {
  const date = toDate(startsAt);
  if (!date) return null;
  const p = parts(date, { month: 'short', day: 'numeric', weekday: 'short' });
  return { month: String(p.month).toUpperCase(), day: String(p.day), weekday: String(p.weekday) };
};

const clock = (date) => {
  const p = parts(date, { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`;
};
const istDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: EVENT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const shortDay = (date) => new Intl.DateTimeFormat('en-GB', { timeZone: EVENT_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' }).format(date).replace(',', '');
// The number of calendar days (IST) an event runs over: 1 for a same-day event, 3 for Thu to Sat (D-197).
export const eventDayCount = (startsAt, endsAt) => {
  const start = toDate(startsAt);
  const end = endsAt ? toDate(endsAt) : null;
  if (!start || !end) return 1;
  return Math.max(1, Math.round((Date.parse(istDay(end)) - Date.parse(istDay(start))) / 86400000) + 1);
};
// D-198: times are optional. An untimed start is stored at 00:00 IST and an untimed end at 23:59 IST.
const hhmm = (date) => { const p = parts(date, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return `${p.hour}:${p.minute}`; };
// '6:00 PM – 9:00 PM'; an open-ended event ends 'Late'; one that ends on a later day names that day,
// '6:00 PM – Sat 8 Nov, 9:00 PM' (D-197); without times, 'All day', 'From 6:00 PM', 'Until 7:00 PM', 'Until Sun 8 Nov'.
export const eventTimeRange = (startsAt, endsAt) => {
  const start = toDate(startsAt);
  if (!start) return '';
  const end = endsAt ? toDate(endsAt) : null;
  const startTimed = hhmm(start) !== '00:00';
  const endTimed = end && hhmm(end) !== '23:59';
  if (end && istDay(end) !== istDay(start)) {
    const until = endTimed ? `${shortDay(end)}, ${clock(end)}` : shortDay(end);
    return startTimed ? `${clock(start)} – ${until}` : `Until ${until}`;
  }
  if (!end) return startTimed ? `${clock(start)} – Late` : 'All day';
  if (startTimed && endTimed) return `${clock(start)} – ${clock(end)}`;
  if (startTimed) return `From ${clock(start)}`;
  if (endTimed) return `Until ${clock(end)}`;
  return 'All day';
};
// D-198: an event that has started and not yet ended ('Happening now' on its card).
export const eventUnderWay = (startsAt, endsAt, now = new Date()) => {
  const start = toDate(startsAt);
  if (!start || start > now) return false;
  const end = endsAt ? toDate(endsAt) : new Date(start.getTime() + 6 * 3600e3);
  return end > now;
};

// '~3 km' (the server already rounds to whole km); '' without a distance.
export const distanceLabel = (km) => {
  const n = Number(km);
  return km === null || km === undefined || !Number.isFinite(n) ? '' : `~${Math.max(1, Math.round(n))} km`;
};

// The going line beside the friends' avatars: '+12 going' after avatars, '12 going' without, and an invitation at 0.
export const goingLabel = (count, friendCount = 0) => {
  const n = Math.max(0, Number(count) || 0);
  const f = Math.max(0, Math.min(n, Number(friendCount) || 0));
  if (n === 0) return 'Be the first to go';
  if (f === 0) return `${n} going`;
  return n - f > 0 ? `+${n - f} going` : `${n} going`;
};

// Others looking for a companion (the caller is not counted).
export const companionLabel = (count, mine = false) => {
  const n = Math.max(0, (Number(count) || 0) - (mine ? 1 : 0));
  if (n === 0) return 'Be the first to look';
  return `${n} looking for one`;
};
export const otherCompanions = (event) => Math.max(0, (Number(event?.companionCount) || 0) - (event?.wantsCompanion ? 1 : 0));

// Entry fee (D-121): 'Free' or '₹1,499' (whole rupees, Indian grouping).
export const feeLabel = (fee) => {
  const n = Math.max(0, Math.round(Number(fee) || 0));
  return n ? `₹${n.toLocaleString('en-IN')}` : 'Free';
};
// Seats (D-121): null without a capacity (the club's open events); otherwise how many are left.
export const spotsLeft = (event) => (event?.capacity ? Math.max(0, event.capacity - (Number(event.registeredCount) || 0)) : null);
export const spotsLabel = (event) => {
  const left = spotsLeft(event);
  if (left === null) return '';
  if (left === 0) return 'Registrations closed';
  return `${left} ${left === 1 ? 'spot' : 'spots'} left`;
};
// '12 registered' for an event with a capacity (everyone with a seat, so the spots add up).
export const registeredLabel = (event) => {
  const n = Math.max(0, Number(event?.registeredCount) || 0);
  return n ? `${n} registered` : 'Be the first to register';
};
// What the member can do about a seat: 'mine-draft' | 'cancelled' | 'confirmed' | 'pending' | 'interested' | 'expired'
// | 'full' | 'open'.
export const registrationState = (event) => {
  if (event.status === 'cancelled') return 'cancelled';
  if (event.status === 'draft') return 'mine-draft';
  if (event.myStatus === 'confirmed') return 'confirmed';
  if (event.myStatus === 'pending_payment') return 'pending';
  if (event.myStatus === 'interested') return 'interested';
  if (spotsLeft(event) === 0) return 'full';
  if (event.myStatus === 'expired') return 'expired';
  return 'open';
};

// "Show interest" (D-125, 0025; every event since D-126, 0026): a half registration. No seat is held and no payment is
// taken, but the member is in the event's companion pool, so Find a companion works before registering or paying.
export const canShowInterest = (event) => event.status === 'published' && !event.isMine
  && !['confirmed', 'pending_payment'].includes(event.myStatus);
export const interestedLabel = (count) => { const n = Math.max(0, Number(count) || 0); return n ? `${n} interested` : ''; };
// A member in the companion pool for the event: a seat, a payment hold or a shown interest (0025).
export const inCompanionPool = (event) => ['confirmed', 'pending_payment', 'interested'].includes(event.myStatus);

const cleanContact = (contact) => {
  if (!contact || typeof contact !== 'object') return null;
  const out = {};
  ['email', 'phone', 'link'].forEach((k) => { if (contact[k]) out[k] = String(contact[k]); });
  if ('public' in contact) out.public = Boolean(contact.public);
  return Object.keys(out).length ? out : null;
};

// A list_events row as the page uses it. Unknown categories fall back to 'networking' for styling only.
export const normalizeEvent = (row = {}) => ({
  id: String(row.id || ''),
  title: String(row.title || '').trim(),
  description: String(row.description || '').trim(),
  category: isEventCategory(row.category) && row.category !== 'all' ? row.category : 'networking',
  tags: Array.isArray(row.tags) ? row.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 4) : [],
  venueName: String(row.venue_name || '').trim(),
  venueArea: String(row.venue_area || '').trim(),
  startsAt: row.starts_at || null,
  endsAt: row.ends_at || null,
  imageKey: String(row.image_key || ''),
  distanceKm: row.distance_km === null || row.distance_km === undefined ? null : Number(row.distance_km),
  goingCount: Math.max(0, Number(row.going_count) || 0),
  companionCount: Math.max(0, Number(row.companion_count) || 0),
  going: Boolean(row.going),
  wantsCompanion: Boolean(row.wants_companion),
  friends: (Array.isArray(row.friends) ? row.friends : []).slice(0, 3).map((f) => ({ id: String(f?.id || ''), name: String(f?.name || 'Member'), photoUrl: f?.photo_url || '' })),
  // D-121 (0022). A database without 0022 sends none of these: the club's own events, open, free, no organiser.
  status: ['draft', 'cancelled'].includes(row.status) ? row.status : 'published',
  customCategory: row.category === 'other' ? String(row.custom_category || '').trim().slice(0, 24) : '',
  isMine: Boolean(row.is_mine),
  organizer: row.organizer && row.organizer.id ? { id: String(row.organizer.id), name: String(row.organizer.name || 'Member'), photoUrl: row.organizer.photo_url || '' } : null,
  imageUrl: String(row.image_url || ''),
  gallery: (Array.isArray(row.gallery_urls) ? row.gallery_urls : []).map(String).filter(Boolean).slice(0, 6),
  venueAddress: String(row.venue_address || '').trim(),
  mapUrl: String(row.map_url || ''),
  placeId: String(row.place_id || ''),
  capacity: Number(row.capacity) > 0 ? Number(row.capacity) : null,
  registeredCount: Math.max(0, Number(row.registered_count ?? row.going_count) || 0),
  feeInr: Math.max(0, Math.round(Number(row.fee_inr) || 0)),
  myStatus: ['confirmed', 'pending_payment', 'expired', 'interested'].includes(row.my_status) ? row.my_status : (row.going ? 'confirmed' : null),
  contact: cleanContact(row.contact),
  // D-125 (0025). Without 0025: no interest and no brochure.
  interestedCount: Math.max(0, Number(row.interested_count) || 0),
  brochureUrl: String(row.brochure_url || ''),
});

// The new state after the member's own change, with counts moved locally (the next load replaces them).
// status: the registration status the server answered ('confirmed' | 'pending_payment'); by default a free event's
// seat is confirmed and a paid one's is pending (D-121).
export const withRsvp = (event, going, wantsCompanion, status = null) => {
  const nextGoing = Boolean(going || wantsCompanion);
  const nextWants = nextGoing && Boolean(wantsCompanion);
  const moved = nextGoing === event.going ? 0 : nextGoing ? 1 : -1;
  const keep = nextGoing && event.going && event.myStatus !== 'expired' ? event.myStatus : null;
  const myStatus = !nextGoing ? null : status || keep || (event.feeInr > 0 && !event.isMine ? 'pending_payment' : 'confirmed');
  // Reserving (or cancelling) turns a shown interest into a seat (or nothing): the interest count moves too.
  const wasInterested = event.myStatus === 'interested' && myStatus !== 'interested';
  return {
    ...event,
    going: nextGoing,
    wantsCompanion: nextWants,
    myStatus,
    goingCount: Math.max(0, event.goingCount + moved),
    registeredCount: Math.max(0, (event.registeredCount || 0) + moved),
    companionCount: Math.max(0, event.companionCount + (nextWants === event.wantsCompanion ? 0 : nextWants ? 1 : -1)),
    interestedCount: Math.max(0, (event.interestedCount || 0) - (wasInterested ? 1 : 0)),
  };
};

// The state after showing (on) or withdrawing (off) interest (D-125). wantsCompanion: the companion choice (on only).
export const withInterest = (event, on, wantsCompanion = false) => {
  if (['confirmed', 'pending_payment'].includes(event.myStatus)) return { ...event, wantsCompanion: on ? Boolean(wantsCompanion) : event.wantsCompanion };
  const was = event.myStatus === 'interested';
  const nextWants = on && Boolean(wantsCompanion);
  const wantsBefore = was && event.wantsCompanion;
  return {
    ...event,
    going: false,
    myStatus: on ? 'interested' : null,
    wantsCompanion: nextWants,
    interestedCount: Math.max(0, (event.interestedCount || 0) + (on === was ? 0 : on ? 1 : -1)),
    companionCount: Math.max(0, event.companionCount + (nextWants === wantsBefore ? 0 : nextWants ? 1 : -1)),
  };
};

// "Nearby Events": those with a distance, nearest first, then soonest; events without a distance are left out.
export const nearbyEvents = (events, maxKm = 15) => events
  .filter((e) => e.distanceKm !== null && e.distanceKm <= maxKm)
  .sort((a, b) => a.distanceKm - b.distanceKm || String(a.startsAt).localeCompare(String(b.startsAt)));

export const filterEvents = (events, category = 'all') => (category === 'all' ? events : events.filter((e) => e.category === category));

const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/></svg>';
const CLOCK = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
const PEOPLE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="8.5" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M3.5 19c.8-3.3 3-5 5.5-5s4.7 1.7 5.5 5M14.5 14.3c.6-.2 1.3-.3 2-.3 2 0 3.6 1.4 4 4"/></svg>';
export const EVENT_ICONS = Object.freeze({ pin: PIN, clock: CLOCK, people: PEOPLE });

const initials = (name) => String(name || 'M').trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase() || 'M';
// friends: [{ name, src }] where src is already checked by the caller (a Storage URL or '').
export const avatarStack = (friends) => friends.map((f) => (f.src
  ? `<span class="event-avatar"><img src="${escapeHtml(f.src)}" alt="" /></span>`
  : `<span class="event-avatar" aria-hidden="true">${escapeHtml(initials(f.name))}</span>`)).join('');

const dateBadgeMarkup = (startsAt) => {
  const b = eventDateBadge(startsAt);
  return b ? `<span class="event-date" aria-hidden="true"><b>${b.month}</b><strong>${b.day}</strong><i>${b.weekday}</i></span>` : '';
};
const fullDate = (startsAt, style = 'long') => {
  const d = toDate(startsAt);
  return d ? new Intl.DateTimeFormat('en-GB', { timeZone: EVENT_TIME_ZONE, weekday: style, day: 'numeric', month: style }).format(d) : '';
};

const categoryLabel = (key) => EVENT_CATEGORIES.find((c) => c.key === key)?.label || 'Event';
const ARROW = '<span aria-hidden="true">↗</span>';
const kicker = (event) => {
  const distance = distanceLabel(event.distanceKm);
  return `<p class="event-kicker">${escapeHtml((event.category === 'other' && event.customCategory) || categoryLabel(event.category))}${distance ? `<span class="event-kicker-distance"> · ${escapeHtml(distance)}</span>` : ''}</p>`;
};

const statusBadge = (event) => (event.status === 'draft' ? '<span class="event-status-badge">Draft</span>'
  : event.status === 'cancelled' ? '<span class="event-status-badge is-cancelled">Cancelled</span>' : '');
// Only a paid event carries a badge on its image (free is the norm; the body line says Free).
const feeBadge = (event) => (event.feeInr ? `<span class="event-fee-badge is-paid">${escapeHtml(feeLabel(event.feeInr))}</span>` : '');
// 'Free · 8 spots left' (or the fee alone for an open event); a draft's line says who can see it.
const seatsLine = (event) => {
  if (event.status === 'draft') return 'Draft · only you can see this';
  if (event.status === 'cancelled') return 'This event was cancelled';
  return [feeLabel(event.feeInr), spotsLabel(event), interestedLabel(event.interestedCount)].filter(Boolean).join(' · ');
};

// One event card (D-118: editorial and quiet, like Posts and Connect): image with the date (and the fee, D-121), a
// category and distance micro-label, the title in Bodoni, the time, the place, the fee and seats, and a foot with who
// is registered and "Find a companion". imageSrc: a checked poster URL or a bundled asset ('' for the wine gradient).
export const eventCardMarkup = (event, { imageSrc = '', friends = [] } = {}) => {
  const label = `${event.title}, ${fullDate(event.startsAt) || 'date to be set'}, ${eventTimeRange(event.startsAt, event.endsAt)}`;
  const place = [event.venueName, String(event.venueArea || '').split(',')[0]].filter(Boolean).join(', ');
  const live = event.status === 'published';
  const count = event.capacity ? registeredLabel(event) : goingLabel(event.goingCount, friends.length);
  return `<article class="event-card${live ? '' : ` is-${event.status}`}" data-event-id="${escapeHtml(event.id)}" data-category="${escapeHtml(event.category)}">
  <div class="event-card-media"${imageSrc ? '' : ' data-fallback'}>${imageSrc ? `<img src="${escapeHtml(imageSrc)}" alt="" loading="lazy" decoding="async" />` : ''}${dateBadgeMarkup(event.startsAt)}${statusBadge(event) || feeBadge(event)}</div>
  <div class="event-card-body">
    ${kicker(event)}
    <h2 class="event-card-title"><button type="button" class="event-open" data-event-open="${escapeHtml(event.id)}" aria-label="${escapeHtml(label)}">${escapeHtml(event.title)}</button></h2>
    <p class="event-card-line">${eventUnderWay(event.startsAt, event.endsAt) && event.status !== 'cancelled' ? '<span class="event-now">Happening now</span> · ' : ''}${escapeHtml(eventTimeRange(event.startsAt, event.endsAt) || 'Date and time to be set')}</p>
    <p class="event-card-line">${escapeHtml(place || 'Venue to be set')}</p>
    <p class="event-card-seats${spotsLeft(event) === 0 && live ? ' is-full' : ''}">${escapeHtml(seatsLine(event))}</p>
    <div class="event-card-foot">
      <span class="event-going">${friends.length ? `<span class="event-avatars">${avatarStack(friends)}</span>` : ''}<span>${escapeHtml(count)}</span></span>
      ${live && !event.isMine ? `<button type="button" class="event-companion-pill" role="switch" aria-checked="${Boolean(event.wantsCompanion)}" data-event-companion="${escapeHtml(event.id)}"><span>Find a companion</span><span class="sr-only"> for ${escapeHtml(event.title)}</span><span class="event-switch-mini" aria-hidden="true"><span></span></span></button>`
    : live ? `<button type="button" class="event-companion-link" data-event-open-detail="${escapeHtml(event.id)}">Manage<span class="sr-only"> ${escapeHtml(event.title)}</span> ${ARROW}</button>`
    : `<button type="button" class="event-companion-link" data-event-open-detail="${escapeHtml(event.id)}">${event.isMine ? 'Manage' : 'Details'}<span class="sr-only"> ${escapeHtml(event.title)}</span> ${ARROW}</button>`}
    </div>
  </div>
</article>`;
};

export const EVENTS_EMPTY = Object.freeze({
  none: { title: 'No events yet', copy: 'New events near you show up here. Check back soon, or create one.' },
  category: { title: 'Nothing in this category', copy: 'Try another category, or see all events.' },
  nearby: { title: 'Nothing within 15 km yet', copy: 'Set your area from your own location to see what is close by.' },
  unavailable: { title: 'Events open soon', copy: 'Events near you are almost here. Your posts are under Posts.' },
  error: { title: 'Events could not load', copy: 'Check your connection and try again.' },
});

const MAIL = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/></svg>';
const PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"/></svg>';
const LINK = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
const safeHref = (href) => (/^(https:\/\/|mailto:|tel:)[^\s"'<>\\]+$/.test(href) ? href : '');
// A folded map with a pin, for "Open in Google Maps" (D-125).
const MAP = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5 4 7v12l5-2 6 2 5-2V5l-5 2-6-2Z"/><path d="M9 5v12M15 7v6"/><path d="M18 16.5s-2.3-2.2-2.3-3.9a2.3 2.3 0 0 1 4.6 0c0 1.7-2.3 3.9-2.3 3.9Z" class="event-map-pin"/></svg>';
const DOC = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 4.5 2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 10l5.2-.8Z"/></svg>';
// 'Google Maps' for a Google link, else 'Maps' (Apple Maps, OpenStreetMap).
export const mapLinkLabel = (url) => (/^https:\/\/((www\.)?google\.|maps\.google\.|maps\.app\.goo\.gl\/|goo\.gl\/maps\/)/.test(String(url || '')) ? 'Open in Google Maps' : 'Open in Maps');

const registrationMarkup = (event, friends = []) => {
  const state = registrationState(event);
  const seats = event.capacity ? `${registeredLabel(event)}${spotsLeft(event) !== null ? ` · ${spotsLabel(event)}` : ''}` : goingLabel(event.goingCount, friends.length);
  const fee = event.feeInr ? `${feeLabel(event.feeInr)} entry` : 'Free entry';
  let action = '';
  let note = '';
  if (event.isMine && (state === 'open' || state === 'expired' || state === 'full')) {
    action = ''; // the organiser hosts; their counts are in "Your event"
  } else if (state === 'open' || state === 'expired' || state === 'interested') {
    action = state === 'interested' && spotsLeft(event) === 0
      ? '<button type="button" class="event-going-toggle" disabled aria-disabled="true">Registrations closed</button>'
      : `<button type="button" class="event-going-toggle" data-event-going aria-pressed="false">${event.feeInr ? `Reserve · ${escapeHtml(feeLabel(event.feeInr))}` : 'Register'}</button>`;
    if (state === 'interested') note = event.feeInr ? "You're interested, so people going can find you as a companion before you pay. Reserve to hold a seat."
      : "You're interested, so people going can find you as a companion. Register to save your seat.";
    else if (state === 'expired') note = 'Your held seat expired. Reserve again if a spot is still free.';
    else if (event.feeInr) note = 'Not ready to pay? Show interest: no seat is held, but you can find a companion going. Reserve holds a seat for 30 minutes while you pay; your ticket arrives by email.';
    else if (canShowInterest(event)) note = 'Not sure yet? Show interest: no seat is held, but you can find a companion going.';
  } else if (state === 'confirmed') {
    action = '<span class="event-registered" role="status">Registered <span aria-hidden="true">✓</span></span>';
  } else if (state === 'pending') {
    // D-183: the hold can be paid from here (Razorpay); the seat is confirmed by the server once payment succeeds.
    action = `<button type="button" class="event-going-toggle is-primary" data-event-pay>Complete payment · ${escapeHtml(feeLabel(event.feeInr))}</button>`;
    note = 'Your seat is held for 30 minutes. It is confirmed, and your ticket emailed, as soon as payment succeeds.';
  } else if (state === 'full') {
    action = '<button type="button" class="event-going-toggle" disabled aria-disabled="true">Registrations closed</button>';
  }
  const cancel = state === 'confirmed' || state === 'pending'
    ? '<button type="button" class="event-text-action" data-event-unregister>Cancel registration</button>' : '';
  const interested = state === 'interested';
  const interest = canShowInterest(event) && (state !== 'full' || interested)
    ? `<button type="button" class="event-interest-toggle" data-event-interest aria-pressed="${interested}">${STAR}<span>${interested ? 'Interested' : 'Show interest'}</span>${interested ? '<span aria-hidden="true"> ✓</span>' : ''}</button>` : '';
  const counts = [seats, interestedLabel(event.interestedCount)].filter(Boolean).join(' · ');
  const copy = `<div class="event-register-copy"><p class="event-register-fee">${escapeHtml(fee)}</p><p class="event-register-seats event-going">${friends.length ? `<span class="event-avatars">${avatarStack(friends)}</span>` : ''}<span>${escapeHtml(counts)}</span></p></div>`;
  // With "Show interest" (D-125) the two choices sit side by side under the fee, equal width: Reserve is the one
  // primary action, Show interest the quiet secondary one.
  const row = interest
    ? `<div class="event-detail-row event-register-row is-paired">${copy}</div>
  <div class="event-register-pair">${action.replace('class="event-going-toggle"', 'class="event-going-toggle is-primary"')}${interest}</div>`
    : `<div class="event-detail-row event-register-row">${copy}${action}</div>`;
  return `${row}${note ? `<p class="event-register-note">${escapeHtml(note)}</p>` : ''}${cancel ? `<div class="event-register-cancel">${cancel}</div>` : ''}`;
};

const organizerMarkup = (event, organizerSrc) => {
  const o = event.organizer;
  const who = o ? escapeHtml(o.name) : 'Brivia Club';
  const avatar = o ? (organizerSrc ? `<span class="event-avatar event-avatar-md"><img src="${escapeHtml(organizerSrc)}" alt="" /></span>` : `<span class="event-avatar event-avatar-md" aria-hidden="true">${escapeHtml(initials(o.name))}</span>`)
    : '<span class="event-avatar event-avatar-md event-avatar-club" aria-hidden="true">B</span>';
  return `<div class="event-organizer">${avatar}<p><span>Hosted by</span><strong>${event.isMine ? `${who} (you)` : who}</strong></p></div>`;
};

const contactMarkup = (event) => {
  if (event.isMine || !event.organizer || event.status !== 'published') return '';
  const c = event.contact || {};
  const items = [
    c.email && safeHref(`mailto:${c.email}`) ? `<li><a href="${escapeHtml(safeHref(`mailto:${c.email}`))}">${MAIL}<span>${escapeHtml(c.email)}</span></a></li>` : '',
    c.phone && safeHref(`tel:${c.phone.replace(/[^+0-9]/g, '')}`) ? `<li><a href="${escapeHtml(safeHref(`tel:${c.phone.replace(/[^+0-9]/g, '')}`))}">${PHONE}<span>${escapeHtml(c.phone)}</span></a></li>` : '',
    c.link && safeHref(c.link) ? `<li><a href="${escapeHtml(safeHref(c.link))}" target="_blank" rel="noopener noreferrer nofollow">${LINK}<span>Contact link</span><span class="sr-only"> (opens in a new tab)</span></a></li>` : '',
  ].filter(Boolean).join('');
  return `<section class="event-contact" aria-labelledby="event-contact-title">
    <p class="event-companion-title" id="event-contact-title">Questions?</p>
    ${items ? `<ul class="event-contact-list">${items}</ul>` : '<p class="event-companion-copy">Ask the organiser here on Brivia. They see your note and can reply once they accept.</p>'}
    <button type="button" class="event-ask" data-event-ask>Ask a question ${ARROW}</button>
  </section>`;
};

const OWNER_CONFIRM = Object.freeze({
  cancel: { copy: 'Cancel this event? Registrations close, and the people registered see it as cancelled.', yes: 'Yes, cancel it', no: 'Keep it' },
  delete: { copy: 'Delete this event for good? This cannot be undone.', yes: 'Delete', no: 'Keep it' },
});
const ownerToolsMarkup = (event, confirm = null) => {
  if (!event.isMine) return '';
  const ask = OWNER_CONFIRM[confirm];
  if (ask) {
    return `<section class="event-owner" aria-label="Your event"><p class="app-eyebrow">YOUR EVENT</p><p class="event-owner-confirm" id="event-owner-confirm" role="alert">${escapeHtml(ask.copy)}</p><div class="event-owner-tools"><button type="button" class="event-owner-action is-quiet" data-event-confirm-no>${escapeHtml(ask.no)}</button><button type="button" class="event-owner-action is-danger" data-event-confirm-yes="${confirm}" aria-describedby="event-owner-confirm">${escapeHtml(ask.yes)}</button></div></section>`;
  }
  const counts = event.status === 'published'
    ? `<p class="event-owner-counts">${escapeHtml(event.capacity ? `${event.registeredCount} of ${event.capacity} registered` : `${event.registeredCount} registered`)}</p>` : '';
  const tools = [
    event.status !== 'cancelled' ? `<button type="button" class="event-owner-action" data-event-edit>${event.status === 'draft' ? 'Continue editing' : 'Edit event'}</button>` : '',
    event.status === 'published' ? '<button type="button" class="event-owner-action is-quiet" data-event-cancel>Cancel event</button>' : '',
    event.status !== 'published' ? `<button type="button" class="event-owner-action is-quiet" data-event-delete>${event.status === 'draft' ? 'Delete draft' : 'Delete event'}</button>` : '',
  ].join('');
  return `<section class="event-owner" aria-label="Your event"><p class="app-eyebrow">YOUR EVENT</p>${counts}<div class="event-owner-tools">${tools}</div></section>`;
};

// D-207: the share menu under the drawer's share button: Copy link, WhatsApp, and the device's own share sheet (shown
// only where the browser has one).
const LINK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
const CHAT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19.1Z"/></svg>';
const MORE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 15V4M8 8l4-4 4 4M6 11v8h12v-8"/></svg>';
const SEND_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4Z"/></svg>';
const SHARE_MENU = `<div class="event-share-menu" id="event-share-menu" data-event-share-menu role="menu" aria-label="Share event" hidden>
    <button type="button" role="menuitem" data-event-share-chat>${SEND_ICON}<span>Send in chat</span></button>
    <button type="button" role="menuitem" data-event-share-copy>${LINK_ICON}<span>Copy link</span></button>
    <button type="button" role="menuitem" data-event-share-whatsapp>${CHAT_ICON}<span>WhatsApp</span></button>
    <button type="button" role="menuitem" data-event-share-more>${MORE_ICON}<span>More options</span></button>
  </div>`;
// The link to an event (it opens Explore on that event) and a WhatsApp share of it.
export const eventShareUrl = (id, origin = globalThis.location?.origin || 'https://thebriviaclub.live') => new URL(`/app.html?view=events&event=${encodeURIComponent(id)}`, origin).href;
export const whatsappShareUrl = (title, url) => `https://wa.me/?text=${encodeURIComponent(`${String(title || '').trim()} ${url}`.trim())}`;

// The drawer. opts: imageSrc (checked), friends, organizerSrc (checked), gallery ([checked URL]), preview (no actions),
// confirm ('cancel' | 'delete': the organiser's inline confirmation), brochureSrc (a checked brochure PDF URL, D-125).
export const eventDetailMarkup = (event, { imageSrc = '', friends = [], organizerSrc = '', gallery = [], preview = false, confirm = null, brochureSrc = '' } = {}) => {
  const others = otherCompanions(event);
  const live = event.status === 'published';
  const inPool = inCompanionPool(event);
  const where = [event.venueName, event.venueAddress, event.venueArea].filter(Boolean).join(', ');
  const map = event.mapUrl && safeHref(event.mapUrl)
    ? `<a class="event-map-link" href="${escapeHtml(event.mapUrl)}" target="_blank" rel="noopener noreferrer nofollow">${MAP}<span>${mapLinkLabel(event.mapUrl)}</span><span class="sr-only"> (opens in a new tab)</span> ${ARROW}</a>` : '';
  const brochure = brochureSrc && safeHref(brochureSrc)
    ? `<a class="event-brochure" href="${escapeHtml(brochureSrc)}" target="_blank" rel="noopener noreferrer">${DOC}<span class="event-brochure-text"><strong>Event brochure</strong><small>PDF</small></span><span class="sr-only"> (opens in a new tab)</span> ${ARROW}</a>` : '';
  const step = companionStep(event);
  const companionHint = step === 'interest' ? 'Not paying yet? Show interest and find someone going. No seat is held.'
    : step === 'closed' ? 'This event is full, so there is no one new to match with.'
      : others ? `${others} ${others === 1 ? 'person is' : 'people are'} looking for company.` : 'Be the first to look for company.';
  return `<div class="event-detail-media"${imageSrc ? '' : ' data-fallback'}>${imageSrc ? `<img src="${escapeHtml(imageSrc)}" alt="" />` : ''}${dateBadgeMarkup(event.startsAt)}
  ${preview ? '' : `<button type="button" class="event-detail-icon event-detail-back" data-event-close aria-label="Close event"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></button>
  ${live ? `<button type="button" class="event-detail-icon event-detail-share" data-event-share aria-label="Share event" aria-haspopup="menu" aria-expanded="false" aria-controls="event-share-menu"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 15V4M8 8l4-4 4 4M6 11v8h12v-8"/></svg></button>
  ${SHARE_MENU}` : ''}`}
</div>
<div class="event-detail-body">
  ${statusBadge(event) ? `<p class="event-detail-status${event.status === 'cancelled' ? ' is-cancelled' : ''}">${event.status === 'cancelled' ? 'Cancelled by the organiser' : 'Draft · only you can see this'}</p>` : ''}
  ${kicker(event)}
  <h2 class="event-detail-title" id="${preview ? 'event-preview-title' : 'event-detail-title'}" tabindex="-1">${escapeHtml(event.title)}</h2>
  <p class="event-meta">${CLOCK}<span>${eventUnderWay(event.startsAt, event.endsAt) && event.status !== 'cancelled' ? '<span class="event-now">Happening now</span> · ' : ''}${escapeHtml(event.startsAt ? `${fullDate(event.startsAt, 'short')} · ${eventTimeRange(event.startsAt, event.endsAt)}` : 'Date and time to be set')}</span></p>
  <p class="event-meta">${PIN}<span>${escapeHtml(where || 'Venue to be set')}</span></p>
  ${map ? `<p class="event-map-row">${map}</p>` : ''}
  ${organizerMarkup(event, organizerSrc)}
  ${ownerToolsMarkup(preview ? { ...event, isMine: false } : event, confirm)}
  ${event.description ? `<p class="event-detail-copy">${escapeHtml(event.description)}</p>` : ''}
  ${brochure}
  ${event.tags.length ? `<ul class="event-tags" aria-label="Tags">${event.tags.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
  ${gallery.length ? `<ul class="event-gallery" aria-label="Photos">${gallery.map((src, i) => `<li><button type="button" class="event-gallery-open" data-event-photo="${i}" aria-label="Open photo ${i + 1} of ${gallery.length}"><img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" /></button></li>`).join('')}</ul>` : ''}
  ${live || event.status === 'cancelled' ? registrationMarkup(preview ? { ...event, myStatus: null } : event, friends) : ''}
  ${live ? `<div class="event-detail-row event-companion-row-toggle">
    <div><p class="event-companion-title" id="event-companion-label">Looking for a companion?</p><p class="event-companion-copy" id="event-companion-copy">Going solo? Find someone attending the same event and make it a shared experience. Only people who also turn this on see you.</p></div>
    <button type="button" class="event-switch" role="switch" data-event-wants aria-checked="${event.wantsCompanion}" aria-labelledby="event-companion-label" aria-describedby="event-companion-copy"${inPool && !preview ? '' : ' disabled'}><span></span></button>
  </div>
  ${event.isMine ? '' : `<button type="button" class="event-see-companions" data-event-companions aria-describedby="event-see-hint"${preview ? ' disabled' : ''}>${PEOPLE}<span>${event.wantsCompanion && inPool ? 'My companions' : 'Find my companion'}</span> ${ARROW}</button>
  <p class="event-see-hint" id="event-see-hint">${escapeHtml(companionHint)}</p>`}` : ''}
  ${preview ? '' : contactMarkup(event)}
</div>`;
};

// "Find my companion" (founder, 2026-11-02; D-125): what one press does for this member and event.
//   'host'     the organiser (they meet everyone there; no list of people for them)
//   'list'     in the pool (a seat, a payment hold or a shown interest) and opted in: show the matches
//   'optin'    in the pool, not opted in: opt in, then show the matches
//   'join'     not registered, free event with a seat: one confirm registers and opts in
//   'interest' not registered, paid event with a seat: one confirm shows interest (no payment) and opts in
//   'closed'   not in the pool and the event is full, or it is not open
export const companionStep = (event) => {
  if (event.isMine) return 'host';
  if (event.status !== 'published') return 'closed';
  if (inCompanionPool(event)) return event.wantsCompanion ? 'list' : 'optin';
  if (spotsLeft(event) === 0) return 'closed';
  return event.feeInr > 0 ? 'interest' : 'join';
};

// One row in the companions sheet. person: { id, name, src, sharedInterests, isConnection }, sent: a signal went out.
export const companionRowMarkup = (person, { sent = false } = {}) => {
  const shared = Number(person.sharedInterests) || 0;
  const background = Number(person.sharedBackground) || 0;
  const line = person.isConnection ? 'Already a connection' : shared ? `${shared} shared interest${shared === 1 ? '' : 's'}`
    : background ? `${background} goal${background === 1 ? '' : 's'} or skill${background === 1 ? '' : 's'} in common` : 'Going to this event';
  const action = person.isConnection
    ? `<button type="button" class="event-companion-action" data-companion-chat="${escapeHtml(person.id)}">Message</button>`
    : `<button type="button" class="event-companion-action" data-companion-hi="${escapeHtml(person.id)}"${sent ? ' disabled' : ''}>${sent ? 'Request sent' : 'Connect'}<span class="sr-only"> with ${escapeHtml(person.name)}</span></button>`;
  return `<li class="event-companion-row"><span class="event-avatar event-avatar-lg">${person.src ? `<img src="${escapeHtml(person.src)}" alt="" />` : escapeHtml(initials(person.name))}</span><span class="event-companion-who"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(line)}</small></span>${action}</li>`;
};

// The note that travels with "Say hi" (a normal signal: the other member still has to agree, CLAUDE.md).
export const companionNote = (eventTitle) => `Hi! I saw we're both going to ${String(eventTitle || 'the same event').slice(0, 80)}. Want to go together?`;

// The note that travels with "Ask a question" (a normal signal to the organiser, who still has to accept).
export const questionNote = (eventTitle, question) => `Question about ${String(eventTitle || 'your event').slice(0, 60)}: ${String(question || '').trim()}`.slice(0, 280);
