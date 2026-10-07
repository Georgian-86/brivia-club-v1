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

Incident response (suspected data breach, pausing the purge cron, notices): see `docs/BREACH_RUNBOOK.md`.
