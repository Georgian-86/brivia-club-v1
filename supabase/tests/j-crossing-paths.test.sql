-- 0021 (D-119): Crossing paths. nearby_setting, nearby_live, nearby_move, nearby_mute, nearby_alert and the RPCs
-- set_nearby_enabled, my_nearby_setting, nearby_pulse, nearby_clear, my_nearby_alerts, set_nearby_muted.
-- Ids 0d210000-0000-4000-8000-0000000000NN:
--   01 A; 02 B, 03 C, 06 F, 07 G, 08 H, 09 I are A's matches; 04 D is not; 05 E is A's match but a test member
--   (another world). F's home is A's home cell (neighbours). Homes are geolocated (precision 'cell') unless noted.
-- N1 grants: authenticated may execute the six RPCs, anon may not; no table is readable; no table has a coordinate column.
-- N2 off by default; a pulse while off stores nothing and returns nothing.
-- N3 both on and within 3 km: the pulse returns the other member, both get an alert row, both list it.
-- N4 no alert when far (> 3 km), not a match, another world, the other member is off, or the other live cell is stale.
-- N5 one alert per pair per 24 h; N6 a pulse within 4 minutes is PT429; N7 neighbours (homes within 3 km) are skipped;
-- N8 a mute stops alerts both ways and hides the alert; N9 at most 3 alerts per member per 24 h;
-- N10 turning off and nearby_clear delete the live cell; a block hides the alert;
-- N11 at most 24 changes of live cell per 24 h (PT429); N12 invalid location 22023, no session 42501;
-- N13 purge_nearby removes stale rows; deleting a profile deletes its rows.
set brivia.harness_autocomplete = 'off';
create or replace function pg_temp.np(n int) returns uuid language sql immutable as $$
  select ('0d210000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(n int) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.np(n))::text, false); end $$;
-- Let a member pulse again (skips the 4-minute rate limit) without making their live cell stale.
create or replace function pg_temp.rewind(n int) returns void language sql as $$
  update public.nearby_live set seen_at = now() - interval '5 minutes' where member_id = pg_temp.np(n) $$;

do $$
declare g int; home_a text := public.brivia_grid_cell(19.0760, 72.8777, 7); home_far text := public.brivia_grid_cell(28.6139, 77.2090, 7);
begin
  for g in 1..9 loop
    insert into auth.users(id) values (pg_temp.np(g)) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, is_test)
    values (pg_temp.np(g), 'Npath ' || g, 'Npath ' || g, 'npath' || g || '@example.com', 'Some years', array['Friends'], g = 5)
    on conflict (id) do nothing;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (pg_temp.np(g), case when g in (1, 6) then home_a else home_far end,
            public.brivia_grid_parent(case when g in (1, 6) then home_a else home_far end, 6),
            public.brivia_grid_parent(case when g in (1, 6) then home_a else home_far end, 5), 'in-mumbai', 'cell')
    on conflict (member_id) do nothing;
  end loop;
  insert into public.member_interest (member_id, interest_id, points)
  values (pg_temp.np(1), 'sports.racket.tennis', 20), (pg_temp.np(2), 'sports.racket.tennis', 20) on conflict do nothing;
  insert into public.matches (user1_id, user2_id)
  select pg_temp.np(1), pg_temp.np(x.k) from unnest(array[2, 3, 5, 6, 7, 8, 9]) x(k) on conflict do nothing;
end $$;

-- N1
do $$
declare f text;
begin
  foreach f in array array['public.set_nearby_enabled(boolean)', 'public.my_nearby_setting()',
                           'public.nearby_pulse(double precision, double precision)', 'public.nearby_clear()',
                           'public.my_nearby_alerts()', 'public.set_nearby_muted(uuid, boolean)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL N1: anon may execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL N1: authenticated may not execute %', f; end if;
  end loop;
  foreach f in array array['public.purge_nearby()', 'public.brivia_nearby_pair_ok(uuid, uuid)'] loop
    if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
      raise exception 'FAIL N1: a client may execute %', f; end if;
  end loop;
  foreach f in array array['public.nearby_setting', 'public.nearby_live', 'public.nearby_move', 'public.nearby_mute', 'public.nearby_alert'] loop
    if has_table_privilege('authenticated', f, 'select') or has_table_privilege('anon', f, 'select')
       or has_table_privilege('authenticated', f, 'insert') then
      raise exception 'FAIL N1: % is reachable directly', f; end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name like 'nearby\_%'
              and data_type in ('double precision', 'real', 'numeric', 'point')) then
    raise exception 'FAIL N1: a nearby table has a coordinate-like column'; end if;
  if pg_get_function_result('public.nearby_pulse(double precision, double precision)'::regprocedure) <> 'TABLE(other_id uuid, created_at timestamp with time zone)'
     or pg_get_function_result('public.my_nearby_alerts()'::regprocedure) <> 'TABLE(other_id uuid, created_at timestamp with time zone, shared_interest text)' then
    raise exception 'FAIL N1: unexpected result shape'; end if;
end $$;
select 'j-crossing-paths.test N1 OK';

-- N2
do $$
begin
  perform pg_temp.as_member(1);
  if public.my_nearby_setting() then raise exception 'FAIL N2: on by default'; end if;
  if exists (select 1 from public.nearby_pulse(12.9756, 77.6050)) then raise exception 'FAIL N2: a pulse while off returned rows'; end if;
  if exists (select 1 from public.nearby_live where member_id = pg_temp.np(1)) then raise exception 'FAIL N2: a pulse while off stored a cell'; end if;
end $$;
select 'j-crossing-paths.test N2 OK';

-- N3: A and B on, B ~1.6 km from A.
do $$
declare n int;
begin
  perform pg_temp.as_member(1);
  if not public.set_nearby_enabled(true) then raise exception 'FAIL N3: switch did not turn on'; end if;
  if not public.my_nearby_setting() then raise exception 'FAIL N3: setting not read back'; end if;
  if (select enabled_at from public.nearby_setting where member_id = pg_temp.np(1)) is null then raise exception 'FAIL N3: no consent time'; end if;
  if exists (select 1 from public.nearby_pulse(12.9756, 77.6050)) then raise exception 'FAIL N3: alone, yet alerted'; end if;
  perform pg_temp.as_member(2);
  perform public.set_nearby_enabled(true);
  select count(*) into n from public.nearby_pulse(12.9900, 77.6050) p where p.other_id = pg_temp.np(1);
  if n <> 1 then raise exception 'FAIL N3: B was not told A is nearby (%)', n; end if;
  if (select count(*) from public.nearby_alert where (member_id, other_id) in ((pg_temp.np(1), pg_temp.np(2)), (pg_temp.np(2), pg_temp.np(1)))) <> 2 then
    raise exception 'FAIL N3: expected one alert row each way'; end if;
  if not exists (select 1 from public.my_nearby_alerts() a where a.other_id = pg_temp.np(1)) then raise exception 'FAIL N3: B does not list A'; end if;
  if (select a.shared_interest from public.my_nearby_alerts() a where a.other_id = pg_temp.np(1))
     is distinct from (select label from public.interest_node where id = 'sports.racket.tennis') then
    raise exception 'FAIL N3: the shared interest is missing'; end if;
  perform pg_temp.as_member(1);
  if not exists (select 1 from public.my_nearby_alerts() a where a.other_id = pg_temp.np(2)) then raise exception 'FAIL N3: A does not list B'; end if;
  if (select cell from public.nearby_live where member_id = pg_temp.np(1)) !~ '^g7:' then raise exception 'FAIL N3: live cell is not a g7 cell'; end if;
end $$;
select 'j-crossing-paths.test N3 OK';

-- N4: C far (Hebbal, ~14 km), D not a match, E another world, G off, H stale.
do $$
begin
  perform pg_temp.as_member(3); perform public.set_nearby_enabled(true);
  if exists (select 1 from public.nearby_pulse(13.1000, 77.6000)) then raise exception 'FAIL N4: a far member was alerted'; end if;
  perform pg_temp.as_member(4); perform public.set_nearby_enabled(true);
  if exists (select 1 from public.nearby_pulse(12.9760, 77.6055)) then raise exception 'FAIL N4: a non-match was alerted'; end if;
  perform pg_temp.as_member(5); perform public.set_nearby_enabled(true);
  if exists (select 1 from public.nearby_pulse(12.9760, 77.6055)) then raise exception 'FAIL N4: another world was alerted'; end if;
  perform pg_temp.as_member(7);   -- G is off
  if exists (select 1 from public.nearby_pulse(12.9760, 77.6055)) then raise exception 'FAIL N4: a member who is off was alerted'; end if;
  if exists (select 1 from public.nearby_alert where member_id = pg_temp.np(1) and other_id in (pg_temp.np(3), pg_temp.np(4), pg_temp.np(5), pg_temp.np(7))) then
    raise exception 'FAIL N4: A got an alert it should not have'; end if;
  -- A stale: H on and nearby, but A's live cell is 25 minutes old.
  update public.nearby_live set seen_at = now() - interval '25 minutes' where member_id = pg_temp.np(1);
  perform pg_temp.as_member(8); perform public.set_nearby_enabled(true);
  if exists (select 1 from public.nearby_pulse(12.9760, 77.6055)) then raise exception 'FAIL N4: a stale live cell counted'; end if;
  update public.nearby_live set seen_at = now() - interval '5 minutes' where member_id = pg_temp.np(1);
end $$;
select 'j-crossing-paths.test N4 OK';

-- N5, N6
do $$
declare code text;
begin
  perform pg_temp.as_member(2); perform pg_temp.rewind(2);
  if exists (select 1 from public.nearby_pulse(12.9900, 77.6050) p where p.other_id = pg_temp.np(1)) then raise exception 'FAIL N5: a second alert within 24 h'; end if;
  begin perform public.nearby_pulse(12.9900, 77.6050); exception when others then code := sqlstate; end;
  if code is distinct from 'PT429' then raise exception 'FAIL N6: a pulse within 4 minutes gave %', coalesce(code, 'no error'); end if;
end $$;
select 'j-crossing-paths.test N5 N6 OK';

-- N7: F's home is A's home cell.
do $$
begin
  perform pg_temp.as_member(6); perform public.set_nearby_enabled(true);
  if exists (select 1 from public.nearby_pulse(12.9760, 77.6055)) then raise exception 'FAIL N7: neighbours were alerted'; end if;
  -- the skip needs both homes geolocated: as a city pick, F is alerted
  update public.member_orbit set precision = 'place' where member_id = pg_temp.np(6);
  perform pg_temp.rewind(6);
  if not exists (select 1 from public.nearby_pulse(12.9760, 77.6055) p where p.other_id = pg_temp.np(1)) then
    raise exception 'FAIL N7: a city picker was treated as a neighbour'; end if;
end $$;
select 'j-crossing-paths.test N7 OK';

-- N8: A mutes C; C comes close.
do $$
begin
  perform pg_temp.as_member(1); perform public.set_nearby_muted(pg_temp.np(3), true);
  perform pg_temp.as_member(3); perform pg_temp.rewind(3);
  if exists (select 1 from public.nearby_pulse(12.9760, 77.6055)) then raise exception 'FAIL N8: a mute did not stop the alert'; end if;
  perform pg_temp.as_member(1); perform public.set_nearby_muted(pg_temp.np(6), true);
  if exists (select 1 from public.my_nearby_alerts() a where a.other_id = pg_temp.np(6)) then raise exception 'FAIL N8: a muted alert is listed'; end if;
  perform public.set_nearby_muted(pg_temp.np(3), false);
  if exists (select 1 from public.nearby_mute where member_id = pg_temp.np(1) and other_id = pg_temp.np(3)) then raise exception 'FAIL N8: unmute failed'; end if;
end $$;
select 'j-crossing-paths.test N8 OK';

-- N9: A has 2 alerts in 24 h (B, F). G turns on: third. H, then C: over the cap.
do $$
begin
  perform pg_temp.as_member(7); perform public.set_nearby_enabled(true); perform pg_temp.rewind(7);
  if not exists (select 1 from public.nearby_pulse(12.9760, 77.6055) p where p.other_id = pg_temp.np(1)) then raise exception 'FAIL N9: third alert missing'; end if;
  perform pg_temp.as_member(8); perform pg_temp.rewind(8);
  if exists (select 1 from public.nearby_pulse(12.9760, 77.6055)) then raise exception 'FAIL N9: a fourth alert for A'; end if;
  if (select count(*) from public.nearby_alert where member_id = pg_temp.np(1)) <> 3 then raise exception 'FAIL N9: A has % alerts', (select count(*) from public.nearby_alert where member_id = pg_temp.np(1)); end if;
end $$;
select 'j-crossing-paths.test N9 OK';

-- N10
do $$
begin
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.np(2), pg_temp.np(1)) on conflict do nothing;
  perform pg_temp.as_member(1);
  if exists (select 1 from public.my_nearby_alerts() a where a.other_id = pg_temp.np(2)) then raise exception 'FAIL N10: a blocked pair is listed'; end if;
  delete from public.brivia_blocks where blocker_id = pg_temp.np(2) and blocked_id = pg_temp.np(1);
  perform public.set_nearby_enabled(false);
  if exists (select 1 from public.nearby_live where member_id = pg_temp.np(1)) then raise exception 'FAIL N10: off kept the live cell'; end if;
  if (select enabled_at from public.nearby_setting where member_id = pg_temp.np(1)) is not null then raise exception 'FAIL N10: off kept the consent time'; end if;
  if exists (select 1 from public.my_nearby_alerts()) then raise exception 'FAIL N10: alerts listed while off'; end if;
  perform pg_temp.as_member(2);
  perform public.nearby_clear();
  if exists (select 1 from public.nearby_live where member_id = pg_temp.np(2)) then raise exception 'FAIL N10: nearby_clear kept the live cell'; end if;
end $$;
select 'j-crossing-paths.test N10 OK';

-- N11, N12
do $$
declare code text;
begin
  perform pg_temp.as_member(9); perform public.set_nearby_enabled(true);
  insert into public.nearby_move (member_id) select pg_temp.np(9) from generate_series(1, 24);
  begin perform public.nearby_pulse(12.9760, 77.6055); exception when others then code := sqlstate; end;
  if code is distinct from 'PT429' then raise exception 'FAIL N11: the 25th move gave %', coalesce(code, 'no error'); end if;
  code := null;
  begin perform public.nearby_pulse(91, 0); exception when others then code := sqlstate; end;
  if code is distinct from '22023' then raise exception 'FAIL N12: invalid location gave %', coalesce(code, 'no error'); end if;
  perform set_config('request.jwt.claims', '{}', false);
  code := null;
  begin perform public.nearby_pulse(12.9760, 77.6055); exception when others then code := sqlstate; end;
  if code is distinct from '42501' then raise exception 'FAIL N12: no session gave %', coalesce(code, 'no error'); end if;
end $$;
select 'j-crossing-paths.test N11 N12 OK';

-- N13
do $$
begin
  update public.nearby_live set seen_at = now() - interval '30 minutes' where member_id = pg_temp.np(3);
  update public.nearby_alert set created_at = now() - interval '25 hours' where member_id = pg_temp.np(7);
  update public.nearby_move set at = now() - interval '25 hours' where member_id = pg_temp.np(9);
  perform public.purge_nearby();
  if exists (select 1 from public.nearby_live where member_id = pg_temp.np(3)) then raise exception 'FAIL N13: stale live cell kept'; end if;
  if exists (select 1 from public.nearby_alert where member_id = pg_temp.np(7)) then raise exception 'FAIL N13: old alert kept'; end if;
  if exists (select 1 from public.nearby_move where member_id = pg_temp.np(9)) then raise exception 'FAIL N13: old move kept'; end if;
end $$;
delete from public.matches where user1_id::text like '0d210000-%' or user2_id::text like '0d210000-%';
delete from public.profiles where id = pg_temp.np(6);
do $$ begin
  if exists (select 1 from public.nearby_setting where member_id = pg_temp.np(6))
     or exists (select 1 from public.nearby_live where member_id = pg_temp.np(6))
     or exists (select 1 from public.nearby_alert where member_id = pg_temp.np(6) or other_id = pg_temp.np(6))
     or exists (select 1 from public.nearby_mute where other_id = pg_temp.np(6)) then
    raise exception 'FAIL N13: nearby rows outlived the profile'; end if;
end $$;
select 'j-crossing-paths.test N13 OK';
select set_config('request.jwt.claims', '{}', false);
delete from public.member_interest where member_id::text like '0d210000-%';
delete from public.member_orbit where member_id::text like '0d210000-%';
delete from public.profiles where id::text like '0d210000-%';
delete from auth.users where id::text like '0d210000-%';
