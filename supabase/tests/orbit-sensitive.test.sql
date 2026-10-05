-- Iteration-3 arena P0-A6 (R3, B-F4, C-7, DPDP): the sensitive set, the completion floor, separate consent and the
-- interest-rewrite cap (D-038; amends D-029).
--   * taxonomy: nutrition, better sleep and healthy ageing are public; Sufi and qawwali, Indian Sign Language,
--     Women's circles and Women travelling solo are sensitive; yoga, meditation, mythology, public policy and climate
--     action stay public;
--   * completion floor: at least one non-sensitive interest, in set_member_interests (22023 'invalid interests') and in
--     brivia_member_completed; so a completed member never has empty skills;
--   * consent: profiles.sensitive_consent_at, set only by set_sensitive_consent(true); a sensitive id without it is
--     refused (22023 'sensitive consent required'); set_sensitive_consent(false) clears it and deletes every sensitive
--     member_interest row (the member re-spends the freed points);
--   * rewrite cap: 3 accepted set_member_interests calls per rolling 24 h by a completed member; the 4th raises PT429.
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.s5(n int) returns uuid language sql immutable as $$
  select ('5e45e45e-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
declare st text; msg text;
begin
  begin execute p_sql; exception when others then get stacked diagnostics st = returned_sqlstate, msg = message_text;
    return st || ' ' || msg; end;
  return null;
end $$;

-- 1. The taxonomy data.
do $$
declare bad text;
begin
  select string_agg(i.id, ', ') into bad from unnest(array[
    'music.listening.sufi_qawwali', 'learning.languages.sign_language', 'community.social.womens_circles',
    'lifestyle.travel.solo_travel.women_solo']) i(id)
   where not coalesce((select sensitive from public.interest_node n where n.id = i.id), false);
  if bad is not null then raise exception 'FAIL R3: not sensitive: %', bad; end if;
  select string_agg(i.id, ', ') into bad from unnest(array[
    'wellbeing.health.nutrition', 'wellbeing.health.sleep', 'wellbeing.health.healthy_ageing']) i(id)
   where coalesce((select sensitive or status <> 'active' from public.interest_node n where n.id = i.id), true);
  if bad is not null then raise exception 'FAIL R3: should be public and active: %', bad; end if;
  -- the "keep public" list (both critics): every node labelled like these is public
  select string_agg(n.id, ', ') into bad from public.interest_node n
   where n.level >= 2 and n.sensitive
     and (n.label ~* '^(yoga|meditation|mythology|public policy|climate action)' );
  if bad is not null then raise exception 'FAIL R3: should stay public: %', bad; end if;
  if (select count(*) from public.interest_node n where n.level >= 2
       and n.label ~* '^(yoga|meditation|mythology|public policy|climate action)') < 3 then
    raise exception 'FAIL setup: the keep-public nodes were not found';
  end if;
end $$;

-- 2. Shape and grants: the consent column, set_sensitive_consent, the rewrite ledger.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
                  and column_name = 'sensitive_consent_at' and data_type = 'timestamp with time zone') then
    raise exception 'FAIL R3: profiles.sensitive_consent_at missing';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'sensitive_consent_at', 'update') then
    raise exception 'FAIL R3: a client may update sensitive_consent_at directly';
  end if;
  if to_regprocedure('public.set_sensitive_consent(boolean)') is null then raise exception 'FAIL R3: set_sensitive_consent missing'; end if;
  if not (select prosecdef and proconfig @> array['search_path=public'] from pg_proc
           where oid = 'public.set_sensitive_consent(boolean)'::regprocedure)
     or has_function_privilege('anon', 'public.set_sensitive_consent(boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_sensitive_consent(boolean)', 'execute') then
    raise exception 'FAIL R3: set_sensitive_consent must be definer, search_path=public, authenticated only';
  end if;
  if to_regclass('public.interest_rewrite') is null
     or has_table_privilege('authenticated', 'public.interest_rewrite', 'select')
     or has_table_privilege('authenticated', 'public.interest_rewrite', 'insert') then
    raise exception 'FAIL R3: interest_rewrite missing or readable/writable by members';
  end if;
end $$;

-- Members: M1 (a profile and a cell, no interests yet), M2 (owner-built: only sensitive interests).
do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(18.5204, 73.8567, 7);
begin
  for g in 1..2 loop
    mid := pg_temp.s5(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email) values (mid, 'Sens ' || g, 'Sens ' || g, 's' || g || '@example.com')
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;   -- R1: declared (fixture is off)
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), 'in-pune')
    on conflict (member_id) do nothing;
  end loop;
  insert into public.member_interest (member_id, interest_id, points) values
    (pg_temp.s5(2), 'wellbeing.spirituality.kirtan', 10), (pg_temp.s5(2), 'community.social.lgbtq', 10);
end $$;

-- A client insert cannot set the consent (the column is insertable table-wide, so a trigger nulls it).
insert into auth.users(id) values (pg_temp.s5(3)) on conflict do nothing;
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s5(3))::text, true);
  insert into public.profiles (id, name, full_name, email, sensitive_consent_at)
  values (pg_temp.s5(3), 'Sens 3', 'Sens 3', 's3@example.com', now());
  reset role;
  if (select sensitive_consent_at from public.profiles where id = pg_temp.s5(3)) is not null then
    raise exception 'FAIL R3: a client insert set sensitive_consent_at';
  end if;
end $$;

-- 3. The completion floor in brivia_member_completed: 20 sensitive points and a cell are not enough.
do $$
begin
  if public.brivia_member_completed(pg_temp.s5(2)) then
    raise exception 'FAIL R3 (B-F4): a member with only sensitive interests is completed';
  end if;
end $$;

-- 4. Consent and the floor in set_member_interests.
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.s5(1))::text, false);
do $$
declare e text;
begin
  -- a sensitive id without consent
  e := pg_temp.err($q$select public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":15},
                                                          {"interest_id":"wellbeing.spirituality.kirtan","points":5}]')$q$);
  if e is distinct from '22023 sensitive consent required' then raise exception 'FAIL R3: no-consent sensitive pick gave %', e; end if;
  e := pg_temp.err($q$select public.set_member_interests('[{"interest_id":"music.listening.sufi_qawwali","points":20}]')$q$);
  if e is distinct from '22023 sensitive consent required' then raise exception 'FAIL R3: no-consent Sufi pick gave %', e; end if;
  if exists (select 1 from public.my_interests()) then raise exception 'FAIL R3: a refused call stored rows'; end if;
  -- the newly public interests need no consent
  perform public.set_member_interests('[{"interest_id":"wellbeing.health.nutrition","points":10},
                                        {"interest_id":"wellbeing.health.sleep","points":10}]');
  if (select skills from public.profiles where id = auth.uid()) <> array['Better sleep', 'Nutrition'] then
    raise exception 'FAIL R3: nutrition/sleep skills = %', (select skills from public.profiles where id = auth.uid());
  end if;
  -- consent given
  perform public.set_sensitive_consent(true);
  if (select sensitive_consent_at from public.profiles where id = auth.uid()) is null then
    raise exception 'FAIL R3: consent not recorded'; end if;
  -- the floor: every pick sensitive is refused even with consent
  e := pg_temp.err($q$select public.set_member_interests('[{"interest_id":"wellbeing.spirituality.kirtan","points":20}]')$q$);
  if e is distinct from '22023 invalid interests' then raise exception 'FAIL R3 floor: all-sensitive picks gave %', e; end if;
  perform public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":12},
                                        {"interest_id":"wellbeing.spirituality.kirtan","points":5},
                                        {"interest_id":"community.social.womens_circles","points":3}]');
  if (select skills from public.profiles where id = auth.uid()) <> array['Tennis'] then
    raise exception 'FAIL R3: skills = %', (select skills from public.profiles where id = auth.uid()); end if;
end $$;
reset role;

do $$
begin
  if not public.brivia_member_completed(pg_temp.s5(1)) then raise exception 'FAIL setup: M1 not completed'; end if;
  if (select skills from public.profiles where id = pg_temp.s5(1)) = '{}' then
    raise exception 'FAIL R3: a completed member has empty skills'; end if;
  if (select count(*) from public.member_interest where member_id = pg_temp.s5(1)) <> 3 then
    raise exception 'FAIL setup: M1 has % rows', (select count(*) from public.member_interest where member_id = pg_temp.s5(1));
  end if;
  -- the first save (not completed before it) is free; the second (completed before it) is a counted rewrite
  if (select count(*) from public.interest_rewrite where member_id = pg_temp.s5(1)) <> 1 then
    raise exception 'FAIL R3: % rewrite rows after one rewrite', (select count(*) from public.interest_rewrite where member_id = pg_temp.s5(1));
  end if;
end $$;

-- 5. Withdrawal: one call clears the consent and deletes every sensitive row; the non-sensitive rows stay.
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.s5(1))::text, false);
select public.set_sensitive_consent(false);
reset role;
do $$
declare st record;
begin
  if (select sensitive_consent_at from public.profiles where id = pg_temp.s5(1)) is not null then
    raise exception 'FAIL R3: consent not withdrawn'; end if;
  if exists (select 1 from public.member_interest mi join public.interest_node n on n.id = mi.interest_id
              where mi.member_id = pg_temp.s5(1) and n.sensitive) then
    raise exception 'FAIL R3: withdrawal left sensitive rows'; end if;
  if (select string_agg(interest_id || ':' || points, ',') from public.member_interest where member_id = pg_temp.s5(1))
     <> 'sports.racket.tennis:20' then
    raise exception 'FAIL R3: withdrawal did not redistribute the freed points (R2)'; end if;
  -- R2 (iteration 4): the freed points are redistributed, so the member stays completed
  if not public.brivia_member_completed(pg_temp.s5(1)) then raise exception 'FAIL R3: not completed after redistribution'; end if;
end $$;

-- After withdrawal a sensitive id is refused again.
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.s5(1))::text, false);
do $$
begin
  if pg_temp.err($q$select public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":15},
                                                       {"interest_id":"learning.languages.sign_language","points":5}]')$q$)
     is distinct from '22023 sensitive consent required' then
    raise exception 'FAIL R3: a sensitive pick after withdrawal was not refused';
  end if;
end $$;
reset role;

-- 6. The rewrite cap (fix round 1, D-041): every save by a member who already has interest rows counts, completed or
-- not. M1 (12 points left after withdrawal) re-spends (counted), then 2 more rewrites; the 4th raises PT429 and changes
-- nothing; a slot frees after 24 h. (The section-4 rewrite is cleared first.)
delete from public.interest_rewrite where member_id = pg_temp.s5(1);
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.s5(1))::text, false);
do $$
declare i int; e text;
begin
  perform public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":20}]');   -- re-spend: counted
  for i in 1..2 loop
    perform public.set_member_interests(('[{"interest_id":"sports.racket.tennis","points":' || (20 - i)
                                        || '},{"interest_id":"games.board.chess","points":' || i || '}]')::jsonb);
  end loop;
  e := pg_temp.err($q$select public.set_member_interests('[{"interest_id":"sports.racket.squash","points":20}]')$q$);
  if e is distinct from 'PT429 try again later' then raise exception 'FAIL R3: the 4th rewrite in 24 h gave %', e; end if;
  if (select string_agg(interest_id || ':' || points, ',' order by interest_id) from public.my_interests())
     <> 'games.board.chess:2,sports.racket.tennis:18' then
    raise exception 'FAIL R3: the refused rewrite changed the interests';
  end if;
end $$;
reset role;
update public.interest_rewrite set at = now() - interval '25 hours'
 where member_id = pg_temp.s5(1) and at = (select min(at) from public.interest_rewrite where member_id = pg_temp.s5(1));
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.s5(1))::text, false);
select public.set_member_interests('[{"interest_id":"sports.racket.squash","points":20}]');
reset role;
do $$
begin
  if (select string_agg(interest_id, ',') from public.member_interest where member_id = pg_temp.s5(1)) <> 'sports.racket.squash' then
    raise exception 'FAIL R3: a freed rewrite slot was not usable'; end if;
  if (select count(*) from public.interest_rewrite where member_id = pg_temp.s5(1)) <> 4 then
    raise exception 'FAIL R3: % ledger rows (want 4: the re-spend, 2 rewrites, then 1 after the freed slot)',
      (select count(*) from public.interest_rewrite where member_id = pg_temp.s5(1));
  end if;
end $$;

-- 7. Fix round 1 (I-1): the cap cannot be bypassed by falling below completion between saves.
--   M4 toggles its name to 'New Member' (not completed): saves still count, the 4th within 24 h raises PT429.
--   M5 cycles set_sensitive_consent(false/true): the re-spend after each withdrawal counts too.
do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(18.5204, 73.8567, 7);
begin
  for g in 4..5 loop
    mid := pg_temp.s5(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email) values (mid, 'Sens ' || g, 'Sens ' || g, 's' || g || '@example.com')
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;   -- R1: declared (fixture is off)
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), 'in-pune')
    on conflict (member_id) do nothing;
  end loop;
end $$;
do $$
declare i int; e text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s5(4))::text, true);
  set local role authenticated;
  perform public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":20}]');   -- first save: free
  reset role;
  update public.profiles set name = 'New Member' where id = pg_temp.s5(4);
  if public.brivia_member_completed(pg_temp.s5(4)) then raise exception 'FAIL setup: M4 still completed'; end if;
  set local role authenticated;
  for i in 1..3 loop
    perform public.set_member_interests(('[{"interest_id":"sports.racket.tennis","points":' || (20 - i)
                                        || '},{"interest_id":"games.board.chess","points":' || i || '}]')::jsonb);
  end loop;
  e := pg_temp.err($q$select public.set_member_interests('[{"interest_id":"sports.racket.squash","points":20}]')$q$);
  reset role;
  if e is distinct from 'PT429 try again later' then raise exception 'FAIL I-1: name toggle bypasses the cap: 4th save gave %', e; end if;
end $$;
do $$
declare i int; e text;
begin
  update public.profiles set sensitive_consent_at = now() where id = pg_temp.s5(5);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s5(5))::text, true);
  set local role authenticated;
  perform public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":15},
                                        {"interest_id":"wellbeing.spirituality.kirtan","points":5}]');   -- first save: free
  for i in 1..2 loop
    perform public.set_sensitive_consent(false);   -- deletes kirtan: 15 points, not completed
    if i = 1 then
      perform public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":20}]');           -- counted (1)
      perform public.set_sensitive_consent(true);
      perform public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":15},
                                            {"interest_id":"wellbeing.spirituality.kirtan","points":5}]');  -- counted (2)
    else
      perform public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":20}]');           -- counted (3)
      perform public.set_sensitive_consent(true);
      e := pg_temp.err($q$select public.set_member_interests('[{"interest_id":"sports.racket.tennis","points":15},
                                                              {"interest_id":"wellbeing.spirituality.kirtan","points":5}]')$q$);
    end if;
  end loop;
  reset role;
  if e is distinct from 'PT429 try again later' then raise exception 'FAIL I-1: the consent cycle bypasses the cap: 4th save gave %', e; end if;
end $$;

-- Clean up.
select set_config('request.jwt.claims', '', false);
delete from public.profiles where id::text like '5e45e45e-%';
delete from auth.users where id::text like '5e45e45e-%';

select 'orbit-sensitive.test.sql OK' as result;
