-- 0030 (D-134): Nearby notifications, one store synced across devices, push subscriptions, 10 km.
-- Ids 0e300000-0000-4000-8000-0000000000NN: 01 A, 02 B (same spot), 03 C (~2.2 km), 04 D (~8 km), 05 E (off).
-- N1 when B arrives within A's radius (and A within B's), each is told once ("nearby_appeared", band '1').
-- N2 a later pulse the same day tells nobody again (dedupe), and E (switch off) is never told nor announced.
-- N3 radius is the recipient's: C (~2 km) is not announced to A at 1 km; after A picks 3 km and C pulses, A is told,
--    C (1 km) is not.
-- N4 10 km: discover accepts 10 and D shows with band '10'; 2 is refused.
-- N5 RLS: a member reads only their own notifications and cannot write any; the table is in supabase_realtime.
-- N6 read once everywhere: mark_notifications_read sets read_at once; another member cannot mark mine; dismiss sets
--    dismissed_at and read_at.
-- N7 my_notifications carries the name; a blocked member's notifications are hidden.
-- N8 push subscriptions: https only, not readable by members, deleted only by their owner.
-- One transaction, rolled back.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.nt(n int) returns uuid language sql immutable as $$
  select ('0e300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;
create or replace function pg_temp.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlerrm; end $$;
create or replace function pg_temp.pulse(m uuid, lat float8) returns void language plpgsql as $$
begin
  update public.nearby_live set seen_at = now() - interval '5 minutes' where member_id = m;   -- past the 4-minute cap
  perform pg_temp.as_member(m);
  set local role authenticated;
  perform * from public.nearby_pulse(lat, 77.5946);
  reset role;
end $$;
create or replace function pg_temp.told(m uuid, src uuid) returns int language sql as $$
  select count(*)::int from public.member_notification where user_id = m and source_user_id = src and notification_type = 'nearby_appeared' $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9698, 77.7499, 7);
begin
  for g in 1..5 loop
    mid := pg_temp.nt(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Notif ' || g, 'Notif ' || g, 'notif' || g || '@example.com', 'Designer', array['Friends'], array['Figma'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
    perform pg_temp.as_member(mid);
    set local role authenticated;
    perform public.set_nearby_enabled(g <> 5);
    reset role;
  end loop;
end $$;

-- N1
do $$
begin
  perform pg_temp.pulse(pg_temp.nt(1), 12.9716);
  if exists (select 1 from public.member_notification where user_id in (pg_temp.nt(1), pg_temp.nt(2))) then raise exception 'FAIL N1: told before B was around'; end if;
  perform pg_temp.pulse(pg_temp.nt(2), 12.9716);
  if pg_temp.told(pg_temp.nt(1), pg_temp.nt(2)) <> 1 or pg_temp.told(pg_temp.nt(2), pg_temp.nt(1)) <> 1 then
    raise exception 'FAIL N1: A told % times, B told % times', pg_temp.told(pg_temp.nt(1), pg_temp.nt(2)), pg_temp.told(pg_temp.nt(2), pg_temp.nt(1)); end if;
  if (select band from public.member_notification where user_id = pg_temp.nt(1) and source_user_id = pg_temp.nt(2)) <> '1' then raise exception 'FAIL N1: band'; end if;
end $$;

-- N2
do $$
begin
  perform pg_temp.pulse(pg_temp.nt(1), 12.9716);
  perform pg_temp.pulse(pg_temp.nt(2), 12.9716);
  if pg_temp.told(pg_temp.nt(1), pg_temp.nt(2)) <> 1 or pg_temp.told(pg_temp.nt(2), pg_temp.nt(1)) <> 1 then raise exception 'FAIL N2: told again'; end if;
  perform pg_temp.pulse(pg_temp.nt(5), 12.9716);   -- off: the pulse stores nothing
  if exists (select 1 from public.member_notification where user_id = pg_temp.nt(5) or source_user_id = pg_temp.nt(5)) then raise exception 'FAIL N2: a member with it off was involved'; end if;
end $$;

-- N3
do $$
begin
  perform pg_temp.pulse(pg_temp.nt(3), 12.9916);
  if pg_temp.told(pg_temp.nt(1), pg_temp.nt(3)) <> 0 then raise exception 'FAIL N3: told outside my 1 km'; end if;
  perform pg_temp.as_member(pg_temp.nt(1));
  set local role authenticated;
  if public.set_nearby_radius(3) <> 3 then raise exception 'FAIL N3: radius not saved'; end if;
  if pg_temp.err('select public.set_nearby_radius(2)') <> 'invalid radius' then raise exception 'FAIL N3: radius 2 accepted'; end if;
  reset role;
  perform pg_temp.pulse(pg_temp.nt(3), 12.9916);
  if pg_temp.told(pg_temp.nt(1), pg_temp.nt(3)) <> 1 then raise exception 'FAIL N3: not told within my 3 km'; end if;
  if pg_temp.told(pg_temp.nt(3), pg_temp.nt(1)) <> 0 then raise exception 'FAIL N3: C told outside their 1 km'; end if;
end $$;

-- N4
do $$
declare r record;
begin
  perform pg_temp.pulse(pg_temp.nt(4), 13.0436);
  perform pg_temp.as_member(pg_temp.nt(1));
  set local role authenticated;
  select * into r from public.nearby_discover(10) d where d.member_id = pg_temp.nt(4);
  if r.distance_band is distinct from '10' then raise exception 'FAIL N4: D at 10 km has band %', r.distance_band; end if;
  if pg_temp.err('select * from public.nearby_discover(2)') <> 'invalid radius' then raise exception 'FAIL N4: radius 2 accepted'; end if;
  reset role;
end $$;

-- N5
do $$
declare n int;
begin
  perform pg_temp.as_member(pg_temp.nt(1));
  set local role authenticated;
  select count(*) into n from public.member_notification where user_id <> pg_temp.nt(1);
  if n <> 0 then raise exception 'FAIL N5: a member sees % notifications of others', n; end if;
  if (select count(*) from public.member_notification) < 1 then raise exception 'FAIL N5: a member cannot see their own'; end if;
  if pg_temp.err('update public.member_notification set read_at = now()') !~ 'permission denied' then raise exception 'FAIL N5: a client can update'; end if;
  if pg_temp.err(format('insert into public.member_notification (user_id, notification_type, dedupe_key) values (%L, ''nearby_appeared'', ''x'')', pg_temp.nt(1))) !~ 'permission denied' then
    raise exception 'FAIL N5: a client can insert'; end if;
  reset role;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'member_notification') then
    raise exception 'FAIL N5: not in supabase_realtime'; end if;
end $$;

-- N6
do $$
declare v_id uuid := (select id from public.member_notification where user_id = pg_temp.nt(1) and source_user_id = pg_temp.nt(2));
declare v_at timestamptz;
begin
  perform pg_temp.as_member(pg_temp.nt(2));
  set local role authenticated;
  if public.mark_notifications_read(array[v_id]) <> 0 then raise exception 'FAIL N6: B marked A''s notification'; end if;
  perform pg_temp.as_member(pg_temp.nt(1));
  if public.mark_notifications_read(array[v_id]) <> 1 then raise exception 'FAIL N6: A could not mark it read'; end if;
  if public.mark_notifications_read(array[v_id]) <> 0 then raise exception 'FAIL N6: marked read twice'; end if;
  reset role;
  select read_at into v_at from public.member_notification where id = v_id;
  if v_at is null then raise exception 'FAIL N6: read_at not set'; end if;
  perform pg_temp.as_member(pg_temp.nt(1));
  set local role authenticated;
  perform public.dismiss_notification(v_id);
  reset role;
  if (select dismissed_at is null or read_at <> v_at from public.member_notification where id = v_id) then raise exception 'FAIL N6: dismiss changed read_at or did not dismiss'; end if;
end $$;

-- N7
do $$
declare n int;
begin
  perform pg_temp.as_member(pg_temp.nt(1));
  set local role authenticated;
  if not exists (select 1 from public.my_notifications() x where x.source_user_id = pg_temp.nt(3) and x.name = 'Notif 3') then raise exception 'FAIL N7: no name'; end if;
  reset role;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.nt(1), pg_temp.nt(3)) on conflict do nothing;
  perform pg_temp.as_member(pg_temp.nt(1));
  set local role authenticated;
  select count(*) into n from public.my_notifications() x where x.source_user_id = pg_temp.nt(3);
  reset role;
  if n <> 0 then raise exception 'FAIL N7: a blocked member is still listed'; end if;
end $$;

-- N8
do $$
begin
  perform pg_temp.as_member(pg_temp.nt(1));
  set local role authenticated;
  perform public.save_push_subscription('https://push.example.com/abc', 'BOrBpTq8Yl2c2F0aGVyZWtleXNhbXBsZWtleQ', 'YXV0aHNlY3JldA');
  if pg_temp.err('select public.save_push_subscription(''http://insecure.example/x'', ''BOrBpTq8Yl2c2F0aGVyZWtleXNhbXBsZWtleQ'', ''YXV0aHNlY3JldA'')') = 'none' then
    raise exception 'FAIL N8: a non-https endpoint was saved'; end if;
  if pg_temp.err('select * from public.push_subscription') !~ 'permission denied' then raise exception 'FAIL N8: subscriptions readable'; end if;
  perform pg_temp.as_member(pg_temp.nt(2));
  if public.delete_push_subscription('https://push.example.com/abc') then raise exception 'FAIL N8: another member deleted it'; end if;
  perform pg_temp.as_member(pg_temp.nt(1));
  if not public.delete_push_subscription('https://push.example.com/abc') then raise exception 'FAIL N8: the owner could not delete it'; end if;
  reset role;
end $$;
rollback;
