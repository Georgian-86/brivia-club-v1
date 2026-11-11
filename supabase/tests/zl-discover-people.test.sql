-- 0072 (D-239): discover_people, the filter drawer's search lane.
-- D1 radius: from Bengaluru, 50 km finds the Bengaluru member only; 200 km adds Mysuru; anywhere adds Delhi.
-- D2 a Custom city (Delhi) as the centre: 50 km finds the Delhi member only.
-- D3 interests: only members with a hit; hits first; looking-for needs a hit too when given.
-- D4 exclusions: blocked, connected, passed, p_exclude and the caller never come back; the band is the city, never km.
-- D5 an anonymous caller gets nothing; anon cannot execute it.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.mv(n int) returns uuid language sql immutable as $$
  select ('0e720000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
do $$
declare
  g int; mid uuid; cell text;
  -- 1 me (Bengaluru), 2 Bengaluru chess, 3 Mysuru chess, 4 Delhi chess+movies, 5 Bengaluru blocked chess,
  -- 6 Bengaluru connected chess, 7 Bengaluru passed chess, 8 Bengaluru no chess
  lat double precision[] := array[12.9716, 12.9800, 12.2958, 28.6139, 12.9600, 12.9650, 12.9750, 12.9690];
  lng double precision[] := array[77.5946, 77.6000, 76.6394, 77.2090, 77.5900, 77.5950, 77.6050, 77.5800];
  sk text[][] := array[['Zorbchess','Zorbmovies'],['Zorbchess','Reading'],['Zorbchess','Hiking'],['zorbchess','Zorbmovies'],['Zorbchess','Art'],['Zorbchess','Art'],['Zorbchess','Art'],['Cooking','Art']];
begin
  for g in 1..8 loop
    mid := pg_temp.mv(g);
    cell := public.brivia_grid_cell(lat[g], lng[g], 7);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Disc ' || g, 'Disc ' || g, 'disc' || g || '@example.com', 'Some years',
            case when g = 3 then array['Zorbmentor'] else array['Zorbpartner'] end, array[sk[g][1], sk[g][2]])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.mv(5), pg_temp.mv(1)) on conflict do nothing;
  insert into public.matches (user1_id, user2_id) values (least(pg_temp.mv(1), pg_temp.mv(6)), greatest(pg_temp.mv(1), pg_temp.mv(6)));
  insert into public.interaction (viewer_id, target_id, event, context) values (pg_temp.mv(1), pg_temp.mv(7), 'pass', '{}'::jsonb);
end $$;

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.mv(1))::text, true);
set local role authenticated;
do $$
declare ids uuid[]; r record;
begin
  -- D1
  select array_agg(d.id order by d.id) into ids from public.discover_people(array['Zorbchess'], '{}', 50) d;
  if ids is distinct from array[pg_temp.mv(2)] then raise exception 'FAIL D1 50 km: %', ids; end if;
  select array_agg(d.id order by d.id) into ids from public.discover_people(array['Zorbchess'], '{}', 200) d;
  if ids is distinct from array[pg_temp.mv(2), pg_temp.mv(3)] then raise exception 'FAIL D1 200 km: %', ids; end if;
  select array_agg(d.id order by d.id) into ids from public.discover_people(array['Zorbchess'], '{}', null) d;
  if ids is distinct from array[pg_temp.mv(2), pg_temp.mv(3), pg_temp.mv(4)] then raise exception 'FAIL D1 anywhere: %', ids; end if;
  -- D2
  select array_agg(d.id order by d.id) into ids from public.discover_people(array['Zorbchess'], '{}', 50, 'in-delhi') d;
  if ids is distinct from array[pg_temp.mv(4)] then raise exception 'FAIL D2 Delhi 50 km: %', ids; end if;
  -- D3: Disc 4 has two hits (chess, movies) and comes first; Disc 8 (no chess) never; looking-for narrows.
  select d.id into r from public.discover_people(array['Zorbchess', 'Zorbmovies'], '{}', null) d limit 1;
  if r.id <> pg_temp.mv(4) then raise exception 'FAIL D3 hits first: %', r.id; end if;
  if exists (select 1 from public.discover_people(array['Zorbchess'], '{}', null) d where d.id = pg_temp.mv(8)) then
    raise exception 'FAIL D3 a member without the interest'; end if;
  select array_agg(d.id order by d.id) into ids from public.discover_people(array['Zorbchess'], array['Zorbmentor'], null) d;
  if ids is distinct from array[pg_temp.mv(3)] then raise exception 'FAIL D3 looking-for: %', ids; end if;
  -- Looking-for only (Zorbpartner: everyone but Disc 3): every visible one, still not the excluded ones.
  select array_agg(d.id order by d.id) into ids from public.discover_people('{}', array['Zorbpartner'], null) d;
  if ids is distinct from array[pg_temp.mv(2), pg_temp.mv(4), pg_temp.mv(8)] then raise exception 'FAIL D4 looking-for only: %', ids; end if;
  -- D4
  select array_agg(d.id order by d.id) into ids from public.discover_people(array['Zorbchess'], '{}', null, null, array[pg_temp.mv(2)]) d;
  if ids is distinct from array[pg_temp.mv(3), pg_temp.mv(4)] then raise exception 'FAIL D4 p_exclude: %', ids; end if;
  select d.* into r from public.discover_people(array['Zorbchess'], '{}', null) d where d.id = pg_temp.mv(3);
  if r.distance_band <> 'Mysuru' or r.distance_band ~ '\d' then raise exception 'FAIL D4 band: %', r.distance_band; end if;
end $$;
reset role;

-- D5
select set_config('request.jwt.claims', json_build_object('sub', '0e720000-0000-4000-8000-0000000000ff')::text, true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.discover_people('{}', '{}', null)) then raise exception 'FAIL D5: a non-member got rows'; end if;
end $$;
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.discover_people(text[], text[], int, text, uuid[], int)', 'execute') then
    raise exception 'FAIL D5: anon can execute'; end if;
end $$;
rollback;
select 'zl-discover-people.test ALL PASSED';
