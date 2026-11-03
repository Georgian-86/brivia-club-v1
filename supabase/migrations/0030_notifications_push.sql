set lock_timeout = '5s';
-- 0030_notifications_push.sql: Nearby notifications, one notification store synced across devices, Web Push
-- subscriptions, and a 10 km radius (founder request 2026-11-03, D-134; ORBIT spec §9.1.4b).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0029 (README "## 0030"). 0001-0029 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- What changes:
--   1. member_notification: one row per notification (id, user_id, source_user_id, notification_type, band,
--      created_at, read_at, dismissed_at, push_sent_at, dedupe_key unique per user). RLS: a member selects only their
--      own rows (so Supabase Realtime can stream inserts and read-state updates to every device they have open); no
--      client writes. It is in the supabase_realtime publication.
--   2. my_notifications(), mark_notifications_read(ids), dismiss_notification(id): read state is set once on the
--      server, so reading on the phone marks it read on the laptop too (Realtime UPDATE).
--   3. push_subscription(endpoint, member_id, p256dh, auth): one row per device that enabled web notifications;
--      save_push_subscription / delete_push_subscription. Sending is the push-notify Edge Function (service role),
--      which claims each notification once (push_sent_at), never one already read.
--   4. nearby_setting.radius_km (1 | 3 | 5 | 10, default 1) and set_nearby_radius(km): the radius notifications use.
--   5. Radius 10 km: band '10' (5-10 km); nearby_discover accepts 10; nearby_connect labels a request 'nearby' up to 10 km.
--   6. nearby_pulse (0029's, plus one call): after storing the live area it calls brivia_notify_nearby(uid), which writes
--      "nearby_appeared" both ways for pairs within each one's radius.
--   7. purge_nearby() also drops notifications older than 30 days.
-- Privacy: a notification carries the other member's id and a band ('1', '3', '5', '10'), never a cell, a coordinate or
-- a place; it exists only between members who both turned Crossing Paths on and may discover each other.

-- 1. -----------------------------------------------------------------------------------------------------------------
create table if not exists public.member_notification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_user_id uuid references public.profiles(id) on delete cascade,
  notification_type text not null check (notification_type in ('nearby_appeared')),
  band text check (band is null or band in ('1', '3', '5', '10')),
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  push_sent_at timestamptz,
  unique (user_id, dedupe_key)
);
create index if not exists member_notification_user_idx on public.member_notification (user_id, created_at desc);
alter table public.member_notification enable row level security;
revoke all on public.member_notification from public, anon, authenticated;
grant select on public.member_notification to authenticated;
drop policy if exists "Members read their own notifications" on public.member_notification;
create policy "Members read their own notifications" on public.member_notification
  for select to authenticated using (user_id = (select auth.uid()));
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'member_notification') then
    alter publication supabase_realtime add table public.member_notification;
  end if;
end $$;

-- 4. -----------------------------------------------------------------------------------------------------------------
alter table public.nearby_setting add column if not exists radius_km int not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nearby_setting_radius_check') then
    alter table public.nearby_setting add constraint nearby_setting_radius_check check (radius_km in (1, 3, 5, 10));
  end if;
end $$;

create or replace function public.set_nearby_radius(p_km int)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
begin
  if p_km is null or p_km not in (1, 3, 5, 10) then raise exception 'invalid radius' using errcode = '22023'; end if;
  insert into public.nearby_setting (member_id, enabled, radius_km) values (uid, false, p_km)
  on conflict (member_id) do update set radius_km = excluded.radius_km;
  return p_km;
end;
$$;
revoke all on function public.set_nearby_radius(int) from public, anon;
grant execute on function public.set_nearby_radius(int) to authenticated;

-- 5. -----------------------------------------------------------------------------------------------------------------
create or replace function public.brivia_near_band(p_km double precision)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_km is null then null when p_km <= 1.1 then '1' when p_km <= 3.1 then '3' when p_km <= 5.1 then '5' when p_km <= 10.1 then '10' end
$$;
revoke all on function public.brivia_near_band(double precision) from public, anon, authenticated;

-- 6. -----------------------------------------------------------------------------------------------------------------
create or replace function public.brivia_notify_nearby(p_uid uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n int := 0;
  k int;
  v_day text := to_char(now() at time zone 'UTC', 'YYYYMMDD');
begin
  -- Those around me, within my radius.
  insert into public.member_notification (user_id, source_user_id, notification_type, band, dedupe_key)
  select p_uid, x.other_id, 'nearby_appeared', public.brivia_near_band(x.km), 'nearby:' || x.other_id || ':' || v_day
    from public.nearby_setting me
    cross join lateral public.brivia_nearby_pool(p_uid, me.radius_km) x
   where me.member_id = p_uid
     and not exists (select 1 from public.member_notification m
                      where m.user_id = p_uid and m.source_user_id = x.other_id and m.notification_type = 'nearby_appeared'
                        and m.created_at >= now() - interval '24 hours')
     and (select count(*) from public.member_notification m
           where m.user_id = p_uid and m.created_at >= now() - interval '24 hours') < 10
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics k = row_count; n := n + k;
  -- Me, for those whose radius I am in.
  insert into public.member_notification (user_id, source_user_id, notification_type, band, dedupe_key)
  select o.member_id, p_uid, 'nearby_appeared', public.brivia_near_band(y.km), 'nearby:' || p_uid || ':' || v_day
    from public.nearby_setting o
    cross join lateral (select z.km from public.brivia_nearby_pool(o.member_id, o.radius_km) z where z.other_id = p_uid) y
   where o.member_id <> p_uid and o.enabled and o.discoverable_at is not null
     and not exists (select 1 from public.member_notification m
                      where m.user_id = o.member_id and m.source_user_id = p_uid and m.notification_type = 'nearby_appeared'
                        and m.created_at >= now() - interval '24 hours')
     and (select count(*) from public.member_notification m
           where m.user_id = o.member_id and m.created_at >= now() - interval '24 hours') < 10
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics k = row_count; n := n + k;
  return n;
end;
$$;
revoke all on function public.brivia_notify_nearby(uuid) from public, anon, authenticated;

create or replace function public.nearby_pulse(p_lat double precision, p_lng double precision)
returns table(other_id uuid, created_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
  v_cell text;
  v_near text;
  v_prev public.nearby_live%rowtype;
  o record;
  v_mine int;
begin
  if not public.my_nearby_setting() then
    delete from public.nearby_live where member_id = uid;
    return;
  end if;
  v_cell := public.brivia_grid_cell($1, $2, 7);   -- 22023 'invalid location'; never echoes the input
  v_near := public.brivia_near_cell($1, $2);
  perform pg_advisory_xact_lock(hashtext('nearby-member:' || uid::text));
  delete from public.nearby_move m where m.member_id = uid and m.at < now() - interval '24 hours';
  select * into v_prev from public.nearby_live l where l.member_id = uid;
  if found and v_prev.seen_at > now() - interval '4 minutes' then
    raise exception 'try again later' using errcode = 'PT429';
  end if;
  if not found or v_prev.cell <> v_cell then
    if (select count(*) from public.nearby_move m where m.member_id = uid) >= 24 then
      raise exception 'try again later' using errcode = 'PT429';
    end if;
    insert into public.nearby_move (member_id) values (uid);
  end if;
  insert into public.nearby_live (member_id, cell, near_cell, seen_at) values (uid, v_cell, v_near, now())
  on conflict (member_id) do update set cell = excluded.cell, near_cell = excluded.near_cell, seen_at = excluded.seen_at;

  -- 0030 (D-134): "Someone crossed your path". Each member who comes within the other's chosen radius is announced to
  -- them once per pair per day (dedupe key), at most 10 a day per member, only between members who may discover each
  -- other (brivia_nearby_pool: both on and consented, both live, visible, not connected, not asked, not passed).
  perform public.brivia_notify_nearby(uid);

  for o in
    select l.member_id as oid
      from public.nearby_live l
      join public.nearby_setting s on s.member_id = l.member_id and s.enabled
     where l.member_id <> uid
       and l.seen_at >= now() - interval '20 minutes'
       and public.brivia_cell_km(v_cell, l.cell) <= 3
       and public.brivia_nearby_pair_ok(uid, l.member_id)
       and not exists (select 1 from public.nearby_mute mu
                        where (mu.member_id = uid and mu.other_id = l.member_id)
                           or (mu.member_id = l.member_id and mu.other_id = uid))
       -- neighbours already: both homes geolocated and within 3 km of each other
       and not exists (select 1 from public.member_orbit a join public.member_orbit b on b.member_id = l.member_id
                        where a.member_id = uid and a.precision = 'cell' and b.precision = 'cell'
                          and public.brivia_cell_km(a.home_cell, b.home_cell) <= 3)
     order by l.seen_at desc
  loop
    perform pg_advisory_xact_lock(hashtext('nearby-pair:' || least(uid, o.oid)::text || greatest(uid, o.oid)::text));
    -- pair cooldown: one alert per pair per 24 h
    continue when exists (select 1 from public.nearby_alert a
                           where a.member_id = uid and a.other_id = o.oid and a.created_at >= now() - interval '24 hours');
    select count(*) into v_mine from public.nearby_alert a where a.member_id = uid and a.created_at >= now() - interval '24 hours';
    exit when v_mine >= 3;   -- the caller's daily cap
    continue when (select count(*) from public.nearby_alert a
                    where a.member_id = o.oid and a.created_at >= now() - interval '24 hours') >= 3;
    insert into public.nearby_alert (member_id, other_id) values (uid, o.oid), (o.oid, uid);
    other_id := o.oid;
    created_at := now();
    return next;
  end loop;
end;
$$;
revoke all on function public.nearby_pulse(double precision, double precision) from public, anon;
grant execute on function public.nearby_pulse(double precision, double precision) to authenticated;

create or replace function public.nearby_discover(p_radius_km int default 1, p_limit int default 20)
returns table(member_id uuid, name text, photo_url text, cover_url text, headline text, bio text,
              looking_for text[], skills text[], interests text[], shared_interests text[], shared_count int,
              distance_band text, place_name text, here_now boolean, asked_me boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
begin
  if p_radius_km is null or p_radius_km not in (1, 3, 5, 10) then
    raise exception 'invalid radius' using errcode = '22023';
  end if;
  if not public.brivia_member_completed(uid) then
    raise exception 'complete your profile' using errcode = '22023';
  end if;
  if not exists (select 1 from public.nearby_setting ns where ns.member_id = uid and ns.enabled and ns.discoverable_at is not null) then
    raise exception 'nearby off' using errcode = '22023';   -- off, or on from before 0029 (alerts only)
  end if;
  if not exists (select 1 from public.nearby_live l
                  where l.member_id = uid and l.near_cell is not null and l.seen_at >= now() - interval '20 minutes') then
    raise exception 'location needed' using errcode = '22023';
  end if;
  return query
  with pool as (select * from public.brivia_nearby_pool(uid, p_radius_km)),
  cards as (
    select p.id, p.name, p.photo_url, p.cover_url, p.experience, p.bio, p.looking_for, p.skills, pool.km, pool.seen_at,
           (select pl.name from public.place pl where pl.id = public.brivia_nearest_place(pool.cell)) as place_name,
           (select coalesce(array_agg(n.label order by n.label), '{}')
              from public.member_interest a
              join public.member_interest b on b.interest_id = a.interest_id and b.member_id = p.id
              join public.interest_node n on n.id = a.interest_id and n.status = 'active' and not n.sensitive
             where a.member_id = uid) as shared,
           (select coalesce(array_agg(x.label order by x.shared desc, x.points desc, x.label), '{}')
              from (select n.label, mi.points,
                           exists (select 1 from public.member_interest a where a.member_id = uid and a.interest_id = mi.interest_id) as shared
                      from public.member_interest mi
                      join public.interest_node n on n.id = mi.interest_id and n.status = 'active' and not n.sensitive
                     where mi.member_id = p.id
                     order by 3 desc, mi.points desc, n.label limit 6) x) as interests,
           exists (select 1 from public.connection_requests c
                    where c.from_id = p.id and c.to_id = uid and c.status = 'pending') as asked_me
      from pool join public.profiles p on p.id = pool.other_id)
  select c.id, c.name, c.photo_url, c.cover_url, nullif(btrim(coalesce(c.experience, '')), ''),
         nullif(left(btrim(coalesce(c.bio, '')), 280), ''), c.looking_for[1:4], c.skills[1:6], c.interests,
         c.shared[1:4], cardinality(c.shared), public.brivia_near_band(c.km), c.place_name,
         c.seen_at >= now() - interval '5 minutes', c.asked_me
    from cards c
   where public.brivia_visible_to(uid, c.id)   -- also inside the pool; stated here so the world rule is visible
   order by cardinality(c.shared) desc, public.brivia_near_band(c.km), c.seen_at desc, c.id
   limit greatest(1, least(coalesce(p_limit, 20), 40));
end;
$$;
revoke all on function public.nearby_discover(int, int) from public, anon;
grant execute on function public.nearby_discover(int, int) to authenticated;

create or replace function public.nearby_connect(p_to uuid, p_note text default null)
returns table(status text, remaining int, resets_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
  v_near boolean;
  r record;
begin
  v_near := public.my_nearby_setting() and public.brivia_visible_to(uid, p_to)
            and exists (select 1 from public.brivia_nearby_pool(uid, 10) x where x.other_id = p_to);
  for r in select * from public.send_connect_request(p_to, p_note) loop
    if v_near and r.status in ('sent', 'matched') then
      update public.connection_requests c set via = 'nearby'
       where c.from_id = uid and c.to_id = p_to and c.via is null;
    end if;
    status := r.status; remaining := r.remaining; resets_at := r.resets_at;
    return next;
  end loop;
end;
$$;
revoke all on function public.nearby_connect(uuid, text) from public, anon;
grant execute on function public.nearby_connect(uuid, text) to authenticated;

-- 2. -----------------------------------------------------------------------------------------------------------------
-- my_notifications(): the caller's notifications from the last 7 days, newest first (at most 50), with the other
-- member's name and photo when they are still visible to the caller.
create or replace function public.my_notifications()
returns table(id uuid, notification_type text, source_user_id uuid, name text, photo_url text, band text,
              created_at timestamptz, read_at timestamptz, dismissed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
begin
  return query
  select m.id, m.notification_type, m.source_user_id, p.name, p.photo_url, m.band, m.created_at, m.read_at, m.dismissed_at
    from public.member_notification m
    left join public.profiles p on p.id = m.source_user_id
   where m.user_id = uid and m.created_at >= now() - interval '7 days'
     and (m.source_user_id is null or public.brivia_visible_to(uid, m.source_user_id))
   order by m.created_at desc
   limit 50;
end;
$$;
revoke all on function public.my_notifications() from public, anon;
grant execute on function public.my_notifications() to authenticated;

-- Read once, everywhere: the first device to read sets read_at; the others see the change through Realtime.
create or replace function public.mark_notifications_read(p_ids uuid[])
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
  n int;
begin
  update public.member_notification m set read_at = now()
   where m.user_id = uid and m.id = any (coalesce(p_ids, '{}')) and m.read_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

create or replace function public.dismiss_notification(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
begin
  update public.member_notification m set dismissed_at = coalesce(m.dismissed_at, now()), read_at = coalesce(m.read_at, now())
   where m.user_id = uid and m.id = p_id;
  return found;
end;
$$;
revoke all on function public.dismiss_notification(uuid) from public, anon;
grant execute on function public.dismiss_notification(uuid) to authenticated;

-- 3. -----------------------------------------------------------------------------------------------------------------
create table if not exists public.push_subscription (
  endpoint text primary key check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  member_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscription_member_idx on public.push_subscription (member_id);
alter table public.push_subscription enable row level security;
revoke all on public.push_subscription from public, anon, authenticated;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
begin
  if (select count(*) from public.push_subscription s where s.member_id = uid and s.endpoint <> p_endpoint) >= 10 then
    raise exception 'too many devices' using errcode = '22023';
  end if;
  insert into public.push_subscription (endpoint, member_id, p256dh, auth) values (p_endpoint, uid, p_p256dh, p_auth)
  on conflict (endpoint) do update set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  return true;
end;
$$;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

create or replace function public.delete_push_subscription(p_endpoint text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
begin
  delete from public.push_subscription s where s.endpoint = p_endpoint and s.member_id = uid;
  return found;
end;
$$;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- 7. -----------------------------------------------------------------------------------------------------------------
create or replace function public.purge_nearby()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.nearby_live where seen_at < now() - interval '20 minutes';
  delete from public.nearby_move where at < now() - interval '24 hours';
  delete from public.nearby_alert where created_at < now() - interval '24 hours';
  delete from public.nearby_passed where passed_at < now() - interval '7 days';
  delete from public.member_notification where created_at < now() - interval '30 days';
$$;
revoke all on function public.purge_nearby() from public, anon, authenticated;
