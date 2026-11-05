// Create Event (D-121, migration 0022). Pure helpers (no DOM, no Supabase) for event-create.js, unit-tested in
// tests/unit/event-form.test.mjs: the form's categories, an empty draft, a draft from a listed event (edit), the
// validation the server repeats (save_member_event), the request body, a preview event for the live card, and the
// mapping from a server error ('invalid <field>') back to the field.

import { EVENT_TIME_ZONE } from './events-view.js';

// The create form's fourteen categories, in two rows of seven (founder, 2026-11-02: "only two rows, every kind of
// category, otherwise Other so they choose themselves"). Keys match club_event_category_check in 0022.
export const EVENT_FORM_CATEGORIES = Object.freeze([
  { key: 'tech', label: 'Tech' },
  { key: 'startups', label: 'Startups' },
  { key: 'networking', label: 'Networking' },
  { key: 'music', label: 'Music' },
  { key: 'sports', label: 'Sports' },
  { key: 'games', label: 'Chess & Games' },
  { key: 'food', label: 'Food & Drinks' },
  { key: 'art', label: 'Art & Culture' },
  { key: 'wellness', label: 'Wellness' },
  { key: 'outdoors', label: 'Outdoors' },
  { key: 'education', label: 'Learning' },
  { key: 'workshops', label: 'Workshops' },
  { key: 'community', label: 'Community' },
  { key: 'other', label: 'Other' },
].map(Object.freeze));
export const CATEGORY_ROW = 7;
// "Other": the organiser's own category name (2 to 24 letters, digits, spaces and & ' / + -).
export const CUSTOM_CATEGORY = /^[\p{L}\p{N}][\p{L}\p{N} &'/+-]*$/u;
export const tidyCustomCategory = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const FORM_KEYS = new Set(EVENT_FORM_CATEGORIES.map((c) => c.key));

export const LIMITS = Object.freeze({
  title: 80, description: 2000, descriptionMin: 20, venueName: 120, venueAddress: 240, capacityMax: 5000, feeMax: 100000,
  gallery: 6, imageBytes: 25 * 1024 * 1024, brochureBytes: 5 * 1024 * 1024,
});
export const POSTER_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
// The photo pickers open the device's whole gallery (iPhones keep photos as HEIC). Every photo is re-encoded to a
// JPEG of at most 1280 px without its metadata (image-compress.js) before upload, so a large original is fine.
export const PHOTO_ACCEPT = 'image/*,.heic,.heif';
const PHOTO_EXTENSION = /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i;

// Map sites a venue link may point to (the same allow-list as club_event_map_url_check).
const MAP_URL = /^https:\/\/((www\.)?google\.[a-z.]{2,8}\/maps|maps\.google\.[a-z.]{2,8}\/|maps\.app\.goo\.gl\/|goo\.gl\/maps\/|maps\.apple\.com\/|(www\.)?openstreetmap\.org\/)/;
const UNSAFE = /["'<>\s\\]/;
export const isMapUrl = (value) => { const v = String(value || '').trim(); return v.length <= 300 && !UNSAFE.test(v) && MAP_URL.test(v); };
export const isContactEmail = (value) => /^[^@\s<>"']+@[^@\s<>"']+\.[^@\s<>"']+$/.test(String(value || '').trim()) && String(value).trim().length <= 254;
export const isContactPhone = (value) => /^\+?[0-9][0-9 ()-]{6,19}$/.test(String(value || '').trim());
export const isContactLink = (value) => { const v = String(value || '').trim(); return v.length <= 300 && /^https:\/\/[^\s"'<>\\]+$/.test(v); };

export const emptyDraft = () => ({
  id: null, status: 'new', title: '', category: '', customCategory: '', description: '', date: '', endDate: '', startTime: '', endTime: '',
  venueName: '', venueAddress: '', placeId: '', city: '', pin: null, mapUrl: '', capacity: '', paid: false, fee: '',
  contactEmail: '', contactPhone: '', contactLink: '', contactPublic: false, imageUrl: '', gallery: [],
  registeredCount: 0, brochureUrl: '', brochureName: '',
});

const istParts = (iso) => {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: EVENT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};

// A listed event (normalizeEvent) back into the form, for Edit.
export const draftFromEvent = (event) => {
  const start = istParts(event.startsAt);
  const end = istParts(event.endsAt);
  const contact = event.contact || {};
  return {
    ...emptyDraft(),
    id: event.id, status: event.status || 'draft', title: event.title || '', category: FORM_KEYS.has(event.category) ? event.category : '',
    customCategory: event.category === 'other' ? event.customCategory || '' : '',
    description: event.description || '', date: start?.date || '', startTime: start?.time || '', endTime: end?.time || '',
    endDate: end?.date || '',
    venueName: event.venueName || '', venueAddress: event.venueAddress || '', placeId: event.placeId || '', city: event.placeId ? event.venueArea || '' : '',
    mapUrl: event.mapUrl || '', capacity: event.capacity ? String(event.capacity) : '', paid: event.feeInr > 0, fee: event.feeInr > 0 ? String(event.feeInr) : '',
    contactEmail: contact.email || '', contactPhone: contact.phone || '', contactLink: contact.link || '', contactPublic: Boolean(contact.public),
    imageUrl: event.imageUrl || '', gallery: [...(event.gallery || [])], registeredCount: event.registeredCount || 0,
    brochureUrl: event.brochureUrl || '', brochureName: event.brochureUrl ? 'Event brochure.pdf' : '',
    originalStart: event.startsAt || null,
  };
};

// D-197: the longest an event may run, in days after its start date (the server checks the same).
export const MAX_EVENT_DAYS = 30;
// YYYY-MM-DD plus n days (calendar arithmetic in UTC, so no time zone shifts the date).
export const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Today in IST as YYYY-MM-DD (the date input's min).
export const todayIst = (now = new Date()) => istParts(now.toISOString()).date;

// The instant a date + HH:MM means in IST (India has no daylight saving: a fixed +05:30).
export const istInstant = (date, time) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return null;
  const d = new Date(`${date}T${time}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const wholeNumber = (value) => (/^\d+$/.test(String(value ?? '').trim()) ? Number(String(value).trim()) : NaN);

// { field: message } for every problem. A draft needs only a name; publishing needs every mandatory field.
// Field keys are the form's names (title, category, description, date, startTime, endTime, venueName, venueAddress,
// city, capacity, fee, mapUrl, contactEmail, contactPhone, contactLink, contactPublic).
export const validateEventDraft = (draft, { publish = false, now = new Date() } = {}) => {
  const errors = {};
  const title = String(draft.title || '').trim();
  if (!title) errors.title = 'Give your event a name.';
  else if (title.length > LIMITS.title) errors.title = `Keep the name under ${LIMITS.title} characters.`;
  const custom = tidyCustomCategory(draft.customCategory);
  if (draft.category === 'other' && custom && (custom.length < 2 || custom.length > 24 || !CUSTOM_CATEGORY.test(custom))) {
    errors.customCategory = 'Use 2 to 24 letters or numbers, like "Book club".';
  }
  const description = String(draft.description || '').trim();
  if (description.length > LIMITS.description) errors.description = `Keep it under ${LIMITS.description} characters.`;
  if (String(draft.venueName || '').trim().length > LIMITS.venueName) errors.venueName = `Keep it under ${LIMITS.venueName} characters.`;
  if (String(draft.venueAddress || '').trim().length > LIMITS.venueAddress) errors.venueAddress = `Keep it under ${LIMITS.venueAddress} characters.`;
  if (draft.mapUrl && !isMapUrl(draft.mapUrl)) errors.mapUrl = 'Paste a Google Maps, Apple Maps or OpenStreetMap link.';
  if (draft.contactEmail && !isContactEmail(draft.contactEmail)) errors.contactEmail = 'Check the email address.';
  if (draft.contactPhone && !isContactPhone(draft.contactPhone)) errors.contactPhone = 'Use digits, with the country code if you like.';
  if (draft.contactLink && !isContactLink(draft.contactLink)) errors.contactLink = 'Use a full https:// link.';
  if (String(draft.capacity ?? '').trim()) {
    const n = wholeNumber(draft.capacity);
    if (!Number.isInteger(n) || n < 1 || n > LIMITS.capacityMax) errors.capacity = `Between 1 and ${LIMITS.capacityMax.toLocaleString('en-IN')}.`;
    else if (draft.registeredCount && n < draft.registeredCount) errors.capacity = `${draft.registeredCount} people are already registered.`;
  }
  if (draft.paid) {
    const fee = wholeNumber(draft.fee);
    if (!String(draft.fee ?? '').trim()) { if (publish) errors.fee = 'Set the entry fee, or choose Free.'; }
    else if (!Number.isInteger(fee) || fee < 1 || fee > LIMITS.feeMax) errors.fee = `A whole amount from ₹1 to ₹${LIMITS.feeMax.toLocaleString('en-IN')}.`;
  }
  // D-197: an event can run over several days. The end date is optional (the start date when blank), on or after the
  // start date and at most MAX_EVENT_DAYS days after it; the end instant must come after the start instant.
  const endDate = draft.endDate || draft.date;
  if (draft.endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.endDate)) errors.endDate = 'Choose an end date.';
    else if (draft.date && draft.endDate < draft.date) errors.endDate = 'The end date cannot be before the start date.';
    else if (draft.date && draft.endDate > addDays(draft.date, MAX_EVENT_DAYS)) errors.endDate = `An event can run for at most ${MAX_EVENT_DAYS} days.`;
  }
  if (!errors.endDate && draft.date && draft.startTime && draft.endTime) {
    const s0 = istInstant(draft.date, draft.startTime);
    const e0 = istInstant(endDate, draft.endTime);
    if (s0 && e0 && e0 <= s0) errors.endTime = endDate === draft.date ? 'The end time must be after the start time.' : 'The event must end after it starts.';
  }
  if (!publish) return errors;

  if (!FORM_KEYS.has(draft.category)) errors.category = 'Choose a category.';
  else if (draft.category === 'other' && !custom) errors.customCategory = 'Name your category, like "Book club" or "Pottery".';
  if (!errors.description && description.length < LIMITS.descriptionMin) errors.description = 'Tell people a little more (at least 20 characters).';
  if (!draft.date) errors.date = 'Choose a date.';
  if (!draft.startTime) errors.startTime = 'Choose a start time.';
  if (!draft.endTime) errors.endTime = errors.endTime || 'Choose an end time.';
  const start = istInstant(draft.date, draft.startTime);
  // An already published event keeps its start (it may be under way); a new or draft one must start in the future.
  const keepsStart = draft.status === 'published' && draft.originalStart && start && start.getTime() === new Date(draft.originalStart).getTime();
  if (draft.date && !errors.date && draft.date < todayIst(now)) errors.date = 'Choose today or a later date.';
  else if (start && start <= now && !keepsStart && !errors.startTime) errors.startTime = 'Choose a time that has not passed.';
  if (!String(draft.venueName || '').trim()) errors.venueName = 'Name the venue.';
  if (!String(draft.venueAddress || '').trim()) errors.venueAddress = 'Add the address so people can find it.';
  if (!draft.placeId) errors.city = 'Choose the city from the list.';
  if (!String(draft.capacity ?? '').trim()) errors.capacity = 'How many people can come?';
  if (draft.contactPublic && !draft.contactEmail && !draft.contactPhone && !draft.contactLink) errors.contactPublic = 'Add a contact to show, or untick this.';
  return errors;
};

// The order fields appear in, for "focus the first error".
export const FIELD_ORDER = Object.freeze(['title', 'category', 'customCategory', 'description', 'date', 'startTime', 'endDate', 'endTime', 'venueName',
  'venueAddress', 'city', 'mapUrl', 'capacity', 'fee', 'contactEmail', 'contactPhone', 'contactLink', 'contactPublic', 'image']);
export const firstErrorField = (errors) => FIELD_ORDER.find((f) => errors[f]) || Object.keys(errors)[0] || null;

// The save_member_event body (p_fields). Empty strings stay empty: the server reads them as "not set".
export const toServerFields = (draft) => ({
  title: String(draft.title || '').trim(),
  category: draft.category || null,
  custom_category: draft.category === 'other' ? tidyCustomCategory(draft.customCategory) : '',
  description: String(draft.description || '').trim(),
  date: draft.date || '',
  start_time: draft.startTime || '',
  end_time: draft.endTime || '',
  end_date: draft.endDate || '',
  venue_name: String(draft.venueName || '').trim(),
  venue_address: String(draft.venueAddress || '').trim(),
  place_id: draft.placeId || '',
  ...(draft.pin && Number.isFinite(draft.pin.lat) && Number.isFinite(draft.pin.lng) ? { pin: { lat: draft.pin.lat, lng: draft.pin.lng } } : {}),
  map_url: String(draft.mapUrl || '').trim(),
  capacity: String(draft.capacity ?? '').trim(),
  fee_inr: draft.paid ? String(draft.fee ?? '').trim() : '0',
  contact_email: String(draft.contactEmail || '').trim(),
  contact_phone: String(draft.contactPhone || '').trim(),
  contact_link: String(draft.contactLink || '').trim(),
  contact_public: Boolean(draft.contactPublic),
  image_url: draft.imageUrl || '',
  gallery_urls: (draft.gallery || []).slice(0, LIMITS.gallery),
});

// save_member_event errors: 22023 'invalid <server field>' names the field; P0001 'event_limit' is the daily cap.
const SERVER_FIELD = Object.freeze({
  title: 'title', category: 'category', custom_category: 'customCategory', description: 'description', date: 'date', start_time: 'startTime', end_time: 'endTime', end_date: 'endDate',
  venue_name: 'venueName', venue_address: 'venueAddress', place_id: 'city', pin: 'city', map_url: 'mapUrl', capacity: 'capacity',
  fee_inr: 'fee', contact_email: 'contactEmail', contact_phone: 'contactPhone', contact_link: 'contactLink',
  contact_public: 'contactPublic', image_url: 'image', gallery_urls: 'image',
});
export const serverErrorField = (error) => {
  const m = /invalid ([a-z_]+)/.exec(String(error?.message || ''));
  return m ? SERVER_FIELD[m[1]] || null : null;
};
export const serverErrorMessage = (error) => {
  const message = String(error?.message || '');
  if (/event_limit/.test(message)) return 'You have created 10 events today. Try again tomorrow.';
  if (/invalid publish/.test(message)) return 'A published event cannot go back to a draft.';
  if (/invalid event/.test(message)) return 'This event can no longer be edited.';
  if (/invalid fee_inr/.test(message) && error?.code === '22023') return 'The fee is locked once people have registered.';
  if (/not your event|42501/.test(`${message} ${error?.code || ''}`)) return 'Only the organiser can change this event.';
  return '';
};

// A poster or gallery photo from the device: any photo format the browser can read, up to 25 MB. '' or the problem.
export const imageFileProblem = (file) => {
  if (!file) return 'Choose an image.';
  const type = String(file.type || '').toLowerCase();
  const photo = (type.startsWith('image/') && type !== 'image/svg+xml') || (!type && PHOTO_EXTENSION.test(String(file.name || '')));
  if (!photo) return 'Choose a photo (JPG, PNG, WebP or HEIC).';
  if (file.size > LIMITS.imageBytes) return 'Keep photos under 25 MB.';
  return '';
};

// The brochure (D-125, 0025): one PDF, at most 5 MB. '' or the problem.
export const BROCHURE_ACCEPT = 'application/pdf,.pdf';
export const brochureFileProblem = (file) => {
  if (!file) return 'Choose a PDF.';
  const type = String(file.type || '').toLowerCase();
  const pdf = type === 'application/pdf' || ((!type || type === 'application/octet-stream') && /\.pdf$/i.test(String(file.name || '')));
  if (!pdf) return 'The brochure must be a PDF.';
  if (file.size > LIMITS.brochureBytes) return 'Keep the brochure under 5 MB.';
  if (!file.size) return 'This PDF is empty.';
  return '';
};
// A short, safe display name for the chosen PDF ('brochure.pdf' without one).
export const brochureDisplayName = (file) => {
  const name = String(file?.name || '').replace(/[\u0000-\u001f<>"'`\\/]/g, '').trim();
  return (name || 'brochure.pdf').slice(-60);
};

// The poster area (D-125): the member picks which part of the poster the card shows. The card and drawer crop to
// 3:2, so the chosen area is a 3:2 window. State: zoom (1 = the whole short side fits) and the window's centre in
// image fractions (cx, cy). Answers the clamped centre, the display scale and the source rectangle in image pixels.
export const COVER_ASPECT = 3 / 2;
export const COVER_ZOOM = Object.freeze({ min: 1, max: 4 });
export const coverCrop = ({ natW, natH, frameW, frameH, zoom = 1, cx = 0.5, cy = 0.5 }) => {
  const z = Math.min(COVER_ZOOM.max, Math.max(COVER_ZOOM.min, Number(zoom) || 1));
  const scale = Math.max(frameW / natW, frameH / natH) * z;
  const sw = Math.min(natW, frameW / scale);
  const sh = Math.min(natH, frameH / scale);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const centreX = clamp((Number.isFinite(cx) ? cx : 0.5) * natW, sw / 2, natW - sw / 2);
  const centreY = clamp((Number.isFinite(cy) ? cy : 0.5) * natH, sh / 2, natH - sh / 2);
  return { zoom: z, scale, cx: centreX / natW, cy: centreY / natH, sx: centreX - sw / 2, sy: centreY - sh / 2, sw, sh };
};
// The output size for the chosen area: at most 1600 px wide, 3:2, never upscaled past the source.
export const coverOutputSize = (sw) => { const w = Math.max(1, Math.round(Math.min(1600, sw))); return { w, h: Math.max(1, Math.round(w / COVER_ASPECT)) }; };

// The live preview: the draft as a listed event (normalizeEvent's shape), so the real card renders it.
export const previewEvent = (draft, { organizer = null, imageSrc = '' } = {}) => {
  const start = istInstant(draft.date, draft.startTime || '00:00');
  const end = draft.endTime ? istInstant(draft.endDate || draft.date, draft.endTime) : null;
  const capacity = wholeNumber(draft.capacity);
  const fee = draft.paid ? wholeNumber(draft.fee) : 0;
  return {
    id: 'preview', title: String(draft.title || '').trim() || 'Your event name', description: String(draft.description || '').trim(),
    category: FORM_KEYS.has(draft.category) ? draft.category : 'other', customCategory: draft.category === 'other' ? tidyCustomCategory(draft.customCategory) : '', tags: [], venueName: String(draft.venueName || '').trim() || 'Venue',
    venueArea: draft.city || '', venueAddress: String(draft.venueAddress || '').trim(), startsAt: draft.date && start ? start.toISOString() : null,
    endsAt: end && draft.startTime ? end.toISOString() : null, imageKey: '', imageUrl: imageSrc, gallery: [], distanceKm: null,
    goingCount: draft.registeredCount || 0, companionCount: 0, going: false, wantsCompanion: false, friends: [],
    status: 'published', isMine: false, organizer, capacity: Number.isInteger(capacity) && capacity > 0 ? capacity : null,
    registeredCount: draft.registeredCount || 0, feeInr: Number.isInteger(fee) && fee > 0 ? fee : 0, myStatus: null,
    contact: null, mapUrl: '', placeId: draft.placeId || '', preview: true,
  };
};
