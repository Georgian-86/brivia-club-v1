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
  { key: 'games', label: 'Games' },
  { key: 'networking', label: 'Networking' },
  { key: 'culture', label: 'Culture' },
].map(Object.freeze));
const CATEGORY_KEYS = new Set(EVENT_CATEGORIES.map((c) => c.key));
export const isEventCategory = (key) => CATEGORY_KEYS.has(String(key || ''));

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const toDate = (value) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; };
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
// '6:00 PM – 9:00 PM'; an open-ended event ends 'Late'.
export const eventTimeRange = (startsAt, endsAt) => {
  const start = toDate(startsAt);
  if (!start) return '';
  const end = endsAt ? toDate(endsAt) : null;
  return `${clock(start)} – ${end ? clock(end) : 'Late'}`;
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
});

// The new state after the member's own change, with counts moved locally (the next load replaces them).
export const withRsvp = (event, going, wantsCompanion) => {
  const nextGoing = Boolean(going || wantsCompanion);
  const nextWants = nextGoing && Boolean(wantsCompanion);
  return {
    ...event,
    going: nextGoing,
    wantsCompanion: nextWants,
    goingCount: Math.max(0, event.goingCount + (nextGoing === event.going ? 0 : nextGoing ? 1 : -1)),
    companionCount: Math.max(0, event.companionCount + (nextWants === event.wantsCompanion ? 0 : nextWants ? 1 : -1)),
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
  return `<p class="event-kicker">${escapeHtml(categoryLabel(event.category))}${distance ? `<span class="event-kicker-distance"> · ${escapeHtml(distance)}</span>` : ''}</p>`;
};

// One event card (D-118: editorial and quiet, like Posts and Connect): image with the date, a category and distance
// micro-label, the title in Bodoni, one time-and-place line, and a foot with who is going and "Find a companion".
// imageSrc: a bundled asset URL (or '' for the wine gradient). friends as for avatarStack.
export const eventCardMarkup = (event, { imageSrc = '', friends = [] } = {}) => {
  const label = `${event.title}, ${fullDate(event.startsAt)}, ${eventTimeRange(event.startsAt, event.endsAt)}`;
  const place = [event.venueName, event.venueArea.split(',')[0]].filter(Boolean).join(', ');
  return `<article class="event-card" data-event-id="${escapeHtml(event.id)}" data-category="${escapeHtml(event.category)}">
  <div class="event-card-media"${imageSrc ? '' : ' data-fallback'}>${imageSrc ? `<img src="${escapeHtml(imageSrc)}" alt="" loading="lazy" decoding="async" />` : ''}${dateBadgeMarkup(event.startsAt)}</div>
  <div class="event-card-body">
    ${kicker(event)}
    <h2 class="event-card-title"><button type="button" class="event-open" data-event-open="${escapeHtml(event.id)}" aria-label="${escapeHtml(label)}">${escapeHtml(event.title)}</button></h2>
    <p class="event-card-line">${escapeHtml(eventTimeRange(event.startsAt, event.endsAt))}</p>
    <p class="event-card-line">${escapeHtml(place)}</p>
    <div class="event-card-foot">
      <span class="event-going">${friends.length ? `<span class="event-avatars">${avatarStack(friends)}</span>` : ''}<span>${escapeHtml(goingLabel(event.goingCount, friends.length))}</span></span>
      <button type="button" class="event-companion-link${event.wantsCompanion ? ' is-on' : ''}" data-event-companion="${escapeHtml(event.id)}">${event.wantsCompanion ? 'Looking for company' : 'Find a companion'}<span class="sr-only"> for ${escapeHtml(event.title)}</span> ${ARROW}</button>
    </div>
  </div>
</article>`;
};

export const EVENTS_EMPTY = Object.freeze({
  none: { title: 'No events yet', copy: 'New events near you show up here. Check back soon.' },
  category: { title: 'Nothing in this category', copy: 'Try another category, or see all events.' },
  nearby: { title: 'Nothing within 15 km yet', copy: 'Set your area from your own location to see what is close by.' },
  unavailable: { title: 'Events open soon', copy: 'Events near you are almost here. Your posts are under Posts.' },
  error: { title: 'Events could not load', copy: 'Check your connection and try again.' },
});

export const eventDetailMarkup = (event, { imageSrc = '', friends = [] } = {}) => {
  const others = otherCompanions(event);
  return `<div class="event-detail-media"${imageSrc ? '' : ' data-fallback'}>${imageSrc ? `<img src="${escapeHtml(imageSrc)}" alt="" />` : ''}${dateBadgeMarkup(event.startsAt)}
  <button type="button" class="event-detail-icon event-detail-back" data-event-close aria-label="Close event"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></button>
  <button type="button" class="event-detail-icon event-detail-share" data-event-share aria-label="Share event"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 15V4M8 8l4-4 4 4M6 11v8h12v-8"/></svg></button>
</div>
<div class="event-detail-body">
  ${kicker(event)}
  <h2 class="event-detail-title" id="event-detail-title" tabindex="-1">${escapeHtml(event.title)}</h2>
  <p class="event-meta">${CLOCK}<span>${escapeHtml(fullDate(event.startsAt, 'short'))} · ${escapeHtml(eventTimeRange(event.startsAt, event.endsAt))}</span></p>
  <p class="event-meta">${PIN}<span>${escapeHtml([event.venueName, event.venueArea].filter(Boolean).join(', '))}</span></p>
  ${event.description ? `<p class="event-detail-copy">${escapeHtml(event.description)}</p>` : ''}
  ${event.tags.length ? `<ul class="event-tags" aria-label="Tags">${event.tags.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
  <div class="event-detail-row">
    <span class="event-going">${friends.length ? `<span class="event-avatars">${avatarStack(friends)}</span>` : ''}<span>${escapeHtml(goingLabel(event.goingCount, friends.length))}</span></span>
    <button type="button" class="event-going-toggle${event.going ? ' is-on' : ''}" data-event-going aria-pressed="${event.going}">${event.going ? "You're going" : "I'm going"}</button>
  </div>
  <div class="event-detail-row event-companion-row-toggle">
    <div><p class="event-companion-title" id="event-companion-label">Looking for a companion?</p><p class="event-companion-copy" id="event-companion-copy">Let others going know you'd love some company. You're matched with people who also want company, most shared interests first.</p></div>
    <button type="button" class="event-switch" role="switch" data-event-wants aria-checked="${event.wantsCompanion}" aria-labelledby="event-companion-label" aria-describedby="event-companion-copy"><span></span></button>
  </div>
  <button type="button" class="event-see-companions" data-event-companions${event.wantsCompanion ? '' : ' aria-describedby="event-see-hint"'}>See companions (${others}) ${ARROW}</button>
  ${event.wantsCompanion ? '' : '<p class="event-see-hint" id="event-see-hint">Turn on "Looking for a companion?" to see who else is.</p>'}
</div>`;
};

// One row in the companions sheet. person: { id, name, src, sharedInterests, isConnection }, sent: a signal went out.
export const companionRowMarkup = (person, { sent = false } = {}) => {
  const shared = Number(person.sharedInterests) || 0;
  const line = person.isConnection ? 'Already a connection' : shared ? `${shared} shared interest${shared === 1 ? '' : 's'}` : 'Going to this event';
  const action = person.isConnection
    ? `<button type="button" class="event-companion-action" data-companion-chat="${escapeHtml(person.id)}">Message</button>`
    : `<button type="button" class="event-companion-action" data-companion-hi="${escapeHtml(person.id)}"${sent ? ' disabled' : ''}>${sent ? 'Request sent' : 'Say hi'}</button>`;
  return `<li class="event-companion-row"><span class="event-avatar event-avatar-lg">${person.src ? `<img src="${escapeHtml(person.src)}" alt="" />` : escapeHtml(initials(person.name))}</span><span class="event-companion-who"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(line)}</small></span>${action}</li>`;
};

// The note that travels with "Say hi" (a normal signal: the other member still has to agree, CLAUDE.md).
export const companionNote = (eventTitle) => `Hi! I saw we're both going to ${String(eventTitle || 'the same event').slice(0, 80)}. Want to go together?`;
