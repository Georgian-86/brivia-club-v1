// Pure helpers for the city search (unit-tested; no DOM, no network).

// D-202: whether to look further than the directory: three or more letters typed and no result's name starts with them.
export const foldName = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const needsWiderSearch = (query, found = []) => {
  const typed = foldName(String(query || '').split(',')[0]);
  if (typed.length < 3 || /\d/.test(typed)) return false;
  return !found.some((p) => foldName(p.name).startsWith(typed));
};
