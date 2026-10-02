// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import { distanceBand } from './rings.js';

const label = (h) => h.mine.label ?? h.mine.id;
const best = (hits) => hits.slice().sort((a, b) => b.score - a.score)[0];

/** Up to 3 evidence-only chips (spec §6.3), strongest first: worth-the-distance, rare, teach/learn, nearby. */
export function explain(scored) {
  const { hits = [], ring, km, coPresence, worthTheDistance, R } = scored;
  const chips = [];
  if (worthTheDistance) chips.push(`Worth the distance: ${Math.round(100 * R)}% resonance`);
  const rare = best(hits.filter((h) => h.rarity >= 0.7 && h.mine.points >= 4 && h.theirs.points >= 4));
  if (rare) chips.push(`Both deep into ${label(rare)}, rare nearby`);
  const teach = best(hits.filter((h) => h.mine.mode === 'teach' && h.theirs.mode === 'learn'));
  if (teach) chips.push(`You teach ${label(teach)}, they want to learn it`);
  const learn = best(hits.filter((h) => h.mine.mode === 'learn' && h.theirs.mode === 'teach'));
  if (learn) chips.push(`They teach ${label(learn)}, you want to learn it`);
  if (ring <= 1 && coPresence > 0) chips.push(`${distanceBand(km, ring)} away, free at the same times`);
  return chips.slice(0, 3);
}
