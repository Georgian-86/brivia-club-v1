// The landing hero in 4K (founder, 2026-10-16, D-062): the 1080p downscale looked soft, so the hero ships the 4K
// master's own pixels only. Two frames, three codecs each, all from assets/hero-section-video-4k.mp4 (3840x2160):
//
//   landscape  3840x2160, the full frame                          (desktops, laptops, tablets, landscape phones)
//   portrait   1216x2160, the centre 9:16 crop at native density  (portrait phones: object-fit:cover would only
//              show this centre slice of the full frame anyway, so the phone gets 4K-sharp pixels for ~1/3 of the bytes)
//
//   <name>-av1.mp4   AV1 (SVT-AV1)     Chrome, Edge, Firefox, Opera, Samsung Internet, Safari on AV1 hardware
//   <name>-hevc.mp4  HEVC, tagged hvc1  Safari on every Apple device (and Chromium with hardware HEVC)
//   <name>-h264.mp4  H.264 High          the last resort for a browser that decodes neither
//
// index.html lists them in that order with exact `type` codecs, so each browser fetches exactly one file. No audio
// (the hero is muted), +faststart (playback starts before the download ends), 2 s GOP so a seek or loop restarts fast.
// Reruns skip outputs newer than the master.
//
// Usage: npm run media:hero4k   (needs ffmpeg with libsvtav1, libx265 and libx264)
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';
const master = join(root, 'assets', 'hero-section-video-4k.mp4');
const outDir = join(root, 'media', 'video');

export const HERO_FRAMES = {
  'hero-4k': { filter: null },
  'hero-portrait-4k': { filter: 'crop=1216:2160:(in_w-1216)/2:0' },
};
// Quality: chosen by eye on the shadow edges at 100% (crf 32 AV1 / 25 HEVC keep the window-frame shadows
// crisp; higher values start to band the wall gradient). H.264 is the last resort (no AV1, no HEVC), at crf 27 to stay
// under the 20 MB hero cap (about 18 MB).
export const HERO_CODECS = {
  av1: ['-c:v', 'libsvtav1', '-preset', '6', '-crf', '32', '-svtav1-params', 'tune=0'],
  hevc: ['-c:v', 'libx265', '-preset', 'medium', '-crf', '25', '-tag:v', 'hvc1', '-x265-params', 'log-level=error'],
  h264: ['-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-profile:v', 'high'],
};

const fresh = (out) => existsSync(out) && statSync(out).mtimeMs >= statSync(master).mtimeMs;

const main = () => {
  if (!existsSync(master)) throw new Error(`missing master: ${master}`);
  mkdirSync(outDir, { recursive: true });
  for (const [frame, { filter }] of Object.entries(HERO_FRAMES)) {
    for (const [codec, args] of Object.entries(HERO_CODECS)) {
      const out = join(outDir, `${frame}-${codec}.mp4`);
      if (fresh(out)) { console.log(`fresh ${out}`); continue; }
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', master, ...(filter ? ['-vf', filter] : []),
        '-an', ...args, '-g', '60', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
      console.log(`video ${frame} ${codec} -> ${Math.round(statSync(out).size / 1024)} KB`);
    }
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
