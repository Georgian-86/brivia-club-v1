# Phase D: Test World for the Founder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The founder's own real account sees a full deck of test members (and no real members) so the matching engine can be tried end to end. The founder also gets a richer, more realistic test world and a "Why this person?" panel that only testers see.

**Architecture:**
- Migration `0008_tester_world.sql` adds an owner-only `brivia_tester` table and one helper, `brivia_in_test_world(uid)`.
- Every live function and policy that compares worlds through `profiles.is_test` is redefined once to compare `brivia_in_test_world(...)` instead. That covers visibility, the deck, candidates, search, requests, messages, posts, cell density and deck status.
- The seed grows to about 60 members with posts, requests, matches and chats; the purge clears it and the tester list.
- The deck card gets a tester-only explanation panel. The server gates it.

**Tech Stack:** Postgres/Supabase SQL (migrations run manually in the SQL editor by the founder), `bash supabase/tests/run.sh` (the harness applies all migrations twice and runs every `*.test.sql`), Vite and vanilla JS, Playwright e2e (stubbed).

**Spec:** `docs/superpowers/specs/2026-10-12-experience-iteration-design.md` §3 (approved). Founder, 2026-10-13: "this time deck should not be empty. I want the test profiles over there."

## Global Constraints

- Migrations 0001–0007 are frozen; new SQL goes in `0008` only. The founder applies it in the SQL editor. Never write to the live database from a session; read-only checks only.
- **Semantics unchanged for everyone who is not a tester:**
  - a test member sees only test members;
  - a real member sees only real members;
  - a tester (a real account listed in `brivia_tester`) sees only the test world, and is visible only to the test world;
  - no real member can ever see a tester's account while it is a tester.
- **Location privacy unchanged:** coarse cells only, rounded distances, and no coordinates or emails to other clients.
- **The purge must never delete a tester's own account.** It deletes test members (rows tied to them cascade, including the tester's matches, requests and messages with test members) and empties `brivia_tester`.
- Test members are clearly marked (`@test.brivia.club`, the seed id prefix `a7e57000-0000-4000-8000-`), with generated avatars only (no real photos).
- `DECISIONS` is append-only. HANDOFF is updated.
- **Commits** end with `Claude-Session: https://claude.ai/code/session_01BPtSsvGbTkCpzEXTbQkfEX` and **no `Co-Authored-By` line**.
- Gate before push: harness (twice, inside run.sh), build, unit, orbit, check:assets, check:styles, landing parity, and all e2e suites (one at a time).

## Review Focus

- **A function the plan's enumeration missed** would still compare `is_test` and silently hide test members from the tester (an empty deck again), or leak a tester to real members. The harness must fail if any live function body or policy in `public` still compares `is_test` across two members outside the allow-list (the guard trigger, the density table key, the seed/purge).
- **The tester's own prior real-world data** (their real requests or matches with the other real account) must stay invisible while they are a tester, and reappear unchanged when the tester row is removed.
- **Cell density** (`brivia_cell_ok`, k-anonymity): the tester's home cell counts in the test world while they are a tester, not in the real world. Removing the tester recomputes correctly on the next density run.
- **The purge with a tester present:** the tester's account, profile, interests and home cell survive; their test matches and messages go; `brivia_tester` ends empty.
- **The "Why this person?" panel** is never sent to a real member's client. The RPC refuses (or returns nothing) unless the caller is in the test world.

---

### Task 1: Migration 0008 — the tester switch

**Files:**
- Create: `supabase/migrations/0008_tester_world.sql`, `supabase/tests/d-tester-world.test.sql`
- Modify:
  - `supabase/seed/purge-test-members.sql` (also `delete from public.brivia_tester`, and report it);
  - `supabase/migrations/README.md` (0008 apply steps; the one-line tester insert; how to stop being a tester);
  - `supabase/seed/README.md` (the tester switch).

**Interfaces:**
- Produces:
  - **Table:** `public.brivia_tester(member_id uuid primary key references public.profiles(id) on delete cascade, added_at timestamptz not null default now())`. RLS enabled with no policies; `revoke all` from `anon` and `authenticated`.
  - **Helper:** `public.brivia_in_test_world(p_id uuid) returns boolean`: `stable security definer`, `search_path = public`, true when the profile `is_test` or a tester row exists. Revoked from public, anon and authenticated; it is used only inside other definer functions.
  - **Redefinitions:** every function body and policy in `public` that compares two members' worlds is redefined once in 0008 to use the helper, with everything else verbatim. Find them with the harness query in Step 1; do not rely on a hand list. Known sites include:
    - `brivia_same_world` and `brivia_visible_to`;
    - the candidate, search and directory functions (`... p.is_test = me.is_test`);
    - `deck_candidates`, including `brivia_cell_ok(o.home_cell, me.is_test, 10)`, which becomes the caller's world;
    - `deck_status`;
    - the request, message and post author checks;
    - `brivia_refresh_cell_density` (its `is_test` key becomes `brivia_in_test_world(member)`; the table column keeps its name);
    - the 0005 check at line ~398.
  - **The founder's use** (documented, not executed by the session): `insert into public.brivia_tester(member_id) select id from auth.users where email = '<founder email>' on conflict do nothing;` then `select public.brivia_refresh_cell_density();` (or the existing cron). Stop being a tester with `delete from public.brivia_tester where member_id = ...;`.

- [ ] **Step 1: Write the failing harness tests** in `d-tester-world.test.sql`. Use real seeded fixtures: 2 test members in one city, 2 real members in the same city, and real member R1 made a tester.
  - `tester R1's deck_candidates returns test members and no real members`;
  - `real member R2 sees neither R1 nor test members (deck, search, candidates, get profile)`;
  - `test member T1 can see R1 (same world) and can request R1; a match forms by mutual consent`;
  - `R1 cannot request or message R2 while a tester`;
  - `removing R1's tester row restores R1↔R2 visibility and hides test members again`;
  - `cell density counts R1 in the test world while a tester`;
  - `the purge deletes test members and R1's test match/messages, empties brivia_tester, and keeps R1's profile, member_interest and member_orbit`;
  - `brivia_tester is not readable or writable by authenticated or anon`;
  - **Guard:** `no function in public (pg_proc.prosrc) nor policy (pg_policies.qual/with_check) compares is_test between two profiles` — a regex over `prosrc` for `is_test\s*=\s*\w+\.is_test` and `= me.is_test`, plus an allow-list for `brivia_guard_is_test` and the purge or seed.
- [ ] **Step 2: Run** `bash supabase/tests/run.sh`. Expect FAIL (table missing).
- [ ] **Step 3: Implement 0008.** It must be idempotent (`create table if not exists`, `create or replace`). Re-grant exactly what each function had before (copy the grants from the defining migration).
- [ ] **Step 4: Run** the harness (applies everything twice) and the seed+purge checks in `run.sh`. Expect ALL PASSED. Also run the existing e2e deck suite (stubbed; unaffected) as a smoke test.
- [ ] **Step 5: Commit** `feat(db): 0008 tester world switch (Phase D)`.

### Task 2: Seed v2 — a realistic test world

**Files:**
- Modify: `supabase/seed/test-members.sql` (to v2, idempotent, fixed ids with the same prefix), `supabase/seed/purge-test-members.sql`, `supabase/seed/README.md`
- Test: the seed and purge checks in `supabase/tests/run.sh` (extend the expected counts)

**Interfaces:**
- Produces seed v2:
  - **Members:** about 60 (keep `t01`–`t24` unchanged; add `t25`–`t60`): Mumbai 12, Thane 10, Pune 10, Bengaluru 14, Delhi 14. The founder's real accounts are in Thane and Bengaluru, so those cities get the richest coverage.
  - **ORBIT coverage per city:**
    - 3 close neighbours with 2+ shared interests;
    - 2 with weak overlap;
    - 1 far-but-strong match (≥ 3 shared interests, another city), for the escape-velocity gate;
    - all four modes;
    - 3 members with one private (sensitive) interest, with consent rows;
    - 2 flagged members (`suspended_pending_review`, invisible);
    - 1 block pair.
  - **Content:**
    - about 30 community posts with seeded illustration images (existing preset covers only; no new uploads; an image URL from the app's preset set);
    - requests in both directions involving `t01`;
    - 3 matches (via mutual requests and the trigger, never a direct insert) with 4–8 short messages each;
    - notifications as produced by those rows.
  - **Avatars:** generated monograms or the existing illustration presets only.
  - **Result row:** `test_members = 60`, `test_posts ≈ 30`, `test_matches = 3`, `flagged = 10` (2 per city × 5 cities), `blocks = 5`. Use exact numbers in the test.

- [ ] **Step 1: Update the harness expectations** to the v2 counts and add the ORBIT checks: in each city, `deck_candidates` for that city's first member returns its 3 neighbours first, never a flagged member, and the far-strong match appears only through the gate. Run; expect FAIL.
- [ ] **Step 2: Write seed v2 and the purge update.** Run the harness (seed → checks → purge → zero remaining). Expect PASS.
- [ ] **Step 3: Commit** `feat(seed): test world v2, 60 members with posts, matches and chats (Phase D)`.

### Task 3: "Why this person?" — testers only

**Files:**
- Create:
  - in `supabase/migrations/0008_tester_world.sql` (same migration; Task 1 is not yet applied live, so 0008 is still open): `public.deck_why(p_target uuid) returns table(shared_interests text[], distance_band text, rank_keys jsonb)`, `security definer`. It returns rows only when `brivia_in_test_world(auth.uid())` and the target is visible to the caller; it reuses the deck's existing explanation fields (`shared_interests`, `distance_band`, and the ordering keys `deck_candidates` already computes).
  - `why-panel.js` (pure markup from the RPC row)
  - `tests/unit/why-panel.test.mjs`
- Modify:
  - `app.js`: on a deck card, testers (known when `deck_why` returns a row for the current card) get a small "Why this person?" disclosure button that opens the panel; real members never call the RPC (`my_onboarding_status` or `profiles` row has no tester flag; call it once and cache a negative).
  - `deck.css` or `app-shell.css` (tokens only)
  - `tests/e2e/app-stub.mjs` and `tests/e2e/deck.spec.mjs`
  - `supabase/tests/d-tester-world.test.sql`

**Interfaces:**
- Produces: `whyPanelMarkup(row: {shared_interests: string[], distance_band: string, rank_keys: object}) => string`, escaping every value. Distance is shown as the band label only.

- [ ] **Step 1: Write the failing tests:**
  - **harness:** `deck_why returns nothing for a real member`; `returns the shared interests and band for a tester viewing a test member`; `nothing for an invisible target`;
  - **unit:** markup escapes, shows "You both: …", the band, and rank keys as a small definition list;
  - **e2e (stub):** `a tester sees "Why this person?" on the card and the panel lists the shared interests`; `a real member never requests rpc/deck_why after the first negative and sees no button`.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expect PASS.
- [ ] **Step 5: Full gate** and screenshots (deck with panel, 375 and 1440). Append D-058 (Phase D results; the apply order: 0008, seed v2, then insert the tester row) to `docs/DECISIONS.md`; update HANDOFF.
- [ ] **Step 6: Commit** `feat(app): tester-only "Why this person?" panel; D-058 (Phase D)`.

## Founder steps after Phase D ships (SQL editor, in order)

1. Apply `0008_tester_world.sql`.
2. Run the updated `supabase/seed/test-members.sql` (v2).
3. `insert into public.brivia_tester(member_id) select id from auth.users where email = '<your email>' on conflict do nothing;` for each of your accounts.
4. `select public.brivia_refresh_cell_density();`

Then your deck shows test members near Thane and Bengaluru.
