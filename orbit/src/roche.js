// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
// The Roche Limit (spec §6.4): receiver-declared capacity. Pure functions; `now` is always passed in.

const DAY_MS = 86400000;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const ms = (t) => (t instanceof Date ? t.getTime() : t);

/** load_u = Σ likeWeight·q_l (each liker once) + orbitWeight · openOrbits. */
export function qualifiedLoad({ inbound = [], openOrbits = 0 }, cfg) {
  const r = cfg.roche;
  const seen = new Set();
  let likes = 0;
  for (const l of inbound) {
    if (seen.has(l.likerId)) continue;
    const q = l.clearsGate && l.likerAgeDays >= r.minLikerAgeDays && l.ageDays <= r.likeTtlDays;
    if (q) { seen.add(l.likerId); likes += r.likeWeight; }
  }
  return likes + r.orbitWeight * openOrbits;
}

/** h = clamp(1 − load / (2K), 0, 1) */
export function headroom(load, K, cfg) {
  void cfg;
  return clamp(1 - load / (2 * K), 0, 1);
}

/** E = eFloor + eSpan · h^eExp */
export function exposure(h, cfg) {
  const r = cfg.roche;
  return r.eFloor + r.eSpan * Math.pow(clamp(h, 0, 1), r.eExp);
}

/** max(min, round(base · (hFloor + (1 − hFloor) · h))) */
export function deckSize(hViewer, cfg) {
  const d = cfg.deck;
  const h = clamp(hViewer, 0, 1);
  return Math.max(d.min, Math.round(d.base * (d.hFloor + (1 - d.hFloor) * h)));
}

/** Precedence: letgo > both met > idle > open. */
export function resolveOrbit({ mine, theirs, lastMessageAt }, now, cfg) {
  if (mine === 'letgo' || theirs === 'letgo') return 'closed-letgo';
  if (mine === 'met' && theirs === 'met') return 'closed-met';
  if (lastMessageAt != null && ms(now) - ms(lastMessageAt) > cfg.roche.orbitIdleDays * DAY_MS) return 'closed-idle';
  return 'open';
}

/** Capacity gaming: like-back < 10% over ≥ 20 qualified inbound steps K down one level (floor 2). */
export function effectiveK(K, { qualifiedInbound, likeBacks }, cfg) {
  const choices = [...cfg.roche.kChoices].sort((a, b) => a - b);
  const floor = choices[0];
  let snapped = choices.filter((c) => c <= K).pop() ?? floor;
  if (qualifiedInbound >= 20 && likeBacks / qualifiedInbound < 0.10) {
    const i = choices.indexOf(snapped);
    snapped = choices[Math.max(0, i - 1)];
  }
  return snapped;
}
