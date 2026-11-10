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

// D-232: the frame may be a rectangle (frameWidth x frameHeight stage px, for a post photo). Without them it is the
// circle's bounding square (diameter x diameter), so the profile photo maths is unchanged.
const frameOf = (dims) => ({ fw: dims.frameWidth ?? dims.diameter, fh: dims.frameHeight ?? dims.diameter });
// At 1x the photo just covers the frame (the larger of the two axis fits).
export const frameScale = (width, height, fw, fh) => Math.max(fw / Math.max(1e-9, width), fh / Math.max(1e-9, height));

export const clampOffset = (state, dims) => {
  const { width, height } = dims;
  const { fw, fh } = frameOf(dims);
  const zoom = clampZoom(state.zoom);
  const scale = frameScale(width, height, fw, fh) * zoom;
  return { x: clampAxis(state.x, width * scale, fw), y: clampAxis(state.y, height * scale, fh), zoom };
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

// D-232: the frame (stage px) for an aspect ratio (width / height) inside a square stage of `side`, its long side
// `share` of the stage.
export const frameSize = (side, aspect, share = 0.86) => {
  const a = Number(aspect) > 0 ? Number(aspect) : 1;
  const long = side * share;
  return a >= 1 ? { frameWidth: long, frameHeight: long / a } : { frameWidth: long * a, frameHeight: long };
};

// D-232: the rectangle under a rectangular frame, in natural pixels of the photo, always inside the photo.
export const frameRect = (state, dims) => {
  const { width, height } = dims;
  const { fw, fh } = frameOf(dims);
  const s = clampOffset(state, dims);
  const scale = frameScale(width, height, fw, fh) * s.zoom;
  const sw = Math.max(1, Math.min(Math.round(fw / scale), Math.floor(width) || 1));
  const sh = Math.max(1, Math.min(Math.round(fh / scale), Math.floor(height) || 1));
  const fit = (value, extent, size) => Math.min(Math.max(0, Math.round(value)), Math.max(0, Math.floor(extent) - size));
  return { sx: fit(width / 2 + (-fw / 2 - s.x) / scale, width, sw), sy: fit(height / 2 + (-fh / 2 - s.y) / scale, height, sh), sw, sh };
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
