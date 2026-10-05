set brivia.harness_autocomplete = 'off';
-- Iteration 3, Task 4: completion = a name, plus 1-12 interests summing to 20 points, plus a cell (D-030, spec §7).
-- The legacy city column plays no part. Every member-facing visibility check goes through brivia_visible_to.
-- The harness autocomplete fixture is switched off above, so this file sees the real rule.
-- list_members is executable by no client role since D-038 (R4). Its visibility semantics are still tested, through
-- this owner wrapper (security definer; auth.uid() still reads the caller's claims).
create or replace function pg_temp.list_members(p_limit int default 20, p_after timestamptz default null,
                                                p_after_id uuid default null)
returns setof public.public_profile_card language sql security definer set search_path = public as $w$
  select * from public.list_members(p_limit, p_after, p_after_id) $w$;
insert into auth.users(id) values
  ('c0c0c0c0-0000-0000-0000-0000000000c1'), ('c0c0c0c0-0000-0000-0000-0000000000c2'),
  ('c0c0c0c0-0000-0000-0000-0000000000c3'), ('c0c0c0c0-0000-0000-0000-0000000000c4'),
  ('c0c0c0c0-0000-0000-0000-0000000000c5')
  on conflict do nothing;
-- c1 viewer, c2 newcomer (has a legacy city, which must not count), c3 the block partner, c5 named 'New Member'.
insert into public.profiles (id, name, full_name, email, city)
values ('c0c0c0c0-0000-0000-0000-0000000000c1', 'Cee One', 'Cee One', 'c1@example.com', null),
       ('c0c0c0c0-0000-0000-0000-0000000000c2', 'Cee Two', 'Cee Two', 'c2@example.com', 'Pune'),
       ('c0c0c0c0-0000-0000-0000-0000000000c3', 'Cee Three', 'Cee Three', 'c3@example.com', null),
       ('c0c0c0c0-0000-0000-0000-0000000000c5', 'New Member', 'New Member', 'c5@example.com', 'Pune')
on conflict (id) do nothing;
-- c4 is in the test world (owner insert sets is_test).
insert into public.profiles (id, name, full_name, email, is_test)
values ('c0c0c0c0-0000-0000-0000-0000000000c4', 'Cee Four', 'Cee Four', 'c4@example.com', true)
on conflict (id) do nothing;
update public.profiles set adult_declared_at = now() where id::text like 'c0c0c0c0-%';   -- R1: declared (fixture is off)

-- No autocomplete here: a name and a city alone give no interests and no cell.
do $$
begin
  if exists (select 1 from public.member_interest where member_id::text like 'c0c0c0c0-%')
     or exists (select 1 from public.member_orbit where member_id::text like 'c0c0c0c0-%') then
    raise exception 'FAIL: the harness autocomplete ran although it is off';
  end if;
end $$;

-- c1, c3, c4 and c5 complete onboarding through the member RPCs (interests, then a city).
do $$
declare m text;
begin
  foreach m in array array['c0c0c0c0-0000-0000-0000-0000000000c1', 'c0c0c0c0-0000-0000-0000-0000000000c3',
                           'c0c0c0c0-0000-0000-0000-0000000000c4', 'c0c0c0c0-0000-0000-0000-0000000000c5'] loop
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true);
    perform public.set_member_interests('[{"interest_id":"sports.racket.badminton","points":12},
                                          {"interest_id":"games.board.chess","points":8}]'::jsonb);
    perform public.set_home_city('in-pune');
    reset role;
  end loop;
end $$;

-- The internal helpers are not callable by clients.
do $$
declare stmt text; failed boolean;
begin
  foreach stmt in array array[
    'select public.brivia_member_completed(''c0c0c0c0-0000-0000-0000-0000000000c1'')',
    'select public.brivia_visible_to(''c0c0c0c0-0000-0000-0000-0000000000c1'', ''c0c0c0c0-0000-0000-0000-0000000000c3'')'
  ] loop
    failed := false;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub":"c0c0c0c0-0000-0000-0000-0000000000c1"}', true);
    begin
      execute stmt;
    exception when insufficient_privilege then failed := true;
    end;
    reset role;
    if not failed then raise exception 'FAIL: a client may run %', stmt; end if;
  end loop;
  failed := false;
  set local role anon;
  begin
    perform * from public.my_onboarding_status();
  exception when insufficient_privilege then failed := true;
  end;
  reset role;
  if not failed then raise exception 'FAIL: anon may call my_onboarding_status'; end if;
end $$;

-- Stage 0: c2 has a name (and a legacy city) but no interests and no cell.
do $$
declare v uuid := 'c0c0c0c0-0000-0000-0000-0000000000c1'; n uuid := 'c0c0c0c0-0000-0000-0000-0000000000c2';
        s record; k int;
begin
  if not public.brivia_member_completed(v) then raise exception 'FAIL: positive control: c1 is not completed'; end if;
  if public.brivia_member_completed(n) then raise exception 'FAIL: name + city alone counts as completed'; end if;
  if public.brivia_visible_to(v, n) or public.brivia_visible_to(n, v) then raise exception 'FAIL: stage 0 c2 visible'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  select count(*) into k from pg_temp.list_members(20) where id = n; if k <> 0 then raise exception 'FAIL: stage 0 list_members shows c2'; end if;
  select count(*) into k from public.search_members('Cee Two', 20); if k <> 0 then raise exception 'FAIL: stage 0 search shows c2'; end if;
  select count(*) into k from public.get_candidates(array[n]); if k <> 0 then raise exception 'FAIL: stage 0 get_candidates shows c2'; end if;
  if public.brivia_can_see_author(n) then raise exception 'FAIL: stage 0 c2 posts visible'; end if;
  -- positive control: c3 is visible to c1
  select count(*) into k from pg_temp.list_members(20) where id = 'c0c0c0c0-0000-0000-0000-0000000000c3';
  if k <> 1 then raise exception 'FAIL: positive control: c1 does not list c3'; end if;
  -- c2 as the viewer gets nothing
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  select count(*) into k from pg_temp.list_members(20); if k <> 0 then raise exception 'FAIL: stage 0 c2 lists % rows', k; end if;
  select count(*) into k from public.search_members('Cee', 20); if k <> 0 then raise exception 'FAIL: stage 0 c2 searches % rows', k; end if;
  select count(*) into k from public.get_candidates(array[v]); if k <> 0 then raise exception 'FAIL: stage 0 c2 gets % cards', k; end if;
  if public.brivia_can_see_author(v) then raise exception 'FAIL: stage 0 c2 sees c1 posts'; end if;
  if not public.brivia_can_see_author(n) then raise exception 'FAIL: own posts must stay visible'; end if;
  select * into s from public.my_onboarding_status();
  if s.interests <> 0 or s.points <> 0 or s.has_cell or s.place_label is not null or s.completed then
    raise exception 'FAIL: stage 0 status %', s;
  end if;
  reset role;
end $$;

-- Stage 1: c2 spends all 20 points (19 is impossible: set_member_interests refuses it) but has no cell yet.
do $$
declare v uuid := 'c0c0c0c0-0000-0000-0000-0000000000c1'; n uuid := 'c0c0c0c0-0000-0000-0000-0000000000c2';
        s record; k int; st text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  begin
    perform public.set_member_interests('[{"interest_id":"sports.racket.badminton","points":19}]'::jsonb);
  exception when others then st := sqlstate;
  end;
  if st is distinct from '22023' then raise exception 'FAIL: 19 points accepted (%)', st; end if;
  perform public.set_member_interests('[{"interest_id":"sports.racket.badminton","points":10},
                                        {"interest_id":"games.board.chess","points":6},
                                        {"interest_id":"food.drinks.coffee","points":4}]'::jsonb);
  select * into s from public.my_onboarding_status();
  if s.interests <> 3 or s.points <> 20 or s.has_cell or s.place_label is not null or s.completed then
    raise exception 'FAIL: stage 1 status %', s;
  end if;
  select count(*) into k from pg_temp.list_members(20); if k <> 0 then raise exception 'FAIL: stage 1 c2 lists % rows', k; end if;
  select count(*) into k from public.search_members('Cee', 20); if k <> 0 then raise exception 'FAIL: stage 1 c2 searches % rows', k; end if;
  select count(*) into k from public.get_candidates(array[v]); if k <> 0 then raise exception 'FAIL: stage 1 c2 gets % cards', k; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  select count(*) into k from pg_temp.list_members(20) where id = n; if k <> 0 then raise exception 'FAIL: stage 1 c1 lists c2'; end if;
  select count(*) into k from public.search_members('Cee Two', 20); if k <> 0 then raise exception 'FAIL: stage 1 search shows c2'; end if;
  select count(*) into k from public.get_candidates(array[n]); if k <> 0 then raise exception 'FAIL: stage 1 get_candidates shows c2'; end if;
  reset role;
  if public.brivia_member_completed(n) or public.brivia_visible_to(v, n) then raise exception 'FAIL: stage 1 c2 completed'; end if;
end $$;

-- Stage 2: c2 sets a cell (Pick my city). Now completed and visible both ways.
do $$
declare v uuid := 'c0c0c0c0-0000-0000-0000-0000000000c1'; n uuid := 'c0c0c0c0-0000-0000-0000-0000000000c2';
        s record; k int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  perform public.set_home_city('in-mumbai');
  select * into s from public.my_onboarding_status();
  if s.interests <> 3 or s.points <> 20 or not s.has_cell or s.place_label is distinct from 'Mumbai' or not s.completed then
    raise exception 'FAIL: stage 2 status %', s;
  end if;
  if (select count(*) from public.my_onboarding_status()) <> 1 then raise exception 'FAIL: status is not one row'; end if;
  select count(*) into k from pg_temp.list_members(20) where id = v; if k <> 1 then raise exception 'FAIL: stage 2 c2 does not list c1'; end if;
  select count(*) into k from public.get_candidates(array[v]); if k <> 1 then raise exception 'FAIL: stage 2 c2 gets % cards', k; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  select count(*) into k from pg_temp.list_members(20) where id = n; if k <> 1 then raise exception 'FAIL: stage 2 c1 does not list c2'; end if;
  select count(*) into k from public.search_members('Cee Two', 20); if k <> 1 then raise exception 'FAIL: stage 2 search misses c2'; end if;
  select count(*) into k from public.get_candidates(array[n]); if k <> 1 then raise exception 'FAIL: stage 2 get_candidates misses c2'; end if;
  if not public.brivia_can_see_author(n) then raise exception 'FAIL: stage 2 c2 posts hidden'; end if;
  reset role;
  if not public.brivia_member_completed(n) or not public.brivia_visible_to(v, n) or not public.brivia_visible_to(n, v) then
    raise exception 'FAIL: stage 2 c2 not completed/visible';
  end if;
end $$;

-- The legacy city is not part of completion: clearing it changes nothing.
update public.profiles set city = null where id = 'c0c0c0c0-0000-0000-0000-0000000000c2';
do $$
begin
  if not public.brivia_member_completed('c0c0c0c0-0000-0000-0000-0000000000c2') then
    raise exception 'FAIL: clearing the legacy city un-completed c2';
  end if;
end $$;

-- A name is still required: 'New Member' (c5) with interests and a cell is not completed; neither is a blank name.
do $$
declare v uuid := 'c0c0c0c0-0000-0000-0000-0000000000c1'; m uuid := 'c0c0c0c0-0000-0000-0000-0000000000c5'; s record;
begin
  if public.brivia_member_completed(m) or public.brivia_visible_to(v, m) then raise exception 'FAIL: New Member is completed'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true);
  select * into s from public.my_onboarding_status();
  if s.interests <> 2 or s.points <> 20 or not s.has_cell or s.completed then raise exception 'FAIL: New Member status %', s; end if;
  reset role;
  update public.profiles set name = '  ' where id = 'c0c0c0c0-0000-0000-0000-0000000000c2';
  if public.brivia_member_completed('c0c0c0c0-0000-0000-0000-0000000000c2') then raise exception 'FAIL: blank name is completed'; end if;
  update public.profiles set name = 'Cee Two' where id = 'c0c0c0c0-0000-0000-0000-0000000000c2';
end $$;

-- Interests that no longer sum to 20 (an owner edit; clients cannot do this) un-complete the member.
do $$
declare n uuid := 'c0c0c0c0-0000-0000-0000-0000000000c2';
begin
  update public.member_interest set points = points - 1 where member_id = n and interest_id = 'food.drinks.coffee';
  if public.brivia_member_completed(n) then raise exception 'FAIL: 19 stored points count as completed'; end if;
  update public.member_interest set points = points + 1 where member_id = n and interest_id = 'food.drinks.coffee';
  if not public.brivia_member_completed(n) then raise exception 'FAIL: restoring 20 points did not complete c2'; end if;
end $$;

-- Self, blocked pair and cross-world pair stay invisible through brivia_visible_to.
do $$
declare v uuid := 'c0c0c0c0-0000-0000-0000-0000000000c1'; b uuid := 'c0c0c0c0-0000-0000-0000-0000000000c3';
        w uuid := 'c0c0c0c0-0000-0000-0000-0000000000c4'; k int;
begin
  if public.brivia_visible_to(v, v) then raise exception 'FAIL: a member is visible to themself'; end if;
  if public.brivia_visible_to(v, null) or public.brivia_visible_to(null, v) then raise exception 'FAIL: null visible'; end if;
  if not public.brivia_member_completed(w) then raise exception 'FAIL: positive control: c4 is not completed'; end if;
  if public.brivia_visible_to(v, w) or public.brivia_visible_to(w, v) then raise exception 'FAIL: cross-world pair visible'; end if;
  if not public.brivia_visible_to(v, b) then raise exception 'FAIL: positive control: c3 not visible before the block'; end if;
  -- each direction alone hides the pair both ways
  insert into public.brivia_blocks (blocker_id, blocked_id) values (v, b);
  if public.brivia_visible_to(v, b) or public.brivia_visible_to(b, v) then raise exception 'FAIL: (v blocks b) pair visible'; end if;
  delete from public.brivia_blocks where blocker_id = v and blocked_id = b;
  if not public.brivia_visible_to(v, b) or not public.brivia_visible_to(b, v) then raise exception 'FAIL: unblock did not restore'; end if;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (b, v);
  if public.brivia_visible_to(v, b) or public.brivia_visible_to(b, v) then raise exception 'FAIL: (b blocks v) pair visible'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  select count(*) into k from pg_temp.list_members(20) where id in (b, w); if k <> 0 then raise exception 'FAIL: c1 lists blocked/cross-world'; end if;
  select count(*) into k from public.get_candidates(array[b, w]); if k <> 0 then raise exception 'FAIL: c1 gets blocked/cross-world cards'; end if;
  select count(*) into k from public.search_members('Cee', 20) where id in (b, w); if k <> 0 then raise exception 'FAIL: c1 searches blocked/cross-world'; end if;
  if public.brivia_can_see_author(b) or public.brivia_can_see_author(w) then raise exception 'FAIL: c1 sees blocked/cross-world posts'; end if;
  reset role;
end $$;

-- Clean up: later suites (trust.test.sql) compute their expected decks from every profile in the database.
delete from public.profiles where id::text like 'c0c0c0c0-%';
delete from auth.users where id::text like 'c0c0c0c0-%';

select 'orbit-completion.test.sql OK' as result;
