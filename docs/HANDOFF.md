# Session handoff (read after CLAUDE.md)

Last updated: 2026-10-13, after Phase C of the experience iteration (consistency), on branch
`claude/jolly-edison-49xvza` (repo `Georgian-86/brivia-club-v1`). Phase C is not on `main` yet: the founder sees the
before/after screenshots and OKs the fast-forward.
Update this file at the end of every session. CLAUDE.md holds the aim; this file holds **where we are**.

## 1. What is done

**Experience iteration, Phase C (2026-10-13): done on `claude/jolly-edison-49xvza`** (not yet on `main`). See D-055.
- One member nav (`app-nav.js`: header at desktop, tab bar at <= 780 px; Connect · Explore · Chat · Profile), one set of
  tokens (`tokens.css`), one type system (Bodoni Moda headings, Instrument Sans body, 12 px floor), a calm profile
  column, and skeletons, busy buttons and an action in every empty state (`app-skeletons.js`).
- Final review fixes (D-055 addendum): the tab bar hides over overlays, dialogs, the review notice and an open chat
  thread; the ⚙ menu survives a focus loss to nowhere; a refill that throws ends in Try again; 16 px app fields on phones;
  no my_interests re-read on a Profile re-tap. `APP_SHELL_FINAL_ONLY=1` runs only those app-shell checks.
  Known, not fixed: between 701 and 780 px the header bell sits behind the avatar and the chat panel's right edge is
  clipped (seen in review screenshots; also on 03d1062).
- Landing CSS split (`landing-entry.js`, `auth-entry.js`): Lighthouse mobile 0.89 -> 0.93 (median of 3), LCP 2.6 s, CLS 0.
- Style ratchet: `npm run check:styles` (per-file hex and font-family counts may only fall; after a cleanup,
  `node scripts/check-style-ratchet.mjs --write` lowers the baseline and refuses if anything rose).
- Visual parity guard (byte-exact; the landing stayed identical through every Phase C task). It serves the existing
  `dist/`, so build with the stub Supabase first:
  `VITE_SUPABASE_URL=https://stub.supabase.local VITE_SUPABASE_ANON_KEY=stub npm run build`, then
  `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node scripts/visual-parity.mjs compare .superpowers/sdd/2026-10-12-phase-c-consistency/landing-before --pages index`
  (`capture <dir>` takes a new baseline; `--pages index,auth`; `--expect-diff a,b` names intended changes).
- App shell e2e (Vite on **:5195**, stubbed Supabase with per-route `routes` delay/status overrides):
  `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/app-shell.spec.mjs`;
  `APP_SHOTS=<dir>` saves the views, dialogs, profile, loading and empty-state screenshots instead (final set:
  `.superpowers/sdd/2026-10-12-phase-c-consistency/app-after/`).
- Founder backlog surfaced (not Phase C) is listed at the end of D-055.

**Experience iteration, Phases A and B (2026-10-12): done and on `main`.** See D-053 and D-054.
- Media pipeline: `npm run media:build` (sharp + ffmpeg write `media/`), `npm run media:repoint` (rewrites references from `media/manifest.json`), `npm run check:assets` (budget on `dist/assets`: image <= 400 KB, video <= 5 MB). Originals stay in `Images/` and `assets/`.
- Landing e2e: `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/e2e/landing.spec.mjs` (builds, serves `vite preview` on :5196; checks poster-first, intro cap, reduced motion, transfer, CLS, LCP, fonts, skeleton).
- Lighthouse: `CHROME_PATH=/opt/pw-browsers/chromium npx lighthouse@12 http://127.0.0.1:4173/ --preset=perf --form-factor=mobile --chrome-flags="--headless --no-sandbox"`. Last result 0.86 to 0.89, LCP 2.8 s (target 90 / 2.5 s); next step is splitting the auth CSS off the landing critical path.
- axe `color-contrast` is blind on the cream auth panel (those nodes come back "incomplete"), so contrast fixes need computed-ratio assertions, not axe alone.
- The Phase A screenshot checks are geometry and ratio assertions, not pixel baselines.
- Live checks still owed after deploy: hero video playback and gesture-unmute (the test Chromium has no H.264) (Bodoni Moda parity was checked: pixel-identical to the Google version).

| Area | State | Where |
|---|---|---|
| Vision and rules | Written | `docs/VISION.md`, `CLAUDE.md` |
| Old engine audit (arena, rated) | Done | `docs/ENGINE_AUDIT.md` |
| ORBIT engine spec (copyright asset) | Written, §10 has status | `docs/ORBIT_ENGINE.md` |
| ORBIT library | Pure JS, 86 tests, **not wired to members yet** | `orbit/src`, `orbit/test` |
| IP plan | Written | `docs/IP_NOTES.md` |
| Iteration 3 (cells, taxonomy, Passion Budget, k-anonymity, signals, interim deck) and P0-A (0004) | Done, 0004 live | D-037–D-042 |
| **Iteration 4, P0-B** (18+ gate, sensitive consent, report, self-serve deletion, retention, privacy notice, honesty/contrast, media fail-closed, 0006 perf policies) | **Done on the branch, reviewed; NOT applied or deployed** | plan `docs/superpowers/plans/2026-10-05-iteration-4-p0b.md`; D-044, D-045 |
| Iteration 4 arenas (P0-B design; end-of-iteration critique → P0-C backlog) | Done | `docs/arena/2026-10-05-p0b-design.md`, `docs/arena/2026-10-07-iteration-4.md`; D-044, D-046 |
| Landing page | Yashika's original UI, unchanged (founder rule: optimise, never redesign) | `index.html`, CSS |
| **Live signup walkthrough** (real browser on the live URL; 7 UI bugs fixed incl. lost signup photo, typed-city refusal, invalid phone pattern) | Done, pushed (auto-deploys) | D-049 |
| Experience iteration A-C (signup guide, landing speed, consistency) | Done on the branch; A and B on `main`, C awaiting the founder's OK | D-053, D-054, D-055 |
| Decisions | D-001 … D-055, append-only | `docs/DECISIONS.md` |

Test status after D-055 (2026-10-13): SQL harness ALL PASSED; build OK; `test:unit` 155/155; orbit 86/86;
`check:assets` and `check:styles` OK; landing parity identical (22 shots); e2e onboarding 262, consent 154, deck 104,
landing all passed, app-shell 155.
**Live UI testing:** this sandbox cannot reach `*.vercel.app` / `*.supabase.co`. Use a Vercel Sandbox in project
`brivia-club` (Vercel MCP `create_sandboxes_v4`, no failover regions on this plan, ~45 min max) with Playwright, and a
Gmail plus-address of the founder's inbox for confirmation emails (disposable inboxes did not receive them).
Tooling: Playwright **and axe-core** at `/tmp/pw` (`npm install --prefix /tmp/pw playwright axe-core`).

## 2. Live Supabase state (project `wfbddovczpfdrspmxgfo`, ap-south-1)

- `0001`–`0004` are **applied and frozen**. Never edit or re-run them.
- **Test-member seed: live** (D-043): 24 `is_test` profiles, all completed. To refresh, purge and re-seed (see
  `supabase/seed/README.md`; the purge leaves storage files, remove them via the Storage API first).
- **`0005` and `0006` are applied (2026-10-08) and frozen** (D-047, D-048), verified read-only: the policies match
  `supabase/tests/policies-0006.expected.tsv` exactly, and the advisors are as the README expects. New SQL goes in
  **`0007+`**, starting with the D-046 P0-C items.
- **Client deployed:** Vercel project `brivia-club` (team "Golu's projects") at `https://brivia-club.vercel.app`.
  **Production deploys from `main`** (D-051): `main` was fast-forwarded to the working branch on 2026-10-12. A push
  to the working branch builds a preview only; to go live, fast-forward `main` to it (founder OK) and Vercel deploys.
  The Supabase Auth Site URL and redirect are set to it.
  Vercel Deployment Protection is on by default; turn it off if testers without a Vercel login need access.
- **Live checks:** the `amr` re-auth on deletion **works** (D-049: `reauth_required` → password → deleted, zero rows
  left). Still open: the Google re-auth round trip.
- **Founder dashboard items from D-049/D-050:** **custom SMTP now blocks any public test**: the default sender hit
  `over_email_send_rate_limit` after 2 sign-ups in an hour. Also: a Brivia-branded confirmation email, and delete the
  unconfirmed QA user `brivia.qa.muzfgszm@maxxspace.com`.
- Real members are **not allowed yet**: see the gate table in `docs/arena/2026-10-07-iteration-4.md`.

## 3. What to do next (in order)

0. **Experience iteration Phase D, the test world** (spec `docs/superpowers/specs/2026-10-12-experience-iteration-design.md`
   §3: migration 0008, seed v2, the why panel; the founder applies the SQL in the editor). Done locally, not applied:
   Task 1 (0008 tester switch) and Task 2 (seed v2: 60 members with ORBIT roles per city, 30 preset-illustrated posts,
   3 matches with chats; 0008 section 4 lets only test members post a preset image, D-057; `supabase/seed/README.md`
   has the role table). Next: Task 3, the why panel. Going live: apply 0008 and deploy the client in one window, then
   run the seed, then add the founder's accounts to `brivia_tester`. Before that: the founder
   reviews the Phase C before/after screenshots and OKs fast-forwarding `main`.
1. **P0-C** (D-046; table "P0-C" in `docs/arena/2026-10-07-iteration-4.md`, each item has acceptance criteria).
   0005 is now live and frozen (D-047), so the SQL items go in **new migrations `0007+`**:
   1. R1 corroborated underage suspension (2 qualifying reporters, or 1 matched); a reporter's own `request`
      rows never qualify; single report → alert + review queue (`reviewed_at`).
   2. R3 ladder: `banned`, Restrict never un-hides, `moderation_remove_member`, rejoin with underage/banned
      tombstone → suspended, tombstones only for qualifying.
   3. R4 deletion hold (`deletion_held`) for flagged / open-report members.
   4. R5 `0007_moderation_alert.sql` (pg_cron + pg_net webhook, counts only, digest row). Pre-flight `pg_net`.
   5. R7 under-review notice links Privacy & account.
   6. R8: 0005 is frozen, so instead of collapsing it, the new migration redefines each function once (final form).
   7. R10 honesty copy, starting with the untrue `app.js:1577` profile helper sentence.
   8. R6 live rehearsal of deletion: password path done (D-049); Google re-auth still to do.
2. **Apply each new migration** in the SQL editor, verify its last object, and let the linked Vercel project redeploy.
3. **Founder-only gate items** (remind the founder):
   - auth hardening, recorded with dates (R11): email confirm, CAPTCHA, rate limits, leaked-password protection,
     anonymous sign-ins off, exact OAuth redirect list;
   - PITR and backups; error tracking; private repos; sign-off;
   - name the grievance officer; confirm the operational promises in `privacy.html` (7/90-day replies, 72 h
     under-18 review, "we do not sell your data", access by email, "ask again before matching on private
     interests", the 180-day resume sweep);
   - consent of each named person on the `auth.html` preview cards (now labelled "Example profiles");
   - counsel: IT Rules 180-day retention, DPDP log retention, CERT-In logs, deletion-before-report evidence;
   - **rotate the DB password that was once pasted in chat**.
4. **P1** (record "P1" list): A-I UX items, parked ledger items, private photo URLs + card budget, P0-E grid1
   adapter and sensitive firewall, IP dossier; then iteration-3 P1 items 15–25.
5. **Later, its own iteration:** the student world (D-040), after counsel on DPDP "verifiable consent".
6. **Open founder question:** should a ring-0 neighbour outrank a distant member with better shared interests?
   It is currently "interest qualifies, location orders".

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
| The current backlog and go-live gate | `docs/arena/2026-10-07-iteration-4.md` (P0-C, P1, P2, gate table); older: `docs/arena/2026-10-03-iteration-3.md` |
| Privacy notice, account & safety UI | `privacy.html`, `privacy-account.js`, `account-deletion.js`, `report-dialog.js`, `image-compress.js` |
| Brand, tokens, flows, copy | `docs/UX_SPEC.md` |
| Applying SQL to live | `supabase/migrations/README.md` |
| Test members | `supabase/seed/README.md` |
| Data breach response (containment, notices, orphan-folder report) | `docs/BREACH_RUNBOOK.md` |
| Daily moderation (new reports, flags, the 72 h suspension queue, rejoin reviews; SQL editor as owner) | `docs/MODERATION.md` |
| SQL behaviour tests | `supabase/tests/*.test.sql` (run with `run.sh`) |
| Signup (4 steps) | `auth.html`, `script.js`, `passion-budget.js`, `pending-profile.js` |
| App, deck, quota | `app.html`, `app.js`, `deck-view.js`, `signal-quota.js` |
| App nav, tokens, skeletons, profile checklist | `app-nav.js`, `app-shell.css`, `tokens.css`, `app-skeletons.js`, `profile-checklist.js`, `profile-view.css` |
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
