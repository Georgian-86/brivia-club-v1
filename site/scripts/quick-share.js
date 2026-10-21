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
