// Find a Companion (D-123, migration 0023): pure markup and labels for companions-page.js, unit-tested in
// tests/unit/companion-view.test.mjs. Rows come from companion_deck / companion_events / my_companion_matches; the page
// passes image URLs it has already checked (safeImage / a bundled cover). No location beyond the deck's band.
import { EVENT_TIME_ZONE } from './events-view.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const initials = (name) => String(name || 'M').trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase() || 'M';
const toDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

// 'Tue 4 Nov' in IST (events are in the launch cities).
export const shortEventDate = (iso) => {
  const d = toDate(iso);
  return d ? new Intl.DateTimeFormat('en-GB', { timeZone: EVENT_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(',', '') : '';
};
// 'Blitz Chess Meetup · 4 Nov' for the event picker.
export const eventPickLabel = (event) => {
  const d = toDate(event?.startsAt);
  const day = d ? new Intl.DateTimeFormat('en-GB', { timeZone: EVENT_TIME_ZONE, day: 'numeric', month: 'short' }).format(d) : '';
  return [event?.title || 'Event', day].filter(Boolean).join(' · ');
};
// '4 looking for a companion' (the founder's reference: a pill with up to three faces before it).
export const lookingCount = (n) => {
  const k = Math.max(0, Number(n) || 0);
  return `${k} looking for a companion`;
};
// The pill: up to three faces (checked photo URLs, or initials) and the count.
export const lookingPillMarkup = (people = [], { photoSrc = () => '' } = {}) => {
  const faces = people.slice(0, 3).map((p) => {
    const src = photoSrc(p);
    return `<span class="companion-face">${src ? `<img src="${escapeHtml(src)}" alt="" />` : `<span>${escapeHtml(initials(p.name))}</span>`}</span>`;
  }).join('');
  return `${faces ? `<span class="companion-faces" aria-hidden="true">${faces}</span>` : ''}<span>${escapeHtml(lookingCount(people.length))}</span>`;
};

export const normalizeCompanionEvent = (row = {}) => ({
  id: String(row.event_id || ''), title: String(row.title || '').trim(), startsAt: row.starts_at || null, endsAt: row.ends_at || null,
  venueName: String(row.venue_name || '').trim(), venueArea: String(row.venue_area || '').trim(), toSee: Math.max(0, Number(row.to_see) || 0),
});

export const normalizeCompanion = (row = {}) => ({
  id: String(row.member_id || ''),
  name: String(row.name || 'Member').trim() || 'Member',
  photoUrl: row.photo_url || '',
  coverUrl: row.cover_url || '',
  headline: String(row.headline || '').trim(),
  lookingFor: (Array.isArray(row.looking_for) ? row.looking_for : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 3),
  interests: (Array.isArray(row.interests) ? row.interests : []).map(String).filter(Boolean).slice(0, 4),
  shared: (Array.isArray(row.shared_interests) ? row.shared_interests : []).map(String).filter(Boolean).slice(0, 4),
  band: String(row.distance_band || '').trim(),
  sharedCount: Math.max(0, Number(row.shared_count) || 0),
});

// The professional line: 'Founder · Looking for Friends, Co-founder', or the shared interests when there is no headline.
export const headlineFor = (person) => {
  const parts = [person.headline, person.lookingFor.length ? `Looking for ${person.lookingFor.join(', ')}` : ''].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return person.sharedCount ? `${person.sharedCount} shared interest${person.sharedCount === 1 ? '' : 's'}` : 'Going to this event';
};
// The location line: the deck's band only ('~3 km away', '~10 km away', a place name, 'Abroad').
export const bandLine = (band) => (!band ? '' : /^~\d+ km$/.test(band) ? `${band} away` : band);

const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/></svg>';
const CAL = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>';
export const COMPANION_ICONS = Object.freeze({ pin: PIN, cal: CAL });

// One card. opts: coverSrc / photoSrc (checked), event { title, startsAt, venueName }, current (the one the buttons act on).
export const companionCardMarkup = (person, { coverSrc = '', photoSrc = '', event = {}, current = false, index = 0 } = {}) => {
  const shared = new Set(person.shared.map((s) => s.toLowerCase()));
  const chips = person.interests.map((label) => `<li class="${shared.has(label.toLowerCase()) ? 'is-shared' : ''}">${escapeHtml(label)}${shared.has(label.toLowerCase()) ? '<span class="sr-only"> (you share this)</span>' : ''}</li>`).join('');
  const when = [shortEventDate(event.startsAt), event.venueName].filter(Boolean).join(' · ');
  const band = bandLine(person.band);
  return `<article class="companion-card${current ? ' is-current' : ''}" data-companion-id="${escapeHtml(person.id)}" data-index="${index}" aria-label="${escapeHtml(`${person.name}, looking for a companion for ${event.title || 'this event'}`)}">
  <div class="companion-card-bar"><span>Looking for a companion</span><button type="button" class="companion-card-more" data-companion-profile="${escapeHtml(person.id)}" aria-label="More about ${escapeHtml(person.name)}"><span aria-hidden="true">•••</span></button></div>
  <div class="companion-card-cover"${coverSrc ? '' : ' data-fallback'}>${coverSrc ? `<img src="${escapeHtml(coverSrc)}" alt="" loading="lazy" decoding="async" draggable="false" />` : ''}</div>
  <button type="button" class="companion-card-profile" data-companion-profile="${escapeHtml(person.id)}" aria-label="Open ${escapeHtml(person.name)}'s profile">
    <span class="companion-avatar">${photoSrc ? `<img src="${escapeHtml(photoSrc)}" alt="" draggable="false" />` : `<span aria-hidden="true">${escapeHtml(initials(person.name))}</span>`}</span>
  </button>
  <div class="companion-card-body">
    <h2 class="companion-name">${escapeHtml(person.name)}</h2>
    ${band ? `<p class="companion-place">${PIN}<span>${escapeHtml(band)}</span></p>` : ''}
    <p class="companion-headline" data-work-for="${escapeHtml(person.id)}">${escapeHtml(headlineFor(person))}</p>
    ${chips ? `<ul class="companion-chips" aria-label="Interests">${chips}</ul>` : ''}
  </div>
  <p class="companion-event"${when ? ` title="${escapeHtml(when)}"` : ''}><span>Going to</span> ${escapeHtml(event.title || 'this event')}${when ? `<span class="sr-only">, ${escapeHtml(when)}</span>` : ''}</p>
  <p class="companion-hint" aria-hidden="true">Swipe right to connect · left to pass</p>
  <span class="companion-stamp companion-stamp-pass" aria-hidden="true">Pass</span>
  <span class="companion-stamp companion-stamp-like" aria-hidden="true">Connect</span>
</article>`;
};

// The "going together" moment. me / them: { name, src }.
export const matchMomentMarkup = ({ me = {}, them = {}, event = {} } = {}) => {
  const face = (p) => `<span class="companion-avatar companion-avatar-lg">${p.src ? `<img src="${escapeHtml(p.src)}" alt="" />` : `<span aria-hidden="true">${escapeHtml(initials(p.name))}</span>`}</span>`;
  const when = [shortEventDate(event.startsAt), event.venueName].filter(Boolean).join(' · ');
  return `<div class="companion-match-faces">${face(me)}<span class="companion-match-mark" aria-hidden="true">&amp;</span>${face(them)}</div>
  <p class="app-eyebrow">IT'S A MATCH · ${escapeHtml(String(event.title || '').toUpperCase())}</p>
  <h2 id="companion-match-title">Looks like you're going <em>together!</em></h2>
  <p class="companion-match-copy">You and ${escapeHtml(them.name || 'your companion')} both want to experience ${escapeHtml(event.title || 'this event')} together.</p>
  ${when ? `<p class="companion-match-when">${CAL}<span>${escapeHtml(when)}</span></p>` : ''}
  <div class="companion-match-actions"><button type="button" class="event-btn event-btn-ghost" data-match-later>Keep looking</button><button type="button" class="event-btn event-btn-primary" data-match-chat>Start conversation</button></div>`;
};

// The chat header line for a pair who met through an event: 'GOING TOGETHER · ACOUSTIC JAM SESSION · TUE 3 NOV'.
export const chatContextLine = (match) => (match
  ? ['GOING TOGETHER', String(match.eventTitle || '').toUpperCase(), shortEventDate(match.startsAt).toUpperCase()].filter(Boolean).join(' · ')
  : '');

export const normalizeCompanionMatch = (row = {}) => ({
  id: String(row.match_id || ''), eventId: String(row.event_id || ''), eventTitle: String(row.event_title || '').trim(),
  startsAt: row.starts_at || null, venueName: String(row.venue_name || '').trim(), otherId: String(row.other_id || ''),
  otherName: String(row.other_name || 'Member').trim(), otherPhotoUrl: row.other_photo_url || '', createdAt: row.created_at || null,
  seen: Boolean(row.seen),
});
