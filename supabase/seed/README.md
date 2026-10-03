# Test members: seed and purge

24 clearly marked test members so the app can be demoed and QA'd before real members arrive. Two scripts:

- `test-members.sql` creates them (idempotent: fixed ids, `on conflict do nothing`).
- `purge-test-members.sql` removes every row tied to them in one transaction.

**WARNING: the SQL editor runs against the LIVE Supabase project.** Seed only when you mean to, and purge before launch.
Test members are an isolated world (Ruling P14): they never see, search, request or message real members, and real
members never see them. Real data is never touched by either script.

## Seed (exact steps)

1. Apply migrations `0001`, `0002`, `0003` first (in order).
2. Open the Supabase dashboard, SQL editor, new query, paste all of `supabase/seed/test-members.sql`, Run.
   It must run **as `postgres`**, which is the editor's default. **Do not** run it through the `service_role` key,
   the REST API or a client: only the table owner can set `is_test`, so any other route stores `is_test = false`.
   The script detects this, aborts and rolls back with "seed aborted: is_test was not stored".
3. Check the result row: `test_members = 24`, `test_requests = 6`, `test_matches = 1`.

What you get: 24 members (`t01` to `t24@test.brivia.club`), 6 each in Bengaluru, Mumbai, Delhi and Pune, with varied skills and
looking-for taken from the onboarding chips; one match (t01 and t02, created by the normal mutual-consent trigger from
requests in both directions, never a direct insert) and four pending requests (t03 to t01, t04 to t01, t09 to t10, t05 to t08).
Requests expire after 30 days; purge and re-seed to refresh.

Nobody can log in as a test member: each has a random password that is never stored. To act as one, reset that user's
password in Authentication, Users. A member who signs in sees only the test world, so use it to see the demo data.

## Verify

```sql
select count(*) from public.profiles where is_test;                                   -- 24
select city, count(*) from public.profiles where is_test group by city;               -- 6 each
select count(*) from public.matches m join public.profiles p on p.id = m.user1_id where p.is_test;  -- 1
```
A real account must see none of them in the deck, search or requests. Locally: `bash supabase/tests/run.sh` seeds, checks all
of this (including that a real member sees nothing and cannot request or message them), purges, and checks 0 rows remain.

## Purge before launch

Paste `supabase/seed/purge-test-members.sql` into the SQL editor and Run (as `postgres`). It is one transaction and prints
rows deleted and rows remaining per table; every `remaining` must be 0. It deletes `is_test` profiles (plus orphan
`@test.brivia.club` auth users from a half-finished seed), cascading to matches, requests, blocks, messages, posts and
interaction, and removes `storage.objects` under their folders. Running it with nothing seeded is safe (all zeros).
Supabase refuses SQL deletes on `storage.objects`; if test members ever uploaded files, the script prints a notice and you
remove those files in the Storage dashboard. The seed itself uploads nothing.
