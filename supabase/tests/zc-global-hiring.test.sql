-- 0054 (D-184): Global Hiring Discovery (hiring_people, replaced in place). Ids 0e480000-0000-4000-8000-0000000000NN. One transaction, rolled back.
--   01 V viewer, Bengaluru, open to Frontend Developer (mid, hybrid/remote), skills React
--   02 Delhi hirer: Frontend Developer, mid, hybrid (a strong fit), skills React     03 Mumbai hirer: Data Analyst
--   04 Bengaluru member, neither                          05 Delhi hirer whose email is unconfirmed (under the bar; D-173 dropped the age wait)
--   06 Pune seeker who chose Everyone                     07 Chennai seeker visible to hirers only
--   08 hirer V blocked                                    09 hirer already connected to V     10 hirer V passed today
-- G1 grants. G2 every eligible member anywhere, no one else, ranked by fit not distance, a coarse band only.
-- G3 keyset pages: no repeats, nothing skipped. G4 each served card logs an impression, so a Pass on it is stored.
-- G5 closing a role removes its owner at once; reopening brings them back. G6 the hiring kill switch and an incomplete
-- caller get nothing.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.gh(n int) returns uuid language sql immutable as $$
  select ('0e480000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(n int) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.gh(n))::text, true); end $$;

do $$
declare g int; mid uuid; cell text;
  cities numeric[][] := array[[12.9716,77.5946],[28.6139,77.2090],[19.0760,72.8777],[12.9716,77.5946],[28.6139,77.2090],
                              [18.5204,73.8567],[13.0827,80.2707],[12.9716,77.5946],[12.9716,77.5946],[12.9716,77.5946]];
begin
  update public.brivia_feature set enabled = true where name = 'hiring';
  for g in 1..10 loop
    mid := pg_temp.gh(g);
    cell := public.brivia_grid_cell(cities[g][1], cities[g][2], 7);
    insert into auth.users(id, email_confirmed_at) values (mid, case when g = 5 then null else now() end) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, photo_url, skills)
    values (mid, 'Glob ' || g, 'Glob ' || g, 'glob' || g || '@example.com', 'Some years', array['Friends'],
            'https://x.supabase.co/storage/v1/object/public/profile-photos/' || mid || '/p.jpg',
            case when g in (1, 2) then array['React'] else array['Chess'] end)
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now(),
           created_at = now() - interval '30 days' where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  insert into public.role_intent (member_id, titles, families, level, work_modes, visibility) values
    (pg_temp.gh(1), array['Frontend Developer'], array['software'], 'mid', array['hybrid', 'remote'], 'hirers'),
    (pg_temp.gh(6), array['Product Designer'], array['design'], 'mid', array['remote'], 'everyone'),
    (pg_temp.gh(7), array['Data Analyst'], array['data'], 'entry', array['onsite'], 'hirers');
  insert into public.hiring_role (member_id, title, family, level, work_mode, help) values
    (pg_temp.gh(2), 'Frontend Developer', 'software', 'mid', 'hybrid', 'hiring'),
    (pg_temp.gh(3), 'Data Analyst', 'data', 'entry', 'onsite', 'hiring'),
    (pg_temp.gh(5), 'Backend Developer', 'software', 'mid', 'remote', 'hiring'),
    (pg_temp.gh(8), 'Designer', 'design', 'mid', 'remote', 'hiring'),
    (pg_temp.gh(9), 'Designer', 'design', 'mid', 'remote', 'hiring'),
    (pg_temp.gh(10), 'Designer', 'design', 'mid', 'remote', 'hiring');
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.gh(1), pg_temp.gh(8));
  insert into public.matches (user1_id, user2_id) values (least(pg_temp.gh(1), pg_temp.gh(9)), greatest(pg_temp.gh(1), pg_temp.gh(9)));
  insert into public.interaction (viewer_id, target_id, event, context) values (pg_temp.gh(1), pg_temp.gh(10), 'impression', '{"surface":"deck"}');
  insert into public.interaction (viewer_id, target_id, event) values (pg_temp.gh(1), pg_temp.gh(10), 'pass');
  if not public.brivia_hiring_bar(pg_temp.gh(2)) or public.brivia_hiring_bar(pg_temp.gh(5)) then raise exception 'FAIL setup: the bar'; end if;
end $$;

-- G1
do $$
begin
  if has_function_privilege('anon', 'public.hiring_people(integer, numeric, uuid)', 'execute') then raise exception 'FAIL G1: anon'; end if;
  if not has_function_privilege('authenticated', 'public.hiring_people(integer, numeric, uuid)', 'execute') then raise exception 'FAIL G1: members'; end if;
end $$;

-- G2
do $$
declare got text; bands text; r record;
begin
  set local role authenticated;
  perform pg_temp.as_member(1);
  select string_agg(right(id::text, 2) || ':' || hiring_kind, ',' order by score desc, id) into got from public.hiring_people(30);
  if got is distinct from '02:hiring,03:hiring,06:open_to' and got is distinct from '02:hiring,06:open_to,03:hiring' then
    raise exception 'FAIL G2: got %', got; end if;
  select * into r from public.hiring_people(1);
  if right(r.id::text, 2) <> '02' or r.role_title <> 'Frontend Developer' then raise exception 'FAIL G2: the strongest fit (Delhi) is not first: %', r; end if;
  select string_agg(coalesce(distance_band, '-'), ',') into bands from public.hiring_people(30);
  if bands ~ 'km' then raise exception 'FAIL G2: a distance in km: %', bands; end if;
  if exists (select 1 from public.hiring_people(30) where id = pg_temp.gh(1)) then raise exception 'FAIL G2: the caller'; end if;
  reset role;
end $$;
select 'zc-global-hiring G2 OK';

-- G3
do $$
declare a record; b record; c record; n int;
begin
  set local role authenticated;
  perform pg_temp.as_member(1);
  select * into a from public.hiring_people(1);
  select * into b from public.hiring_people(1, a.score, a.id);
  select * into c from public.hiring_people(1, b.score, b.id);
  if a.id = b.id or b.id = c.id or a.id = c.id then raise exception 'FAIL G3: a page repeated'; end if;
  select count(*) into n from public.hiring_people(5, c.score, c.id);
  if n <> 0 then raise exception 'FAIL G3: % rows after the last', n; end if;
  reset role;
end $$;

-- G4
do $$
begin
  if not exists (select 1 from public.interaction where viewer_id = pg_temp.gh(1) and target_id = pg_temp.gh(3)
                  and event = 'impression' and context ->> 'surface' = 'hiring') then raise exception 'FAIL G4: no impression'; end if;
end $$;
do $$
begin
  set local role authenticated;
  perform pg_temp.as_member(1);
  insert into public.interaction (viewer_id, target_id, event) values (pg_temp.gh(1), pg_temp.gh(3), 'pass');
  reset role;
end $$;
do $$
begin
  if not exists (select 1 from public.interaction where viewer_id = pg_temp.gh(1) and target_id = pg_temp.gh(3) and event = 'pass') then
    raise exception 'FAIL G4: the pass on a hiring card was not stored'; end if;
end $$;
do $$
begin
  set local role authenticated;
  perform pg_temp.as_member(1);
  if exists (select 1 from public.hiring_people(30) where id = pg_temp.gh(3)) then raise exception 'FAIL G4: a passed card came back'; end if;
  reset role;
end $$;

-- G5
update public.hiring_role set status = 'closed', closed_at = now() where member_id = pg_temp.gh(2);
do $$
begin
  set local role authenticated;
  perform pg_temp.as_member(1);
  if exists (select 1 from public.hiring_people(30) where id = pg_temp.gh(2)) then raise exception 'FAIL G5: a closed role still shows'; end if;
  reset role;
end $$;
update public.hiring_role set status = 'open', closed_at = null where member_id = pg_temp.gh(2);
do $$
begin
  set local role authenticated;
  perform pg_temp.as_member(1);
  if not exists (select 1 from public.hiring_people(30) where id = pg_temp.gh(2)) then raise exception 'FAIL G5: a reopened role is missing'; end if;
  reset role;
end $$;

-- G6
update public.brivia_feature set enabled = false where name = 'hiring';
do $$
begin
  set local role authenticated;
  perform pg_temp.as_member(1);
  if exists (select 1 from public.hiring_people(30)) then raise exception 'FAIL G6: the kill switch'; end if;
  reset role;
end $$;
update public.brivia_feature set enabled = true where name = 'hiring';
update public.profiles set adult_declared_at = null where id = pg_temp.gh(1);
do $$
begin
  set local role authenticated;
  perform pg_temp.as_member(1);
  if exists (select 1 from public.hiring_people(30)) then raise exception 'FAIL G6: an incomplete caller'; end if;
  reset role;
end $$;
rollback;
select 'zc-global-hiring.test.sql OK' as result;
