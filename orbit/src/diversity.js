// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import { createHash } from 'node:crypto';

/** Deterministic float in [0,1) from md5 of the parts (engine v1 seededFloat); divides by 2**32 so it is never 1.0. */
export function seededFloat(...parts) {
  return createHash('md5').update(parts.join('|')).digest().readUInt32BE(0) / 2 ** 32;
}

/** Cosine of two sparse weight Maps; 0 if either is empty. */
export function cosine(a, b) {
  if (!a?.size || !b?.size) return 0;
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of a) { na += v * v; if (b.has(k)) dot += v * b.get(k); }
  for (const v of b.values()) nb += v * v;
  return dot / Math.sqrt(na * nb);
}

/**
 * Greedy max-marginal-relevance (ported from engine v1 diversify()).
 * items: [{item, g, vec, local}] in rank order. Picks `limit` items; if `needLocal`
 * is positive, forces local items whenever the remaining slots would otherwise
 * be unable to reach it. Returns the picked items in pick order.
 */
export function mmrPick(items, limit, lambda, needLocal = 0) {
  const rest = [...items];
  const picked = [];
  const gOf = (x) => (Number.isFinite(x.g) ? x.g : 0); // R12: a bad score never makes the pick fail
  const maxG = Math.max(1e-12, ...rest.map(gOf));
  let localPicked = 0;
  while (picked.length < limit && rest.length) {
    const forceLocal = needLocal - localPicked >= limit - picked.length;
    let bestIdx = -1, bestVal = -Infinity;
    for (let i = 0; i < rest.length; i++) {
      if (forceLocal && !rest[i].local) continue;
      let maxSim = 0;
      for (const p of picked) maxSim = Math.max(maxSim, cosine(rest[i].vec, p.vec));
      const val = lambda * (gOf(rest[i]) / maxG) - (1 - lambda) * maxSim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    if (bestIdx < 0) break;
    const [p] = rest.splice(bestIdx, 1);
    if (p.local) localPicked++;
    picked.push(p);
  }
  return picked;
}
