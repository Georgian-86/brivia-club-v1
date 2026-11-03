// Nearby (D-131, migration 0029): pure helpers and markup for nearby-page.js, unit-tested in tests/unit/nearby-view.test.mjs.
// Rows come from nearby_discover. Location is a band only: '1' (under 1 km), '3' (1-3 km), '5' (3-5 km), never metres,
// a cell or a coordinate. The card reuses the companion card's look (companions.css) with Nearby's own lines.

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const initials = (name) => String(name || 'M').trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase() || 'M';
const list = (value, max) => (Array.isArray(value) ? value : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, max);

export const RADII = Object.freeze([1, 3, 5, 10]);
export const DEFAULT_RADIUS = 1;
export const normalizeRadius = (value) => (RADII.includes(Number(value)) ? Number(value) : DEFAULT_RADIUS);

// The default opener (founder's copy); the member can edit it or pick another before sending.
export const NEARBY_OPENER = "Hi! Saw you're nearby. Let's connect and share our interests.";

export const COPY = Object.freeze({
  heading: 'People around you.',
  sub: 'Discover interesting people crossing paths with you.',
  lead: 'Good people might be closer than you think.',
  quietTitle: "It's a little quiet around here.",
  quietCopy: 'Check back as more people cross paths.',
  offTitle: 'Turn on Crossing Paths to discover people around you.',
  offCopy: 'See who is around and make the first move.',
  matchTitle: 'Well, look who crossed paths!',
  connect: 'Make the first move.',
  incoming: 'Someone nearby wants to connect with you.',
});

// 'People within 1 km of you'
export const radiusLine = (km) => `People within ${normalizeRadius(km)} km of you`;
// The card's distance: a band, never a number of metres.
export const bandLabel = (band) => ({ 1: 'Under 1 km away', 3: '1–3 km away', 5: '3–5 km away', 10: '5–10 km away' }[String(band || '')] || 'Nearby');

// Why the deck is empty or blocked, from the location loop status and the last discover error.
// status: crossing-paths.js status ('on', 'off', 'paused-denied', 'paused-prompt', 'paused-unavailable',
// 'unavailable-server'); error: the nearby_discover error message, if any.
export const nearbyState = ({ enabled, status = 'off', error = null, count = 0, loading = false } = {}) => {
  const message = String(error?.message || '').trim().toLowerCase();
  if (enabled === null || loading) return 'loading';
  if (status === 'unavailable-server' || error?.missing) return 'unavailable';
  if (!enabled) return 'off';
  // On from before Nearby existed (alerts between connections only): discovery needs its own yes (0029).
  if (message === 'nearby off') return 'consent';
  if (status.startsWith('paused-')) return status;
  if (message === 'location needed') return 'locating';
  if (message === 'complete your profile') return 'incomplete';
  if (error) return 'error';
  return count ? 'cards' : 'quiet';
};

export const normalizeNearby = (row = {}) => ({
  id: String(row.member_id || ''),
  name: String(row.name || 'Member').trim() || 'Member',
  photoUrl: row.photo_url || '',
  coverUrl: row.cover_url || '',
  headline: String(row.headline || '').trim(),
  bio: String(row.bio || '').trim(),
  lookingFor: list(row.looking_for, 3),
  skills: list(row.skills, 5),
  interests: list(row.interests, 6),
  shared: list(row.shared_interests, 4),
  sharedCount: Math.max(0, Number(row.shared_count) || 0),
  band: String(row.distance_band || ''),
  place: String(row.place_name || '').trim(),
  hereNow: row.here_now === true,
  askedMe: row.asked_me === true,
});

// The bar: 'LOOKING FOR · CO-FOUNDER, MENTOR', as on the Connect card (D-113), or the plain club line.
export const barLabel = (person) => (person.lookingFor.length ? `Looking for · ${person.lookingFor.slice(0, 2).join(', ')}` : 'Brivia member');

const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/></svg>';

// One card. opts: coverSrc / photoSrc (already checked), current (the one the buttons act on), index.
export const nearbyCardMarkup = (person, { coverSrc = '', photoSrc = '', current = false, index = 0 } = {}) => {
  const shared = new Set(person.shared.map((s) => s.toLowerCase()));
  const sharedChips = person.shared.map((label) => `<li class="is-shared">You both: ${escapeHtml(label)}</li>`).join('');
  const otherChips = person.interests.filter((label) => !shared.has(label.toLowerCase())).slice(0, 4)
    .map((label) => `<li>${escapeHtml(label)}</li>`).join('');
  const place = [person.place, bandLabel(person.band)].filter(Boolean).join(' · ');
  const label = `${person.name}, ${bandLabel(person.band).toLowerCase()}${person.hereNow ? ', here now' : ''}`;
  return `<article class="companion-card nearby-card${current ? ' is-current' : ''}" data-nearby-id="${escapeHtml(person.id)}" data-index="${index}" aria-label="${escapeHtml(label)}">
  <div class="companion-card-bar"><span>${escapeHtml(barLabel(person))}</span><button type="button" class="companion-card-more" data-nearby-profile="${escapeHtml(person.id)}" aria-label="More about ${escapeHtml(person.name)}"><span aria-hidden="true">•••</span></button></div>
  <div class="companion-card-cover"${coverSrc ? '' : ' data-fallback'}>${coverSrc ? `<img src="${escapeHtml(coverSrc)}" alt="" loading="lazy" decoding="async" draggable="false" />` : ''}${person.askedMe ? '<span class="nearby-asked">Wants to connect with you</span>' : ''}</div>
  <button type="button" class="companion-card-profile" data-nearby-profile="${escapeHtml(person.id)}" aria-label="Open ${escapeHtml(person.name)}'s profile">
    <span class="companion-avatar">${photoSrc ? `<img src="${escapeHtml(photoSrc)}" alt="" draggable="false" />` : `<span aria-hidden="true">${escapeHtml(initials(person.name))}</span>`}</span>
    ${person.hereNow ? '<span class="nearby-here" aria-hidden="true"></span>' : ''}
  </button>
  <div class="companion-card-body">
    <h2 class="companion-name">${escapeHtml(person.name)}</h2>
    ${person.headline ? `<p class="nearby-headline">${escapeHtml(person.headline)}</p>` : ''}
    <p class="companion-place">${PIN}<span>${escapeHtml(place)}</span>${person.hereNow ? '<span class="nearby-now">Here now</span>' : ''}</p>
    ${person.bio ? `<p class="nearby-bio">${escapeHtml(person.bio)}</p>` : ''}
    ${sharedChips || otherChips ? `<ul class="companion-chips nearby-chips" aria-label="Interests">${sharedChips}${otherChips}</ul>` : ''}
    ${person.skills.length ? `<p class="nearby-skills"><span>Skills</span> ${escapeHtml(person.skills.join(' · '))}</p>` : ''}
  </div>
  <button type="button" class="companion-event nearby-view-profile" data-nearby-profile="${escapeHtml(person.id)}">View profile</button>
  <span class="companion-stamp companion-stamp-pass" aria-hidden="true">Pass</span>
  <span class="companion-stamp companion-stamp-like" aria-hidden="true">Connect</span>
</article>`;
};

// The crossing-paths moment. me / them: { name, src }.
export const nearbyMatchMarkup = ({ me = {}, them = {} } = {}) => {
  const face = (p) => `<span class="companion-avatar companion-avatar-lg">${p.src ? `<img src="${escapeHtml(p.src)}" alt="" />` : `<span aria-hidden="true">${escapeHtml(initials(p.name))}</span>`}</span>`;
  return `<div class="companion-match-faces nearby-match-faces">${face(me)}<span class="companion-match-mark" aria-hidden="true">&amp;</span>${face(them)}</div>
  <p class="app-eyebrow">IT'S MUTUAL · NEARBY</p>
  <h2 id="companion-match-title">Well, look who <em>crossed paths!</em></h2>
  <p class="companion-match-copy">You and ${escapeHtml(them.name || 'your new connection')} both want to connect. Your messages are waiting in your chat.</p>
  <div class="companion-match-actions"><button type="button" class="event-btn event-btn-ghost" data-match-later>Keep exploring</button><button type="button" class="event-btn event-btn-primary" data-match-chat>Start conversation</button></div>`;
};

// The opener choices: the founder's default first, then the shared-interest and general ones.
export const nearbyOpeners = ({ name, shared = [] } = {}) => {
  const who = String(name || '').trim().split(/\s+/)[0] || 'there';
  const interest = String(shared[0] || '').trim().toLowerCase();
  return [NEARBY_OPENER,
    interest ? `Hi ${who}! Looks like we're both nearby and both love ${interest}. Coffee sometime?` : `Hi ${who}! We're close by. Would love to hear what you're working on.`,
  ];
};

// D-138: the crossing, in words. Distance is a band (never metres: 0029 keeps a ~1 km grid, and a closer figure would
// say more than the members agreed to share); "where" is the town or city the member was in (0034); "when" is relative.
const APART = Object.freeze({ '1': 'within 1 km of each other', '3': 'about 1–3 km apart', '5': 'about 3–5 km apart', '10': 'about 5–10 km apart' });
export const crossedAgo = (iso, now = Date.now()) => {
  const t = new Date(iso || '').getTime();
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 2) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
};
export const CROSSING_TITLE = 'Someone interesting crossed your path.';
export const CROSSING_CTA = 'Discover who you crossed paths with.';
export const crossingCopy = (n = {}, now = Date.now()) => {
  const first = String(n.name || '').trim().split(/\s+/)[0] || 'a Brivia member';
  const apart = APART[n.band] || 'close by';
  const place = String(n.place || '').trim();
  return {
    title: CROSSING_TITLE,
    line: `You and ${first} were ${apart}${place ? `, near ${place}` : ''}.`,
    when: crossedAgo(n.createdAt, now),
    cta: CROSSING_CTA,
  };
};

// D-134: the in-section notice when someone comes within your radius. n: member-notifications.js shape.
export const nearbyNoticeMarkup = (n, { photoSrc = '' } = {}) => {
  const copy = crossingCopy(n);
  return `<div class="nearby-notice" role="status" data-notice-id="${escapeHtml(n.id)}">
  <span class="nearby-notice-face">${photoSrc ? `<img src="${escapeHtml(photoSrc)}" alt="" />` : `<span aria-hidden="true">${escapeHtml(initials(n.name))}</span>`}</span>
  <span class="nearby-notice-copy"><strong>${escapeHtml(copy.title)}</strong><span>${escapeHtml(copy.line)}</span><em>${escapeHtml([copy.when, copy.cta].filter(Boolean).join(' · '))}</em></span>
  <span class="nearby-notice-actions"><button type="button" class="nearby-notice-view" data-notice-view="${escapeHtml(n.sourceId)}">Discover</button><button type="button" class="nearby-notice-close" data-notice-dismiss="${escapeHtml(n.id)}" aria-label="Dismiss"><span aria-hidden="true">×</span></button></span>
</div>`;
};
