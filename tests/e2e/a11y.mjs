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
