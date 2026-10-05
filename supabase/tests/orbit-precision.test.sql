-- Iteration-3 arena A-F2 (Critical), P0-A4: "Pick my city" is approximate (D-038, R2; spec §9.1.4, §7).
-- Replays the judge probe (arena/iter3/judge/a2.sql): 12 members deny geolocation and pick Mumbai, so they all get
-- the centroid's g7 cell. M13 geolocates in Thane (~19 km N), M14 in Colaba (~8 km S), and M15 geolocates exactly at
-- the Mumbai centroid (the same g7 cell as the pickers: a real resident of that cell).
-- Rules under test:
--   * set_home_city writes member_orbit.precision = 'place'; set_home_location writes 'cell';
--   * place-precision members are not counted in g7 or g6 density (they are counted in g5);
--   * a pair where either side is 'place' uses the place rule: the band is the place name, never "~3 km";
--   * a geolocated resident of the centroid cell is not un-coarsened by the pickers.
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.u(n int) returns uuid language sql immutable as $$
  select ('a2a2a2a2-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create or replace function pg_temp.as_member(p int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(p))::text, true);
end $$;

delete from public.cell_density;   -- the refresh watermark is global

do $$
declare g int; mid uuid;
begin
  for g in 1..15 loop
    mid := pg_temp.u(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, is_test, experience, looking_for)
    values (mid, 'Pick ' || g, 'Pick ' || g, 'pick' || g || '@example.com', false, 'x', array['Friends'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;   -- R1: declared (fixture is off)
    insert into public.member_interest values (mid, 'sports.racket.tennis', 20, 'play') on conflict do nothing;
  end loop;
end $$;

-- Shape: the precision column.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'member_orbit'
                  and column_name = 'precision' and is_nullable = 'NO' and column_default like '''cell''%') then
    raise exception 'FAIL R2: member_orbit.precision (text not null default ''cell'') is missing';
  end if;
end $$;

-- 12 pickers, two geolocated neighbours, one geolocated resident of the centroid cell.
do $$
declare g int;
begin
  for g in 1..12 loop
    perform pg_temp.as_member(g);
    set local role authenticated; perform public.set_home_city('in-mumbai'); reset role;
  end loop;
  perform pg_temp.as_member(13); set local role authenticated; perform public.set_home_location(19.2183, 72.9781); reset role;
  perform pg_temp.as_member(14); set local role authenticated; perform public.set_home_location(18.9067, 72.8147); reset role;
  perform pg_temp.as_member(15); set local role authenticated; perform public.set_home_location(19.0760, 72.8777); reset role;
end $$;

do $$
begin
  if (select count(distinct home_cell) from public.member_orbit
       where member_id in (select pg_temp.u(g) from generate_series(1, 12) g)) <> 1 then
    raise exception 'FAIL setup: the pickers do not share one cell';
  end if;
  if (select home_cell from public.member_orbit where member_id = pg_temp.u(15))
     <> (select home_cell from public.member_orbit where member_id = pg_temp.u(1)) then
    raise exception 'FAIL setup: M15 is not in the centroid cell';
  end if;
  if exists (select 1 from public.member_orbit where member_id in (select pg_temp.u(g) from generate_series(1, 12) g)
              and precision <> 'place') then
    raise exception 'FAIL R2: set_home_city must write precision = place';
  end if;
  if exists (select 1 from public.member_orbit where member_id in (pg_temp.u(13), pg_temp.u(14), pg_temp.u(15))
              and precision <> 'cell') then
    raise exception 'FAIL R2: set_home_location must write precision = cell';
  end if;
end $$;

-- Eight nightly refreshes with every account older than 14 days.
update public.profiles set created_at = now() - interval '20 days' where id::text like 'a2a2a2a2-%';
do $$ declare i int; begin for i in 0..7 loop perform public.refresh_cell_density(current_date + i); end loop; end $$;

-- Density: pickers are not counted at g7 or g6; they are counted at g5. M15 alone is the centroid cell's population.
do $$
declare c record; n7 int; n6 int; n5 int;
begin
  select home_cell, home_cell_g6, home_cell_g5 into c from public.member_orbit where member_id = pg_temp.u(1);
  select n into n7 from public.cell_density where cell = c.home_cell and not is_test;
  select n into n6 from public.cell_density where cell = c.home_cell_g6 and not is_test;
  select n into n5 from public.cell_density where cell = c.home_cell_g5 and not is_test;
  if coalesce(n7, 0) <> 1 then raise exception 'FAIL R2: the centroid g7 cell counts % (want 1: M15 only)', n7; end if;
  if coalesce(n6, 0) >= 12 then raise exception 'FAIL R2: the centroid g6 cell counts the pickers (n = %)', n6; end if;
  if coalesce(n5, 0) < 13 then raise exception 'FAIL R2: the centroid g5 cell must count the pickers (n = %)', n5; end if;
  if public.brivia_cell_ok(c.home_cell, false, 10) or public.brivia_cell_ok(c.home_cell, false, 5) then
    raise exception 'FAIL R2: pickers un-coarsened the centroid cell';
  end if;
end $$;

-- M1 (a picker) sees the other 11 pickers and M15 as "Mumbai", never a km band.
do $$
declare bands text[]; n int;
begin
  perform pg_temp.as_member(1);
  set local role authenticated;
  select array_agg(distinct d.distance_band), count(*) into bands, n
    from public.deck_candidates(20) d where d.id in (select pg_temp.u(g) from generate_series(2, 15) g);
  reset role;
  if bands && array['~3 km', '~10 km'] then raise exception 'FAIL A-F2: a picker sees a km band: %', bands; end if;
  if n < 12 then raise exception 'FAIL A-F2: M1 sees only % members', n; end if;
end $$;

-- M15 (geolocated, centroid cell) sees every picker as "Mumbai".
do $$
declare bands text[];
begin
  perform pg_temp.as_member(15);
  set local role authenticated;
  select array_agg(distinct d.distance_band) into bands
    from public.deck_candidates(20) d where d.id in (select pg_temp.u(g) from generate_series(1, 12) g);
  reset role;
  if bands is distinct from array['Mumbai'] then raise exception 'FAIL A-F2: M15 sees the pickers as %', bands; end if;
end $$;

-- Even when the centroid cell is ok10 (forced here), a picker pair is never fine: still "Mumbai". A geolocated pair
-- in that cell is (M15 and a second geolocated resident M16 would be "~3 km"; checked with M14 moved there).
do $$
declare c text; b text;
begin
  select home_cell into c from public.member_orbit where member_id = pg_temp.u(1);
  update public.cell_density set ok10 = true, ok5 = true where cell = c and not is_test;
  perform pg_temp.as_member(1);
  set local role authenticated;
  select d.distance_band into b from public.deck_candidates(20) d where d.id = pg_temp.u(2);
  reset role;
  if b <> 'Mumbai' then raise exception 'FAIL R2: a picker pair in an ok10 cell = %', b; end if;
  perform pg_temp.as_member(15);
  set local role authenticated;
  select d.distance_band into b from public.deck_candidates(20) d where d.id = pg_temp.u(2);
  reset role;
  if b <> 'Mumbai' then raise exception 'FAIL R2: geolocated viewer, picker target in an ok10 cell = %', b; end if;
  update public.member_orbit o set home_cell = c, home_cell_g6 = m.home_cell_g6, home_cell_g5 = m.home_cell_g5,
         place_id = m.place_id
    from public.member_orbit m where m.member_id = pg_temp.u(15) and o.member_id = pg_temp.u(14);
  perform pg_temp.as_member(15);
  set local role authenticated;
  select d.distance_band into b from public.deck_candidates(20) d where d.id = pg_temp.u(14);
  reset role;
  if b <> '~3 km' then raise exception 'FAIL R2: a geolocated pair in an ok10 cell = %', b; end if;
end $$;

-- Clean up.
delete from public.cell_density;
delete from public.interaction where viewer_id::text like 'a2a2a2a2-%' or target_id::text like 'a2a2a2a2-%';
delete from public.profiles where id::text like 'a2a2a2a2-%';
delete from auth.users where id::text like 'a2a2a2a2-%';

select 'orbit-precision.test.sql OK' as result;
