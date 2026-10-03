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

select 'orbit-location.test.sql OK' as result;
