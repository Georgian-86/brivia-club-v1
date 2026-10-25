# Migrations: apply and deploy runbook

The files here are applied **by hand in the Supabase SQL editor, as `postgres`, in order** (`0001` → `0013`; there is
no `0007`). Each
file is idempotent: the local harness (`bash supabase/tests/run.sh`) applies every file twice. Verify locally with
the harness before touching the live project. `supabase/legacy/` is archive only and is never applied.

**Historical (2026-10-07): `0001`–`0004` are applied on the live project and frozen** (D-038: a file applied live is
never edited again; later changes go in a new numbered file; `0004` went live on 2026-10-05, D-042). **Next: apply
`0005`, verify it, then apply `0006`; deploy the new client in the same window as `0005`** (sections "0005" and "0006"
below). Sections 0–4 are the historical `0004` runbook, kept for reference (pg_cron, log settings and the advisor list
still apply).

**Live state (2026-10-20, D-070): `0001`–`0006`, `0008`, `0009` and `0010` are applied and frozen.** `0009` and `0010`
were applied on 2026-10-14 from branch `claude/jolly-edison-49xvza` (`0010` builds on `0008`'s `brivia_tester`, so
`0008` is live too) and are recorded here verbatim since 2026-10-20. Verified read-only on 2026-10-20:
`brivia_notice_version()` = `2026-10-20`, `brivia_notice_accepted('2026-10-05')` = `true`, and the open-test-world
switch is **on** (`brivia_world_switch.open_test_world = true`). **Next: apply `0011` before 2026-11-03** (section
"0011"): without it, every `declare_adult` from the live client (which sends `2026-10-05`) fails from that date and no
new member can finish signup. Then **close the open test world** (section "0010").

Daily moderation (reports, suspensions, rejoin reviews) after `0005`: `docs/MODERATION.md`.

## 0. Pre-flight checks (historical: run in the SQL editor before `0004`)

```sql
select is_anonymous from auth.users limit 0;                     -- must succeed: completion reads this column
select extname from pg_extension where extname = 'pg_cron';      -- one row: pg_cron is on (step 3); none: enable it first
```

If the first query fails, stop: `0004`'s `brivia_member_completed` reads `auth.users.is_anonymous`.

## 1. Before you apply: plan the window (deploy order)

- **Apply `0004` and deploy the new client in the same window** (`0001`–`0003` are already live). The old client breaks against `0004`
  (raw `connection_requests` inserts are revoked, `skills`, `city` and `state` are no longer client-writable, and
  the deck moved to `deck_candidates`). The new client breaks without `0004` (it calls `send_signal`,
  `my_signal_quota`, `deck_candidates`, `my_onboarding_status`, `set_home_*` and `set_member_interests`).
- **Existing members must redo onboarding** (interests with all 20 points, and an area) before they can message or
  match again: completion changed in `0004` (D-030), and a member who is not completed is invisible and sees nobody.
  **Tell the real accounts before you apply.**
- Have the go-live DECISIONS entry open: steps 2 and 4 record results in it.

## 2. Check the log settings on the live project

`set_home_location(lat, lng)` receives coordinates as arguments, and they must never reach a log (spec §9.1.4). In
the SQL editor run:

```sql
show log_parameter_max_length;
show log_min_duration_statement;
show log_statement;
```

- If statement logging is on in any form (`log_statement` is `all` or `mod`, or `log_min_duration_statement` is not
  `-1`), then **`log_parameter_max_length` must be `0`**. Otherwise bound parameters (the coordinates) are written
  to the log.
- If it is not `0` and you cannot change it, do not apply `0004` until it is fixed.
- **Record the three values in the go-live DECISIONS entry.**

## 3. Enable pg_cron (before `0004`)

`0004` schedules two nightly jobs when pg_cron is installed: `refresh_cell_density()` (the k-anonymity streaks,
§9.1.4) and `purge_expired_requests()` (expired requests, signal-ledger rows older than 30 days, `location_change`
and `interest_rewrite` rows older than 24 hours, and `cron.job_run_details` history older than 7 days).

1. Dashboard → **Database → Extensions** → enable **pg_cron**.
2. Then apply `0004` (step 4).
3. **If pg_cron was enabled after `0004` ran**, re-run `0004` (it is idempotent) or just the scheduling call:
   ```sql
   select public.brivia_schedule_nightly_jobs();   -- returns the number of jobs scheduled (2), or 0 without pg_cron
   ```
   It unschedules each job by name before scheduling it, so a re-run never adds a second copy.
4. Verify:
   ```sql
   select jobname, schedule from cron.job;
   ```
   Expect exactly:

   | jobname | schedule (UTC) | IST |
   |---|---|---|
   | `brivia-refresh-cell-density` | `17 20 * * *` | 01:47 |
   | `brivia-purge-expired-requests` | `37 20 * * *` | 02:07 |

Without pg_cron, `0004` raises a notice and schedules nothing. A missed night restarts the density streaks, so cards
in sparse cells stay coarsened (safe, but the deck shows place names instead of `~3 km`).

## 4. Apply (historical: the 0004 window)

1. Apply only `0004_orbit_onboarding.sql`, as one run in the SQL editor (it is clean in a single transaction;
   `0001`–`0003` are live and frozen: never re-run or edit them).
2. Deploy the new client (same window, step 1).
3. **Then run the seed** (only if test members are wanted): follow `supabase/seed/README.md`
   (`seed/test-members.sql`, as `postgres`; remove with `seed/purge-test-members.sql`).
4. **Then run the advisors**: Dashboard → **Advisors** → Security and Performance. Record the result in the go-live
   DECISIONS entry. The security advisor must show nothing beyond the expected warnings below (go-live gate, D-026).

### Expected advisor warnings after `0004` (intended, not failures)

The lint "security definer function executable by `authenticated`" (and its "public" variant) is expected for exactly
these **intended member RPCs** in `public`. Each is pinned to `auth.uid()`, has `search_path = public`, and is not
executable by `anon`:

`deck_candidates`, `deck_status`, `get_candidates`, `search_members`, `send_signal`, `my_signal_quota`,
`my_outgoing_requests`, `respond_connection_request`, `my_interests`, `my_onboarding_status`, `set_member_interests`,
`set_sensitive_consent`, `set_home_location`, `set_home_city`, `brivia_has_completed_profile` (0001, used by policies),
`brivia_can_see_author` (0003, the post policy; replaced by `community_feed()` in P1).

The policy wrappers in `brivia_private` (`brivia_can_message`, `brivia_incoming_request_visible`,
`brivia_interaction_insert_ok`) are not in an exposed schema; if a lint lists them, it is the same intended case.
Anything else is a finding: `list_members`, `brivia_same_world`, `brivia_interaction_allowed`,
`brivia_is_blocked_between`, `brivia_request_sender_completed`, the grid helpers and `brivia_guard_is_test` must not
be executable by `authenticated` or `anon`, and no function may have a mutable `search_path`. The harness checks the
same list (`supabase/tests/orbit-hygiene.test.sql`, H3/H5).

## 0005: P0-B (DPDP consent, member safety, honesty)

Apply **only `0005_p0b_dpdp_safety.sql`** (0001-0004 are live and frozen), as `postgres` in the SQL editor, and deploy the
matching client in the same window (the client declares the 18+ confirmation; an old client cannot complete members after
0005). Verify it (below), then apply `0006`. The file is idempotent. Sections are appended by task; this part covers
sections 1-4 (the 18+ gate, consent, reports, the rejoin tombstone, account deletion, the retention purge and the
city-wide label).

### Pre-flight (read-only, before the apply)

```sql
select rolbypassrls from pg_roles where rolname = 'postgres';      -- must be t (it was t on 2026-10-07)
select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace
 where e.extname = 'pgcrypto';                                     -- must be 'extensions' (0005 calls extensions.hmac / gen_random_bytes)
select has_table_privilege('postgres', 'auth.users', 'DELETE');    -- must be t (delete_my_account deletes the auth user)
-- Every foreign key to profiles or auth.users must cascade or set null; a NO ACTION / RESTRICT key (for example from a
-- table made in the dashboard) makes delete_my_account fail for any member who has such a row. Expect 0 rows.
select conrelid::regclass as from_table, conname, confrelid::regclass as to_table, confdeltype
  from pg_constraint
 where contype = 'f' and confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
   and confdeltype not in ('c', 'n')
 order by 1, 2;
-- Career applications the first nightly purge will delete (see the warning below).
select count(*), min(created_at) from public.career_applications where created_at <= now() - interval '180 days';
```

- **`rolbypassrls` must be `t`.** `delete_my_account` checks that the member's Storage folders are empty by reading
  `storage.objects` as `postgres`, and RLS is on there. Without BYPASSRLS the check sees no rows and **fails open**: an
  account is deleted while its files stay publicly served. If it is `f`, stop: do not ship the deletion UI.
- If pgcrypto is not in `extensions`, or `postgres` cannot delete from `auth.users`, or the FK query returns a row you
  cannot explain, stop and report it.

> **WARNING: the first nightly purge after 0005 deletes real data.** `purge_expired_requests()` now deletes
> `career_applications` rows older than 180 days (applicants' name, email, LinkedIn and `resume_path`; they are not
> test members). The live count was 0 on 2026-10-07; **re-run the count above right before applying**. If it is not 0,
> export those rows or record the decision first. The resume files in `career-resumes` are **never** deleted by SQL:
> sweep files older than 180 days by hand every month (`docs/MODERATION.md` §6).

### Apply

- Avoid the cron window **20:17–20:37 UTC (01:47–02:07 IST)**: the two nightly jobs run then.
- Put `set lock_timeout = '5s';` on the first line of the editor, above the file, and run everything as one run. If a
  lock times out, nothing is applied (one transaction): run it again a little later.

### Post-apply checks (read-only)

```sql
select count(*) from public.moderation_pepper;                                         -- 1
select count(*) from public.profiles where is_test and adult_declared_at is not null;   -- 24 (the seeded test members)
select count(*) from public.profiles where is_test and adult_declared_at is null;       -- 0
select jobname, schedule, command from cron.job order by jobname;
-- unchanged: brivia-purge-expired-requests | 37 20 * * * | select public.purge_expired_requests()
--            brivia-refresh-cell-density   | 17 20 * * * | select public.refresh_cell_density()
select tgname, tgrelid::regclass from pg_trigger
 where tgname in ('brivia_profiles_consent_guard', 'brivia_require_adult') and not tgisinternal
 order by 1, 2;                                                                         -- 3 rows: profiles; member_interest, member_orbit
select count(*) from public.profiles where not is_test and adult_declared_at is null;   -- real members who must still declare
```

- **Effect on live members:** completion now needs `profiles.adult_declared_at`. Real members who completed before 0005
  are not declared and become invisible until they confirm in the app (they are routed back to step 1). Test members are
  backfilled by 0005 itself (the 24 above).
- **Expected advisor list after 0005:** the 0004 list above, plus the new intended RPCs `declare_adult`, `report_member` and `delete_my_account`; `brivia_notice_version` is a plain invoker function.
  Nothing else may be executable by `authenticated`/`anon`: `consent_event`, `member_report`, `report_attempt`,
  `moderation_pepper` and `moderation_tombstone` are owner-only (RLS on, no grants); `brivia_email_digest` and
  `brivia_is_declared` are owner-only functions. Also expected (INFO, intended): **"RLS enabled, no policy"** for those 5
  owner-only tables, and **"no primary key"** for `report_attempt` (an append-only counter, purged after 30 days).
- **Go-live gates for self-serve deletion** (both read-only, both before the deletion UI ships):
  1. `rolbypassrls` is `t` (pre-flight above).
  2. The JWT `amr` shape: on a test-member session, `select auth.jwt()->'amr'` must show a `timestamp` (an array of
     `{"method": ..., "timestamp": <epoch>}`). If it does not, `delete_my_account` (which requires a login within 10
     minutes) refuses every call with `reauth_required`; fix that before shipping the deletion UI.
- `purge_expired_requests()` keeps its signature and cron command; it now also applies the retention schedule (spec 9.1.6).
- **Moderation starts the day 0005 is live:** `docs/MODERATION.md` (daily; the 72-hour under-18 review is a published promise).

## 0006: performance policies (R8)

Apply **only `0006_perf_policies.sql`**, as `postgres` in the SQL editor, **after 0005 is applied and verified live**. No
client change is needed. The file is idempotent. It rewrites 17 RLS policies with `(select auth.uid())` (same command,
roles, permissive flag and checks) and adds 4 foreign-key indexes (`brivia_blocks_blocked_idx`,
`community_posts_author_idx`, `matches_user2_idx`, `member_orbit_place_idx`). It never creates "Members can send
connection requests" (0004 dropped it on purpose).

- **Before applying: read-only drift check (mandatory).** 0006 replaces policies by name only, so a policy edited in the
  dashboard would be silently overwritten, and an extra dashboard-created permissive policy would survive and OR with the
  hardened ones. Run these three queries in the SQL editor (all read-only):

  1. Live policies in the same normalised form as the committed snapshot
     [`supabase/tests/policies-0005.expected.tsv`](../tests/policies-0005.expected.tsv) (same columns, same sort):

     ```sql
     select schemaname, tablename, policyname, cmd, roles::text as roles, permissive,
            replace(replace(coalesce(qual, '-'), '( SELECT auth.uid() AS uid)', 'auth.uid()'), E'\n', '\n') as qual,
            replace(replace(coalesce(with_check, '-'), '( SELECT auth.uid() AS uid)', 'auth.uid()'), E'\n', '\n') as with_check
     from pg_policies
     where schemaname in ('public', 'storage')
     order by schemaname collate "C", tablename collate "C", policyname collate "C";
     ```
  2. Policy count per table (must equal the number of lines in the TSV for that table; 35 in total):

     ```sql
     select schemaname, tablename, count(*) as policies
     from pg_policies where schemaname in ('public', 'storage')
     group by 1, 2 order by schemaname collate "C", tablename collate "C";
     ```
  3. The policy 0004 dropped on purpose (must return **0 rows**):

     ```sql
     select schemaname, tablename, policyname from pg_policies
     where policyname = 'Members can send connection requests';
     ```

  **What to compare:** query 1 returns 35 rows. Compare them, row by row and column by column, with the 35 lines of
  `supabase/tests/policies-0005.expected.tsv` (tab-separated: schemaname, tablename, policyname, cmd, roles, permissive,
  qual, with_check; a literal `\n` in the file is a line break in the cell). Query 2 must match the per-table line counts
  and total (35); query 3 must return 0 rows. **On any difference (a changed, missing or extra policy, a different count,
  or a row from query 3): stop, do not apply 0006, and report it.** Live has drifted from the migrations and must be
  understood first. The harness pins that TSV to migrations 0001-0005 (`supabase/tests/run.sh` fails if they diverge), and
  pins the post-0006 state to `supabase/tests/policies-0006.expected.tsv`.
- **Expected result:** the 17 `auth_rls_initplan` warnings and the 4 `unindexed_foreign_keys` infos disappear from the
  performance advisor. Nothing else changes.
- The harness proves no drift (`supabase/tests/run.sh`, database `brivia_test_drift`): the snapshot before and after 0006
  is equal, no public policy keeps a bare `auth.uid()`, and the request-insert policy stays absent.

## 0008: the tester switch (Phase D)

Apply **only `0008_tester_world.sql`**, as `postgres` in the SQL editor, **after 0006 is applied and verified live**. It
does not depend on 0007 (either order works). Every RPC keeps its signature and columns; deploy the client in the same
window anyway, because the feed now renders the seed's preset post illustrations (section 4 below; an older client shows
"Image unavailable" for them, nothing breaks).
The file is idempotent and is one transaction. Put `set lock_timeout = '5s';` on the first line, above the file, and
avoid the cron window **20:17–20:37 UTC (01:47–02:07 IST)**.

What it does: a real account listed in the owner-only table `public.brivia_tester` joins the test world (the seeded
test members) **without becoming `is_test`**, so the purge never deletes it. `public.brivia_in_test_world(member)` is
`is_test` or a `brivia_tester` row, and every function that compared two members' `is_test` (`brivia_same_world`,
`brivia_visible_to`, `get_candidates`, `search_members`, `list_members`, `deck_candidates`, `deck_status`,
`my_outgoing_requests`, `report_member`, `brivia_private.brivia_can_message`, and the world key of
`refresh_cell_density`) now compares that instead. Requests, matches and messages between a tester and a member of the
other world are hidden from both sides while that holds (`brivia_pair_world_ok`: the match and message select
policies, `brivia_incoming_request_visible`, `respond_connection_request`, and `send_signal`'s `matched` answer). Nothing changes for anyone who is not a tester. A tester sees only
test members and is seen only by them; no real member sees a tester's account while it is a tester.

Section 5 (Phase D, Task 3): `public.deck_why(p_target uuid)` (security definer, `stable`, executable by `authenticated`
only) answers "Why this person?" for the deck: one row (`shared_interests`, `distance_band`, `rank_keys`) only when the
caller is in the test world and the deck's pool admits the target; anyone else gets no row, never an error. It is a new
intended RPC, so the security advisor lists it with the other definer RPCs `authenticated` may execute (expected, like
`deck_candidates`). The client asks it once per page for a real member and caches the negative; a client deployed before
0008 gets a 404 once and shows no button.

Section 4 (Phase D, Task 2): the 0003 post-image CHECK `community_posts_image_storage` is replaced by the trigger
`brivia_zz_posts_image_rule` (function `brivia_posts_image_rule`). The rule is the same for everyone (the author's own
`community-posts` Storage file, 23514 otherwise), with one addition: an author whose profile `is_test` may store a
preset illustration path (`/Images/Cover%20images/<file>`, empty `image_path`), which is how the seed's 30 posts show
an image without an upload. A real member or a tester posting a preset is still refused.

### Post-apply checks (read-only)

```sql
select count(*) from public.brivia_tester;                                                   -- 0
select relrowsecurity from pg_class where oid = 'public.brivia_tester'::regclass;            -- t
select has_table_privilege('authenticated', 'public.brivia_tester', 'select'),
       has_table_privilege('anon', 'public.brivia_tester', 'select'),
       has_function_privilege('authenticated', 'public.brivia_in_test_world(uuid)', 'execute'),
       has_function_privilege('anon', 'public.brivia_in_test_world(uuid)', 'execute'),
       has_function_privilege('authenticated', 'public.brivia_pair_world_ok(uuid, uuid)', 'execute');  -- f, f, f, f, f
select has_function_privilege('authenticated', 'public.deck_why(uuid)', 'execute'),
       has_function_privilege('anon', 'public.deck_why(uuid)', 'execute');                   -- t, f
-- No function compares is_test between two members any more. Expect exactly 5 rows:
-- brivia_cell_ok, brivia_guard_is_test, brivia_in_test_world, brivia_posts_image_rule, refresh_cell_density.
-- (brivia_posts_image_rule reads only the post author's own flag.) The post CHECK is gone and the trigger is there:
select count(*) from pg_constraint where conname = 'community_posts_image_storage';            -- 0
select count(*) from pg_trigger where tgname = 'brivia_zz_posts_image_rule';                   -- 1
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'brivia_private') and p.prosrc ~ 'is_test' order by 1;
```

If a row other than those five appears, or a privilege query answers other than its comment, stop and report it. In the security advisor,
`brivia_in_test_world` and `public.brivia_pair_world_ok` must not appear as executable by `authenticated` or `anon`
(they are revoked; they run only inside the definer functions above). The new policy wrapper
`brivia_private.brivia_pair_world_ok` is in the non-exposed schema, like the other wrappers (the same intended case).

### Become a tester (the founder's account)

One line in the SQL editor (put the account's sign-in email in place of `<founder email>`):

```sql
insert into public.brivia_tester(member_id) select id from auth.users where email = '<founder email>' on conflict do nothing;
```

Run it after seed v2 is loaded (the order is 0008, seed v2, this insert, then
`select public.refresh_cell_density();`). It takes effect at once for the deck, search, requests, chat and the deck's
"Why this person?" button. The k-anonymity density (distance bands) follows at
the nightly `refresh_cell_density()` run (01:47 IST), and **not at once**: a card shows `~3 km` or `~10 km` only when
the target's g7 cell is `ok10` (7 consecutive nightly runs with at least 10 counted members in that cell), and counted
members must be more than 14 days old. The seed's members are spread over under 2 km per city, so the cards show the
place name (Thane, Mumbai, ...) instead of a distance for a long time, which is safe and expected, not a fault. A
manual `select public.refresh_cell_density();` does nothing if that night's run has already happened (it keeps one
count per day) and never skips the 7-night streak or the 14-day age rule.

The account's real-world requests, matches and messages are kept but hidden from both sides while it is a tester:
neither side sees them or can accept, decline or message, and they reappear unchanged when it stops being a tester.
While you are a tester, a real member's report against you is still recorded and still blocks you, but it does not
count toward the review thresholds (only reports from your current world qualify).

### Stop being a tester

```sql
delete from public.brivia_tester where member_id = (select id from auth.users where email = '<founder email>');
```

The account is back in the real world at once: the deck and search show real members only, and its real-world
requests, matches and messages are visible again, unchanged. Its **test-world rows are not hidden** after it stops:
until the purge runs, the account can still read its old matches and messages with test members and see pending
requests from test members (notes included), and accepting one still creates a match. It cannot message test members.
If that matters, keep the tester row until you purge, or run the purge
(`supabase/seed/purge-test-members.sql`), which deletes the test members and everything tied to them and also empties
`brivia_tester`, so after a purge nobody is a tester. The tester's own account is never deleted.

Incident response (suspected data breach, pausing the purge cron, notices): see `docs/BREACH_RUNBOOK.md`.

## 0009: the notice version with a 14-day grace window (Phase E). **Live since 2026-10-14, frozen**

Applied on the live project on 2026-10-14 from branch `claude/jolly-edison-49xvza`; the file here is a verbatim copy
(D-070). Never edit or re-run it; `0011` supersedes its two notice functions.

What it did: `brivia_notice_version()` became `2026-10-20`. New `public.brivia_notice_accepted(p_version, p_at default
now())` is true for the current version, and for `2026-10-05` only until `2026-10-20 + 14 days` (2026-11-03 00:00 UTC).
`declare_adult` refuses (`22023 stale notice version`) only when `not brivia_notice_accepted(...)`. The consent row
stores what the client declared; server-written rows (`sensitive_give`, `sensitive_withdraw`, `account_deleted`) store
the current version. The guided signup that needed `2026-10-20` was removed (D-069), so the window would lock out the
live client: see `0011`.

## 0010: the open test world switch (D-059). **Live since 2026-10-14, frozen; the switch is ON**

Applied on the live project on 2026-10-14 from branch `claude/jolly-edison-49xvza`; the file here is a verbatim copy
(D-070). It adds one owner-only switch, `public.brivia_world_switch.open_test_world`, the internal helpers
`brivia_test_world_open()` and `brivia_tester_world(uuid)`, redefines `brivia_in_test_world(uuid)`, and limits
`deck_why`'s caller to testers and test members. While the switch is on, every member is in the test world, so real
members' decks, search and candidates also show the seeded test members (and testers), and test members see real
members. Matching stays mutual-consent, location stays coarse. **It was on when checked read-only on 2026-10-20.**

Read-only check: `select open_test_world, changed_at from public.brivia_world_switch;`

While the switch is open, density cells are keyed by `brivia_in_test_world`, so **seeded test members count toward a
real member's 10-member floor**, and the real-world cells' streaks reset: after closing, real members have no ~3 km /
~10 km band for at least 7 nights. **Close it within 6 nights of opening**, so no band is ever earned on test members
(if it has been open since 2026-10-14, the 6 nights are already up: close it now). `refresh_cell_density()` is a
no-op if that night's run already happened; the bands follow the nightly runs. (The `0010` header's backlog item
"0011 keys density on `brivia_tester_world`" now needs a later number: `0011` is the notice fix.)

Close it (real members see only real members again):

```sql
update public.brivia_world_switch set open_test_world = false, changed_at = now();
select public.refresh_cell_density();
```

After closing, a real member's existing requests, matches and messages with test members stay readable until the
purge (`supabase/seed/purge-test-members.sql`) deletes the test members. **Close within 6 nights, and run the purge
before real launch.**

## 0011: the 2026-10-05 notice is current again (D-070). **Apply before 2026-11-03**

Why: the live client (`site/scripts/notice-version.js`) sends `2026-10-05` and `site/privacy.html` is version
2026-10-05, but live `0009` accepts `2026-10-05` only until 2026-11-03 00:00 UTC. From then on every `declare_adult`
fails and no new member can finish signup. `0011` makes `brivia_notice_version()` return `2026-10-05` again and
`brivia_notice_accepted` true for `2026-10-05` and `2026-10-20` at any date (members who declared `2026-10-20` during
14–20 Oct stay valid), false otherwise. Same signatures, volatility and grants as `0009`; `declare_adult` is not
touched (it already calls `brivia_notice_accepted`). No client deploy is needed: the client already sends `2026-10-05`.

Pre-flight (read-only):

```sql
select public.brivia_notice_version();                                         -- 2026-10-20 (0009 is current)
select pg_get_functiondef('public.declare_adult(text)'::regprocedure) ~ 'brivia_notice_accepted';  -- t
```

Apply, as `postgres` in the SQL editor (small and idempotent; avoid the cron window 20:17–20:37 UTC):

```sql
set lock_timeout = '5s';
-- paste and run 0011_notice_version_2026_10_05.sql
```

Post-apply check (read-only):

```sql
select public.brivia_notice_version(), public.brivia_notice_accepted('2026-10-05', '2026-11-10');
-- 2026-10-05 | t
select public.brivia_notice_accepted('2026-10-20', '2026-11-10'),             -- t
       public.brivia_notice_accepted('1999-01-01');                            -- f
select has_function_privilege('authenticated', 'public.brivia_notice_accepted(text, timestamptz)', 'execute'),
       has_function_privilege('anon', 'public.brivia_notice_accepted(text, timestamptz)', 'execute');  -- t, f
```

Then sign up one test account on the live site and confirm the 18+ step succeeds. Local proof:
`supabase/tests/p0f-notice-restore.test.sql` (it simulates a date after 2026-11-03).

## 0012: the polish wave (APPLIED 2026-10-22, sections C and D; frozen)

Applied by the founder in the SQL editor on 2026-10-22 and verified read-only the same day: both reaction tables with
three policies each, the `resumes` bucket (`false | 5242880 | {application/pdf}`), `profiles.resume_path` and both
checks, the four resume policies, the two typing policies on `realtime.messages`, `delete_my_account` covering
`resumes`, and the attachments policy carrying `message_type <> 'resume'`. Never edit or re-run it.

### A5: blocked sends are withheld

Not in this file: see the section "0013" below (moved there so 0012 could go live first).

### C: post likes and saves

Creates `public.community_post_likes` and `public.community_post_saves` (post_id, member_id default `auth.uid()`,
created_at; primary key (post_id, member_id); both foreign keys `on delete cascade`). RLS is on; `authenticated` gets
select, insert and delete only (no update); `anon` gets nothing. Policies: select own, insert own (completed profile
and the post must be visible under the posts select policy), delete own. A second like or save is a `unique_violation`
(23505), which the client treats as done. There are no counts and no RPC: a like or save is private to its owner.
Idempotent (`if not exists`, `drop policy if exists`). Tested by `supabase/tests/c-post-reactions.test.sql` (P0-P6).
No pre-flight needed; it adds two tables and touches nothing existing.

### D: resumes, resume messages, typing, deletion

**Resumes (D1).** Creates (or resets) the Storage bucket `resumes`: `public = false`, `file_size_limit = 5242880`
(5 MB), `allowed_mime_types = {application/pdf}`; Storage itself refuses anything larger or not a PDF. One file per
member, always at `resumes/<uid>/resume.pdf`. Policies on `storage.objects` for `authenticated`:

- insert, update (replace) and delete: only `bucket_id = 'resumes'` and `name = <own uid>/resume.pdf`;
- select "Members can read their resume or one shared with them": the owner's own path, or a `brivia_messages` row of
  type `resume` that points at this file, is addressed to the reader, and whose sender the reader can still message
  (`brivia_private.brivia_can_message`: matched, not blocked either way, same world). The client opens a shared
  resume with a 60 s signed URL, which Storage authorises through this select policy, so an unmatch or a block ends
  access through every old resume message at once. There is no public URL.

Adds `profiles.resume_path text` (null, or exactly `<id>/resume.pdf`: constraint `profiles_resume_path_own`) with
`grant update (resume_path)` to `authenticated`. Only the owner reads it (profiles select is own-row only;
`public_profiles` and the member RPCs do not return it). Adds `brivia_messages_resume_path`: a `resume` message must
carry its sender's own `<sender_id>/resume.pdf` path (a null path is refused too). Redefines the 0003 select policy
"Participants can view message attachments" verbatim plus `m.message_type <> 'resume'`, so a resume message never
opens a same-named file in `message-attachments`. Redefines `delete_my_account(p_confirm)` with the 0005 body,
adding `resumes` to the member-folder buckets: a stored resume raises `storage_not_empty` until the client removes it
through the Storage API (same signature, grants and errors). The test-member purge (`seed/purge-test-members.sql`)
already removes every object under a purged member's folder in any bucket, resumes included.

Pre-flight (must return 0 before applying, else adding the message constraint fails):

```sql
select count(*) from public.brivia_messages
 where message_type = 'resume' and (attachment_path is null or attachment_path <> sender_id::text || '/resume.pdf');
```

Verify after applying: `select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'resumes';`
shows `false | 5242880 | {application/pdf}`, and Storage → Policies lists the four resume policies. Idempotent
(`on conflict do update`, `drop ... if exists`, `add column if not exists`). Tested by
`supabase/tests/d-resume.test.sql` (R1-R8).

**Typing indicator (D2).** Guarded by `to_regclass('realtime.messages') is not null`, so it is a no-op where Realtime
Authorization is not present. The chat sends "typing" as a broadcast on a private channel named
`typing:<lower member id>:<higher member id>` (lower case, text order). Adds
`brivia_private.brivia_typing_topic_ok(p_topic text)` (stable, security definer, execute for `authenticated` only):
true only when the caller is one of the two ids, the topic matches that format exactly, the pair is matched in the same
world (the `brivia_can_message` checks) and the CALLER has not blocked the other (one direction only: the blocked
member is never told, their sends reach no one and they receive nothing, identical to "not typing"). Two policies on
`realtime.messages`, for `authenticated` only, `extension = 'broadcast'` and the helper on `realtime.topic()`:
"Matched members can receive typing" (select) and "Matched members can send typing" (insert). A block ends typing for the
blocker, an unmatch for both, on the next channel join (Realtime caches authorization per connection until rejoin or
JWT refresh); the client (D5) also drops typing for a blocked pair immediately. anon and every non-pair member get nothing.

No setting change is needed: the founder keeps Realtime "private channels" working (the client joins with
`private: true`). Verify after applying:

```sql
select policyname, cmd, roles from pg_policies where schemaname = 'realtime' and tablename = 'messages' order by 1;
```

includes "Matched members can receive typing" (SELECT) and "Matched members can send typing" (INSERT), both for
`{authenticated}`. Any other broad permissive `realtime.messages` policy already on the project would also open typing
topics, so check that none exists. Idempotent (`create or replace`, `drop policy if exists`). Tested by
`supabase/tests/d-typing.test.sql` (T1-T5).

## 0013: a blocked sender's messages are stored and withheld, never refused (polish wave A5). **Not yet applied**

Why: before `0013`, a message to a match who has blocked you was refused by the insert policy (an RLS error, 42501),
and the client showed "This conversation is blocked": the block was revealed to the blocked member. From `0013` a
send between a blocked pair (either direction) succeeds exactly as before, the sender's own thread shows it, and the
recipient never receives it: no row, no Realtime event, no notification or unread count, no attachment, no resume.
Withheld is permanent (unblocking does not release it); moderation evidence (`report_member`) still includes withheld
rows. No client deploy is needed: the client already treats a 201 as sent.

What it does:

- creates `brivia_private.withheld_message (message_id uuid primary key references public.brivia_messages(id) on delete
  cascade, created_at timestamptz)`, RLS on with no policy, every privilege revoked from `public`, `anon`,
  `authenticated` (server only, in the non-exposed schema);
- adds `brivia_private.brivia_can_send(p_recipient)`: the 0008 `brivia_can_message` body without the block clause
  (matched and same world), and `brivia_private.brivia_message_visible(p_id, p_sender, p_recipient)`: true for the
  sender, and for the recipient unless the message is withheld. Both stable, security definer, `search_path = public`,
  execute for `authenticated` only;
- adds the trigger `brivia_messages_withhold_blocked` (after insert, for each row) running
  `public.brivia_withhold_blocked_message()` (security definer, execute revoked from `public`, `anon`,
  `authenticated`): a withheld mark when `public.brivia_pair_is_blocked(sender, recipient)`, in the same transaction;
- redefines, each from its latest live definition plus one clause: the `brivia_messages` select policy "Completed
  members can view their messages" (0008, plus `brivia_message_visible`), the insert policy "Completed members can send
  messages" (0006, with `brivia_can_send` in place of `brivia_can_message`; still exactly one insert policy), and on
  `storage.objects` "Participants can view message attachments" and "Members can read their resume or one shared with
  them" (both 0012 section D, plus `brivia_message_visible` inside the `exists`).

Realtime: the chat listens with `postgres_changes` (INSERT on `public.brivia_messages`, published in
`supabase_realtime` since 0001). Realtime checks the subscriber's select policy on each new row after commit, when the
withheld mark already exists, so the recipient gets no event. The unread count and the notification list are built
from the same select (`site/scripts/app.js`), so they never count a withheld row.

Pre-flight (read-only; every line must answer as shown):

```sql
-- 0012 is live: the attachments policy carries the resume exclusion and the resume read policy exists
select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
   and ((policyname = 'Participants can view message attachments' and qual ~ 'resume')
     or policyname = 'Members can read their resume or one shared with them');                       -- 2
-- brivia_messages has exactly the two policies 0013 redefines (select with the world rule, insert with can_message)
select policyname, cmd, coalesce(qual, with_check) ~ '(brivia_pair_world_ok|brivia_can_message)'
  from pg_policies where schemaname = 'public' and tablename = 'brivia_messages' order by 1;
-- Completed members can send messages | INSERT | t
-- Completed members can view their messages | SELECT | t
-- the helpers 0013 relies on exist with these signatures
select to_regprocedure('public.brivia_pair_is_blocked(uuid,uuid)') is not null,
       to_regprocedure('public.brivia_in_test_world(uuid)') is not null,
       to_regprocedure('brivia_private.brivia_pair_world_ok(uuid,uuid)') is not null,
       to_regprocedure('brivia_private.brivia_can_message(uuid)') is not null;                     -- t, t, t, t
select to_regclass('brivia_private.withheld_message');                                             -- null (first apply)
```

Apply, as `postgres` in the SQL editor (small and idempotent; avoid the cron window 20:17–20:37 UTC). The file's first
line is `set lock_timeout = '5s';`: replacing the policies briefly locks `brivia_messages` and `storage.objects`, so a
busy moment fails fast instead of queueing chat traffic behind it. On a lock timeout, run the whole file again.

```sql
set lock_timeout = '5s';
-- paste and run 0013_blocked_sends_withheld.sql
```

Post-apply checks (read-only):

```sql
select count(*) from brivia_private.withheld_message;                                              -- runs; 0 at first
select policyname, cmd, coalesce(qual, with_check) ~ '(brivia_message_visible|brivia_can_send)'
  from pg_policies where schemaname = 'public' and tablename = 'brivia_messages' order by 1;
-- Completed members can send messages | INSERT | t
-- Completed members can view their messages | SELECT | t
select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
   and qual ~ 'brivia_message_visible' order by 1;
-- Members can read their resume or one shared with them
-- Participants can view message attachments
select tgname, tgenabled, (tgtype & 1) = 1 as per_row, (tgtype & 2) = 0 as after, (tgtype & 4) = 4 as on_insert
  from pg_trigger where tgrelid = 'public.brivia_messages'::regclass and not tgisinternal order by 1;
-- includes brivia_messages_withhold_blocked | O | t | t | t
select has_table_privilege('authenticated', 'brivia_private.withheld_message', 'select'),
       has_function_privilege('authenticated', 'public.brivia_withhold_blocked_message()', 'execute'),
       has_function_privilege('anon', 'brivia_private.brivia_can_send(uuid)', 'execute');              -- f, f, f
```

Expected advisor notes (intended, not failures): `brivia_private.brivia_can_send` and
`brivia_private.brivia_message_visible` are security definer policy helpers executable by `authenticated`, the same
intended case as `brivia_can_message` (not in an exposed schema). `brivia_private.withheld_message` may show "RLS
enabled, no policy" (INFO): intended, the table is server only. `public.brivia_withhold_blocked_message` is a trigger
function with execute revoked from `anon` and `authenticated`; if a lint lists it as callable, that is a finding.
Tested by `supabase/tests/a5-blocked-send.test.sql` (S1-S8) and `orbit-hygiene.test.sql` H3; e2e
`tests/e2e/fit.spec.mjs` section "blocked send".

## 0014

**Covers from the provided set only (founder request 2026-10-22, D-080). Not yet applied.**

Why: the founder does not want members to use their own cover pictures; they may switch between the covers Brivia
provides, not upload one. From `0014` a profile's `cover_url` is null or exactly `/Images/Cover%20images/<file>` for one
of the 18 provided covers, and nobody can upload into the `profile-covers` bucket any more.

What it does:

- adds `brivia_private.brivia_offered_cover_keys()` (the 18 file names; mirrors `PRESET_COVER_KEYS` in
  `site/scripts/preset-cover.js`, pinned equal by `tests/unit/preset-cover.test.mjs`),
  `brivia_private.brivia_is_offered_cover(text)` and `brivia_private.brivia_offered_cover_for(text)` (the SQL twin of
  `resolveCoverKey` in `cover-name.js`: maps old Vite-hashed `/assets/<stem>-<hash>.<ext>` values to their preset).
  All immutable, `search_path = public`, execute revoked from `public`, `anon`, `authenticated`;
- one-time cleanup of **real members only** (`is_test = false`; seeded test members are untouched), through
  `brivia_private.brivia_cleanup_custom_covers()`: a legacy `/assets/...` value the client knows becomes its preset path;
  an uploaded cover (`.../storage/v1/object/public/profile-covers/<uid>/...`) or any unknown value becomes null (the
  member sees the default cover). Running it again changes nothing. **SQL never deletes Storage objects** (see below);
- adds the trigger `brivia_profiles_cover_offered` (before insert or update of `cover_url`, for each row) running
  `brivia_private.brivia_guard_cover_url()` (security definer): null, `''` and an offered path pass; an update that
  leaves the value unchanged passes; anything else fails with `23514` "cover_url is not an offered cover". A trigger,
  not a CHECK, so rows nobody writes are never re-validated. (The message names `cover_url` on purpose: an old cached
  client retries its save without the cover when the error mentions it, so a stale tab still saves the profile.) The
  0003 CHECK `profiles_cover_url_storage` and `public.brivia_is_preset_cover` are unchanged (community posts use it);
- drops the `storage.objects` policies "Members can upload their profile cover" (insert) and "Members can update their
  profile cover" (update), both from 0001. "Members can view their own profile covers" (select, 0001) and "Members can
  delete their profile covers" (delete, 0005) stay, so old files can still be removed and `delete_my_account`'s
  `storage_not_empty` check (0005, 0012) keeps working.

Deploy order: **deploy the client first** (it stores only offered paths and has no cover upload), check that Profile →
EDIT PROFILE shows the cover picker and no "COVER PHOTO" file field, **then** apply `0014`. Applied before the client,
the old signup would store a build path (`/assets/...webp`) that the trigger refuses (the save then drops the cover).

Pre-flight (read-only; run before applying, every line must answer as shown):

```sql
-- the four profile-covers policies 0014 builds on (0001 + 0005)
select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects'
   and coalesce(qual, '') || coalesce(with_check, '') ~ 'profile-covers' order by 1;
-- Members can delete their profile covers | DELETE
-- Members can update their profile cover | UPDATE
-- Members can upload their profile cover | INSERT
-- Members can view their own profile covers | SELECT
select conname from pg_constraint where conrelid = 'public.profiles'::regclass and conname like 'profiles_cover_url%' order by 1;
-- profiles_cover_url_length
-- profiles_cover_url_storage
select to_regnamespace('brivia_private') is not null, to_regprocedure('public.brivia_is_preset_cover(text)') is not null,
       exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'brivia_profiles_cover_offered');
-- t, t, f (first apply)
-- what the cleanup will change: expected 3 rows on 2026-10-22 (1 uploaded, 2 legacy /assets/ paths). Note them.
select id, left(cover_url, 90) as cover from public.profiles
 where not is_test and cover_url is not null and cover_url !~ '^/Images/Cover%20images/' order by id;
-- the uploaded file(s) to remove by hand after the apply: note bucket path(s)
select name, created_at from storage.objects where bucket_id = 'profile-covers' order by created_at;
```

Apply, as `postgres` in the SQL editor (small and idempotent; avoid the cron window 20:17–20:37 UTC). The first line is
`set lock_timeout = '5s';`: creating the trigger and dropping the policies briefly lock `profiles` and
`storage.objects`; on a lock timeout, run the whole file again.

```sql
set lock_timeout = '5s';
-- paste and run 0014_preset_covers_only.sql
-- the cleanup prints covers_cleaned: 3 on the first run (0 on any later run)
```

Note: the SQL editor shows only the result of the **last** statement in the file (here the policy drops, "Success. No
rows returned"), so the `covers_cleaned` line is usually not visible. Do not re-run the file to see it: the
post-apply queries below are the verification.

Post-apply checks (read-only):

```sql
-- no real member keeps a cover outside the offered set
select count(*) from public.profiles
 where not is_test and cover_url is not null and not brivia_private.brivia_is_offered_cover(cover_url);  -- 0
-- the rows the pre-flight listed: the two legacy ones now read /Images/Cover%20images/<file> (or null), the upload null
select id, cover_url from public.profiles where id in ('<id 1>', '<id 2>', '<id 3>') order by id;
select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects'
   and coalesce(qual, '') || coalesce(with_check, '') ~ 'profile-covers' order by 1;
-- Members can delete their profile covers | DELETE
-- Members can view their own profile covers | SELECT
select tgname, tgenabled from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'brivia_profiles_cover_offered';
-- brivia_profiles_cover_offered | O
select has_function_privilege('authenticated', 'brivia_private.brivia_cleanup_custom_covers()', 'execute'),
       has_function_privilege('anon', 'brivia_private.brivia_guard_cover_url()', 'execute');           -- f, f
```

Then, by hand: **Storage → `profile-covers` → delete the old uploaded file** the pre-flight listed (`<uid>/<file>`). The
bucket stays public for reads until its files are gone, so the old picture is reachable by its URL until you remove it.
Keep the empty bucket (its select and delete policies stay for account deletion).

Expected advisor notes: `brivia_private.brivia_guard_cover_url` and `brivia_private.brivia_cleanup_custom_covers` are
security definer functions with execute revoked from every client role (not RPCs; `brivia_private` is not exposed).
Tested by `supabase/tests/media-covers.test.sql` (V1-V5), `trust.test.sql` FF2 and `d-tester-world.test.sql` (the
cleanup reads `is_test` of the row itself only); e2e `tests/e2e/profile-media.spec.mjs` section "covers".

## 0015

**Test members may show a photo shipped with the site (test world v3, D-100). Not yet applied.**

Why: the v3 test members (`supabase/seed/test-members-v3.sql`) have faceless stock photos that ship with the site under
`/media/test-members/tNNN.webp`. The 0003 CHECK `profiles_photo_url_storage` allows only a Storage URL of the member's
own `profile-photos` folder, so it refused them.

What it does: adds `public.brivia_is_test_member_photo(text)` (immutable; true only for exactly
`/media/test-members/t<3 digits>.webp`) and re-creates `profiles_photo_url_storage` as: null, OR the 0003 Storage rule,
OR (`is_test` AND that path). Only the table owner can set `is_test` (0003), so real members are unchanged. Re-adding
the CHECK validates every row once; real rows already pass the 0003 rule.

Apply: after `0014`, before the v3 seed. Paste the file into the SQL editor, Run (as `postgres`). Idempotent.
Verify: `select pg_get_constraintdef(oid) from pg_constraint where conname = 'profiles_photo_url_storage';` shows the
three branches. Before launch: the purge removes the test members; delete `site/media/test-members/` in the same release.
