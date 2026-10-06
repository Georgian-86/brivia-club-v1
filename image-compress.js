// Image re-encode for every member upload (R12). It FAILS CLOSED: the original file (with its EXIF, possibly GPS)
// is never returned for an image. Dependencies are injectable so this runs under node without a DOM.
export const PHOTO_ERROR_MESSAGE = "We couldn't process this photo. Try a JPG or PNG.";

export class ImageProcessingError extends Error {
  constructor(message = PHOTO_ERROR_MESSAGE) {
    super(message);
    this.name = 'ImageProcessingError';
  }
}

export const browserDeps = {
  createObjectURL: (file) => URL.createObjectURL(file),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  loadImage: async (url) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, image };
  },
  createCanvas: (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
  toBlob: (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality)),
  makeFile: (blob, name, type) => new File([blob], name, { type, lastModified: Date.now() }),
};

const MAX_SIZE = 1280;

export async function compressImage(file, deps = browserDeps) {
  if (!file || !(file.type || '').startsWith('image/')) return file;
  let objectUrl = '';
  try {
    objectUrl = deps.createObjectURL(file);
    const { naturalWidth, naturalHeight, image } = await deps.loadImage(objectUrl);
    if (!(naturalWidth > 0) || !(naturalHeight > 0)) throw new ImageProcessingError();
    const scale = Math.min(1, MAX_SIZE / Math.max(naturalWidth, naturalHeight));
    const canvas = deps.createCanvas(Math.max(1, Math.round(naturalWidth * scale)), Math.max(1, Math.round(naturalHeight * scale)));
    const context = canvas.getContext('2d');
    if (!context) throw new ImageProcessingError();
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await deps.toBlob(canvas, 'image/jpeg', 0.78);
    if (!blob) throw new ImageProcessingError();
    return deps.makeFile(blob, `${String(file.name || 'photo').replace(/\.[^.]+$/, '')}.jpg`, 'image/jpeg');
  } catch (error) {
    throw error instanceof ImageProcessingError ? error : new ImageProcessingError();
  } finally {
    if (objectUrl) { try { deps.revokeObjectURL(objectUrl); } catch { /* nothing to revoke */ } }
  }
}

// The storage path of a previous own-bucket object that a replace made obsolete, or '' when nothing may be removed.
// `isOwn(url)` decides ownership (own folder, same bucket); preset covers and other members' files never pass.
export const replacedObjectPath = (previousUrl, newUrl, isOwn) => {
  if (!previousUrl || previousUrl === newUrl || !isOwn(previousUrl)) return '';
  const parts = new URL(previousUrl).pathname.split('/');
  return `${parts[6]}/${parts[7]}`;
};
