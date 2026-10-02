# Arena run: ORBIT signature mechanism (2026-10-02)

**Skill:** `agent-arena` (`.claude/skills/agent-arena`). **Mode:** `design_debate`. It escalated past `quick_panel`
because the output is a durable contract: the copyrighted engine spec.

**Participants and heterogeneity (disclosed):** Codex and other model families were not available in this
environment. All participants were independent Claude subagents with different lenses, so heterogeneity was
**reduced**. Independence was preserved: proposers did not see each other's answers before round 2.

| Role | Lens |
|---|---|
| A | Consumer product: what makes people meet in real life |
| B | Recommender-systems scientist: lift and cold start |
| C | Contrarian strategist and IP analyst (with web search) |
| Judge | Separate agent. Prior-art evidence check (web), scoring, red team, steelman |

## Round 1: independent proposals

- **A and B independently proposed "Constellations".** These are quorum-consented local micro-groups around one anchor
  interest, with a pairwise resonance floor, a shared availability slot, a blind invite, a reveal only on a quorum of
  at least 3, and attendance-based reliability.
- **C proposed the "Roche Limit".** Members declare a capacity. Their load (pending inbound likes plus open orbits)
  drives an exposure multiplier, and at zero headroom they are removed from recommended feeds but stay searchable.
  A Met / Ongoing / Let go resolution state machine releases capacity and supplies training labels.

## Round 2: evidence and critique (judge)

The agreement between A and B was explicitly **not** counted as evidence.

**Prior art found:**
- **Constellations:**
  - Timeleft: algorithm-matched blind tables of 4–6 people.
  - Pie: interest groups of 6, then a group chat.
  - 222: groups of 5–7 people. After the meet, members say who they want to see again, and that trains the matcher.
  - Bumble BFF Groups and Breeze cover parts of it too.
- **Roche Limit:**
  - Lunchclub: members choose their matches per week.
  - Hinge: limits on sending likes, plus reported downranking of profiles with a backlog of unanswered likes.
  - Bumble: matches expire.
  - Arnosti, Johari and Kanoria (MSOM 2021): congestion in matching markets.

**Scores (0–10):**

| Criterion | Constellations | Roche Limit |
|---|---|---|
| Novelty vs shipped products | 3 | 5 |
| Fit as an *engine* mechanism | 4 | 9 |
| Measurable user value | 7 | 6 |
| Buildable now (pre-launch, low liquidity) | 2 | 8 |
| Safety (higher = safer) | 3 | 6 |
| IP defensibility | 6 | 6 |
| **Total** | **25** | **40** |

**Red-team fixes adopted into the spec:**
- Gate-qualified likes only (`q_l`), against brigading.
- A deck-size floor of 8.
- *Met* requires both sides and is rate-limited.
- A jittered "at capacity" flag with no counts.
- Liquidity counts only members with `h > 0`.

## Synthesis (orchestrator)

**Recommendation adopted (D-009):** the Roche Limit becomes ORBIT §6.4 now. Constellations goes in Appendix A as a
draft for Phase 6, gated on regional liquidity, with reliability taken from mutual-Met labels instead of peer
attestation.

**Dissent preserved:** Proposers A and B, and the judge's steelman, argue that groups serve the "actually meet"
promise better and are safer than meeting 1:1. That holds once there is enough density.

**Best counterargument to the winner:** congestion is a problem of mature markets. Before launch, nearly everyone has
full headroom, so the first metric will be flat. **Accepted:** the mechanism costs little, is harmless early, and its
Met state machine produces the north-star label from day one.

**Remaining uncertainty:**
- The constants (0.35, 0.65, 0.7, the load weights) are untested.
- The default K = 5 is a guess.
- Both get calibrated in Phase 5.
