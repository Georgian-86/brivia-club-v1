// Edit profile helpers (founder, 2026-10-28, D-104). Pure: no DOM, no Supabase.
import { evenSplit, MAX_INTERESTS } from './passion-budget.js';

// The signup form's experience choices (auth.html), so Edit profile offers the same dropdown. A value saved before
// (free text from an older build) stays selectable as it is.
export const EXPERIENCE_OPTIONS = Object.freeze(['Student / just starting', '1–3 years', '3–7 years', '7–12 years', '12+ years']);
export const experienceChoices = (current) => {
  const value = String(current || '').trim();
  return value && !EXPERIENCE_OPTIONS.includes(value) ? [...EXPERIENCE_OPTIONS, value] : [...EXPERIENCE_OPTIONS];
};

export const BIO_MAX = 300;
// One paragraph block: line breaks kept (at most two in a row), spaces trimmed, capped.
export const cleanBio = (value) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, BIO_MAX);

// The search box shows the saved city: "Ludhiana (city-wide)" -> "Ludhiana".
export const areaInputValue = (label) => String(label || '').replace(/\s*\(city-wide\)\s*$/i, '').trim();

// saved: my_interests rows ({ interest_id, points, mode }); picks: interest ids in order. The same set as saved is
// unchanged (no call: the member's own points stay, and no daily rewrite is spent). Otherwise the picks share the 20
// points evenly, each keeping its saved mode (new picks 'play').
export const planInterestSave = (saved, picks) => {
  const ids = [...new Set((picks || []).map(String))];
  if (ids.length < 1 || ids.length > MAX_INTERESTS) return { error: ids.length ? 'too_many' : 'none' };
  const before = new Map((saved || []).map((row) => [String(row.interest_id), row]));
  if (ids.length === before.size && ids.every((id) => before.has(id))) return { unchanged: true };
  return { unchanged: false, payload: evenSplit(ids.map((id) => ({ id, mode: before.get(id)?.mode || 'play' }))) };
};
