// The landing's music is the hero video's own soundtrack (founder, 2026-10-25, D-092): the original
// source-media/Images/Videos/HEROSECTIONVI.MOV carries it (the 4K master and the shipped hero videos are silent).
// One AAC file every browser decodes (Safari included), 128 kb/s stereo, no video. script.js loops it with a crossfade.
// Usage: npm run media:heroaudio   (needs ffmpeg)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'source-media', 'Images', 'Videos', 'HEROSECTIONVI.MOV');
const out = join(root, 'site', 'media', 'audio', 'hero-soundtrack.m4a');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vn', '-map_metadata', '-1', '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
  '-movflags', '+faststart', out], { stdio: 'inherit' });
console.log(`${out.slice(root.length + 1)} (${Math.round(statSync(out).size / 1024)} KB)`);
