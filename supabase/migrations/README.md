# Migrations: apply and deploy runbook

The files here are applied **by hand in the Supabase SQL editor, as `postgres`, in order** (`0001` → `0004`). Each
file is idempotent: the local harness (`bash supabase/tests/run.sh`) applies every file twice. Verify locally with
the harness before touching the live project. `supabase/legacy/` is archive only and is never applied.

## 1. Before you apply: plan the window (deploy order)

- **Apply `0001` → `0004` and deploy the new client in the same window.** The old client breaks against `0004`
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

1. Apply `0001_baseline.sql`, `0002_p0_privacy_consent.sql`, `0003_trust_hardening.sql`, `0004_orbit_onboarding.sql`,
   in that order, each as one run in the SQL editor. Re-running `0003` alone must be followed by `0004`.
2. Deploy the new client (same window, step 1).
3. **Then run the seed** (only if test members are wanted): follow `supabase/seed/README.md`
   (`seed/test-members.sql`, as `postgres`; remove with `seed/purge-test-members.sql`).
4. **Then run the advisors**: Dashboard → **Advisors** → Security and Performance. The security advisor must be
   clean (go-live gate, D-026). Record the result in the go-live DECISIONS entry.
