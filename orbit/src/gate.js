// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.
// Escape-Velocity Gate (spec §5): per-ring resonance thresholds, liquidity-adaptive, plus Worth-the-Distance.

/**
 * θ'_r = max(θ_0, θ_r − α_r · slack), slack = min(1, max(0, 1 − L/L*)), for every ring.
 * R12: a non-finite L (missing liquidity) is treated as 0; L < 0 never relaxes beyond L = 0.
 */
export function thresholds(L, cfg) {
  const liq = Number.isFinite(L) ? L : 0;
  const slack = Math.min(1, Math.max(0, 1 - liq / cfg.lTarget));
  return cfg.theta.map((t, r) => Math.max(cfg.theta[0], t - (cfg.alpha[r] ?? 0) * slack));
}

/** Eligible for the recommended feed: R clears the (relaxed) threshold of its ring. */
export function isEligible(R, ring, L, cfg) {
  return R >= thresholds(L, cfg)[ring];
}

/** Worth-the-Distance lane: ring >= 3 and R >= fixed θ_far (never relaxed). */
export function isWorthTheDistance(R, ring, cfg) {
  return ring >= 3 && R >= cfg.thetaFar;
}
