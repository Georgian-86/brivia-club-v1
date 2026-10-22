// "Frame your photo": the profile photo portion selector (founder request, 2026-10-22; D-080 notes). No library.
// openPhotoCrop(file) shows a modal dialog with the photo under a circular mask (avatars are round) and resolves with a
// square JPEG File of the framed region, or null when the member cancels. The maths lives in photo-crop-math.js (pure,
// unit-tested); this file is only the DOM. The result still goes through compressImageOnly and the existing upload.
// Input: drag (mouse, pen, one finger), pinch (two fingers), the wheel, the zoom slider, arrow keys (move) and + / -
// (zoom). Escape or Cancel resolves null. Focus is trapped while open and returns to `returnFocus` on close.
import '../styles/photo-crop.css';
import { ImageProcessingError } from './image-compress.js';
import { MIN_ZOOM, MAX_ZOOM, clampZoom, clampOffset, panBy, zoomAbout, wheelZoom, pinchZoom, cropRect, initialCrop, baseScale, decodeSize } from './photo-crop-math.js';

export const OUTPUT_SIZE = 800;
const MASK = 0.86; // the circle's share of the stage side
const KEY_STEP = 12;

// EXIF orientation is applied by the decoder ('from-image'); an <img> fallback (browsers apply it there by default)
// covers decoders without createImageBitmap options or for SVG. Either way the photo kept for the dialog is at most
// MAX_DECODE (2048) px on its long side (decodeSize, fix round 1 I3): an over-size bitmap is resized with
// createImageBitmap resizeWidth / resizeHeight and the full-size one closed at once; the <img> path draws into a
// capped canvas. Only that capped source is redrawn on every drag frame.
const fromBitmap = async (bitmap) => {
  const size = decodeSize(bitmap.width, bitmap.height);
  if (!size.scaled) return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() };
  try {
    const small = await createImageBitmap(bitmap, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' });
    return { source: small, width: small.width, height: small.height, release: () => small.close?.() };
  } finally {
    bitmap.close?.();
  }
};
const fromImage = (image, release) => {
  const size = decodeSize(image.naturalWidth, image.naturalHeight);
  if (!size.scaled) return { source: image, width: image.naturalWidth, height: image.naturalHeight, release };
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) { release(); throw new ImageProcessingError(); }
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, size.width, size.height);
  release();
  return { source: canvas, width: size.width, height: size.height, release: () => { canvas.width = 0; canvas.height = 0; } };
};
const decode = async (file) => {
  if (typeof createImageBitmap === 'function') {
    let bitmap = null;
    try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through to <img> */ }
    if (bitmap) return fromBitmap(bitmap);
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return fromImage(image, () => URL.revokeObjectURL(url));
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
};

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// The framed square as a JPEG File (OUTPUT_SIZE x OUTPUT_SIZE).
export const renderCrop = async (decoded, rect, name = 'photo') => {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new ImageProcessingError();
  context.imageSmoothingQuality = 'high';
  context.drawImage(decoded.source, rect.sx, rect.sy, rect.size, rect.size, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  const blob = await toBlob(canvas, 'image/jpeg', 0.9);
  if (!blob) throw new ImageProcessingError();
  return new File([blob], `${String(name || 'photo').replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
};

const ICON_MINUS = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const markup = () => `<div class="photo-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-crop-title" aria-describedby="photo-crop-help" tabindex="-1">
  <p class="photo-crop-kicker">PROFILE PHOTO</p>
  <h2 class="photo-crop-title" id="photo-crop-title">Frame your photo</h2>
  <p class="photo-crop-help" id="photo-crop-help">Drag to choose what shows in the circle. Zoom with the slider, a pinch or the mouse wheel. Arrow keys move it; + and − zoom.</p>
  <div class="photo-crop-body">
    <div class="photo-crop-stage" tabindex="0" role="group" aria-label="Photo framing. Arrow keys move the photo, plus and minus zoom." data-photo-crop-stage>
      <canvas class="photo-crop-canvas" aria-hidden="true"></canvas>
      <span class="photo-crop-mask" aria-hidden="true"></span>
    </div>
    <div class="photo-crop-side">
      <canvas class="photo-crop-preview" width="160" height="160" aria-hidden="true"></canvas>
      <p class="photo-crop-preview-label">Preview</p>
    </div>
  </div>
  <div class="photo-crop-zoom">
    <button type="button" class="photo-crop-step" data-photo-crop-zoom="-1" aria-label="Zoom out">${ICON_MINUS}</button>
    <input type="range" class="photo-crop-range" min="${MIN_ZOOM}" max="${MAX_ZOOM}" step="0.01" value="1" aria-label="Zoom" data-photo-crop-range />
    <button type="button" class="photo-crop-step" data-photo-crop-zoom="1" aria-label="Zoom in">${ICON_PLUS}</button>
  </div>
  <div class="photo-crop-actions">
    <button type="button" class="photo-crop-cancel" data-photo-crop-cancel>Cancel</button>
    <button type="button" class="photo-crop-use" data-photo-crop-use>Use photo</button>
  </div>
</div>`;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Resolves with the framed File, or null on Cancel / Escape. Throws ImageProcessingError when the file cannot be
// decoded (nothing is shown then; the caller keeps its existing inline error path).
export async function openPhotoCrop(file, { returnFocus = null } = {}) {
  let decoded;
  try { decoded = await decode(file); } catch { throw new ImageProcessingError(); }
  if (!(decoded.width > 0) || !(decoded.height > 0)) { decoded.release(); throw new ImageProcessingError(); }

  const root = document.createElement('div');
  root.className = 'photo-crop';
  root.innerHTML = markup();
  document.body.append(root);
  document.body.classList.add('photo-crop-open');
  // Fix round 1 (I1): everything behind the dialog is inert while it is open (the profile editor included), so a click
  // on plain dialog text cannot hand Tab to the page behind. Each sibling's own inert state is restored on close.
  const madeInert = [...document.body.children].filter((el) => el !== root && !el.inert);
  madeInert.forEach((el) => { el.inert = true; });
  const dialog = root.querySelector('.photo-crop-dialog');
  const stage = root.querySelector('[data-photo-crop-stage]');
  const canvas = root.querySelector('.photo-crop-canvas');
  const preview = root.querySelector('.photo-crop-preview');
  const range = root.querySelector('[data-photo-crop-range]');
  const useButton = root.querySelector('[data-photo-crop-use]');

  let side = 0; // stage side in CSS px
  let state = initialCrop();
  const dims = () => ({ width: decoded.width, height: decoded.height, diameter: side * MASK });

  const draw = () => {
    if (!side) return;
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    const px = Math.round(side * ratio);
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    const context = canvas.getContext('2d');
    if (!context) return;
    const scale = baseScale(decoded.width, decoded.height, side * MASK) * state.zoom;
    const w = decoded.width * scale;
    const h = decoded.height * scale;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, side, side);
    context.drawImage(decoded.source, side / 2 + state.x - w / 2, side / 2 + state.y - h / 2, w, h);
    const rect = cropRect(state, dims());
    const p = preview.getContext('2d');
    if (p) { p.clearRect(0, 0, preview.width, preview.height); p.drawImage(decoded.source, rect.sx, rect.sy, rect.size, rect.size, 0, 0, preview.width, preview.height); }
    stage.dataset.cropRect = `${rect.sx},${rect.sy},${rect.size}`;
    stage.dataset.sourceSize = `${decoded.width},${decoded.height}`;
    range.value = String(state.zoom);
    range.setAttribute('aria-valuetext', `${state.zoom.toFixed(1)} times`);
  };
  const set = (next) => { state = clampOffset(next, dims()); draw(); };

  const measure = () => {
    const next = stage.clientWidth;
    if (!next || next === side) return;
    // Keep the framing when the stage resizes (rotation, window resize): offsets scale with the stage.
    if (side) state = { ...state, x: state.x * (next / side), y: state.y * (next / side) };
    side = next;
    set(state);
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
  observer?.observe(stage);
  window.addEventListener('resize', measure);
  measure();

  const fromCentre = (clientX, clientY) => {
    const box = stage.getBoundingClientRect();
    return { x: clientX - box.left - box.width / 2, y: clientY - box.top - box.height / 2 };
  };

  // Pointers: one drags, two pinch (zoom about their midpoint).
  const pointers = new Map();
  let pinch = null;
  stage.addEventListener('pointerdown', (event) => {
    stage.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.zoom };
    }
    stage.classList.add('is-dragging');
    event.preventDefault();
  });
  stage.addEventListener('pointermove', (event) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const now = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, now);
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const mid = fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2);
      state = zoomAbout(state, pinchZoom(pinch.zoom, pinch.distance, Math.hypot(a.x - b.x, a.y - b.y)), mid, dims());
      draw();
    } else if (pointers.size === 1) {
      set(panBy(state, now.x - last.x, now.y - last.y, dims()));
    }
  });
  const release = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) stage.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    state = zoomAbout(state, wheelZoom(state.zoom, event.deltaY), fromCentre(event.clientX, event.clientY), dims());
    draw();
  }, { passive: false });

  range.addEventListener('input', () => { state = zoomAbout(state, Number(range.value), { x: 0, y: 0 }, dims()); draw(); });
  const zoomStep = (direction) => { state = zoomAbout(state, clampZoom(state.zoom + direction * 0.25), { x: 0, y: 0 }, dims()); draw(); };
  root.querySelectorAll('[data-photo-crop-zoom]').forEach((button) => button.addEventListener('click', () => zoomStep(Number(button.dataset.photoCropZoom))));

  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('keydown', onKeydown, true);
      madeInert.forEach((el) => { el.inert = false; });
      root.remove();
      document.body.classList.remove('photo-crop-open');
      decoded.release();
      if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
      resolve(result);
    };
    root.querySelector('[data-photo-crop-cancel]').addEventListener('click', () => finish(null));
    useButton.addEventListener('click', async () => {
      useButton.disabled = true;
      useButton.setAttribute('aria-busy', 'true');
      try {
        finish(await renderCrop(decoded, cropRect(state, dims()), file?.name));
      } catch {
        useButton.disabled = false;
        useButton.removeAttribute('aria-busy');
      }
    });
    // Capture phase on the document (fix round 1, I1): Escape and Tab work wherever focus is (even on <body> after a
    // click on plain text), and nothing behind the dialog sees them.
    const onKeydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(null); return; }
      if (event.key === 'Tab') {
        event.stopPropagation();
        const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        const outside = !dialog.contains(active) || active === dialog; // the dialog itself after a click on plain text
        if (event.shiftKey && (active === first || outside)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (active === last || outside)) { event.preventDefault(); first.focus(); }
        return;
      }
      const inRange = event.target === range;
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomStep(1); return; }
      if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomStep(-1); return; }
      if (inRange || event.target !== stage) return;
      const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[event.key]) { event.preventDefault(); set(panBy(state, moves[event.key][0], moves[event.key][1], dims())); }
    };
    document.addEventListener('keydown', onKeydown, true);
    // Clicks on the backdrop do nothing (a stray tap must not lose the framing); Cancel and Escape close.
    stage.focus();
  });
}
