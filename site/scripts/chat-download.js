// Download a photo, video or file someone sent in a chat. Files live in the private message-attachments bucket, so the
// browser cannot use <a download> on them (the signed URL is on another origin). Instead a short-lived signed URL is
// asked for with Supabase's `download` option, which makes Storage answer with Content-Disposition: attachment under
// the file's own name. Only our bucket files can be downloaded: external GIF links and the shared resume card (which
// has its own Open) cannot. The rules are pure and unit-tested; startDownload is the only DOM.

export const DOWNLOAD_URL_TTL_SECONDS = 60;

const EXTENSIONS = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/heic': 'heic',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'application/pdf': 'pdf', 'text/plain': 'txt',
};
const FALLBACK_BASE = { image: 'photo', video: 'video', gif: 'gif' };

export const canDownloadAttachment = (attachment) => Boolean(
  attachment && typeof attachment.path === 'string' && attachment.path.trim() && attachment.kind !== 'resume',
);

// A safe file name: no path separators, control or reserved characters, at most 120 characters, and an extension that
// matches the file's type when the stored name has none (a photo re-encoded as JPEG keeps its name and gains .jpg).
export const downloadFileName = (attachment) => {
  const kind = attachment?.kind || 'document';
  let name = String(attachment?.name || '')
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '');
  if (!name || name.toLowerCase() === 'attachment') name = FALLBACK_BASE[kind] || 'file';
  const ext = EXTENSIONS[String(attachment?.mime || '').toLowerCase()];
  if (ext && !/\.[a-z0-9]{2,5}$/i.test(name)) name = `${name}.${ext}`;
  if (name.length > 120) {
    const dot = name.lastIndexOf('.');
    const tail = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : '';
    name = name.slice(0, 120 - tail.length).trimEnd() + tail;
  }
  return name;
};

// storage: supabase.storage. Resolves { ok: true } once the browser was handed the file, { ok: false } otherwise.
export const downloadAttachment = async (storage, attachment) => {
  if (!storage || !canDownloadAttachment(attachment)) return { ok: false };
  const name = downloadFileName(attachment);
  try {
    const { data, error } = await storage.from('message-attachments').createSignedUrl(attachment.path, DOWNLOAD_URL_TTL_SECONDS, { download: name });
    if (error || !data?.signedUrl) return { ok: false, error };
    startDownload(data.signedUrl, name);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
};

const startDownload = (url, name) => {
  if (typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
};
