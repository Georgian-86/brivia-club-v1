// "Pick my city": what a typed city means when the member presses Next or Enter without clicking a suggestion.
// Pure, no DOM. Chosen only when it is unambiguous: the one listed option whose name (or "name, region") starts with
// the typed text, or the one whose name (or "name, region") equals it, ignoring case and surrounding spaces.
// Otherwise null: the member picks from the list (a fuzzy or region-only hit is never committed silently).
const norm = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

export const matchTypedCity = (typed, options) => {
  const text = norm(typed);
  const list = Array.isArray(options) ? options : [];
  if (!text || !list.length) return null;
  if (list.length === 1) return norm(list[0]?.name).startsWith(text) || norm(`${list[0]?.name}, ${list[0]?.region}`).startsWith(text) ? list[0] : null;
  const exact = list.filter((place) => norm(place?.name) === text || norm(`${place?.name}, ${place?.region}`) === text);
  return exact.length === 1 ? exact[0] : null;
};
