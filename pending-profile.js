// Pending onboarding for a signup that waits for email confirmation (UX_SPEC §A, D-035). Pure helpers, no storage.
// What is kept in the member's browser is minimised: interests as { id, points, mode } only (no labels), no sensitive
// interest at all (D-029; step 3 asks for them again after login), the KIND of area choice and never coordinates, and a
// savedAt timestamp so a stale pending profile is dropped after 7 days.
export const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const MODES = ['learn', 'play', 'teach', 'build'];

export const buildPendingOnboarding = (state, isSensitive, choice, now = Date.now()) => {
  const items = Array.isArray(state?.items) ? state.items : [];
  const kept = items.filter((item) => !isSensitive(item.id));
  return {
    interests: kept.map((item) => ({ id: item.id, points: item.points, mode: MODES.includes(item.mode) ? item.mode : 'play' })),
    privateOmitted: kept.length !== items.length,
    orbit: choice?.kind === 'city' && choice.placeId ? { kind: 'city', placeId: String(choice.placeId) } : { kind: 'geo' },
    savedAt: now,
  };
};

// Expired when older than 7 days, without a savedAt (an older build), or dated in the future beyond clock skew.
export const isPendingExpired = (pending, now = Date.now()) => {
  const savedAt = Number(pending?.savedAt);
  if (!pending || !Number.isFinite(savedAt)) return true;
  return savedAt > now + CLOCK_SKEW_MS || now - savedAt > PENDING_MAX_AGE_MS;
};

// The photo picked at signup is kept as a compressed data:image preview while the email is confirmed (no session can
// upload it yet). After login it is turned back into a File so it is uploaded to storage like any other photo: a
// data URL is never stored as the photo URL. Anything that is not a base64 image data URL gives null.
export const dataUrlToFile = (dataUrl, name = 'photo') => {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(typeof dataUrl === 'string' ? dataUrl : '');
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], String(name || 'photo'), { type: match[1].toLowerCase() });
  } catch {
    return null;
  }
};
