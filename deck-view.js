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
  caught_up: { title: "You're caught up.", copy: "You've met your orbit for today. New people near you show up as they join. Try search to reach further.", action: 'Search members', kind: 'search' },
  no_members_yet: { title: 'Your area is just opening.', copy: 'Brivia Club is new around you. Invite a friend who shares your interests.', action: 'Invite a friend', kind: 'invite' },
  complete_profile: { title: 'Finish your orbit to see people near you.', copy: 'Add your area and place your 20 interest points so we can find your people.', action: 'Finish profile', kind: 'finish-profile' },
  error: { title: 'Your deck could not load.', copy: 'Check your connection and try again.', action: 'Try again', kind: 'retry' },
};
export const deckEmptyState = (cause) => ({ ...(EMPTY_STATES[cause] || EMPTY_STATES.caught_up) });
