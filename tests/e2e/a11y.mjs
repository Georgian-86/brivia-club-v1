// Shared accessibility helpers for the e2e specs (Iteration 4, Task 10, R11). Not a spec: it has no runner.
// axe-core is NOT a repo dependency: install it outside the repo (tests/e2e/README.md). AXE_PATH overrides the path.
import { readFileSync } from 'node:fs';

const AXE_PATH = process.env.AXE_PATH || '/tmp/pw/node_modules/axe-core/axe.min.js';
let axeSource = '';
const loadAxe = () => { if (!axeSource) axeSource = readFileSync(AXE_PATH, 'utf8'); return axeSource; };

export const injectAxe = async (page) => {
  if (await page.evaluate(() => typeof window.axe !== 'undefined')) return;
  await page.addScriptTag({ content: loadAxe() });
};

// Runs axe on the page (or a region) and returns the violations as short strings. rules: ['color-contrast'] runs only
// that rule; omit it for axe's full default rule set.
// decorative: CSS selectors of purely decorative overlays (a shimmer gradient in a ::before, say) hidden only while axe
// runs, because axe cannot compute a background under a pseudo-element and would report the text as "incomplete".
// Real text and controls are never listed here.
export const axeViolations = async (page, { rules, include, decorative = [] } = {}) => {
  await injectAxe(page);
  const { violations, incomplete } = await page.evaluate(async ({ rules, include, decorative }) => {
    const hide = document.createElement('style');
    hide.textContent = decorative.map((sel) => `${sel}{display:none!important}`).join('\n');
    document.head.append(hide);
    const options = rules ? { runOnly: { type: 'rule', values: rules } } : {};
    const result = await window.axe.run(include ? { include: [[include]] } : document, options);
    const short = (list) => list.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} [${(n.any[0]?.message || n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 140)}]`).join(' ; ')}`);
    hide.remove();
    return { violations: short(result.violations), incomplete: short(result.incomplete) };
  }, { rules, include, decorative });
  if (process.env.A11Y_DEBUG && incomplete.length) console.error('AXE incomplete (axe could not decide):', incomplete.join('\n  ').slice(0, 2500));
  return violations;
};

// Visible text nodes in a region (default: the whole body) whose computed font-size is below minPx. Hidden,
// zero-size, clipped (visually-hidden) and aria-hidden elements are skipped.
export const smallText = async (page, { root = 'body', minPx = 12 } = {}) => page.evaluate(({ root, minPx }) => {
  const base = document.querySelector(root);
  if (!base) return [`no element for ${root}`];
  const small = [];
  const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT);
  const one = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`;
  // The element and up to two ancestors, so a failure names the rule to fix.
  const label = (el) => [el.parentElement?.parentElement, el.parentElement, el].filter((e) => e && e !== document.body && e !== document.documentElement).map(one).join(' > ');
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!el || el.closest('script,style,noscript,[hidden],[aria-hidden="true"]')) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) continue;
    let hiddenByAncestor = false;
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden') { hiddenByAncestor = true; break; }
    }
    if (hiddenByAncestor) continue;
    const size = parseFloat(style.fontSize);
    // font-size: 0 is how the theme hides a text node whose visible copy is drawn by ::before/::after (checked below).
    if (size > 0 && size < minPx) small.push(`${label(el)} ${size}px "${node.textContent.trim().slice(0, 30)}"`);
  }
  // Text drawn by ::before / ::after (content: 'PASS', a glyph) counts too, once its element is visible.
  for (const el of [base, ...base.querySelectorAll('*')]) {
    if (el.closest('script,style,noscript,[hidden],[aria-hidden="true"]')) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) continue;
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      const content = ps.content;
      if (!content || content === 'none' || content === 'normal' || content === '""' || content === "''") continue;
      if (/^(url|counter|attr)\(/.test(content) || ps.display === 'none') continue;
      const text = content.replace(/^["']|["']$/g, '');
      if (!text.trim()) continue;
      const size = parseFloat(ps.fontSize);
      if (size < minPx) small.push(`${label(el)}${pseudo} ${size}px "${text.slice(0, 30)}"`);
    }
  }
  return small;
}, { root, minPx });

// Worst-case contrast of an element's text against what is actually painted behind it (a photo, a gradient), which axe
// reports as "incomplete". The text is made transparent, the element's box is screenshotted, and the text colour is
// compared with every pixel: the result is the lowest ratio found (so it is a guarantee for every pixel behind the box,
// not an average). Returns { ratio, large, required, color } where required is 3 for large text and 4.5 otherwise.
export const photoContrast = async (page, selector) => {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  const info = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { color: st.color, size: parseFloat(st.fontSize), weight: Number(st.fontWeight), rect: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, window.innerWidth - Math.max(0, r.x)), height: r.height } };
  }, selector);
  // The photo must really be painted: load every background image on the element and its ancestors and wait (bounded) for
  // it to decode, so the check cannot pass against a fallback gradient while the image is still loading.
  const images = await page.evaluate(async (sel) => {
    const urls = [];
    for (let el = document.querySelector(sel); el; el = el.parentElement) {
      for (const m of getComputedStyle(el).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.push(m[1]);
    }
    const loaded = await Promise.all(urls.map((u) => { const img = new Image(); img.src = u; return Promise.race([img.decode().then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 8000))]); }));
    return { urls: urls.length, loaded: loaded.filter(Boolean).length };
  }, selector);
  await page.waitForTimeout(150);
  // Hide the text of the nearest block ancestor, not only the element: an inline element that wraps has a box that also
  // covers its siblings' text, and that text must not be measured as "background".
  await page.evaluate((sel) => { let el = document.querySelector(sel); while (el.parentElement && getComputedStyle(el).display.startsWith('inline')) el = el.parentElement; el.setAttribute('data-a11y-probe', ''); }, selector);
  if (!(await page.evaluate(() => Boolean(document.getElementById('a11y-probe-style'))))) await page.addStyleTag({ content: '[data-a11y-probe],[data-a11y-probe] *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}' }).then((h) => h.evaluate((n) => { n.id = 'a11y-probe-style'; }));
  const png = await page.screenshot({ clip: info.rect });
  if (process.env.A11Y_DEBUG_DIR) (await import('node:fs')).writeFileSync(`${process.env.A11Y_DEBUG_DIR}/${selector.replace(/\W+/g, '_')}-${info.rect.width | 0}x${info.rect.height | 0}.png`, png);
  await page.evaluate(() => document.querySelectorAll('[data-a11y-probe]').forEach((e) => e.removeAttribute('data-a11y-probe')));
  const ratio = await page.evaluate(async ({ b64, color }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const lum = (r, g, b) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const [tr, tg, tb] = color.match(/[\d.]+/g).map(Number);
    const lt = lum(tr, tg, tb);
    let worst = Infinity;
    for (let i = 0; i < data.length; i += 4) {
      const lb = lum(data[i], data[i + 1], data[i + 2]);
      const ratio = (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05);
      if (ratio < worst) worst = ratio;
    }
    return worst;
  }, { b64: png.toString('base64'), color: info.color });
  const large = info.size >= 24 || (info.size >= 18.66 && info.weight >= 700);
  const alpha = info.color.match(/[\d.]+/g).length > 3 ? Number(info.color.match(/[\d.]+/g)[3]) : 1;
  return { ratio: Math.round(ratio * 100) / 100, large, required: large ? 3 : 4.5, color: info.color, alpha, images };
};
