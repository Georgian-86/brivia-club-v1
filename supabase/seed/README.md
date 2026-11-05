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

### Test hirer photos (D-177)

The 12 seeded hirers carry real-looking photos in which no face is visible, so no stranger's likeness sits on an
invented profile (D-156). They are free photos under the Unsplash License, cropped to 480 px WebP, in
`site/public/test-avatars/` (served at `/test-avatars/tNN.webp`):

| File | Unsplash photo | Shows |
|---|---|---|
| t06 | photo-1515378791036-0648a3ef77b2 | Person in a mustard sweater on a laptop |
| t08 | photo-1484480974693-6ca0a78fb36b | Hand writing a checklist |
| t11 | photo-1507679799987-c73779587ccf | Suit, face out of frame |
| t13 | photo-1517048676732-d65bc937f952 | Hands with notebooks at a meeting |
| t18 | photo-1553877522-43269d4ea984 | Person seen from behind at a laptop |
| t23 | photo-1521791136064-7986c2920216 | Handshake |
| t25 | photo-1717496331312-3e8aacfa27a7 | Hands holding a tablet |
| t26 | photo-1577100078279-b3445eae827c | Hands on a laptop, phone beside it |
| t34 | photo-1516321318423-f06f85e504b3 | Hands pointing at a laptop |
| t40 | photo-1486312338219-ce68d2c6f44d | Hands typing |
| t42 | photo-1564697259644-03cd5e7363fa | Over-the-shoulder, tablet |
| t50 | photo-1434030216411-0b793f4b4173 | Hand writing beside a coffee cup |

Source URL: `https://images.unsplash.com/<photo>`. The purge script clears them with the profiles.

### Faceless photos for every seeded member (D-188)

Every other seeded member (tNN = seed number NN) has a faceless Unsplash License photo that fits their top interest:
hands at work, an instrument, a camera, food, a book, a figure seen from behind. Found with Firecrawl image search,
captured from the Unsplash photo page (the container cannot reach Unsplash directly), cropped to 480 px WebP, and
checked by eye for faces. Page: `https://unsplash.com/photos/<slug>`.

| File | Unsplash page slug | Shows |
|---|---|---|
| t01 | close-up-of-a-hand-typing-on-a-computer-keyboard-Qh1degtlisQ | Hand typing on a keyboard |
| t02 | a-worn-out-badminton-shuttlecock-held-by-a-hand-mtQqHRnqXaY | Shuttlecock held in a hand |
| t03 | hiker-with-backpack-admiring-a-majestic-snow-capped-mountain-mxIj46EEvic | Hiker in silhouette below a snow peak |
| t04 | hands-holding-a-vintage-camera-taking-a-picture-2Mi8hbjRXHM | Hands holding a vintage camera |
| t05 | hand-writing-notes-in-a-notebook-at-a-desk-1rm4_SojyNM | Hand writing notes at a desk |
| t07 | hands-typing-code-on-a-laptop-keyboard-xORqjEMmsRM | Hands typing code on a laptop |
| t09 | hiker-enjoys-the-scenic-view-of-mountains-3U3-UZP8WjI | Hiker seen from behind, mountains |
| t10 | hands-typing-code-on-a-laptop-computer-8pMT3J_gxJA | Hands typing code, dark desk |
| t12 | hands-grinding-spices-in-a-bowl-with-bracelets-Vu7lfKQMwRo | Hands grinding spices |
| t14 | white-badminton-shuttlecock-hVeOZslMjGA | Hand tossing a shuttlecock |
| t15 | a-man-hiking-up-a-mountain-with-a-backpack-QTrSmMrmeAs | Hiker from behind on a ridge |
| t16 | person-holding-camera-lens-7KLa-xLbSXA | Hand holding a lens to a lake |
| t17 | a-close-up-of-a-persons-hand-on-a-laptop-ZN4MUOwkuA8 | Hand on a laptop touchpad |
| t19 | a-close-up-of-a-person-typing-on-a-laptop-ThjsNSWZVx8 | Hands typing on a laptop |
| t20 | hand-writing-in-a-notebook-on-a-white-desk-7MbJh7ge6y8 | Journal on a white desk |
| t21 | a-man-riding-a-motorcycle-down-a-road-next-to-a-forest-pOqkzMljrVg | Motorcycle rider from behind |
| t22 | a-close-up-of-a-person-typing-on-a-laptop-tj6sV9Z40f0 | Hands typing, laptop on knees |
| t24 | a-person-holding-a-piece-of-bread-in-their-hands-uXzMtJ9etIU | Sourdough loaf broken open |
| t27 | hands-holding-a-freshly-baked-loaf-of-sourdough-bread-smHpLKXZJA8 | Hands holding a sourdough loaf |
| t28 | an-indoor-rock-climbing-wall-with-many-handholds-and-ropes-riMO975bfIc | Bouldering wall |
| t29 | hand-holding-violin-bow-and-strings-YqSVAieps84 | Hand on a violin and bow |
| t30 | hands-holding-a-loaf-of-freshly-baked-bread-JVY7VSBEhEo | Bread in a tin |
| t31 | a-person-chopping-green-vegetables-on-a-cutting-board-WzrojlIzgyQ | Chopping greens |
| t32 | a-person-climbing-up-the-side-of-a-mountain-pwFvjm4hcik | Hand on a rock face |
| t33 | hands-typing-on-a-vintage-typewriter-with-paper-L8KoP71_hPY | Hands on a typewriter |
| t35 | hands-type-on-an-old-black-typewriter-E1BQ3jb0blc | Hands on an old typewriter |
| t36 | a-person-writing-on-a-notebook-next-to-a-typewriter-mR2VH9NMtdU | Notebook beside a typewriter |
| t37 | a-close-up-of-a-person-playing-a-violin-KGGsJI6r-0U | Violin and bow, close |
| t38 | hand-writing-in-a-notebook-with-pens-and-glasses-TIaRRl8wEWA | Hand writing, pens |
| t39 | hand-holding-a-vintage-nikon-point-and-shoot-camera-QNf5-vAFAGU | Hand holding a film camera |
| t41 | hands-holding-a-vintage-canon-camera-dHxSFSc5fX0 | Hands holding a Canon |
| t43 | a-hand-holding-a-potted-plant-on-a-white-background-aRFyZYwfBro | Pot plant balanced on an arm |
| t44 | hands-holding-a-game-controller-playing-a-video-game-DngE_t_zuTE | Hands with a game controller |
| t45 | a-person-holding-a-violin-ya6PWTtPlkw | Fingers on violin strings |
| t46 | hand-holding-a-black-nikon-point-and-shoot-camera-LQ6WtX0C0GQ | Hand holding a compact camera |
| t47 | hands-slicing-red-onion-on-a-wooden-cutting-board-NzRZ0vzvgJs | Slicing a red onion |
| t48 | hand-holding-a-vintage-film-camera-with-patterned-background-sZsdcnBsZqs | Hand holding a film camera |
| t49 | a-hand-paints-watercolor-art-with-a-fine-brush-1UH_1YIZNYk | Hand painting watercolour |
| t51 | person-looking-through-a-telescope-at-night-with-city-lights-OmR8BHt-q4E | Telescope silhouette at night |
| t52 | a-close-up-of-paint-and-a-brush-on-a-piece-of-paper-oURTHj8kT-4 | Paint and brush on paper |
| t53 | a-persons-hands-holding-a-book-and-a-cup-of-tea-EgYcr_N-UyE | Book and tea |
| t54 | hands-holding-a-book-and-a-cup-of-coffee-0-qCTnUdRU8 | Hands with a book and coffee |
| t55 | a-person-is-holding-a-cup-of-tea-and-reading-a-book-qLJ-M7EyoaY | Tea over an open book |
| t56 | a-person-reading-a-book-by-a-window-shfeJo9uJ1I | Reading by a window, face out of frame |
| t57 | a-man-riding-on-the-back-of-a-motorcycle-dZTBczLXC7k | Helmeted rider on a motorcycle |
| t58 | a-person-reading-a-book-mVudmq8W_PU | Silhouette from behind at a window |

Temporary: t59 to t68 are a second, tighter (and mostly mirrored) crop of another member's photo, because the Firecrawl
credits ran out before ten more could be fetched: t59 from t55, t60 from t31, t61 from t39, t62 from t44, t63 from t20, t64 from t41, t65 from t09, t66 from t12, t67 from t37, t68 from t10.
Replace them with their own photos when convenient (same file names; nothing else changes).

