# ORBIT core engine

ORBIT is the Brivia Club matching engine (spec: `docs/ORBIT_ENGINE.md` v0.2). This directory is the core library: pure
JavaScript (ESM, Node 22), no I/O, no database, no HTTP. Callers pass members, candidates and context in and get scored
cards out. The only runtime dependency is `h3-js`. Taste learning, the service and the UI are out of scope here.

Run the tests: `cd orbit && npm install && npm test` (`node --test`).

All constants live in `src/config.js`. If `ORBIT_CONFIG_PATH` points to a JSON file, its values override the defaults.
Production (calibrated) values are kept private and are never committed; the defaults are the public spec values.

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

- R3: `distanceBand` gives ring 0 `< 3 km`, ring 1 `~N km`, rings 2-3 `placeLabel ?? ~N km`, ring 4 `placeLabel ?? India`, ring 5 `Abroad`.
- R4: the local-rarity chip reads "rare nearby" with no city name, because the library has no viewer city label. The service can substitute one.
- R8: when `R_struct = 0`, `R = 0` even if `aboutCos` is present (spec §3.6 reworded to match).
- R9: in a short deck, a Worth-the-Distance slot beyond the deck length is not used and the card spills into the normal ordering.
- R10: interest display labels come from the optional `ctx.labelOf(id)` (fallback: the id); `rankCandidates` attaches the label to each hit.
