// The filter drawer's Location settings (D-239): pure helpers, no DOM, no storage.
// { anywhere, mode: 'near' | 'custom', place: { id, name } | null, radiusKm }. The default (near me, 50 km, not
// anywhere) leaves the location-first deck as it is; anything else switches Connect to the discover_people search
// lane (migration 0072), which measures city to city and never sees a member's position.
export const RADIUS = { min: 25, max: 500, step: 25, fallback: 50 };
export const DEFAULT_LOCATION = Object.freeze({ anywhere: false, mode: 'near', place: null, radiusKm: RADIUS.fallback });

const snap = (km) => {
  const n = Number(km);
  if (!Number.isFinite(n)) return RADIUS.fallback;
  const stepped = Math.round(n / RADIUS.step) * RADIUS.step;
  return Math.min(RADIUS.max, Math.max(RADIUS.min, stepped));
};
const cleanPlace = (place) => {
  const id = typeof place?.id === 'string' ? place.id.trim().slice(0, 120) : '';
  const name = typeof place?.name === 'string' ? place.name.trim().slice(0, 80) : '';
  return id && name ? { id, name } : null;
};

// Anything (stored JSON, null) -> a clean settings object. "Custom" without a city falls back to "near".
export const normalizeLocation = (raw) => {
  const place = cleanPlace(raw?.place);
  const mode = raw?.mode === 'custom' && place ? 'custom' : 'near';
  return { anywhere: raw?.anywhere === true, mode, place: mode === 'custom' ? place : null, radiusKm: snap(raw?.radiusKm ?? RADIUS.fallback) };
};

export const isDefaultLocation = (prefs) => {
  const p = normalizeLocation(prefs);
  return !p.anywhere && p.mode === 'near' && p.radiusKm === RADIUS.fallback;
};

// The discover_people arguments for these settings.
export const locationParams = (prefs) => {
  const p = normalizeLocation(prefs);
  return { p_radius_km: p.anywhere ? null : p.radiusKm, p_place_id: p.mode === 'custom' ? p.place.id : null };
};

export const radiusLabel = (km) => `${snap(km)} km`;

// The line Connect shows while the settings are on: "Anywhere", "Within 200 km of Delhi", "Within 50 km of you".
export const locationSummary = (prefs, homeName = '') => {
  const p = normalizeLocation(prefs);
  if (p.anywhere) return 'Showing people from anywhere';
  const centre = p.mode === 'custom' ? p.place.name : (String(homeName || '').trim() || 'you');
  return `Within ${radiusLabel(p.radiusKm)} of ${centre}`;
};

// "No one nearby with Chess yet." for the interest fallback (labels as the member picked them, at most three named).
export const fallbackSummary = (labels = []) => {
  const list = [...new Set(labels.map((l) => String(l || '').trim()).filter(Boolean))];
  const named = list.slice(0, 3).join(', ') + (list.length > 3 ? ` and ${list.length - 3} more` : '');
  return `${named ? `No one nearby with ${named}.` : 'No one nearby matches.'} Showing people from everywhere, nearest first.`;
};
