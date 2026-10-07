# Session handoff (read after CLAUDE.md)

Last updated: 2026-10-05, after 0004 went live (code at `c42e805`) on branch `claude/jolly-edison-49xvza` (repo `Georgian-86/brivia-club-v1`).
Update this file at the end of every session. CLAUDE.md holds the aim; this file holds **where we are**.

## 1. What is done

| Area | State | Where |
|---|---|---|
| Vision and rules | Written | `docs/VISION.md`, `CLAUDE.md` |
| Old engine audit (arena, rated) | Done | `docs/ENGINE_AUDIT.md` |
| ORBIT engine spec (copyright asset) | Written, §10 has status | `docs/ORBIT_ENGINE.md` |
| ORBIT library | Pure JS, 86 tests, **not wired to members yet** | `orbit/src`, `orbit/test` |
| IP plan | Written | `docs/IP_NOTES.md` |
| Iteration 3: location cells, taxonomy, Passion Budget signup, k-anonymity, signals and quota, interim deck | Done and reviewed | plan: `docs/superpowers/plans/2026-10-03-iteration-3-orbit-onboarding.md` |
| Iteration 3 arena (critics A/B/C and judge, rulings R1–R10, iteration-4 backlog, go-live gate) | Done | `docs/arena/2026-10-03-iteration-3.md` |
| P0-A (the 0004 amendment, SQL privacy fixes) plus fix round 1 | Done, all suites green | D-039, D-041 in `docs/DECISIONS.md` |
| Landing page | Yashika's original UI, unchanged (founder rule: optimise, never redesign) | `index.html`, CSS |
| Decisions | D-001 … D-041, append-only | `docs/DECISIONS.md` |

Test status at `c42e805`: harness ALL PASSED (19 files); build OK; `test:unit` 42/42; orbit 86/86; e2e consent
102/102, deck 57/57, onboarding 124/124.

## 2. Live Supabase state (project `wfbddovczpfdrspmxgfo`)

- `0001`, `0002`, `0003` are **applied and frozen**. Never edit or re-run them; later changes go in `0005+`.
- `0004_orbit_onboarding.sql` is **applied (2026-10-05) and frozen**. It was verified read-only; see D-042 for the
  log settings and the advisor results. New SQL goes in `0005_*.sql`.
- **Test-member seed: done (2026-10-05), verified read-only.** 24 `is_test` profiles, all completed, each with a
  20-point budget and a cell, across 4 places; 6 requests, 1 match. To refresh it, purge and re-seed after 30 days.
  If the SQL editor shows `relation "_seed_members" does not exist`, the editor ran only a selected part of the
  script. Select nothing and run the whole file.
- **Not done yet:** deploying the new client build.
- `0005` should include the performance hygiene from D-042: `(select auth.uid())` in the policies, and 4 foreign-key indexes.
- Real members are **not allowed yet**. See the go-live gate table at the end of the arena doc.

## 3. What to do next (in order)

1. **Deploy** the client built from this branch. The seed is already done.
2. **P0-B** (before any real member). Arena doc, section "P0-B", items 9–12:
   - UX honesty: quota copy, promise copy, contrast, Pass glyph, focus styles.
   - Step 3 renamed to "What you care about", and the `auth.html` location notice.
   - **18+ declaration** (D-040).
   - Sensitive-consent UI (R3). Sensitive chips are hidden until this exists.
   - Self-serve account deletion, including storage.
   - Retention in the privacy notice.
   - `report_member` and a moderation contact.
   - `compressImage` fails closed, plus the video metadata warning.

   Any new SQL goes in `0005_*.sql`.
3. **Founder-only gate items:**
   - auth hardening: email confirm, CAPTCHA, rate limits, anonymous sign-ins off;
   - PITR and backups;
   - error tracking;
   - private repos;
   - sign-off.

   Remind the founder about these, and to **rotate the DB password that was once pasted in chat**.
4. **P0-E** (before ORBIT reads member data):
   - the grid1 adapter in `orbit/src`, failing closed and matching SQL `brivia_cell_km`;
   - the sensitive firewall.
5. **P1** items 15–25: trust-weighted likers, rarity shrinkage, θ study, shadow ORBIT for 2 weeks, sybil hardening,
   harvest P1, `community_feed()`, Sent tab, launch-city cold start, metro labels, IP authorship dossier. **P2** after that.
6. **Later, its own iteration:** the student world, ages 13–17 with parental email approval, fully separated from
   adults (D-040). A lawyer must confirm DPDP "verifiable consent" first.
7. **Open founder question** (arena doc, "Dissent preserved"): should a ring-0 neighbour outrank a distant member
   with better shared interests? It is currently "interest qualifies, location orders".

## 4. How to work (the founder's required process)

Every iteration runs these steps:

1. **superpowers:** brainstorming → writing-plans (`docs/superpowers/plans/`) → subagent-driven execution. One
   implementer per task, then a reviewer, a fix round, and a controller check.
2. **TDD:** write the harness, unit or e2e test first, and see it fail.
3. **agent-arena for every significant decision.** Critics A (UX), B (privacy and security) and C (engine and
   IP), then a judge. Record the arena in `docs/arena/`, and the outcome in `docs/DECISIONS.md` (append-only, next
   free D-number).
4. **Criticise the current implementation with arena at the end of each iteration** (founder request), and turn it into the next backlog.
5. **ui-ux-pro-max** for UX rules, keeping the deep-wine brand (`docs/UX_SPEC.md`). **webapp-testing**/Playwright for UI.
6. Supabase for both live data and test data. Test members are `is_test`-isolated, with seed and purge in `supabase/seed/`.
7. Controller check before each push:
   - all suites green;
   - `git diff` shows 0001–0003 unchanged;
   - DECISIONS has only added lines;
   - the spec is updated in the same commit as behaviour changes.

Commands are in `CLAUDE.md`. Playwright lives outside the repo, at `/tmp/pw` (`tests/e2e/README.md` shows how to
install it).

## 5. Which file to read for what

| Need | File |
|---|---|
| Aim, rules, commands | `CLAUDE.md` |
| Product vision and who it is for | `docs/VISION.md` |
| Matching math, rings, Escape-Velocity, Passion Budget, privacy model | `docs/ORBIT_ENGINE.md` |
| Why things are the way they are | `docs/DECISIONS.md` (D-026+ is the ORBIT era) |
| The current backlog and go-live gate | `docs/arena/2026-10-03-iteration-3.md` (sections P0-B … P2, gate table) |
| Brand, tokens, flows, copy | `docs/UX_SPEC.md` |
| Applying SQL to live | `supabase/migrations/README.md` |
| Test members | `supabase/seed/README.md` |
| Data breach response (containment, notices, orphan-folder report) | `docs/BREACH_RUNBOOK.md` |
| Daily moderation (new reports, flags, the 72 h suspension queue, rejoin reviews; SQL editor as owner) | `docs/MODERATION.md` |
| SQL behaviour tests | `supabase/tests/*.test.sql` (run with `run.sh`) |
| Signup (4 steps) | `auth.html`, `script.js`, `passion-budget.js`, `pending-profile.js` |
| App, deck, quota | `app.html`, `app.js`, `deck-view.js`, `signal-quota.js` |
| e2e (stubbed Supabase) | `tests/e2e/*.spec.mjs` |
| Old engine to reuse plumbing from | repo `brivia-club`, `server/src/engine/` |
| Skills manifest | `docs/SKILLS.md` (vendored in `.claude/skills/`) |

## 6. Hard constraints (never break)

- Never store, echo or commit DB passwords or connection strings.
- Never connect to the live DB directly (psql). Use the founder's SQL-editor runs, or read-only connector checks.
- Never edit an applied migration.
- No exact coordinates are stored or shown. Members see bands and place names only. Never send another member's email or phone to the client.
- Matches are mutual only.
- The landing page keeps Yashika's UI.
- No third-party ranking code in ORBIT.
- Adults only until the student world ships.
- Never push to any branch except `claude/jolly-edison-49xvza`. Never open a PR unless the founder asks.
