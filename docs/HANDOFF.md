# Session handoff (read after CLAUDE.md)

Last updated: 2026-10-14, after Phase E of the experience iteration (the guided signup), on branch
`claude/jolly-edison-49xvza` (repo `Georgian-86/brivia-club-v1`). `origin/main` is at `741b77b` (Phases C and D;
checked with `git ls-remote` on 2026-10-14). Phase E and `0010` are on the branch only. Live SQL: `0008`, seed v2 and
`0009` are applied, and `0010` is being applied today for the founder's live test (section 2).
Update this file at the end of every session. CLAUDE.md holds the aim; this file holds **where we are**.

## 1. What is done

**Founder live-test hotfix (2026-10-14): on `main` (`07d1f45`), merged into the working branch.** See D-061.
- The deck: card and Pass / Pitch aligned on desktop (controls centred under the card, card never under the top bar),
  the heavy left/right swipe (`deck-swipe.js`, unit-tested maths in `tests/unit/deck-swipe.test.mjs`), the stacked next
  card, the pitched card staying until the sheet resolves, and a branded placeholder for a missing or broken cover.
- Seed follow-up for the founder: 34 seeded test members have no cover and no photo (rows 1-24, and 30-32, 38, 46-48,
  58-60); the client now shows the placeholder, but giving them preset covers in `supabase/seed/test-members.sql` would
  make the test deck look finished. Open question: should cancelling a pitch send nothing and keep the card (changes
  D-018)? Today it sends the plain like, as D-018 says.

**Experience iteration, Phase E (2026-10-14): the guided signup. Done on `claude/jolly-edison-49xvza`, NOT on `main`.**
See D-060 (and UX_SPEC §A).
- One question per screen at every width. Email path: Welcome → Email → 6-digit code → 18+ → Name → Area →
  Interests → Reveal. Google path: Welcome → 18+ → Name → Area → Interests → Reveal. It collects no phone, no gender and
  no points screen; interests are saved with an even split (`passion-budget.js` `evenSplit`, ORBIT_ENGINE §3.2).
  Files: `signup-screens.js`, `signup-profile-screens.js`, `signup-flow.js`, `signup-errors.js`, `signup.css`,
  `area-pick.js`.
- Resume anywhere (a session lands on the first unanswered screen). Login has "Email me a code instead". Deletion
  re-auth offers both the password and "Send me a code". The old 4-step form and the landing's hidden form are deleted.
  The app profile editor no longer collects or writes phone (`saveProfile { contact: false }`).
- `VITE_SIGNUP_METHODS` (comma list of `google`, `email`) picks the Welcome buttons. Empty shows "Signups open soon"
  and only hides the buttons (D-060 has what really closes signups).
- `0009_signup_minimisation.sql` (notice version `2026-10-20`; `2026-10-05` is still accepted until 2026-11-03).
  **Applied live by the founder on 2026-10-14.**
- Signup e2e (Vite on **:5193**; one command runs three servers in turn, one per switch value):
  `PLAYWRIGHT_MODULE=/tmp/pw/node_modules/playwright/index.mjs node tests/e2e/signup.spec.mjs`
  (`E2E_SCREENSHOTS=<dir>` saves every screen). Final screenshots: the session scratchpad, `phase-e-shots/final/`.
- Commit trailer rule (founder, 2026-10-13): commits end with the `Claude-Session:` line only, **no `Co-Authored-By`**.
- `0010_open_test_world.sql` (D-059, the founder's live test): an owner switch that puts every member in the test world.

**Experience iteration, Phase D (2026-10-13): on `main` (`741b77b`); 0008 and seed v2 applied live (2026-10-14).**
See D-057 and D-058.
- `supabase/migrations/0008_tester_world.sql`: the tester switch (`brivia_tester`, `brivia_in_test_world`, 14
  world-checked functions, cross-world pair hiding when a tester is on one side), the post-image trigger (preset
  illustrations for `is_test` authors only), and `deck_why` (section 5).
- Seed v2 (`supabase/seed/test-members.sql`): 60 test members in Mumbai, Thane, Pune, Bengaluru and Delhi, with posts,
  requests, matches and chats, flags, blocks and consent rows; the role table is in `supabase/seed/README.md`. The purge
  removes all of it, empties `brivia_tester` and never deletes a tester's own account.
- "Why this person?" on the deck card, testers only (`why-panel.js`, `app.js`, `deck.css`): the band label, "You both:
  …" and the deck's order keys. A real member's client asks `rpc/deck_why` once per page and never again.
- Far matches: the deck still has no escape-velocity lane (60 km pool); the far-strong member is found by search, and
  a unit test runs it through ORBIT's gate. Wiring ORBIT's far lane into the deck is founder backlog (the harness
  assertion "far partner absent from deck" must flip then).
- Commit trailer rule (founder, Phase D on): commits end with the `Claude-Session:` line only, **no `Co-Authored-By`**.

**Experience iteration, Phase C (2026-10-13): on `main`.** See D-055.
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
| Experience iteration A-C (signup guide, landing speed, consistency) | On `main` | D-053, D-054, D-055 |
| Experience iteration D (test world: 0008, seed v2, "Why this person?") | On `main`; 0008 and seed v2 live | D-057, D-058 |
| Open test world switch (0010) | On the branch; the founder applies it for today's live test | D-059 |
| Experience iteration E (guided signup, 0009) | On the branch, NOT on `main`; 0009 live | D-060 |
| Decisions | D-001 … D-060, append-only | `docs/DECISIONS.md` |

Test status after D-060 (2026-10-14): see the D-060 entry for the exact counts (SQL harness ALL PASSED; build OK;
`test:unit` and orbit green; `check:assets` and `check:styles` OK; landing parity identical; e2e signup, onboarding,
consent, deck, landing and app-shell all passed).
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
- **`0008_tester_world.sql` and seed v2 are applied (founder, 2026-10-14)** and frozen.
- **`0009_signup_minimisation.sql` is applied (founder, 2026-10-14)** and frozen. The server's notice version is now
  `2026-10-20`. The deployed client (`main`, Phase D) still declares `2026-10-05`, which `brivia_notice_accepted`
  accepts only **until 2026-11-03 00:00 UTC**. The Phase E client must be on `main` before then, or new members'
  18+ declarations fail with `stale notice version`.
- **`0010_open_test_world.sql` is written; the founder is applying it today** and turning the switch on for a live test
  (every member's deck also shows the test members). **Close it and run the purge before real launch** (section 3).
- **Client deployed:** Vercel project `brivia-club` (team "Golu's projects") at `https://brivia-club.vercel.app`.
  **Production deploys from `main`** (D-051): `origin/main` is at `741b77b` (Phase D). Phase E is not deployed. A push
  to the working branch builds a preview only; to go live, fast-forward `main` to it (founder OK) and Vercel deploys.
  The Supabase Auth Site URL and redirect are set to it.
  Vercel Deployment Protection is on by default; turn it off if testers without a Vercel login need access.
- **Live checks:** the `amr` re-auth on deletion **works** (D-049: `reauth_required` → password → deleted, zero rows
  left). Still open: the Google re-auth round trip, and the email-code re-auth (Phase E; section 3, "Phase E
  go-live", item 5).
- **Founder dashboard items from D-049/D-050:** **custom SMTP now blocks any public test**: the default sender hit
  `over_email_send_rate_limit` after 2 sign-ups in an hour. Also: a Brivia-branded confirmation email, and delete the
  unconfirmed QA user `brivia.qa.muzfgszm@maxxspace.com`.
- Real members are **not allowed yet**: see the gate table in `docs/arena/2026-10-07-iteration-4.md`.

## 3. What to do next (in order)

**Now (the founder's live test, 2026-10-14):** apply `0010` and switch it on (`supabase/migrations/README.md`, "0010").
Then check that `origin/main` at `741b77b` has deployed on Vercel. Our pushes to `main` were blocked, so the founder
fast-forwards `main` or allows the push. **Before real launch:** set
`open_test_world = false`, run `select public.refresh_cell_density();`, then run the purge
(`supabase/seed/purge-test-members.sql`). **Close the switch within 6 nights** (D-059 addendum): while it is open,
seeded test members count toward a real member's 10-member density floor, and closing resets the real-world streaks,
so real members show place names instead of `~3 km`/`~10 km` for at least 7 nights. The manual refresh is a no-op
if that night's run already happened, so bands never change "at once".
**Backlog (SQL, `0011`):** key `refresh_cell_density` on `brivia_tester_world` instead of `brivia_in_test_world`, so
`is_test` members never satisfy a real member's floor whatever the switch says.

**Phase E go-live (D-060), before 2026-11-03.** The founder must do all of these, in one window:
1. **Custom SMTP** in Supabase Auth, with a "Magic Link"/OTP email template that contains `{{ .Token }}` (the 6
   digits), Brivia branding and a raised rate limit. Without it, ship with `VITE_SIGNUP_METHODS=google`.
2. **Google OAuth production config** (Supabase provider plus Google Cloud): either list the testers as consent-screen
   test users, or publish the app.
3. **`VITE_SIGNUP_METHODS` in Vercel** (Production): `google,email` when both 1 and 2 are done, `google` or `email`
   when only one is, and empty when neither is. **Empty only hides the buttons.** If signups must really be closed, also
   turn off Supabase Auth → "Allow new users to sign up": the login Google button and direct API calls can otherwise
   still create accounts.
4. Fast-forward `main` to the branch (the founder's OK), so that Vercel deploys Phase E (0009 is already live).
5. **One live check:** sign up or log in with an email code, then delete a test account through "Send me a code".
   This confirms that OTP verify writes an `amr` entry with a `timestamp` that `delete_my_account`'s freshness check
   accepts (`0005_p0b.sql`, around line 563: the latest `amr` timestamp must be within 600 s). If deletion still answers
   `reauth_required` right after a code login, the code re-auth path needs a fix.
6. **Privacy notice date (founder decision, I4).** `privacy.html` says "Version 2026-10-20 · effective 20 October
   2026". Either deploy the Phase E client on or after 20 October 2026, or change that visible date to the deploy
   date. Leave the version string (`2026-10-20`, `notice-version.js` and `brivia_notice_version()`) unchanged either
   way.
7. **18+ "No" deletes the account (final fix I3).** It calls `delete_my_account('DELETE')` right after the code was
   verified, then signs out. The live check in item 5 covers the same `amr` freshness. On the Google path an older
   session can answer `reauth_required`: the member is still signed out and sees the adults-only copy, but that
   account (and its email) stays in `auth.users` until removed by hand.
8. Follow-ups: the pending-profile path (`pending-profile.js`, its `script.js` block, and the
   `brivia-pending-profile` cleanups) is due for removal next release. Setting `user_metadata.has_password` would let
   the delete dialog stop offering a password to members who never set one.
9. **Repository history note (accepted, not rewritten):** commit `6c65816` holds a 31.9 MB `docs/DECISIONS.md` blob
   (the corrupted file, repaired in `0800319`). The founder accepted keeping it; history is not rewritten.

0. **Phase D, the test world (D-058): steps 1 and 2 were done live on 2026-10-14, and the client is on `main`
   (`741b77b`).** Kept for reference (step 3 adds a tester account; the switch in step 5 is today's live test). The
   steps, in the SQL editor as `postgres` (details in `supabase/migrations/README.md`, "0008"):
   1. apply `0008_tester_world.sql` (with `set lock_timeout = '5s';` on the first line) and run its read-only checks;
   2. run seed v2, `supabase/seed/test-members.sql`;
   3. for each of the founder's accounts:
      `insert into public.brivia_tester(member_id) select id from auth.users where email = '<your email>' on conflict do nothing;`
   4. `select public.refresh_cell_density();` (it does nothing if that night's run already happened). Cards show
      `~3 km`/`~10 km` only once the target's g7 cell is `ok10` (7 consecutive nightly runs with at least 10 counted
      members, who must be over 14 days old); with the seed's under-2 km spread, expect place names (Thane, Mumbai)
      for a long time. That is safe, not a fault.
   The deck then shows test members near Thane and Bengaluru, and each card has "Why this person?".
   5. **Optional, for a live test with real members (D-059):** apply `0010_open_test_world.sql`, then
      `update public.brivia_world_switch set open_test_world = true, changed_at = now();` and
      `select public.refresh_cell_density();`. Every member's deck then also shows test members. Close it with
      `... set open_test_world = false ...` within 6 nights (D-059 addendum) and run the purge before real launch.
   **To stop being a tester:**
   `delete from public.brivia_tester where member_id = (select id from auth.users where email = '<your email>');`
   The account is back in the real world at once; until the purge it can still read its old test-world matches,
   messages and pending requests, but cannot message test members (Ruling 5). The purge
   (`supabase/seed/purge-test-members.sql`) deletes the test members and everything tied to them and empties
   `brivia_tester`; it never deletes a tester's own account.
   **After 0008, the next live policy comparison must expect a change:** `supabase/tests/policies-0006.expected.tsv`
   no longer matches the live `matches` and `messages` select policies (0008 rewrites them to add the cross-world pair
   check). The repo has no generator for a 0008 snapshot, so the comparison must expect exactly those two policy
   differences (or the next session adds a `policies-0008.expected.tsv`).
   Founder backlog from Phase D: wire ORBIT's far lane into the deck (then flip the harness's "far partner absent from
   deck" assertion).
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
| Signup (guided, Phase E) | `auth.html`, `signup-screens.js`, `signup-profile-screens.js`, `signup-flow.js`, `signup-errors.js`, `signup.css`, `area-pick.js`, `passion-budget.js` (`evenSplit`); old-account path `script.js`, `pending-profile.js` |
| App, deck, quota | `app.html`, `app.js`, `deck-view.js`, `signal-quota.js` |
| Test world (tester switch, why panel) | `supabase/migrations/0008_tester_world.sql`, `why-panel.js`, `supabase/tests/d-tester-world.test.sql`, `supabase/seed/README.md` |
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
