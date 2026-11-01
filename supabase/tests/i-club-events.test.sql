-- 0020 (D-117): club events, RSVPs, "Find a companion".
-- Ids 0e200000-0000-4000-8000-0000000000NN: 01 A, 02 B (A's match), 03 C, 04 K (A blocked K), 05 I (incomplete),
-- 06 P (a city pick: precision 'place').
-- V1 structure: the three tables have RLS on and no client grants; anon cannot execute any function; the seed has 8
--    published events with g7 venue cells and no coordinate columns.
-- V2 list_events: upcoming only, the category filter, distance in whole km (>= 1) for a 'cell' member and null for a
--    'place' member, nearest band first.
-- V3 set_event_rsvp: going on and off, wants_companion implies going, null keeps the value, a new RSVP takes the
--    companion default; a past or unknown event is refused (22023); an incomplete member is refused (42501).
-- V4 counts include only members the caller can see (a blocked member is not counted); friends names only connections.
-- V5 set_companion_default applies to every upcoming RSVP and is read back by my_event_prefs.
-- V6 event_companions: empty unless the caller opted in; lists opted-in visible members only, ordered by shared
--    interests, never the caller, never a blocked member; returns no location, email or phone.
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.ev(n int) returns uuid language sql immutable as $$
  select ('0e200000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9698, 77.7499, 7);
begin
  for g in 1..6 loop
    mid := pg_temp.ev(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (mid, 'Event ' || g, 'Event ' || g, 'event' || g || '@example.com', 'Some years', array['Friends'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    if g <> 5 then
      insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
      values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell),
              case when g = 6 then 'place' else 'cell' end)
      on conflict (member_id) do nothing;
      insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20)
      on conflict do nothing;
    end if;
  end loop;
  if public.brivia_member_completed(pg_temp.ev(5)) then raise exception 'FAIL setup: I must be incomplete'; end if;
  if not public.brivia_member_completed(pg_temp.ev(1)) then raise exception 'FAIL setup: A must be completed'; end if;
  insert into public.matches (user1_id, user2_id) values (pg_temp.ev(1), pg_temp.ev(2)) on conflict do nothing;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.ev(1), pg_temp.ev(4)) on conflict do nothing;
  -- A past event and a far one (Mumbai) for the filters.
  insert into public.club_event (slug, title, category, venue_name, venue_area, venue_cell, starts_at, ends_at)
  values ('zz-past', 'Past thing', 'tech', 'Old Hall', 'Whitefield, Bengaluru', cell, now() - interval '2 days', now() - interval '1 day'),
         ('zz-far', 'Far thing', 'tech', 'Far Hall', 'Thane, Mumbai', public.brivia_grid_cell(19.2183, 72.9781, 7),
          now() + interval '1 hour', now() + interval '3 hours')
  on conflict (slug) do nothing;
end $$;

-- V1
do $$
declare t text; f text;
begin
  foreach t in array array['public.club_event', 'public.event_rsvp', 'public.member_event_pref'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then raise exception 'FAIL V1: % has no RLS', t; end if;
    if has_table_privilege('authenticated', t, 'select') or has_table_privilege('anon', t, 'select')
       or has_table_privilege('authenticated', t, 'insert') then raise exception 'FAIL V1: % has client grants', t; end if;
  end loop;
  foreach f in array array['public.list_events(text)', 'public.set_event_rsvp(uuid, boolean, boolean)',
                           'public.set_companion_default(boolean)', 'public.my_event_prefs()', 'public.event_companions(uuid)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL V1: anon may execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL V1: authenticated may not execute %', f; end if;
  end loop;
  if (select count(*) from public.club_event where slug not like 'zz-%' and is_published) <> 8 then
    raise exception 'FAIL V1: expected 8 seeded events, got %', (select count(*) from public.club_event where slug not like 'zz-%'); end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'club_event'
              and column_name ~ '(lat|lng|lon)') then raise exception 'FAIL V1: club_event stores coordinates'; end if;
  if exists (select 1 from public.club_event where venue_cell !~ '^g7:') then raise exception 'FAIL V1: a venue is not a g7 cell'; end if;
  if pg_get_function_result('public.event_companions(uuid)'::regprocedure) ~* '(email|phone|cell|lat|lng)' then
    raise exception 'FAIL V6: event_companions returns a private column'; end if;
end $$;

-- V2
do $$
declare n int; km int; first_slug text; e_jam uuid;
begin
  select id into e_jam from public.club_event where slug = 'acoustic-jam-session';
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.ev(1));
  if exists (select 1 from public.list_events(null) where title = 'Past thing') then raise exception 'FAIL V2: a past event is listed'; end if;
  select count(*) into n from public.list_events(null);
  if n <> 9 then raise exception 'FAIL V2: expected 9 upcoming events, got %', n; end if;
  if exists (select 1 from public.list_events('music') where category <> 'music') then raise exception 'FAIL V2: category filter'; end if;
  if (select count(*) from public.list_events('MUSIC')) <> 2 then raise exception 'FAIL V2: music count'; end if;
  if (select count(*) from public.list_events('all')) <> 9 then raise exception 'FAIL V2: all'; end if;
  select distance_km into km from public.list_events(null) where id = e_jam;
  if km is null or km < 1 or km > 3 then raise exception 'FAIL V2: jam distance %', km; end if;
  if (select distance_km from public.list_events(null) where title = 'Far thing') < 800 then raise exception 'FAIL V2: far distance'; end if;
  -- The far event starts soonest but is listed after every nearby one.
  if (select title from public.list_events(null) offset 8 limit 1) <> 'Far thing' then raise exception 'FAIL V2: far event is not last'; end if;
  perform pg_temp.as_member(pg_temp.ev(6));
  if exists (select 1 from public.list_events(null) where distance_km is not null) then raise exception 'FAIL V2: a city pick gets a distance'; end if;
  perform pg_temp.as_member(pg_temp.ev(5));
  if exists (select 1 from public.list_events(null)) then raise exception 'FAIL V2: an incomplete member sees events'; end if;
  reset role;
end $$;

-- V3, V4
do $$
declare e_jam uuid; e_past uuid; r record; code text;
begin
  select id into e_jam from public.club_event where slug = 'acoustic-jam-session';
  select id into e_past from public.club_event where slug = 'zz-past';
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.ev(1));
  select * into r from public.set_event_rsvp(e_jam, true);
  if not r.going or r.wants_companion then raise exception 'FAIL V3: plain going'; end if;
  select * into r from public.set_event_rsvp(e_jam, true, true);
  if not r.wants_companion then raise exception 'FAIL V3: wants companion'; end if;
  select * into r from public.set_event_rsvp(e_jam, true, null);
  if not r.wants_companion then raise exception 'FAIL V3: null must keep wants_companion'; end if;
  select * into r from public.set_event_rsvp(e_jam, false, null);
  if r.going then raise exception 'FAIL V3: going off'; end if;
  select * into r from public.set_event_rsvp(e_jam, false, true);
  if not r.going or not r.wants_companion then raise exception 'FAIL V3: wants companion must imply going'; end if;
  begin perform public.set_event_rsvp(e_past, true); code := 'none'; exception when others then code := sqlstate; end;
  if code <> '22023' then raise exception 'FAIL V3: past event gave %', code; end if;
  begin perform public.set_event_rsvp(gen_random_uuid(), true); code := 'none'; exception when others then code := sqlstate; end;
  if code <> '22023' then raise exception 'FAIL V3: unknown event gave %', code; end if;
  perform pg_temp.as_member(pg_temp.ev(5));
  begin perform public.set_event_rsvp(e_jam, true); code := 'none'; exception when others then code := sqlstate; end;
  if code <> '42501' then raise exception 'FAIL V3: incomplete member gave %', code; end if;
  -- B (connection), C and K go; B and K want a companion.
  perform pg_temp.as_member(pg_temp.ev(2)); perform public.set_event_rsvp(e_jam, true, true);
  perform pg_temp.as_member(pg_temp.ev(3)); perform public.set_event_rsvp(e_jam, true, false);
  perform pg_temp.as_member(pg_temp.ev(4)); perform public.set_event_rsvp(e_jam, true, true);
  perform pg_temp.as_member(pg_temp.ev(1));
  select * into r from public.list_events(null) where id = e_jam;
  if r.going_count <> 3 then raise exception 'FAIL V4: A should count A, B, C (not blocked K), got %', r.going_count; end if;
  if r.companion_count <> 2 then raise exception 'FAIL V4: companion count %', r.companion_count; end if;
  if not r.going or not r.wants_companion then raise exception 'FAIL V4: own state'; end if;
  if jsonb_array_length(r.friends) <> 1 or (r.friends->0->>'id')::uuid <> pg_temp.ev(2) then
    raise exception 'FAIL V4: friends should be B only, got %', r.friends; end if;
  perform pg_temp.as_member(pg_temp.ev(3));
  select * into r from public.list_events(null) where id = e_jam;
  if r.going_count <> 4 then raise exception 'FAIL V4: C sees 4 going, got %', r.going_count; end if;
  if jsonb_array_length(r.friends) <> 0 then raise exception 'FAIL V4: C has no connections going'; end if;
  reset role;
end $$;

-- V5
do $$
declare e_tech uuid; e_jam uuid; r record;
begin
  select id into e_jam from public.club_event where slug = 'acoustic-jam-session';
  select id into e_tech from public.club_event where slug = 'tech-coffee-night';
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.ev(3));
  if (select companion_default from public.my_event_prefs()) then raise exception 'FAIL V5: default must be off'; end if;
  if not public.set_companion_default(true) then raise exception 'FAIL V5: set on'; end if;
  if not (select companion_default from public.my_event_prefs()) then raise exception 'FAIL V5: read back'; end if;
  if not (select wants_companion from public.list_events(null) where id = e_jam) then raise exception 'FAIL V5: existing RSVP not updated'; end if;
  select * into r from public.set_event_rsvp(e_tech, true);
  if not r.wants_companion then raise exception 'FAIL V5: a new RSVP must take the default'; end if;
  perform public.set_companion_default(false);
  if (select wants_companion from public.list_events(null) where id = e_jam) then raise exception 'FAIL V5: off not applied'; end if;
  perform public.set_companion_default(true);
  reset role;
end $$;

-- V6
do $$
declare e_jam uuid; n int; first uuid;
begin
  select id into e_jam from public.club_event where slug = 'acoustic-jam-session';
  -- C shares two interests with A; B shares one.
  insert into public.member_interest (member_id, interest_id, points)
  select m, i, 1 from (values (pg_temp.ev(1)), (pg_temp.ev(3))) v(m),
                      (select id as i from public.interest_node where status = 'active' and level = 3
                        and id <> 'sports.racket.badminton' order by id limit 1) n
  on conflict do nothing;
  -- Completion needs exactly 20 points.
  update public.member_interest set points = 19
   where member_id in (pg_temp.ev(1), pg_temp.ev(3)) and interest_id = 'sports.racket.badminton';
  if not public.brivia_member_completed(pg_temp.ev(1)) then raise exception 'FAIL setup V6: A must stay completed'; end if;
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.ev(1));
  select count(*), (array_agg(member_id order by shared_interests desc))[1] into n, first from public.event_companions(e_jam);
  if n <> 2 then raise exception 'FAIL V6: expected B and C (not K, not A), got %', n; end if;
  if first <> pg_temp.ev(3) then raise exception 'FAIL V6: C shares the most and should be first'; end if;
  if exists (select 1 from public.event_companions(e_jam) where member_id in (pg_temp.ev(1), pg_temp.ev(4))) then
    raise exception 'FAIL V6: the caller or a blocked member is listed'; end if;
  if not (select is_connection from public.event_companions(e_jam) where member_id = pg_temp.ev(2)) then
    raise exception 'FAIL V6: B is a connection'; end if;
  -- Opting out hides everyone.
  perform public.set_event_rsvp(e_jam, true, false);
  if exists (select 1 from public.event_companions(e_jam)) then raise exception 'FAIL V6: listed without opting in'; end if;
  perform pg_temp.as_member(pg_temp.ev(6));
  if exists (select 1 from public.event_companions(e_jam)) then raise exception 'FAIL V6: listed without going'; end if;
  reset role;
end $$;

-- Cleanup: deleting a profile removes its RSVPs and preference.
do $$
begin
  delete from public.profiles where id = pg_temp.ev(3);
  if exists (select 1 from public.event_rsvp where member_id = pg_temp.ev(3)) or exists (select 1 from public.member_event_pref where member_id = pg_temp.ev(3)) then
    raise exception 'FAIL: RSVP or preference survived the profile'; end if;
  delete from public.club_event where slug like 'zz-%';
  -- Leave no members behind for the later suites (search and deck counts).
  delete from public.profiles where id in (select pg_temp.ev(g) from generate_series(1, 6) g);
  delete from auth.users where id in (select pg_temp.ev(g) from generate_series(1, 6) g);
end $$;

select 'i-club-events: ALL PASSED' as result;
