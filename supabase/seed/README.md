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

## Hiring test profiles (D-162)

`hiring-test-members.sql` gives 12 seeded members 14 open roles (invented companies, realistic titles: Robotics Software
Engineer in Thane, Backend Engineer and Brand Marketing Manager in Mumbai, Product Manager and DevOps Engineer in
Bengaluru, Senior Data Engineer in Pune, Data Analyst in Delhi, a few remote roles) and 6 seeded seekers a findable
"Roles I'm open to". The test world sees them (migrations `0047`, `0050`): while `open_test_world` is on that is every
member (D-171); with it off, add your account as a tester first (above).

1. Apply `0037_hiring.sql`, then `0047_hiring_test_world.sql`, then `0048_hiring_people.sql`, then
   `0049_hiring_anywhere.sql`, then `0050_hiring_open_world.sql`, then `0051_hiring_no_wait.sql`, then
   `0052_test_avatars.sql` (migrations README).
2. Run `test-members.sql` if the test members are not there yet, then run `hiring-test-members.sql` (safe to re-run:
   it reopens every seeded role for 30 days). It stops with a clear message if 0037, 0047 or the members are missing.
3. With `open_test_world` off, run the `brivia_tester` insert above with your email. Then reload the app.

To test as a seeker: Profile → Looking for → Job Opportunities, save the roles you're open to (for example Robotics
Software Engineer, mid, on-site), then use the Hiring toggle on Connect. As a hirer: post a role (Profile → You're
hiring); seekers such as Siddhi Joshi (Thane) appear as suggestions. Seeded members never reply, so an ask stays
"Asked". Verify: `select count(*) from public.hiring_role where id::text like 'a7e57000-0000-4000-9000-%';` (14).
The purge removes all of it (deleting the seeded profiles cascades to their roles, intents and asks).

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

**Retired (D-193, 2026-11-05):** `hiring-test-members.sql` is no longer run: the founder removed every seeded hiring role
and "Open to roles" entry from the live data. Running it again would bring them back.

### Seeded member photos (D-210; replaces the D-177 and D-188 sets)

Every seeded member (tNN = seed number NN, t61-t68 for any extra test rows) has a real photo, under the Unsplash
License, in which no face can be seen: a mirror selfie with the phone or camera over the face, someone seen from behind
against the sky or a city, a silhouette at sunset, or a desk with a laptop and coffee. That keeps any stranger's face off
an invented profile (D-156). Men's and women's profiles get photos that match; the seeded hirers get desk and laptop
photos; "Prefer not to say" and t61-t68 get neutral ones. Each is cropped to 480 px WebP in `site/public/test-avatars/`
and was checked by eye for faces. File names are unchanged, so a deploy is all it takes (no SQL).

D-211 turned 25 of them into pets (dogs, cats) and instruments (guitar, piano, violin, tabla), matched to the member's
interests where one fits. Source URL: `https://images.unsplash.com/<photo>`; a `page <slug>` entry is
`https://unsplash.com/photos/<slug>`. The purge script clears them with the profiles.

| File | Unsplash photo | Shows |
|---|---|---|
| t01 | photo-1785663292283-04a0e6a3bb19 | Mirror selfie, camera over the face |
| t02 | photo-1647975647816-5d3ff813e404 | Hand forming a chord on a guitar |
| t03 | photo-1789981552903-504c5a33169c | White hoodie above the hills |
| t04 | photo-1747374373804-df8fa149716e | Mirror selfie, camera over the face |
| t05 | photo-1569291364147-60a038bda755 | Seen from behind over the city |
| t06 | photo-1768295984707-64ab37e539dd | Latte beside a keyboard on a white desk |
| t07 | photo-1743109811511-dbd694fb3457 | City skyline at night |
| t08 | photo-1785474445369-409f6acec42b | Laptop and coffee on a monochrome desk |
| t09 | photo-1530281700549-e82e7bf110d6 | Dog running out of the sea |
| t10 | photo-1761472082698-3d51618aeb45 | Hand on an acoustic guitar's frets |
| t11 | photo-1689467909244-631e55404336 | Seen from behind, working at two screens |
| t12 | photo-1774979517562-9b47c3761c71 | Cat sitting on a wooden counter |
| t13 | photo-1673442981926-fefc73d04878 | Laptop, tablet and coffee on a marble desk |
| t14 | photo-1704122873190-e92f977f78aa | Fluffy cat curled on a cushion |
| t15 | photo-1657256794209-0daf23db892b | Silhouette against a violet sunset |
| t16 | photo-1786152532472-caec53399382 | Seen from behind on a rooftop |
| t17 | photo-1783244725627-6a2ce2815451 | Camera held over the face |
| t18 | photo-1497032628192-86f99bcd76bc | Desk from above: laptop, coffee, notebook |
| t19 | photo-1606055413678-7561ef89bbbc | Walking a road, seen from behind |
| t20 | photo-1582456891925-a53965520520 | Pomeranian on the steps |
| t21 | photo-1600753575717-9e38cce25f3c | Red top on a forest path |
| t22 | photo-1778585041100-507f3eafe63f | Hands on piano keys |
| t23 | photo-1741229395001-6d8d2a97f05e | Fingers on a guitar neck in low light |
| t24 | photo-1768198566500-9ec0160d88ec | Fluffy cat on a sofa by a window |
| t25 | photo-1750322769212-fb7750247387 | Latte art beside a laptop |
| t26 | photo-1630532852017-9b14723a72c5 | Laptop and iced coffee by a window |
| t27 | photo-1510771463146-e89e6e86560e | Golden retriever holding a flower |
| t28 | photo-1780545311196-f8b507b08b94 | Silhouette in golden light |
| t29 | page hand-holding-violin-bow-and-strings-YqSVAieps84 | Hand on a violin and bow |
| t30 | photo-1711419398242-d8ca79c6e9c1 | Silhouette at sunset by the water |
| t31 | photo-1479502806991-251c94be6b15 | Seen from behind on a city rooftop |
| t32 | photo-1722934181894-eb1323604b84 | Walking a park path, seen from behind |
| t33 | photo-1783746893555-9367486518ec | Sun hat, overlooking the city |
| t34 | photo-1688158307264-c949b2d68ffe | Coffee and a leather wallet on a desk |
| t35 | photo-1772982822877-4cd058eea507 | Brown cat by a window |
| t36 | photo-1773561213080-cf7b71cda100 | Silhouette with the sun at hand height |
| t37 | page a-close-up-of-a-person-playing-a-violin-KGGsJI6r-0U | Violin and bow, close |
| t38 | photo-1634826833404-b51e7ddcc3b0 | Mirror selfie in a dark doorway |
| t39 | photo-1568219656418-15c329312bf1 | Hand on a tabla |
| t40 | photo-1519639715757-0c88449f9048 | Laptop at a window desk |
| t41 | photo-1753272363249-d9bd81d80f89 | Silhouette at a sunset balcony |
| t42 | photo-1633411988188-6e63354a9019 | Hands on a tabla |
| t43 | photo-1772714037381-cf6a20be3152 | Tabby cat beside a potted plant |
| t44 | photo-1570797803365-c6eb43b1f040 | Hands playing a tabla pair |
| t45 | page a-person-holding-a-violin-ya6PWTtPlkw | Fingers on violin strings |
| t46 | photo-1761934798152-bf0c739808f7 | Back of the head at night |
| t47 | photo-1586149663840-3d4dc1b6c681 | Seen from behind in black and white |
| t48 | photo-1779081764094-150614ee6371 | Silhouette on the shore at sunset |
| t49 | photo-1760146933340-d7697ffb0fd6 | Hands at a grand piano |
| t50 | photo-1654686474914-bb98f6280d10 | Hands on a laptop by a window |
| t51 | photo-1589666629225-750e2f7875f5 | Fingers on piano keys, close |
| t52 | photo-1638029351298-6f5966e8754c | Orange hoodie in a garden |
| t53 | photo-1758748930304-4f2735578156 | Black and white cat on a windowsill |
| t54 | photo-1751554827598-c96cb294c0e6 | Car mirror selfie with a camera |
| t55 | photo-1776729870224-36f0bf5c2cda | Tabby cat at a window |
| t56 | photo-1518020382113-a7e8fc38eac9 | Pug in a denim jacket |
| t57 | photo-1743506444917-38047eabb60a | Black and white dog |
| t58 | photo-1516366434321-728a48e6b7bf | Golden dog resting its chin |
| t59 | photo-1778945469600-bef900cec017 | Small figure under a dramatic sky |
| t60 | photo-1642789009978-209023f28a5d | Phone held up at night |
| t61 | photo-1724390409130-20e9b8ddf921 | Phone held up, taking a photo |
| t62 | photo-1774269792790-bfa70fecb79a | Silhouette against a sunset sky |
| t63 | photo-1765161794532-4dd677d321d2 | Silhouette on a hill at dusk |
| t64 | photo-1777132769515-ea5d119ec102 | Seen from behind at sunset |
| t65 | photo-1772234153865-71128db6ad87 | Grey hoodie, seen from behind |
| t66 | photo-1724441400168-b46f8b0ff41e | Navy hoodie, seen from behind |
| t67 | photo-1742522197047-0fbf649b17bc | Hood up, seen from behind |
| t68 | photo-1610901190603-a334521b81b5 | Orange jacket on a snowy street |

