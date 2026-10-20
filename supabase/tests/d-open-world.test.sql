-- 0010: the open-test-world switch. While public.brivia_world_switch.open_test_world is true every member is in the
-- test world: real members see seeded test members and testers (and are seen by them); deck_why stays limited to
-- testers and test members. Closing the switch restores 0008 exactly.
-- Ids: 0be0e0e0-e0e0-4e0e-a0e0-e0e0e0e0e0NN in one Bengaluru g7 cell: 01 T1 test, 02 R1 real tester, 03 R2 real, 04 R3 real
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.ow(n int) returns uuid language sql immutable as $$
  select ('0be0e0e0-e0e0-4e0e-a0e0-e0e0e0e0e0' || lpad(n::text, 2, '0'))::uuid $$;

delete from public.cell_density;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9352, 77.6245, 7);
begin
  for g in 1..4 loop
    mid := pg_temp.ow(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, is_test, experience, looking_for)
    values (mid, 'Owx ' || g, 'Owx ' || g, 'owx' || g || '@example.com', g = 1, 'Some years', array['Friends'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now(), created_at = now() - interval '20 days' where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5),
            public.brivia_nearest_place(cell))
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20)
    on conflict do nothing;
  end loop;
  insert into public.brivia_tester (member_id) values (pg_temp.ow(2)) on conflict do nothing;
  update public.brivia_world_switch set open_test_world = false;
end $$;

create or replace function pg_temp.deck_ids(p_viewer uuid) returns uuid[] language plpgsql as $$
declare r uuid[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select coalesce(array_agg(d.id order by d.id), '{}') into r from public.deck_candidates(20) d
   where d.id::text like '0be0e0e0-%';
  reset role;
  return r;
end $$;

create or replace function pg_temp.search_ids(p_viewer uuid) returns uuid[] language plpgsql as $$
declare r uuid[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select coalesce(array_agg(s.id order by s.id), '{}') into r from public.search_members('Owx', 20) s;
  reset role;
  return r;
end $$;

create or replace function pg_temp.why_rows(p_viewer uuid, p_target uuid) returns int language plpgsql as $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select count(*) into n from public.deck_why(p_target);
  reset role;
  return n;
end $$;

-- 1. Closed (default): 0008 semantics.
do $$
begin
  if pg_temp.deck_ids(pg_temp.ow(3)) <> array[pg_temp.ow(4)] then
    raise exception 'FAIL closed: real R2 deck should be only R3, got %', pg_temp.deck_ids(pg_temp.ow(3));
  end if;
  if pg_temp.deck_ids(pg_temp.ow(2)) <> array[pg_temp.ow(1)] then
    raise exception 'FAIL closed: tester R1 deck should be only T1, got %', pg_temp.deck_ids(pg_temp.ow(2));
  end if;
end $$;

-- 2. Open: everyone sees everyone; deck_why still testers and test members only.
update public.brivia_world_switch set open_test_world = true, changed_at = now();
do $$
begin
  if pg_temp.deck_ids(pg_temp.ow(3)) <> array[pg_temp.ow(1), pg_temp.ow(2), pg_temp.ow(4)] then
    raise exception 'FAIL open: real R2 deck should hold T1, R1 and R3, got %', pg_temp.deck_ids(pg_temp.ow(3));
  end if;
  if pg_temp.deck_ids(pg_temp.ow(1)) <> array[pg_temp.ow(2), pg_temp.ow(3), pg_temp.ow(4)] then
    raise exception 'FAIL open: test T1 deck should hold R1, R2 and R3, got %', pg_temp.deck_ids(pg_temp.ow(1));
  end if;
  if not (pg_temp.ow(1) = any(pg_temp.search_ids(pg_temp.ow(4)))) then
    raise exception 'FAIL open: real R3 search should find T1';
  end if;
  if pg_temp.why_rows(pg_temp.ow(3), pg_temp.ow(1)) <> 0 then
    raise exception 'FAIL open: deck_why must return nothing to a real member';
  end if;
  if pg_temp.why_rows(pg_temp.ow(2), pg_temp.ow(1)) <> 1 then
    raise exception 'FAIL open: deck_why should still answer the tester R1';
  end if;
  if public.brivia_in_test_world('00000000-0000-4000-8000-00000000dead') then
    raise exception 'FAIL open: an unknown id must stay outside the test world';
  end if;
end $$;

-- 3. Closed again: back to 0008.
update public.brivia_world_switch set open_test_world = false, changed_at = now();
do $$
begin
  if pg_temp.deck_ids(pg_temp.ow(3)) <> array[pg_temp.ow(4)] then
    raise exception 'FAIL reclosed: real R2 deck should be only R3 again, got %', pg_temp.deck_ids(pg_temp.ow(3));
  end if;
end $$;

-- 4. No client role can read or change the switch or call its helpers.
do $$
begin
  if has_table_privilege('authenticated', 'public.brivia_world_switch', 'select')
     or has_table_privilege('authenticated', 'public.brivia_world_switch', 'update')
     or has_table_privilege('anon', 'public.brivia_world_switch', 'select') then
    raise exception 'FAIL: brivia_world_switch is reachable by a client role';
  end if;
  if has_function_privilege('authenticated', 'public.brivia_test_world_open()', 'execute')
     or has_function_privilege('authenticated', 'public.brivia_tester_world(uuid)', 'execute') then
    raise exception 'FAIL: a world helper is executable by authenticated';
  end if;
end $$;

-- Cleanup: leave no fixture or density row behind.
delete from public.brivia_tester where member_id::text like '0be0e0e0-%';
delete from auth.users where id::text like '0be0e0e0-%';
delete from public.profiles where id::text like '0be0e0e0-%';
delete from public.cell_density;
select 'd-open-world: ALL PASSED' as result;
