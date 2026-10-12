// Media build (Phase B): writes optimized copies of every image and video the site references into media/,
// plus media/manifest.json { "<original ref>": "<optimized ref>" } for the repoint codemod.
// Originals in Images/ and assets/ are source material and are never modified.
//
//   images  -> media/<same relative path, extension replaced>.webp  (max width 1600, WebP q78, alpha kept)
//   videos  -> media/video/<name>-1080.mp4 (crf 28), <name>-720.mp4 (crf 30), H.264 +faststart,
//              audio kept as AAC 96k only when the source has an audio track; no upscaling (a 720p source
//              gets only the 720 variant); poster media/posters/<name>.webp from the first frame.
//              A "<name>-4k.mp4" ref is treated as the hi-res master of <name> and maps to <name>-1080.
// Reruns skip outputs newer than their source (mtime).
//
// Usage: node scripts/optimize-media.mjs   (needs sharp and /usr/bin/ffmpeg or ffmpeg on PATH)
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { siteFiles } from './repoint-media.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = existsSync('/usr/bin/ffmpeg') ? '/usr/bin/ffmpeg' : 'ffmpeg';
const FFPROBE = existsSync('/usr/bin/ffprobe') ? '/usr/bin/ffprobe' : 'ffprobe';
const IMAGE = { maxWidth: 1600, quality: 78 };
// crf is the starting quality; if an encode is over its size cap (plan Global Constraints: hero 1080p <= 3 MB,
// 720p <= 1.5 MB) the crf is raised one step at a time until it fits.
const VIDEO = [
  { height: 1080, crf: 28, maxBytes: 3 * 1048576 },
  { height: 720, crf: 30, maxBytes: 1.5 * 1048576 },
];
const MAX_CRF = 40;

// Every ref to Images/ or assets/ media in the site's own files (not refs already under media/).
const REF = /(?<![\w/.%-])\.?\/((?:Images|assets)\/[^"'()`<>\n]*?\.(?:png|jpe?g|webp|gif|mp4))(?![\w.%-])/gi;
export const scanRefs = () => {
  const refs = new Set();
  for (const file of siteFiles(root)) {
    for (const m of readFileSync(file, 'utf8').matchAll(REF)) refs.add(decodeURIComponent(m[1]));
  }
  return [...refs].sort();
};

const fresh = (out, src) => existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs;
const kb = (p) => `${Math.round(statSync(p).size / 1024)} KB`;

const webp = (input) => sharp(input).rotate() // bake EXIF orientation (metadata is stripped otherwise)
  .resize({ width: IMAGE.maxWidth, withoutEnlargement: true })
  .keepIccProfile() // keep the source colour profile (iPhone PNGs are Display P3) so colours match the originals
  .webp({ quality: IMAGE.quality, effort: 6 });

const probe = (src) => {
  const out = execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,height', '-of', 'json', src]);
  const streams = JSON.parse(out).streams;
  return { height: streams.find((s) => s.codec_type === 'video')?.height || 0, audio: streams.some((s) => s.codec_type === 'audio') };
};

const encodeVideo = (src, out, { height, crf }, audio) => {
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', src,
    '-vf', `scale=-2:${height}`, '-c:v', 'libx264', '-crf', String(crf), '-preset', 'slow', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', ...(audio ? ['-c:a', 'aac', '-b:a', '96k'] : ['-an']), out]);
};

const main = async () => {
  const manifest = {};
  const refs = scanRefs();
  const outputs = new Map();
  const claim = (out, ref) => {
    if (outputs.has(out) && outputs.get(out) !== ref) throw new Error(`Output collision: ${out} <- ${outputs.get(out)} and ${ref}`);
    outputs.set(out, ref);
  };

  for (const rel of refs.filter((r) => !/\.mp4$/i.test(r))) {
    const src = join(root, rel);
    if (!existsSync(src)) { console.warn(`missing source, skipped: ${rel}`); continue; }
    const outRel = posix.join('media', rel.replace(/\.[^./]+$/, '.webp'));
    claim(outRel, rel);
    const out = join(root, outRel);
    if (!fresh(out, src)) {
      mkdirSync(dirname(out), { recursive: true });
      await webp(src).toFile(out);
      console.log(`image ${rel} -> ${outRel} (${kb(src)} -> ${kb(out)})`);
    }
    manifest[`/${rel}`] = `/${outRel}`;
  }

  const videoRefs = refs.filter((r) => /\.mp4$/i.test(r));
  const names = [...new Set(videoRefs.map((r) => posix.basename(r).replace(/\.mp4$/i, '').replace(/-4k$/i, '')))];
  for (const name of names) {
    const dir = posix.dirname(videoRefs.find((r) => posix.basename(r).replace(/\.mp4$/i, '').replace(/-4k$/i, '') === name));
    const master = [`${dir}/${name}-4k.mp4`, `${dir}/${name}.mp4`].find((r) => existsSync(join(root, r)));
    if (!master) { console.warn(`missing video source, skipped: ${name}`); continue; }
    const src = join(root, master);
    const info = probe(src);
    const made = [];
    for (const variant of VIDEO) {
      if (variant.height > info.height) continue; // never upscale
      const outRel = `media/video/${name}-${variant.height}.mp4`;
      claim(outRel, master);
      const out = join(root, outRel);
      if (!fresh(out, src)) {
        mkdirSync(dirname(out), { recursive: true });
        let crf = variant.crf;
        encodeVideo(src, out, { ...variant, crf }, info.audio);
        while (statSync(out).size > variant.maxBytes && crf < MAX_CRF) {
          crf += 1;
          encodeVideo(src, out, { ...variant, crf }, info.audio);
        }
        if (statSync(out).size > variant.maxBytes) throw new Error(`${outRel} is over ${variant.maxBytes} bytes even at crf ${crf}`);
        console.log(`video ${master} -> ${outRel} crf ${crf} (${kb(src)} -> ${kb(out)})`);
      }
      made.push(outRel);
    }
    const posterRel = `media/posters/${name}.webp`;
    claim(posterRel, master);
    const poster = join(root, posterRel);
    if (!fresh(poster, src)) {
      mkdirSync(dirname(poster), { recursive: true });
      const frame = execFileSync(FFMPEG, ['-loglevel', 'error', '-i', src, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 256 * 1024 * 1024 });
      await webp(frame).toFile(poster);
      console.log(`poster ${master} -> ${posterRel} (${kb(poster)})`);
    }
    if (!made.length) throw new Error(`No variant for ${master} (height ${info.height})`);
    // The -4k ref (desktop source) gets the largest variant. When a -4k sibling exists, the plain ref is the
    // small-screen default and gets the smallest; otherwise the plain ref gets the largest.
    const hasMaster4k = master.endsWith('-4k.mp4');
    for (const ref of videoRefs) {
      const base = posix.basename(ref).replace(/\.mp4$/i, '');
      if (base === `${name}-4k`) manifest[`/${ref}`] = `/${made[0]}`;
      else if (base === name) manifest[`/${ref}`] = `/${hasMaster4k ? made[made.length - 1] : made[0]}`;
    }
  }

  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(join(root, 'media', 'manifest.json'), `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`media/manifest.json: ${Object.keys(sorted).length} refs`);
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch((error) => { console.error(error); process.exit(1); });
