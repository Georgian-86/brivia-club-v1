// The pure maths of the profile photo "portion selector" (photo-crop.js). No DOM: node tests it.
// Model: a square stage with a centred circle of `diameter` px. The photo (natural `width` x `height`) is drawn
// centred on the stage, scaled by baseScale * zoom and moved by an offset (x, y) in stage px. At 1x the short side of
// the photo exactly fills the circle, so the circle (and its bounding square, which is what we export) is always
// covered: the offset is clamped so no empty space can ever show inside it.
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export const clampZoom = (zoom) => {
  const z = Number(zoom);
  if (!Number.isFinite(z)) return MIN_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
};

export const baseScale = (width, height, diameter) => diameter / Math.max(1e-9, Math.min(width, height));

export const initialCrop = () => ({ x: 0, y: 0, zoom: 1 });

const clampAxis = (value, displayed, diameter) => {
  const slack = Math.max(0, (displayed - diameter) / 2);
  const v = Number.isFinite(value) ? value : 0;
  return Math.min(slack, Math.max(-slack, v)) || 0; // || 0: never -0
};

export const clampOffset = (state, { width, height, diameter }) => {
  const zoom = clampZoom(state.zoom);
  const scale = baseScale(width, height, diameter) * zoom;
  return { x: clampAxis(state.x, width * scale, diameter), y: clampAxis(state.y, height * scale, diameter), zoom };
};

export const panBy = (state, dx, dy, dims) => clampOffset({ ...state, x: state.x + dx, y: state.y + dy }, dims);

// Zoom to `nextZoom` keeping the photo point under `point` (stage px from the centre) where it is.
export const zoomAbout = (state, nextZoom, point, dims) => {
  const from = clampZoom(state.zoom);
  const to = clampZoom(nextZoom);
  const ratio = to / from;
  const px = point?.x || 0;
  const py = point?.y || 0;
  return clampOffset({ x: px - (px - state.x) * ratio, y: py - (py - state.y) * ratio, zoom: to }, dims);
};

// One wheel notch (deltaY ~ 100) is about 20 %.
export const wheelZoom = (zoom, deltaY) => clampZoom(zoom * Math.exp(-Number(deltaY || 0) * 0.002));

export const pinchZoom = (startZoom, startDistance, distance) => (startDistance > 0 ? clampZoom(startZoom * (distance / startDistance)) : startZoom);

// The square under the circle, in natural pixels of the photo, always inside the photo.
export const cropRect = (state, dims) => {
  const { width, height, diameter } = dims;
  const s = clampOffset(state, dims);
  const scale = baseScale(width, height, diameter) * s.zoom;
  const size = Math.max(1, Math.min(Math.round(diameter / scale), Math.floor(Math.min(width, height)) || 1));
  const fit = (value, extent) => Math.min(Math.max(0, Math.round(value)), Math.max(0, Math.floor(extent) - size));
  return {
    sx: fit(width / 2 + (-diameter / 2 - s.x) / scale, width),
    sy: fit(height / 2 + (-diameter / 2 - s.y) / scale, height),
    size,
  };
};

// Fix round 1 (I3): the decoded photo is at most MAX_DECODE px on its long side (aspect kept, never upscaled), so a
// 6000 x 4000 phone photo is not held and redrawn at full size on every drag frame. 2048 px still gives the 800 px
// output enough pixels at 2.5x zoom.
export const MAX_DECODE = 2048;
export const decodeSize = (width, height, max = MAX_DECODE) => {
  const scale = max / Math.max(width, height);
  if (!(scale < 1)) return { width, height, scaled: false };
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scaled: true };
};
