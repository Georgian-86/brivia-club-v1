# Test members: seed and purge

24 clearly marked test members so the app can be demoed and QA'd before real members arrive. Two scripts:

- `test-members.sql` creates them (idempotent: fixed ids, `on conflict do nothing`).
- `purge-test-members.sql` removes every row tied to them in one transaction.

**WARNING: the SQL editor runs against the LIVE Supabase project.** Seed only when you mean to, and purge before launch.
Test members are an isolated world (Ruling P14): they never see, search, request or message real members, and real
members never see them. Real data is never touched by either script.

## Seed (exact steps)

0. The seed was verified only against a local stub of Supabase's auth schema. Compare first, in the SQL editor:
   `select table_name, column_name, is_nullable from information_schema.columns where table_schema='auth' and table_name in ('users','identities') order by 1, ordinal_position;`
   The seed writes auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, the two meta columns,
   created_at, updated_at, and the eight token/text columns as empty strings) and auth.identities (id, user_id, provider,
   provider_id, identity_data, last_sign_in_at, created_at, updated_at). If a NOT NULL column is missing from that list, stop.
1. Apply migrations `0001`, `0002`, `0003`, `0004` first (in order).
2. Open the Supabase dashboard, SQL editor, new query, paste all of `supabase/seed/test-members.sql`, Run.
   It must run **as `postgres`**, which is the editor's default. **Do not** run it through the `service_role` key,
   the REST API or a client: only the table owner can set `is_test`, so any other route stores `is_test = false`.
   The script detects this, aborts and rolls back with "seed aborted: is_test was not stored".
3. Check the result row: `test_members = 24`, `test_requests = 6`, `test_matches = 1`.

What you get: 24 completed members (`t01` to `t24@test.brivia.club`, D-030), 6 each in Bengaluru, Mumbai, Delhi and Pune.
Each has 3 to 5 non-sensitive interests whose points sum to 20 (`member_interest`; `skills` is their display copy), a home
cell (`member_orbit`) snapped with `brivia_grid_cell` from the city centroid plus a small per-member offset (under 2 km, so a
city spans several cells; no coordinate is stored and no `location_change` row is written), and looking-for taken from the
onboarding chips. Re-running the seed never changes a test member's existing interests or cell. There is also one match (t01 and t02, created by the normal mutual-consent trigger from
requests in both directions, never a direct insert) and four pending requests (t03 to t01, t04 to t01, t09 to t10, t05 to t08).
Requests expire after 30 days; purge and re-seed to refresh.

The domain `@test.brivia.club` is reserved for these seeds, but the purge never relies on it: it keys on `is_test` or the
seed id prefix `a7e57000-0000-4000-8000-`, so a real signup using that domain is never deleted.

Nobody can log in as a test member: each has a random password that is never stored. To act as one, reset that user's
password in Authentication, Users. A member who signs in sees only the test world, so use it to see the demo data.

## Verify

```sql
select count(*) from public.profiles where is_test;                                   -- 24
select city, count(*) from public.profiles where is_test group by city;               -- 6 each
select count(*) from public.profiles where is_test and public.brivia_member_completed(id);  -- 24
select count(*) from public.member_orbit o join public.profiles p on p.id = o.member_id where p.is_test;  -- 24
select count(*) from public.matches m join public.profiles p on p.id = m.user1_id where p.is_test;  -- 1
```
A real account must see none of them in the deck, search or requests. Locally: `bash supabase/tests/run.sh` seeds, checks all
of this (including that a real member sees nothing and cannot request or message them), purges, and checks 0 rows remain.

## Purge before launch

Paste `supabase/seed/purge-test-members.sql` into the SQL editor and Run (as `postgres`). It is one transaction and prints
rows deleted and rows remaining per table; every `remaining` must be 0. It deletes `is_test` profiles (plus orphan
auth users with the seed id prefix from a half-finished seed), and their `auth.identities`, cascading to matches, requests, blocks, messages, posts,
interaction, `member_interest`, `member_orbit` and `location_change`, and removes `storage.objects` under their folders. Running it with nothing seeded is safe (all zeros).
Supabase refuses SQL deletes on `storage.objects`; if test members ever uploaded files, the script prints a notice and you
remove those files in the Storage dashboard. The seed itself uploads nothing.

Note: `purge-test-members.sql` now sets `storage.allow_delete_query`, which removes **only the `storage.objects` metadata rows**.
The files themselves stay in the buckets. If test members ever uploaded files, remove them through the Storage API or the
dashboard first (or accept orphaned test files; the orphan report in `docs/BREACH_RUNBOOK.md` section 7 will list them).
