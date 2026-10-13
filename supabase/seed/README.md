# Test members: seed and purge

The test world (v2, Phase D): 60 clearly marked test members with posts, matches and chats, so the app can be demoed
and QA'd before real members arrive, and so every ORBIT role can be seen end to end. Two scripts:

- `test-members.sql` creates them (idempotent: fixed ids, `on conflict do nothing` or `not exists` guards; a re-run changes nothing).
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
1. Apply migrations `0001`-`0006` and `0008` first (in order). 0008 section 4 lets a test member's post show a preset
   illustration; without it the post inserts are refused and the whole seed rolls back.
2. Open the Supabase dashboard, SQL editor, new query, paste all of `supabase/seed/test-members.sql`, Run.
   It must run **as `postgres`**, which is the editor's default. **Do not** run it through the `service_role` key,
   the REST API or a client: only the table owner can set `is_test`, so any other route stores `is_test = false`.
   The script detects this, aborts and rolls back with "seed aborted: is_test was not stored".
3. Check the result row: `test_members = 60`, `test_posts = 30`, `test_requests = 11`, `test_matches = 3`,
   `test_messages = 15`, `flagged = 10`, `blocks = 5`.

## What you get

60 members (`t01` to `t60@test.brivia.club`, D-030): Mumbai 12, Thane 10, Pune 10, Bengaluru 14, Delhi 14. `t01`-`t24`
are the v1 members, unchanged (6 each in Bengaluru, Mumbai, Delhi, Pune); `t25`-`t60` are new. Thane and Bengaluru,
where the founder's own accounts live, get the richest coverage (Thane is all new; Bengaluru gets 8 new).

- **Interests:** 2 to 5 non-sensitive interests each (`member_interest`; `skills` is their display copy), all four
  modes in every city, points summing to 20. 3 members per city also hold one private (sensitive) interest, with the
  consent `set_sensitive_consent(true)` records: `profiles.sensitive_consent_at` and one `sensitive_give` row in
  `consent_event`. Private labels never reach `skills`.
- **Area:** a home cell (`member_orbit`) snapped with `brivia_grid_cell` from the city centroid in `place` plus a small
  per-member offset (under 2 km); no coordinate is stored and no `location_change` row is written.
- **Looks:** monogram avatars (no photo); new members have a preset cover illustration.
- **Content:** 30 community posts by unflagged members of all five cities. Each post's image is a preset illustration
  path (`/Images/Cover%20images/<file>`, empty `image_path`), allowed for test members only (0008 section 4) and
  rendered by the feed from the shipped assets; nothing is uploaded. 3 matches (t01-t02 Bengaluru, t43-t44 Thane,
  t13-t14 Delhi), each made by the normal mutual-consent trigger from requests in both directions (never a direct
  insert), with 5, 6 and 4 short messages. 5 pending requests: t03 and t04 to t01, t01 to t40 (so t01 has requests in
  both directions), t09 to t10, t05 to t08. There is no notification table: the app derives notifications from these
  rows. Requests expire after 30 days; purge and re-seed to refresh.

### ORBIT roles per city

The "first member" (F) is each city's first new member: the v1 members' interests are fixed and share nothing with a
city-mate. Sign in as F (reset its password) to see the roles in the deck.

| City | F | 3 close neighbours (within 3 km, 2+ shared, overlap > 0.5) | 2 weak (1 shared, <= 0.25) | Far-but-strong (> 350 km, 3+ shared) | 2 flagged (invisible) | Block |
|---|---|---|---|---|---|---|
| Bengaluru | t25 Meghna | t26, t27, t28 | t02, t04 | t29 Ananya <-> t45 Omkar (Thane) | t30, t31 | t25 blocks t32 |
| Mumbai | t33 Rhea | t34, t35, t36 | t07, t09 | t37 Nandini <-> t29 Ananya (Bengaluru) | t38, t12 | t33 blocks t11 |
| Thane | t39 Siddhi | t40, t41, t42 | t43, t44 | t45 Omkar <-> t29 Ananya (Bengaluru) | t46, t47 | t39 blocks t48 |
| Pune | t49 Isha | t50, t51, t52 | t21, t22 | t21 Krish <-> t57 Gurpreet (Delhi) | t20, t24 | t49 blocks t23 |
| Delhi | t53 Zoya | t54, t55, t56 | t14, t16 | t57 Gurpreet <-> t21 Krish (Pune) | t58, t59 | t53 blocks t60 |

- The neighbours are the only members in F's area at the top overlap level, so they lead F's deck on every day
  (the deck's daily tie-break only orders members at the same level).
- Flagged members (`member_flag`, `suspended_pending_review`) have complete profiles but are not "completed", so nobody
  sees them in the deck, search or posts. Three v1 members are flagged (t12, t20, t24) and two are blocked (t11, t23),
  because Mumbai and Pune have only 6 and 4 new members; their own rows are unchanged.
- **The far-but-strong match** is never in the deck: the interim deck (`deck_candidates`) shows only members within
  60 km and has no Worth-the-Distance lane yet. It is found by search (search reaches everyone), and ORBIT's gate
  admits it as a Worth-the-Distance card (R about 0.88-0.94 against the fixed 0.86): `tests/unit/seed-orbit.test.mjs`.

The domain `@test.brivia.club` is reserved for these seeds, but the purge never relies on it: it keys on `is_test` or the
seed id prefix `a7e57000-0000-4000-8000-`, so a real signup using that domain is never deleted.

Nobody can log in as a test member: each has a random password that is never stored. To act as one, reset that user's
password in Authentication, Users. A member who signs in sees only the test world, so use it to see the demo data.

## The tester switch (see your own account in the test world)

After migration `0008`, a real account can be moved into the test world without becoming a test member: add it to the
owner-only `public.brivia_tester` table (exact steps: `supabase/migrations/README.md`, section "0008").

```sql
insert into public.brivia_tester(member_id) select id from auth.users where email = '<founder email>' on conflict do nothing;
```

While listed, that account sees only test members (deck, search, requests, chat) and only test members see it; real
members never see it. It stays a real account (`is_test` is never set), so the purge keeps it. Stop with
`delete from public.brivia_tester where member_id = (select id from auth.users where email = '<founder email>');`.
The purge also empties `brivia_tester` and removes the tester's matches, requests and messages with test members (they
go with the test members), keeping the tester's own profile, interests and area.

## Verify

```sql
select count(*) from public.profiles where is_test;                                   -- 60
select city, count(*) from public.profiles where is_test group by city;               -- Mumbai 12, Thane 10, Pune 10, Bengaluru 14, Delhi 14
select count(*) from public.profiles where is_test and public.brivia_member_completed(id);  -- 50 (the 10 flagged are hidden)
select count(*) from public.member_orbit o join public.profiles p on p.id = o.member_id where p.is_test;  -- 60
select count(*) from public.matches m join public.profiles p on p.id = m.user1_id where p.is_test;  -- 3
```
A real account must see none of them in the deck, search, requests or posts. Locally: `bash supabase/tests/run.sh` seeds
twice, checks all of this (counts, roles, the deck order for each city's first member, flagged and blocked members
invisible, the far match absent from the deck but found by search, and that a real member sees nothing and cannot
request or message them), purges, and checks 0 rows remain.

## Purge before launch

Paste `supabase/seed/purge-test-members.sql` into the SQL editor and Run (as `postgres`). It is one transaction and prints
rows deleted and rows remaining per table; every `remaining` must be 0. It empties `brivia_tester` (0008; testers keep their
accounts and are back in the real world) and deletes `is_test` profiles (plus orphan
auth users with the seed id prefix from a half-finished seed), and their `auth.identities`, cascading to matches, requests, blocks, messages, posts,
interaction, `member_interest`, `member_orbit`, `member_flag` and `location_change`, deletes their `consent_event` rows (that table has no
foreign key on purpose, so this is explicit; real members' rows are kept), and removes `storage.objects` under their folders. Running it with nothing seeded is safe (all zeros).
Supabase refuses SQL deletes on `storage.objects`; if test members ever uploaded files, the script prints a notice and you
remove those files in the Storage dashboard. The seed itself uploads nothing.

Note: `purge-test-members.sql` now sets `storage.allow_delete_query`, which removes **only the `storage.objects` metadata rows**.
The files themselves stay in the buckets. If test members ever uploaded files, remove them through the Storage API or the
dashboard first (or accept orphaned test files; the orphan report in `docs/BREACH_RUNBOOK.md` section 7 will list them).
