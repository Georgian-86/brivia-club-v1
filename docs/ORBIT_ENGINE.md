# ORBIT: the Brivia matching engine (specification v0.2)

*Status: design spec, not yet implemented. © 2026 The Brivia Club. All rights reserved. Original work, intended for
copyright registration (see `IP_NOTES.md`). Any implementation must follow this document; behaviour changes must
update it in the same commit.*

**ORBIT** stands for **O**rdered proximity **R**ings, **B**udgeted interests, **I**nterest-topology resonance and
an escape-velocity **T**hreshold. Its signature mechanism is the **Roche Limit** (§6.4): receiver-declared capacity
that controls how much each member is exposed.

*Constants in this document are reference defaults. Calibrated production values live in private server config and
are a trade secret (`IP_NOTES.md`).*

The governing metaphor, which is also the product language:

> Everyone has a gravity well. People near you are in your orbit by default. Someone far away only reaches you if
> your shared pull is strong enough to reach **escape velocity**.

---

## 1. Design goals (from `VISION.md`)

| Goal | ORBIT mechanism |
|---|---|
| Match on mutual interests | §3 Resonance over an interest topology, with a Passion Budget, modes and local rarity |
| Location first | §4 Proximity Rings, and §6 ring-ordered feed composition |
| Far only when the match is very strong | §5 Escape-Velocity Gate |
| Never an empty feed in small towns | §5.2 Liquidity-adaptive thresholds |
| Search and request anyone | §7 Unrestricted search and Long-Range Requests |
| Learns each member's taste | §8 Taste learning (reused from engine v1) |
| Every match explainable | §6.3 Evidence-only explanations |
| Location privacy | §4.1 Coarse cells, rounded distances |
| Nobody is flooded; replies stay likely | §6.4 Roche Limit (receiver-declared capacity) |

---

## 2. Member data model (inputs)

| Field | Type | Notes |
|---|---|---|
| `interests[]` | `{ interest_id, points, mode }` | Up to 12 interests, picked from the taxonomy (§3.1) or proposed as new nodes |
| `points` | int ≥ 1 | **Passion Budget:** each member spreads exactly **20 points** over their interests |
| `mode` | `learn \| play \| teach \| build` | How they relate to the interest. Defaults to `play` |
| `home_cell` | H3 index, resolution 7 (~5 km² hexagon) | Derived from a city pick or browser geolocation. **Raw coordinates are discarded after snapping.** |
| `travel_cell`, `travel_until` | H3 r7, timestamp | Optional temporary origin for travel ("Transit mode") |
| `capacity_k` | `2 \| 3 \| 5 \| 8` | Roche Limit capacity: "new people I can realistically meet per fortnight". Default **5** (§6.4) |
| `availability[]` | set of `{weekday \| weekend} × {morning \| afternoon \| evening \| night}` | Used for local co-presence |
| `about` | free text | Embedded (MiniLM, as in engine v1) as a secondary signal |

---

## 3. Resonance: how strongly two people's interests pull together

### 3.1 Interest Topology

Interests live in a curated tree with four levels: **domain → category → interest → niche**. For example:
*Sports → Racket sports → Badminton → Doubles badminton*. The similarity of two nodes depends on how far apart
they sit in the tree:

```
topo(i, j) = 1.0   if i == j
           = 0.85  if one is the parent/child of the other (Badminton ↔ Doubles badminton)
           = 0.55  siblings under the same category (Badminton ↔ Tennis)
           = 0.20  same domain only (Badminton ↔ Football)
           = 0     otherwise
```

New member-proposed interests are placed under a category by moderators (or by an embedding-nearest suggestion
that a moderator confirms). Until placed, they match only by exact id.

### 3.2 Passion Budget

The budget turns every interest into a weight that **sums to 1 per member**: `p_u(i) = points_u(i) / 20`.

Fixed budgets stop "interest inflation". A member who lists 40 interests can't out-match everyone, and the budget
says what each person *actually* cares about most.

### 3.3 Local rarity

The more uncommon an interest is **in the viewer's region** (rings 0–2), the more it means to share it:

```
n_R(i)    = members in region R who hold interest i (or a descendant of it)
N_R       = members in region R
rarity(i) = 0.35 + 0.65 · ln(1 + N_R / (1 + n_R(i))) / ln(1 + N_R)       ∈ [0.35, 1]
```

Sharing *Music* in Mumbai is common; sharing *Carnatic violin* in Delhi is a signal. Rarity is computed per region,
so the same interest can be rare in one city and common in another. Recompute it nightly.

### 3.4 Mode complementarity

| A's mode \ B's mode | learn | play | teach | build |
|---|---|---|---|---|
| **learn** | 0.8 | 0.9 | **1.15** | 0.9 |
| **play** | 0.9 | 1.0 | 0.95 | 0.9 |
| **teach** | **1.15** | 0.95 | 0.75 | 0.9 |
| **build** | 0.9 | 0.9 | 0.9 | **1.1** |

Learn↔teach is the strongest pairing. Build↔build is a co-builder fit, which is where the old engine's
team-formation use case now lives. Teach↔teach is the weakest.

### 3.5 Directed and mutual resonance

For each interest of A, take the best-fitting interest of B:

```
R(A→B) = Σ_i  p_A(i) · max_j [ topo(i,j) · mode(A_i, B_j) · rarity(i) · √p_B(j)/√max_k p_B(k) ]
```

The `√p_B` term means B must also care about the counterpart interest. The square root keeps a secondary interest of
B meaningful without letting it dominate.

The two directions are combined with a **harmonic mean**, so a one-sided obsession can't fake a match:

```
R_struct = 2 · R(A→B) · R(B→A) / (R(A→B) + R(B→A))        (0 if either is 0)
```

### 3.6 Semantic gap-filler (capped)

When both members have an `about` embedding:

```
R = 0.75 · squash(R_struct) + 0.25 · semScale(cos(about_A, about_B))
```

When `R_struct = 0`, `R = 0` regardless of the embedding: the semantic term only fills gaps on top of real shared
interests and never creates a match by itself.

Otherwise `R = squash(R_struct)`, where `squash(x) = 1 − e^(−3x)` maps raw resonance to [0, 1). The semantic share
is **capped at 25%**, so every strong match can still be explained by named, shared interests.

---

## 4. Proximity Rings

### 4.1 Privacy

- Only `home_cell` (H3 resolution 7) is stored. Distance is the great-circle distance between cell centroids.
- Clients only ever receive a **rounded distance band** ("< 3 km", "~5 km", "~25 km", "Mumbai", "Maharashtra",
  "India", "abroad"). Never coordinates, and never a cell id.
- Travel mode replaces `home_cell` with `travel_cell` until `travel_until`.

### 4.2 Rings

| Ring | Name | Distance | Proximity weight Φ(r) |
|---|---|---|---|
| 0 | Neighbourhood | ≤ 3 km | 1.00 |
| 1 | City | ≤ 15 km | 0.92 |
| 2 | Metro / region | ≤ 60 km | 0.80 |
| 3 | State band | ≤ 350 km | 0.62 |
| 4 | Country | ≤ 2,500 km | 0.48 |
| 5 | World | > 2,500 km | 0.38 |

---

## 5. The Escape-Velocity Gate

### 5.1 Base thresholds

A candidate is **eligible for the recommended feed** only if their resonance clears the threshold for their ring:

| Ring | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| θ_r (base) | 0.15 | 0.25 | 0.40 | 0.62 | 0.74 | 0.82 |

Search (§7) is **not** gated.

### 5.2 Liquidity-adaptive thresholds

The engine measures local liquidity:

```
L = number of eligible, active, not-yet-seen candidates in rings 0–1
L* = 40   (target)
```

When `L < L*`, the outer thresholds relax smoothly:

```
θ'_r = max( θ_0 , θ_r − α_r · (1 − L / L*) )      α = [0, 0, 0.12, 0.18, 0.18, 0.15]
```

A small town widens its circle automatically. A dense city keeps a tight, local feed. Ring 0–1 thresholds never
relax, and a far card can never clear on less resonance than a neighbour needs.

### 5.3 The Worth-the-Distance lane

A candidate in ring ≥ 3 with `R ≥ θ_far = 0.86` (fixed, never relaxed) is a **Worth-the-Distance** card.
At most **2 per member per day** are shown, in fixed deck slots, labelled with the reason.

---

## 6. Ranking and feed composition

### 6.1 Orbit score

For eligible candidates:

```
G = R^γ · Φ(r) · C · B · T · E        γ = 1.3
```

- `C`, the co-presence factor for rings 0–2 = `0.85 + 0.15 · jaccard(availability_A, availability_B)` (1 for rings ≥ 3)
- `B`, the behaviour factor = `0.8 + 0.2 · mean(activity, reciprocity)` (reuses the engine v1 `stats.js` signals)
- `T`, the taste factor = `exp( Σ_k w_k(user) · f_k )`, clipped to [0.75, 1.3]. Its features are learned per member (§8)
- `E`, the Roche exposure factor of the candidate (§6.4)

The displayed match percentage is `round(100 · R)`. **Resonance, not G, is what we show.** Distance changes *who*
you see, never *how good* we claim the fit is.

### 6.2 Deck composition (8–12 cards)

0. Deck size for viewer A = `max(8, round(12 · (0.4 + 0.6 · h_A)))` (§6.4). A member with many unresolved orbits
   gets fewer new cards, plus a "close an orbit" prompt.
1. Sort eligible candidates by `G`.
2. Fill the deck **ring-ordered**: at least 70% of cards come from rings 0–2 when the supply allows.
3. Insert up to 2 Worth-the-Distance cards (§5.3) at slots 4 and 9.
4. Apply MMR diversity over interest vectors (λ = 0.8), reused from engine v1 `diversify()`, so a deck isn't twelve badminton players.
5. Add one exploration card from the eligible set outside the top ranks (ε = 0.15), as in engine v1 `withExploration()`.
6. Log every served card with its full feature vector to the interaction log.

### 6.3 Explanations (evidence only)

Each card gets up to three chips, chosen from the largest real contributions:

- "Both deep into **Bouldering**, rare in Pune" (shared interest with rarity ≥ 0.7, both with ≥ 4 points)
- "You teach **Guitar**, they want to learn it" (mode complementarity)
- "**~3 km away**, both free weekend mornings" (ring plus co-presence)
- "**Worth the distance:** 91% resonance across Chess, Go and Game theory"

A chip can only cite a contribution that actually exists for that pair. Nothing is invented.

### 6.4 The Roche Limit (signature mechanism)

> A moon that comes too close to a planet is pulled apart at the Roche limit. A member who receives more attention
> than they can return gets the same treatment. ORBIT withdraws them from recommendations before the attention breaks
> them, and returns them as their orbits resolve.

**The problem it solves.** Location-first markets are small. The one bouldering teacher in Kothrud gets flooded with
likes, stops replying, and everyone else's like-back rate collapses. Incumbents cap what members *send*. ORBIT caps
what a member *receives*, at a level the receiver declares, and releases capacity when real-world outcomes happen.

**Capacity.** Each member declares `K_u ∈ {2, 3, 5, 8}` new people per fortnight (default 5, editable any time).

**Load.** Recomputed nightly and on every relevant event:

```
load_u = Σ_{l ∈ pending inbound likes/requests to u, ≤ 10 days old}  0.5 · q_l
       + Σ_{o ∈ open orbits of u}  1.0

q_l = 1  if liker l clears u's escape gate (R(u,l) ≥ θ'_ring(u,l)) and l's account is ≥ 3 days old
    = 0  otherwise                        (anti-brigading: unwanted or throwaway likes add no load)
```

Each liker counts at most once. An **open orbit** is a connection that is not yet resolved (see below).

**Headroom and exposure.**

```
h_u = clamp(1 − load_u / (2 · K_u), 0, 1)
E_u = 0.35 + 0.65 · h_u^0.7
```

**The limit itself.** When `h_u = 0`, member u is removed from every recommended deck and from the Worth-the-Distance
lane. Three things still hold:
- u stays fully **searchable**;
- requests to u still work but **queue**, and the sender sees only a boolean "at capacity, your request will wait";
- the flag appears with jitter (±12 h) and never shows counts, so popularity can't be read from it.

Like the escape gate, the Roche Limit only **removes or reorders** candidates. It never admits anyone, and taste
learning cannot override it.

**Orbit resolution.** Each side of a connection can privately mark it *Met*, *Ongoing* or *Let go*. The orbit closes,
and its load is released, when:
- both mark *Met* (at most 3 *Met* marks per member per week);
- either side marks *Let go*;
- or 21 days pass without a message.

A **mutual Met** is the strongest positive label for taste learning (§8). It is also the in-product measure of the
north-star metric (people who actually meet).

**Expiry.** Inbound likes left unanswered for 10 days expire silently, with no notification to either side.

**Interaction with liquidity.** Liquidity `L` (§5.2) counts only candidates with `h > 0`. So when local members are
saturated, the outer rings relax first, instead of the deck repeating saturated people.

**Abuse controls.**
- *Capacity gaming* (declaring K = 8 and never replying): if like-back stays below 10% over 20 or more qualified
  inbound likes, the effective K steps down one level.
- *Brigading*: handled by `q_l`.
- *Fake Met*: Met requires both sides and is rate-limited.

---

## 7. Search and Long-Range Requests

- **Search** ranks by `0.6 · query_relevance + 0.4 · R`. It is not gated and not ring-restricted, and it shows the
  distance band. Query relevance mixes name/handle hits, interest-taxonomy hits (including descendants) and
  semantic similarity of the `about` text (reuses engine v1 `semanticSearch`).
- **Long-Range Request:** to request someone in ring ≥ 3 who has not liked you, you spend one of **5 weekly long-range
  signals**. The request must include a note. The recipient sees the resonance chips and can accept or decline.
  Declines are private.
- Acceptance and decline feed the taste model of both members. A member whose long-range acceptance rate stays
  below 15% over 20 or more requests gets a lower weekly quota (anti-spam).

---

## 8. Learning (reused from engine v1, adapted)

- Every like, pass, request, accept, decline and reply is an interaction row with the served feature vector
  (`brivia-club/server/src/engine/index.js` pattern).
- The per-member taste weights `w_k` are trained by online logistic SGD with an L2 pull toward the prior (`learn.js`
  pattern). The features are: shared-interest count, max rarity hit, mode-pair indicators, ring, co-presence,
  semantic similarity and recency.
- A **mutual Met** (§6.4) is the strongest positive label (weight 3× a like). *Let go* after chatting is a weak
  negative (0.5× a pass).
- **Taste never overrides the gate.** Learning reorders the eligible set. It cannot make an ineligible far
  candidate appear. This is what keeps "location first" a guarantee rather than a default.
- Fix from audit E8: the update must be atomic (row lock, or `UPDATE … SET weights = f(weights)` in SQL).

---

## 9. Reference architecture

```
v1 UI (Vite, Supabase auth)
   │  Supabase JWT
   ▼
ORBIT service  ── reuse: brivia-club/server/src/engine/{embeddings,store,stats,learn,candidates(diversify)}.js
   │                new:  topology.js  resonance.js  rings.js  gate.js  compose.js  explain.js
   ▼
Supabase Postgres  (+ PostGIS or h3-pg, + pgvector)
   tables: interest_node, member_interest, member_orbit(home_cell, travel_cell, travel_until, capacity_k,
           load, headroom: engine-private, never client-readable), orbit_resolution(pair, member, state, at),
           interaction, taste_profile, long_range_request, rarity_cache(region, interest, rarity)
```

**Candidate retrieval** (replaces the geography-blind ANN of audit E6):

1. Rings 0–2: H3 `grid_disk` around `home_cell`, filtered to members who share at least one interest within the
   same category, via an inverted index on `member_interest`.
2. Rings 3–5: only members who share **at least one interest with rarity ≥ 0.6** (a cheap prefilter). Exact R is
   computed afterwards, and the escape gate then applies.
3. Cap the pool at about 300 candidates, then score.

---

## 10. Rollout plan

| Phase | Deliverable | Done when |
|---|---|---|
| 0 | P0 fixes in v1: `public_profiles` view without email/phone, mutual-consent connections | No client can read another member's email or phone; a one-sided like opens no chat |
| 1 | Data: interest taxonomy seed (~400 nodes, India-relevant), onboarding for Passion Budget and modes, coarse location capture | New members have interests, points and a cell |
| 2 | ORBIT service with resonance, rings, gate and composition, plus unit tests on every formula in this doc | Golden-pair tests pass (see below) |
| 3 | Wire the v1 deck, explore and search to the service; add the Worth-the-Distance card style and the Long-Range Request flow | v1 no longer loads the full member table |
| 4 | Taste learning, interaction log, and nightly rarity and liquidity jobs | A member's deck changes after about 15 swipes |
| 5 | Calibration from real data: tune θ, Φ, γ and the Roche constants with an offline replay of interactions. Add a per-region Gini of 7-day impressions as a fairness monitor | Far-card like-back rate ≥ ring-1 like-back rate; impression Gini ≤ 0.55 |
| 6 | Draft: Constellations (Appendix A), only in regions where L ≥ 2·L* for 4 consecutive weeks | Arena re-review passes |

**Golden-pair tests (must hold):**

1. Same neighbourhood with one shared common interest is eligible. Another state with the same single common interest is **not** eligible.
2. A pair 1,800 km apart sharing three rare interests (R ≥ 0.86) is a Worth-the-Distance card.
3. A one-sided obsession (A puts 18 points on X, B puts 1 point on X and 19 elsewhere) scores far lower than mutual passion.
4. A learn↔teach pair beats a play↔play pair with identical interests.
5. In a town with L = 5, ring-3 candidates with R = 0.55 become eligible. In a city with L ≥ 40 they do not.
6. No API response contains coordinates, a cell id, an email or a phone number of another member.
7. A member with `h = 0` is absent from every deck and the Worth-the-Distance lane, but appears in search.
8. 50 pending likes from accounts that fail the target's gate, or are under 3 days old, leave `E` unchanged.
9. Two candidates with equal `R`, ring and other factors rank in order of headroom.
10. Deck size is never below 8 or above 12.

---

## Appendix A (DRAFT, not scheduled): Constellations

These are quorum-consented local micro-groups (3–5 members in ring ≤ 1) around one anchor interest:
- every pair must clear a weakest-link resonance floor `min R ≥ 0.35`;
- the members must share an availability slot;
- the group reveals itself only if at least 3 accept within 36 h, and dissolves silently otherwise;
- meetings are at public venues only;
- reliability comes from mutual-Met labels (§6.4), not from peer attestation.

**Status:** deferred by arena run 2026-10-02 (`docs/arena/2026-10-02-signature-mechanism.md`). Close prior art
(Timeleft, Pie, 222) already ships, and it needs liquidity we don't have yet. Revisit at Phase 6.
