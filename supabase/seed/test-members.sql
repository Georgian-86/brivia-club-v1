-- test-members.sql: 24 clearly marked test members (Ruling P7), for founder/QA demos before launch.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR AS postgres. NOT via the service_role key, the REST API or any
-- client: only a session whose current_user AND session_user own public.profiles may set is_test
-- (0003, brivia_guard_is_test). Any other session silently stores is_test = false, and the check at the
-- end of this script then aborts (and rolls back) the whole seed.
-- This is the LIVE project when you run it in the dashboard. Apply migrations 0001-0003 first.
--
-- What it creates (all in one transaction, idempotent: ids are fixed, every insert is "on conflict do nothing"):
--   * 24 auth.users rows (minimal columns, Ruling I2), emails tNN@test.brivia.club, random unusable password;
--     nobody can log in as them unless you reset a password in the Auth dashboard.
--   * 24 completed profiles (Ruling I3), is_test = true, 6 each in Bengaluru, Mumbai, Delhi, Pune, with
--     skills / looking_for taken from the onboarding chip lists.
--   * connection_requests inserted the way members do: 1->2 then 2->1 (the existing trigger accepts both and
--     creates the match; no direct insert into matches), plus 4 pending requests: 3->1, 4->1, 9->10, 5->8.
--     Run as the owner, auth.uid() is null, so the cap trigger steps aside and RLS is bypassed; the AFTER
--     INSERT consent trigger still runs, so the result obeys the mutual-consent rule.
-- Requests expire after 30 days (Ruling I8): purge and re-seed to refresh.
-- Test members and real members never see each other (Ruling P14). Remove everything with purge-test-members.sql.

begin;
set local search_path = public, extensions;  -- pgcrypto: crypt/gen_salt live in "extensions" on Supabase

create temp table _seed_members (
  n int primary key, name text, gender text, city text, state text, experience text, skills text[], looking_for text[]
) on commit drop;
insert into _seed_members values
  (1, 'Aarav Nair', 'Male', 'Bengaluru', 'Karnataka', '7–12 years', '{"Python","SQL","Data Analysis"}', '{"Networking Contact","Job Referral"}'),
  (2, 'Diya Menon', 'Female', 'Bengaluru', 'Karnataka', '1–3 years', '{"JavaScript","React","REST APIs"}', '{"Sports Partner","Event Companion"}'),
  (3, 'Kabir Shetty', 'Male', 'Bengaluru', 'Karnataka', '12+ years', '{"Generative AI","LLMs","Prompt Engineering"}', '{"Travel Companion","Trekking Partner"}'),
  (4, 'Ishita Rao', 'Female', 'Bengaluru', 'Karnataka', '3–7 years', '{"Photography","Cross-Cultural Communication"}', '{"Mentee","Internship Referral"}'),
  (5, 'Rohan Gowda', 'Male', 'Bengaluru', 'Karnataka', 'Student / just starting', '{"Project Management","Business Communication","Sales"}', '{"Co-founder","Startup Partner"}'),
  (6, 'Sana Iyer', 'Female', 'Bengaluru', 'Karnataka', '7–12 years', '{"Docker","AWS","Linux"}', '{"Photography Partner","Content Creator"}'),
  (7, 'Vihaan Deshmukh', 'Prefer not to say', 'Mumbai', 'Maharashtra', '1–3 years', '{"Power BI","Tableau","Excel"}', '{"Research Partner","AI Enthusiast"}'),
  (8, 'Anaya Kapoor', 'Female', 'Mumbai', 'Maharashtra', '12+ years', '{"Public Speaking","Presentation Skills","Personal Branding"}', '{"Study Partner","Project Partner"}'),
  (9, 'Arjun Mehta', 'Male', 'Mumbai', 'Maharashtra', '3–7 years', '{"Trip Planning","Travel Budgeting","Navigation"}', '{"Language Exchange Partner","Local Guide"}'),
  (10, 'Meera Joshi', 'Female', 'Mumbai', 'Maharashtra', 'Student / just starting', '{"Git","GitHub","Data Structures & Algorithms"}', '{"Mentor","Career Mentor"}'),
  (11, 'Zayn Qureshi', 'Male', 'Mumbai', 'Maharashtra', '7–12 years', '{"AI Agents","RAG","n8n"}', '{"Open Source Contributor","Collaborator"}'),
  (12, 'Tara Fernandes', 'Female', 'Mumbai', 'Maharashtra', '1–3 years', '{"Cooking","First Aid","Geography"}', '{"Hackathon Buddy","Coding Partner"}'),
  (13, 'Reyansh Malhotra', 'Male', 'Delhi', 'Delhi', '12+ years', '{"Python","SQL","Data Analysis"}', '{"Networking Contact","Job Referral"}'),
  (14, 'Kiara Sethi', 'Female', 'Delhi', 'Delhi', '3–7 years', '{"JavaScript","React","REST APIs"}', '{"Sports Partner","Event Companion"}'),
  (15, 'Aditya Bansal', 'Male', 'Delhi', 'Delhi', 'Student / just starting', '{"Generative AI","LLMs","Prompt Engineering"}', '{"Travel Companion","Trekking Partner"}'),
  (16, 'Naina Arora', 'Female', 'Delhi', 'Delhi', '7–12 years', '{"Photography","Cross-Cultural Communication"}', '{"Mentee","Internship Referral"}'),
  (17, 'Dev Chauhan', 'Male', 'Delhi', 'Delhi', '1–3 years', '{"Project Management","Business Communication","Sales"}', '{"Co-founder","Startup Partner"}'),
  (18, 'Riya Khanna', 'Female', 'Delhi', 'Delhi', '12+ years', '{"Docker","AWS","Linux"}', '{"Photography Partner","Content Creator"}'),
  (19, 'Ayaan Kulkarni', 'Male', 'Pune', 'Maharashtra', '3–7 years', '{"Power BI","Tableau","Excel"}', '{"Research Partner","AI Enthusiast"}'),
  (20, 'Myra Patil', 'Female', 'Pune', 'Maharashtra', 'Student / just starting', '{"Public Speaking","Presentation Skills","Personal Branding"}', '{"Study Partner","Project Partner"}'),
  (21, 'Krish Bhosale', 'Male', 'Pune', 'Maharashtra', '7–12 years', '{"Trip Planning","Travel Budgeting","Navigation"}', '{"Language Exchange Partner","Local Guide"}'),
  (22, 'Pooja Joshi', 'Female', 'Pune', 'Maharashtra', '1–3 years', '{"Git","GitHub","Data Structures & Algorithms"}', '{"Mentor","Career Mentor"}'),
  (23, 'Neil D''Souza', 'Male', 'Pune', 'Maharashtra', '12+ years', '{"AI Agents","RAG","n8n"}', '{"Open Source Contributor","Collaborator"}'),
  (24, 'Sneha Pawar', 'Female', 'Pune', 'Maharashtra', '3–7 years', '{"Cooking","First Aid","Geography"}', '{"Hackathon Buddy","Coding Partner"}');

-- Deterministic ids: a7e57000-0000-4000-8000-0000000000NN (NN = 01..24).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000',
       ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated',
       't' || lpad(n::text, 2, '0') || '@test.brivia.club',
       crypt(gen_random_uuid()::text, gen_salt('bf')),   -- random, never stored anywhere: no one can log in
       now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"is_test":true}'::jsonb, now(), now()
from _seed_members
on conflict (id) do nothing;

insert into public.profiles (id, name, full_name, email, gender, city, state, experience, skills, looking_for, is_test)
select ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       name, name, 't' || lpad(n::text, 2, '0') || '@test.brivia.club', gender, city, state, experience,
       skills, looking_for, true
from _seed_members
on conflict (id) do nothing;

do $$
declare
  f text := 'a7e57000-0000-4000-8000-';
begin
  if (select count(*) from public.profiles where is_test and email like '%@test.brivia.club') <> 24 then
    raise exception 'seed aborted: is_test was not stored. Run this script in the Supabase SQL editor as postgres (not service_role).';
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
