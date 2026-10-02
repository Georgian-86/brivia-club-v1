// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import { readFileSync } from 'node:fs';

export const DEFAULTS = {
  topo: { same: 1, parentChild: 0.85, sibling: 0.55, domain: 0.2 },
  mode: {
    learn: { learn: 0.8, play: 0.9, teach: 1.15, build: 0.9 },
    play: { learn: 0.9, play: 1.0, teach: 0.95, build: 0.9 },
    teach: { learn: 1.15, play: 0.95, teach: 0.75, build: 0.9 },
    build: { learn: 0.9, play: 0.9, teach: 0.9, build: 1.1 },
  },
  budget: 20,
  maxInterests: 12,
  rarity: { floor: 0.35, span: 0.65 },
  semanticShare: 0.25,
  // semScale(cos) = clamp((cos − cosFloor) / cosSpan, 0, 1)   (spec §3.6)
  semantic: { cosFloor: 0.1, cosSpan: 0.55 },
  squashK: 3,
  rings: [3, 15, 60, 350, 2500, Infinity],
  phi: [1, 0.92, 0.8, 0.62, 0.48, 0.38],
  theta: [0.15, 0.25, 0.40, 0.62, 0.74, 0.82],
  alpha: [0, 0, 0.12, 0.18, 0.18, 0.15],
  lTarget: 40,
  thetaFar: 0.86,
  wtdMinRing: 3, // Worth-the-Distance lane starts at this ring (spec §5.3)
  gamma: 1.3,
  // Orbit score factors (spec §6.1): C = coPresenceBase + coPresenceSpan · jaccard for rings ≤ coPresenceMaxRing,
  // B = behaviourBase + behaviourSpan · mean(activity, reciprocity), T clipped to [tasteMin, tasteMax].
  score: { coPresenceBase: 0.85, coPresenceSpan: 0.15, coPresenceMaxRing: 2, behaviourBase: 0.8, behaviourSpan: 0.2, tasteMin: 0.75, tasteMax: 1.3 },
  // localMaxRing: rings counted as local for the local-share floor; exploreTailFactor: exploration draws from the
  // next exploreTailFactor · deckSize ranked candidates outside the deck.
  deck: { base: 12, min: 8, hFloor: 0.4, wtdSlots: [3, 8], wtdMax: 2, localShare: 0.7, mmrLambda: 0.8, epsilon: 0.15, localMaxRing: 2, exploreTailFactor: 4 },
  // Chips (spec §6.3): rare chip needs rarity ≥ rareMinRarity and both ≥ rareMinPoints; the nearby/co-presence chip
  // shows only for rings ≤ coPresenceChipMaxRing.
  explain: { rareMinRarity: 0.7, rareMinPoints: 4, coPresenceChipMaxRing: 1, maxChips: 3 },
  roche: {
    kChoices: [2, 3, 5, 8], kDefault: 5, likeWeight: 0.5, orbitWeight: 1,
    eFloor: 0.35, eSpan: 0.65, eExp: 0.7, likeTtlDays: 10, orbitIdleDays: 21,
    metPerWeek: 3, minLikerAgeDays: 3, gamingMinInbound: 20, gamingLikeBack: 0.10,
  },
  h3Res: 7,
};

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function merge(base, over) {
  if (!isPlain(over)) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isPlain(v) && isPlain(base[k]) ? merge(base[k], v) : v;
  }
  return out;
}

function deepFreeze(o) {
  if (o !== null && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
}

const clone = (o) => (Array.isArray(o) ? o.map(clone) : isPlain(o) ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clone(v)])) : o);

export function loadConfig(overrides = {}) {
  let cfg = clone(DEFAULTS);
  const path = process.env.ORBIT_CONFIG_PATH;
  if (path) cfg = merge(cfg, JSON.parse(readFileSync(path, 'utf8')));
  return deepFreeze(clone(merge(cfg, overrides)));
}
