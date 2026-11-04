# D-174: rebuilds site/media/assets/brivia-wordmark-gold.webp from source-media/assets/brivia-wordmark-original.png.
# The whole wordmark ("the Brivia CLUB") in metallic gold; the tagline is left out.
# Run from the repo root: pip install pillow numpy && python3 scripts/build-wordmark-gold.py
from PIL import Image
import numpy as np
im = np.asarray(Image.open('source-media/assets/brivia-wordmark-original.png').convert('RGB')).astype(float)
bg = np.array([255, 254, 250.])
cov = np.clip(np.abs(im - bg).sum(2) / np.abs(np.array([40, 30, 30]) - bg).sum(), 0, 1)
cov[1300:] = 0                     # drop the "Swipe. Match. Build" line below the wordmark
H, W = cov.shape
ys, xs = np.where(cov > 0.3); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
yy, xx = np.mgrid[0:H, 0:W]
t = np.clip(((yy - y0) / (y1 - y0)) * 0.85 + ((xx - x0) / (x1 - x0)) * 0.15, 0, 1)
stops = [(0, (246, 224, 150)), (.38, (214, 172, 82)), (.55, (160, 116, 40)), (.72, (222, 184, 96)), (1, (250, 232, 166))]
G = np.zeros((H, W, 3))
for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
    mk = (t >= t0) & (t <= t1); f = ((t - t0) / (t1 - t0))[mk][:, None]
    G[mk] = np.array(c0) + (np.array(c1) - np.array(c0)) * f
img = Image.fromarray(np.dstack([G, cov * 255]).astype('uint8'), 'RGBA')
bb = img.getbbox(); img = img.crop((bb[0] - 6, bb[1] - 6, bb[2] + 6, bb[3] + 6))
img = img.resize((560, round(560 * img.height / img.width)), Image.LANCZOS)
img.save('site/media/assets/brivia-wordmark-gold.webp', 'WEBP', quality=88, method=6)
print(img.size)
