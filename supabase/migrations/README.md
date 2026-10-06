# Migrations: apply and deploy runbook

The files here are applied **by hand in the Supabase SQL editor, as `postgres`, in order** (`0001` → `0004`). Each
file is idempotent: the local harness (`bash supabase/tests/run.sh`) applies every file twice. Verify locally with
the harness before touching the live project. `supabase/legacy/` is archive only and is never applied.

**Live state (2026-10-04): `0001`, `0002` and `0003` are applied on the live project and frozen** (D-038: a file
applied live is never edited again; later changes go in a new numbered file). **Apply only `0004`.** Once `0004` is
applied it is frozen too.

## 0. Pre-flight checks (run in the SQL editor before `0004`)

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

## 4. Apply

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
0005). The file is idempotent. Sections are appended by task; this part covers sections 1-4 (the 18+ gate, consent, reports, the rejoin tombstone, account deletion, the retention purge and the city-wide label).

- **Effect on live members:** completion now needs `profiles.adult_declared_at`. Real members who completed before 0005
  are not declared and become invisible until they confirm in the app (they are routed back to step 1). Test members are
  backfilled by 0005 itself.
- **Post-apply check** (how many real members must still declare):

  ```sql
  select count(*) from profiles where not is_test and adult_declared_at is null;
  ```
- **Expected advisor list after 0005:** the 0004 list above, plus the new intended RPCs `declare_adult`, `report_member` and `delete_my_account`; `brivia_notice_version` is a plain invoker function.
  Nothing else may be executable by `authenticated`/`anon`: `consent_event`, `member_report`, `report_attempt`,
  `moderation_pepper` and `moderation_tombstone` are owner-only (RLS on, no grants); `brivia_email_digest` and
  `brivia_is_declared` are owner-only functions.
- **Live check before relying on deletion recency** (`delete_my_account` requires a login within 10 minutes): on a
  test-member session, `select auth.jwt()->'amr'` must show a `timestamp` (an array of `{"method": ..., "timestamp": <epoch>}`).
  If it does not, the RPC refuses every call with `reauth_required`; fix that before shipping the deletion UI.
- `purge_expired_requests()` keeps its signature and cron command; it now also applies the retention schedule (spec 9.1.6).

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
