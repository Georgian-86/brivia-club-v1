# Brivia Club: project context (read this first, every session)

This file loads automatically in every Claude Code session opened in this repo. It exists so
the **motive and aim are never lost** between sessions. Keep it short and current. Details live
in `docs/`.

## What we are building (the north star)

**Brivia Club is a location-first, interest-matched networking platform.**

1. **Mutual interests are what drive a match.** People are matched on what they genuinely care about,
   weighted by how much they care (see the Passion Budget in `docs/ORBIT_ENGINE.md`).
2. **Location comes first.** The default feed shows people with similar interests *in the
   same area*, starting with the neighbourhood, then the city, then the region.
3. **Search reaches everyone.** Members can search anyone, anywhere, and send a request to a
   person who is far away.
4. **Far-away recommendations are earned.** Someone outside your area is only recommended when
   the match is strong enough to justify the distance (the Escape-Velocity gate).
5. **The matching engine is our own IP.** It is called **ORBIT**. Its spec is original work
   and we intend to register it for copyright. Never replace it with a copy of another
   platform's algorithm, and never paste third-party ranking code into it.

## The two repos

| Repo | Role | Keep / take |
|---|---|---|
| `brivia-club-v1` (this repo) | **The product UI we ship.** Vite, vanilla JS, Supabase (auth, profiles, chat, storage). | Keep the UI. The deck is an interim server ranking (`deck_candidates`, shared interest, then band); ORBIT is specified and unit-tested in `orbit/` but not yet wired to members. |
| `brivia-club` | The older version: Fastify, Prisma, Postgres/pgvector, and a matching engine v1 (`server/src/engine/`). | Reference and reuse for the engine plumbing: embeddings, interaction log, per-member taste learning, explainability. Its scoring model is **not** location-first, so ORBIT replaces it. |

## Docs map (read the relevant one before working)

- `docs/HANDOFF.md`: **where we are right now**: what is done, live DB state, what to do next and which file covers what. Read it second, and update it at the end of every session.
- `docs/VISION.md`: product aim, non-negotiable rules, and who it's for
- `docs/ENGINE_AUDIT.md`: arena-style audit and rating of the existing backend and matching engine
- `docs/ORBIT_ENGINE.md`: **the ORBIT matching engine spec** (the copyright asset), formulas, data model, rollout plan
- `docs/IP_NOTES.md`: how we protect the engine (copyright, trade secret, trademark) and what that does and doesn't cover
- `docs/DECISIONS.md`: decision log. Append to it; never rewrite history.
- `docs/SKILLS.md`: required Claude Code skills and how they get installed

## Rules for any session working here

- Before changing matching, ranking, search, or location code, re-read `docs/ORBIT_ENGINE.md`.
  If you change behaviour, update the spec **in the same commit**. The spec and the code must not drift.
- Location privacy: never store or expose exact coordinates to other members. Store only a
  coarse cell (see the spec) and show rounded distances ("~3 km"). Never send email or phone to other clients.
- Matching must be mutual-consent: a connection exists only after both people agree (mutual like or accepted request).
- Record every significant product or architecture decision in `docs/DECISIONS.md`.
- **Skills are vendored in `.claude/skills/`** (manifest: `docs/SKILLS.md`). Workflow the founder asked for:
  superpowers for process (brainstorming → writing-plans → execution, TDD, verification),
  **agent-arena for every significant decision** (record the outcome in `docs/DECISIONS.md`),
  ui-ux-pro-max for UX rules (keep the existing deep-wine brand, see `docs/UX_SPEC.md`), and webapp-testing for UI checks.
  If `.claude/skills/` is missing, ask the user before reinstalling.

## Commands

```bash
npm install
npm run dev      # vite dev server
npm run build    # production build → dist/
npm run test:unit  # client helper unit tests (node --test tests/unit/*.test.mjs)
cd orbit && npm test   # ORBIT engine unit tests (node --test)
bash supabase/tests/run.sh   # SQL harness: all migrations twice, every *.test.sql, seed + purge
# e2e (stubbed Supabase; Playwright and axe-core installed outside the repo, see tests/e2e/README.md):
PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/consent.spec.mjs   # also deck.spec.mjs, onboarding.spec.mjs
```
Going live: follow `supabase/migrations/README.md`. 0001–0004 are live and frozen (never edit or re-run them); run the 0005 pre-flight checks, apply 0005 and deploy the client in the same window, verify, then apply 0006. Expect the listed advisor warnings for the intended RPCs. Daily moderation: `docs/MODERATION.md`.
Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (see `.env.example`). SQL migrations live in `supabase/migrations/*.sql` (run manually in the Supabase SQL editor, in order; `supabase/legacy/` is archive only). Verify locally with `bash supabase/tests/run.sh`.
