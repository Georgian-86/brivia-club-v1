-- Iteration 3, Task 1: server-side grid cells (D-028, spec §4.1 / §9.1.4) and places.
-- Coordinates in this file are test fixtures for pure functions; none of them is ever stored.

-- Pune snaps to the documented level-7 cell (ncols 16386 on that row).
do $$
begin
  if public.brivia_grid_cell(18.5204, 73.8567) <> 'g7:5208:11554' then
    raise exception 'FAIL: Pune cell = %', public.brivia_grid_cell(18.5204, 73.8567);
  end if;
  if public.brivia_grid_cell(18.5204, 73.8567, 7) <> 'g7:5208:11554' then
    raise exception 'FAIL: explicit level 7 differs from the default';
  end if;
end $$;

-- Two points about 1 km apart in one city: same or adjacent cell, ring 0.
do $$
declare a text := public.brivia_grid_cell(18.5204, 73.8567);
        b text := public.brivia_grid_cell(18.5204 + 0.009, 73.8567);   -- ~1 km north
        c text := public.brivia_grid_cell(18.5204, 73.8567 + 0.0095);  -- ~1 km east
        ra int; rb int; ca int; cb int;
begin
  ra := split_part(a, ':', 2)::int; ca := split_part(a, ':', 3)::int;
  rb := split_part(b, ':', 2)::int; cb := split_part(b, ':', 3)::int;
  if abs(ra - rb) > 1 or abs(ca - cb) > 1 then raise exception 'FAIL: 1 km north is not adjacent: % vs %', a, b; end if;
  rb := split_part(c, ':', 2)::int; cb := split_part(c, ':', 3)::int;
  if abs(ra - rb) > 1 or abs(ca - cb) > 1 then raise exception 'FAIL: 1 km east is not adjacent: % vs %', a, c; end if;
  if public.brivia_ring(public.brivia_cell_km(a, b)) <> 0 then raise exception 'FAIL: 1 km north is not ring 0'; end if;
  if public.brivia_ring(public.brivia_cell_km(a, c)) <> 0 then raise exception 'FAIL: 1 km east is not ring 0'; end if;
  if public.brivia_cell_km(a, a) <> 0 then raise exception 'FAIL: equal cells are not 0 km apart'; end if;
end $$;

-- Rings between cities.
do $$
declare pune text := public.brivia_grid_cell(18.5204, 73.8567);
        mumbai text := public.brivia_grid_cell(19.0760, 72.8777);
        delhi text := public.brivia_grid_cell(28.6139, 77.2090);
        london text := public.brivia_grid_cell(51.5074, -0.1278);
begin
  if public.brivia_ring(public.brivia_cell_km(pune, mumbai)) <> 3 then raise exception 'FAIL: Pune-Mumbai ring'; end if;
  if public.brivia_ring(public.brivia_cell_km(pune, delhi)) <> 4 then raise exception 'FAIL: Pune-Delhi ring'; end if;
  if public.brivia_ring(public.brivia_cell_km(pune, london)) <> 5 then raise exception 'FAIL: Pune-London ring'; end if;
  if public.brivia_cell_km(pune, mumbai) <> public.brivia_cell_km(mumbai, pune) then raise exception 'FAIL: km not symmetric'; end if;
end $$;

-- Ring limits 3 / 15 / 60 / 350 / 2500 km (inclusive upper bounds).
do $$
begin
  if public.brivia_ring(0) <> 0 or public.brivia_ring(3) <> 0 or public.brivia_ring(3.01) <> 1
     or public.brivia_ring(15) <> 1 or public.brivia_ring(15.01) <> 2 or public.brivia_ring(60) <> 2
     or public.brivia_ring(60.01) <> 3 or public.brivia_ring(350) <> 3 or public.brivia_ring(350.01) <> 4
     or public.brivia_ring(2500) <> 4 or public.brivia_ring(2500.01) <> 5 or public.brivia_ring(20000) <> 5 then
    raise exception 'FAIL: ring limits';
  end if;
end $$;

-- Grid edges (Review Focus 2): antimeridian is ring 0; poles and lng ±180 give a cell.
do $$
declare a text := public.brivia_grid_cell(0, 179.99);
        b text := public.brivia_grid_cell(0, -179.99);
        e text;
begin
  if public.brivia_ring(public.brivia_cell_km(a, b)) <> 0 then
    raise exception 'FAIL: antimeridian pair is ring %', public.brivia_ring(public.brivia_cell_km(a, b));
  end if;
  foreach e in array array[public.brivia_grid_cell(90, 0), public.brivia_grid_cell(-90, 0),
                           public.brivia_grid_cell(0, 180), public.brivia_grid_cell(0, -180),
                           public.brivia_grid_cell(90, 180), public.brivia_grid_cell(-90, -180),
                           public.brivia_grid_cell(90, 0, 5), public.brivia_grid_cell(-90, 0, 6)] loop
    if e is null or e !~ '^g[5-7]:\d+:\d+$' then raise exception 'FAIL: edge cell %', e; end if;
    perform * from public.brivia_grid_centroid(e);
  end loop;
  if public.brivia_grid_cell(0, 180) <> public.brivia_grid_cell(0, -180) then
    raise exception 'FAIL: lng 180 and -180 differ';
  end if;
end $$;

-- Invalid input raises 22023 and the message carries no digit of the input.
do $$
declare args text; msg text; st text;
begin
  foreach args in array array['91, 0', '-91, 0', '''NaN''::float8, 0', '0, ''Infinity''::float8',
                              '0, ''-Infinity''::float8', '0, 181', 'null, 0', '18.5, 73.8, 8', '18.5, 73.8, 4'] loop
    st := null;
    begin
      execute 'select public.brivia_grid_cell(' || args || ')';
    exception when others then st := sqlstate; msg := sqlerrm;
    end;
    if st is distinct from '22023' then raise exception 'FAIL: (%) gave sqlstate %', args, st; end if;
    if msg <> 'invalid location' or msg ~ '[0-9]' then raise exception 'FAIL: (%) message %', args, msg; end if;
  end loop;
  foreach args in array array['g8:1:1', 'g7:9999:0', 'g7:5208:99999', 'x', 'g7:-1:0', 'g7:1', ''] loop
    st := null;
    begin
      perform * from public.brivia_grid_centroid(args);
    exception when others then st := sqlstate; msg := sqlerrm;
    end;
    if st is distinct from '22023' or msg <> 'invalid cell' then raise exception 'FAIL: centroid(%) gave % %', args, st, msg; end if;
  end loop;
end $$;

-- Parents are the snap of the child's centroid at the coarser level.
do $$
declare p6 text := public.brivia_grid_parent('g7:5208:11554', 6);
        p5 text := public.brivia_grid_parent('g7:5208:11554', 5);
begin
  if p6 not like 'g6:%' then raise exception 'FAIL: parent level 6 = %', p6; end if;
  if p5 not like 'g5:%' then raise exception 'FAIL: parent level 5 = %', p5; end if;
  -- Normative definition (D-028): parent = snap of the child's centroid. The hierarchy is only approximately
  -- nested, like H3, so a grandparent through g6 need not equal the direct g5 parent.
  if p6 <> (select public.brivia_grid_cell(g.lat, g.lng, 6) from public.brivia_grid_centroid('g7:5208:11554') g) then
    raise exception 'FAIL: g6 parent is not the snap of the g7 centroid';
  end if;
  if public.brivia_grid_parent('g7:5208:11554', 7) <> 'g7:5208:11554' then raise exception 'FAIL: same-level parent'; end if;
  if public.brivia_cell_km('g7:5208:11554', p6) > 5 then raise exception 'FAIL: g6 parent centroid too far'; end if;
  begin
    perform public.brivia_grid_parent(p5, 6);
    raise exception 'FAIL: a finer level was accepted as a parent';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- Centroid of the snapped cell is within 1.7 km of the point (100 pseudo-random points, |lat| <= 85).
do $$
declare i int; la float8; lo float8; c text; km float8; worst float8 := 0;
begin
  perform setseed(0.4242);
  for i in 1..100 loop
    la := -85 + random() * 170; lo := -180 + random() * 360;
    c := public.brivia_grid_cell(la, lo);
    select 2 * 6371.0088 * asin(sqrt(power(sin(radians(g.lat - la) / 2), 2)
             + cos(radians(la)) * cos(radians(g.lat)) * power(sin(radians(g.lng - lo) / 2), 2)))
      into km from public.brivia_grid_centroid(c) g;
    worst := greatest(worst, km);
  end loop;
  if worst > 1.7 then raise exception 'FAIL: worst centroid distance % km', worst; end if;
end $$;

-- The grid helpers are internal: no client role may execute them.
do $$
declare f text;
begin
  foreach f in array array['public.brivia_grid_cell(double precision, double precision, integer)',
                           'public.brivia_grid_centroid(text)', 'public.brivia_grid_parent(text, integer)',
                           'public.brivia_cell_km(text, text)', 'public.brivia_ring(double precision)',
                           'public.brivia_nearest_place(text)'] loop
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'FAIL: client can execute %', f;
    end if;
  end loop;
  if (select provolatile from pg_proc where oid = 'public.brivia_grid_cell(double precision, double precision, integer)'::regprocedure) <> 'i' then
    raise exception 'FAIL: brivia_grid_cell is not immutable';
  end if;
end $$;

-- Places: names are public, centroids are not.
do $$
declare n int;
begin
  select count(*) into n from public.place where country = 'India';
  if n < 55 then raise exception 'FAIL: only % Indian places', n; end if;
  select count(*) into n from public.place where country <> 'India';
  if n < 12 then raise exception 'FAIL: only % world places', n; end if;
  select count(*) into n from public.place where is_launch;
  if n <> 4 then raise exception 'FAIL: % launch cities', n; end if;
  if (select string_agg(name, ',' order by name) from public.place where is_launch) <> 'Bengaluru,Delhi,Mumbai,Pune' then
    raise exception 'FAIL: launch cities are %', (select string_agg(name, ',' order by name) from public.place where is_launch);
  end if;
  if public.brivia_nearest_place(public.brivia_grid_cell(18.5204, 73.8567)) <> 'in-pune' then
    raise exception 'FAIL: nearest place to Pune = %', public.brivia_nearest_place(public.brivia_grid_cell(18.5204, 73.8567));
  end if;
  if public.brivia_nearest_place(public.brivia_grid_cell(51.5, -0.12)) <> 'gb-london' then
    raise exception 'FAIL: nearest place to London';
  end if;
end $$;

begin;
set local role anon;
do $$
declare n int;
begin
  begin
    perform lat from public.place;
    raise exception 'FAIL: anon can select place.lat';
  exception when insufficient_privilege then null;
  end;
  begin
    perform lng from public.place;
    raise exception 'FAIL: anon can select place.lng';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from (select id, name, region, country, is_launch from public.place) s;
  if n < 67 then raise exception 'FAIL: anon sees % places', n; end if;
  begin
    insert into public.place(id, name, region, country, lat, lng) values ('x', 'x', 'x', 'x', 0, 0);
    raise exception 'FAIL: anon can insert a place';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1a1a1a1-0000-0000-0000-0000000000a1"}';
do $$
begin
  begin
    perform lat from public.place;
    raise exception 'FAIL: authenticated can select place.lat';
  exception when insufficient_privilege then null;
  end;
  perform id, name from public.place;
  begin
    perform public.brivia_grid_cell(18.5, 73.8);
    raise exception 'FAIL: authenticated can call brivia_grid_cell';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- No public table or view other than place has a coordinate-shaped column.
do $$
declare bad text;
begin
  select string_agg(table_name || '.' || column_name, ', ') into bad
    from information_schema.columns
   where table_schema = 'public' and table_name <> 'place'
     and column_name ~* '(^|_)(lat|lng|lon|latitude|longitude)($|_)';
  if bad is not null then raise exception 'FAIL: coordinate-shaped columns: %', bad; end if;
end $$;

-- =============================================================================================
-- Task 3: set_home_location / set_home_city, the 3-per-24 h cap, no coordinates stored or logged.
-- =============================================================================================
insert into auth.users(id) values
  ('d4d4d4d4-0000-0000-0000-0000000000d4'), ('e4e4e4e4-0000-0000-0000-0000000000e4'),
  ('f4f4f4f4-0000-0000-0000-0000000000f4')
  on conflict do nothing;
insert into public.profiles (id, name, full_name, email)
values ('d4d4d4d4-0000-0000-0000-0000000000d4','D4','D4','d4@example.com'),
       ('f4f4f4f4-0000-0000-0000-0000000000f4','F4','F4','f4@example.com')
on conflict (id) do nothing;
-- e4 has an auth user but no profile row.

-- A member sets a location and gets back a place name; member_orbit holds g7/g6/g5 cells.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d4d4d4d4-0000-0000-0000-0000000000d4"}';
do $$
declare r text;
begin
  r := public.set_home_location(18.5204, 73.8567);
  if r is distinct from 'Pune' then raise exception 'FAIL: set_home_location returned %', r; end if;
end $$;
commit;
do $$
declare o record;
begin
  select * into o from public.member_orbit where member_id = 'd4d4d4d4-0000-0000-0000-0000000000d4';
  if o.home_cell is distinct from 'g7:5208:11554' then raise exception 'FAIL: home_cell %', o.home_cell; end if;
  if o.home_cell_g6 not like 'g6:%' or o.home_cell_g5 not like 'g5:%' then raise exception 'FAIL: parent cells % %', o.home_cell_g6, o.home_cell_g5; end if;
  if o.home_cell_g6 <> public.brivia_grid_parent(o.home_cell, 6) or o.home_cell_g5 <> public.brivia_grid_parent(o.home_cell, 5) then
    raise exception 'FAIL: parent cells are not the grid parents';
  end if;
  if o.place_id <> 'in-pune' or o.cell_scheme <> 'grid1' or o.home_set_at is null then raise exception 'FAIL: orbit row %', o; end if;
  if (select count(*) from public.location_change where member_id = 'd4d4d4d4-0000-0000-0000-0000000000d4') <> 1 then
    raise exception 'FAIL: first set did not count as a change';
  end if;
end $$;

-- Invalid input raises 22023 without consuming a change; an unknown place raises 22023 'invalid place'.
do $$
declare args text; st text; msg text;
begin
  foreach args in array array['91, 0', '''NaN''::float8, 0', '0, ''Infinity''::float8', 'null, 0'] loop
    st := null;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub":"d4d4d4d4-0000-0000-0000-0000000000d4"}', true);
    begin
      execute 'select public.set_home_location(' || args || ')';
    exception when others then st := sqlstate; msg := sqlerrm;
    end;
    reset role;
    if st is distinct from '22023' or msg <> 'invalid location' then raise exception 'FAIL: (%) gave % %', args, st, msg; end if;
  end loop;
  foreach args in array array['no-such-place', '', null] loop
    st := null;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub":"d4d4d4d4-0000-0000-0000-0000000000d4"}', true);
    begin
      perform public.set_home_city(args);
    exception when others then st := sqlstate; msg := sqlerrm;
    end;
    reset role;
    if st is distinct from '22023' or msg <> 'invalid place' then raise exception 'FAIL: set_home_city(%) gave % %', args, st, msg; end if;
  end loop;
  if (select count(*) from public.location_change where member_id = 'd4d4d4d4-0000-0000-0000-0000000000d4') <> 1 then
    raise exception 'FAIL: an invalid call consumed a change';
  end if;
  if (select place_id from public.member_orbit where member_id = 'd4d4d4d4-0000-0000-0000-0000000000d4') <> 'in-pune' then
    raise exception 'FAIL: an invalid call changed member_orbit';
  end if;
end $$;

-- Changes 2 and 3 (city pick, then a point); the 4th within 24 h raises PT429 and changes nothing (Review Focus 3).
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d4d4d4d4-0000-0000-0000-0000000000d4"}';
do $$
begin
  if public.set_home_city('in-mumbai') <> 'Mumbai' then raise exception 'FAIL: set_home_city name'; end if;
  if public.set_home_location(28.6139, 77.2090) <> 'Delhi' then raise exception 'FAIL: third change name'; end if;
end $$;
commit;
do $$
declare st text; msg text; before text; after text;
begin
  select home_cell || '|' || home_cell_g6 || '|' || home_cell_g5 || '|' || place_id || '|' || home_set_at into before
    from public.member_orbit where member_id = 'd4d4d4d4-0000-0000-0000-0000000000d4';
  if before not like '%|in-delhi|%' then raise exception 'FAIL: third change not stored: %', before; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"d4d4d4d4-0000-0000-0000-0000000000d4"}', true);
  begin
    perform public.set_home_location(18.5204, 73.8567);
  exception when others then st := sqlstate; msg := sqlerrm;
  end;
  begin
    perform public.set_home_city('in-pune');
  exception when others then
    if sqlstate <> 'PT429' then st := sqlstate; end if;
  end;
  reset role;
  if st is distinct from 'PT429' or msg <> 'try again later' then raise exception 'FAIL: 4th change gave % %', st, msg; end if;
  select home_cell || '|' || home_cell_g6 || '|' || home_cell_g5 || '|' || place_id || '|' || home_set_at into after
    from public.member_orbit where member_id = 'd4d4d4d4-0000-0000-0000-0000000000d4';
  if after is distinct from before then raise exception 'FAIL: over-cap call changed member_orbit'; end if;
  if (select count(*) from public.location_change where member_id = 'd4d4d4d4-0000-0000-0000-0000000000d4') <> 3 then
    raise exception 'FAIL: over-cap call consumed a change';
  end if;
end $$;

-- Changes older than 24 h free a slot (backdated as the owner).
update public.location_change set at = now() - interval '25 hours'
 where id = (select min(id) from public.location_change where member_id = 'd4d4d4d4-0000-0000-0000-0000000000d4');
do $$
declare st text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"d4d4d4d4-0000-0000-0000-0000000000d4"}', true);
  if public.set_home_city('in-pune') <> 'Pune' then raise exception 'FAIL: freed slot not usable'; end if;
  begin
    perform public.set_home_city('in-mumbai');
  exception when others then st := sqlstate;
  end;
  reset role;
  if st is distinct from 'PT429' then raise exception 'FAIL: cap not re-applied after the freed slot (%)', st; end if;
  if (select place_id from public.member_orbit where member_id = 'd4d4d4d4-0000-0000-0000-0000000000d4') <> 'in-pune' then
    raise exception 'FAIL: freed-slot change not stored';
  end if;
end $$;

-- set_home_city stores the place's own cell and id.
do $$
begin
  if (select home_cell from public.member_orbit where member_id = 'd4d4d4d4-0000-0000-0000-0000000000d4')
     <> (select public.brivia_grid_cell(lat, lng) from public.place where id = 'in-pune') then
    raise exception 'FAIL: set_home_city cell';
  end if;
end $$;

-- A member without a profile row gets an error and nothing is stored.
do $$
declare st text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"e4e4e4e4-0000-0000-0000-0000000000e4"}', true);
  begin
    perform public.set_home_location(18.5204, 73.8567);
  exception when others then st := sqlstate;
  end;
  if st is null then raise exception 'FAIL: set_home_location without a profile'; end if;
  st := null;
  begin
    perform public.set_home_city('in-pune');
  exception when others then st := sqlstate;
  end;
  reset role;
  if st is null then raise exception 'FAIL: set_home_city without a profile'; end if;
  if exists (select 1 from public.location_change where member_id = 'e4e4e4e4-0000-0000-0000-0000000000e4') then
    raise exception 'FAIL: change recorded without a profile';
  end if;
end $$;

-- anon is denied; clients cannot read member_orbit or location_change.
begin;
set local role anon;
do $$
begin
  begin
    perform public.set_home_location(18.5204, 73.8567);
    raise exception 'FAIL: anon can call set_home_location';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_home_city('in-pune');
    raise exception 'FAIL: anon can call set_home_city';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d4d4d4d4-0000-0000-0000-0000000000d4"}';
do $$
begin
  begin
    perform 1 from public.member_orbit;
    raise exception 'FAIL: authenticated can select member_orbit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.location_change;
    raise exception 'FAIL: authenticated can select location_change';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.location_change where member_id = auth.uid();
    raise exception 'FAIL: authenticated can delete location_change';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;

-- Both RPCs are volatile (POST-only in PostgREST) SECURITY DEFINER functions, executable by authenticated only.
do $$
declare f text;
begin
  foreach f in array array['public.set_home_location(double precision, double precision)', 'public.set_home_city(text)'] loop
    if (select provolatile from pg_proc where oid = f::regprocedure) <> 'v' then raise exception 'FAIL: % is not volatile', f; end if;
    if not (select prosecdef from pg_proc where oid = f::regprocedure) then raise exception 'FAIL: % is not definer', f; end if;
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL: anon can execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL: authenticated cannot execute %', f; end if;
  end loop;
  -- location_change stores no cell.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'location_change'
              and column_name not in ('id', 'member_id', 'at')) then
    raise exception 'FAIL: location_change has extra columns';
  end if;
end $$;

-- Log probe (Review Focus 3). The probe coordinate reaches the server only as bind parameters (\bind), once on the
-- success path and once on the over-cap error path. run.sh then greps the server log for it.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"f4f4f4f4-0000-0000-0000-0000000000f4"}', false);
select public.set_home_location($1, $2) \bind 12.971598 77.594566 \g
select public.set_home_city('in-mumbai');
select public.set_home_city('in-pune');
\echo 'expected: ERROR try again later (over-cap probe)'
\set ON_ERROR_STOP 0
select public.set_home_location($1, $2) \bind 12.971598 77.594566 \g
\set ON_ERROR_STOP 1
reset role;
select set_config('request.jwt.claims', '', false);
select set_config('brivia.probe_sqlstate', :'LAST_ERROR_SQLSTATE', false);
do $$
begin
  if current_setting('brivia.probe_sqlstate') <> 'PT429' then
    raise exception 'FAIL: over-cap probe gave %', current_setting('brivia.probe_sqlstate');
  end if;
  if (select place_id from public.member_orbit where member_id = 'f4f4f4f4-0000-0000-0000-0000000000f4') <> 'in-pune' then
    raise exception 'FAIL: over-cap probe changed member_orbit';
  end if;
  if (select count(*) from public.location_change where member_id = 'f4f4f4f4-0000-0000-0000-0000000000f4') <> 3 then
    raise exception 'FAIL: probe change count';
  end if;
end $$;

select 'orbit-location.test.sql OK' as result;
