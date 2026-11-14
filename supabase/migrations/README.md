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

**Likes, threaded comments and shares that members see (founder request 2026-10-28, D-101). Not yet applied.**

What it does: adds `community_post_comments` (a reply names its parent comment on the same post; readable by anyone who
can see the post and the comment's author; insert own, completed, on a visible post; delete by the comment's author or
the post's author, replies go with it; no update), `community_post_shares` (own rows, one per member and post) and the
RPC `post_activity(uuid[])` (security definer, `search_path = public`, `authenticated` only): per post the caller can see,
the like, comment and share counts (only members the caller can see are counted), `liked_by_me`, and up to three of the
caller's connections who liked it. Likes and saves (0012) are unchanged: rows stay private to their owner.

Deploy order: either order works. The client hides counts and comments until `post_activity` exists (and the comment
box until the table exists), and an old client ignores the new objects. Apply `0015`, then deploy the client.

Pre-flight (read-only):

```sql
select to_regclass('public.community_post_likes') is not null, to_regnamespace('brivia_private') is not null,
       to_regprocedure('public.brivia_can_see_author(uuid)') is not null;  -- t, t, t
```

Verify after the apply:

```sql
select to_regclass('public.community_post_comments') is not null, to_regclass('public.community_post_shares') is not null,
       has_function_privilege('authenticated', 'public.post_activity(uuid[])', 'execute'),
       has_function_privilege('anon', 'public.post_activity(uuid[])', 'execute');  -- t, t, t, f
```

Expected advisor addition: `post_activity` joins the intended "security definer function executable by authenticated"
list (`supabase/tests/orbit-hygiene.test.sql` H3).

## 0016

**A short bio on the profile (founder request 2026-10-28, D-104). Not yet applied.**

What it does: adds `profiles.bio` (text, at most 300 characters, `profiles_bio_length`), grants `update (bio)` to
`authenticated`, and adds `member_bio(uuid)` (security definer, `search_path = public`, `authenticated` only): the bio
of a member the caller can see (`brivia_visible_to`), or the caller's own; null otherwise. Cards are unchanged.

Deploy order: either. The client shows the Bio field and the About card only once the own row carries `bio`.
Apply after `0015`.

Verify after the apply:

```sql
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'bio'),
       has_column_privilege('authenticated', 'public.profiles', 'bio', 'update'),
       has_function_privilege('authenticated', 'public.member_bio(uuid)', 'execute'),
       has_function_privilege('anon', 'public.member_bio(uuid)', 'execute');  -- t, t, t, f
```

Expected advisor addition: `member_bio` joins the intended definer-RPC list (`orbit-hygiene.test.sql` H3).

## 0017

**The founder's A–Z interest catalogue and "Other" (founder request 2026-10-29, D-109). Not yet applied.**

What it does: adds `interest_node.catalog_order` (the offered catalogue, 1..1129 A–Z); reuses 139 existing 0004 nodes
(their id and label are unchanged, they only gain `catalog_order`) and adds 990 level-3 nodes under the closest
existing category (source: `supabase/catalog/interest-catalog.tsv`; the data block is written by
`node scripts/build-interest-catalog.mjs`). Adds the `member` / `member.custom` branch, `member_custom_interest` (RLS on,
no grants) and `add_member_interest(text)` (security definer, `search_path = public`, `authenticated` only): returns an
active public node with that label, or creates `member.custom.<slug>`; refuses bad labels (22023) and a sixth new label
in 24 h (PT429). Nothing sensitive is added; "Gospel Music" is left out of the open list (a religion proxy, D-038).

Deploy order: either. Before 0017 the pickers keep their category groups and no "own interest" row; after it they show
the A–Z catalogue. Apply after `0016`. The file is long (the catalogue rows); paste all of it in one run.

Verify after the apply:

```sql
select count(*) filter (where catalog_order is not null),                        -- 1129
       count(*) filter (where catalog_order is not null and (sensitive or level < 3)),  -- 0
       has_function_privilege('authenticated', 'public.add_member_interest(text)', 'execute'),  -- t
       has_function_privilege('anon', 'public.add_member_interest(text)', 'execute')            -- f
  from public.interest_node;
```

Expected advisor addition: `add_member_interest` joins the intended definer-RPC list (`orbit-hygiene.test.sql` H3).

## 0018

**Active status for connections in chat (founder request 2026-10-29, D-110). Not yet applied.**

What it does: adds `member_presence(member_id, last_seen_at, visible)` (RLS on, no grants, deleted with the profile)
and four `authenticated`-only definer functions (`search_path = public`): `touch_presence()` (own row, at most every
30 s), `connection_presence(uuid[])` (for each id that is the caller's match in the same world: active = both switches
on, not blocked, seen within 3 minutes; never a time; at most 100 ids), `set_presence_visible(boolean)` and
`my_presence_visible()` (the "Show when I'm active" switch, default on, hides both ways).

Deploy order: either. Before 0018 the client shows no dots and hides the switch. Apply after `0017`.

Verify after the apply:

```sql
select has_table_privilege('authenticated', 'public.member_presence', 'select'),                -- f
       has_function_privilege('authenticated', 'public.connection_presence(uuid[])', 'execute'), -- t
       has_function_privilege('anon', 'public.touch_presence()', 'execute'),                     -- f
       pg_get_function_result('public.connection_presence(uuid[])'::regprocedure);              -- TABLE(member_id uuid, active boolean)
```

Expected advisor additions: `connection_presence`, `my_presence_visible`, `set_presence_visible` and `touch_presence`
join the intended definer-RPC list (`orbit-hygiene.test.sql` H3).

## 0019

**The cover set changes: "THE THOUGHTFUL ROOM" is retired and 9 covers are added (founder request 2026-11-01, D-116).
APPLIED 2026-11-03** (Supabase MCP, immediately before 0027; live was still on 0014's 18 covers, so the 9 newer ones were
being refused on save; 70 profiles on the retired cover went to the default). Needs `0014` applied first.

What it does: redefines `brivia_private.brivia_offered_cover_keys()` with 26 names (mirrors `PRESET_COVER_KEYS`,
pinned by `tests/unit/preset-cover.test.mjs`), and adds `brivia_private.brivia_clear_retired_covers()` (definer, no
client grants) which it runs once: every profile whose `cover_url` names `163BDB0C-64AC-44E7-8663-55C323ADB4FE` gets
null (the default cover). Running it again changes nothing.

Deploy order: **deploy the client first** (it no longer offers or ships the retired cover), then apply `0019`. Applied
before the client, a signup on the old page that keeps the old default would have its cover refused (the save then
drops the cover, as in 0014).

Verify after the apply:

```sql
select cardinality(brivia_private.brivia_offered_cover_keys()),                                   -- 26
       (select count(*) from public.profiles where cover_url like '%163BDB0C-64AC-44E7-8663-55C323ADB4FE%'); -- 0
```

## 0020

**Explore lists events near you; the old Explore feed moves to a Posts tab (founder request 2026-11-01, D-117). Not yet
applied.** Needs only what is already live (`0004` cells, places and `brivia_visible_to`); it does not depend on
`0011`-`0019`.

What it does: adds `club_event` (curated events; venue as a g7 cell), `event_rsvp` (going, wants a companion) and
`member_event_pref` (the page's "Find a companion" switch), all RLS on with no client grants, plus five RPCs for
`authenticated`: `list_events(p_category)`, `set_event_rsvp(p_event, p_going, p_wants_companion)`,
`set_companion_default(p_on)`, `my_event_prefs()` and `event_companions(p_event)`. It seeds 8 Bengaluru (Whitefield and
nearby) events dated 1 to 13 days after the day it is first applied. Running it again adds or moves nothing.

Deploy order: either order works. Before `0020` the client's Explore says "Events open soon" and points to Posts; after
it, events show at once. Expect the new definer functions in the advisor list, like the other member RPCs.

Verify after the apply:

```sql
select count(*) from public.club_event where is_published;            -- 8
select has_function_privilege('anon', 'public.list_events(text)', 'execute'),            -- false
       has_function_privilege('authenticated', 'public.list_events(text)', 'execute');   -- true
```

Adding an event later (SQL editor, as postgres): insert a `club_event` row with `venue_cell =
public.brivia_grid_cell(<lat>, <lng>, 7)` from the venue's public address, a category from the check list, and an
`image_key` the client ships (`site/scripts/event-assets.js`: jam, tech, chess, dandiya, badminton, food, vinyl, photo,
desk; blank uses the category's image).

## 0021

**Crossing paths: a quiet alert when two connections are nearby (founder request 2026-11-01, D-119). Not yet applied.**
Apply after `0020` (it needs nothing from 0016-0020, only 0001-0010).

What it does: adds `nearby_setting`, `nearby_live`, `nearby_move`, `nearby_mute` and `nearby_alert` (RLS on, no grants,
deleted with the profile), six `authenticated`-only definer RPCs (`set_nearby_enabled`, `my_nearby_setting`,
`nearby_pulse`, `nearby_clear`, `my_nearby_alerts`, `set_nearby_muted`), the internal `purge_nearby()` and, when pg_cron
is installed, the job `brivia-purge-nearby` every 30 minutes. No coordinates are stored (spec §9.1.4a).

Deploy order: either. Before 0021 the client hides the Crossing paths switch and sends nothing.

Verify after the apply:

```sql
select has_table_privilege('authenticated', 'public.nearby_live', 'select'),                                   -- f
       has_function_privilege('anon', 'public.nearby_pulse(double precision, double precision)', 'execute'),     -- f
       has_function_privilege('authenticated', 'public.nearby_pulse(double precision, double precision)', 'execute'), -- t
       (select count(*) from cron.job where jobname = 'brivia-purge-nearby');                                   -- 1
```

Expected advisor additions: the six RPCs join the intended definer-RPC list (`orbit-hygiene.test.sql` H3).

## 0022

**Members create events: Create Event on Explore (founder request 2026-11-02, D-121). Applied live 2026-11-02 (before `0021`, which is still not applied; 0022 does not depend on it).** Needs `0020`
(it extends `club_event` and `event_rsvp`); apply after `0021`.

What it does: `club_event` gains the creator, address, map link, poster and gallery URLs, capacity, entry fee (INR),
the organiser's contact (shown only when they choose), cancelled/published timestamps, the fourteen form categories
(with `custom_category` for Other);
drafts may be incomplete (a published row must be complete). `event_rsvp` gains `status` (`confirmed` |
`pending_payment`), `paid_at` and `payment_ref`. A public `event-posters` Storage bucket (10 MB, JPEG/PNG/WebP, own
folder only). It redefines `list_events`, `set_event_rsvp` and `event_companions` (new columns; capacity and paid holds;
the companion choice needs a registration) and adds `save_member_event`, `cancel_member_event`, `delete_member_event`
(authenticated) and `confirm_event_payment` (service role only, for the payment webhook, not built yet).

Deploy order: apply 0022 **before or with** the client. The client before 0022 keeps working; the client after 0022 on
a database without it says "Creating events opens soon" when saving, and the 0020 events still list.

Verify after the apply:

```sql
select has_function_privilege('authenticated', 'public.save_member_event(uuid, jsonb, boolean)', 'execute'),   -- t
       has_function_privilege('anon', 'public.save_member_event(uuid, jsonb, boolean)', 'execute'),            -- f
       has_function_privilege('authenticated', 'public.confirm_event_payment(uuid, uuid, text)', 'execute'),   -- f
       (select public from storage.buckets where id = 'event-posters');                                        -- t
select count(*) from public.club_event where is_published and creator_id is null;   -- the 8 seeded events, unchanged
```

Expected advisor additions: `save_member_event`, `cancel_member_event` and `delete_member_event` join the intended
definer-RPC list (`orbit-hygiene.test.sql` H3). Paid events: registrations stay `pending_payment` until a payment
provider is chosen and its webhook calls `confirm_event_payment` (owed, D-121).

## 0023

**Find a Companion: event-based swipe matching (founder request 2026-11-02, D-123). Applied live 2026-11-02.** Apply after
`0022` (it needs `event_rsvp.status` and the member events).

What it does: adds `event_companion_swipe` (one like or pass per member, candidate and event) and
`event_companion_match` (one per pair and event, with seen flags), both RLS on with no client grants, and five
`authenticated` definer RPCs: `companion_events()`, `companion_deck(p_event, p_limit)`, `companion_swipe(p_event,
p_target, p_like)`, `my_companion_matches()`, `mark_companion_match_seen(p_match)`. A mutual like also creates the
ordinary connection (`brivia_create_match`), so Chat opens. No location beyond the deck's band leaves.

Deploy order: either. Before 0023 the companions view says "Companions open soon".

Verify after the apply:

```sql
select has_table_privilege('authenticated', 'public.event_companion_swipe', 'select'),                    -- f
       has_function_privilege('anon', 'public.companion_swipe(uuid, uuid, boolean)', 'execute'),            -- f
       has_function_privilege('authenticated', 'public.companion_swipe(uuid, uuid, boolean)', 'execute');   -- t
```

Expected advisor additions: the five RPCs join the intended definer-RPC list (`orbit-hygiene.test.sql` H3).

## 0024

**The pitch becomes the first chat message (founder request 2026-11-02, D-124). Applied live 2026-11-02.** Apply after `0023`
(it uses `brivia_is_connection`).

What it does: a trigger after insert on `matches` delivers each direction's request note (pending or accepted) as an
ordinary message from its sender, with the request's own time, exactly once (`brivia_pitch_delivery`, RLS on, no
grants), and marks the open request accepted; a declined request never makes a match, so its note never reaches chat.
`brivia_server_created_at` is redefined to keep that time only inside the delivery. New RPC
`send_connect_request(p_to, p_note)` for `authenticated`: already connected -> the note is added to their chat
('chat'); otherwise it is `send_signal`.

Deploy order: either. Before 0024 the companions composer's Send answers "could not be sent"; the Connect deck works.
Existing matches get no back-filled messages (only new connections deliver).

Verify after the apply:

```sql
select has_function_privilege('authenticated', 'public.send_connect_request(uuid, text)', 'execute'),   -- t
       has_table_privilege('authenticated', 'public.brivia_pitch_delivery', 'select'),                   -- f
       (select count(*) from pg_trigger where tgname = 'brivia_matches_deliver_pitches');                 -- 1
```

## 0025

**Show interest and the event brochure (founder request 2026-11-02, D-125). Not yet applied.** Apply after `0023`
(it redefines the Find a Companion functions over the wider pool). Needs `0020`, `0022` and `0023`.

What it does: `event_rsvp.status` also allows `'interested'` (a paid event's half registration: no seat, not going, in
the companion pool); `brivia_companion_status` names the pool (confirmed, payment hold, interested) and
`list_events` (two more columns: `interested_count`, `brochure_url`), `set_event_rsvp`, `event_companions`,
`brivia_companion_eligible`, `companion_events` and `companion_deck` use it. New: `club_event.brochure_url`, the public
`event-brochures` bucket (application/pdf, 5 MB, own-folder policies), `set_event_interest(uuid, boolean, boolean)` and
`set_event_brochure(uuid, text)` for `authenticated`.

Deploy order: either. Before 0025, Show interest answers "opens soon" and an event saves without its brochure; the
rest works. After 0025, members with a payment hold who opted in start seeing companions (they waited before).

Verify after the apply:

```sql
select has_function_privilege('authenticated', 'public.set_event_interest(uuid, boolean, boolean)', 'execute'),   -- t
       has_function_privilege('authenticated', 'public.set_event_brochure(uuid, text)', 'execute'),               -- t
       (select file_size_limit from storage.buckets where id = 'event-brochures'),                                -- 5242880
       (select count(*) from information_schema.columns where table_name = 'club_event' and column_name = 'brochure_url'); -- 1
```

Expect the advisor's usual warnings for the two new security-definer RPCs (they check `auth.uid()` themselves).

## 0026

**Show interest on every event (founder request 2026-11-02, D-126). Not yet applied.** Apply after `0025`.

What it does: redefines `set_event_interest(uuid, boolean, boolean)` without the paid-only check, so free events take
an interest too (no seat; Register upgrades it). Nothing else changes. Before 0026 a free event's Show interest answers
"This event is no longer open." (the 'free event' error).

Verify after the apply (as a member, on a free event): `select * from public.set_event_interest('<event id>', true);`
returns `interested = t, status = interested`.

## 0027

**The covers are reordered and renamed, and "OPEN MINDS" is retired (founder request 2026-11-02, D-128). APPLIED
2026-11-03** after the client deployed (Vercel production at 870a521) and after 0019; verified: 25 offered, first AT WORK,
OPEN MINDS refused, 0 profiles on a retired or unknown cover (7 OPEN MINDS went to the default), cleanup not
client-callable, second run 0. Apply after `0019` (it redefines the same two functions; applying 0019 after 0027 would bring OPEN MINDS
back).

What it does: redefines `brivia_private.brivia_offered_cover_keys()` with 25 names in the founder's order (mirrors
`PRESET_COVER_KEYS`, pinned by `tests/unit/preset-cover.test.mjs`), and `brivia_private.brivia_clear_retired_covers()`
with the OPEN MINDS stem `7423007B-E17D-4D46-A19F-499CC9A8DB99` added, which it runs once: those profiles get null (the
default cover). Titles live only in the client, so renames change no stored value. Running it again changes nothing.

Deploy order: **deploy the client first** (it no longer offers or ships OPEN MINDS), then apply `0027`.

Verify after the apply:

```sql
select cardinality(brivia_private.brivia_offered_cover_keys()),                                   -- 25
       (brivia_private.brivia_offered_cover_keys())[1],                                           -- AE983BB0-...PNG (AT WORK)
       (select count(*) from public.profiles where cover_url like '%7423007B-E17D-4D46-A19F-499CC9A8DB99%'); -- 0
```

## 0028

**A pitch appears once in chat (founder bug report 2026-11-03, D-129). APPLIED 2026-11-03** (Supabase MCP, as postgres;
verified: `brivia_create_match` writes no message, 0 duplicate groups, 3 twins removed, no delivered pitch lost, cleanup
not client-callable, second run 0). Apply after `0024`. No client deploy needed
first (the client never created the copy).

What it does: redefines `public.brivia_create_match(uuid, uuid)` to create the match only (live had a hand-edited
version that also copied request notes into chat, doubling 0024's delivery), and adds and runs once
`brivia_private.brivia_remove_duplicate_pitches()` (definer, no client grants): it deletes a message only when it is an
exact twin (sender, recipient, body, created_at) of a pitch recorded in `brivia_pitch_delivery` and is not itself
recorded there. Running it again removes nothing.

Verify after the apply:

```sql
select position('brivia_messages' in pg_get_functiondef('public.brivia_create_match(uuid,uuid)'::regprocedure)); -- 0
select count(*) from (select 1 from public.brivia_messages group by sender_id, recipient_id, body, created_at
                      having count(*) > 1) d;                                                                    -- 0
```

## 0029

**Nearby: discover members around you (founder request 2026-11-03, D-131). APPLIED 2026-11-03** (Supabase MCP, as
postgres; verified: all 12 function bodies equal this file, members may run the 4 RPCs, anon none, `nearby_passed` and
the pool helper unreachable, 0 discovery consents, 2 alerts-only switches kept). Apply after `0021` and
`0028`. The client can deploy first: before 0029 the Nearby page says "Nearby opens soon" and requests carry no label.

What it does: a ~1 km live cell next to 0021's (`nearby_live.near_cell`, set by the redefined `nearby_pulse`, which is
otherwise 0021's); discovery consent `nearby_setting.discoverable_at` (set by the redefined `set_nearby_enabled(true)`;
the members who turned Crossing paths on before 0029 keep their alerts but must turn it on again to discover or appear);
`nearby_passed`; `connection_requests.via` ('nearby' or null); `nearby_discover(radius 1|3|5)`, `nearby_pass`,
`nearby_connect`, `my_nearby_matches` (authenticated); `purge_nearby` also drops passes older than 7 days. No member
data is changed when it is applied.

Verify after the apply:

```sql
select has_function_privilege('authenticated', 'public.nearby_discover(int,int)', 'execute'),   -- t
       has_function_privilege('anon', 'public.nearby_discover(int,int)', 'execute'),            -- f
       has_table_privilege('authenticated', 'public.nearby_passed', 'select'),                   -- f
       (select count(*) from public.nearby_setting where discoverable_at is not null);           -- 0 (nobody consented yet)
```

## 0030

**Nearby notifications, one store across devices, web push subscriptions, 10 km (founder request 2026-11-03, D-134).**
**APPLIED 2026-11-03** (all 12 function bodies equal this file; realtime on; push_subscription and brivia_notify_nearby
unreachable for members). Edge Function `push-notify` deployed (v1, verify_jwt on); the three VAPID secrets are set
by the founder in the dashboard.
Apply after `0029`. Then deploy the Edge Function `push-notify` (`supabase/functions/push-notify/index.ts`) with the
secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (the public key is also in `site/scripts/web-push.js`;
a new key pair means updating both and every device re-enabling notifications). The client can deploy before 0030:
without it the store answers "function not found" and nothing is shown.

What it does: `member_notification` (RLS: own rows only, select; in `supabase_realtime`), `push_subscription` (no client
access), `nearby_setting.radius_km`, the RPCs `my_notifications`, `mark_notifications_read`, `dismiss_notification`,
`set_nearby_radius`, `save_push_subscription`, `delete_push_subscription`; `brivia_notify_nearby` (internal) called by
the redefined `nearby_pulse`; radius 10 in `brivia_near_band`, `nearby_discover`, `nearby_connect`; purge after 30 days.

Verify after the apply:

```sql
select (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'member_notification'), -- 1
       has_table_privilege('authenticated', 'public.push_subscription', 'select'),                                         -- f
       has_function_privilege('authenticated', 'public.brivia_notify_nearby(uuid)', 'execute');                             -- f
```

## 0031

**Interest labels in the founder's wording, catalogue ordered A–Z (founder request 2026-11-03, D-135).**
**APPLIED 2026-11-03** (AR/VR, Machine Learning, Urban Birding verified; 1129 offered, contiguous A–Z, Abstract Art first,
Zymology last, none sensitive or retired).
Apply after `0030`. Data only: relabels 65 `interest_node` rows by id (only where the label still equals 0017's) and
renumbers `catalog_order` 1..1129 by label. Safe to re-run. No client change needed.

Verify after the apply:

```sql
select (select label from public.interest_node where id = 'tech.frontier.ar_vr'),                -- AR/VR
       (select count(*) from public.interest_node where catalog_order is not null),             -- 1129
       (select max(catalog_order) from public.interest_node);                                   -- 1129
```

## 0032

**Gospel Music and NLP offered (founder request 2026-11-03, D-136).**
**APPLIED 2026-11-03** (1131 offered, contiguous A–Z; Gospel Music #366, NLP #641, neither sensitive).
Apply after `0031`. Data only: inserts two level-3 interest nodes (not sensitive), lists them, renumbers
`catalog_order` 1..1131 A–Z. Safe to re-run; a moderator's retirement sticks.

Verify after the apply:

```sql
select count(*) from public.interest_node where catalog_order is not null;                          -- 1131
select label, catalog_order from public.interest_node where id in ('music.listening.gospel_music', 'tech.ai_data.nlp_short');
```

## 0033

**A bio is at most 20 words (founder request 2026-11-03, D-137).**
**APPLIED 2026-11-03** (trigger present; the guard is not callable by members). 3 bios saved earlier are over 20
words and stay until their members edit them (Edit profile then asks them to trim).
Apply after `0032`. Adds the trigger `profiles_bio_word_guard` (function `brivia_bio_word_guard`, not callable by
members): writing a bio of more than 20 words is refused (`check_violation`, message `bio_words: ...`). Bios saved
earlier are untouched until edited. The client already enforces the limit, so client and migration can deploy in
either order.

Verify after the apply:

```sql
select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_bio_word_guard';  -- 1 row
```

## 0034

**A crossing says where; retention is one setting (founder request 2026-11-03, D-138).**
**APPLIED 2026-11-03** (retention row 20/24/24/7/30; my_notifications_v2 callable by members; nearby_retention and
brivia_live_place not). Edge Function `push-notify` redeployed (v3, verify_jwt on).
Apply after `0033`, then redeploy the Edge Function `push-notify` (it now reads `place_name`). The client can deploy
before 0034: it asks `my_notifications_v2` and falls back to `my_notifications` when it is missing.

Adds `member_notification.place_name`, `nearby_retention` (owner only), `brivia_live_place(uid)` (internal),
`my_notifications_v2()`; redefines `brivia_notify_nearby` (fills the area) and `purge_nearby` (reads the retention row).

Verify after the apply:

```sql
select * from public.nearby_retention;                                                    -- 20, 24, 24, 7, 30
select has_function_privilege('authenticated', 'public.my_notifications_v2()', 'execute'),  -- t
       has_table_privilege('authenticated', 'public.nearby_retention', 'select');            -- f
```

## 0035

**A worldwide city directory for every "Pick my city" (founder request 2026-11-03, D-140).**
**APPLIED 2026-11-03**; pg_net enabled; 16 parts imported (156,169 cities, 156,169 centroids; 80 linked to existing
places; 28 aliases).
Apply after `0034`. The client can deploy before or after: before 0035 it searches the old place list.

Then load the cities (156,169 rows in 16 parts published with the site; about a minute). In the SQL editor, as postgres:

```sql
create extension if not exists pg_net;
-- 1. Ask for the 16 parts (the site must be deployed with site/public/data/cities/).
select net.http_get('https://thebriviaclub.live/data/cities/part-' || lpad(i::text, 2, '0') || '.json', timeout_milliseconds := 60000)
  from generate_series(0, 15) i;
-- 2. About 30 seconds later: import every part that arrived (repeat 1 and 2 for any missing part; re-importing is safe).
select r.id, public.brivia_import_cities(r.content::jsonb)
  from net._http_response r where r.status_code = 200 and r.content like '[[%';
-- 3. Link to the existing places and add the other spellings.
select public.brivia_finish_city_import();     -- {"linked": ~80, "aliases": ~28, "cities": 156169}
```

Verify: `select id, name, region, country from public.search_cities('Ludhiana');` (in-ludhiana first),
`select * from public.search_cities('Springfield, Missouri');`, `select count(*) from public.geo_city;` (156169).

## 0036

**A company / organisation on every profile (founder request 2026-11-03, D-140).**
**APPLIED 2026-11-03**; Edge Function `directory` deployed (v1, verify_jwt on).
Apply after `0035`. Then deploy the Edge Function `directory` (`supabase/functions/directory/index.ts`, verify_jwt on;
it uses the platform's SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY, no extra secret). The client can
deploy before 0036: without it the company field stays empty and nothing breaks.

Verify:

```sql
select id, public from storage.buckets where id = 'company-logos';                        -- public t
select has_function_privilege('authenticated', 'public.member_work(uuid[])', 'execute'),    -- t
       has_function_privilege('authenticated', 'public.brivia_cache_companies(jsonb)', 'execute');  -- f
```
Moderation (verify, add, remove, merge): docs/MODERATION.md "Companies and logos".

## 0037

**Hiring: roles, role intent, role asks, the hiring bar and fit (founder request 2026-11-02/03, D-141).**
**NOT APPLIED YET.** Apply after `0036`. Schema + RPCs, additive only: new tables `brivia_feature` (seeded 'hiring' on),
`hiring_role`, `role_intent`, `role_ask` (RLS on, no client grants), private helpers, and the authenticated RPCs
`save_hiring_role`, `set_hiring_role_status`, `my_hiring_roles`, `save_role_intent`, `withdraw_role_intent`,
`my_role_intent`, `member_hiring`, `member_open_to`, `hiring_suggestions`, `ask_about_role`, `my_role_asks`,
`my_sent_role_asks`, `report_fake_job`; `purge_hiring()` is owner only. Safe to re-run. The client hides hiring until
these functions exist, so the deploy order does not matter; apply it, then hard-reload the app.

Expect new advisor notes only for the intended `security definer` RPCs above (the same pattern as 0024).

Verify after the apply:

```sql
select (select enabled from public.brivia_feature where name = 'hiring'),                                    -- t
       has_table_privilege('authenticated', 'public.hiring_role', 'select'),                                 -- f
       has_function_privilege('authenticated', 'public.member_hiring(uuid[])', 'execute'),                   -- t
       has_function_privilege('anon', 'public.member_hiring(uuid[])', 'execute');                            -- f
```

Kill switch (hides every banner, suggestion and ask at once; data kept): `update public.brivia_feature set enabled =
false where name = 'hiring';`

## 0038

**City search fixes found on the live directory (D-140).** **APPLIED 2026-11-03** (recorded in Supabase's history as
`0037_city_search_fixes`, before the hiring migration took the number 0037; it touches nothing hiring uses).
Apply after `0037`. `brivia_fold` removes only spaces and punctuation (it used to drop the vowel signs of Indic scripts,
so native names could not be found) and the stored keys are recomputed; a country typed alone ("Japan") lists its
largest cities first. Verify: `select name from public.search_cities('Japan', 4);` (Tokyo, Yokohama, Osaka, Nagoya),
`select name from public.search_cities('बेंगलुरु');` (Bengaluru).

## 0039

**The founder's company directory, 926 organisations (D-142).**
**APPLIED 2026-11-03** (the function; then 925 rows imported from the published list, Google was already cached
from a member's search and was marked verified).
Apply after `0038`. Generated by `node scripts/build-company-seed.mjs` from `supabase/catalog/companies.txt`. Inserts
verified 'admin' companies (skipping names already present) and redefines `brivia_cache_companies` so a Wikidata hit
fills a seeded row's website and logo instead of adding a duplicate. Safe to re-run.
The live database got the rows from the published list instead of the 45 KB file (same rows, same rule):
`select net.http_get('https://thebriviaclub.live/data/companies.json');` then
`insert into public.company (name, industry, source, verified) select r->>0, r->>1, 'admin', true from net._http_response h,
jsonb_array_elements(h.content::jsonb) r where h.content like '[["%' and not exists (select 1 from public.company c where
c.name_key = public.brivia_fold(r->>0));`

Verify: `select count(*) from public.company where source = 'admin' and verified;` (926),
`select name from public.search_companies('tcs') limit 1;` (as a member: Tata Consultancy Services (TCS)).

## 0040

**A logo for every company in the founder's directory (D-148).**
**APPLIED 2026-11-04**; `directory` v4; 925 websites set; logo pass run three times: 876 of 930 companies have a logo,
the rest show an initials tile.
Apply after `0039`, then redeploy the Edge Function `directory` (it gains the bulk logo pass, `kind: 'logos'`).
Generated by `node scripts/build-company-domains.mjs` from `supabase/catalog/company-domains.txt` (each company's
official website). Adds `company.icon_domain` (not unique), fills it for the 926 seeded companies, and the
service-role functions `brivia_companies_needing_icons` and `brivia_set_company_icon`.

Live, the websites were read from the published `data/company-domains.json` with pg_net, then the logo pass was run
in batches of 40 ids by `net.http_post` to `/functions/v1/directory` with `{"kind":"logos","ids":[...]}` (project anon key
as the bearer). Re-running it only fills logos that are still empty.

## 0041

**Members can give a logo-less company its logo (D-149).** **APPLIED 2026-11-04.**
Apply after `0040`. Adds `company_logo_upload` (log, no client access) and `set_company_logo(company, path)`
(authenticated): only from the member's own `company-logos/<uid>/` folder, only when the company has no logo yet or is the
member's own organisation, 10 a day. Verify: `select has_function_privilege('anon', 'public.set_company_logo(uuid,text)', 'execute');` (f).
To review uploads: `select c.name, u.logo_path, u.created_at, p.name from public.company_logo_upload u join public.company c on c.id = u.company_id join public.profiles p on p.id = u.member_id order by u.created_at desc;`

## 0042

**Delivered, Read and last active in chat (D-150).** **APPLIED 2026-11-03.**
Apply after `0041`. Adds `brivia_messages.delivered_at` / `read_at` (cleared on every insert by a trigger; there is still
no update policy), `mark_messages_delivered()`, `mark_conversation_read(other)` and `connection_last_seen(ids)` (all
authenticated; recipient only; never a withheld message; last seen rounded to the minute, under the 0018 rules), and
backfills a message the recipient already answered as read at that answer. Deploy the client after it (the client
falls back without it). Verify:
`select count(*) filter (where read_at is not null), count(*) from public.brivia_messages;` and
`select has_function_privilege('anon', 'public.connection_last_seen(uuid[])', 'execute');` (f).

## 0043

**Read receipts switch; notifications for likes and comments on a note (D-151).** **APPLIED 2026-11-04.**
Apply after `0042`. Adds `member_presence.read_receipts`, `set_read_receipts` / `my_read_receipts`, redefines
`mark_conversation_read` (Read only when both members have it on, otherwise Delivered only), widens
`member_notification.notification_type` to `post_like` / `post_comment` (with `post_id`, `comment_id`, `snippet`),
adds triggers on `community_post_likes` and `community_post_comments`, and `my_notifications_v3`. Deploy push-notify
(v4) and the client after it. Verify:
`select has_function_privilege('anon', 'public.my_notifications_v3()', 'execute');` (f) and
`select tgname from pg_trigger where tgname in ('community_post_likes_notify', 'community_post_comments_notify');` (2 rows).

## 0044

**Chat search finds people (D-152).** **APPLIED 2026-11-04.**
Apply after `0043`. Adds `chat_people_search(query, limit)` (authenticated; members the caller may see, matched by
name/full name word starts, title or company; status connected / request_received / request_sent / none, a decline
reads as request_sent; one letter finds connections only; at most 8 non-connections). Verify:
`select has_function_privilege('anon', 'public.chat_people_search(text,int)', 'execute');` (f).

## 0045

**10 free swipes a day; 10 companion swipes a day; "DJ" (D-156).** **APPLIED 2026-11-04** (after the client deployed) and verified.
Apply after `0044`, and deploy the client in the same window (the new client counts Pass as a swipe and reads
`my_companion_quota`; the old client would show "N of 10 signals left" and let a refused Pass look accepted).
Adds the config rows `signal_daily_limit = 10` and `companion_swipe_daily_limit = 10` (an existing row is kept), redefines
`brivia_signal_state` (signals + distinct passes in 24 h), adds the trigger `brivia_interaction_swipe_cap` on
`interaction`, `brivia_companion_state`, `my_companion_quota()` (authenticated), and `companion_swipe` with the cap.
Relabels `music.making.djing` to "DJ". Change a limit later without a migration:
`update public.brivia_config set value = '15' where key = 'signal_daily_limit';`
Verify:
`select key, value from public.brivia_config;` (both rows, 10);
`select label from public.interest_node where id = 'music.making.djing';` (DJ);
`select has_function_privilege('anon', 'public.my_companion_quota()', 'execute');` (f);
`select tgname from pg_trigger where tgrelid = 'public.interaction'::regclass and not tgisinternal order by 1;`
(`brivia_interaction_served`, then `brivia_interaction_swipe_cap`).

## 0046

**Edit, unsend and delete for me (D-157).** **APPLIED 2026-11-04** (after the client deployed) and verified, including a rolled-back edit, unsend and delete-for-me as a real member.
Apply after `0045`, with the client deploy (the client works either way: before 0046 it reads the old columns and
the menu's actions say "Editing and unsending open soon."). Adds `brivia_messages.edited_at` and `unsent_at`,
`brivia_private.hidden_message`, redefines `brivia_private.brivia_message_visible` (0013) to also hide a member's own
"deleted for me" messages, and adds `edit_message(id, body)` (sender, plain text, 15 minutes), `unsend_message(id)`
(sender, any time, both sides) and `delete_message_for_me(id)` (either member, their view only), all authenticated.
Members still have no UPDATE or DELETE policy on `brivia_messages`. Verify:
`select column_name from information_schema.columns where table_name = 'brivia_messages' and column_name in ('edited_at', 'unsent_at');` (2 rows);
`select has_function_privilege('anon', 'public.unsend_message(uuid)', 'execute');` (f);
`select count(*) from pg_policies where tablename = 'brivia_messages' and cmd in ('UPDATE', 'DELETE', 'ALL');` (0).

## 0047

**Seeded hirers stay in the test world (D-162).** Apply after `0037` (it redefines four 0037 functions; it fails if
0037 is missing). Adds the owner-only helper `brivia_hiring_seen_by(viewer, member)` and redefines
`brivia_hiring_bar` (a seeded member skips the photo and 14-day parts), `brivia_role_shown`, `member_open_to` and
`hiring_suggestions` so a seeded member's role or "Open to roles" is shown only to testers. No new RPC, no grant change.
Then run `supabase/seed/hiring-test-members.sql` (seed README, "Hiring test profiles"). Verify:
`select has_function_privilege('authenticated', 'public.brivia_hiring_seen_by(uuid, uuid)', 'execute');` (f);
`select public.brivia_hiring_seen_by(null, 'a7e57000-0000-4000-8000-000000000040');` (f once the seed exists).

## 0048

**The Hiring switch finds everyone who is hiring (D-169).** Apply after `0047`. Adds `hiring_people(limit)`
(authenticated): members with a shown role whom the caller can see, roles that fit first, then nearest, distance band
only. The client works either way (before 0048 the switch filters the loaded deck only). Verify:
`select has_function_privilege('authenticated', 'public.hiring_people(int)', 'execute');` (t);
`select has_function_privilege('anon', 'public.hiring_people(int)', 'execute');` (f).

## 0049

**Hiring matches at any distance (D-170).** Apply after `0048`. Redefines `hiring_suggestions` (no 60 km / ~10 km
admission; fit 0.5 or more still decides; nearest first) and `hiring_people` (up to 200, nearest first). No grant
change. Verify: `select pg_get_functiondef('public.hiring_suggestions(int)'::regprocedure) like '%place_km <= 60%';` (f).

## 0050

**Seeded hiring posts follow the open test world (D-171).** Apply after `0047`. Redefines `brivia_hiring_seen_by` to use
`brivia_in_test_world` instead of `brivia_tester_world`: while `open_test_world` is on, every member sees the seeded
roles and seeded "Open to roles" (nearest first, like real ones); with it off, only testers do. No grant change.
Verify: `select pg_get_functiondef('public.brivia_hiring_seen_by(uuid,uuid)'::regprocedure) like '%brivia_in_test_world%';` (t).

## 0051

**No account-age wait for hirers (D-172).** Apply after `0047`. Redefines `brivia_hiring_bar` without the 14-day
account age (completed, photo unless seeded, confirmed email, no open flag still apply) and `brivia_hiring_live_from`
(the account's first day). No grant change. Verify:
`select pg_get_functiondef('public.brivia_hiring_bar(uuid)'::regprocedure) like '%14 days%';` (f).

## 0052

**Faceless profile photos for the seeded hirers (D-177).** Apply after `0003`. Redefines the
`profiles_photo_url_storage` check so a seeded row (`is_test`) may also use `/test-avatars/tNN.webp` (photos shipped
with the site in `site/public/test-avatars`). Real members are unchanged: every client write is still a storage URL in
their own folder. Then re-run `supabase/seed/hiring-test-members.sql`, which sets the 12 hirers' photos. Verify:
`select count(*) from public.profiles where is_test and photo_url like '/test-avatars/%';` (12).

## 0053

**Razorpay payments and emailed tickets (D-183).** Applied 2026-11-05 (the functions and secrets are still owed). Apply after `0050`.
Adds `event_rsvp.payment_order_id`, `ticket_code` (BRV-XXXXXX) and `ticket_sent_at`, with a unique index on each of the
first two. Members still have no direct access to `event_rsvp` (RLS on, no policy); four Edge Functions do the work with
the service role. Apply with the client deploy; until the functions and secrets are in, Reserve keeps the 30-minute
hold and says "Online payment opens soon", and free registrations say "You're in. See you there." (no email promised).

Setup, in this order (only the founder can do 1-3: they are accounts, keys and DNS):
1. **Resend** (resend.com): create an account, add the domain `thebriviaclub.live`, add the DNS records it shows at your
   DNS host (SPF/DKIM), wait for "Verified", then create an API key.
2. **Razorpay** (dashboard.razorpay.com): start in **Test mode**. Settings > API Keys: generate a key id and secret.
   Settings > Webhooks: add `https://wfbddovczpfdrspmxgfo.supabase.co/functions/v1/razorpay-webhook`, events
   `payment.captured` and `order.paid`, and a webhook secret of your choice. Payment capture: automatic (the default).
3. **Supabase > Edge Functions > Secrets**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
   `RESEND_API_KEY`, and optionally `TICKET_FROM` (default `The Brivia Club <tickets@thebriviaclub.live>`).
4. Apply `0053`, then deploy the functions `event-ticket`, `razorpay-order`, `razorpay-verify` (JWT verification on) and
   `razorpay-webhook` (**JWT verification off**: Razorpay sends no Supabase token; the function checks Razorpay's
   signature on every request). Each imports `../_shared/`.
5. Test with Razorpay's test cards/UPI on a paid event: the seat turns Registered, the ticket email arrives with the
   calendar invite, and Razorpay's dashboard shows the webhook delivered. Then switch Razorpay to Live mode (new live
   keys in the secrets; the webhook re-added for live).
Verify: `select column_name from information_schema.columns where table_name = 'event_rsvp' and column_name in ('payment_order_id','ticket_code','ticket_sent_at');` (3 rows).

## 0054

**Global Hiring Discovery (D-184).** Applied 2026-11-05. Apply after `0050` (independent of `0053`), with the client
deploy (the new client falls back to the old call until it is in; the old client still reads the new answer).
Replaces `hiring_people` with `hiring_people(int, numeric, uuid)`: members with a shown role and members open to roles,
anywhere, ranked by fit, shared interests and skills, paged; logs an impression per row (surface `hiring`). Grant:
`authenticated` only. Expect the usual advisor warning for a security-definer RPC.
Verify: `select count(*) from pg_proc where proname = 'hiring_people';` (1) and
`select pg_get_function_identity_arguments('public.hiring_people'::regproc);` (`p_limit integer, p_after_score numeric, p_after_id uuid`).

## 0055

**Replies (D-191).** Apply after `0046`, with the client deploy (the client works with or without it). Adds
`brivia_messages.reply_to_id` (uuid, references brivia_messages, on delete set null) and a before-insert trigger that
refuses a reply to a message from another conversation. No grant change (members still cannot update messages).
Verify: `select count(*) from information_schema.columns where table_name = 'brivia_messages' and column_name = 'reply_to_id';` (1).

## 0056

**Multi-day events (D-197).** Apply after `0022`, then deploy the client (an older client keeps working: without
`end_date` an event ends on its start date, as before). Redefines `save_member_event` only: `p_fields.end_date`
(YYYY-MM-DD, optional) may be the start date or up to 30 days after it ('invalid end_date' otherwise), and the end
(date + time, IST) must come after the start ('invalid end_time'). Grants as 0022. Redeploy the `event-ticket`,
`razorpay-verify` and `razorpay-webhook` functions so the ticket email names both days (`_shared/ticket-email.js`).
Also (D-198): a published event may have started already if it has not ended; start/end times are optional (00:00
and 23:59 IST when blank); capacity may be empty (unlimited), so the `club_event_member_capacity` check is dropped.
Verify: `select prosrc like '%end_date%' from pg_proc where proname = 'save_member_event';` (true).
and `select count(*) from pg_constraint where conname = 'club_event_member_capacity';` (0).

## 0057

**Events up to a year long (D-199).** Apply after `0056`, with or before the client deploy. Redefines
`save_member_event` as 0056 with the end date allowed up to 365 days after the start date (was 30). Grants as 0022.
Verify: `select prosrc like '%v_date + 365%' from pg_proc where proname = 'save_member_event';` (true).

## 0058

**No limit on how long an event runs (D-200).** Apply after `0057`, with the client deploy. Redefines
`save_member_event` as 0057 without the upper limit on `end_date` (it must still be on or after the start date, and
the end after the start). Grants as 0022.
Verify: `select prosrc not like '%v_date + 365%' from pg_proc where proname = 'save_member_event';` (true).

## 0059

**More places (D-202).** Apply after `0058`, then deploy the `directory` Edge Function (it gains kind `places`), then
the client. Adds `brivia_add_osm_places` (service role only): a place found in OpenStreetMap Photon and missing from
the directory is added to `geo_city` once (ids from 90,000,000; centroid in `brivia_private.geo_city_point`;
`brivia_private.geo_osm` remembers the OpenStreetMap ref). `search_cities` also lists a state's largest places when the
state is typed alone ("Goa"). Before the function is deployed the client simply gets no extra places.
Verify: `select count(*) from public.search_cities('Goa');` (8) and, after one search for "South Goa" in the app,
`select count(*) from public.geo_city where name = 'South Goa';` (1).

## 0060

**Registration notifications (D-203).** Apply after `0059`, then deploy the `push-notify` Edge Function, then the
client. `member_notification` gains `event_id` and the type `event_registered`; a trigger on `event_rsvp` notifies the
organiser when a registration becomes confirmed (free at once, paid once the payment is confirmed; never their own,
never across a block); cancelling removes an unread one. `my_notifications_v4()` adds `event_id` and the poster. The
client falls back to v3 before this is applied.
Verify: `select count(*) from pg_trigger where tgname = 'event_rsvp_notify';` (1).

## 0061

**No event caps (D-204).** Apply after `0060`. `save_member_event` without the 10-new-events-per-24-hours cap
(`event_limit`), and `list_events` without its 80-row cap and its 60-day window. Grants unchanged.
Verify: `select prosrc not like '%event_limit%' from pg_proc where proname = 'save_member_event';` (true).

## 0062

**College Fest (D-209).** Apply after `0061`, with the client deploy. Adds the event category `college` to
`club_event_category_check` and to `save_member_event`'s list (otherwise 0061's). `games` stays valid.
Verify: `select pg_get_constraintdef(oid) like '%college%' from pg_constraint where conname = 'club_event_category_check';` (true).

## 0063

**Connections in Companions (D-214).** Apply after `0062`, with the client deploy. Adds `companion_deck_v2(event, limit)`:
0025's deck plus members the caller is already connected with who want company at that event (a `connected` column;
first in the order; shown even if swiped before). `companion_deck` is unchanged for the older client; the new client
falls back to it until this is applied. `companion_events.to_see` counts the same way.
Verify: `select count(*) from pg_proc where proname = 'companion_deck_v2';` (1).


## 0064

**Chats read on any device (D-215).** Apply after `0063`, with the client deploy. A private per-member marker,
`brivia_private.chat_seen`: the newest message seen in each conversation, and when the Chats tab was last opened.
`mark_chat_seen(other, at)` (other null for the tab) never moves it backwards; `my_chat_seen()` returns the caller's rows.
Opening a chat, or the Chats tab, on one device clears the bell's message rows on the others. The client works as before
until this is applied.
Verify: `select count(*) from pg_proc where proname in ('mark_chat_seen', 'my_chat_seen');` (2).

## 0065

**Title and organisation at signup (D-216).** Apply after `0064`, with the client deploy and the `directory` Edge
Function. `search_companies` may be called without a session, and anon reads only the directory's own companies
(`source <> 'member'`); members' own organisations stay signed-in only. The Edge Function's logo pass also tries the
logo Wikidata lists for the company's name.
Verify: `select has_function_privilege('anon', 'public.search_companies(text,int)', 'execute');` (true).

## 0066

**Unlimited roles, 1000-word descriptions (D-217).** Apply after `0065`, with the client deploy. `hiring_role.about`
holds up to 8000 characters; `save_hiring_role` accepts up to 1000 words there and no longer caps open roles at 3.
Verify: `select prosrc not like '%role_cap%' from pg_proc where proname = 'save_hiring_role';` (true).

## 0067

**Pending requests stay in the hiring deck (D-219).** Apply after `0066`, with the client deploy. Adds
`hiring_people_v2(limit, after_score, after_id)`: 0054's `hiring_people` plus a `request_pending` column; members the
caller has a live request to are served (flagged) instead of left out. `hiring_people` is unchanged for the older client.
Verify: `select count(*) from pg_proc where proname = 'hiring_people_v2';` (1).

## 0068

**Message yourself (D-224).** Apply after `0067`, with the client deploy (either order is safe: the old client never
offers a self thread). Replaces `brivia_private.brivia_can_send(uuid)` so a completed member may also send a message to
themselves; everything else in the send rule is unchanged. No data, table, column or grant changes.
Verify, signed in as a completed member in the app: Chat, search your own name, Message, send "test". Or in SQL:
`select prosrc like '%p_recipient = auth.uid()%' from pg_proc where proname = 'brivia_can_send';` (true).

## 0069

**No brochure size limit (D-227).** Apply after `0068`, with the client deploy. Sets the `event-brochures` bucket's
`file_size_limit` to null (it was 5 MB since 0025); still PDF only and public. A brochure is then limited only by the
project-wide upload limit in the Supabase dashboard (Project Settings > Storage, "Upload file size limit"; raise it
there if large brochures are expected). Verify: `select file_size_limit from storage.buckets where id = 'event-brochures';` (null).

## 0070

**SMASH THEORY members move to AT WORK (D-227, one-off).** Apply after `0069`. Keeps each switched member's old cover
in `brivia_private.cover_switch_d227` (members cannot read it), then sets AT WORK for every profile with SMASH THEORY.
Runs once: a re-run, or a member who picks SMASH THEORY later, changes nothing. The undo statement is in the file.
Verify: `select count(*) from brivia_private.cover_switch_d227;` (the number switched) and
`select count(*) from profiles where cover_url like '%2257522A%';` (0 right after).

## 0071

**Connections hear about a new note (D-234).** Apply after `0070`, then deploy `push-notify` and the client. Adds the
notification type `post_new`: a trigger on `community_posts` writes one for each of the author's connections (a
`matches` row) when a note is posted, never for blocked members or other worlds; deleting the note removes them, and a
caption edit refreshes the snippet of unread ones. No new read function: `my_notifications_v4` already returns them.
Verify: `select count(*) from pg_trigger where tgname = 'community_posts_notify_new';` (1). Applied live 2026-11-10.

## 0072

**The filter drawer's search lane (D-239).** Apply after `0071`, then deploy the client. Adds `discover_people`
(SECURITY DEFINER, `authenticated` only): members by interest / looking-for within a radius of the caller's city or a
chosen city, or anywhere; city-to-city distance only; the deck's exclusions; answers ids, the city (or 'Abroad'),
hits and shared labels, never km. The deck (`deck_candidates`) is unchanged. Verify:
`select has_function_privilege('anon', 'public.discover_people(text[], text[], int, text, uuid[], int)', 'execute');`
(false). Applied live 2026-11-11.

## 0073

**Newcomers in the deck (D-241).** Apply after `0072`, then deploy the client. Adds
`brivia_private.brivia_newcomer_visible` and `newcomer_cards` (members with a name, a photo and the 18+ declaration
whose setup is not finished), and lets `send_signal` record a request to them. `send_signal` is patched in place (the
installed body, one condition), not re-created from a copy, because the live function carries a live-only edit (the
3-argument `brivia_request_is_live`, D-129). Verify:
`select position('brivia_newcomer_visible' in prosrc) > 0 from pg_proc where oid = 'public.send_signal(uuid, text)'::regprocedure;`
(true) and `select count(*) from public.newcomer_cards();` as a member. Applied live 2026-11-12.

## 0074

**Who liked a note (D-242).** Apply after `0073`, then deploy the client. Adds `post_likers(p_post_id)`: the note's
author sees every liker they can see; anyone else sees their own connections among the likers (as post_activity's
"Liked by" line). Verify: `select has_function_privilege('anon', 'public.post_likers(uuid)', 'execute');` (false).
Applied live 2026-11-12.

## 0075

**Message reactions (D-244).** Apply after `0074`, then deploy the client. Adds the private table
`brivia_private.message_reaction` (one emoji per member per message, no member grants) and two RPCs:
`react_to_message(p_message, p_emoji)` (the same emoji again, or null, removes it) and `message_reactions_for(p_ids)`.
Both serve only the two members of the pair, under `brivia_pair_world_ok`, never an unsent or deleted-for-me message.
Before 0075 the client hides the reaction row. Verify:
`select has_function_privilege('anon', 'public.react_to_message(uuid, text)', 'execute');` (false).
Applied live 2026-11-12.

## 0076

**Member badges (D-246).** Apply after `0075`, then deploy the client. Adds `public.member_badge` (one badge per member,
only `'admin'` for now): signed-in members may read it, nobody may write it from the app. Grant or remove a badge here:

```sql
insert into public.member_badge (member_id, badge) values ('<member uuid>', 'admin') on conflict (member_id) do nothing;
delete from public.member_badge where member_id = '<member uuid>';
```

Verify: `select has_table_privilege('authenticated', 'public.member_badge', 'insert');` (false). Applied live
2026-11-13; THE BRIVIA CLUB granted 'admin'.

## 0077

**Admin notes reach everyone (D-250).** Apply after `0076`, then deploy `push-notify`. Re-creates
`brivia_private.brivia_notify_post_new()`: a note by a member with the Admin badge notifies every real account in the
author's world (no block either way); anyone else's note still notifies only their connections. Verify: post a note as
an admin and `select count(*) from public.member_notification where post_id = '<id>';` (every other account). Applied
live 2026-11-13.

## 0078

**Comment replies notify (D-260).** Apply after `0077`, then deploy `push-notify` (v9) and the client. Adds
`comment_reply` to the notification types and re-creates `brivia_private.brivia_notify_post_comment()`: the note's
author is told as before; the writer of the comment being answered is told too (not the replier, not the note's author
twice, not across a block). Verify: `select pg_get_constraintdef(oid) from pg_constraint where conname =
'member_notification_notification_type_check';` lists `comment_reply`. Applied live 2026-11-14.

## 0079

**Unlimited swipes for chosen members (D-261).** Apply after `0078`, then deploy the client. Adds the private
`brivia_private.unlimited_swipes` list and re-creates `brivia_signal_state` and `brivia_companion_state` so a listed
member's limits are 100000. Grant: `insert into brivia_private.unlimited_swipes (member_id, note) values ('<id>', 'why')
on conflict do nothing;` Revoke: `delete from brivia_private.unlimited_swipes where member_id = '<id>';` Verify:
`select daily_limit from public.brivia_signal_state('<id>');` is 100000. Applied live 2026-11-14 (Yashika, Golu Kumar,
Golu).

## 0080

**One swipe pool (D-263).** Apply after `0079`. Deck Pitches, deck Passes and companion swipes share one rolling 24 h
limit (`signal_daily_limit`, 10); members on `brivia_private.unlimited_swipes` have none. Re-creates
`brivia_signal_state`, `brivia_companion_state` and `companion_swipe`, adds `brivia_private.brivia_swipe_times`. Verify:
`select daily_limit, used from public.brivia_companion_state('<id>')` equals `brivia_signal_state('<id>')`. Applied live
2026-11-14.

## 0081

**Fast message privacy rule (D-264).** Apply after `0080`. Same visibility rule on `brivia_messages`, computed once
per query: adds `brivia_private.my_hidden_message_ids()` and `brivia_private.my_other_world_peers()` and re-creates the
select policy "Completed members can view their messages". Verify as a member: the 80 newest received messages
return in tens of ms (`explain analyze`). Applied live 2026-11-14.
