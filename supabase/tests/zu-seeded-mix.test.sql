-- 0083 (D-271): seeded test members take at most one place in six, after five real members.
-- S1 brivia_seed_slot: real 1-5 -> 1-5, real 6 -> 7; seeded k -> 6k while there are 5k real; then after every real.
-- S2 deck_candidates (open world): 12 real and 3 seeded nearby -> the seeded at places 6, 12 and 15.
-- S3 discover_people: the same mix.
-- S4 search_members: name matches, real before seeded.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.mv(n int) returns uuid language sql immutable as $$
  select ('0e830000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
do $$
begin
  if brivia_private.brivia_seed_slot(false, 1, 12) <> 1 or brivia_private.brivia_seed_slot(false, 5, 12) <> 5
     or brivia_private.brivia_seed_slot(false, 6, 12) <> 7 or brivia_private.brivia_seed_slot(true, 1, 12) <> 6
     or brivia_private.brivia_seed_slot(true, 2, 12) <> 12 or brivia_private.brivia_seed_slot(true, 3, 12) < 1000000
     or brivia_private.brivia_seed_slot(true, 1, 4) < 1000000 then
    raise exception 'FAIL S1 brivia_seed_slot'; end if;
  if has_function_privilege('authenticated', 'brivia_private.brivia_seed_slot(boolean, bigint, bigint)', 'execute') then
    raise exception 'FAIL S1: members can call brivia_seed_slot'; end if;
end $$;
do $$
declare g int; mid uuid; cell text;
begin
  update public.brivia_world_switch set open_test_world = true, changed_at = now();
  -- 1 me (real), 2-13 real, 14-16 seeded; everyone in Jaipur (no other test lives there) with the same interest.
  for g in 1..16 loop
    mid := pg_temp.mv(g);
    cell := public.brivia_grid_cell(26.9124 + g * 0.001, 75.7873, 7);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills, is_test)
    values (mid, 'Mixy ' || g, 'Mixy ' || g, 'mixy' || g || '@example.com', 'Some years', array['Zorbpartner'], array['Zorbchess'], g >= 14)
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', pg_temp.mv(1))::text, true);
set local role authenticated;
do $$
declare pos int[];
begin
  -- S2: only this test's members (other tests may leave members nearby: keep ours, in deck order).
  select array_agg(x.n order by x.n) into pos
    from (select d.id, row_number() over () as n from public.deck_candidates(20) d) x
   where x.id in (select pg_temp.mv(g) from generate_series(2, 16) g);
  if cardinality(pos) <> 15 then raise exception 'FAIL S2 deck size: %', cardinality(pos); end if;
  select array_agg(r.k order by r.k) into pos
    from (select row_number() over () as k, x.id
            from (select d.id from public.deck_candidates(20) d) x
           where x.id in (select pg_temp.mv(g) from generate_series(2, 16) g)) r
   where r.id in (pg_temp.mv(14), pg_temp.mv(15), pg_temp.mv(16));
  if pos is distinct from array[6, 12, 15]::bigint[]::int[] then raise exception 'FAIL S2 deck seeded places: %', pos; end if;
  -- S3
  select array_agg(r.k order by r.k) into pos
    from (select row_number() over () as k, x.id
            from (select d.id from public.discover_people(array['Zorbchess'], '{}', 50) d) x
           where x.id in (select pg_temp.mv(g) from generate_series(2, 16) g)) r
   where r.id in (pg_temp.mv(14), pg_temp.mv(15), pg_temp.mv(16));
  if pos is distinct from array[6, 12, 15] then raise exception 'FAIL S3 discover seeded places: %', pos; end if;
  -- S4
  select array_agg(r.k order by r.k) into pos
    from (select row_number() over () as k, s.id from public.search_members('Mixy', 20) s) r
   where r.id in (pg_temp.mv(14), pg_temp.mv(15), pg_temp.mv(16));
  if pos is distinct from array[13, 14, 15] then raise exception 'FAIL S4 search seeded places: %', pos; end if;
end $$;
reset role;
rollback;
\echo 'zu-seeded-mix: ALL PASSED'
