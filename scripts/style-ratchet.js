// Style ratchet (Phase C): pure counting and comparison of "style debt" (raw hex colours, raw font-family
// declarations) per CSS file. Debt may only go down. No fs, no DOM.
const stripComments = (css) => String(css).replace(/\/\*[\s\S]*?\*\//g, '');

export function countStyleDebt(cssText) {
  const css = stripComments(cssText);
  // #rgb, #rgba, #rrggbb, #rrggbbaa; the lookahead keeps ids like #abcde or #hero-1 from counting.
  const hex = (css.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g) || []).length;
  let fontFamily = 0;
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]*)/gi)) {
    const v = m[1].trim().replace(/\s*!important$/i, '');
    if (/^(var\([^)]*\)|inherit)$/i.test(v)) continue;
    fontFamily++;
  }
  return { hex, fontFamily };
}

const KINDS = ['hex', 'fontFamily'];

export function compareToBaseline(current, baseline) {
  const increases = [];
  for (const file of Object.keys(current).sort()) {
    const base = baseline[file] || {};
    for (const kind of KINDS) {
      const from = base[kind] || 0;
      const to = current[file][kind] || 0;
      if (to > from) increases.push({ file, kind, from, to });
    }
  }
  return { ok: increases.length === 0, increases };
}
