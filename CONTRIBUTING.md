# Contributing to The Brivia Club

Thanks for working on Brivia Club. This page is the short version of how we work. Start with the
[README](README.md) for setup, then read [`docs/VISION.md`](docs/VISION.md) and [`docs/HANDOFF.md`](docs/HANDOFF.md).

## The rules that never bend

1. **Location privacy.** Never store or send exact coordinates to another member. Store a coarse cell and show rounded
   distances. Email and phone never reach another member's client.
2. **Mutual consent.** A connection exists only after both people agree (a mutual like or an accepted request).
3. **ORBIT is original.** Before you change matching, ranking, search or location code, re-read
   [`docs/ORBIT_ENGINE.md`](docs/ORBIT_ENGINE.md). If behaviour changes, update the spec in the same commit. Never paste
   third-party ranking code into the engine.
4. **Applied migrations are frozen.** Add a new numbered migration; never edit one that is live.

## Workflow

1. Branch from `main`: `git checkout -b <your-name>/<short-topic>`.
2. Make the change, with tests. Client helpers get a unit test in `tests/unit/`; UI flows get or extend a spec in
   `tests/e2e/`; SQL gets a `*.test.sql` in `supabase/tests/`.
3. Run the checks below.
4. Open a pull request against `main`. The template has the checklist. Vercel posts a preview link on it.
5. For a significant product or architecture decision, add an entry to [`docs/DECISIONS.md`](docs/DECISIONS.md)
   (append only, next `D-NNN` number) and a line to [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Checks before you open a pull request

```bash
npm test                      # client unit tests
npm run build                 # production build
npm run check:assets          # media size budget
npm run test:orbit            # if orbit/ changed
bash supabase/tests/run.sh    # if supabase/ changed (needs PostgreSQL 16 locally)
```

`npm run check:styles` is a ratchet: it fails when a stylesheet gains raw hex colours or font names instead of the
tokens in `site/styles/tokens.css`. Use `var(--color-*)` and `var(--font-*)` in new CSS.

## Code conventions

- **JavaScript:** plain ES modules, no framework and no TypeScript on the client. One feature per file in
  `site/scripts/`. Keep pure logic (formatting, maths, parsing) in small exported functions so it can be unit tested
  with `node --test`, and keep DOM wiring separate.
- **CSS:** one stylesheet per feature in `site/styles/`. Colours, fonts and spacing come from `tokens.css`. Keep the
  deep-wine brand ([`docs/UX_SPEC.md`](docs/UX_SPEC.md)). Touch targets are at least 44 px; check 390 px and 1440 px.
- **Pages:** the HTML files at the top of `site/` are the URLs. Do not move or rename them. A new page also needs an
  entry in `vite.config.mjs`.
- **Media:** put originals in `source-media/` and run `npm run media:build`. Only `site/media/` ships.
- **SQL:** every migration is idempotent (`create or replace`, `if not exists`, guarded `do` blocks), enables RLS on
  new tables, and exposes data to other members only through views or `security definer` RPCs that return the
  minimum columns. Add its entry to [`supabase/migrations/README.md`](supabase/migrations/README.md).
- **Secrets:** nothing secret goes in the repo or in a `VITE_` variable. Server keys live in Supabase Edge Function
  secrets.
- **Formatting:** follow [`.editorconfig`](.editorconfig) (2 spaces, LF, final newline).

## Commit messages

Short and descriptive, in the present tense. When the change implements a logged decision, lead with its id:
`D-264: faster chat reads and a lighter landing hero`.

## Working with Claude Code

[`CLAUDE.md`](CLAUDE.md) loads automatically in Claude Code sessions and holds the project context. Vendored skills
live in `.claude/skills/` (manifest: [`docs/SKILLS.md`](docs/SKILLS.md)).
