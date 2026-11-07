#!/usr/bin/env python3
# Bakes the landing soundtrack into one seamless loop for the media-element path (D-223, Safari).
# Usage: ffmpeg -i site/media/audio/hero-soundtrack.m4a -ar 44100 -ac 2 track.wav
#        python3 scripts/bake-soundtrack-loop.py track.wav loop.wav 0.6
#        ffmpeg -i loop.wav -c:a aac -b:a 160k -movflags +faststart site/media/audio/hero-soundtrack-loop.m4a
import sys, wave, numpy as np
# Mirrors playMusicPass: passes of the track overlap by 2 s, the next fading in as the last fades out (equal-power). One period of that stream (length D - 2) loops seamlessly.
w = wave.open(sys.argv[1]); rate = w.getframerate(); ch = w.getnchannels()
x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, ch).astype(np.float64) / 32768
n = len(x); fade = 2 * rate; L = n - fade
t = np.arange(fade) / fade
up = np.sin(t * np.pi / 2)[:, None]    # equal-power: no dip in loudness at the seam
down = np.cos(t * np.pi / 2)[:, None]
loop = x[:L].copy()
loop[:fade] *= up
loop[:fade] += x[L:] * down
loop *= float(sys.argv[3])
peak = np.abs(loop).max(); print('peak', peak, 'frames', L, 'seconds', L / rate)
out = wave.open(sys.argv[2], 'wb'); out.setnchannels(ch); out.setsampwidth(2); out.setframerate(rate)
out.writeframes((np.clip(loop, -1, 1) * 32767).astype(np.int16).tobytes()); out.close()
