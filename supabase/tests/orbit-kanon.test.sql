set brivia.harness_autocomplete = 'off';
-- Iteration 3, Task 5: k-anonymity cell density with 7-night hysteresis (spec §9.1.4).
-- Counts group by the stored member_orbit.home_cell / home_cell_g6 / home_cell_g5 columns (grid parents are not
-- strictly nested, so parents are never re-derived). Members are made completed directly as the owner.
-- Ids: 5a000000-0000-0000-0000-0000000000NN.

-- Cells: X (Pune centroid, 10 eligible), Z (Delhi centroid: 9 eligible + exclusions), and a Mumbai pair X2/Y2 of
-- different g7 cells that share one g6 parent (5 + 5 eligible).
create temp table kanon_cells as
with m as (select public.brivia_grid_cell(19.0760, 72.8777, 7) as c)
select public.brivia_grid_cell(18.5204, 73.8567, 7) as x,
       public.brivia_grid_cell(28.6139, 77.2090, 7) as z,
       m.c as x2,
       (select public.brivia_grid_cell(19.0760 + d.i * (1.0 / 48), 72.8777, 7)
          from generate_series(-3, 3) d(i)
         where public.brivia_grid_cell(19.0760 + d.i * (1.0 / 48), 72.8777, 7) <> m.c
           and public.brivia_grid_parent(public.brivia_grid_cell(19.0760 + d.i * (1.0 / 48), 72.8777, 7), 6)
               = public.brivia_grid_parent(m.c, 6)
         order by abs(d.i) limit 1) as y2
  from m;

do $$
declare c record; g int; mid uuid; cell text; age interval; done boolean; w boolean;
begin
  select * into c from kanon_cells;
  if c.y2 is null then raise exception 'FAIL setup: no sibling g7 cell under one g6 parent'; end if;
  -- 1-10: X eligible; 11-19: Z eligible; 20: Z aged 13 days; 21: Z incomplete (cell, no interests);
  -- 22: Z test world (eligible otherwise); 23-27: X2; 28-32: Y2.
  for g in 1..32 loop
    mid := ('5a000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid;
    cell := case when g <= 10 then c.x when g <= 22 then c.z when g <= 27 then c.x2 else c.y2 end;
    age := case when g = 20 then interval '13 days' else interval '15 days' end;
    done := g <> 21;
    w := g = 22;
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, is_test)
    values (mid, 'Kanon ' || g, 'Kanon ' || g, 'kanon' || g || '@example.com', w) on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;   -- R1: declared (fixture is off)
    update public.profiles set created_at = now() - age where profiles.id = mid;   -- owner update
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), 'in-pune')
    on conflict (member_id) do nothing;
    if done then
      insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20)
      on conflict do nothing;
    end if;
  end loop;
  if (select count(*) from public.profiles where id::text like '5a000000-%' and public.brivia_member_completed(id)) <> 31 then
    raise exception 'FAIL setup: expected 31 completed kanon members';
  end if;
end $$;

-- Clients cannot run the refresh or read the tables.
do $$
declare stmt text; r text; failed boolean;
begin
  foreach r in array array['authenticated', 'anon'] loop
    foreach stmt in array array['select public.refresh_cell_density()', 'select public.refresh_cell_density(current_date)',
                                'select * from public.cell_density', 'select * from public.member_flag',
                                'select public.brivia_cell_ok(''g7:0:0'', false, 10)',
                                'insert into public.member_flag(member_id, reason) values (''5a000000-0000-0000-0000-000000000001'', ''x'')'] loop
      failed := false;
      execute 'set local role ' || r;
      perform set_config('request.jwt.claims', '{"sub":"5a000000-0000-0000-0000-000000000001"}', true);
      begin
        execute stmt;
      exception when insufficient_privilege then failed := true;
      end;
      reset role;
      if not failed then raise exception 'FAIL: % may run %', r, stmt; end if;
    end loop;
  end loop;
end $$;

-- Missing row: false.
do $$
begin
  if public.brivia_cell_ok('g7:1:1', false, 10) or public.brivia_cell_ok('g7:1:1', false, 5) then
    raise exception 'FAIL: a missing cell_density row is ok';
  end if;
end $$;

-- Night 0: counts. X = 10; Z = 9 (13-day, incomplete and other-world members not counted); Z test world = 1;
-- the X2/Y2 pair = 5 each, its shared g6 parent = 10.
do $$
declare c record; n int;
begin
  select * into c from kanon_cells;
  perform public.refresh_cell_density(current_date);
  if (select d.n from public.cell_density d where cell = c.x and not is_test) <> 10 then raise exception 'FAIL: n(X) <> 10'; end if;
  if (select d.n from public.cell_density d where cell = public.brivia_grid_parent(c.x, 6) and not is_test) <> 10 then
    raise exception 'FAIL: n(g6 of X) <> 10'; end if;
  if (select d.n from public.cell_density d where cell = public.brivia_grid_parent(c.x, 5) and not is_test) <> 10 then
    raise exception 'FAIL: n(g5 of X) <> 10'; end if;
  select d.n into n from public.cell_density d where cell = c.z and not is_test;
  if n <> 9 then raise exception 'FAIL: n(Z) = %, expected 9 (13-day, incomplete and other-world excluded)', n; end if;
  if (select d.n from public.cell_density d where cell = c.z and is_test) <> 1 then raise exception 'FAIL: n(Z, test world) <> 1'; end if;
  if (select d.n from public.cell_density d where cell = c.x2 and not is_test) <> 5
     or (select d.n from public.cell_density d where cell = c.y2 and not is_test) <> 5 then
    raise exception 'FAIL: n(X2) / n(Y2) <> 5'; end if;
  if (select d.n from public.cell_density d where cell = public.brivia_grid_parent(c.x2, 6) and not is_test) <> 10 then
    raise exception 'FAIL: n(g6 of X2/Y2) <> 10'; end if;
  if exists (select 1 from public.cell_density where ok10 or ok5) then raise exception 'FAIL: ok after one night'; end if;
  if (select streak10 from public.cell_density where cell = c.x and not is_test) <> 1
     or (select streak5 from public.cell_density where cell = c.x2 and not is_test) <> 1
     or (select streak10 from public.cell_density where cell = c.x2 and not is_test) <> 0 then
    raise exception 'FAIL: streaks after night 0'; end if;
  if exists (select 1 from public.cell_density where as_of <> current_date) then raise exception 'FAIL: as_of'; end if;
end $$;

-- Nights 1-5 (6 refreshes in all): still not ok. Night 6 (the 7th): ok10 for X and the X2/Y2 g6 parent, ok5 for X2.
do $$
declare c record; i int;
begin
  select * into c from kanon_cells;
  for i in 1..5 loop
    perform public.refresh_cell_density(current_date + i);
    if public.brivia_cell_ok(c.x, false, 10) or public.brivia_cell_ok(c.x2, false, 5) then
      raise exception 'FAIL: ok after % refreshes', i + 1;
    end if;
  end loop;
  if (select streak10 from public.cell_density where cell = c.x and not is_test) <> 6 then raise exception 'FAIL: streak10(X) <> 6'; end if;
  perform public.refresh_cell_density(current_date + 6);
  if not public.brivia_cell_ok(c.x, false, 10) then raise exception 'FAIL: X not ok10 after 7 refreshes'; end if;
  if not public.brivia_cell_ok(c.x, false, 5) then raise exception 'FAIL: X not ok5 after 7 refreshes'; end if;
  if not public.brivia_cell_ok(public.brivia_grid_parent(c.x, 6), false, 10) then raise exception 'FAIL: g6 of X not ok10'; end if;
  -- a g6 parent reaches k while its g7 children do not
  if not public.brivia_cell_ok(public.brivia_grid_parent(c.x2, 6), false, 10) then raise exception 'FAIL: g6 of X2/Y2 not ok10'; end if;
  if public.brivia_cell_ok(c.x2, false, 10) or public.brivia_cell_ok(c.y2, false, 10) then raise exception 'FAIL: g7 X2/Y2 ok10 with n = 5'; end if;
  if not public.brivia_cell_ok(c.x2, false, 5) or not public.brivia_cell_ok(c.y2, false, 5) then raise exception 'FAIL: X2/Y2 not ok5'; end if;
  -- the other world is counted separately: Z in the test world has 1 member
  if public.brivia_cell_ok(c.z, true, 5) then raise exception 'FAIL: Z test world ok5 with n = 1'; end if;
  -- the world flag is part of the key: the real-world X row says nothing about the test world
  if public.brivia_cell_ok(c.x, true, 10) then raise exception 'FAIL: X test world ok10'; end if;
  -- other k values are never ok
  if public.brivia_cell_ok(c.x, false, 3) or public.brivia_cell_ok(c.x, false, null) then raise exception 'FAIL: k other than 5/10 ok'; end if;
end $$;

-- The same-day re-run (and an older date) changes nothing, even after the population changed: a flag, and an aged,
-- completed member (11, in Z) moving to a brand-new cell (London), which must not insert any row (I1).
create temp table kanon_snapshot as select * from public.cell_density;
insert into public.member_flag (member_id, reason) values ('5a000000-0000-0000-0000-000000000001', 'reported');
update public.member_orbit o
   set home_cell = x.c, home_cell_g6 = public.brivia_grid_parent(x.c, 6), home_cell_g5 = public.brivia_grid_parent(x.c, 5)
  from (select public.brivia_grid_cell(51.5074, -0.1278, 7) as c) x
 where o.member_id = '5a000000-0000-0000-0000-000000000011';
do $$
begin
  perform public.refresh_cell_density(current_date + 6);
  perform public.refresh_cell_density(current_date + 2);
  if exists (select * from public.cell_density except select * from kanon_snapshot)
     or exists (select * from kanon_snapshot except select * from public.cell_density) then
    raise exception 'FAIL: a same-day or older refresh changed cell_density';
  end if;
end $$;

-- One flagged member drops X to 9 at the next refresh: ok10 is false at once, streak10 resets; ok5 stays.
do $$
declare c record; d record;
begin
  select * into c from kanon_cells;
  perform public.refresh_cell_density(current_date + 7);
  select * into d from public.cell_density where cell = c.x and not is_test;
  if d.n <> 9 or d.ok10 or d.streak10 <> 0 then raise exception 'FAIL: after the flag X = %', d; end if;
  if not d.ok5 or d.streak5 <> 8 then raise exception 'FAIL: X ok5 lost after the flag: %', d; end if;
  if public.brivia_cell_ok(c.x, false, 10) then raise exception 'FAIL: brivia_cell_ok(X, 10) after the flag'; end if;
  -- back to 10 needs 7 more refreshes
  delete from public.member_flag where member_id = '5a000000-0000-0000-0000-000000000001';
  perform public.refresh_cell_density(current_date + 8);
  if public.brivia_cell_ok(c.x, false, 10) then raise exception 'FAIL: ok10 came back after one night'; end if;
end $$;

-- A cell whose members all leave is refreshed to n = 0.
do $$
declare c record; d record;
begin
  select * into c from kanon_cells;
  delete from public.member_orbit where member_id in (select ('5a000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid
                                                         from generate_series(23, 27) g);
  perform public.refresh_cell_density(current_date + 9);
  select * into d from public.cell_density where cell = c.x2 and not is_test;
  -- M2: a row with n = 0 and both streaks 0 is deleted, not kept
  if found then raise exception 'FAIL: emptied X2 row kept: %', d; end if;
  if exists (select 1 from public.cell_density where n = 0 and streak10 = 0 and streak5 = 0) then
    raise exception 'FAIL: rows with n = 0 and no streak kept';
  end if;
  -- the shared g6 parent still holds Y2's 5 members
  if (select d2.n from public.cell_density d2 where cell = public.brivia_grid_parent(c.y2, 6) and not is_test) <> 5 then
    raise exception 'FAIL: g6 of Y2 after X2 emptied';
  end if;
end $$;

-- M1: a missed night restarts the streak. X has streak10 = 2 after nights 8 and 9; night 10 is skipped, so night 11
-- restarts at 1 (n = 10 >= k), not 3.
do $$
declare c record; d record;
begin
  select * into c from kanon_cells;
  select * into d from public.cell_density where cell = c.x and not is_test;
  if d.streak10 <> 2 or d.as_of <> current_date + 9 then raise exception 'FAIL M1 setup: X = %', d; end if;
  perform public.refresh_cell_density(current_date + 11);
  select * into d from public.cell_density where cell = c.x and not is_test;
  if d.n <> 10 or d.streak10 <> 1 or d.streak5 <> 1 or d.ok10 or d.ok5 then
    raise exception 'FAIL M1: a missed night did not restart the streak: %', d;
  end if;
  -- a row below k after a gap restarts at 0
  if exists (select 1 from public.cell_density where n < 5 and streak5 <> 0) then raise exception 'FAIL M1: streak5 below k'; end if;
end $$;

-- Clean up (later suites compute expected decks from every profile).
delete from public.cell_density;
delete from public.profiles where id::text like '5a000000-%';
delete from auth.users where id::text like '5a000000-%';

select 'orbit-kanon.test.sql OK' as result;
