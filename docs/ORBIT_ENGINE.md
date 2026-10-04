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
| `interests[]` | `{ interest_id, points, mode }` | 1–12 interests, picked from the taxonomy (§3.1; level 3 or 4 only) or proposed as new nodes. Stored in `member_interest(member_id, interest_id, points, mode)`, written only by `set_member_interests(p_items jsonb)` and read back by the member only through `my_interests()` (§3.2) |
| `points` | int ≥ 1 | **Passion Budget:** each member spreads exactly **20 points** over their interests |
| `mode` | `learn \| play \| teach \| build` | How they relate to the interest. Defaults to `play` |
| `home_cell` | Scheme-tagged cell id. Now `grid1` level 7, `g7:<row>:<col>` (~2.3 km × 2.3 km, ~5.4 km²), with parents `g6:…` and `g5:…`; H3 res-7 from iteration 4 (§4.1, D-028) | Derived from a city pick or browser geolocation, snapped in Postgres. **Raw coordinates are discarded after snapping.** |
| `travel_cell`, `travel_until` | Same cell scheme as `home_cell`, timestamp | Optional temporary origin for travel ("Transit mode") |
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

**As stored** (`0004_orbit_onboarding.sql`, table `interest_node(id, parent_id, level, label, status)`):
- Ids are dotted slugs, one segment per level: `sports` (domain, level 1), `sports.racket` (category, level 2),
  `sports.racket.badminton` (interest, level 3), `sports.racket.badminton.doubles` (niche, level 4). A check
  constraint enforces `level` = number of segments and `parent_id` = the id without its last segment, so `topo` can
  be computed from the ids alone (parent/child = one id is a prefix of the other plus one segment; siblings share
  the level-2 prefix; same domain shares the first segment).
- Members pick only level 3 or 4 nodes. Domains and categories exist for browsing and for `topo`.
- `status` is `active` or `retired`. A retired node is never offered or accepted for new picks; ids are never reused.
- **Sensitive interests (D-029).** `sensitive = true` marks special-category topics: health and mental health,
  religion and spirituality, sexual orientation and gender identity, and sobriety or addiction recovery (and
  political affiliation, should such a node ever be added). They are private by default: they count toward
  resonance (§3.5) exactly like any other interest, but they are **never shown to another member**. They never appear
  in `profiles.skills` (the public display copy), on cards, in "You both: X" chips, in explanations (§6.3) or in
  search, and search never matches them. The owner still sees them through `my_interests()`. The seed marks 13
  nodes; the flag is reset from the seed list on every run of the migration.
- The seed is original Brivia wording, India-relevant: 13 domains, 62 categories, 327 interests and 30 niches
  (432 nodes). Anyone may read the taxonomy (`anon` and `authenticated` have `select`).

### 3.2 Passion Budget

The budget turns every interest into a weight that **sums to 1 per member**: `p_u(i) = points_u(i) / 20`.

Enforced in the database by `set_member_interests(p_items jsonb)` (SECURITY DEFINER, volatile, `authenticated`
only; needs a profile row). It accepts 1–12 items `{ interest_id, points, mode }` with distinct, active, level ≥ 3
ids, integer points ≥ 1 that sum to exactly 20, and a mode in `learn | play | teach | build` (missing means `play`).
Any violation raises `22023 invalid interests` and leaves the earlier set untouched; a valid call replaces the set
atomically and writes the labels into `profiles.skills` (points desc, then label asc) as a display copy.

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

- Only `home_cell` (a level-7 cell, ~5 km²) and its two parents are stored, in `member_orbit` together with a
  `cell_scheme` tag. Distance is the great-circle (haversine, R = 6371.0088 km) distance between cell centroids.
- **Cell scheme `grid1` (D-028, normative).** h3-pg is not available on the project, so cells come from an
  equal-area latitude/longitude grid computed in SQL (`0004_orbit_onboarding.sql`, `brivia_grid_cell`):
  - level L has `n_L` rows per degree of latitude: **48 for g7, 16 for g6, 16/3 for g5**;
  - `row = least(floor((lat + 90) · n_L), 180·n_L − 1)`, centre latitude `φc = −90 + (row + 0.5)/n_L`;
  - `ncols = greatest(1, floor(360 · n_L · cos(radians(φc))))`, `col = floor((lng + 180)/360 · ncols) mod ncols`;
  - id `'g' || L || ':' || row || ':' || col`; centroid `(φc, −180 + (col + 0.5) · 360/ncols)`;
  - a **parent** is the snap of the child's centroid at the coarser level (approximately nested, as H3 is);
  - non-finite or out-of-range input, or a level other than 5–7, raises `22023 invalid location` (no value in the message).
  - A g7 cell is about 2.32 km × 2.32 km. The poles, lng ±180 and the antimeridian all give valid cells, and two
    points either side of the antimeridian are ring 0.
- **Migration to H3 (iteration 4).** `member_orbit.cell_scheme` is `'grid1'` now. The ORBIT service backfills
  `h3 = latLngToCell(gridCentroid(home_cell), 7)` once per member (through `orbit_store_home_cell`) and sets
  `cell_scheme = 'h3r7'`. The displacement is at most half a g7 diagonal (~1.64 km), below the ring-0 radius. If
  h3-pg appears, `set_home_location` switches to `h3_lat_lng_to_cell` with the same signature and the backfill runs
  in SQL. `orbit/src/rings.js` gains a scheme adapter then; it is unchanged in iteration 3.
- Clients only ever receive a **rounded distance band** ("< 3 km", "~5 km", "~25 km", "Mumbai", "Maharashtra",
  "India", "abroad"). Never coordinates, and never a cell id.
- Travel mode replaces `home_cell` with `travel_cell` until `travel_until`.
- Location enters only through a server-side snap (`set_home_location`, at most 3 home or travel changes a day), and
  a candidate in a sparsely populated cell is shown at a coarser cell level (g6, then g5; k = 10 for rings 0–1,
  k = 5 beyond; §9.1.4).

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

**Request caps and consent rules (database: `0003_trust_hardening.sql`, and since Iteration 3
`0004_orbit_onboarding.sql` section 6; Ruling A1, D-026, D-032).**
- **One send path.** Members send a request only through `send_signal(p_to, p_note)` (SECURITY DEFINER, POST only).
  Raw client inserts into `connection_requests` are revoked. The sender must be completed (§7); otherwise the call
  fails with `22023 'complete your profile'`. A null or own `p_to` fails with `22023 'invalid signal'`, and a note
  over 500 characters with `22001`. None of these is charged.
- **The sender's own quota is honest.** A sender may send at most **30 signals per rolling 24 hours** and hold at
  most **100 live unanswered** targets. Both limits are private config (`brivia_config` keys `signal_daily_limit` and
  `signal_live_limit`, owner only). Over a cap the send fails **visibly** with `PT429` (HTTP 429) and the message
  `signal_quota_exhausted` (daily) or `signal_live_cap` (live), and nothing is charged. `my_signal_quota()` returns
  the caller's `daily_limit`, `remaining`, `resets_at`, `live_unanswered` and `live_limit`.
  - The quota is counted from the **sender-only ledger** `signal_ledger(sender_id, to_id, kind, at)` (RLS on, no
    client grants). Each send writes one row **before** anything about the recipient is looked at. `to_id` has no
    foreign key, so an attempt at an id that does not exist is charged and kept like any other.
  - *Daily:* rows of kind `signal` in the last 24 h. `resets_at` is the moment the oldest of them leaves the window,
    **rounded up to the hour** (coarse on purpose, so a scripted sender cannot pace to the second). It is null when
    nothing was used.
  - *Live unanswered:* distinct `to_id` in the ledger (any kind) within 30 days that have no match with the sender.
    A declined, blocked or non-existent target stays live for its 30 days, exactly like an unanswered one.
- **Recipient-side outcomes are uniform and silent.** A target who blocked the sender or was blocked by them, a
  target in the other test world, a duplicate (a live earlier request), a target who declined, a target who is not
  completed, and an id that does not exist all answer `status = 'sent'` and cost exactly one unit, the same as a
  normal target. Only a visible target (`brivia_visible_to`, §7) gets a `connection_requests` row. `send_signal` writes
  **no `interaction` row** on any path, so the sender's response, quota and interaction rows cannot probe recipient
  state. The response is `matched` exactly when a match row for the pair exists afterwards, on every path: the
  sender can already read that row, so an existing match answers `matched` even if the partner has since blocked the
  sender, moved worlds or stopped being completed (otherwise `matched` vs `sent` would leak that change). A **new**
  match is only ever created on the visible path.
- A request that **completes a match** (a live pending or declined request from the visible target to the sender
  already exists) is never refused by either cap, and it still costs one unit (`remaining` stays at 0).
- **Completion gates every consent path.** `brivia_has_completed_profile()`, used by the request, message, match and
  post policies and by the (owner-run) `public_profiles` view, means `brivia_member_completed(auth.uid())`, and
  `respond_connection_request` refuses a caller who is not completed (`22023 'complete your profile'`). A request
  **from** a sender who is no longer completed is hidden from the recipient's Requests list and answers
  `respond_connection_request` like a request that does not exist, so accepting and liking back agree. The completion-gated policies evaluate the check once per statement.
- **Ledger pruning.** The owner-only `purge_expired_requests()` also deletes `signal_ledger` rows older than 30 days
  (no counter reads them). It still returns the number of request rows deleted.
- The iteration-2 rule that dropped an over-cap request **silently** (no error, the usual "Signal sent") is replaced
  by the honest own quota above (D-026 supersedes D-019 in part).
- **The sender never sees a decline.** Senders read their outgoing requests only through
  `my_outgoing_requests()`, which shows a declined request as pending. A re-signal to a live declined request
  answers `sent` and costs one unit, exactly like a re-signal to one that is still pending, and both expire at 30
  days. One consequence: the
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
  members who are not completed, blocked pairs in both directions, and the other test world (test and real members
  never see, request or message each other); a caller who is not completed gets nothing. Community posts follow the
  same block, world and completed rules for both the caller and the author (own posts always visible). ORBIT's deck
  and search replace `list_members` and `search_members` in phase 3 and must keep these exclusions.
- **Completed (Iteration 3, D-030, `0004_orbit_onboarding.sql` section 4).** `brivia_member_completed(id)` is true
  when the member has:
  - a name: trimmed, not empty and not 'New Member' (`brivia_is_completed(name, 'x')`); the legacy `city` column plays
    no part;
  - a home cell (a `member_orbit` row, §9.1.4);
  - 1–12 `member_interest` rows whose points sum to exactly 20 (the Passion Budget, §3.2).

  It reads `member_interest` and `member_orbit` only, never `profiles.skills` (a client-writable display copy).
- **One visibility rule.** Every member-facing visibility check goes through `brivia_visible_to(viewer, target)`: both
  completed, different members, same world (`is_test` equal) and no block in either direction. `get_candidates`,
  `search_members`, `list_members` and `brivia_can_see_author` are built on it (signatures, caps, ordering and
  escaping unchanged), and every later candidate RPC (the interim deck, ORBIT's `orbit_cards`) must use it too.
  `brivia_member_completed` and `brivia_visible_to` are internal: no client role may execute them.
- **The interim deck (Iteration 3, D-033, `0004_orbit_onboarding.sql` section 7).** Until ORBIT serves the deck
  (phase 3), `deck_candidates(p_limit default 12)` is the location-first deck. It is a SQL RPC and ports none of
  ORBIT's formulas (`R`, the gate, the Roche Limit).
  - **Pool:** every target `brivia_visible_to(caller, target)` whose true ring (§4.2, km between the g7 cell
    centroids) is 0–2. Hidden: members the caller is matched with; members in the caller's `signal_ledger` within
    30 days, or with a live outgoing request from the caller; members the caller passed (`interaction` `pass`) within
    7 days. Only `cell_scheme = 'grid1'` rows take part (caller and target); another scheme is skipped, never an
    error. A caller who is not completed (or no session) gets no rows. `p_limit` is clamped to [1, 20].
  - **Order (D-034):** the k-safe display ring (the ring the card's band shows, below) ascending, then the
    shared-interest count descending (the exact same `interest_id` held by both), then `md5(caller || target)`. The
    band is computed for the whole pool before the limit, and the true ring is never an ordering key: a sparse
    ring-0 card coarsened to the place name sorts with the other place-name cards, so its position cannot reveal what
    its band hides. In sparse areas the order is therefore the shared count within the place band.
  - **Sensitive and retired interests never count.** The shared count and the labels use only active,
    non-sensitive nodes (D-029). A shared sensitive interest therefore changes neither a chip nor a card's position
    (ORBIT may later let it raise `R`, §9.1.5; the interim deck does not).
  - **`shared_interests`:** at most 2 labels ("You both: …"), by summed points of both members descending, then
    label ascending.
  - **`distance_band`:** k = 10 when the true ring is ≤ 1, else 5. The level is g7 if `brivia_cell_ok(target g7,
    world, k)`, else the target's stored g6 parent, else its g5 parent, else the place (§9.1.4). The display ring is
    the true ring at g7; `greatest(2, ring(distance between the caller's and the target's cells at that level))` at
    g6 or g5; `greatest(2, true ring)` at the place. Labels: 0 `~3 km`, 1 `~10 km`, 2 the target's place name,
    3 its region, 4 its country, 5 `Abroad`; also `Abroad` when the target's place is in another country than the
    caller's. So `~3 km` / `~10 km` appear only when the target's own g7 cell meets k.
  - **`deck_status()`** says why the deck is empty, never with a count: `complete_profile` (caller not completed),
    `no_members_yet` (no member of the caller's world is visible to the caller), otherwise `caught_up`.
- **Onboarding progress.** `my_onboarding_status()` returns, for the caller only, `interests` (count), `points` (sum),
  `has_cell`, `place_label` (the place name of the cell, never the cell id) and `completed`. It carries no interest
  labels, so sensitive interests (D-029) never appear in it.
- **Card data members cannot forge (Iteration 2 final review, Ruling I11).** `created_at` on profiles, posts and
  messages is the server clock for every member session (only the owner/seed may set it), so "newest first" cannot
  be gamed by a backdated or future-dated row; members edit only a post's caption. `photo_url`, `cover_url` and post
  `image_url` must be this project's public Storage URL for the right bucket and the owner's own folder (or a
  bundled preset cover), and the client renders them only from the Supabase origin, so a card image can never be a
  third-party tracking pixel. ORBIT's `orbit_cards` returns the same `photo_url` and relies on the same rule.
- **Long-Range Request:** to request someone in ring ≥ 3 who has not liked you, you spend one of **5 weekly long-range
  signals**. The weekly counter uses the same sender-only ledger as §6.4, with rows of `kind = 'long_range'`
  (Worth-the-Distance signals use `kind = 'wtd'`), and follows the same rules: charged before any recipient lookup,
  uniform recipient outcomes, and an honest visible failure only for the sender's own limit. The request must include a note. The recipient sees the resonance chips and can accept or decline.
  Declines are private.
- Acceptance and decline feed the taste model of both members. A member whose long-range acceptance rate stays
  below 15% over 20 or more requests gets a lower weekly quota (anti-spam).

---

## 8. Learning (reused from engine v1, adapted)

- Every like, pass, request, accept, decline and reply is an interaction row with the served feature vector
  (`brivia-club/server/src/engine/index.js` pattern).
- Client-written interaction rows are the member's own actions only, and `met`, `letgo`, `accept` and `decline` are
  accepted only with backing evidence (a match, or a request addressed to the member). Clients write only
  `viewer_id`, `target_id` and `event`, and never read impression rows or the `features`, `score`, `propensity`,
  `model_version` and `context` columns. Offline evaluation takes served features from service-written `impression`
  rows (§9.1.6).
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
   │  role orbit_svc (never service_role, never impersonates a member): p_viewer definer functions (§9.1.3); cards leave only via toCard
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

*Design accepted in Iteration 2 (D-025, Ruling I10); built in Iteration 4. Nothing in this section exists in code
yet, except the member-side `interaction` restrictions in `0003_trust_hardening.sql`.* The service is the only
process that sees cells, exact cell-to-cell km, `G`, headroom and served features. Its job at the boundary is to make
sure none of that leaves, and that it never acts for a member it has not verified.

**Threat model.** In scope: a malicious member (forged or replayed token, enumeration, location triangulation,
scraping, reading their own logged model outputs), and a compromised or buggy service (over-broad DB rights, leaky
serializer, logs). The service is trusted with every member's cell by design: `orbit_candidate_pool` must return
candidates' cells for ring retrieval to work, so a compromised service learns every member's cell (never
coordinates). That is inherent and accepted; everything else is kept out of its reach.

#### 9.1.1 Database role `orbit_svc`

The service connects as its own login role. It is **never** `service_role`, `postgres` or any role with `BYPASSRLS`,
and it **never impersonates a member** (Ruling I10): it has no membership in `authenticated` or `anon` and never
uses `SET ROLE`.

```sql
create role orbit_svc login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
  connection limit 20;                       -- password from the secret store, rotated; never in the repo
grant usage on schema public to orbit_svc;
-- no "grant authenticated to orbit_svc", no table grants: only the functions below
```

The service reads and writes only through narrow SECURITY DEFINER functions, each granted `execute` to `orbit_svc`
only (`revoke all ... from public, anon, authenticated`). Each takes the viewer explicitly as `p_viewer uuid`, the
`sub` of a JWT the service verified (§9.1.2). The functions do not trust `p_viewer` to be a real member: they re-check
that the viewer has a completed profile (Ruling I3) and return nothing otherwise.

| Function | Kind | Returns / does |
|---|---|---|
| `orbit_candidate_pool(p_viewer uuid, p_cells text[], p_limit int)` | `stable`, read-only | Eligible candidates for the viewer: `id`, effective cell (travel cell while `travel_until > now()`), `capacity_k`, `load`, `headroom`, activity signals and `member_interest` rows. Never name, email, phone, `is_test` or `about`. |
| `orbit_cards(p_viewer uuid, p_ids uuid[])` | `stable`, read-only | Card columns only (`id`, `name`, `photo_url`, `city`, `state` for `placeLabel`) for at most 50 ids. |
| `orbit_viewer(p_viewer uuid)` | `stable`, read-only | The viewer's own effective cell, capacity, headroom and interests (needed to score). |
| `log_impressions(p_viewer uuid, p_rows jsonb)` | `volatile`, the only write | Appends `impression` rows (§9.1.6). |
| `orbit_store_home_cell(p_viewer uuid, p_cell text)` | `volatile` | Only for the h3-js fallback in §9.1.4. |

`orbit_candidate_pool`, `orbit_cards` and `get_candidates` apply the same exclusions (viewer completed, target
completed, not self, same world, no block in either direction; Rulings I3, I5, P14) through **one shared helper**
`brivia_visible_to(p_viewer, p_target)`, so the member RPCs and the service cannot drift apart. Engine-private reads
(`interest_node`, `rarity_cache`) and engine state writes (`taste_profile`, `orbit_resolution`, Iteration 4) also go
through definer functions of the same shape, never table grants.

orbit_svc must **never** have: any grant on `profiles` (so no `email`, `phone`, `phone_country_code`,
`phone_number`, `is_test`); any access to the `auth`, `storage` or `vault` schemas; any access to `brivia_messages`,
`connection_requests` (including notes), `matches`, `brivia_blocks` or `career_applications`; `execute` on member
RPCs, `purge_*` or seed functions; `create` on any schema; membership in `authenticated`, `anon`, `service_role` or
`postgres`.

**Blast radius of a stolen orbit_svc credential:** public card data (name, photo, city, state), interests, cells
and engine state of every member, and the ability to **forge impression rows** for any viewer (including made-up
features, scores and propensities). It can never read email, phone, messages, requests, matches or blocks, and can
never like, request, message, block or edit a profile as anyone. Forged impressions can poison offline evaluation
and learning; mitigations: impression rows carry `model_version` and a config hash the trainer checks against
deployed versions, the trainer drops impressions with no matching served request id in the service's own request
log, and orbit_svc sessions are audited.

Supabase's default privileges grant every new `public` table to `anon` and `authenticated`. Every engine-table
migration must therefore `revoke all ... from public, anon, authenticated` and enable RLS explicitly, so
`member_orbit` (cells, load, headroom) stays member-unreadable and member-unwritable. A local test asserts it.

#### 9.1.2 Verifying the member

- Every request carries the member's Supabase access token (`Authorization: Bearer`). The service verifies it
  **locally** against the project JWKS (`https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`), never trusts an
  unverified token's claims, and never takes a viewer id from the request body or query.
- **Asymmetric keys are a prerequisite.** Projects created before Supabase's asymmetric signing keys sign with a
  shared HS256 secret; this project must move to asymmetric JWT signing keys before ORBIT goes live. The service holds
  no HS256 secret. Algorithm allowlist: `ES256`, `RS256`. `HS256` and `none` are rejected, and the header `alg`
  must match the JWK's `kty`/`alg`.
- Checks, all required: a `kid` header is **present** and names a JWKS key (no `kid` → 401; never "try every key");
  valid signature; `iss` equals the configured issuer (`ORBIT_JWT_ISSUER`, e.g. `https://<ref>.supabase.co/auth/v1`,
  never derived from the token); `aud` = `authenticated`; `role` = `authenticated` (`anon` and `service_role`
  tokens are refused); `exp` in the future, `nbf` (when present) and `iat` not in the future, with at most 30 s
  clock skew; `sub` is a UUID; `is_anonymous` is not true. `sub` is `p_viewer`.
- **JWKS cache:** keys cached and refreshed every 10 minutes; an unknown `kid` triggers at most one refetch per
  minute. A key that disappears from the JWKS (revoked or rotated out) is trusted for at most 10 more minutes, then
  dropped. If no cached key can verify the token and the JWKS endpoint is unreachable, respond **503**. There is no
  fallback to an unverified, partially verified or cached-decision path.
- **Sign-out and revocation:** a Supabase access token stays valid until `exp` even after sign-out. Either the
  project's access-token lifetime is set to 10–15 minutes before go-live, or the service checks the token's
  `session_id` through `orbit_session_alive(session_id)` (a definer function reading only `auth.sessions` existence;
  result cached for 60 s). The shorter lifetime is preferred because it needs no `auth` access at all.

#### 9.1.3 Calling the database for a member

Ruling I10: the service passes the verified `sub` as `p_viewer`; it never sets `request.jwt.claims` and never
switches role.

```sql
-- one read-only transaction per deck, search or explain request
begin read only;
select * from orbit_viewer($1);                              -- $1 = verified sub, a bound parameter
select * from orbit_candidate_pool($1, $2, 300);             -- $2 = cells of rings 0..5 (§9 retrieval)
-- score and compose in Node, then fetch display columns for the final ids only:
select * from orbit_cards($1, $3);
commit;
-- separate short transaction for the one write:
select log_impressions($1, $4);
```

- All three read functions are `stable` and the read transaction is `read only`, so a bug in the service cannot
  write during a deck build. `log_impressions` is the single append.
- Fixed statements only (no dynamic SQL, every value a bound parameter); Supavisor transaction mode; no session
  state.
- **Member writes never go through the service.** Likes, passes, requests, accepts, messages, blocks and profile
  edits stay client → Supabase with the member's own JWT, where RLS, the request triggers and the consent rules apply.
- `orbit_cards` re-applies the exclusions at the end of the build, so a block, unmatch or world change between
  pool and response drops the card. **Optional hardening:** re-check the final ids through PostgREST
  `get_candidates` with the member's own bearer token, so the member-facing rules themselves vouch for the deck.

#### 9.1.4 Location

- Location enters only through `set_home_location(lat double precision, lng double precision)`: SECURITY DEFINER,
  **`volatile`**, executable by `authenticated`. PostgREST serves a volatile function only on `POST`, so coordinates
  travel in the request body and never in a query string. It rejects non-finite or out-of-range values, snaps to the
  **level-7 `grid1` cell** server-side (`brivia_grid_cell`, pure SQL, §4.1 and D-028; H3 res-7 from iteration 4) and
  upserts `member_orbit(member_id = auth.uid(), cell_scheme, home_cell, home_cell_g6, home_cell_g5, place_id,
  home_set_at)`. Coordinates are never stored, logged, echoed back or put in an error message. The member
  reads back only a place label (the nearest `place` name), never the cell id. Invalid input (non-finite or out of
  range) raises `22023 invalid location` and consumes no change; a caller without a profile row gets
  `P0002 profile required`.
- **The snap is in SQL until iteration 4** (`0004_orbit_onboarding.sql`, D-028). `set_home_location` computes the
  g7 cell and its g6/g5 parents with `brivia_grid_cell` / `brivia_grid_parent` inside the database; the grid helpers
  are not executable by any client role.
- **`set_home_city(p_place_id text)`** is the "Pick my city" fallback (geolocation denied, timed out or missing). It
  has the same rules (SECURITY DEFINER, volatile, `authenticated` only, profile required, shared cap) and stores the
  cell of the place's centroid with that `place_id`. An unknown id raises `22023 invalid place`. Clients read place
  names from `place(id, name, region, country, is_launch)`; its centroid columns are never granted.
- **No parameter logging:** the project sets `log_parameter_max_length_on_error = 0` and
  `log_parameter_max_length = 0`; neither pgaudit nor auto_explain logs parameters (`auto_explain.log_parameter_max_length = 0`
  if enabled). A pre-launch test calls `set_home_location` with a known coordinate (e.g. `12.971598, 77.594566`),
  forces an error path too, and greps the Postgres, API-gateway and service logs for it; any hit fails the check.
  The local harness does this on every run: it starts Postgres with `log_min_error_statement=error`,
  `log_parameter_max_length=0` and `log_parameter_max_length_on_error=0`, sends the probe only as psql `\bind`
  parameters (success path and over-cap path), and fails if the coordinate appears in the server log.
- From iteration 4, if h3-pg is still not available, the service may expose `POST /v1/location` (JSON body only): it
  snaps in memory with h3-js, discards the coordinates, and calls `orbit_store_home_cell(p_viewer, p_cell)`, which
  validates a res-7 cell (and sets `cell_scheme = 'h3r7'`). That endpoint is excluded from body capture in every proxy, APM and error tracker (Sentry
  `sendDefaultPii: false`, request body scrubbing on that route).
- `member_orbit` has RLS on and no grants to `anon` or `authenticated`; members cannot read or write it except
  through these functions. Travel mode uses the same rules (`set_travel_location`, `travel_until` ≤ 30 days).
- **Rate limit:** at most 3 location changes per member per rolling 24 h, **shared by home and travel** changes
  (counted in `location_change(member_id, at)`, no cell stored; the very first set counts). Changes are serialised
  per member by an advisory lock. Over the cap the call fails with errcode **`PT429`** and the generic message "try
  again later" (PostgREST answers HTTP 429), before anything is written: `member_orbit` and the place label stay
  unchanged. This blunts triangulation by moving one's own pin and re-reading distance bands.
- **k-anonymity floor.** The population of a cell counts only members of the viewer's world who are completed
  (`brivia_member_completed`, §7), whose account is older than 14 days at the refresh date and who are not flagged
  (reported or restricted), so a burst of fresh sybils cannot fill a cell. Until moderation tooling exists, "flagged"
  means a row in the owner-only `member_flag(member_id, reason, flagged_at)` table. Floors: **k = 10** for a candidate
  who would be shown in ring 0 or 1, **k = 5** for rings 2+. When the candidate's g7 cell is below k, the band is
  computed from the stored parent **g6** cell (centroid to centroid; `home_cell_g6`), then the stored **g5** cell
  (`home_cell_g5`) if that is still below k, and only then the region `placeLabel`. (Under H3 from iteration 4: res-6,
  then res-5.) Coarsening never yields a number derived from exact km, and any ring-0/1 chip ("~3 km away") is
  suppressed while coarsened. Scoring still uses the true ring; only what leaves the service is coarsened.
- **No band flips:** a cell's coarsening level only goes up quickly and comes down slowly. Populations live in the
  owner-only `cell_density(cell, is_test, n, streak10, streak5, ok10, ok5, as_of)` table (RLS on, no client grants),
  one row per g7, g6 and g5 cell and world. `refresh_cell_density(p_as_of date default current_date)` (owner only;
  scheduled nightly with pg_cron) recounts every cell that has members, plus every existing row. Counts group by
  the **stored** `home_cell`, `home_cell_g6` and `home_cell_g5` columns of `member_orbit`; parents are never
  re-derived, because grid parents are only approximately nested. Per row and per k: `streakK` is the previous
  night's `streakK + 1` while `n ≥ k`, and 0 when `n < k`; `okK` is `streakK ≥ 7`. So a cell becomes ok only after
  **7 consecutive nightly counts** at or above k; **a missed night restarts the streak** (when `as_of` jumps by more
  than one day, the count restarts at 1, or 0 below k). It stops being ok at the first count below k. The refresh has
  a global watermark: if any row already has `as_of ≥ p_as_of`, it does nothing and returns 0, so a same-day or older
  re-run is a true no-op. Rows left with `n = 0` and both streaks 0 are deleted. `brivia_cell_ok(cell, is_test, k)`
  (internal) reads `okK`; a missing row or any other k is false.

#### 9.1.5 What leaves the service

- **`toCard` is the only serializer** (`orbit/README.md`). Route handlers return `Card[]` only; a `Scored` object,
  deck or hit list never reaches the HTTP layer. Response envelope: `{ cards, nextCursor, deckId }`.
- **Contract test** (extends Golden 6): for every endpoint, against seeded fixtures, the response's card keys equal
  exactly `id, name, photoUrl, distanceBand, matchPercent, chips, worthTheDistance`; no value anywhere matches an H3
  index (`/^8[0-9a-f]{14}$/i`), a `grid1` cell id (`/^g[5-7]:\d+:\d+$/`), a coordinate pair, an `@` or a phone-shaped digit run; no key is `km`, `G`, `cell`,
  `lat`, `lng`, `email`, `phone*`, `headroom`, `load` or `ring`. A failing contract test blocks deploy.
- **Interim deck contract (Iteration 3, `supabase/tests/orbit-deck.test.sql`).** Until ORBIT serves the deck, the
  `deck_candidates` row keys equal exactly `id, name, photo_url, cover_url, experience, skills, looking_for,
  distance_band, shared_interests`. No row's JSON matches `8[0-9a-f]{14}`, `g[5-7]:\d+:\d+`, `-?\d{1,3}\.\d{3,}` or
  `@`; no value other than `id` and the image URLs matches `\d{10}` (a uuid can hold ten digits); and no key is `city`, `state`, `cell`, `km`, `lat`, `lng`, `ring`, `email`, `phone` or `is_test`. A
  pair whose only shared interests are sensitive (or the retired harness fixture) gets an empty `shared_interests`.
  The true ring is used for the pool and the band, never returned and never an ordering key (D-034). `deck_status()` returns a reason code, never a count.
- **Sensitive interests never leave the service (D-029).** No card, chip, explanation or search hit carries the
  label or id of an `interest_node` with `sensitive = true`, and search never matches one. A shared sensitive
  interest may raise `matchPercent` (it counts toward resonance), but the chips must then name only non-sensitive
  shared interests, or none. The contract test seeds a pair whose only shared interest is sensitive and asserts that
  no response contains its label or id.
- **Members never read model outputs.** In `interaction`, members can select only `id`, `viewer_id`, `target_id`,
  `event` and `created_at` of their own non-impression rows, and can insert only `viewer_id`, `target_id` and `event`
  (`0003_trust_hardening.sql`). An impression's `context.ring` would reveal what the k-anonymity floor hides.
- **Logs carry ids only:** request id, viewer id, candidate ids, endpoint, status, latency, model version. Never
  names, cells, km, coordinates, tokens, emails or feature values. Error responses are generic.
- **Health:** `GET /healthz` (process alive, no dependencies) and `GET /readyz` (DB reachable as orbit_svc, a JWKS
  key cached, config loaded). Neither needs auth, and neither returns data.
- **Rate limits** per verified viewer (`sub`): deck 30/min, search 20/min, explain 60/min; per IP for requests that
  fail verification. Over the limit: 429 with `Retry-After`.
- **Deck cache** keyed `(viewer, cell, day)` (day in the viewer's local date; the key also carries the model
  version and config hash). It holds cards plus their impression metadata, is never shared between viewers, and
  expires at the end of the day. A location change produces a new key; a block, unblock, match, unmatch or profile
  change evicts the viewer's entries. Cached cards still pass through `orbit_cards` before they are served.

| Failure | Response |
|---|---|
| JWKS unreachable and no cached key verifies the token | 503 (never an unverified fallback) |
| Token invalid, expired, no `kid`, wrong `iss`/`aud`/`role`/`alg`, anonymous, dead session | 401 |
| Caller not a completed profile | 200 with an empty deck and a reason code (`complete_profile`) |
| Database unreachable | 503; a cached deck is not served, because the `orbit_cards` re-check cannot run |
| Scoring error or non-finite output | 500; never a fallback to unranked raw rows |
| Rate limit | 429 with `Retry-After` |
| Location over the 3/day cap | `PT429` "try again later" (HTTP 429 through PostgREST) |

#### 9.1.6 Impression logging

- `log_impressions(p_viewer uuid, p_rows jsonb)`: SECURITY DEFINER, `execute` granted to `orbit_svc` only. It sets
  `viewer_id = p_viewer` and `event = 'impression'` itself; neither is taken from `p_rows`. It accepts at most 30
  rows per call, skips a target that is the viewer, not visible to the viewer (`brivia_visible_to`), and enforces the
  table's `features` size and `propensity` range checks. **The service can forge impression rows** for any viewer;
  see the blast-radius paragraph in §9.1.1.
- Each row records `target_id`, `features` (the served feature vector), `score` (`G`), `propensity`,
  `model_version`, and `context` = `{ request_id, deck_id, position, lane: "ranked"|"explore"|"wtd", ring, holdout,
  policy, salt_version, config_hash }`. `holdout` and `policy` are on **every** row. `ring` is the ring number, never
  the cell or km.
- **Propensity, honestly.** Ranked and Worth-the-Distance slots are deterministic given the inputs, so their
  propensity is **1**: they carry no counterfactual information. A deck includes an explore card with probability
  ε (deck level, §6.2 step 5); the explore card is drawn uniformly from the explore set (eligible members outside the
  top ranks), so its propensity is **1 / |explore set|** (and `context` records ε). Offline replay and off-policy
  evaluation use **only the explore lane plus the holdout**; ranked impressions are used for monitoring, not for
  unbiased estimates.
- **Holdout (critic C5):** a viewer is in the holdout when the first 8 bytes of `sha256(salt ‖ viewer_uuid)`, read
  as an unsigned big-endian integer, mod 100 is < 5. The salt is private config with a version tag (`salt_version`,
  logged on every row) so the holdout can be re-drawn without mixing populations. Holdout viewers get a baseline
  policy (ring-ordered, gate applied, no taste or Roche reordering).
- Client rows can no longer carry `deck_id` or features (§9.1.5). Offline evaluation attributes a client like,
  pass or request to the latest service impression of the same `(viewer_id, target_id)` before it (within 7 days)
  and uses only the service's `features`, `score` and `propensity` (§8).

---

## 10. Rollout plan

| Phase | Deliverable | Done when |
|---|---|---|
| 0 | P0 fixes in v1: `public_profiles` view without email/phone, mutual-consent connections | No client can read another member's email or phone; a one-sided like opens no chat |
| 1 | Data: interest taxonomy seed (~400 nodes, India-relevant), onboarding for Passion Budget and modes, coarse location capture through `set_home_location` (snapped in SQL to a `grid1` g7 cell, D-028) with the k-anonymity floor (§9.1.4; Iteration 3); a place list (`place`: state capitals, metros, world metros; launch cities Bengaluru, Mumbai, Delhi, Pune) | New members have interests, points and a cell; no coordinates stored; only `place` holds coordinates (public city centroids, never granted to clients) |
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
