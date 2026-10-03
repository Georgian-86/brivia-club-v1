import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim();

export const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
export const supabaseReady = Boolean(supabase);

const splitValues = (value) => Array.isArray(value) ? value.filter(Boolean) : String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

const normalizeGender = (value) => {
  const gender = String(value || '').trim().toLowerCase();
  if (gender === 'male') return 'Male';
  if (gender === 'female') return 'Female';
  if (['prefer not to say', 'prefer_not_to_say', 'prefer not say'].includes(gender)) return 'Prefer not to say';
  return null;
};

const compressImage = async (file) => {
  if (!file || !(file.type || '').startsWith('image/')) return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    const maxSize = 1280;
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78));
    return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }) : file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Could not read profile photo.'));
  reader.readAsDataURL(file);
});

export const compressedImageDataUrl = async (file) => file ? fileToDataUrl(await compressImage(file)) : '';

export const profileToRow = (profile, userId, photoUrl = '') => ({
  id: userId,
  name: profile.name || 'New Member',
  full_name: profile.name || 'New Member',
  email: profile.email || '',
  phone: profile.phone || '',
  phone_country_code: profile.phoneCountryCode || profile.phone_country_code || '',
  phone_number: profile.phoneNumber || profile.phone_number || '',
  gender: normalizeGender(profile.gender),
  city: profile.city || '',
  state: profile.state || '',
  experience: profile.experience || '',
  skills: splitValues(profile.skills),
  looking_for: splitValues(profile.lookingFor || profile.looking_for),
  photo_url: photoUrl || profile.photoUrl || null,
  cover_url: profile.coverUrl || profile.cover_url || null,
  created_at: profile.createdAt || new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const uploadProfilePhoto = async (userId, file) => {
  if (!supabase || !file) return '';
  const compressedFile = await compressImage(file);
  const extension = compressedFile.type === 'image/jpeg' ? 'jpg' : (compressedFile.name.split('.').pop()?.toLowerCase() || 'bin');
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('profile-photos').upload(path, compressedFile, { upsert: true, contentType: compressedFile.type || 'application/octet-stream' });
  // Fail visibly: never fall back to storing an inline data: URL (0003 caps photo_url at 2048 characters).
  if (error) throw new Error('Your photo could not be uploaded. Please try again.');
  return supabase.storage.from('profile-photos').getPublicUrl(path).data.publicUrl;
};

export const uploadProfileCover = async (userId, file) => {
  if (!supabase || !file) return '';
  const compressedFile = await compressImage(file);
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

const messageAttachmentKind = (file) => {
  if ((file.type || '').startsWith('image/')) return file.type === 'image/gif' ? 'gif' : 'image';
  if ((file.type || '').startsWith('video/')) return 'video';
  return 'document';
};

export const uploadMessageAttachment = async (userId, file) => {
  if (!supabase || !userId || !file) throw new Error('Chat media upload is not configured.');
  const kind = messageAttachmentKind(file);
  // GIFs stay animated; normal images are resized and converted to JPEG before upload.
  const processedFile = kind === 'image' ? await compressImage(file) : file;
  const extension = messageAttachmentExtension(processedFile);
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('message-attachments').upload(path, processedFile, {
    upsert: false,
    contentType: processedFile.type || 'application/octet-stream',
  });
  if (error) throw error;
  const url = supabase.storage.from('message-attachments').getPublicUrl(path).data.publicUrl;
  return {
    path,
    url,
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
  const processedFile = await compressImage(file);
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

export const saveProfile = async (userId, profile, photoFile, coverFile = null) => {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') };
  let photoUrl;
  let coverUrl;
  try {
    photoUrl = await uploadProfilePhoto(userId, photoFile);
    coverUrl = coverFile ? await uploadProfileCover(userId, coverFile) : (profile.coverUrl || profile.cover_url || '');
  } catch (error) {
    return { data: null, error };
  }
  const row = profileToRow({ ...profile, coverUrl }, userId, photoUrl);
  // Inline data:/blob: URLs are local previews only (signup shows one before upload). They are never stored:
  // an update leaves the column unchanged, an insert stores null.
  ['photo_url', 'cover_url'].forEach((key) => { if (/^(data|blob):/i.test(String(row[key] || '').trim())) delete row[key]; });
  // Members may update only editable columns (0003_trust_hardening.sql): id, email and created_at
  // are insert-only, so an upsert (which rewrites every column) would be denied. Update first,
  // insert the full row only when this member has no profile yet.
  const write = async (payload) => {
    const { id: ignoredId, email: ignoredEmail, created_at: ignoredCreatedAt, ...editable } = payload;
    const updated = await supabase.from('profiles').update(editable).eq('id', userId).select().maybeSingle();
    if (updated.error || updated.data) return updated;
    return supabase.from('profiles').insert(payload).select().single();
  };
  let result = await write(row);
  if (result.error && /cover_url|column/i.test(result.error.message || '')) {
    const { cover_url: ignoredCoverUrl, ...legacyRow } = row;
    result = await write(legacyRow);
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
