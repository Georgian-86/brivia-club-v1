// Resume upload in Profile (polish wave D3). Pure and injectable: no supabase import, no DOM, so the checks and the
// request shapes are unit-tested (tests/unit/resume-file.test.mjs). supabase.js binds createResumeApi to the client.
//
// One file per member at resumes/<uid>/resume.pdf in a private bucket (0012 §D: public false, file_size_limit
// 5242880, allowed_mime_types ['application/pdf'], owner-only insert/update/delete on exactly that path), and
// profiles.resume_path (owner-writable, constrained to that path). The server refuses non-PDF types and > 5 MB on
// its own; these checks only answer sooner, with the same copy.
export const RESUME_MAX_BYTES = 5242880;
export const RESUME_BUCKET = 'resumes';
export const RESUME_FILE_NAME = 'resume.pdf';
export const RESUME_SIGNED_SECONDS = 60;
export const resumePath = (userId) => `${userId}/${RESUME_FILE_NAME}`;

export const UPLOAD_PDF_COPY = 'Upload a PDF file.';
export const EMPTY_FILE_COPY = 'This file is empty.';
export const TOO_LARGE_COPY = 'Your resume must be 5 MB or smaller.';
export const NOT_A_PDF_COPY = "This file isn't a valid PDF.";
export const UPLOAD_FAILED_COPY = "Your resume couldn't be uploaded. Please try again.";
export const REPLACED_NOT_SAVED_COPY = "Your new resume is saved, but we couldn't update your profile. Please try again.";
export const REMOVE_FAILED_COPY = "Your resume couldn't be removed. Please try again.";
export const OPEN_FAILED_COPY = "Your resume couldn't be opened. Please try again.";
export const COMING_SOON_COPY = 'Resume upload is coming soon.';
export const REMOVE_RESUME_CONFIRM = 'Remove your resume? Matches you shared it with can no longer open it.';

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
// Browsers and OSes sometimes give a .pdf no type (or a generic one): the name and the magic bytes decide then.
const GENERIC_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

const looksLikePdf = (file) => {
  const type = String(file?.type || '').toLowerCase();
  if (type === 'application/pdf') return true;
  return GENERIC_TYPES.has(type) && /\.pdf$/i.test(String(file?.name || ''));
};

// validateResume(file, headBytes) -> { ok: true } | { ok: false, message }. headBytes: the file's first bytes
// (readResumeHead). Order: type or extension, empty, size, magic.
export const validateResume = (file, headBytes) => {
  if (!file || !looksLikePdf(file)) return { ok: false, message: UPLOAD_PDF_COPY };
  const size = Number(file.size) || 0;
  if (size <= 0) return { ok: false, message: EMPTY_FILE_COPY };
  if (size > RESUME_MAX_BYTES) return { ok: false, message: TOO_LARGE_COPY };
  const head = headBytes instanceof Uint8Array ? headBytes : new Uint8Array(0);
  if (head.length < PDF_MAGIC.length || PDF_MAGIC.some((byte, i) => head[i] !== byte)) return { ok: false, message: NOT_A_PDF_COPY };
  return { ok: true };
};

// The first 4 bytes of a File / Blob (empty when it cannot be read: validateResume then says it isn't a valid PDF).
export const readResumeHead = async (blob) => {
  try { return new Uint8Array(await blob.slice(0, PDF_MAGIC.length).arrayBuffer()); } catch { return new Uint8Array(0); }
};

export const formatResumeSize = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1048576) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${Number((size / 1048576).toFixed(1))} MB`;
};

// "1.2 MB · Updated 21 Oct 2026" (the card shows "resume.pdf" above it).
export const resumeMetaLine = ({ size, updatedAt } = {}) => {
  const parts = [];
  const sizeText = formatResumeSize(size);
  if (sizeText) parts.push(sizeText);
  const date = updatedAt ? new Date(updatedAt) : null;
  if (date && !Number.isNaN(date.getTime())) parts.push(`Updated ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`);
  return parts.join(' · ');
};

const errorText = (error) => `${error?.statusCode || error?.status || ''} ${error?.code || ''} ${error?.error || ''} ${error?.message || ''}`;

// A server refusal reads as the same field copy as the client check; anything else is a calm retry line.
export const resumeUploadErrorMessage = (error) => {
  const text = errorText(error);
  if (/\b413\b|exceeded the maximum allowed size|payload too large|too large/i.test(text)) return TOO_LARGE_COPY;
  if (/\b415\b|mime type|invalid_mime_type/i.test(text)) return UPLOAD_PDF_COPY;
  return UPLOAD_FAILED_COPY;
};

// 0012 not applied yet: the bucket or the profiles.resume_path column does not exist.
export const isMissingResumeStore = (error) => {
  if (!error) return false;
  const text = errorText(error);
  return /bucket not found/i.test(text) || (/resume_path/.test(text) && /PGRST204|42703|does not exist|could not find/i.test(text));
};

const asError = (error) => (error instanceof Error ? error : Object.assign(new Error(error?.message || String(error)), error && typeof error === 'object' ? error : {}));
const notConfigured = () => new Error('Supabase is not configured.');

// The Storage and profiles calls. Every method resolves (never rejects) with an `error` field.
export const createResumeApi = (client) => ({
  // Upsert <uid>/resume.pdf (Replace is the same call), then point profiles.resume_path at it. `hadPath`: the row
  // already pointed at this path (a Replace). When the profile write fails on a first upload, the new object is
  // removed again (best effort) so no file is left that the profile does not know about; on a Replace the row still
  // points at the (now replaced) file, so there is nothing to undo and `fileReplaced` is true.
  async uploadResume(userId, file, { hadPath = false } = {}) {
    if (!client) return { path: null, error: notConfigured(), fileReplaced: false };
    const path = resumePath(userId);
    let uploadedOk = false;
    try {
      const uploaded = await client.storage.from(RESUME_BUCKET).upload(path, file, { upsert: true, contentType: 'application/pdf' });
      if (uploaded?.error) return { path: null, error: asError(uploaded.error), fileReplaced: false };
      uploadedOk = true;
      const saved = await client.from('profiles').update({ resume_path: path }).eq('id', userId);
      if (saved?.error) throw saved.error;
      return { path, error: null, fileReplaced: false };
    } catch (error) {
      if (uploadedOk && !hadPath) {
        try { await client.storage.from(RESUME_BUCKET).remove([path]); } catch { /* best effort */ }
      }
      return { path: null, error: asError(error), fileReplaced: uploadedOk && hadPath };
    }
  },
  // Best effort: point profiles.resume_path at nothing (the stored path names no file).
  async clearResumePath(userId) {
    if (!client) return { error: notConfigured() };
    try {
      const saved = await client.from('profiles').update({ resume_path: null }).eq('id', userId);
      return { error: saved?.error ? asError(saved.error) : null };
    } catch (error) { return { error: asError(error) }; }
  },
  // Remove the object first; only then clear resume_path (a failed remove leaves the row pointing at the file).
  async removeResume(userId) {
    if (!client) return { error: notConfigured() };
    try {
      const removed = await client.storage.from(RESUME_BUCKET).remove([resumePath(userId)]);
      if (removed?.error) return { error: asError(removed.error) };
      const saved = await client.from('profiles').update({ resume_path: null }).eq('id', userId);
      return { error: saved?.error ? asError(saved.error) : null };
    } catch (error) { return { error: asError(error) }; }
  },
  // A short-lived signed link to the member's own file (the bucket has no public URL).
  async resumeSignedUrl(path, seconds = RESUME_SIGNED_SECONDS) {
    if (!client) return { url: null, error: notConfigured() };
    try {
      const { data, error } = await client.storage.from(RESUME_BUCKET).createSignedUrl(path, seconds);
      if (error || !data?.signedUrl) return { url: null, error: asError(error || new Error('No signed URL')) };
      return { url: data.signedUrl, error: null };
    } catch (error) { return { url: null, error: asError(error) }; }
  },
  // Size and last update of the own file (Storage metadata), or null when there is none.
  async resumeInfo(userId) {
    if (!client) return { info: null, error: notConfigured() };
    try {
      const { data, error } = await client.storage.from(RESUME_BUCKET).list(String(userId), { limit: 10, search: RESUME_FILE_NAME });
      if (error) return { info: null, error: asError(error) };
      const item = (data || []).find((entry) => entry?.name === RESUME_FILE_NAME);
      if (!item) return { info: null, error: null };
      return { info: { size: Number(item.metadata?.size) || 0, updatedAt: item.updated_at || item.created_at || null }, error: null };
    } catch (error) { return { info: null, error: asError(error) }; }
  },
});
