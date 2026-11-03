set lock_timeout = '5s';
-- 0034_crossing_where.sql: a crossing says roughly where it happened, and how long Crossing Paths keeps anything is one
-- setting (founder request 2026-11-03, D-138; ORBIT spec §9.1.4b). Applied by hand in the Supabase SQL editor, as
-- postgres, after 0033 (README "## 0034"). 0001-0033 are frozen. Idempotent: the harness applies every migration twice.
--
-- What changes:
--   1. member_notification.place_name: the area the crossing happened in, as the town or city nearest the receiver's
--      own live area (the ~2.3 km cell's nearest place). It is where the receiver was, so it tells them nothing about
--      the other member beyond the distance band they already see. Never a cell, a coordinate or a street.
--   2. nearby_retention (one row, owner only): how long each kind of data is kept. Defaults are today's values: a live
--      area counts for 20 minutes, move counts 24 hours, alerts 24 hours, passes 7 days, notifications 30 days.
--      purge_nearby() reads it (it runs on every pulse and every 30 minutes when pg_cron is installed). Change a value
--      with an UPDATE in the SQL editor; nothing is kept longer than the value says.
--   3. brivia_notify_nearby (0030's, plus place_name) and my_notifications_v2() (0030's my_notifications plus
--      place_name; my_notifications itself is left as 0030 made it, for clients that have not reloaded).
-- Stale coordinates never notify: a pair is only found among live areas fresher than 20 minutes (0029's pool), and a
-- member whose location is lost, denied or switched off has no live area at all.

-- 1. ------------------------------------------------------------------------------------------------------------------
alter table public.member_notification add column if not exists place_name text;

-- 2. ------------------------------------------------------------------------------------------------------------------
create table if not exists public.nearby_retention (
  id boolean primary key default true check (id),
  live_minutes int not null default 20 check (live_minutes between 5 and 60),
  move_hours int not null default 24 check (move_hours between 1 and 72),
  alert_hours int not null default 24 check (alert_hours between 1 and 72),
  pass_days int not null default 7 check (pass_days between 1 and 30),
  notification_days int not null default 30 check (notification_days between 1 and 90)
);
alter table public.nearby_retention enable row level security;
revoke all on public.nearby_retention from public, anon, authenticated;
insert into public.nearby_retention (id) values (true) on conflict (id) do nothing;

create or replace function public.purge_nearby()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare r public.nearby_retention%rowtype;
begin
  select * into r from public.nearby_retention where id;
  if not found then r := row(true, 20, 24, 24, 7, 30); end if;
  delete from public.nearby_live where seen_at < now() - make_interval(mins => r.live_minutes);
  delete from public.nearby_move where at < now() - make_interval(hours => r.move_hours);
  delete from public.nearby_alert where created_at < now() - make_interval(hours => r.alert_hours);
  delete from public.nearby_passed where passed_at < now() - make_interval(days => r.pass_days);
  delete from public.member_notification where created_at < now() - make_interval(days => r.notification_days);
end;
$$;
revoke all on function public.purge_nearby() from public, anon, authenticated;

-- 3. ------------------------------------------------------------------------------------------------------------------
-- The area a member's live cell is in (internal).
create or replace function public.brivia_live_place(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select pl.name from public.nearby_live l join public.place pl on pl.id = public.brivia_nearest_place(l.cell)
   where l.member_id = p_uid
$$;
revoke all on function public.brivia_live_place(uuid) from public, anon, authenticated;

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
  insert into public.member_notification (user_id, source_user_id, notification_type, band, dedupe_key, place_name)
  select p_uid, x.other_id, 'nearby_appeared', public.brivia_near_band(x.km), 'nearby:' || x.other_id || ':' || v_day,
         public.brivia_live_place(p_uid)
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
  insert into public.member_notification (user_id, source_user_id, notification_type, band, dedupe_key, place_name)
  select o.member_id, p_uid, 'nearby_appeared', public.brivia_near_band(y.km), 'nearby:' || p_uid || ':' || v_day,
         public.brivia_live_place(o.member_id)
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

create or replace function public.my_notifications_v2()
returns table(id uuid, notification_type text, source_user_id uuid, name text, photo_url text, band text,
              created_at timestamptz, read_at timestamptz, dismissed_at timestamptz, place_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
begin
  return query
  select m.id, m.notification_type, m.source_user_id, p.name, p.photo_url, m.band, m.created_at, m.read_at, m.dismissed_at,
         m.place_name
    from public.member_notification m
    left join public.profiles p on p.id = m.source_user_id
   where m.user_id = uid and m.created_at >= now() - interval '7 days'
     and (m.source_user_id is null or public.brivia_visible_to(uid, m.source_user_id))
   order by m.created_at desc
   limit 50;
end;
$$;
revoke all on function public.my_notifications_v2() from public, anon;
grant execute on function public.my_notifications_v2() to authenticated;
