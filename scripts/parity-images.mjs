// Image readiness for the visual-parity guard. Lazy images (loading="lazy") only start when scrolled near, so
// whether they were decoded before a shot was a race. Make them eager, then require every <img> to finish
// loading without error and be decoded. Always settles within `timeoutMs`; throws naming the offending srcs.
export async function imagesReady(page, timeoutMs = 15000) {
  const run = page.evaluate(async (limit) => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
    const deadline = Date.now() + limit;
    const left = () => Math.max(0, deadline - Date.now());
    const src = (i) => i.currentSrc || i.src;
    while (Date.now() < deadline && ![...document.images].every((i) => i.complete)) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await Promise.race([
      Promise.all([...document.images].filter((i) => i.complete).map((i) => i.decode().catch(() => {}))),
      new Promise((r) => setTimeout(r, left())),
    ]);
    return {
      pending: [...document.images].filter((i) => !i.complete).map(src),
      // complete but no pixels: a 404/corrupt image (complete is true for failed loads too)
      broken: [...document.images].filter((i) => i.complete && src(i) && i.naturalWidth === 0).map(src),
    };
  }, timeoutMs);
  let timer;
  const guard = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`images never finished loading: page unresponsive after ${timeoutMs + 5000} ms`)), timeoutMs + 5000); });
  let res;
  try { res = await Promise.race([run, guard]); } finally { clearTimeout(timer); }
  if (res.pending.length) throw new Error(`images never finished loading: ${res.pending.join(', ')}`);
  if (res.broken.length) throw new Error(`broken images (no pixels): ${res.broken.join(', ')}`);
}
