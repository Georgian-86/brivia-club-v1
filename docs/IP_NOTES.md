# Protecting ORBIT: IP notes

*Not legal advice. Confirm everything here with an IP attorney before filing.*

## What copyright does and doesn't protect

- **Copyright protects expression, not ideas.** It covers the ORBIT source code (a literary work, the "computer
  programme"), this specification text, the diagrams, and the UI copy. It does **not** stop a competitor from
  independently implementing "proximity rings + interest threshold" in their own words and code.
- In India, register with the **Copyright Office** (copyright.gov.in, Form XIV) as a literary work / computer
  programme. Deposit source code excerpts (first and last pages are commonly accepted) and the spec. Registration is
  not mandatory for protection, but it is strong evidence of authorship and date.
- **Keep authorship clean.** All engine code must be written by the team, or by Claude on the team's behalf in this
  repo, and never copied from another platform or library's ranking logic. Engine v1 code (`brivia-club`) is our own
  and can be reused.

## Complementary protections (recommended)

| Tool | Protects | Action |
|---|---|---|
| **Trade secret** | The calibrated numbers (θ, Φ, γ, α, mode matrix values once tuned on real data), the taxonomy weights, and the training data | Keep production constants in server config, not in the client or the public repo. Use NDAs with contractors. Make the repo private. |
| **Trademark** | The names *ORBIT*, *Escape Velocity*, *Worth the Distance*, *Passion Budget*, *Proximity Rings*, *Long-Range Request* | Run a trademark search, then file in class 9/42/45 (India: ipindia.gov.in) |
| **Patent** (optional) | The *method*, which could cover the escape-velocity gating with liquidity-adaptive thresholds | India's Sec. 3(k) excludes "computer programme per se", so it needs a technical-effect framing. Discuss with a patent attorney before any public disclosure, because publishing first can destroy novelty in many jurisdictions |
| **Dated evidence** | Proof of when we created it | Signed git commits, dated spec versions, and this file's history |

## What is genuinely distinctive (for the filing narrative)

Distance and interest matching each exist elsewhere: radius filters, interest overlap, IDF-style weighting. The
original contribution of ORBIT is the **combination and its rules**:

1. A **ring-specific escape-velocity gate** on resonance, rather than distance as one more weighted feature. Near
   beats far by construction, and far is admitted only above a ring-dependent bar that can never be relaxed below
   the local bar.
2. **Liquidity-adaptive relaxation** of only the outer rings, driven by measured local supply.
3. A **fixed Passion Budget** with a √-weighted counterpart term and a **harmonic-mean mutuality**.
4. **Region-local rarity** of interests over a topology tree.
5. A **mode complementarity matrix** (learn/play/teach/build).
6. **Separating the displayed score from the ranking score**: resonance is shown, distance only reorders.
7. **The Roche Limit** (§6.4, the signature mechanism, chosen by arena run 2026-10-02). It combines four things:
   - an exposure multiplier driven by **receiver-declared** capacity;
   - load that counts only likes that clear the receiver's own escape gate;
   - removal at zero headroom that preserves searchability;
   - an orbit-resolution state machine (Met / Ongoing / Let go) that releases capacity and supplies learning labels.

   Prior art (Lunchclub's matches-per-week setting, Hinge's like limits, Bumble's expiry, and the congestion research of
   Arnosti, Johari and Kanoria, MSOM 2021) covers pieces of this idea. That is why the claim is on the specific,
   expressed rules, not on the idea itself.

**Do not claim** that no platform anywhere does anything similar. Commission a prior-art search before you make any
public "first and only" statement.
