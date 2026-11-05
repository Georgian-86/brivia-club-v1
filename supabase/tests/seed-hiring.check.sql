-- The hiring test seed (supabase/seed/hiring-test-members.sql, D-162) against 0047. Run by run.sh in the seed database
-- after the member seed and the hiring seed (each twice). Not a *.test.sql: it needs the seed. One transaction, rolled
-- back. R is a completed real member who is not a tester; T is a completed real member who is a tester.
--   HS1 counts: 14 open seeded roles on 12 seeded hirers, 6 seeded seekers, none duplicated by the second run
--   HS2 every seeded hirer is over the hiring bar without a photo or a 14-day-old account (0047 exemption)
--   HS3 (0050, D-171) with open_test_world on, R sees the seeded banners and the seeded "Open to roles", like T; with it
--       off, R sees no seeded banner, no seeded "Open to roles" and cannot ask about a seeded role, while T still does
--   HS4 a real hirer's banner is unchanged for R (only seeded members are gated)
--   HS5 hiring_people (0048, D-169; 0054, D-184): with the world open R and T both find all 12 seeded hirers plus H,
--       and the seeded seekers who chose Everyone; with it closed R finds only H. Order by score, never by distance
--       (D-184 supersedes D-170's nearest first); the band is a place name or 'Abroad', never km.
begin;
create or replace function pg_temp.t(n int) returns uuid language sql immutable as $$
  select ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(id uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', id)::text, true); end $$;

do $$
declare r uuid := 'eeeeeeee-0000-0000-0000-0000000000a1'; t uuid := 'eeeeeeee-0000-0000-0000-0000000000a2';
        h uuid := 'eeeeeeee-0000-0000-0000-0000000000a3'; m uuid; c text := public.brivia_grid_cell(19.2183, 72.9781, 7);
        n int; ok boolean;
begin
  -- HS1
  select count(*) into n from public.hiring_role where id::text like 'a7e57000-0000-4000-9000-%' and status = 'open';
  if n <> 14 then raise exception 'FAIL HS1: % open seeded roles, expected 14', n; end if;
  select count(distinct member_id) into n from public.hiring_role where id::text like 'a7e57000-0000-4000-9000-%';
  if n <> 12 then raise exception 'FAIL HS1: % seeded hirers, expected 12', n; end if;
  select count(*) into n from public.role_intent i join public.profiles p on p.id = i.member_id where p.is_test and i.findable;
  if n <> 6 then raise exception 'FAIL HS1: % seeded seekers, expected 6', n; end if;
  if exists (select 1 from public.hiring_role where id::text like 'a7e57000-0000-4000-9000-%'
              and (company is not null and not public.brivia_role_text_ok(company) or not public.brivia_role_text_ok(about))) then
    raise exception 'FAIL HS1: a seeded role carries a link or contact detail'; end if;

  -- HS2
  for m in select distinct member_id from public.hiring_role where id::text like 'a7e57000-0000-4000-9000-%' loop
    if not public.brivia_hiring_bar(m) then raise exception 'FAIL HS2: seeded hirer % is under the bar', m; end if;
  end loop;

  -- Three completed real members in Thane: R (plain), T (tester), H (a real hirer over the bar).
  foreach m in array array[r, t, h] loop
    insert into auth.users(id, email_confirmed_at) values (m, now()) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, city, state, skills, adult_declared_at, photo_url)
    values (m, 'Real ' || right(m::text, 2), 'Real ' || right(m::text, 2), right(m::text, 2) || '@example.com', 'Thane',
            'Maharashtra', '{Robotics}', now(), 'https://x.supabase.co/storage/v1/object/public/profile-photos/' || m || '/p.jpg')
    on conflict (id) do nothing;
    update public.profiles set created_at = now() - interval '40 days' where id = m;
    insert into public.member_interest (member_id, interest_id, points, mode) values
      (m, 'tech.hardware.robotics', 12, 'build'), (m, 'arts.photography.film_cameras', 8, 'play') on conflict do nothing;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (m, c, public.brivia_grid_parent(c, 6), public.brivia_grid_parent(c, 5), public.brivia_nearest_place(c))
    on conflict (member_id) do nothing;
    if not public.brivia_member_completed(m) then raise exception 'FAIL HS0: real member % is not completed', m; end if;
  end loop;
  insert into public.brivia_tester(member_id) values (t) on conflict do nothing;
  insert into public.hiring_role (member_id, title, family, level, work_mode, help) values (h, 'Robotics Engineer', 'software', 'mid', 'onsite', 'hiring');
  update public.brivia_world_switch set open_test_world = true, changed_at = now();

  -- HS3
  if not public.brivia_visible_to(r, pg_temp.t(40)) then raise exception 'FAIL HS3: positive control, R cannot see t40 with the world open'; end if;
  perform pg_temp.as_member(r);
  select count(*) into n from public.member_hiring(array[pg_temp.t(40), pg_temp.t(42)]);
  if n <> 2 then raise exception 'FAIL HS3: with the world open a real member sees % seeded banners, expected 2', n; end if;
  select count(*) into n from public.member_open_to(pg_temp.t(39));
  if n <> 1 then raise exception 'FAIL HS3: with the world open a real member does not see t39''s "Open to roles"'; end if;

  update public.brivia_world_switch set open_test_world = false, changed_at = now();
  select count(*) into n from public.member_hiring(array[pg_temp.t(40), pg_temp.t(42), pg_temp.t(11)]);
  if n <> 0 then raise exception 'FAIL HS3: with the world closed a real non-tester sees % seeded banners', n; end if;
  select count(*) into n from public.member_open_to(pg_temp.t(39));
  if n <> 0 then raise exception 'FAIL HS3: with the world closed a real non-tester sees a seeded "Open to roles"'; end if;
  begin
    perform public.ask_about_role('a7e57000-0000-4000-9000-000000000001'::uuid, 'Four years of ROS and C++ on real robots, happy to talk.');
    ok := false;
  exception when others then ok := true; end;
  if not ok then raise exception 'FAIL HS3: with the world closed a real non-tester asked about a seeded role'; end if;
  select count(*) into n from public.hiring_people(50);
  if n <> 1 then raise exception 'FAIL HS5: with the world closed a real non-tester finds % hiring people, expected only H', n; end if;
  if (select hiring_kind from public.hiring_people(50) limit 1) <> 'hiring' then raise exception 'FAIL HS5: H is not kind hiring'; end if;

  perform pg_temp.as_member(t);
  select count(*) into n from public.member_hiring(array[pg_temp.t(40), pg_temp.t(42)]);
  if n <> 2 then raise exception 'FAIL HS3: the tester sees % seeded banners, expected 2', n; end if;
  select count(*) into n from public.member_open_to(pg_temp.t(39));
  if n <> 1 then raise exception 'FAIL HS3: the tester does not see t39''s "Open to roles"'; end if;
  update public.brivia_world_switch set open_test_world = true, changed_at = now();

  -- HS4
  perform pg_temp.as_member(r);
  select count(*) into n from public.member_hiring(array[h]);
  if n <> 1 then raise exception 'FAIL HS4: a real hirer''s banner is hidden from a real member (% rows)', n; end if;

  -- HS5
  select count(*) into n from public.hiring_people(50) where hiring_kind = 'hiring';
  if n <> 13 then raise exception 'FAIL HS5: with the world open a real member finds % hiring people, expected 13', n; end if;
  select count(*) into n from public.hiring_people(50) where hiring_kind = 'open_to';
  if n <> (select count(*) from public.role_intent i where i.member_id::text like 'a7e57000-%' and i.visibility = 'everyone') then
    raise exception 'FAIL HS5: % seeded seekers open to everyone, expected every one of them', n; end if;
  perform pg_temp.as_member(t);
  select count(*) into n from public.hiring_people(50) where hiring_kind = 'hiring';
  if n <> 13 then raise exception 'FAIL HS5: the tester finds % hiring people, expected 13', n; end if;
  -- D-184: ranked by score, never by distance; one page after another repeats no one
  if exists (select 1 from (select score, lag(score) over (order by k) prev from (select row_number() over () k, score from public.hiring_people(50)) z) q
              where q.prev < q.score) then raise exception 'FAIL HS5: not in score order'; end if;
  if exists (select 1 from public.hiring_people(50) where distance_band ~ '[0-9]') then raise exception 'FAIL HS5: a distance leaked'; end if;
  select count(*) into n from public.hiring_people(3);
  if n <> 3 then raise exception 'FAIL HS5: the limit is not applied (% rows)', n; end if;
end $$;
select 'seed-hiring HS1-HS5 (seeded hirers follow the open test world) OK';
rollback;
