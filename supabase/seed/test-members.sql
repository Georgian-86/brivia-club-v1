-- test-members.sql: 24 clearly marked test members (Ruling P7), for founder/QA demos before launch.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR AS postgres. NOT via the service_role key, the REST API or any
-- client: only a session whose current_user AND session_user own public.profiles may set is_test
-- (0003, brivia_guard_is_test). Any other session silently stores is_test = false, and the check at the
-- end of this script then aborts (and rolls back) the whole seed.
-- This is the LIVE project when you run it in the dashboard. Apply migrations 0001-0004 first.
--
-- What it creates (all in one transaction, idempotent: ids are fixed, every insert is "on conflict do nothing"):
--   * 24 auth.users rows (minimal columns, Ruling I2), emails tNN@test.brivia.club, random unusable password;
--     nobody can log in as them unless you reset a password in the Auth dashboard.
--   * 24 completed profiles (D-030), is_test = true, 6 each in Bengaluru, Mumbai, Delhi, Pune:
--     - 3-5 non-sensitive interests each (member_interest), with points summing to exactly 20 (the Passion Budget);
--       profiles.skills is the display copy of those labels, built the way set_member_interests builds it;
--     - a home cell (member_orbit) snapped with brivia_grid_cell from the city centroid in public.place plus a small
--       per-member offset (under 2 km), and the nearest place. No coordinate is stored. No location_change row is
--       written (the seed is not a member's change, so it does not use up their 3-per-24 h cap);
--     - looking_for taken from the onboarding chip lists.
--   * connection_requests inserted the way members do: 1->2 then 2->1 (the existing trigger accepts both and
--     creates the match; no direct insert into matches), plus 4 pending requests: 3->1, 4->1, 9->10, 5->8.
--     Run as the owner, auth.uid() is null, so the cap trigger steps aside and RLS is bypassed; the AFTER
--     INSERT consent trigger still runs, so the result obeys the mutual-consent rule.
-- Run the column check in seed/README.md first: this script was verified only against a local stub.
-- Requests expire after 30 days (Ruling I8): purge and re-seed to refresh.
-- Test members and real members never see each other (Ruling P14). Remove everything with purge-test-members.sql.

begin;
set local search_path = public, extensions;  -- pgcrypto: crypt/gen_salt live in "extensions" on Supabase

create temp table _seed_members (
  n int primary key, name text, gender text, city text, state text, experience text, interests text, looking_for text[]
) on commit drop;
-- interests: 'interest_id:points,...' (3-5 non-sensitive level-3/4 nodes, points summing to 20).
insert into _seed_members values
  (1, 'Aarav Nair', 'Male', 'Bengaluru', 'Karnataka', '7–12 years', 'tech.ai_data.data_analysis:8,tech.software.backend:5,games.board.chess:4,food.drinks.coffee:3', '{"Networking Contact","Job Referral"}'),
  (2, 'Diya Menon', 'Female', 'Bengaluru', 'Karnataka', '1–3 years', 'tech.software.web_development.frontend:8,sports.racket.badminton:6,stage_screen.theatre.open_mics:3,food.eating_out.cafe_hopping:3', '{"Sports Partner","Event Companion"}'),
  (3, 'Kabir Shetty', 'Male', 'Bengaluru', 'Karnataka', '12+ years', 'tech.ai_data.generative_ai:9,outdoors.trekking.himalayan_treks:6,lifestyle.travel.solo_travel:5', '{"Travel Companion","Trekking Partner"}'),
  (4, 'Ishita Rao', 'Female', 'Bengaluru', 'Karnataka', '3–7 years', 'arts.photography.street_photography:8,learning.languages.french:5,business.careers.mentoring:4,lifestyle.travel.heritage_sites:3', '{"Mentee","Internship Referral"}'),
  (5, 'Rohan Gowda', 'Male', 'Bengaluru', 'Karnataka', 'Student / just starting', 'business.startups.founding:8,business.startups.product_management:6,business.marketing.selling:3,sports.team.cricket.box_cricket:3', '{"Co-founder","Startup Partner"}'),
  (6, 'Sana Iyer', 'Female', 'Bengaluru', 'Karnataka', '7–12 years', 'tech.software.devops:7,arts.photography.wildlife_photography:6,outdoors.nature.birdwatching:4,stage_screen.online.short_video:3', '{"Photography Partner","Content Creator"}'),
  (7, 'Vihaan Deshmukh', 'Prefer not to say', 'Mumbai', 'Maharashtra', '1–3 years', 'tech.ai_data.data_analysis:7,tech.ai_data.machine_learning:5,learning.science.neuroscience:5,games.board.modern_board_games:3', '{"Research Partner","AI Enthusiast"}'),
  (8, 'Anaya Kapoor', 'Female', 'Mumbai', 'Maharashtra', '12+ years', 'business.careers.public_speaking:8,business.marketing.branding:5,learning.study.study_groups:4,learning.reading.book_clubs:3', '{"Study Partner","Project Partner"}'),
  (9, 'Arjun Mehta', 'Male', 'Mumbai', 'Maharashtra', '3–7 years', 'lifestyle.travel.weekend_getaways:7,learning.languages.japanese:5,outdoors.trekking.monsoon_treks:5,food.eating_out.street_food:3', '{"Language Exchange Partner","Local Guide"}'),
  (10, 'Meera Joshi', 'Female', 'Mumbai', 'Maharashtra', 'Student / just starting', 'tech.software.competitive_programming:8,tech.software.open_source:6,business.careers.mentoring:3,music.instruments.guitar:3', '{"Mentor","Career Mentor"}'),
  (11, 'Zayn Qureshi', 'Male', 'Mumbai', 'Maharashtra', '7–12 years', 'tech.ai_data.generative_ai:8,tech.software.open_source:5,tech.software.backend:4,games.video.esports:3', '{"Open Source Contributor","Collaborator"}'),
  (12, 'Tara Fernandes', 'Female', 'Mumbai', 'Maharashtra', '1–3 years', 'food.cooking.regional_indian:7,community.volunteering.disaster_relief:5,tech.software.web_development:5,learning.study.quizzing:3', '{"Hackathon Buddy","Coding Partner"}'),
  (13, 'Reyansh Malhotra', 'Male', 'Delhi', 'Delhi', '12+ years', 'tech.ai_data.data_analysis:8,business.money.stock_investing:5,sports.endurance.running:4,games.board.chess.blitz:3', '{"Networking Contact","Job Referral"}'),
  (14, 'Kiara Sethi', 'Female', 'Delhi', 'Delhi', '3–7 years', 'tech.software.web_development.frontend:7,sports.racket.badminton:5,stage_screen.dance.bollywood_dance:5,food.eating_out.cafe_hopping:3', '{"Sports Partner","Event Companion"}'),
  (15, 'Aditya Bansal', 'Male', 'Delhi', 'Delhi', 'Student / just starting', 'tech.ai_data.generative_ai:8,outdoors.trekking.himalayan_treks:7,learning.study.exam_prep:5', '{"Travel Companion","Trekking Partner"}'),
  (16, 'Naina Arora', 'Female', 'Delhi', 'Delhi', '7–12 years', 'arts.photography.portraits:8,learning.humanities.history.indian_history:5,business.careers.mentoring:4,lifestyle.travel.heritage_sites:3', '{"Mentee","Internship Referral"}'),
  (17, 'Dev Chauhan', 'Male', 'Delhi', 'Delhi', '1–3 years', 'business.startups.founding:7,business.startups.growth:6,sports.team.football.five_a_side:4,business.marketing.selling:3', '{"Co-founder","Startup Partner"}'),
  (18, 'Riya Khanna', 'Female', 'Delhi', 'Delhi', '12+ years', 'tech.software.devops:8,arts.photography.street_photography:5,stage_screen.online.podcasting:4,food.drinks.coffee.pour_over:3', '{"Photography Partner","Content Creator"}'),
  (19, 'Ayaan Kulkarni', 'Male', 'Pune', 'Maharashtra', '3–7 years', 'tech.ai_data.data_analysis:7,tech.ai_data.machine_learning:5,learning.science.astronomy:5,games.board.carrom:3', '{"Research Partner","AI Enthusiast"}'),
  (20, 'Myra Patil', 'Female', 'Pune', 'Maharashtra', 'Student / just starting', 'business.careers.public_speaking:7,learning.discussion.debating:6,learning.study.study_groups:4,learning.reading.book_clubs:3', '{"Study Partner","Project Partner"}'),
  (21, 'Krish Bhosale', 'Male', 'Pune', 'Maharashtra', '7–12 years', 'lifestyle.travel.weekend_getaways:6,outdoors.riding.motorcycle_touring:6,outdoors.trekking.monsoon_treks:5,learning.languages.marathi:3', '{"Language Exchange Partner","Local Guide"}'),
  (22, 'Pooja Joshi', 'Female', 'Pune', 'Maharashtra', '1–3 years', 'tech.software.competitive_programming:7,tech.software.open_source:5,business.careers.mentoring:4,music.instruments.piano:4', '{"Mentor","Career Mentor"}'),
  (23, 'Neil D''Souza', 'Male', 'Pune', 'Maharashtra', '12+ years', 'tech.ai_data.generative_ai:8,tech.software.backend:5,music.listening.rock_metal:4,games.video.pc:3', '{"Open Source Contributor","Collaborator"}'),
  (24, 'Sneha Pawar', 'Female', 'Pune', 'Maharashtra', '3–7 years', 'food.cooking.baking:7,community.volunteering.food_banks:5,tech.software.web_development:5,learning.study.quizzing:3', '{"Hackathon Buddy","Coding Partner"}');

-- Deterministic ids: a7e57000-0000-4000-8000-0000000000NN (NN = 01..24).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000',
       ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated',
       't' || lpad(n::text, 2, '0') || '@test.brivia.club',
       crypt(gen_random_uuid()::text, gen_salt('bf')),   -- random, never stored anywhere: no one can log in
       now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"is_test":true}'::jsonb, now(), now(),
       '', '', '', '', '', '', '', ''   -- GoTrue cannot read NULL here (login/reset/admin list break), like Supabase's own seeding
from _seed_members
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, 'email', u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.id::text like 'a7e57000-0000-4000-8000-%'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

insert into public.profiles (id, name, full_name, email, gender, city, state, experience, skills, looking_for, is_test)
select ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       name, name, 't' || lpad(n::text, 2, '0') || '@test.brivia.club', gender, city, state, experience,
       '{}', looking_for, true
from _seed_members
on conflict (id) do nothing;

-- Interests: only for seeded members who have none yet (a re-run, or an edit made in the app, is left alone).
insert into public.member_interest (member_id, interest_id, points, mode)
select ('a7e57000-0000-4000-8000-' || lpad(m.n::text, 12, '0'))::uuid,
       split_part(i.item, ':', 1), split_part(i.item, ':', 2)::smallint, 'play'
from _seed_members m
cross join lateral unnest(string_to_array(m.interests, ',')) as i(item)
where not exists (select 1 from public.member_interest x
                   where x.member_id = ('a7e57000-0000-4000-8000-' || lpad(m.n::text, 12, '0'))::uuid)
on conflict do nothing;

-- skills = the display copy of the member's non-sensitive interest labels (points desc, label asc), exactly as
-- set_member_interests writes it.
update public.profiles p
   set skills = coalesce((select array_agg(nd.label order by mi.points desc, nd.label asc)
                            from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
                           where mi.member_id = p.id and not nd.sensitive), '{}')
 where p.id in (select ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from _seed_members);

-- Home cell: the city centroid plus a small per-member offset (k = 0..5 within a city: about 0.6 km steps),
-- snapped to g7 with its g6/g5 parents. Existing rows are left alone.
insert into public.member_orbit (member_id, cell_scheme, home_cell, home_cell_g6, home_cell_g5, place_id)
select c.id, 'grid1', c.cell, public.brivia_grid_parent(c.cell, 6), public.brivia_grid_parent(c.cell, 5),
       public.brivia_nearest_place(c.cell)
from (
  select ('a7e57000-0000-4000-8000-' || lpad(m.n::text, 12, '0'))::uuid as id,
         public.brivia_grid_cell(pl.lat + (((m.n - 1) % 6) - 2.5) * 0.005,
                                 pl.lng + ((((m.n - 1) * 5) % 6) - 2.5) * 0.005, 7) as cell
  from _seed_members m
  join public.place pl on pl.name = m.city and pl.country = 'India'
) c
on conflict (member_id) do nothing;

do $$
declare
  f text := 'a7e57000-0000-4000-8000-';
begin
  if (select count(*) from public.profiles where is_test and email like '%@test.brivia.club') <> 24 then
    raise exception 'seed aborted: is_test was not stored. Run this script in the Supabase SQL editor as postgres (not service_role).';
  end if;
  -- Every seeded member is completed (D-030): interests summing to 20 and a cell.
  if exists (select 1 from generate_series(1, 24) g
              where not public.brivia_member_completed((f || lpad(g::text, 12, '0'))::uuid)) then
    raise exception 'seed aborted: a test member is not completed (interests or cell). Apply migration 0004 first.';
  end if;
  -- One match: both directions, so the consent trigger accepts the pair and creates the match.
  insert into public.connection_requests (from_id, to_id, note) values
    ((f || '000000000001')::uuid, (f || '000000000002')::uuid, 'Test fixture: Bengaluru hello'),
    ((f || '000000000002')::uuid, (f || '000000000001')::uuid, null)
  on conflict do nothing;
  -- Pending requests (one direction only).
  insert into public.connection_requests (from_id, to_id, note) values
    ((f || '000000000003')::uuid, (f || '000000000001')::uuid, 'Test fixture: pending'),
    ((f || '000000000004')::uuid, (f || '000000000001')::uuid, null),
    ((f || '000000000009')::uuid, (f || '000000000010')::uuid, 'Test fixture: pending'),
    ((f || '000000000005')::uuid, (f || '000000000008')::uuid, 'Test fixture: cross-city pending')
  on conflict do nothing;
end $$;

commit;

select (select count(*) from public.profiles where is_test) as test_members,
       (select count(*) from public.connection_requests r join public.profiles p on p.id = r.from_id where p.is_test) as test_requests,
       (select count(*) from public.matches m join public.profiles p on p.id = m.user1_id where p.is_test) as test_matches;
