# Decision log

Append-only. Format: `D-NNN · date · status · decision · why`. Never edit a past entry. Add a new one that
supersedes it.

| ID | Date | Status | Decision | Why |
|---|---|---|---|---|
| D-001 | 2026-10-02 | Accepted | `brivia-club-v1` is the product UI we ship. `brivia-club` is the backend and engine reference. | The v1 UI is the chosen design. The older repo has the only real backend and matching engine. |
| D-002 | 2026-10-02 | Accepted | The product is **location-first, interest-matched networking**. Far recommendations are allowed only for very strong matches. Search and requests can reach anyone. | The founder's stated aim (see `VISION.md`). |
| D-003 | 2026-10-02 | Accepted | Replace the engine v1 *scoring model* with **ORBIT** (`ORBIT_ENGINE.md`). Reuse engine v1 *plumbing*: embeddings, vector store, interaction log, taste learning, diversity and exploration, evidence-only explanations. | The audit (`ENGINE_AUDIT.md`) rates v1 plumbing ~7/10 but its fit to the location-first vision ~2/10. ORBIT must be original for copyright. |
| D-004 | 2026-10-02 | **Open** | Where does ORBIT run: (a) a Node service reusing `brivia-club/server` with Supabase JWT auth, or (b) Supabase Edge Functions plus SQL? | The audit recommends (a): it reuses the engine code, keeps ranking and location server-side, and is testable. Needs a founder call on hosting cost. |
| D-005 | 2026-10-02 | Accepted | P0 before launch: hide email and phone from other members, and make connections mutual-consent. | Audit E9/E10: currently any member can read every profile's email and phone, and a one-sided like opens chat. |
| D-006 | 2026-10-02 | Pending approval | Vendor the required Claude Code skills into `.claude/skills/` (manifest in `SKILLS.md`). | Lets every session reuse them without re-downloading. Installing third-party code requires user approval. |
| D-007 | 2026-10-02 | Accepted | Skills vendored into `.claude/` (supersedes D-006). The arena skill is `zhjai/agent-arena`. | The founder approved the install and the arena choice. |
| D-008 | 2026-10-02 | Accepted | ORBIT runs as a **Node service** that reuses `brivia-club/server` engine plumbing and verifies Supabase JWTs (resolves D-004, option a). | The founder approved the recommendation. |
