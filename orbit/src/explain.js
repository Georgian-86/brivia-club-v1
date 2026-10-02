// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import { distanceBand } from './rings.js';
import { loadConfig } from './config.js';

const label = (h) => h.mine.label ?? h.mine.id;
const best = (hits) => hits.slice().sort((a, b) => b.score - a.score)[0];
// R13: rare and teach/learn chips cite only an interest both members hold (never a related one).
const same = (h) => h.mine.id === h.theirs.id;

/** Up to 3 evidence-only chips (spec §6.3), strongest first: worth-the-distance, rare, teach/learn, nearby. */
export function explain(scored, cfg = loadConfig()) {
  const { hits = [], ring, km, coPresence, worthTheDistance, R } = scored;
  const x = cfg.explain;
  const chips = [];
  if (worthTheDistance) chips.push(`Worth the distance: ${Math.round(100 * R)}% resonance`);
  const rare = best(hits.filter((h) => same(h) && h.rarity >= x.rareMinRarity && h.mine.points >= x.rareMinPoints && h.theirs.points >= x.rareMinPoints));
  if (rare) chips.push(`Both deep into ${label(rare)}, rare nearby`);
  const teach = best(hits.filter((h) => same(h) && h.mine.mode === 'teach' && h.theirs.mode === 'learn'));
  if (teach) chips.push(`You teach ${label(teach)}, they want to learn it`);
  const learn = best(hits.filter((h) => same(h) && h.mine.mode === 'learn' && h.theirs.mode === 'teach'));
  if (learn) chips.push(`They teach ${label(learn)}, you want to learn it`);
  if (ring <= x.coPresenceChipMaxRing && coPresence > 0) chips.push(`${distanceBand(km, ring, undefined, cfg)} away, free at the same times`);
  return chips.slice(0, x.maxChips);
}
