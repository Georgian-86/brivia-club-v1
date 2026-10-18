# Migrations: apply and deploy runbook

The files here are applied **by hand in the Supabase SQL editor, as `postgres`, in order** (`0001` → `0006`). Each
file is idempotent: the local harness (`bash supabase/tests/run.sh`) applies every file twice. Verify locally with
the harness before touching the live project. `supabase/legacy/` is archive only and is never applied.

**Live state (2026-10-07): `0001`–`0004` are applied on the live project and frozen** (D-038: a file applied live is
never edited again; later changes go in a new numbered file; `0004` went live on 2026-10-05, D-042). **Next: apply
`0005`, verify it, then apply `0006`; deploy the new client in the same window as `0005`** (sections "0005" and "0006"
below). Sections 0–4 are the historical `0004` runbook, kept for reference (pg_cron, log settings and the advisor list
still apply).

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

## 0007: the notice version for the guided signup (Phase E, D-067)

Apply **only `0007_signup_minimisation.sql`**, as `postgres` in the SQL editor, **after 0006**, and **before** the client
that ships the guided signup is deployed (that client declares notice `2026-10-20`; a database without 0007 refuses it
with "stale notice version"). Apply it the same day. Independent of 0008 (either order).
- **What it does:** `brivia_notice_version()` returns `2026-10-20`; a new owner-only `brivia_notice_accepted(version)`
  also accepts `2026-10-05` until 3 November 2026 (14 days), so a tab still on the old client keeps working;
  `declare_adult` is redefined with that check and nothing else changed (the rejoin-review check from 0005 stays).
- **Pre-flight:** `select public.brivia_notice_version();` returns `2026-10-05`.
- **Verify:** it returns `2026-10-20`; `select public.brivia_notice_accepted('2026-10-05');` is true until 3 November.
- If the release date moves, change it in 0007 (both places), `site/scripts/notice-version.js` and `site/privacy.html`
  together (`npm run test:unit` checks they agree).

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
