-- 0034 (D-138): a crossing says roughly where; retention is one setting; stale or switched-off locations never notify.
-- W1 both members are told once, with the area (a town or city name, never digits or a cell); my_notifications_v2 has it.
-- W2 a live area older than 20 minutes never notifies, and a member who switched off is never found.
-- W3 purge_nearby follows nearby_retention (30 days by default, longer when set) and members cannot read the setting.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.cw(n int) returns uuid language sql immutable as $$
  select ('0e340000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;
create or replace function pg_temp.pulse(m uuid, lat float8) returns void language plpgsql as $$
begin
  update public.nearby_live set seen_at = now() - interval '5 minutes' where member_id = m;
  perform pg_temp.as_member(m);
  set local role authenticated;
  perform * from public.nearby_pulse(lat, 77.5946);
  reset role;
end $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9698, 77.7499, 7);
begin
  for g in 1..4 loop
    mid := pg_temp.cw(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Where ' || g, 'Where ' || g, 'where' || g || '@example.com', 'Designer', array['Friends'], array['Figma'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
    perform pg_temp.as_member(mid);
    set local role authenticated;
    perform public.set_nearby_enabled(true);
    reset role;
  end loop;
end $$;

-- W1
do $$
declare place text; v2 text;
begin
  perform pg_temp.pulse(pg_temp.cw(1), 12.9716);
  perform pg_temp.pulse(pg_temp.cw(2), 12.9716);
  select place_name into place from public.member_notification where user_id = pg_temp.cw(1) and source_user_id = pg_temp.cw(2);
  if place is null or place ~ '[0-9]' then raise exception 'FAIL W1: area %', place; end if;
  if (select place_name from public.member_notification where user_id = pg_temp.cw(2) and source_user_id = pg_temp.cw(1)) is distinct from place then
    raise exception 'FAIL W1: B has no area'; end if;
  perform pg_temp.pulse(pg_temp.cw(2), 12.9716);
  if (select count(*) from public.member_notification where user_id = pg_temp.cw(1) and source_user_id = pg_temp.cw(2)) <> 1 then
    raise exception 'FAIL W1: the same crossing notified twice'; end if;
  perform pg_temp.as_member(pg_temp.cw(1));
  set local role authenticated;
  select x.place_name into v2 from public.my_notifications_v2() x where x.source_user_id = pg_temp.cw(2);
  reset role;
  if v2 is distinct from place then raise exception 'FAIL W1: my_notifications_v2 area %', v2; end if;
end $$;
select 't-crossing-where.test W1 OK';

-- W2
do $$
begin
  -- C was here 25 minutes ago (stale): D arriving now is not told about C, and C is not told about D.
  perform pg_temp.pulse(pg_temp.cw(3), 12.9716);
  delete from public.member_notification where user_id = pg_temp.cw(3) or source_user_id = pg_temp.cw(3);
  update public.nearby_live set seen_at = now() - interval '25 minutes' where member_id = pg_temp.cw(3);
  perform pg_temp.pulse(pg_temp.cw(4), 12.9716);
  if exists (select 1 from public.member_notification where (user_id = pg_temp.cw(4) and source_user_id = pg_temp.cw(3))
                                                         or (user_id = pg_temp.cw(3) and source_user_id = pg_temp.cw(4))) then
    raise exception 'FAIL W2: a stale location notified'; end if;
  -- B switches Crossing Paths off: the live area is gone at once, and B is never found again.
  perform pg_temp.as_member(pg_temp.cw(2));
  set local role authenticated;
  perform public.set_nearby_enabled(false);
  reset role;
  if exists (select 1 from public.nearby_live where member_id = pg_temp.cw(2)) then raise exception 'FAIL W2: location kept after switching off'; end if;
  delete from public.member_notification where source_user_id = pg_temp.cw(2) or user_id = pg_temp.cw(2);
  perform pg_temp.pulse(pg_temp.cw(4), 12.9716);
  if exists (select 1 from public.member_notification where source_user_id = pg_temp.cw(2) or user_id = pg_temp.cw(2)) then
    raise exception 'FAIL W2: a member who switched off was found'; end if;
end $$;
select 't-crossing-where.test W2 OK';

-- W3
do $$
declare refused boolean := false;
begin
  insert into public.member_notification (user_id, source_user_id, notification_type, band, dedupe_key, created_at)
  values (pg_temp.cw(1), pg_temp.cw(4), 'nearby_appeared', '1', 'old:35', now() - interval '35 days');
  perform public.purge_nearby();
  if exists (select 1 from public.member_notification where dedupe_key = 'old:35') then raise exception 'FAIL W3: kept past 30 days'; end if;
  update public.nearby_retention set notification_days = 40;
  insert into public.member_notification (user_id, source_user_id, notification_type, band, dedupe_key, created_at)
  values (pg_temp.cw(1), pg_temp.cw(4), 'nearby_appeared', '1', 'old:35', now() - interval '35 days');
  perform public.purge_nearby();
  if not exists (select 1 from public.member_notification where dedupe_key = 'old:35') then raise exception 'FAIL W3: the setting was ignored'; end if;
  update public.nearby_retention set notification_days = 30;
  begin update public.nearby_retention set notification_days = 365; exception when check_violation then refused := true; end;
  if not refused then raise exception 'FAIL W3: a year of notifications was allowed'; end if;
  if has_table_privilege('authenticated', 'public.nearby_retention', 'select') then raise exception 'FAIL W3: members read the setting'; end if;
end $$;
select 't-crossing-where.test W3 OK';
rollback;
