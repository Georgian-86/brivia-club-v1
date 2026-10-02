# Engine and backend audit (arena-style review)

*Date: 2026-10-02. Subject: `brivia-club` (Fastify, Prisma, pgvector engine v1 @ `9dddfa8`) and `brivia-club-v1`
(Vite, Supabase UI @ `a43fb77`). Judged against the product rules in `VISION.md`.*

> **Method note.** The `agent-arena` skill was requested for this review but is **not installed yet** (see
> `SKILLS.md`; the install needs user approval). This review follows the arena protocol by hand. It uses four
> independent reviewer lenses, a ledger of verifiable claims with file references, scores per lens, and
> disagreements recorded instead of averaged away. Re-run it with the real `agent-arena` skill once installed,
> and record any change in score in `DECISIONS.md`.

## 1. What exists today

### `brivia-club`: the matching engine v1 (`server/src/engine/`)

The pipeline runs in this order: candidate pool, then feature vector, then the weighted score, then the explanation, then the deck shaping.

| Layer | What it does | Where |
|---|---|---|
| Candidate pool | Union of: pgvector ANN in both directions (my intent vs their profile, their intent vs my profile), recently active members, newest members, and a daily md5 rotation. Up to 220 candidates. | `candidates.js:19-47`, `store.js:60-72` |
| Semantic | MiniLM 384-d embeddings of two docs per user (profile doc and intent doc), cross-scored | `text.js`, `embeddings.js`, `features.js:58-61` |
| Structured | purpose/tag, lookingFor↔skills both ways, skill complement, interests, industry, language, personality, workStyle, **location ladder**, availability, communities | `features.js:63-115` |
| Behavioral | Wilson-bound reciprocity, activity decay, freshness, completeness | `stats.js` |
| Score | `25 + 74·σ(12·(m − 0.36))`, where m = Σw·f / Σ\|w\| over the features that are present | `weights.js:53-67` |
| Learning | Per-member online SGD on like/pass, L2-pulled toward the PRIOR | `learn.js` |
| Deck shaping | MMR diversity (λ = 0.78) plus an ε = 0.18 exploration slot | `candidates.js:65-108` |
| Logging | `Interaction` table stores the exact feature vector served, as training data | `index.js:132-185` |
| Explainability | Why-chips generated only from real contributions ≥ 0.34 | `weights.js:77-110` |

### `brivia-club-v1`: the UI we keep

There is **no ranking at all.** `app.js:1970` loads `select('*')` of every completed profile, sorts it newest-first, and
filters it client-side by substring (`app.js:340-357`). Profiles hold `city`, `state`, `skills[]`, `looking_for[]` and
`experience`. There is **no interests field and no coordinates.**

## 2. Evidence ledger (each claim can be checked)

| # | Claim | Evidence | Severity |
|---|---|---|---|
| E1 | Location carries only **~5% of the score** in v1 engine | PRIOR weights sum to 18.7; `location: 1.0` (`weights.js:18-46`) | Critical vs vision |
| E2 | The location ladder is effectively broken for an Indian user base: `timezone` defaults to `"IST"`, so almost every non-same-city pair gets the "Same timezone" tier, 0.45 | `schema.prisma` `timezone String @default("IST")`; `features.js:107-110` | High |
| E3 | Location is a free-text string compared by its first comma token. "Bengaluru" ≠ "Bangalore", and there is no distance: a neighbour 2 km away in another municipality scores the same as a stranger 1,500 km away | `features.js:83,103-112` | Critical vs vision |
| E4 | Interests are an exact-string match that saturates at 3 shared (`shared/3`). There is no notion of intensity, rarity, or related interests ("badminton" vs "tennis" counts as 0) | `features.js:90-93` | High |
| E5 | Interests weigh 1.2 / 18.7 ≈ **6%**. The engine is tuned for team formation (purposes, lookingFor, skills ≈ 45%), not interest-based networking | `weights.js` PRIOR | High vs vision |
| E6 | ANN candidate retrieval is geography-blind, so in a large network local people can be missing from the 220 pool entirely | `store.js:60-72` has no geo filter | High at scale |
| E7 | `behaviorStats()` recomputes over **all** users and swipes every 5 min, in-process and per instance | `stats.js:35-71` | Medium (fine < ~50k users) |
| E8 | Taste-learning is a read-modify-write with no lock, so concurrent swipes lose updates. The gradient ignores the Σ\|w\| normalisation and the steepness (an approximation) | `learn.js:24-50` | Low/Medium |
| E9 | v1: **any completed member can read every column of every profile, including `email` and `phone`** (RLS allows the row; the client selects `*`) | `supabase/auth-hardening.sql:21-25`, `app.js:1970` | **P0 privacy** |
| E10 | v1: a one-sided like writes a `matches` row and opens chat. There is no mutual consent | `app.js:545,429-440`; insert policy only checks `auth.uid() = user1_id` | **P0 trust** |
| E11 | v1 loads the entire member table to every client and has no pagination: O(N) payload | `app.js:1970` | High at scale |
| E12 | Engine v1 components are individually standard (two-tower-style embeddings, Wilson bound, MMR, ε-greedy, per-user logistic SGD). Good engineering, but nothing distinctive enough to anchor an IP claim | whole `engine/` | Strategic |

## 3. Panel scores (0–10)

Four lenses scored each area independently:
- **A** is the architect: structure, maintainability, scale.
- **P** is the product owner: fit to the location-first and interest vision.
- **S** is security and trust.
- **M** is the ML and ranking specialist.

| Area | A | P | S | M | Consensus | Notes |
|---|---|---|---|---|---|---|
| Code structure and modularity (engine v1) | 8 | 7 | 7 | 8 | **7.5** | Clean layering, single "speaks SQL" file, graceful degradation |
| Semantic matching | 7 | 5 | 7 | 8 | **7** | Strong for builder intent; weaker for hobbies, where short interest lists embed poorly |
| **Location-first fit** | 3 | **1** | 5 | 2 | **2** | E1–E3, E6. This is the core requirement and it is essentially absent |
| **Interest matching depth** | 4 | 2 | — | 3 | **3** | E4, E5 |
| Learning / personalisation | 7 | 7 | — | 6 | **6.5** | Real per-user taste model plus interaction log, a good foundation to keep (E8 fixable) |
| Explainability | 8 | 9 | 8 | 7 | **8** | Evidence-only chips. Keep this philosophy |
| Scalability | 5 | — | — | 5 | **5** | E6, E7, E11 |
| Privacy and safety (v1 as deployed) | 3 | 4 | **1** | — | **2.5** | E9, E10 are launch blockers |
| Uniqueness / IP strength | 4 | 3 | — | 3 | **3.5** | E12 |
| v1 UI's current "engine" | — | 1 | 2 | 1 | **1** | Newest-first plus a substring filter |

**Overall:** the backend plumbing of engine v1 is good (**~7/10**) and worth reusing. Its matching model scores **~2.5/10
against the new vision**, because it is a builder and team-formation engine with location bolted on.

### Disagreements (kept on record, not averaged away)

- **Reuse vs rewrite.** A argues for porting the v1 engine code wholesale and swapping the feature set. M argues the
  scoring core (a weighted mean pushed through a sigmoid) should be replaced by ORBIT's gated, ring-based model,
  because a single blended score can't express "near beats far unless the fit is exceptional". **Resolution:** reuse the
  plumbing (embeddings, store, interaction log, taste learning, explain, MMR), replace the scoring core.
  See `ORBIT_ENGINE.md §9`.
- **Embeddings for interests.** M wants embeddings to drive interest similarity. P worries that opaque similarity
  hurts explainability. **Resolution:** an explicit interest taxonomy is primary and explainable, and embeddings are
  a secondary gap-filler capped at 25% of resonance.
- **Supabase-only vs a separate engine service.** S prefers a server-side service, because ranking logic and
  coarse-location data must never reach the client. A notes that Edge Functions would avoid a second deployment.
  **Open:** to be decided by the user (`DECISIONS.md` D-004).

## 4. Required changes (priority order)

1. **P0, before any public launch:** expose a `public_profiles` view (no email or phone) and stop `select('*')`;
   make connections mutual-consent (E9, E10).
2. Add the location model: a coarse cell plus a centroid, ring computation, and geo-filtered candidate retrieval (E1–E3, E6).
3. Add the interest model: taxonomy, Passion Budget, modes, local rarity (E4, E5).
4. Build ORBIT scoring with the escape-velocity gate and liquidity-adaptive rings (`ORBIT_ENGINE.md`).
5. Move ranking server-side with paginated decks; never ship the member table to the client (E11).
6. Precompute behavioral stats incrementally (a materialised view or a cron job) instead of a full in-process scan (E7). Make the taste update atomic (E8).
