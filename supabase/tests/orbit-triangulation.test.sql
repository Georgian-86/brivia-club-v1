-- Iteration-3 arena B-F1 (Critical), P0-A1/A2: the deck pool must not be a triangulation oracle (D-038, R1; spec §7,
-- §9.1.5). Replays the judge probe (arena/iter3/judge/b1.sql): a target T in a sparse cell near Pune (no density
-- row, so its card shows only "Pune"), attacker sybils A2..A7 and fillers F8..F12 near Pune.
--   Step 1 (isolation): a sybil writes 'pass' rows for every filler it was never served. They must be silently
--           ignored: no row, no error (P0-A2).
--   Step 2 (edge walk): the sybils move along T's latitude through the old 60 km edge (true g7 ring 2) with
--           set_home_location. T must be in the pool at every point inside Pune, with the band "Pune".
--   Step 3 (invariant): for a non-fine target, membership is identical for every viewer point inside one place.
--           A viewer grid over the Mumbai-Pune region is grouped by the viewer's nearest place; T's presence must
--           be constant within each group.
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.u(n int) returns uuid language sql immutable as $$
  select ('7a17a17a-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;

do $$
declare g int; mid uuid; cell text;
begin
  for g in 1..12 loop
    mid := pg_temp.u(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, is_test, experience, looking_for)
    values (mid, 'Tri ' || g, 'Tri ' || g, 'tri' || g || '@example.com', false, 'x', array['Friends'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;   -- R1: declared (fixture is off)
    insert into public.member_interest values (mid, 'sports.racket.tennis', 20, 'play') on conflict do nothing;
    if g = 1 then cell := public.brivia_grid_cell(18.5600, 73.8000, 7);            -- T's secret point (Pune NW)
    elsif g >= 8 then cell := public.brivia_grid_cell(18.52 + g * 0.01, 73.85, 7);  -- fillers in Pune
    else cell := public.brivia_grid_cell(19.0760, 72.8777, 7); end if;             -- sybils start in Mumbai
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5),
            public.brivia_nearest_place(cell))
    on conflict (member_id) do nothing;
  end loop;
  if (select count(*) from generate_series(1, 12) s(i) where public.brivia_member_completed(pg_temp.u(s.i))) <> 12 then
    raise exception 'FAIL setup: 12 completed members expected';
  end if;
  if exists (select 1 from public.cell_density) then raise exception 'FAIL setup: a density row exists'; end if;
end $$;

-- The probe's helper: move sybil p_who to (lat, lng) with set_home_location, then T's card in its deck (or absent).
create or replace function pg_temp.probe(p_who int, lat float8, lng float8) returns text language plpgsql as $$
declare r text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(p_who))::text, true);
  perform public.set_home_location(lat, lng);
  select string_agg(d.distance_band, ',') into r from public.deck_candidates(20) d where d.id = pg_temp.u(1);
  reset role;
  return coalesce(r, '(absent)');
end $$;

-- Step 1: isolation. Sybil A2 writes 'pass' for every filler (never served to it): silently ignored.
do $$
declare n int; failed boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(2))::text, true);
  begin
    insert into public.interaction (viewer_id, target_id, event)
      select pg_temp.u(2), pg_temp.u(g), 'pass' from generate_series(8, 12) g;
    insert into public.interaction (viewer_id, target_id, event) values (pg_temp.u(2), pg_temp.u(1), 'like');
  exception when others then failed := true;
  end;
  reset role;
  if failed then raise exception 'FAIL B-F1 step 1: an unserved pass/like raised an error (it must be silently ignored)'; end if;
  select count(*) into n from public.interaction where viewer_id = pg_temp.u(2) and event in ('pass', 'like');
  if n <> 0 then raise exception 'FAIL B-F1 step 1: pass_rows_inserted = % (want 0)', n; end if;
end $$;

-- Step 2: the edge walk of the probe (1 deg lng at 18.56 N ~ 105.5 km; the old 60 km edge was at ~+0.569 deg).
-- Every point is inside Pune, so T is present at each one, banded "Pune".
do $$
declare r text; pt record; pl text;
begin
  for pt in select * from (values (2, 0.50), (2, 0.60), (2, 0.55), (3, 0.575), (3, 0.565)) v(who, dlng) loop
    pl := public.brivia_nearest_place(public.brivia_grid_cell(18.56, 73.80 + pt.dlng, 7));
    if pl <> 'in-pune' then raise exception 'FAIL setup: probe point +% is in %, not Pune', pt.dlng, pl; end if;
    r := pg_temp.probe(pt.who, 18.56, 73.80 + pt.dlng);
    if r <> 'Pune' then
      raise exception 'FAIL B-F1 step 2: T at +% deg (sybil %) = % (want "Pune" at every point inside Pune)', pt.dlng, pt.who, r;
    end if;
  end loop;
end $$;

-- Step 3: the invariant over a viewer grid (owner moves of sybil A4, so the 3-per-24 h cap does not limit the walk).
-- Grouped by the viewer's nearest place, T's presence is constant, and T is present exactly when that place's
-- centroid is within 60 km of Pune's.
create temp table tri_walk (place_id text, lat float8, lng float8, present boolean);
do $$
declare a uuid := pg_temp.u(4); la float8; lo float8; cell text; got boolean;
begin
  for la in select x from generate_series(18.0::numeric, 19.3::numeric, 0.1::numeric) x loop
    for lo in select y from generate_series(72.8::numeric, 74.6::numeric, 0.1::numeric) y loop
      cell := public.brivia_grid_cell(la, lo, 7);
      update public.member_orbit
         set home_cell = cell, home_cell_g6 = public.brivia_grid_parent(cell, 6),
             home_cell_g5 = public.brivia_grid_parent(cell, 5), place_id = public.brivia_nearest_place(cell)
       where member_id = a;
      set local role authenticated;
      perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
      select exists (select 1 from public.deck_candidates(20) d where d.id = pg_temp.u(1)) into got;
      reset role;
      insert into tri_walk values (public.brivia_nearest_place(cell), la, lo, got);
    end loop;
  end loop;
end $$;

do $$
declare r record; n int;
begin
  select count(distinct place_id) into n from tri_walk;
  if n < 3 then raise exception 'FAIL setup: the walk covers only % places', n; end if;
  if not exists (select 1 from tri_walk where place_id = 'in-pune') then raise exception 'FAIL setup: no point in Pune'; end if;
  for r in select place_id, bool_and(present) as all_in, bool_or(present) as any_in, count(*) as pts
             from tri_walk group by place_id loop
    if r.all_in is distinct from r.any_in then
      raise exception 'FAIL B-F1 invariant: T''s membership varies inside place % (% points)', r.place_id, r.pts;
    end if;
    if r.any_in is distinct from (select public.brivia_haversine_km(a.lat, a.lng, b.lat, b.lng) <= 60
                                    from public.place a, public.place b where a.id = r.place_id and b.id = 'in-pune') then
      raise exception 'FAIL B-F1: T present = % from place % (the place rule is 60 km between place centroids)',
        r.any_in, r.place_id;
    end if;
  end loop;
end $$;

-- Clean up.
delete from public.interaction where viewer_id::text like '7a17a17a-%' or target_id::text like '7a17a17a-%';
delete from public.profiles where id::text like '7a17a17a-%';
delete from auth.users where id::text like '7a17a17a-%';

select 'orbit-triangulation.test.sql OK' as result;
