-- 0023 (D-123): Find a Companion, event-based mutual matching. Ids 0e230000-0000-4000-8000-0000000000NN: 01 A, 02 B,
-- 03 C, 04 K (A blocked K), 05 D (registered, not looking), 06 P (looking, payment pending).
-- L1 structure: swipes and matches have RLS on and no client grants; anon runs nothing; the pair check and order hold.
-- L2 the deck: only opted-in, visible others in the pool for that event (not the caller, D or K; since 0025 P's payment
--    hold is in the pool too); none for a caller who is not looking; a location band only (no cell, km or coordinate column).
-- L3 one like is invisible: no match, no connection; the liked member still sees the liker as an ordinary card.
-- L4 the second like matches: one event match, one Brivia connection, the second swiper has seen it, the first has not
--    (their notification) until mark_companion_match_seen; a repeat swipe changes nothing (no duplicate).
-- L5 a pass hides the member in that event only, and a later like from them makes no match.
-- L6 swiping someone outside the pool or blocked is refused (22023 'not available'); a non-looking caller too.
-- L7 per event: a second event keeps its own deck; an existing connection is not offered again.
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.cm(n int) returns uuid language sql immutable as $$
  select ('0e230000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;
create or replace function pg_temp.code_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlstate || ':' || sqlerrm; end $$;
create temp table l_ids (k text primary key, id uuid);
grant all on l_ids to authenticated;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9698, 77.7499, 7); e1 uuid; e2 uuid;
begin
  for g in 1..6 loop
    mid := pg_temp.cm(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Comp ' || g, 'Comp ' || g, 'comp' || g || '@example.com', 'Some years', array['Friends'], array['Chess'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  if not public.brivia_member_completed(pg_temp.cm(1)) then raise exception 'FAIL setup: A must be completed'; end if;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.cm(1), pg_temp.cm(4)) on conflict do nothing;
  insert into public.club_event (slug, title, category, venue_name, venue_area, venue_cell, starts_at, ends_at)
  values ('zz-comp-1', 'Acoustic Test', 'music', 'Hall', 'Whitefield, Bengaluru', cell, now() + interval '2 days', now() + interval '2 days 3 hours'),
         ('zz-comp-2', 'Chess Test', 'games', 'Board Room', 'Whitefield, Bengaluru', cell, now() + interval '3 days', now() + interval '3 days 3 hours')
  on conflict (slug) do nothing;
  select id into e1 from public.club_event where slug = 'zz-comp-1';
  select id into e2 from public.club_event where slug = 'zz-comp-2';
  insert into l_ids values ('e1', e1), ('e2', e2);
  insert into public.event_rsvp (event_id, member_id, wants_companion, status) values
    (e1, pg_temp.cm(1), true, 'confirmed'), (e1, pg_temp.cm(2), true, 'confirmed'), (e1, pg_temp.cm(3), true, 'confirmed'),
    (e1, pg_temp.cm(4), true, 'confirmed'), (e1, pg_temp.cm(5), false, 'confirmed'), (e1, pg_temp.cm(6), true, 'pending_payment'),
    (e2, pg_temp.cm(1), true, 'confirmed'), (e2, pg_temp.cm(2), true, 'confirmed'), (e2, pg_temp.cm(3), true, 'confirmed')
  on conflict do nothing;
end $$;

-- L1
do $$
declare t text; f text;
begin
  foreach t in array array['public.event_companion_swipe', 'public.event_companion_match'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then raise exception 'FAIL L1: % has no RLS', t; end if;
    if has_table_privilege('authenticated', t, 'select') or has_table_privilege('authenticated', t, 'insert')
       or has_table_privilege('anon', t, 'select') then raise exception 'FAIL L1: % has client grants', t; end if;
  end loop;
  foreach f in array array['public.companion_events()', 'public.companion_deck(uuid, integer)', 'public.companion_swipe(uuid, uuid, boolean)',
                           'public.my_companion_matches()', 'public.mark_companion_match_seen(uuid)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL L1: anon can run %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL L1: members cannot run %', f; end if;
  end loop;
end $$;

-- L2
do $$
declare e1 uuid := (select id from l_ids where k = 'e1'); n int; r record; cols text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.cm(1));
  select count(*) into n from public.companion_deck(e1, 20);
  if n <> 3 then raise exception 'FAIL L2: A should see B, C and P only, got %', n; end if;
  if exists (select 1 from public.companion_deck(e1, 20) where member_id in (pg_temp.cm(1), pg_temp.cm(4), pg_temp.cm(5))) then
    raise exception 'FAIL L2: the caller, a blocked or a not-looking member is listed'; end if;
  select * into r from public.companion_deck(e1, 20) where member_id = pg_temp.cm(2);
  if r.distance_band <> '~3 km' or r.shared_count <> 1 or r.shared_interests[1] is null then raise exception 'FAIL L2: card %', r; end if;
  if (select to_see from public.companion_events() where event_id = e1) <> 3 then raise exception 'FAIL L2: companion_events count'; end if;
  perform pg_temp.as_member(pg_temp.cm(5));
  if exists (select 1 from public.companion_deck(e1, 20)) then raise exception 'FAIL L2: a member not looking sees cards'; end if;
  perform pg_temp.as_member(pg_temp.cm(6));
  if not exists (select 1 from public.companion_deck(e1, 20)) then raise exception 'FAIL L2: a payment hold must see cards (0025)'; end if;
  reset role;
  if exists (select 1 from information_schema.routines rt join information_schema.parameters pa on pa.specific_name = rt.specific_name
              where rt.routine_name = 'companion_deck' and pa.parameter_mode = 'OUT' and pa.parameter_name ~ '(cell|km|lat|lng|city|email|phone)') then
    raise exception 'FAIL L2: the deck returns a location or contact column'; end if;
end $$;

-- L3, L4
do $$
declare e1 uuid := (select id from l_ids where k = 'e1'); r record; m uuid;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.cm(1));
  select * into r from public.companion_swipe(e1, pg_temp.cm(2), true);
  if r.matched then raise exception 'FAIL L3: one like must not match'; end if;
  if exists (select 1 from public.my_companion_matches()) then raise exception 'FAIL L3: A has a match after one like'; end if;
  if exists (select 1 from public.companion_deck(e1, 20) where member_id = pg_temp.cm(2)) then raise exception 'FAIL L3: B stays in A''s deck'; end if;
  perform pg_temp.as_member(pg_temp.cm(2));
  if not exists (select 1 from public.companion_deck(e1, 20) where member_id = pg_temp.cm(1)) then raise exception 'FAIL L3: B must still see A'; end if;
  reset role;
  if public.brivia_is_connection(pg_temp.cm(1), pg_temp.cm(2)) then raise exception 'FAIL L3: a connection after one like'; end if;
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.cm(2));
  select * into r from public.companion_swipe(e1, pg_temp.cm(1), true);
  if not r.matched or r.match_id is null then raise exception 'FAIL L4: two likes must match'; end if;
  m := r.match_id;
  select * into r from public.companion_swipe(e1, pg_temp.cm(1), false);
  if not r.matched or r.match_id <> m then raise exception 'FAIL L4: a repeat swipe changes nothing'; end if;
  if not (select seen from public.my_companion_matches() where match_id = m) then raise exception 'FAIL L4: the second swiper has seen it'; end if;
  perform pg_temp.as_member(pg_temp.cm(1));
  select * into r from public.my_companion_matches() where match_id = m;
  if r.seen or r.other_id <> pg_temp.cm(2) or r.event_title <> 'Acoustic Test' then raise exception 'FAIL L4: A''s notification %', r; end if;
  if not public.mark_companion_match_seen(m) then raise exception 'FAIL L4: mark seen'; end if;
  if not (select seen from public.my_companion_matches() where match_id = m) then raise exception 'FAIL L4: seen not kept'; end if;
  reset role;
  if (select count(*) from public.event_companion_match where event_id = e1) <> 1 then raise exception 'FAIL L4: duplicate match'; end if;
  if not public.brivia_is_connection(pg_temp.cm(1), pg_temp.cm(2)) then raise exception 'FAIL L4: no Brivia connection (chat)'; end if;
end $$;

-- L5, L6
do $$
declare e1 uuid := (select id from l_ids where k = 'e1'); r record; c text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.cm(1));
  perform public.companion_swipe(e1, pg_temp.cm(3), false);
  if exists (select 1 from public.companion_deck(e1, 20) where member_id = pg_temp.cm(3)) then raise exception 'FAIL L5: a pass must hide C'; end if;
  perform pg_temp.as_member(pg_temp.cm(3));
  select * into r from public.companion_swipe(e1, pg_temp.cm(1), true);
  if r.matched then raise exception 'FAIL L5: a like after a pass must not match'; end if;
  perform pg_temp.as_member(pg_temp.cm(1));
  c := pg_temp.code_of(format('select public.companion_swipe(%L, %L, true)', e1, pg_temp.cm(5)));
  if c not like '22023:not available%' then raise exception 'FAIL L6: a member not looking gave %', c; end if;
  c := pg_temp.code_of(format('select public.companion_swipe(%L, %L, true)', e1, pg_temp.cm(4)));
  if c not like '22023:not available%' then raise exception 'FAIL L6: a blocked member gave %', c; end if;
  perform pg_temp.as_member(pg_temp.cm(5));
  c := pg_temp.code_of(format('select public.companion_swipe(%L, %L, true)', e1, pg_temp.cm(1)));
  if c not like '22023:not looking%' then raise exception 'FAIL L6: a caller not looking gave %', c; end if;
  reset role;
end $$;

-- L7
do $$
declare e2 uuid := (select id from l_ids where k = 'e2');
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.cm(1));
  if not exists (select 1 from public.companion_deck(e2, 20) where member_id = pg_temp.cm(3)) then
    raise exception 'FAIL L7: a pass at one event must not hide C at another'; end if;
  if exists (select 1 from public.companion_deck(e2, 20) where member_id = pg_temp.cm(2)) then
    raise exception 'FAIL L7: an existing connection is offered again'; end if;
  reset role;
end $$;

do $$
begin
  delete from public.club_event where slug like 'zz-comp-%';
  if exists (select 1 from public.event_companion_swipe where actor_id = pg_temp.cm(1)) then raise exception 'FAIL: swipes survived the event'; end if;
  delete from public.matches where user1_id in (select pg_temp.cm(g) from generate_series(1, 6) g) or user2_id in (select pg_temp.cm(g) from generate_series(1, 6) g);
  delete from public.profiles where id in (select pg_temp.cm(g) from generate_series(1, 6) g);
  delete from auth.users where id in (select pg_temp.cm(g) from generate_series(1, 6) g);
end $$;

select 'l-event-companions: ALL PASSED' as result;
