set brivia.harness_autocomplete = 'off';
-- Iteration 4 (P0-B), Task 3: sensitive consent give and redistributing withdrawal (R2).
--   C1 8+8+4(sensitive) -> withdraw -> 10+10, still completed, interest_rewrite unchanged, one sensitive_withdraw event;
--   C2 1 public + 19 sensitive points -> the public interest gets 20;
--   C3 3+3+3 public with 11 sensitive -> sums to 20, each >= 1, deterministic (ties by interest_id);
--   C4 give twice -> one sensitive_give event; withdraw with nothing sensitive leaves points unchanged.
-- Client sessions use SET LOCAL SESSION AUTHORIZATION. One transaction, rolled back.
begin;
insert into auth.users(id) values
  ('c5000000-0000-4000-8000-000000000001'), ('c5000000-0000-4000-8000-000000000002'),
  ('c5000000-0000-4000-8000-000000000003'), ('c5000000-0000-4000-8000-000000000004')
  on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city)
select u, 'Consent ' || right(u::text, 1), 'Consent ' || right(u::text, 1), 'c5' || right(u::text, 1) || '@example.com', 'Pune'
  from unnest(array['c5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002',
                    'c5000000-0000-4000-8000-000000000003','c5000000-0000-4000-8000-000000000004']::uuid[]) u
on conflict (id) do nothing;
update public.profiles set adult_declared_at = now() where id::text like 'c5000000-%';

create or replace function pg_temp.as_member(p_id uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id)::text, true);
end $f$;

-- C1
do $$
declare m constant uuid := 'c5000000-0000-4000-8000-000000000001'; rw0 int; rw1 int; pts text; ev int;
begin
  set local session authorization authenticated; set local role authenticated;
  perform pg_temp.as_member(m);
  perform public.set_home_city('in-pune');
  perform public.set_sensitive_consent(true);
  perform public.set_member_interests('[{"interest_id":"sports.racket.badminton","points":8},
     {"interest_id":"games.board.chess","points":8},{"interest_id":"community.social.lgbtq","points":4}]'::jsonb);
  reset role; reset session authorization;
  if not public.brivia_member_completed(m) then raise exception 'FAIL C1 setup: not completed'; end if;
  select count(*) into rw0 from public.interest_rewrite where member_id = m;
  set local session authorization authenticated; set local role authenticated;
  perform pg_temp.as_member(m);
  perform public.set_sensitive_consent(false);
  reset role; reset session authorization;
  select string_agg(interest_id || '=' || points, ',' order by interest_id) into pts from public.member_interest where member_id = m;
  if pts <> 'games.board.chess=10,sports.racket.badminton=10' then raise exception 'FAIL C1: points are %', pts; end if;
  if not public.brivia_member_completed(m) then raise exception 'FAIL C1: not completed after withdrawal'; end if;
  select count(*) into rw1 from public.interest_rewrite where member_id = m;
  if rw0 <> rw1 then raise exception 'FAIL C1: withdrawal wrote an interest_rewrite row (% -> %)', rw0, rw1; end if;
  if (select sensitive_consent_at from public.profiles where id = m) is not null then raise exception 'FAIL C1: consent timestamp kept'; end if;
  select count(*) into ev from public.consent_event where member_id = m and kind = 'sensitive_withdraw';
  if ev <> 1 then raise exception 'FAIL C1: % sensitive_withdraw events', ev; end if;
  if (select skills from public.profiles where id = m) is distinct from array['Badminton','Chess']::text[]
     and (select array_length(skills, 1) from public.profiles where id = m) <> 2 then
    raise exception 'FAIL C1: skills not refreshed: %', (select skills from public.profiles where id = m);
  end if;
end $$;

-- C2: 1 public (1 point) + 19 sensitive points over two rows -> the public interest gets 20.
do $$
declare m constant uuid := 'c5000000-0000-4000-8000-000000000002';
begin
  set local session authorization authenticated; set local role authenticated;
  perform pg_temp.as_member(m);
  perform public.set_home_city('in-pune');
  perform public.set_sensitive_consent(true);
  perform public.set_member_interests('[{"interest_id":"games.board.chess","points":1},
     {"interest_id":"community.social.lgbtq","points":10},{"interest_id":"wellbeing.spirituality.kirtan","points":9}]'::jsonb);
  perform public.set_sensitive_consent(false);
  reset role; reset session authorization;
  if (select points from public.member_interest where member_id = m and interest_id = 'games.board.chess') <> 20
     or (select count(*) from public.member_interest where member_id = m) <> 1 then
    raise exception 'FAIL C2: the lone public interest does not hold 20';
  end if;
  if not public.brivia_member_completed(m) then raise exception 'FAIL C2: not completed'; end if;
end $$;

-- C3: 3+3+3 public, 11 sensitive: 60/9 = 6 rem 6 each -> two leftovers by interest_id.
do $$
declare m constant uuid := 'c5000000-0000-4000-8000-000000000003'; pts text;
begin
  set local session authorization authenticated; set local role authenticated;
  perform pg_temp.as_member(m);
  perform public.set_home_city('in-pune');
  perform public.set_sensitive_consent(true);
  perform public.set_member_interests('[{"interest_id":"games.board.chess","points":3},
     {"interest_id":"sports.racket.badminton","points":3},{"interest_id":"lifestyle.home.minimalism","points":3},
     {"interest_id":"community.social.lgbtq","points":6},{"interest_id":"wellbeing.spirituality.kirtan","points":5}]'::jsonb);
  perform public.set_sensitive_consent(false);
  reset role; reset session authorization;
  select string_agg(interest_id || '=' || points, ',' order by interest_id) into pts from public.member_interest where member_id = m;
  if pts <> 'games.board.chess=7,lifestyle.home.minimalism=7,sports.racket.badminton=6' then raise exception 'FAIL C3: points are %', pts; end if;
end $$;

-- C4: give twice -> one event; withdraw with no sensitive rows leaves the points alone.
do $$
declare m constant uuid := 'c5000000-0000-4000-8000-000000000004'; ev int; pts text;
begin
  set local session authorization authenticated; set local role authenticated;
  perform pg_temp.as_member(m);
  perform public.set_home_city('in-pune');
  perform public.set_member_interests('[{"interest_id":"games.board.chess","points":13},{"interest_id":"sports.racket.badminton","points":7}]'::jsonb);
  perform public.set_sensitive_consent(true);
  perform public.set_sensitive_consent(true);
  reset role; reset session authorization;
  select count(*) into ev from public.consent_event where member_id = m and kind = 'sensitive_give';
  if ev <> 1 then raise exception 'FAIL C4: % sensitive_give events', ev; end if;
  set local session authorization authenticated; set local role authenticated;
  perform pg_temp.as_member(m);
  perform public.set_sensitive_consent(false);
  reset role; reset session authorization;
  select string_agg(interest_id || '=' || points, ',' order by interest_id) into pts from public.member_interest where member_id = m;
  if pts <> 'games.board.chess=13,sports.racket.badminton=7' then raise exception 'FAIL C4: points changed: %', pts; end if;
end $$;
rollback;
