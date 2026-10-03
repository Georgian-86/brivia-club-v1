# ORBIT: the Brivia matching engine (specification v0.2)

*Status: design spec; core library implemented in `orbit/` (service and UI pending). © 2026 The Brivia Club. All rights reserved. Original work, intended for
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
- Location enters only through a server-side snap (`set_home_location`, at most 3 changes a day), and a candidate in
  a cell with fewer than 5 completed same-world members is shown only at the ring-2 band label (§9.1.4).

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

The relaxation factor `(1 − L / L*)` is clamped to [0, 1]: a missing or negative `L` counts as 0, so the
thresholds can never fall below their L = 0 values.

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
3. Insert up to 2 Worth-the-Distance cards (§5.3) at slots 4 and 9. When the deck is shorter than a slot, that card goes to the
   last deck position instead (or the nearest free position before it). A far card is never placed ahead of the local
   cards, and never competes with them in the ordering below.
4. Apply MMR diversity over interest vectors (λ = 0.8), reused from engine v1 `diversify()`, so a deck isn't twelve badminton players.
5. Add one exploration card from the eligible set outside the top ranks (ε = 0.15), as in engine v1 `withExploration()`.
6. Log every served card with its full feature vector to the interaction log (`log_impressions`, §9.1.6).

### 6.3 Explanations (evidence only)

Each card gets up to three chips, chosen from the largest real contributions:

- "Both deep into **Bouldering**, rare in Pune" (the same interest on both sides, rarity ≥ 0.7, both with ≥ 4 points)
- "You teach **Guitar**, they want to learn it" (mode complementarity on the same interest)
- "**~3 km away**, both free weekend mornings" (ring plus co-presence)
- "**Worth the distance:** 91% resonance across Chess, Go and Game theory"

A chip can only cite a contribution that actually exists for that pair. Nothing is invented. A match through a
*related* interest (parent/child, sibling or same domain, §3.1) still counts towards R, but never produces a rare or
teach/learn chip, because that chip would name an interest the other member does not hold.

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
- or 21 days pass without a message, counted from the later of the last message and the moment the orbit opened
  (so an orbit where nobody ever writes also closes).

A **mutual Met** is the strongest positive label for taste learning (§8). It is also the in-product measure of the
north-star metric (people who actually meet).

**Expiry (Ruling I8).** Two clocks, both silent (no notification to either side):
- *Roche load* counts only inbound likes/requests at most 10 days old (see **Load** above). An older like stops
  adding load but is still a live request.
- *The request itself* expires 30 days after it was sent, if it is not accepted. An expired request is hidden from
  the recipient's Requests list, cannot be accepted, never completes a match, and does not count toward the caps.
  Expiry applies to declined requests too. If the sender requests the same person again, the expired request is
  replaced by a fresh one. The owner-only `purge_expired_requests()` deletes expired rows.

**Request caps and consent rules (database, `0003_trust_hardening.sql`).**
- A sender may send at most **30 requests per 24 hours** and hold at most **100 live unanswered** (pending or
  declined) requests. A request over a cap is **dropped silently**: no error and no row are written, and the
  client shows the usual "Signal sent", so the cap is never revealed.
- A request that **completes a match** (the other member has already asked) is never capped.
- **The sender never sees a decline.** Senders read their outgoing requests only through
  `my_outgoing_requests()`, which shows a declined request as pending. A re-request of a live declined request
  gives the same conflict as one that is still pending, and both expire at 30 days. One consequence: the
  change-of-mind path of Ruling P11 (the member who declined requests back) completes a match only within 30
  days of the original request. After that, their request is a new pending request.
- **A block withdraws the blocker's own pending and declined requests** to the blocked member. So
  block → unblock → reverse request never completes a match on consent given before the block. Requests from
  the blocked member stay hidden while the block lasts, and the blocker must still accept them after an unblock.

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
- **Interim, until phase 3 (Iteration 2, `supabase/migrations/0003_trust_hardening.sql`):** members no longer read the
  `public_profiles` directory. The v1 client reads other members only through three SECURITY DEFINER RPCs that
  return the same public card columns (never email, phone or `is_test`): `list_members` (the deck, keyset-paged
  newest first by `(created_at, id)`, at most 20 per page, more pages on demand), `get_candidates` (cards for known
  ids, at most 50 ids per call) and `search_members` (case-insensitive substring over name, city, skills and
  looking-for; LIKE wildcards are literal; at most 20 rows; not ranked by `R` yet). All three hide the caller,
  incomplete profiles (`brivia_is_completed`: trimmed name not empty and not 'New Member', trimmed city not empty),
  blocked pairs in both directions, and the other test world (test and real members never see, request or message
  each other); a caller who is not completed gets nothing. Community posts follow the same block, world and
  completed-caller rules (own posts always visible). ORBIT's deck and search replace `list_members` and `search_members`
  in phase 3 and must keep these exclusions.
- **Long-Range Request:** to request someone in ring ≥ 3 who has not liked you, you spend one of **5 weekly long-range
  signals**. The request must include a note. The recipient sees the resonance chips and can accept or decline.
  Declines are private.
- Acceptance and decline feed the taste model of both members. A member whose long-range acceptance rate stays
  below 15% over 20 or more requests gets a lower weekly quota (anti-spam).

---

## 8. Learning (reused from engine v1, adapted)

- Every like, pass, request, accept, decline and reply is an interaction row with the served feature vector
  (`brivia-club/server/src/engine/index.js` pattern).
- Client-written interaction rows are the member's own actions only, and `met`, `letgo`, `accept` and `decline` are
  accepted only with backing evidence (a match, or a request addressed to the member). Their `features`, `score`,
  `propensity` and `model_version` are client-supplied and untrusted. Offline evaluation must take served features
  from service-written `impression` rows.
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
   │  Supabase JWT (verified locally against the JWKS, §9.1.2)
   ▼
ORBIT service  ── reuse: brivia-club/server/src/engine/{embeddings,store,stats,learn,candidates(diversify)}.js
   │                new:  topology.js  resonance.js  rings.js  gate.js  compose.js  explain.js
   │  role orbit_svc, never service_role; queries run as the member (§9.1.3); cards leave only via toCard
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

Both steps run inside `orbit_candidate_pool` (§9.1.1), so blocked pairs, the other test world and incomplete
profiles never enter the pool.

### 9.1 Trust boundary

*Design accepted in Iteration 2 (D-021); built in Iteration 4. Nothing in this section exists in code yet.* The
service is the only process that sees cells, exact cell-to-cell km, `G`, headroom and served features. Its job at the
boundary is to make sure none of that leaves, and that it never acts for a member it has not verified.

**Threat model in one line:** a malicious member (forged or replayed token, enumeration, location triangulation,
scraping) and a compromised or buggy service (over-broad DB rights, leaky serializer, logs) are both in scope.

#### 9.1.1 Database role `orbit_svc`

The service connects as its own login role. It is **never** `service_role`, `postgres` or any role with `BYPASSRLS`.

```sql
create role orbit_svc login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
  connection limit 20;                       -- password from the secret store, rotated; never in the repo
grant authenticated to orbit_svc with inherit false, set true;   -- PG16: may SET ROLE, inherits nothing
grant usage on schema public to orbit_svc;
```

| orbit_svc gets | How |
|---|---|
| Candidate pool with eligibility applied | `execute` on `orbit_candidate_pool(p_cells text[], p_limit int)`, SECURITY DEFINER, granted to `orbit_svc` only. The viewer is `auth.uid()` (from the verified claims, below). It applies exactly the `get_candidates` exclusions (caller completed, target completed, not self, same world, no block in either direction, Rulings I3/I5/P14) through one shared helper, so the two cannot drift. It returns `id`, effective cell (travel cell while `travel_until > now()`), `capacity_k`, `load`, `headroom`, activity signals and `member_interest` rows; never name, email, phone, `is_test` or `about`. |
| Card display columns | `get_candidates(ids)` called **as the member** (§9.1.3): `name`, `photo_url`, `city`/`state` (for `placeLabel`). No direct grant on `profiles`. |
| Engine tables (no PII) | `select` on `interest_node`, `rarity_cache`; `select, insert, update` on `taste_profile`, `orbit_resolution`; `select` on `member_orbit` and `member_interest`, each through an RLS policy `to orbit_svc using (true)`. |
| Impression rows | `execute` on `log_impressions(p_rows jsonb)` (§9.1.6). No table-level insert on `interaction`. |
| Location writes | `execute` on `orbit_store_home_cell(p_cell text)` only for the fallback path in §9.1.4. |

orbit_svc must **never** have: any grant on `profiles` (so no `email`, `phone`, `phone_country_code`,
`phone_number`, `is_test`); any access to the `auth`, `storage` or `vault` schemas; `brivia_messages`,
`career_applications`, request notes, `brivia_blocks` rows (block checks happen only inside definer helpers);
`execute` on `purge_*` or seed functions; `create` on any schema; membership in `service_role` or `postgres`.

Supabase's default privileges grant every new `public` table to `anon` and `authenticated`. Every engine-table
migration must therefore `revoke all ... from public, anon, authenticated` and enable RLS explicitly, so
`member_orbit` (cells, load, headroom) stays member-unreadable and member-unwritable. A local test asserts it.

#### 9.1.2 Verifying the member

- Every request carries the member's Supabase access token (`Authorization: Bearer`). The service verifies it
  **locally** against the project JWKS (`https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`). It never
  calls Supabase Auth per request and never trusts an unverified token's claims.
- **Asymmetric keys are a prerequisite.** Supabase projects created before asymmetric signing keys sign with a
  shared HS256 secret; such a project must migrate to asymmetric JWT signing keys (ES256/RS256) before ORBIT goes
  live. The service holds no HS256 secret. Algorithm allowlist: `ES256`, `RS256` (whichever the project uses).
  `HS256` and `none` are rejected, and the `alg` must match the JWK's `kty`/`alg` for its `kid`.
- Checks, all required: signature by a JWKS key with a matching `kid`; `iss` = `https://<ref>.supabase.co/auth/v1`;
  `aud` = `authenticated`; `role` = `authenticated` (an `anon` or `service_role` token is refused); `exp` in the
  future and `iat` not in the future, with at most 30 s clock skew; `sub` is a UUID; `is_anonymous` is not true.
  `sub` is the viewer. No viewer id is ever taken from the request body or query.
- JWKS cache: keys cached for 10 minutes; an unknown `kid` triggers at most one refetch per minute. If no cached
  key can verify the token and the JWKS endpoint is unreachable, respond **503**. There is no fallback to an
  unverified, partially verified or cached-decision path.
- Residual risk accepted: a token stays valid until `exp` after sign-out (Supabase default 1 h). The service does
  not read `auth.sessions`.

#### 9.1.3 Running as the member

Every query runs inside a transaction (Supavisor **transaction** mode; never a session-level `SET`):

```sql
begin read only;                                             -- deck and search are read-only
select set_config('request.jwt.claims', $1, true);           -- $1 = the verified payload (bound parameter, never interpolated)
-- engine-private reads as orbit_svc: orbit_candidate_pool(...), member_interest, rarity_cache
set local role authenticated;                                -- from here on: RLS, grants and auth.uid() helpers as the member
-- member-scoped reads: get_candidates(ids), own interactions, own requests
commit;                                                      -- role and claims end with the transaction
```

- Claims are set first, so every `auth.uid()`-based definer helper (`get_candidates`, `brivia_is_blocked_between`,
  `brivia_same_world`, `brivia_interaction_allowed`) answers for this member and nobody else.
- The service switches to `authenticated` only inside a transaction and never switches back within it. Deck,
  search and explain transactions are `read only`, so even a bug that runs a write under `authenticated` fails.
  Writes the service makes (impressions, taste updates, resolution state) run in separate transactions as
  `orbit_svc`, with claims set, through the definer functions above.
- The final card list is re-checked through `get_candidates(ids)` as the member immediately before serializing, so
  a block, unmatch or world change between scoring and response drops the card.
- **Accepted residual risk (recorded in D-021):** because `orbit_svc` may `SET ROLE authenticated` with any claims,
  a stolen orbit_svc credential can act as any member within `authenticated`'s rights. Mitigations: the credential
  lives only in the service's secret store; Supabase network restrictions allow orbit_svc only from the service's
  egress; read-only transactions; a fixed statement allowlist in code (no dynamic SQL); orbit_svc sessions are
  audited; rotation on any suspicion.

#### 9.1.4 Location

- Location enters only through `set_home_location(lat double precision, lng double precision)`, SECURITY DEFINER,
  executable by `authenticated`. It rejects non-finite or out-of-range values, snaps to the **H3 res-7** cell
  server-side (`h3_lat_lng_to_cell`, h3-pg) and upserts `member_orbit(member_id = auth.uid(), home_cell, home_set_at)`.
  Coordinates are never stored, logged, echoed back or put in an error message. The member reads back only a
  place label ("Koramangala, Bengaluru"), never the cell id.
- If h3-pg is not available on the project, the service exposes `POST /v1/location`: it snaps in memory with h3-js,
  discards the coordinates, and calls `orbit_store_home_cell(p_cell)` (granted to orbit_svc only; viewer =
  `auth.uid()`; validates that the cell is res-7). The same rate limit applies in the database.
- `member_orbit` has RLS on and no grants to `anon` or `authenticated`; members cannot read or write it except
  through these functions. Travel mode uses the same rules (`set_travel_location`, with `travel_until` ≤ 30 days).
- **Rate limit:** at most 3 home-location changes per member per rolling 24 h (counted in a `location_change(member_id,
  at)` table, no cell stored). Over the cap the call fails with a generic "try again later". This blunts
  triangulation by moving one's own pin and re-reading distance bands.
- **k-anonymity floor:** if a candidate's cell holds fewer than **5** completed members of the viewer's world, that
  candidate's distance band is coarsened to the **ring-2 band label** (the metro/region `placeLabel`, else a fixed
  "< 60 km"; never a number derived from exact km), and any ring-0/1 chip ("~3 km away") is suppressed. Scoring
  still uses the true ring; only what leaves the service is coarsened. Cell populations come from an orbit-private
  `cell_density(cell, is_test, n)` table refreshed nightly and on location change.

#### 9.1.5 What leaves the service

- **`toCard` is the only serializer** (`orbit/README.md`). Route handlers return `Card[]` only; a `Scored` object,
  deck or hit list never reaches the HTTP layer. Response envelope: `{ cards, nextCursor, deckId }`.
- **Contract test** (extends Golden 6): for every endpoint, against seeded fixtures, the response's card keys equal
  exactly `id, name, photoUrl, distanceBand, matchPercent, chips, worthTheDistance`; no value anywhere matches an H3
  index (`/^8[0-9a-f]{14}$/i`), a coordinate pair, an `@` or a phone-shaped digit run; no key is `km`, `G`, `cell`,
  `lat`, `lng`, `email`, `phone*`, `headroom` or `load`. A failing contract test blocks deploy.
- **Logs carry ids only:** request id, viewer id, candidate ids, endpoint, status, latency, model version. Never
  names, cells, km, coordinates, tokens, emails or feature values. Error responses are generic.
- **Health:** `GET /healthz` (process alive, no dependencies) and `GET /readyz` (DB reachable as orbit_svc, a JWKS
  key cached, config loaded). Neither needs auth, and neither returns data.
- **Rate limits** per verified viewer (`sub`): deck 30/min, search 20/min, explain 60/min; per IP for requests that
  fail verification. Over the limit: 429 with `Retry-After`.
- **Deck cache** keyed `(viewer, cell, day)` (day in the viewer's local date; the key also carries the model
  version and config hash). It holds cards plus their impression metadata, is never shared between viewers, and
  expires at the end of the day. A location change produces a new key; a block, unblock, match, unmatch or profile
  change evicts the viewer's entries. Cached cards still go through the `get_candidates` re-check in §9.1.3.

| Failure | Response |
|---|---|
| JWKS unreachable and no cached key verifies the token | 503 (never an unverified fallback) |
| Token invalid, expired, wrong `iss`/`aud`/`role`/`alg`, anonymous | 401 |
| Caller not a completed profile | 200 with an empty deck and a reason code (`complete_profile`) |
| Database unreachable | 503; a cached deck is not served, because the re-check cannot run |
| Scoring error or non-finite output | 500; never a fallback to unranked raw rows |
| Rate limit | 429 with `Retry-After` |
| Location over the 3/day cap | generic "try again later" |

#### 9.1.6 Impression logging

- `log_impressions(p_rows jsonb)`: SECURITY DEFINER, `execute` granted to `orbit_svc` only, called as orbit_svc
  with the verified claims set. It stamps `viewer_id = auth.uid()` and `event = 'impression'` itself; neither is
  taken from `p_rows`. It accepts at most 30 rows per call, skips a target that is the viewer, not same-world or
  blocked, and enforces the table's existing `features` size and `propensity` range checks.
- Each row records: `target_id`, `features` (the served feature vector), `score` (`G`), `propensity` (the probability
  the serving policy showed this card at this position; 1 − ε for ranked slots, ε / |pool| for the exploration slot),
  `model_version`, and `context` = `{ deck_id, position, lane: "ranked"|"explore"|"wtd", ring, holdout, policy,
  config_hash }`. `ring` is stored as the ring number, never the cell or km.
- **Holdout (critic C5):** a stable 5% of viewers, chosen by `hash(viewer_id, salt) mod 100 < 5`, are served by a
  baseline policy (ring-ordered, gate applied, no taste or Roche reordering) with `holdout: true`, so the learned
  policy can be compared against it offline. The salt is private config.
- Client-written like/pass/request rows carry the `deck_id` they acted on; offline evaluation joins them to the
  service's impression rows and uses only the service's `features`, `score` and `propensity` (§8).

---

## 10. Rollout plan

| Phase | Deliverable | Done when |
|---|---|---|
| 0 | P0 fixes in v1: `public_profiles` view without email/phone, mutual-consent connections | No client can read another member's email or phone; a one-sided like opens no chat |
| 1 | Data: interest taxonomy seed (~400 nodes, India-relevant), onboarding for Passion Budget and modes, coarse location capture through `set_home_location` with the k-anonymity floor (§9.1.4; Iteration 3) | New members have interests, points and a cell; no coordinates stored |
| 2 | ORBIT service with resonance, rings, gate and composition, plus unit tests on every formula in this doc; built behind the §9.1 trust boundary (`orbit_svc` role, JWKS verification, `toCard` contract test, impression logging with holdout; Iteration 4) | Golden-pair tests and the §9.1.5 contract test pass |
| 3 | Wire the v1 deck, explore and search to the service; add the Worth-the-Distance card style and the Long-Range Request flow; retire `list_members` (Ruling I5 interim) | v1 no longer loads the full member table or calls `list_members` |
| 4 | Taste learning, interaction log, and nightly rarity and liquidity jobs | A member's deck changes after about 15 swipes |
| 5 | Calibration from real data: tune θ, Φ, γ and the Roche constants with an offline replay of interactions. Add a per-region Gini of 7-day impressions as a fairness monitor | Far-card like-back rate ≥ ring-1 like-back rate; impression Gini ≤ 0.55 |
| 6 | Draft: Constellations (Appendix A), only in regions where L ≥ 2·L* for 4 consecutive weeks | Arena re-review passes |

**Golden-pair tests (must hold):**

1. Same neighbourhood with one shared common interest is eligible. Another state with the same single common interest is **not** eligible.
2. A pair 1,800 km apart sharing three rare interests (R ≥ 0.86) is a Worth-the-Distance card.
3. A one-sided obsession (A puts 18 points on X, B puts 1 point on X and 19 elsewhere) scores far lower than mutual passion.
4. A learn↔teach pair beats a play↔play pair with identical interests.
5. In a town with L = 5, ring-3 candidates with R = 0.55 become eligible. In a city with L ≥ 40 they do not.
6. No API response contains coordinates, a cell id, an email or a phone number of another member (enforced per endpoint by the §9.1.5 contract test).
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
