// The landing hero in 4K (D-062; re-graded D-153, founder 2026-11-04: "improve the quality of the video ... and make it
// look better on phone view both angle wise and quality wise").
//
// Master: source-media/Images/Videos/HEROSECTIONVI.MOV (the original export, 3840x2158, ~24 Mbps), scaled to 3840x2160.
// The footage is soft (upscaled), so compression was never the limit (the D-062 files were SSIM 0.99 to their master);
// what reads as "low quality" is softness and gradient banding. So every frame gets:
//   * a two-pass unsharp (wide radius for the soft edges, small radius for fine lines), luma only, no halos at 100%;
//   * 10-bit AV1 and HEVC (smooth skies and walls without banding; every AV1 and HEVC Main 10 decoder plays them);
//   * capped quality: CRF for the look, a bitrate ceiling so each file stays under the 20 MB hero cap.
//
// Two frames, three codecs each:
//   landscape  3840x2160, the full frame                      (desktops, laptops, tablets, landscape phones)
//   portrait   1216x2160 at native density, a crop that FOLLOWS THE SUBJECT (D-153): the passports, the tennis kit, the
//              daisies then the piano, the plane window, the chess game, the HACKATHON tablet... instead of the old fixed
//              centre slice that cut most scenes in half on a phone. The path is a list of (time, centre) keyframes,
//              eased between, so pans are slow and land on the cuts.
//
//   <name>-av1.mp4   AV1 10-bit (SVT-AV1)  Chrome, Edge, Firefox, Opera, Samsung Internet, Safari on AV1 hardware
//   <name>-hevc.mp4  HEVC Main 10, hvc1      Safari on every Apple device (and Chromium with hardware HEVC)
//   <name>-h264.mp4  H.264 High (8-bit)      the last resort
// No audio (the hero is muted; its soundtrack is separate, encode-hero-audio.mjs), +faststart, 2 s GOP.
// Posters: hero-section-video.webp (1920x1080) and hero-portrait.webp (720x1280), the first frame of each frame.
//
// Usage: npm run media:hero4k   (needs ffmpeg with libsvtav1, libx265 and libx264; ~40 min on 4 cores)
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';
const master = join(root, 'source-media', 'Images', 'Videos', 'HEROSECTIONVI.MOV');
const outDir = join(root, 'site', 'media', 'video');
const posterDir = join(root, 'site', 'media', 'posters');

// Where the subject is, as the crop centre (0 = left edge, 1 = right edge of the 16:9 frame), chosen by eye from a
// 0.5 s contact sheet of the master. Between two keyframes the centre eases (smoothstep).
export const PORTRAIT_PATH = [
  [0, 0.52], [0.4, 0.52], [0.7, 0.55], [2.3, 0.55], [2.6, 0.5], [2.9, 0.5], [3.1, 0.38], [3.3, 0.38], [3.9, 0.6],
  [4.0, 0.42], [5.4, 0.42], [5.7, 0.5], [5.85, 0.5], [6.1, 0.72], [6.3, 0.72], [6.5, 0.46], [7.3, 0.46], [7.5, 0.5],
  [9.7, 0.5], [10.0, 0.45], [10.3, 0.45], [10.5, 0.5], [12.2, 0.5], [12.5, 0.6], [12.8, 0.6], [13.0, 0.55],
  [13.3, 0.55], [13.5, 0.33], [13.8, 0.33], [14.0, 0.5], [14.3, 0.38], [14.9, 0.7], [15.0, 0.65], [15.8, 0.65],
  [16.0, 0.3], [16.3, 0.3], [16.5, 0.55], [17.7, 0.55],
];

// The crop's x as an ffmpeg expression of t (nested ifs, smoothstep between keyframes), clamped to the frame.
export const panExpression = (path = PORTRAIT_PATH, frameWidth = 3840, cropWidth = 1216) => {
  let e = String(path[path.length - 1][1]);
  for (let i = path.length - 2; i >= 0; i -= 1) {
    const [t0, f0] = path[i];
    const [t1, f1] = path[i + 1];
    const u = `((t-${t0})/${(t1 - t0).toFixed(4)})`;
    e = `if(lt(t,${t1}),${f0}+(${f1}-${f0})*(${u}*${u}*(3-2*${u})),${e})`;
  }
  return `max(0,min(${frameWidth - cropWidth},(${e})*${frameWidth}-${cropWidth / 2}))`;
};

const BASE = 'scale=3840:2160:flags=lanczos';
// D-155: the source carries a generator watermark (a four-point sparkle) bottom right, at the same place for the whole
// clip (x 3405-3555, y 1720-1875 at 3840x2160). delogo fills it from its surroundings. The portrait crop never reaches
// x > 3373, so only the full frame needs it.
const UNMARK = 'delogo=x=3392:y=1708:w=176:h=180';
const SHARPEN = 'unsharp=11:11:0.7:5:5:0,unsharp=5:5:0.6:5:5:0';
export const HERO_FRAMES = {
  'hero-4k': { filter: `${BASE},${UNMARK},${SHARPEN}`, poster: { name: 'hero-section-video.webp', scale: '1920:1080' } },
  'hero-portrait-4k': { filter: `${BASE},crop=1216:2160:'${panExpression()}':0,${SHARPEN}`, poster: { name: 'hero-portrait.webp', scale: '720:1280' } },
};
// [codec args, ceiling for the landscape frame, ceiling for the portrait frame] (kbit/s; peaks may exceed briefly).
export const HERO_CODECS = {
  av1: { args: ['-c:v', 'libsvtav1', '-preset', '6', '-crf', '25', '-pix_fmt', 'yuv420p10le'], max: { 'hero-4k': 8500, 'hero-portrait-4k': 4500 }, svt: true },
  hevc: { args: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1'], max: { 'hero-4k': 8500, 'hero-portrait-4k': 4500 } },
  h264: { args: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-profile:v', 'high', '-pix_fmt', 'yuv420p'], max: { 'hero-4k': 8500, 'hero-portrait-4k': 5000 } },
};

const fresh = (out) => existsSync(out) && statSync(out).mtimeMs >= statSync(master).mtimeMs && statSync(out).mtimeMs >= statSync(fileURLToPath(import.meta.url)).mtimeMs;

const rateArgs = (codec, frame) => {
  const max = HERO_CODECS[codec].max[frame];
  if (HERO_CODECS[codec].svt) return ['-svtav1-params', `tune=0:mbr=${max}`];
  if (codec === 'hevc') return ['-x265-params', `log-level=error:vbv-maxrate=${max}:vbv-bufsize=${max * 2}`];
  return ['-maxrate', `${max}k`, '-bufsize', `${max * 2}k`];
};

const main = () => {
  if (!existsSync(master)) throw new Error(`missing master: ${master}`);
  mkdirSync(outDir, { recursive: true });
  const only = process.argv.slice(2);
  for (const [frame, { filter, poster }] of Object.entries(HERO_FRAMES)) {
    for (const [codec, { args }] of Object.entries(HERO_CODECS)) {
      if (only.length && !only.includes(`${frame}-${codec}`)) continue;
      const out = join(outDir, `${frame}-${codec}.mp4`);
      if (fresh(out)) { console.log(`fresh ${out}`); continue; }
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', master, '-vf', filter, '-an', ...args, ...rateArgs(codec, frame),
        '-g', '60', '-movflags', '+faststart', out], { stdio: 'inherit' });
      console.log(`video ${frame} ${codec} -> ${Math.round(statSync(out).size / 1024)} KB`);
    }
    const posterOut = join(posterDir, poster.name);
    if (!only.length || only.includes(`${frame}-poster`)) {
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', master, '-vf', `${filter},scale=${poster.scale}:flags=lanczos`, '-frames:v', '1',
        '-c:v', 'libwebp', '-quality', '82', posterOut], { stdio: 'inherit' });
      console.log(`poster ${poster.name} -> ${Math.round(statSync(posterOut).size / 1024)} KB`);
    }
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
