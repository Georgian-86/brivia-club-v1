# ORBIT core engine

ORBIT is the Brivia Club matching engine (spec: `docs/ORBIT_ENGINE.md` v0.2). This directory is the core library: pure
JavaScript (ESM, Node 22), no I/O, no database, no HTTP. Callers pass members, candidates and context in and get scored
cards out. The only runtime dependency is `h3-js`. Taste learning, the service and the UI are out of scope here.

Run the tests: `cd orbit && npm install && npm test` (`node --test`).

All constants live in `src/config.js` (including the orbit-score factors `score.*`, the semantic scale `semantic.*`,
the chip thresholds `explain.*`, and the ring cut-offs `wtdMinRing`, `score.coPresenceMaxRing`, `deck.localMaxRing`,
`explain.coPresenceChipMaxRing`). If `ORBIT_CONFIG_PATH` points to a JSON file, its values override the defaults.
Production (calibrated) values are kept private and are never committed; the defaults are the public spec values.
`semScale`, `explain`, `distanceBand` and `toCard` take an optional trailing `cfg`; when it is omitted they call
`loadConfig()`, so `ORBIT_CONFIG_PATH` still applies. Pass the same `cfg` you ranked with.

## Privacy: only `toCard` output may reach a client

> **Warning.** The `Scored` objects returned by `rankCandidates` and `composeDeck` are server-side only. Each one
> carries `candidate` (including `candidate.cell`, the member's H3 cell, and whatever else the caller put on the member
> row) and `km`, the exact cell-to-cell distance, plus the internal score `G`. Never serialize a `Scored` object, a
> deck or a hit list to another member. Map every card through `toCard(scored, cfg)` first: it is a field-by-field
> whitelist (`id`, `name`, `photoUrl`, `distanceBand`, `matchPercent`, `chips`, `worthTheDistance`) with a rounded
> distance band, and it never includes `G`, the cell, coordinates, email or phone.

## Robustness (Ruling R12)

Non-finite numeric inputs fall back to safe defaults, so one bad row never empties a deck: candidate `headroom` → 1,
`taste` → 1, non-finite `activity` / `reciprocity` are treated as absent, `hViewer` → 1, `ctx.L` → 0, `K` → `kDefault`,
and `headroom(load, K)` with `K ≤ 0` is 0. `composeDeck` drops rows whose `G` is not finite and never returns
`undefined` entries. The liquidity slack is clamped to [0, 1], so `L < 0` cannot relax thresholds below their L = 0 values.

`resolveOrbit({mine, theirs, lastMessageAt, openedAt}, now, cfg)` accepts `Date`, epoch-ms or ISO-string timestamps.
Idle time counts from the later of `lastMessageAt` and `openedAt`, so an orbit where nobody writes still closes.

## Spec to module

| Spec section | Module | Exports |
|---|---|---|
| §3.1 Interest Topology | `src/topology.js` | `buildTopology`, `topo` |
| §3.2 Passion Budget | `src/resonance.js` | `passionWeights` |
| §3.3 Local rarity | `src/resonance.js` | `rarity` |
| §3.4 Mode complementarity | `src/resonance.js` | `directedResonance` |
| §3.5 Directed and mutual resonance | `src/resonance.js` | `directedResonance`, `resonance` |
| §3.6 Semantic gap-filler | `src/resonance.js` | `semScale`, `resonance` (uses `ctx.aboutCos`); `cosine` in `src/diversity.js` |
| §4 Proximity Rings (privacy, rings, bands) | `src/rings.js` | `toCell`, `distanceKm`, `ringOf`, `distanceBand` |
| §5 Escape-Velocity Gate (thresholds, liquidity, WtD) | `src/gate.js` | `thresholds`, `isEligible`, `isWorthTheDistance` |
| §6.1 Orbit score and ranking | `src/compose.js` | `orbitScore`, `rankCandidates` |
| §6.2 Deck composition | `src/compose.js`, `src/diversity.js` | `composeDeck`, `toCard`; `mmrPick`, `seededFloat` |
| §6.3 Explanations | `src/explain.js` | `explain` |
| §6.4 Roche Limit | `src/roche.js` | `qualifiedLoad`, `headroom`, `exposure`, `deckSize`, `resolveOrbit`, `effectiveK` |

`src/index.js` re-exports the whole public API.

## Golden tests to test names

| # | Golden test | Test (file) |
|---|---|---|
| 1 | One shared common interest: local only | `Golden 1: one shared common interest is local-only` (`test/gate.test.js`) |
| 2 | 1,800 km, three rare interests: Worth-the-Distance | `Golden 2: worth-the-distance` (`test/gate.test.js`) |
| 3 | One-sided obsession scores below mutual passion | `Golden 3: concentrated one-sided passion scores below balanced` (`test/resonance.test.js`) |
| 4 | learn/teach beats play/play | `Golden 4: teach+learn beats play+play` (`test/resonance.test.js`) |
| 5 | Thin supply (L=5) admits ring 3 at R=0.55; L=40 does not | `Golden 5: thin local supply widens the circle` (`test/gate.test.js`) |
| 6 | No coordinates, cell id, email or phone in output | `Golden 6: toCard is a whitelist and leaks nothing` (`test/compose.test.js`) |
| 7 | h=0 absent from every deck and WtD lane; present in search | `Golden 7: saturated candidates are absent from deck, present with includeSaturated` (`test/compose.test.js`). The deck half is covered. Search is a service concern, so the library only offers the `ctx.includeSaturated` switch that search uses. |
| 8 | 50 unqualified pending likes leave E unchanged | `golden 8: unqualified likes add no load` (`test/roche.test.js`) |
| 9 | Equal R and ring: higher headroom ranks first | `Golden 9: higher headroom ranks first at equal R/ring/factors` (`test/compose.test.js`) |
| 10 | Deck size within 8..12 | `golden 10: deck size` (`test/roche.test.js`); also `deck length equals deckSize with enough supply` (`test/compose.test.js`) |

## Controller rulings that differ from, or refine, the spec text

- R3: `distanceBand` gives ring 0 `< {cfg.rings[0]} km` (default `< 3 km`), ring 1 `~N km`, rings 2-3 `placeLabel ?? ~N km`, ring 4 `placeLabel ?? India`, ring 5 `Abroad`.
- R4: the local-rarity chip reads "rare nearby" with no city name, because the library has no viewer city label. The service can substitute one.
- R8: when `R_struct = 0`, `R = 0` even if `aboutCos` is present (spec §3.6 reworded to match).
- R9 (superseded by R11): a WtD slot beyond a short deck spilled the card into the normal ordering, where it could land first.
- R10: interest display labels come from the optional `ctx.labelOf(id)` (fallback: the id); `rankCandidates` attaches the label to each hit.
- R11: a Worth-the-Distance card goes to its fixed slot (indices 3 and 8), or to the last deck position when the slot
  is beyond the deck length (walking back past positions already taken). It never enters the MMR fill and is never
  placed before the local cards. Example: 2 WtD cards in a deck of 8 sit at indices 3 and 7. Spec §6.2 step 3 updated.
- R12: non-finite numeric inputs fall back to safe defaults (see Robustness above). A bad row never empties a deck.
- R13: the rare and teach/learn chips fire only for identical-interest hits (`mine.id === theirs.id`). A match through a
  related interest (parent/child, sibling, domain) still counts towards R but never names an interest the other member
  does not hold. Spec §6.3 updated.
