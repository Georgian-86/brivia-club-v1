import { createClient } from '@supabase/supabase-js';
import { NOTICE_VERSION } from './notice-version.js';
import { compressImageOnly, compressAttachmentFiles, attachmentKind, replacedObjectPath, ImageProcessingError } from './image-compress.js';

export { ImageProcessingError, PHOTO_ERROR_MESSAGE, compressImageOnly, compressAttachmentFiles, attachmentKind } from './image-compress.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim();

export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
export const supabaseReady = Boolean(supabase);

// Member images (avatars, covers, post images) auto-load in every viewer's browser, so they are rendered only
// from this project's Storage origin (never an arbitrary host: no tracking pixels). 0003 enforces the same
// path shape in the database: /storage/v1/object/public/<bucket>/<owner uid>/<file>.
export const supabaseOrigin = (() => { try { return supabaseUrl ? new URL(supabaseUrl).origin : ''; } catch { return ''; } })();
const STORAGE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const isStorageImageUrl = (value, bucket = '', ownerId = '') => {
  const raw = String(value || '').trim();
  if (!raw || !supabaseOrigin || /["'<>`\\\s]/.test(raw) || raw.includes('..')) return false;
  try {
    const url = new URL(raw);
    if (url.origin !== supabaseOrigin || url.username || url.password || url.search || url.hash) return false;
    const parts = url.pathname.split('/');
    // ['', 'storage', 'v1', 'object', 'public', bucket, owner, file]
    if (parts.length !== 8 || parts.slice(0, 5).join('/') !== '/storage/v1/object/public') return false;
    if (bucket && parts[5] !== bucket) return false;
    if (ownerId && parts[6] !== String(ownerId)) return false;
    return Boolean(parts[5] && parts[6]) && STORAGE_FILE.test(parts[7]);
  } catch { return false; }
};
// Bundled preset covers (cover-assets.js): same-site paths, never a third-party host.
export const isPresetCoverUrl = (value) => {
  const raw = String(value || '').trim();
  return !raw.includes('..') && /^\/(assets\/|Images\/Cover(%20| )images\/)[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(raw);
};

// Passwords are never kept client-side (Ruling I11). Older builds cached the signup password in the stored
// profile ("loginPassword"); strip any such field from every cached profile on load.
const CREDENTIAL_KEYS = ['loginPassword', 'password', 'passwordConfirm'];
export const withoutCredentials = (profile) => {
  if (!profile || typeof profile !== 'object') return profile;
  const clean = { ...profile };
  CREDENTIAL_KEYS.forEach((key) => { delete clean[key]; });
  return clean;
};
export const scrubStoredCredentials = () => {
  [globalThis.localStorage, globalThis.sessionStorage].forEach((store) => {
    try {
      if (!store) return;
      ['loginPassword', 'brivia-login-password', 'brivia-password'].forEach((key) => store.removeItem(key));
      ['brivia-member-profile', 'brivia-pending-profile'].forEach((key) => {
        const raw = store.getItem(key);
        if (!raw) return;
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return; }
        if (parsed && typeof parsed === 'object' && CREDENTIAL_KEYS.some((field) => field in parsed)) {
          store.setItem(key, JSON.stringify(withoutCredentials(parsed)));
        }
      });
    } catch { /* storage unavailable: nothing cached to scrub */ }
  });
};
scrubStoredCredentials();

const splitValues = (value) => Array.isArray(value) ? value.filter(Boolean) : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

const normalizeGender = (value) => {
  const gender = String(value || '').trim().toLowerCase();
  if (gender === 'male') return 'Male';
  if (gender === 'female') return 'Female';
  if (['prefer not to say', 'prefer_not_to_say', 'prefer not say'].includes(gender)) return 'Prefer not to say';
  return null;
};

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Could not read profile photo.'));
  reader.readAsDataURL(file);
});

export const compressedImageDataUrl = async (file) => file ? fileToDataUrl(await compressImageOnly(file)) : '';
export { fileToDataUrl };

// profiles.skills is server-owned (0004): only set_member_interests writes it, so it is never part of a client row.
// The legacy city / state are never sent (D-036: private and not client-editable); the home area is a coarse cell set
// through set_home_location / set_home_city.
export const profileToRow = (profile, userId, photoUrl = '') => ({
  id: userId,
  name: profile.name || 'New Member',
  full_name: profile.name || 'New Member',
  email: profile.email || '',
  phone: profile.phone || '',
  phone_country_code: profile.phoneCountryCode || profile.phone_country_code || '',
  phone_number: profile.phoneNumber || profile.phone_number || '',
  gender: normalizeGender(profile.gender),
  experience: profile.experience || '',
  looking_for: splitValues(profile.lookingFor || profile.looking_for),
  photo_url: photoUrl || profile.photoUrl || null,
  cover_url: profile.coverUrl || profile.cover_url || null,
  updated_at: new Date().toISOString(),
});

export const uploadProfilePhoto = async (userId, file) => {
  if (!supabase || !file) return '';
  const compressedFile = await compressImageOnly(file);
  const extension = compressedFile.type === 'image/jpeg' ? 'jpg' : (compressedFile.name.split('.').pop()?.toLowerCase() || 'bin');
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('profile-photos').upload(path, compressedFile, { upsert: true, contentType: compressedFile.type || 'application/octet-stream' });
  // Fail visibly: never fall back to storing an inline data: URL (0003 caps photo_url at 2048 characters).
  if (error) throw new Error('Your photo could not be uploaded. Please try again.');
  return supabase.storage.from('profile-photos').getPublicUrl(path).data.publicUrl;
};

export const uploadProfileCover = async (userId, file) => {
  if (!supabase || !file) return '';
  const compressedFile = await compressImageOnly(file);
  const extension = compressedFile.type === 'image/jpeg' ? 'jpg' : (compressedFile.name.split('.').pop()?.toLowerCase() || 'bin');
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('profile-covers').upload(path, compressedFile, { upsert: true, contentType: compressedFile.type || 'application/octet-stream' });
  if (error) throw new Error('Your cover photo could not be uploaded. Please try again.');
  return supabase.storage.from('profile-covers').getPublicUrl(path).data.publicUrl;
};

const messageAttachmentExtension = (file) => {
  const mimeExtension = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'text/plain': 'txt',
  };
  return mimeExtension[file.type] || file.name.split('.').pop()?.toLowerCase() || 'bin';
};

const messageAttachmentKind = attachmentKind;

export const uploadMessageAttachment = async (userId, file) => {
  if (!supabase || !userId || !file) throw new Error('Chat media upload is not configured.');
  const kind = messageAttachmentKind(file);
  // GIFs stay animated; normal images are resized and converted to JPEG before upload.
  const processedFile = kind === 'image' ? await compressImageOnly(file) : file; // already-compressed files are not re-encoded
  const extension = messageAttachmentExtension(processedFile);
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('message-attachments').upload(path, processedFile, {
    upsert: false,
    contentType: processedFile.type || 'application/octet-stream',
  });
  if (error) throw error;
  // The bucket is private: the path is stored and rendered through a signed URL (no public URL exists).
  return {
    path,
    url: '',
    kind,
    name: file.name,
    mime: processedFile.type || file.type || 'application/octet-stream',
    size: processedFile.size || file.size || 0,
  };
};

export const removeMessageAttachment = async (path) => {
  if (!supabase || !path) return;
  await supabase.storage.from('message-attachments').remove([path]);
};

export const uploadCommunityPostImage = async (userId, file) => {
  if (!supabase || !userId || !file) throw new Error('Community post uploads are not configured.');
  const processedFile = await compressImageOnly(file);
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('community-posts').upload(path, processedFile, {
    upsert: false,
    contentType: processedFile.type || 'image/jpeg',
  });
  if (error) throw error;
  return {
    path,
    url: supabase.storage.from('community-posts').getPublicUrl(path).data.publicUrl,
  };
};

export const removeCommunityPostImage = async (path) => {
  if (!supabase || !path) return;
  await supabase.storage.from('community-posts').remove([path]);
};

// After a successful replace + profile save, drop the previous object, only when it is this member's own file in the
// same bucket (never a preset cover or another member's path). Its error is ignored: a stray file is harmless.
const removeReplacedImage = async (bucket, userId, previousUrl, newUrl) => {
  const objectPath = replacedObjectPath(previousUrl, newUrl, (value) => isStorageImageUrl(value, bucket, userId));
  if (!objectPath) return;
  try { await supabase.storage.from(bucket).remove([objectPath]); } catch { /* ignored */ }
};

export const saveProfile = async (userId, profile, photoFile, coverFile = null, previous = {}) => {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') };
  let photoUrl;
  let coverUrl;
  // Compress BOTH before uploading either: a failure on the second must not leave the first orphaned in Storage.
  try {
    if (photoFile) { try { photoFile = await compressImageOnly(photoFile); } catch (error) { if (error instanceof ImageProcessingError) error.field = 'photo'; throw error; } }
    if (coverFile) { try { coverFile = await compressImageOnly(coverFile); } catch (error) { if (error instanceof ImageProcessingError) error.field = 'cover'; throw error; } }
  } catch (error) {
    return { data: null, error };
  }
  try {
    try { photoUrl = await uploadProfilePhoto(userId, photoFile); } catch (error) { if (error instanceof ImageProcessingError) error.field = 'photo'; throw error; }
    try { coverUrl = coverFile ? await uploadProfileCover(userId, coverFile) : (profile.coverUrl || profile.cover_url || ''); } catch (error) { if (error instanceof ImageProcessingError) error.field = 'cover'; throw error; }
  } catch (error) {
    return { data: null, error };
  }
  const row = profileToRow({ ...profile, coverUrl }, userId, photoUrl);
  // Only this member's own Storage files (or a bundled preset cover) are stored (0003 CHECK constraints). Local
  // data:/blob: previews, OAuth avatars and any other URL are never stored: an update leaves the column
  // unchanged, an insert stores null.
  if (row.photo_url && !isStorageImageUrl(row.photo_url, 'profile-photos', userId)) delete row.photo_url;
  if (row.cover_url && !isStorageImageUrl(row.cover_url, 'profile-covers', userId) && !isPresetCoverUrl(row.cover_url)) delete row.cover_url;
  // Members may update only editable columns (0003_trust_hardening.sql): id and email are insert-only and
  // created_at is always the server clock, so an upsert (which rewrites every column) would be denied. Update
  // first, insert the full row only when this member has no profile yet.
  const write = async (payload) => {
    const { id: ignoredId, email: ignoredEmail, ...editable } = payload;
    const updated = await supabase.from('profiles').update(editable).eq('id', userId).select().maybeSingle();
    if (updated.error || updated.data) return updated;
    return supabase.from('profiles').insert(payload).select().single();
  };
  let result = await write(row);
  if (result.error && /cover_url|column/i.test(result.error.message || '')) {
    const { cover_url: ignoredCoverUrl, ...legacyRow } = row;
    result = await write(legacyRow);
  }
  if (!result.error) {
    if (photoFile && photoUrl) await removeReplacedImage('profile-photos', userId, previous.photoUrl, photoUrl);
    if (coverFile && coverUrl) await removeReplacedImage('profile-covers', userId, previous.coverUrl, coverUrl);
  }
  return result;
};

export const rowToProfile = (row) => ({
  ...(row || {}),
  id: row.id,
  name: row.name || row.full_name || 'New Member',
  email: row.email || '',
  phone: row.phone || '',
  phoneCountryCode: row.phone_country_code || row.phoneCountryCode || '',
  phoneNumber: row.phone_number || row.phoneNumber || '',
  gender: row.gender || '',
  city: row.city || '',
  state: row.state || '',
  experience: row.experience || '',
  skills: Array.isArray(row.skills) ? row.skills.join(', ') : row.skills || '',
  lookingFor: Array.isArray(row.looking_for) ? row.looking_for.join(', ') : row.looking_for || '',
  photoUrl: row.photo_url || '',
  photoName: row.photo_url ? 'Profile photo' : '',
  // Older rows and auth metadata have used both camelCase and snake_case.
  // Keep the profile screen working for existing members as well as new saves.
  coverUrl: row.cover_url || row.coverUrl || row.cover_image_url || row.cover_image || '',
  coverName: row.cover_url || row.coverUrl || row.cover_image_url || row.cover_image ? 'Cover image' : '',
});

// ---------------------------------------------------------------------------------------------
// ORBIT onboarding (0004). Coordinates go only into the POST body of set_home_location (a volatile RPC, so PostgREST
// never serves it on GET); this module never stores, caches or logs them. Every call returns { data, error, status }.
// ---------------------------------------------------------------------------------------------
const notConfigured = () => ({ data: null, error: new Error('Supabase is not configured.'), status: 0 });
const rpcCall = async (name, args) => {
  if (!supabase) return notConfigured();
  const { data, error, status } = await supabase.rpc(name, args);
  return { data, error, status };
};
// A PostgREST error raised with SQLSTATE PT429 (for example 'try again later': the 3-per-24-h location cap).
export const isRateLimited = (error, status = 0) => status === 429 || error?.code === 'PT429';

// R1: the 18+ declaration. Must run before set_home_* and set_member_interests (the server refuses them otherwise).
export const declareAdult = () => rpcCall('declare_adult', { p_notice_version: NOTICE_VERSION });
export const setHomeLocation = (lat, lng) => rpcCall('set_home_location', { lat, lng });
export const setHomeCity = (placeId) => rpcCall('set_home_city', { p_place_id: placeId });
export const setMemberInterests = (items) => rpcCall('set_member_interests', { p_items: items });
// R2: give (true) or withdraw (false) the separate consent for private interests. Withdrawal deletes them server-side.
export const setSensitiveConsent = (consent) => rpcCall('set_sensitive_consent', { p_consent: consent });
export const fetchMyInterests = () => rpcCall('my_interests');

// my_onboarding_status(): { interests, points, has_cell, place_label, completed } or null when there is no row.
export const onboardingStatus = async () => {
  const result = await rpcCall('my_onboarding_status');
  const row = Array.isArray(result.data) ? result.data[0] || null : result.data || null;
  return { ...result, data: row };
};

// Signals (D-026, D-032): send_signal is the only way to send a request (raw connection_requests inserts are revoked).
// Both RPCs return one row in an array; data is that row or null.
//   sendSignal  -> { status: 'sent' | 'matched', remaining, resets_at }; a cap is HTTP 429 / PT429 with the message
//                  'signal_quota_exhausted' or 'signal_live_cap' (not charged).
//   fetchSignalQuota -> { daily_limit, remaining, resets_at, live_unanswered, live_limit }.
const firstRow = (result) => ({ ...result, data: Array.isArray(result.data) ? result.data[0] || null : result.data || null });
export const sendSignal = async (to, note = null) => firstRow(await rpcCall('send_signal', { p_to: to, p_note: note || null }));
export const fetchSignalQuota = async () => firstRow(await rpcCall('my_signal_quota', {}));

// The active taxonomy (spec §3.1): id, parent_id, level, label, sensitive. Levels 1-2 group, levels 3-4 are selectable.
export const fetchInterestNodes = async () => {
  if (!supabase) return notConfigured();
  const { data, error, status } = await supabase.from('interest_node')
    .select('id,parent_id,level,label,sensitive').eq('status', 'active').order('id');
  return { data: data || [], error, status };
};

// City list for "Pick my city": name or region match, launch cities first. Wildcards in the query are dropped.
export const searchPlaces = async (query, limit = 8) => {
  if (!supabase) return notConfigured();
  const clean = String(query || '').replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  let request = supabase.from('place').select('id,name,region,country');
  if (clean) request = request.or(`name.ilike.*${clean}*,region.ilike.*${clean}*`);
  const { data, error, status } = await request.order('is_launch', { ascending: false }).order('name').limit(limit);
  return { data: data || [], error, status };
};
