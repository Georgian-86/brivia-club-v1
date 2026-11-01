set lock_timeout = '5s';
-- 0021_crossing_paths.sql: "Crossing paths", a quiet alert when two connections are near each other (founder request
-- 2026-11-01, D-119; design docs/superpowers/specs/2026-11-01-crossing-paths-design.md, ORBIT spec §9.1.4a).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0020 (see README.md "## 0021"). 0001-0020 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- The privacy contract (CLAUDE.md location rules; spec §3):
--   * Off by default. Both members must have it on; connections only (a matches row), same world, not blocked, and
--     neither has muted the other.
--   * Both members are alerted in the same transaction, so nobody learns the other is nearby without the other
--     learning it too.
--   * Coordinates arrive only in the body of nearby_pulse (a volatile, POST-only RPC), are snapped to the g7 cell
--     (~2.3 km) with brivia_grid_cell and dropped. They are never stored, logged, echoed or put in an error message.
--   * The live cell is separate from the home area (member_orbit is never touched), is ignored after 20 minutes and is
--     deleted when the member turns the feature off or calls nearby_clear (location permission lost, sign-out).
--   * An alert carries only the other member's id and a time, never a cell, a place or a distance.
--   * No location history: cell changes are counted in nearby_move(member_id, at), which holds no cell.
--
-- What changes:
--   1. nearby_setting(member_id, enabled, enabled_at): the switch (default off) and when consent was given.
--   2. nearby_live(member_id, cell, seen_at): the member's live g7 cell.
--   3. nearby_move(member_id, at): one row per change of live cell (no cell), for the 24-a-day cap.
--   4. nearby_mute(member_id, other_id): one-way, silent mutes.
--   5. nearby_alert(id, member_id, other_id, created_at): one row per recipient.
--   All five: RLS on, no grants, deleted with the profile.
--   6. set_nearby_enabled(p_enabled), my_nearby_setting(), nearby_pulse(p_lat, p_lng), nearby_clear(),
--      my_nearby_alerts(), set_nearby_muted(p_other, p_muted): authenticated only, security definer.
--   7. purge_nearby(): deletes stale rows (internal; scheduled daily when pg_cron is installed, and run by every pulse
--      for the caller's own rows).
--
-- Rules (spec §4, §5, §7): nearby = live cells' centres at most 3 km apart (same or edge-adjacent g7 cell); a live cell
-- counts for 20 minutes; not when both homes are geolocated (precision 'cell') and themselves within 3 km (neighbours);
-- one alert per pair per 24 h; at most 3 alerts per member per 24 h; alerts are listed for 3 hours; a pulse at most every
-- 4 minutes and at most 24 changes of live cell per 24 h (PT429 'try again later' beyond either).

-- =============================================================================================
-- 1. Tables
-- =============================================================================================
create table if not exists public.nearby_setting (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  enabled_at timestamptz
);
alter table public.nearby_setting enable row level security;
revoke all on public.nearby_setting from public, anon, authenticated;

create table if not exists public.nearby_live (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  cell text not null,
  seen_at timestamptz not null default now()
);
alter table public.nearby_live enable row level security;
revoke all on public.nearby_live from public, anon, authenticated;
create index if not exists nearby_live_seen_idx on public.nearby_live (seen_at);

create table if not exists public.nearby_move (
  member_id uuid not null references public.profiles(id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.nearby_move enable row level security;
revoke all on public.nearby_move from public, anon, authenticated;
create index if not exists nearby_move_member_idx on public.nearby_move (member_id, at);

create table if not exists public.nearby_mute (
  member_id uuid not null references public.profiles(id) on delete cascade,
  other_id uuid not null references public.profiles(id) on delete cascade,
  muted_at timestamptz not null default now(),
  primary key (member_id, other_id)
);
alter table public.nearby_mute enable row level security;
revoke all on public.nearby_mute from public, anon, authenticated;

create table if not exists public.nearby_alert (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles(id) on delete cascade,
  other_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.nearby_alert enable row level security;
revoke all on public.nearby_alert from public, anon, authenticated;
create index if not exists nearby_alert_member_idx on public.nearby_alert (member_id, created_at);
create index if not exists nearby_alert_pair_idx on public.nearby_alert (member_id, other_id, created_at);

-- =============================================================================================
-- 2. Internal helpers (no client role)
-- =============================================================================================
-- Is the caller connected to p_other, in the same world, with no block either way?
create or replace function public.brivia_nearby_pair_ok(p_me uuid, p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_me <> p_other
    and exists (select 1 from public.matches m
                 where (m.user1_id = p_me and m.user2_id = p_other) or (m.user2_id = p_me and m.user1_id = p_other))
    and public.brivia_same_world(p_me, p_other)
    and not public.brivia_is_blocked_between(p_me, p_other),
    false)
$$;
revoke all on function public.brivia_nearby_pair_ok(uuid, uuid) from public, anon, authenticated;

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
$$;
revoke all on function public.purge_nearby() from public, anon, authenticated;

create or replace function public.brivia_nearby_require_profile()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  return uid;
end;
$$;
revoke all on function public.brivia_nearby_require_profile() from public, anon, authenticated;

-- =============================================================================================
-- 3. The switch
-- =============================================================================================
create or replace function public.set_nearby_enabled(p_enabled boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
  v_on boolean := coalesce(p_enabled, false);
begin
  insert into public.nearby_setting (member_id, enabled, enabled_at)
  values (uid, v_on, case when v_on then now() end)
  on conflict (member_id) do update
     set enabled = excluded.enabled,
         -- consent time: set when it is turned on, kept while on, cleared when off
         enabled_at = case when excluded.enabled then coalesce(public.nearby_setting.enabled_at, now()) end;
  if not v_on then
    delete from public.nearby_live where member_id = uid;
  end if;
  return v_on;
end;
$$;
revoke all on function public.set_nearby_enabled(boolean) from public, anon;
grant execute on function public.set_nearby_enabled(boolean) to authenticated;

create or replace function public.my_nearby_setting()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.enabled from public.nearby_setting s where s.member_id = auth.uid()), false)
$$;
revoke all on function public.my_nearby_setting() from public, anon;
grant execute on function public.my_nearby_setting() to authenticated;

create or replace function public.nearby_clear()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
begin
  delete from public.nearby_live where member_id = uid;
end;
$$;
revoke all on function public.nearby_clear() from public, anon;
grant execute on function public.nearby_clear() to authenticated;

create or replace function public.set_nearby_muted(p_other uuid, p_muted boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
begin
  if p_other is null or p_other = uid or not exists (select 1 from public.profiles where id = p_other) then
    return;
  end if;
  if coalesce(p_muted, true) then
    -- the alert rows stay (they still count toward the cooldown and the daily cap); my_nearby_alerts hides them
    insert into public.nearby_mute (member_id, other_id) values (uid, p_other) on conflict do nothing;
  else
    delete from public.nearby_mute where member_id = uid and other_id = p_other;
  end if;
end;
$$;
revoke all on function public.set_nearby_muted(uuid, boolean) from public, anon;
grant execute on function public.set_nearby_muted(uuid, boolean) to authenticated;

-- =============================================================================================
-- 4. The pulse: store the live cell, find connections nearby, alert both sides
-- =============================================================================================
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
  v_prev public.nearby_live%rowtype;
  o record;
  v_mine int;
begin
  if not public.my_nearby_setting() then
    delete from public.nearby_live where member_id = uid;
    return;
  end if;
  v_cell := public.brivia_grid_cell($1, $2, 7);   -- 22023 'invalid location'; never echoes the input
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
  insert into public.nearby_live (member_id, cell, seen_at) values (uid, v_cell, now())
  on conflict (member_id) do update set cell = excluded.cell, seen_at = excluded.seen_at;

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

-- The caller's alerts from the last 3 hours, newest first, for connections who are still connected, visible and not
-- muted. Never a cell, a place or a distance.
create or replace function public.my_nearby_alerts()
returns table(other_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
begin
  return query
  select a.other_id, max(a.created_at)
    from public.nearby_alert a
   where a.member_id = uid
     and a.created_at >= now() - interval '3 hours'
     and public.my_nearby_setting()
     and public.brivia_nearby_pair_ok(uid, a.other_id)
     and not exists (select 1 from public.nearby_mute mu where mu.member_id = uid and mu.other_id = a.other_id)
   group by a.other_id
   order by max(a.created_at) desc
   limit 20;
end;
$$;
revoke all on function public.my_nearby_alerts() from public, anon;
grant execute on function public.my_nearby_alerts() to authenticated;

-- =============================================================================================
-- 5. Daily purge (when pg_cron is installed)
-- =============================================================================================
do $$
declare v_exists boolean;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null or to_regclass('cron.job') is null then
    raise notice 'pg_cron is not installed: purge_nearby() is not scheduled (see supabase/migrations/README.md "## 0021").';
    return;
  end if;
  execute 'select exists (select 1 from cron.job where jobname = $1)' into v_exists using 'brivia-purge-nearby';
  if v_exists then
    execute 'select cron.unschedule($1)' using 'brivia-purge-nearby';
  end if;
  execute 'select cron.schedule($1, $2, $3)' using 'brivia-purge-nearby', '*/30 * * * *', 'select public.purge_nearby()';
end $$;
