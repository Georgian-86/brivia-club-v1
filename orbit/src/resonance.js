// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import { topo } from './topology.js';

const modeOf = (x) => x?.mode ?? 'play';

/** Passion Budget (spec §3.2): weights summing to 1; empty Map if total is 0. */
export function passionWeights(interests) {
  let total = 0;
  for (const i of interests ?? []) if (i.points > 0) total += i.points;
  const w = new Map();
  if (!(total > 0)) return w;
  for (const i of interests) if (i.points > 0) w.set(i.id, (w.get(i.id) ?? 0) + i.points / total);
  return w;
}

/** Local rarity (spec §3.3), in [floor, floor+span]. */
export function rarity(n, N, cfg) {
  const { floor, span } = cfg.rarity;
  if (!(N > 0)) return floor + span;
  return floor + (span * Math.log(1 + N / (1 + n))) / Math.log(1 + N);
}

/** Semantic gap-filler scale (spec §3.6). */
export function semScale(cos) {
  return Math.min(1, Math.max(0, (cos - 0.1) / 0.55));
}

const squash = (x, cfg) => 1 - Math.exp(-cfg.squashK * x);

/** R(A→B) (spec §3.5), with per-interest hits. */
export function directedResonance(a, b, ctx) {
  const { topology, rarityOf, cfg } = ctx;
  const pA = passionWeights(a?.interests);
  const pB = passionWeights(b?.interests);
  const hits = [];
  if (pA.size === 0 || pB.size === 0) return { value: 0, hits };
  let maxB = 0;
  for (const v of pB.values()) if (v > maxB) maxB = v;
  const sqrtMax = Math.sqrt(maxB);
  const aInts = a.interests.filter((i) => i.points > 0);
  const bInts = b.interests.filter((j) => j.points > 0);
  let value = 0;
  for (const i of aInts) {
    const rar = rarityOf(i.id);
    let best = null;
    let bestTerm = 0;
    for (const j of bInts) {
      const t = topo(topology, i.id, j.id, cfg);
      if (t <= 0) continue;
      const m = cfg.mode[modeOf(i)]?.[modeOf(j)] ?? cfg.mode.play.play;
      const term = t * m * rar * (Math.sqrt(pB.get(j.id)) / sqrtMax);
      if (term > bestTerm) {
        bestTerm = term;
        best = { j, t };
      }
    }
    if (best) {
      const score = pA.get(i.id) * bestTerm;
      value += score;
      hits.push({
        mine: { id: i.id, points: i.points, mode: modeOf(i) },
        theirs: { id: best.j.id, points: best.j.points, mode: modeOf(best.j) },
        topo: best.t,
        rarity: rar,
        score,
      });
    }
  }
  return { value, hits };
}

/** Mutual resonance (spec §3.5–3.6). hits are the A→B direction. */
export function resonance(a, b, ctx) {
  const ab = directedResonance(a, b, ctx);
  const ba = directedResonance(b, a, ctx);
  const Rstruct = ab.value > 0 && ba.value > 0 ? (2 * ab.value * ba.value) / (ab.value + ba.value) : 0;
  const { cfg, aboutCos } = ctx;
  let R = squash(Rstruct, cfg);
  if (aboutCos != null) {
    R = (1 - cfg.semanticShare) * R + cfg.semanticShare * semScale(aboutCos);
  }
  return { R, Rstruct, hits: ab.hits };
}
