// "Why this person?" (Phase D, Task 3): the tester-only panel on a deck card. Pure helpers, no DOM, no storage.
//
// One rpc/deck_why row (migration 0008 section 5) explains why the interim deck shows a member: the card's own
// shared_interests and distance_band, and the deck's order keys (docs/ORBIT_ENGINE.md §7, "Order"). The server returns
// a row only to a caller in the test world. Distance is the band label only: a ring is shown as a tier name, never as
// a km figure. Every value is escaped.

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

const RING_LABELS = ['Closest', 'Near', 'Same area'];
const OVERLAP_LABELS = ['None', 'Low', 'Medium', 'High'];
const NOT_KNOWN = 'Not known';
const pick = (labels, value) => (Number.isInteger(value) && labels[value]) || NOT_KNOWN;

// The first row of an rpc answer (an array, or a single object), or null when there is none.
export const whyRow = (data) => {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' && ('rank_keys' in row || 'distance_band' in row || 'shared_interests' in row) ? row : null;
};

export const whyPanelMarkup = (row) => {
  const shared = (Array.isArray(row?.shared_interests) ? row.shared_interests : [])
    .filter((label) => typeof label === 'string' && label.trim())
    .map((label) => label.trim());
  const band = typeof row?.distance_band === 'string' ? row.distance_band.trim() : '';
  const keys = row?.rank_keys && typeof row.rank_keys === 'object' ? row.rank_keys : {};
  const count = Number.isInteger(keys.shared_count) && keys.shared_count > 0 ? keys.shared_count : 0;
  const sharesText = keys.has_shared === true ? (count ? `Yes, ${count} in common` : 'Yes') : keys.has_shared === false ? 'No' : NOT_KNOWN;
  const tieText = keys.tie_break === 'daily' ? 'Daily rotation' : NOT_KNOWN;
  const pairs = [
    ['Shares an interest', sharesText],
    ['Distance tier', pick(RING_LABELS, keys.ring)],
    ['Interest overlap', pick(OVERLAP_LABELS, keys.overlap_level)],
    ['Tie-break', tieText],
  ];
  return [
    shared.length ? `<p class="why-shared">You both: ${escapeHtml(shared.join(', '))}</p>` : '<p class="why-shared">No shared interests yet.</p>',
    band ? `<p class="why-band">Distance: ${escapeHtml(band)}</p>` : '',
    '<p class="why-keys-title">The deck orders people by these, in this order:</p>',
    `<dl class="why-keys">${pairs.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`,
  ].join('');
};
