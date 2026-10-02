// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
import { distanceKm, ringOf, distanceBand } from './rings.js';
import { resonance, passionWeights } from './resonance.js';
import { isEligible, isWorthTheDistance } from './gate.js';
import { exposure, deckSize } from './roche.js';
import { mmrPick, seededFloat } from './diversity.js';
import { explain } from './explain.js';

export { explain };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const finiteOr = (x, d) => (Number.isFinite(x) ? x : d);

function jaccard(a = [], b = []) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * G = R^gamma · phi(ring) · C · B · T · E   (spec §6.1)
 * behaviour = {activity?, reciprocity?} (B = 1 if neither present); coPresence is the raw
 * Jaccard (C applied for rings <= 2 only); taste is clipped to [0.75, 1.3]; exposure is E.
 * R12: non-finite taste → 1; non-finite activity/reciprocity are treated as absent.
 */
export function orbitScore({ R, ring, coPresence = 0, behaviour = {}, taste = 1, exposure: E }, cfg) {
  const C = ring <= 2 ? 0.85 + 0.15 * coPresence : 1;
  const vals = [behaviour?.activity, behaviour?.reciprocity].filter(Number.isFinite);
  const B = vals.length ? 0.8 + 0.2 * (vals.reduce((s, v) => s + v, 0) / vals.length) : 1;
  const T = clamp(finiteOr(taste, 1), 0.75, 1.3);
  return Math.pow(R, cfg.gamma) * cfg.phi[ring] * C * B * T * E;
}

/**
 * Gate + saturation filter + score + stable sort by G desc. ctx = {topology, rarityOf, cfg, L, includeSaturated?, labelOf?(id)}
 * R12: a non-finite ctx.L is treated as 0; a non-finite candidate headroom as 1.
 */
export function rankCandidates(viewer, candidates, ctx) {
  const { cfg } = ctx;
  const L = finiteOr(ctx.L, 0);
  const out = [];
  for (const c of candidates) {
    if (c.headroom === 0 && !ctx.includeSaturated) continue;
    const km = distanceKm(viewer.cell, c.cell);
    const ring = ringOf(km, cfg);
    const { R, hits } = resonance(viewer.member, c.member, { ...ctx, aboutCos: c.aboutCos });
    if (!isEligible(R, ring, L, cfg)) continue;
    const coPresence = jaccard(viewer.availability, c.availability);
    const G = orbitScore({
      R, ring, coPresence, behaviour: { activity: c.activity, reciprocity: c.reciprocity },
      taste: c.taste, exposure: exposure(finiteOr(c.headroom, 1), cfg),
    }, cfg);
    const lab = (x) => ({ ...x, label: ctx.labelOf?.(x.id) ?? x.id });
    const labelled = hits.map((h) => ({ ...h, mine: lab(h.mine), theirs: lab(h.theirs) }));
    out.push({ candidate: c, R, ring, km, G, hits: labelled, coPresence, worthTheDistance: isWorthTheDistance(R, ring, cfg) });
  }
  return out.map((s, i) => [s, i]).sort((a, b) => b[0].G - a[0].G || a[1] - b[1]).map(([s]) => s);
}

/**
 * Deck (spec §6.2): size by viewer headroom; WtD lane at fixed slots; rest by MMR with a
 * local-share floor; then a deterministic epsilon exploration swap. Pure in (inputs, seed).
 * R12: a row whose G is not finite is dropped (never emitted, never breaks MMR); hViewer
 * non-finite → 1 (in deckSize). The returned deck never contains undefined.
 */
export function composeDeck(viewer, scored, { hViewer, seed } = {}, cfg) {
  const d = cfg.deck;
  const pool = scored.filter((s) => s && s.candidate && s.candidate.headroom !== 0 && Number.isFinite(s.G));
  const byG = (a, b) => b.G - a.G;
  const wtdAll = pool.filter((s) => s.worthTheDistance).sort(byG).slice(0, d.wtdMax);
  const usable = pool.filter((s) => !s.worthTheDistance).length + wtdAll.length;
  const n = Math.min(deckSize(hViewer, cfg), usable);
  if (n === 0) return [];
  const placed = new Map();
  const spill = [];
  wtdAll.forEach((s, i) => (d.wtdSlots[i] < n ? placed.set(d.wtdSlots[i], s) : spill.push(s)));
  const taken = new Set([...placed.values()]);
  const others = [...pool.filter((s) => !s.worthTheDistance), ...spill];
  const m = n - placed.size;
  const nonWtd = others.filter((s) => !s.worthTheDistance);
  const nLocal = nonWtd.filter((s) => s.ring <= 2).length;
  const needLocal = Math.min(Math.ceil(d.localShare * Math.min(m, nonWtd.length)), nLocal);
  const items = others.sort(byG).map((s) => ({
    item: s, g: s.G, vec: passionWeights(s.candidate.member.interests), local: s.ring <= 2,
  }));
  const fill = mmrPick(items, m, d.mmrLambda, needLocal).map((x) => x.item);

  const deck = [];
  let f = 0;
  for (let i = 0; i < n; i++) deck.push(placed.has(i) ? placed.get(i) : fill[f++]);

  // epsilon exploration: swap one non-WtD card for a lower-ranked one
  if (seededFloat(seed, 'eps') <= d.epsilon) {
    const inDeck = new Set(deck);
    const rank = pool.slice().sort(byG);
    const tail = rank.filter((s) => !inDeck.has(s) && !s.worthTheDistance && !taken.has(s)).slice(0, n * 4);
    if (tail.length) {
      const wild = tail[Math.floor(seededFloat(seed, 'pick') * tail.length)];
      const localCount = deck.filter((s) => s.ring <= 2).length;
      const slots = [];
      for (let i = 1; i < n; i++) {
        if (placed.has(i)) continue;
        const after = localCount - (deck[i].ring <= 2 ? 1 : 0) + (wild.ring <= 2 ? 1 : 0);
        if (after >= Math.min(needLocal, localCount)) slots.push(i);
      }
      if (slots.length) deck[slots[Math.floor(seededFloat(seed, 'slot') * slots.length)]] = { ...wild, explore: true };
    }
  }
  return deck.filter(Boolean);
}

/** Whitelisted, privacy-safe card. Built field by field; G is never exposed. */
export function toCard(scored) {
  const m = scored.candidate.member;
  return {
    id: m.id,
    name: m.name,
    photoUrl: m.photoUrl,
    distanceBand: distanceBand(scored.km, scored.ring, scored.candidate.placeLabel),
    matchPercent: Math.round(100 * scored.R),
    chips: explain(scored),
    worthTheDistance: scored.worthTheDistance,
  };
}
