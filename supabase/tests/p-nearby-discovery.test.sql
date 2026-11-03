-- 0029 (D-131): Nearby, discover members around you. Ids 0e290000-0000-4000-8000-0000000000NN:
-- 01 A (the viewer), 02 B (same spot), 03 C (~2 km), 04 D (~3.9 km), 05 E (~9 km), 06 F (switch off), 07 G (blocked by A),
-- 08 H (never turned it on).
-- D1 discovery needs the caller's switch on ('nearby off'), a live location ('location needed') and a valid radius.
-- D2 radius: 1 km -> B; 3 km -> B, C; 5 km -> B, C, D. E (9 km), F (off), G (blocked) and H (never on) never appear.
--    Bands are '1' / '3' / '5'; the result has no cell, coordinate or km column.
-- D3 symmetric: B discovers A. Sensitive interests are never shown, not even shared ones.
-- D4 a pass hides C from A for 7 days (C still sees A; nobody is told).
-- D5 connect: A -> B is 'sent' and marked via 'nearby'; B sees A with asked_me; A no longer sees B. B -> A matches
--    at once; each note reaches chat exactly once; both see the match in my_nearby_matches; neither sees the other.
-- D6 a request to someone not discoverable (E, 9 km) is sent but not marked 'nearby'.
-- D7 switching off removes the member at once (D disappears for A).
-- D8 privileges: anon runs nothing; the new table and the helpers are not reachable by clients.
-- D9 consent: a member who turned it on before 0029 (alerts only, discoverable_at null) neither appears nor discovers
--    until they turn it on again.
-- One transaction, rolled back.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.nd(n int) returns uuid language sql immutable as $$
  select ('0e290000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlerrm; end $$;
-- Who A (or anyone) sees: sorted ids, as the member.
create or replace function pg_temp.seen(m uuid, radius int) returns uuid[] language plpgsql as $$
declare r uuid[];
begin
  perform pg_temp.as_member(m);
  set local role authenticated;
  select coalesce(array_agg(d.member_id order by d.member_id), '{}') into r from public.nearby_discover(radius) d;
  reset role;
  return r;
end $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9698, 77.7499, 7);
begin
  for g in 1..8 loop
    mid := pg_temp.nd(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Near ' || g, 'Near ' || g, 'near' || g || '@example.com', 'Designer', array['Friends'], array['Figma'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  if not public.brivia_member_completed(pg_temp.nd(1)) then raise exception 'FAIL setup: A not completed'; end if;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.nd(1), pg_temp.nd(7)) on conflict do nothing;
end $$;

-- D1: A before turning it on.
do $$
declare e text;
begin
  perform pg_temp.as_member(pg_temp.nd(1));
  set local role authenticated;
  e := pg_temp.err('select * from public.nearby_discover(1)');
  if e <> 'nearby off' then raise exception 'FAIL D1: switch off gave %', e; end if;
  perform public.set_nearby_enabled(true);
  e := pg_temp.err('select * from public.nearby_discover(1)');
  if e <> 'location needed' then raise exception 'FAIL D1: no location gave %', e; end if;
  e := pg_temp.err('select * from public.nearby_discover(2)');
  if e <> 'invalid radius' then raise exception 'FAIL D1: radius 2 gave %', e; end if;
  reset role;
end $$;

-- Everyone but H turns it on and sends one fix (A and B the same spot; C +0.02 deg lat ~2.2 km; D +0.035 ~3.9 km;
-- E +0.08 ~8.9 km; F and G at A's spot). F then turns it off.
do $$
declare g int; lat float8;
begin
  for g in 1..7 loop
    lat := 12.9716 + case g when 3 then 0.02 when 4 then 0.035 when 5 then 0.08 else 0 end;
    perform pg_temp.as_member(pg_temp.nd(g));
    set local role authenticated;
    perform public.set_nearby_enabled(true);
    perform * from public.nearby_pulse(lat, 77.5946);
    reset role;
  end loop;
  perform pg_temp.as_member(pg_temp.nd(6));
  set local role authenticated;
  perform public.set_nearby_enabled(false);
  reset role;
  if exists (select 1 from public.nearby_live where member_id = pg_temp.nd(6)) then raise exception 'FAIL setup: F still live'; end if;
  if (select near_cell from public.nearby_live where member_id = pg_temp.nd(1)) !~ '^n8:' then raise exception 'FAIL setup: no near cell'; end if;
end $$;

-- D2
do $$
declare r record;
begin
  if pg_temp.seen(pg_temp.nd(1), 1) <> array[pg_temp.nd(2)] then raise exception 'FAIL D2: 1 km saw %', pg_temp.seen(pg_temp.nd(1), 1); end if;
  if pg_temp.seen(pg_temp.nd(1), 3) <> array[pg_temp.nd(2), pg_temp.nd(3)] then raise exception 'FAIL D2: 3 km saw %', pg_temp.seen(pg_temp.nd(1), 3); end if;
  if pg_temp.seen(pg_temp.nd(1), 5) <> array[pg_temp.nd(2), pg_temp.nd(3), pg_temp.nd(4)] then raise exception 'FAIL D2: 5 km saw %', pg_temp.seen(pg_temp.nd(1), 5); end if;
  perform pg_temp.as_member(pg_temp.nd(1));
  set local role authenticated;
  for r in select * from public.nearby_discover(5) loop
    if r.distance_band <> (case r.member_id when pg_temp.nd(2) then '1' when pg_temp.nd(3) then '3' else '5' end) then
      raise exception 'FAIL D2: % has band %', r.name, r.distance_band; end if;
    if r.place_name is distinct from 'Bengaluru' then raise exception 'FAIL D2: city %', r.place_name; end if;
  end loop;
  reset role;
  if pg_get_function_result('public.nearby_discover(int,int)'::regprocedure) ~* '(cell|lat|lng|km|metre|meter)' then
    raise exception 'FAIL D2: the result exposes a location column: %', pg_get_function_result('public.nearby_discover(int,int)'::regprocedure); end if;
end $$;

-- D3
do $$
declare s text := (select id from public.interest_node where sensitive and status = 'active' order by id limit 1); r record;
begin
  if s is null then raise exception 'FAIL setup: no sensitive node'; end if;
  -- As set_sensitive_consent and set_member_interests would leave them: consent given, points still summing to 20.
  update public.profiles set sensitive_consent_at = now() where id in (pg_temp.nd(1), pg_temp.nd(2));
  update public.member_interest set points = 19 where member_id in (pg_temp.nd(1), pg_temp.nd(2)) and interest_id = 'sports.racket.badminton';
  insert into public.member_interest (member_id, interest_id, points) values (pg_temp.nd(1), s, 1), (pg_temp.nd(2), s, 1) on conflict do nothing;
  if not public.brivia_member_completed(pg_temp.nd(1)) then raise exception 'FAIL setup D3: A no longer completed'; end if;
  if not (pg_temp.nd(1) = any (pg_temp.seen(pg_temp.nd(2), 1))) then raise exception 'FAIL D3: B cannot see A'; end if;
  perform pg_temp.as_member(pg_temp.nd(1));
  set local role authenticated;
  select * into r from public.nearby_discover(1) d where d.member_id = pg_temp.nd(2);
  reset role;
  if (select label from public.interest_node where id = s) = any (r.interests || r.shared_interests) then
    raise exception 'FAIL D3: a sensitive interest is shown'; end if;
  if not ('Badminton' = any (r.shared_interests)) or r.shared_count < 1 then raise exception 'FAIL D3: shared %', r.shared_interests; end if;
end $$;

-- D4
do $$
begin
  perform pg_temp.as_member(pg_temp.nd(1));
  set local role authenticated;
  perform public.nearby_pass(pg_temp.nd(3));
  reset role;
  if pg_temp.nd(3) = any (pg_temp.seen(pg_temp.nd(1), 3)) then raise exception 'FAIL D4: C still shown after a pass'; end if;
  if not (pg_temp.nd(1) = any (pg_temp.seen(pg_temp.nd(3), 3))) then raise exception 'FAIL D4: a pass hid A from C'; end if;
end $$;

-- D5
do $$
declare r record;
begin
  perform pg_temp.as_member(pg_temp.nd(1));
  set local role authenticated;
  select * into r from public.nearby_connect(pg_temp.nd(2), 'Hi! Saw you''re nearby. Let''s connect and share our interests.');
  reset role;
  if r.status <> 'sent' then raise exception 'FAIL D5: A -> B %', r.status; end if;
  if (select via from public.connection_requests where from_id = pg_temp.nd(1) and to_id = pg_temp.nd(2)) is distinct from 'nearby' then
    raise exception 'FAIL D5: request not marked nearby'; end if;
  if pg_temp.nd(2) = any (pg_temp.seen(pg_temp.nd(1), 1)) then raise exception 'FAIL D5: A still sees B after asking'; end if;
  perform pg_temp.as_member(pg_temp.nd(2));
  set local role authenticated;
  select * into r from public.nearby_discover(1) d where d.member_id = pg_temp.nd(1);
  if not coalesce(r.asked_me, false) then raise exception 'FAIL D5: B does not see that A asked'; end if;
  select * into r from public.nearby_connect(pg_temp.nd(1), 'Hello A, yes let''s!');
  reset role;
  if r.status <> 'matched' then raise exception 'FAIL D5: B -> A %', r.status; end if;
  if not public.brivia_is_connection(pg_temp.nd(1), pg_temp.nd(2)) then raise exception 'FAIL D5: no match'; end if;
  if (select count(*) from public.brivia_messages where sender_id = pg_temp.nd(1) and recipient_id = pg_temp.nd(2)) <> 1
     or (select count(*) from public.brivia_messages where sender_id = pg_temp.nd(2) and recipient_id = pg_temp.nd(1)) <> 1 then
    raise exception 'FAIL D5: each note must reach chat exactly once'; end if;
  perform pg_temp.as_member(pg_temp.nd(1));
  set local role authenticated;
  if not exists (select 1 from public.my_nearby_matches() m where m.other_id = pg_temp.nd(2)) then raise exception 'FAIL D5: A has no nearby match'; end if;
  perform pg_temp.as_member(pg_temp.nd(2));
  if not exists (select 1 from public.my_nearby_matches() m where m.other_id = pg_temp.nd(1)) then raise exception 'FAIL D5: B has no nearby match'; end if;
  reset role;
  if pg_temp.nd(1) = any (pg_temp.seen(pg_temp.nd(2), 1)) then raise exception 'FAIL D5: a connection is still discoverable'; end if;
end $$;

-- D6
do $$
declare r record;
begin
  perform pg_temp.as_member(pg_temp.nd(1));
  set local role authenticated;
  select * into r from public.nearby_connect(pg_temp.nd(5), 'Hi there');
  reset role;
  if r.status <> 'sent' then raise exception 'FAIL D6: %', r.status; end if;
  if (select via from public.connection_requests where from_id = pg_temp.nd(1) and to_id = pg_temp.nd(5)) is not null then
    raise exception 'FAIL D6: a far request was marked nearby'; end if;
end $$;

-- D7
do $$
begin
  if not (pg_temp.nd(4) = any (pg_temp.seen(pg_temp.nd(1), 5))) then raise exception 'FAIL D7: D not shown before'; end if;
  perform pg_temp.as_member(pg_temp.nd(4));
  set local role authenticated;
  perform public.set_nearby_enabled(false);
  reset role;
  if pg_temp.nd(4) = any (pg_temp.seen(pg_temp.nd(1), 5)) then raise exception 'FAIL D7: D still shown after turning off'; end if;
end $$;

-- D8
do $$
declare f text;
begin
  foreach f in array array['public.nearby_discover(int,int)', 'public.nearby_pass(uuid)', 'public.nearby_connect(uuid,text)', 'public.my_nearby_matches()'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL D8: anon can run %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL D8: members cannot run %', f; end if;
  end loop;
  foreach f in array array['public.brivia_nearby_pool(uuid,double precision)', 'public.brivia_near_cell(double precision,double precision)', 'public.brivia_near_km(text,text)'] loop
    if has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL D8: members can run %', f; end if;
  end loop;
  if has_table_privilege('authenticated', 'public.nearby_passed', 'select') then raise exception 'FAIL D8: nearby_passed is readable'; end if;
end $$;
-- D9: C's consent is set back to a pre-0029 one.
do $$
declare e text;
begin
  update public.nearby_setting set discoverable_at = null where member_id = pg_temp.nd(3);
  if pg_temp.nd(3) = any (pg_temp.seen(pg_temp.nd(2), 3)) then raise exception 'FAIL D9: an alerts-only member appears'; end if;
  perform pg_temp.as_member(pg_temp.nd(3));
  set local role authenticated;
  e := pg_temp.err('select * from public.nearby_discover(3)');
  if e <> 'nearby off' then raise exception 'FAIL D9: an alerts-only member discovers (%)', e; end if;
  if not public.my_nearby_setting() then raise exception 'FAIL D9: the alerts switch was lost'; end if;
  perform public.set_nearby_enabled(true);
  reset role;
  if not (pg_temp.nd(3) = any (pg_temp.seen(pg_temp.nd(2), 3))) then raise exception 'FAIL D9: turning it on again did not make C discoverable'; end if;
end $$;
rollback;
