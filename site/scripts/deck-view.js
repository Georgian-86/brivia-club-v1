// The interim deck's card copy (UX_SPEC §B, Iteration 3 Task 10). Pure helpers, no DOM, no storage.
//
// A deck row (deck_candidates, migration 0004) carries a server-made distance_band ("~3 km", "~10 km", a place, a
// region, a country or "Abroad") and 0-2 shared_interests labels. Cards show only those: never another member's city,
// state, cell id, km or a match %. Every label is rendered as text by the caller (textContent), never as HTML.

const MAX_SHARED_CHIPS = 2;
const MAX_TAG_CHIPS = 3;
const cleanLabels = (values) => (Array.isArray(values) ? values : [])
  .filter((value) => typeof value === 'string')
  .map((value) => value.trim())
  .filter(Boolean);

// The only location and interest fields a deck card keeps from a row.
export const deckFields = (row) => ({
  distanceBand: typeof row?.distance_band === 'string' ? row.distance_band.trim() : '',
  shared: cleanLabels(row?.shared_interests).slice(0, MAX_SHARED_CHIPS),
});

// Up to 2 "You both: X" chips, then up to 3 profile tags that do not repeat a shared label.
export const deckChips = (person) => {
  const shared = cleanLabels(person?.shared).slice(0, MAX_SHARED_CHIPS);
  const sharedKeys = new Set(shared.map((label) => label.toLowerCase()));
  const tags = cleanLabels(person?.tags).filter((tag) => !sharedKeys.has(tag.toLowerCase())).slice(0, MAX_TAG_CHIPS);
  return [
    ...shared.map((label) => ({ kind: 'shared', label: `You both: ${label}` })),
    ...tags.map((label) => ({ kind: 'tag', label })),
  ];
};

// D-267: the "Distances appear as your area fills up." note under a place band is gone; the member's bio takes its
// place on the card (app.js renderCardBio).

// The pitch sheet's starting note (A5: never throws for a missing name, tags or shared list).
export const pitchLine = (person) => {
  const name = typeof person?.name === 'string' && person.name.trim() ? person.name.trim() : 'there';
  const shared = cleanLabels(person?.shared)[0];
  return shared
    ? `Hey ${name}, I noticed we both care about ${shared.toLowerCase()}. Would love to connect and exchange ideas.`
    : `Hey ${name}, I'd love to connect and exchange ideas.`;
};

// Why the deck is empty, and the one next action. cause: 'filters', a deck_status() value ('caught_up',
// 'no_members_yet', 'complete_profile') or 'error'. 'caught_up' also covers "members exist, but only far away".
const EMPTY_STATES = {
  filters: { title: 'No one in this deck matches these filters.', copy: 'Clear them to see everyone in your deck again.', action: 'Clear filters', kind: 'clear-filters' },
  // D-169: only the Hiring switch is on and no one shown is hiring.
  hiring: { title: 'No one is hiring yet.', copy: "When members anywhere open a role or say they're open to one, they show up here. Turn Hiring off to see everyone in your deck again.", action: 'Show everyone', kind: 'clear-filters' },
  caught_up: { title: "You're caught up.", copy: "You've seen everyone we can show you for now. New people near you show up as they join. Search can reach anyone, anywhere.", action: 'Search members', kind: 'search' },
  no_members_yet: { title: 'Your area is just opening.', copy: 'Brivia Club is new around you. Invite a friend who shares your interests.', action: 'Invite a friend', kind: 'invite' },
  complete_profile: { title: 'Finish your orbit to see people near you.', copy: 'Add your area and place your 20 interest points so we can find your people.', action: 'Finish profile', kind: 'finish-profile' },
  error: { title: 'Your deck could not load.', copy: 'Check your connection and try again.', action: 'Try again', kind: 'retry' },
};
export const deckEmptyState = (cause) => ({ ...(EMPTY_STATES[cause] || EMPTY_STATES.caught_up) });

// The card's image: the member's chosen preset cover, else the default preset cover, else '' and the card shows its
// branded placeholder (never the img alt text). Covers come only from the Brivia set (D-080), so the member's own photo
// is never used as the cover (founder, 2026-11-01, D-120: a member with no cover showed their photo there, which read as
// an uploaded cover). A preset path still in its stored form (/Images/Cover%20images/<name>) means normalizeCoverUrl
// found no shipped asset for it (for example a retired cover), and the build serves no /Images folder, so it would not
// load. `safe` is app.js safeImageUrl (allowed origins only); `fallback` is cover-assets.js defaultCoverUrl.
const UNSHIPPED_PRESET = /^\/Images\/Cover(%20| )images\//;
export const deckCoverSrc = (person, safe, fallback = '') => {
  for (const value of [person?.coverUrl, fallback]) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw || UNSHIPPED_PRESET.test(raw)) continue;
    const src = safe(raw);
    if (src) return src;
  }
  return '';
};

// D-241: newcomer cards (members who started but have not finished setup) go in among the deck's own cards: one after
// every `every - 1` regular cards, the rest at the end, so the location-first deck still leads. Ids only, order kept.
export const interleaveNewcomers = (queue = [], newcomers = [], every = 5) => {
  const add = [...new Set(newcomers.map(String))].filter((id) => !queue.map(String).includes(id));
  const out = [];
  let n = 0;
  queue.map(String).forEach((id, i) => {
    out.push(id);
    if ((i + 1) % (every - 1) === 0 && n < add.length) out.push(add[n++]);
  });
  return [...out, ...add.slice(n)];
};
