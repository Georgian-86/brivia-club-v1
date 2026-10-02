# ORBIT Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure, fully tested JavaScript library that implements every ORBIT formula in the spec: resonance, rings,
the escape gate, the Roche Limit, deck composition and explanations. The Node service (next plan) wraps it.

**Architecture:** A new `orbit/` package in this repo. It is ESM, has no database and no I/O, and every module is a set
of pure functions over plain objects. Constants come from one config module with private overrides (trade secret).
Tests use `node:test` and encode the spec's golden-pair tests.

**Tech Stack:** Node 22 (ESM, `node --test`), `h3-js@4` (the only dependency).

**Spec:** `docs/ORBIT_ENGINE.md` v0.2. Every number below is copied from it. If code and spec disagree, the spec wins;
if the spec must change, change it in the same commit (CLAUDE.md).

## Global Constraints

- Only one runtime dependency, `h3-js`. Everything else uses Node built-ins.
- No function returns or logs coordinates, a cell id, an email or a phone number of a member *other than the caller*.
  Card serialization is a whitelist (Task 7).
- Every constant lives in `orbit/src/config.js`. If `ORBIT_CONFIG_PATH` points to a JSON file, its values override
  the defaults (production calibrated values, kept private).
- File header on every source file: `// © 2026 The Brivia Club. ORBIT engine. All rights reserved. See docs/IP_NOTES.md.`
- Taste learning, the database, HTTP and the UI are **out of scope** for this plan.

## Review Focus

1. **A member with zero interests or zero points** gets `R = 0` and never throws (no division by zero in passion weights or the harmonic mean).
2. **The same cell for both members** (distance 0 km) is ring 0, not NaN.
3. **A candidate list smaller than the deck size**, or empty, returns a shorter deck or `[]`, with no undefined slots at positions 4 and 9.
4. **Liquidity L above L\*** never *raises* a threshold (the relaxation term is clamped at 0).
5. **Unknown interest ids** (not in the topology) match only by exact id, as spec §3.1 requires for unplaced interests.

---

### Task 1: Package scaffold and config

**Files:**
- Create: `orbit/package.json` (`"type":"module"`, `"scripts":{"test":"node --test"}`, dependency `h3-js@^4.5.0`), `orbit/src/config.js`, `orbit/test/config.test.js`
- Modify: `CLAUDE.md` Commands section (add `cd orbit && npm test`)

**Interfaces:**
- Produces: `loadConfig(overrides?: object) → Config`, plus `DEFAULTS`, with these keys:
  - `topo: {same:1, parentChild:0.85, sibling:0.55, domain:0.2}`
  - `mode` (the 4×4 matrix from §3.4, keyed `learn|play|teach|build`)
  - `budget: 20`, `maxInterests: 12`
  - `rarity: {floor:0.35, span:0.65}`
  - `semanticShare: 0.25`, `squashK: 3`
  - `rings` as km upper bounds `[3,15,60,350,2500,Infinity]`
  - `phi: [1,0.92,0.8,0.62,0.48,0.38]`
  - `theta: [0.15,0.25,0.40,0.62,0.74,0.82]`, `alpha: [0,0,0.12,0.18,0.18,0.15]`, `lTarget: 40`, `thetaFar: 0.86`
  - `gamma: 1.3`
  - `deck: {base:12, min:8, wtdSlots:[3,8], wtdMax:2, localShare:0.7, mmrLambda:0.8, epsilon:0.15}`
  - `roche: {kChoices:[2,3,5,8], kDefault:5, likeWeight:0.5, orbitWeight:1, eFloor:0.35, eSpan:0.65, eExp:0.7, likeTtlDays:10, orbitIdleDays:21, metPerWeek:3, minLikerAgeDays:3}`
  - `h3Res: 7`

- [ ] **Step 1: Write failing test** `config.test.js`:
  - `assert.deepEqual(loadConfig().theta, [0.15,0.25,0.40,0.62,0.74,0.82])`
  - `assert.equal(loadConfig({gamma:2}).gamma, 2)`
  - with `ORBIT_CONFIG_PATH` set to a temp JSON `{"thetaFar":0.9}`, `loadConfig().thetaFar === 0.9`
- [ ] **Step 2:** `cd orbit && npm install && npm test`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `config.js`. Deep-merge `DEFAULTS` ← the file at `ORBIT_CONFIG_PATH` (read synchronously, if set) ← `overrides`. Freeze the result.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** "orbit: scaffold package and config".

### Task 2: Interest topology

**Files:** Create `orbit/src/topology.js`, `orbit/test/topology.test.js`

**Interfaces:**
- Produces:
  - `buildTopology(nodes: {id, parentId|null, level: 'domain'|'category'|'interest'|'niche'}[]) → Topology`
  - `topo(t: Topology, i: string, j: string, cfg) → number`

- [ ] **Step 1: Failing tests.** Use the fixture Sports → Racket sports → {Badminton → Doubles badminton, Tennis}, plus Sports → Team sports → Football, and Music → Strings → Guitar. Expected:
  - `topo(Badminton, Badminton) = 1`
  - `topo(Badminton, Doubles badminton) = 0.85` (in both orders)
  - `topo(Badminton, Tennis) = 0.55`
  - `topo(Badminton, Football) = 0.2`
  - `topo(Badminton, Guitar) = 0`
  - `topo('unknown-x', 'unknown-x') = 1`
  - `topo('unknown-x', Badminton) = 0`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Precompute the ancestor chain per node. Siblings means the same `category` ancestor; domain means the same `domain` ancestor. Parent/child means a direct parent link.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** "orbit: interest topology".

### Task 3: Resonance (§3.2–3.6)

**Files:** Create `orbit/src/resonance.js`, `orbit/test/resonance.test.js`

**Interfaces:**
- Consumes: `topo` (Task 2), config.
- Produces:
  - `passionWeights(interests: {id, points, mode}[]) → Map<id, number>` (sums to 1; an empty Map if the total is 0)
  - `rarity(n: number, N: number, cfg) → number`
  - `directedResonance(a: Member, b: Member, ctx) → {value, hits: {mine, theirs, score}[]}`
  - `resonance(a: Member, b: Member, ctx) → {R, Rstruct, hits}`
  - `ctx = {topology, rarityOf(id) → number, cfg, aboutCos?: number|null}`
  - `Member = {id, interests: {id, points, mode}[]}`

- [ ] **Step 1: Failing tests:**
  - `rarity(0,100) ≈ 1.0` and `rarity(99,100) ≈ 0.4476` (±1e-4)
  - **Golden 3:** A = {X:18, Y:2}, B = {X:1, Z:19} versus A' = {X:10, Y:10}, B' = {X:10, W:10}, all in mode play with `rarityOf ≡ 1`. Expect `resonance(A,B).R < resonance(A',B').R`.
  - **Golden 4:** identical interests {Guitar:20}. A teach + B learn scores higher than A play + B play.
  - **Harmonic:** if `directedResonance(b,a).value === 0`, then `R === 0`.
  - **Semantic cap:** with `Rstruct` fixed, `aboutCos=1` raises R by at most `0.25 × semScale(1)` relative to `aboutCos` absent.
  - **Review Focus 1:** a member with `interests: []` gives `R === 0` and does not throw.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement exactly as spec §3.5–3.6.
  - `R(A→B) = Σ_i p_A(i) · max_j[topo(i,j) · mode(A_i,B_j) · rarity(i) · √p_B(j)/√max_k p_B(k)]`
  - `Rstruct` is the harmonic mean of the two directions.
  - `squash(x) = 1 − e^(−3x)`.
  - `semScale(cos) = clamp01((cos − 0.1)/0.55)`, taken from engine v1 `features.js`.
  - Keep the per-interest `hits` (the best j for each i, and its term) for explanations.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** "orbit: resonance".

### Task 4: Proximity rings and distance bands (§4)

**Files:** Create `orbit/src/rings.js`, `orbit/test/rings.test.js`

**Interfaces:**
- Produces:
  - `toCell(lat, lng, cfg) → string` (H3 res 7; the caller discards lat/lng)
  - `distanceKm(cellA, cellB) → number` (great-circle distance between the cells' centroids, via `h3.cellToLatLng` and `h3.greatCircleDistance(..., 'km')`)
  - `ringOf(km, cfg) → 0..5`
  - `distanceBand(km, ring, placeLabel?) → string`

- [ ] **Step 1: Failing tests:**
  - `ringOf(0)=0`, `ringOf(3)=0`, `ringOf(3.01)=1`, `ringOf(15)=1`, `ringOf(60)=2`, `ringOf(350)=3`, `ringOf(2500)=4`, `ringOf(2501)=5`
  - `distanceKm(c, c) === 0` (Review Focus 2)
  - Two cells built from Bengaluru (12.9716, 77.5946) and Mysuru (12.2958, 76.6394) give a distance between 120 and 130 km, so ring 3.
  - `distanceBand(2.1, 0) === '< 3 km'`, `distanceBand(8.4, 1) === '~8 km'`, `distanceBand(40, 2, 'Mumbai') === 'Mumbai'`, `distanceBand(3000, 5) === 'Abroad'`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Ring 4 uses the place label, or `'India'` when none is given.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** "orbit: proximity rings".

### Task 5: Escape-Velocity Gate (§5)

**Files:** Create `orbit/src/gate.js`, `orbit/test/gate.test.js`

**Interfaces:**
- Produces:
  - `thresholds(L: number, cfg) → number[6]`
  - `isEligible(R, ring, L, cfg) → boolean`
  - `isWorthTheDistance(R, ring, cfg) → boolean`

- [ ] **Step 1: Failing tests:**
  - `thresholds(40)` equals the base θ, and so does `thresholds(400)` (Review Focus 4)
  - `thresholds(5)[3] ≈ 0.4625` and `thresholds(5)[2] ≈ 0.295`
  - `thresholds(0)[0] === 0.15` and `thresholds(0)[1] === 0.25`
  - No relaxed value is ever below `theta[0]`
  - **Golden 1:** a pair with one shared common interest has R ≈ 0.21 (compute it with Task 3 on the fixture A={X:4,…}, B={X:4,…}, rarity 0.4, and assert the band is 0.15 < R < 0.40). Expect `isEligible(R,0,40)` true and `isEligible(R,3,40)` false.
  - **Golden 2:** `isWorthTheDistance(0.9, 4)` true; `isWorthTheDistance(0.85, 4)` false; `isWorthTheDistance(0.95, 2)` false (rings ≥ 3 only).
  - **Golden 5:** `isEligible(0.55, 3, 5)` true; `isEligible(0.55, 3, 40)` false.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement `θ'_r = max(θ_0, θ_r − α_r · max(0, 1 − L/L*))`. Rings 0–1 use α = 0.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** "orbit: escape-velocity gate".

### Task 6: Roche Limit (§6.4), the signature mechanism

**Files:** Create `orbit/src/roche.js`, `orbit/test/roche.test.js`

**Interfaces:**
- Produces:
  - `qualifiedLoad({inbound: {likerId, likerAgeDays, clearsGate: boolean, ageDays}[], openOrbits: number}, cfg) → number`
  - `headroom(load, K, cfg) → number`
  - `exposure(h, cfg) → number`
  - `deckSize(hViewer, cfg) → number`
  - `resolveOrbit({mine, theirs, lastMessageAt}, now, cfg) → 'open'|'closed-met'|'closed-letgo'|'closed-idle'`
  - `effectiveK(K, {qualifiedInbound, likeBacks}, cfg) → number`

- [ ] **Step 1: Failing tests:**
  - `headroom(5,5) === 0.5`; `exposure(0.5) ≈ 0.7501`; `exposure(1) === 1`; `exposure(0) === 0.35`
  - `headroom(12,5) === 0` (clamped)
  - **Golden 8:** 50 inbound likes from distinct likers. Either all have `clearsGate: false`, or all have `likerAgeDays: 1`. Either way `qualifiedLoad` is 0, so `exposure(headroom(0,5)) === 1`.
  - The same liker listed twice counts once. A like with `ageDays > 10` counts 0.
  - **Golden 10:** `deckSize(0) === 8`, `deckSize(1) === 12`, `deckSize(0.5) === 8`, `deckSize(0.9) === 11`
  - `resolveOrbit`:
    - both `'met'` gives `'closed-met'`;
    - either `'letgo'` gives `'closed-letgo'`;
    - `lastMessageAt` 22 days before `now` gives `'closed-idle'`;
    - `mine:'met', theirs:'ongoing'` gives `'open'`.
  - `effectiveK(8, {qualifiedInbound:20, likeBacks:1}) === 5`; `effectiveK(8, {qualifiedInbound:19, likeBacks:0}) === 8`
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement per spec §6.4. Capacity gaming steps K down one level in `kChoices` (floor 2).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** "orbit: Roche Limit".

### Task 7: Orbit score, deck composition, explanations and safe cards (§6.1–6.3)

**Files:** Create `orbit/src/compose.js`, `orbit/src/explain.js`, `orbit/src/index.js` (re-exports the public API), `orbit/test/compose.test.js`, `orbit/test/explain.test.js`

**Interfaces:**
- Consumes: every module above.
- Produces:
  - `orbitScore({R, ring, coPresence, behaviour, taste, exposure}, cfg) → number`, computed as `R^γ · Φ(ring) · C · B · T · E`
  - `rankCandidates(viewer, candidates: Candidate[], ctx) → Scored[]`. A `Candidate` is `{member, cell, headroom, availability, activity, reciprocity}`. This applies the gate, drops `headroom === 0`, and sorts by G.
  - `composeDeck(viewer, scored: Scored[], {L, hViewer, seed: string}, cfg) → Scored[]`
  - `explain(scored, viewerName?) → string[]` (at most 3 chips)
  - `toCard(scored) → {id, name, photoUrl, distanceBand, matchPercent, chips, worthTheDistance: boolean}`. This is a **whitelist**: no other keys.

- [ ] **Step 1: Failing tests:**
  - **Golden 7:** a candidate with `headroom: 0` and R = 0.99 in ring 0 is absent from `composeDeck`. The engine's search path is a later plan; here, assert that `rankCandidates(..., {includeSaturated:true})` still includes them.
  - **Golden 9:** two candidates with equal R, ring and factors, with headroom 0.9 and 0.3, rank in that order.
  - **Deck:**
    - length is `deckSize(hViewer)` when there is enough supply;
    - at most 2 Worth-the-Distance cards, at indices 3 and 8 when present;
    - at least 70% of non-WtD cards come from rings 0–2 when supply allows;
    - 3 candidates give a deck of length 3 with no `undefined` (Review Focus 3);
    - the same `seed` gives the same deck.
  - `matchPercent === Math.round(100 * R)`. G is never shown.
  - **Golden 6:** `Object.keys(toCard(x))` deep-equals the whitelist, even when the input member carries `email`, `phone`, `cell` and `lat` (assert none of those strings appear in `JSON.stringify(toCard(x))`).
  - The chip for a shared interest with rarity ≥ 0.7 and both members at ≥ 4 points reads `Both deep into {Interest}, rare nearby`. A learn↔teach hit reads `You teach {Interest}, they want to learn it` (or the reverse). A ring 0–1 card with co-presence > 0 reads `{band} away, free at the same times`. No chip is produced without its supporting hit.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
  - MMR uses cosine over passion-weight vectors (λ from config). The structure is ported from engine v1 `candidates.js` `diversify()`.
  - The exploration slot is deterministic from `md5(seed)`, as in engine v1 `withExploration()`.
  - Copy the engine v1 approach; do not import across repos.
- [ ] **Step 4:** `npm test` (the full suite). Expected: all pass.
- [ ] **Step 5: Commit** "orbit: deck composition, explanations, safe cards".

### Task 8: Spec cross-check

**Files:** Create `orbit/README.md`; modify `docs/ORBIT_ENGINE.md` (status line only)

- [ ] **Step 1:** Write `orbit/README.md`. It holds a table mapping each spec section to its module, and each golden test (1–10) to its test name.
- [ ] **Step 2:** Run `cd orbit && npm test`. Expected: all pass, and the output lists golden tests 1–10.
- [ ] **Step 3:** Change the status line of `ORBIT_ENGINE.md` to "core library implemented in `orbit/`; service and UI pending".
- [ ] **Step 4: Commit** "orbit: README and spec status".
