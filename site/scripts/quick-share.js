// Chat "+" quick-share (polish wave D4). Pure: no DOM, no Supabase, so the message shapes are unit-tested
// (tests/unit/quick-share.test.mjs).
//
// Resume: a brivia_messages row with message_type 'resume' and attachment_path exactly '<sender>/resume.pdf' (0012 §D
// constraint). It carries no URL: the recipient signs resumes/<sender>/resume.pdf for 60 s when they press Open, and
// Storage allows that only while the pair is matched and unblocked and such a message exists. They always get the
// sender's current file (one file per member, replaced in place).
// Area: plain text with the member's own place_label (my_onboarding_status), never coordinates or a cell id
// (docs/ORBIT_ENGINE.md §4.1, D-075).
import { RESUME_FILE_NAME, resumePath } from './resume-file.js';

export const AREA_PREFIX = 'My area: ';
export const CITY_WIDE = '(city-wide)';
export const AREA_SUFFIX = ' (about a 2 km area)';
export const RESUME_SHARE_BODY = 'Shared their resume';
export const NO_RESUME_HINT = 'Add a resume in your profile first.';
export const RESUME_GONE_COPY = 'This resume is no longer shared.';
export const RESUME_SHARE_NOTE = "They can open it from this chat while you're matched. They'll always see your latest resume.";
export const AREA_SHARE_NOTE = 'Only this place name is sent, never your exact location.';

// Anything shaped like a decimal coordinate (12.97, -33.865) is never sent, whatever the label says.
const COORDINATE_LIKE = /-?\d{1,3}\.\d{2,}/;

export const areaShareBody = (placeLabel) => {
  const label = String(placeLabel ?? '').trim();
  if (!label || COORDINATE_LIKE.test(label)) return '';
  return `${AREA_PREFIX}${label}${label.endsWith(CITY_WIDE) ? '' : AREA_SUFFIX}`;
};

// An area message read back for the place card: { place, scope } or null for any other text.
export const parseAreaBody = (body) => {
  const text = String(body ?? '');
  if (!text.startsWith(AREA_PREFIX)) return null;
  let place = text.slice(AREA_PREFIX.length).trim();
  let scope = '';
  if (place.endsWith(AREA_SUFFIX.trim())) { place = place.slice(0, -AREA_SUFFIX.trim().length).trim(); scope = 'About a 2 km area'; }
  else if (place.endsWith(CITY_WIDE)) { place = place.slice(0, -CITY_WIDE.length).trim(); scope = 'City-wide'; }
  if (!place || !scope || COORDINATE_LIKE.test(place)) return null;
  return { place, scope };
};

// D-230: where the area card opens: a Google Maps search for the place name, the same words already in the message.
// Never a coordinate (a label shaped like one gives no link).
export const areaMapUrl = (place) => {
  const name = String(place ?? '').trim();
  if (!name || COORDINATE_LIKE.test(name)) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
};

// D-231 (founder 2026-11-10: "add option of sending some random location as well"): any place the member chooses (a
// café, a restaurant, an address) by name, or a Google Maps link they paste. Plain text 'Place: <name or link>', so an
// older app still shows it readably. Never raw coordinates (type the name or paste a link instead); links only from
// Google Maps hosts, https only (the host is checked whole, so maps.app.goo.gl.evil.com is refused).
export const PLACE_PREFIX = 'Place: ';
const PLACE_MAX = 160;
const MAPS_HOST = /^(?:(?:www\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?|maps\.google\.[a-z]{2,3}(?:\.[a-z]{2})?|maps\.app\.goo\.gl|goo\.gl)$/i;
const mapsLink = (text) => {
  let url;
  try { url = new URL(text); } catch { return ''; }
  if (url.protocol !== 'https:' || !MAPS_HOST.test(url.hostname)) return '';
  if (/^(?:www\.)?google\./i.test(url.hostname) && !url.pathname.startsWith('/maps')) return '';
  if (url.hostname.toLowerCase() === 'goo.gl' && !url.pathname.startsWith('/maps')) return '';
  return url.href;
};
const cleanPlace = (input) => String(input ?? '').replace(/\s+/g, ' ').trim().slice(0, PLACE_MAX);
const looksLikeLink = (text) => /^[a-z][a-z0-9+.-]*:/i.test(text);
export const placeShareProblem = (input) => {
  const text = cleanPlace(input);
  if (!text) return 'Type a place name or paste a Google Maps link.';
  if (looksLikeLink(text)) return mapsLink(text) ? '' : 'Only Google Maps links can be shared here.';
  if (COORDINATE_LIKE.test(text)) return 'Type the place name, or paste a Google Maps link, instead of coordinates.';
  return '';
};
export const placeShareBody = (input) => {
  const text = cleanPlace(input);
  if (placeShareProblem(text)) return '';
  return `${PLACE_PREFIX}${looksLikeLink(text) ? mapsLink(text) : text}`;
};
// A place message read back for its card: { name, url, pinned } or null for any other text.
export const parsePlaceBody = (body) => {
  const text = String(body ?? '');
  if (!text.startsWith(PLACE_PREFIX)) return null;
  const rest = text.slice(PLACE_PREFIX.length).trim();
  if (!rest || placeShareProblem(rest)) return null;
  if (looksLikeLink(rest)) return { name: 'Pinned on Google Maps', url: mapsLink(rest), pinned: true };
  return { name: rest, url: areaMapUrl(rest), pinned: false };
};

// The attachment the composer sends for a resume share, and the columns it becomes (no attachment_url at all).
export const resumeShareAttachment = (senderId, size) => ({
  kind: 'resume',
  path: resumePath(senderId),
  name: RESUME_FILE_NAME,
  mime: 'application/pdf',
  size: Number(size) > 0 ? Number(size) : null,
});

export const resumeMessageFields = (attachment) => ({
  message_type: 'resume',
  attachment_path: attachment.path,
  attachment_name: attachment.name,
  attachment_mime: attachment.mime,
  attachment_size: attachment.size,
});
