set lock_timeout = '5s';
-- 0029_nearby_discovery.sql: Nearby, discover members around you (founder request 2026-11-03, D-131; ORBIT spec
-- §9.1.4b). Applied by hand in the Supabase SQL editor, as postgres, after 0021 and 0028 (README "## 0029").
-- 0001-0028 are frozen. Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- Crossing paths (0021) told two *connections* when they were near each other. Nearby lets members who turned
-- Crossing paths on discover *other* members who turned it on too, within 1, 3 or 5 km, and connect with mutual consent.
-- It reuses everything that exists: the switch and its consent time (nearby_setting), the live location pulse and its
-- caps (nearby_pulse, nearby_live, nearby_move), requests and matching (send_connect_request -> send_signal, the
-- crossing-request trigger, Accept), the pitch delivered once as the first chat message (0024, 0028).
--
-- The privacy contract (CLAUDE.md location rules; founder decision D-131: "1 km" precision):
--   * Off by default and symmetric: you discover others only while your own switch is on and your own live location
--     is fresh, and only members whose switch is on and whose live location is fresh (20 minutes) can be found.
--   * Coordinates arrive only in the body of nearby_pulse (volatile, POST-only), are snapped there and dropped. Nearby
--     keeps one more snap of the same fix: an ~1 km cell (n8, 108 rows per degree) next to the 0021 ~2.3 km cell. It
--     lives only in nearby_live (deleted when the switch goes off or location is lost, ignored after 20 minutes, purged
--     every 30 minutes), never in member_orbit, and never reaches ranking, the deck, search or density counts.
--   * Clients never see a cell, a coordinate or a number of metres: only a band, "1" (under 1 km), "3" (1-3 km) or "5"
--     (3-5 km), computed from cell centres, plus the city (the place nearest the ~2.3 km cell).
--   * No location history: still only the one live row per member and the cell-change count (nearby_move, no cell).
--   * Interests shown are active, non-sensitive catalogue nodes only.
--   * Separate consent: nearby_setting.discoverable_at is set only when the member turns the switch on under the Nearby
--     explanation (set_nearby_enabled(true) from 0029 on). The members who turned Crossing paths on before 0029 agreed to
--     connection alerts only, so they keep those alerts but neither discover nor appear until they turn it on again.
--
-- What changes:
--   1. brivia_near_cell / brivia_near_centroid / brivia_near_km: the ~1 km grid (internal; the ORBIT grid is untouched).
--   2. nearby_live.near_cell; nearby_pulse stores it (otherwise exactly 0021's pulse).
--   3. nearby_passed(member_id, other_id, passed_at): a pass hides that member from your Nearby for 7 days.
--   4. connection_requests.via ('nearby' or null): a request sent from Nearby, so the recipient is told "Someone nearby
--      wants to connect with you" and a resulting match is announced as crossing paths.
--   5. nearby_discover(p_radius_km, p_limit), nearby_pass(p_other), nearby_connect(p_to, p_note), my_nearby_matches():
--      authenticated only, security definer.
--   6. purge_nearby() also drops passes older than 7 days.

-- =============================================================================================
-- 1. The ~1 km grid (same equal-area row scheme as brivia_grid_cell, its own prefix so the two never mix)
-- =============================================================================================
create or replace function public.brivia_near_cell(p_lat double precision, p_lng double precision)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  n constant float8 := 108.0;   -- rows per degree: ~1.03 km
  r bigint;
  phi float8;
  ncols bigint;
  c bigint;
begin
  if p_lat is null or p_lng is null or p_lat = 'NaN'::float8 or p_lng = 'NaN'::float8
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'invalid location' using errcode = '22023';
  end if;
  r := least(floor((p_lat + 90) * n)::bigint, round(180 * n)::bigint - 1);
  phi := -90 + (r + 0.5) / n;
  ncols := greatest(1, floor(360 * n * cos(radians(phi)))::bigint);
  c := mod(floor((p_lng + 180) / 360 * ncols)::bigint, ncols);
  return 'n8:' || r || ':' || c;
end;
$$;
revoke all on function public.brivia_near_cell(double precision, double precision) from public, anon, authenticated;

create or replace function public.brivia_near_centroid(p_cell text, out lat double precision, out lng double precision)
language plpgsql
immutable
set search_path = public
as $$
declare
  m text[];
  n constant float8 := 108.0;
  r bigint;
  c bigint;
  phi float8;
  ncols bigint;
begin
  m := regexp_match(coalesce(p_cell, ''), '^n8:(0|[1-9][0-9]{0,5}):(0|[1-9][0-9]{0,5})$');
  if m is null then raise exception 'invalid cell' using errcode = '22023'; end if;
  r := m[1]::bigint; c := m[2]::bigint;
  if r > round(180 * n)::bigint - 1 then raise exception 'invalid cell' using errcode = '22023'; end if;
  phi := -90 + (r + 0.5) / n;
  ncols := greatest(1, floor(360 * n * cos(radians(phi)))::bigint);
  if c > ncols - 1 then raise exception 'invalid cell' using errcode = '22023'; end if;
  lat := phi;
  lng := -180 + (c + 0.5) * 360 / ncols;
end;
$$;
revoke all on function public.brivia_near_centroid(text) from public, anon, authenticated;

create or replace function public.brivia_near_km(p_a text, p_b text)
returns double precision
language sql
immutable
set search_path = public
as $$
  select public.brivia_haversine_km(a.lat, a.lng, b.lat, b.lng)
    from public.brivia_near_centroid(p_a) a, public.brivia_near_centroid(p_b) b
$$;
revoke all on function public.brivia_near_km(text, text) from public, anon, authenticated;

-- The band a client sees: '1' under 1 km (same or edge-adjacent cell), '3' up to 3 km, '5' up to 5 km, else null.
create or replace function public.brivia_near_band(p_km double precision)
returns text
language sql
immutable
set search_path = public
as $$
  select case when p_km is null then null when p_km <= 1.1 then '1' when p_km <= 3.1 then '3' when p_km <= 5.1 then '5' end
$$;
revoke all on function public.brivia_near_band(double precision) from public, anon, authenticated;

-- =============================================================================================
-- 2. The live ~1 km cell, stored by the pulse
-- =============================================================================================
alter table public.nearby_live add column if not exists near_cell text;

-- 0021's pulse, unchanged except that it also keeps the ~1 km cell of the same fix.
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

-- Consent to discovery (see the contract above): set when turned on, cleared when turned off; null for earlier consents.
alter table public.nearby_setting add column if not exists discoverable_at timestamptz;

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
  insert into public.nearby_setting (member_id, enabled, enabled_at, discoverable_at)
  values (uid, v_on, case when v_on then now() end, case when v_on then now() end)
  on conflict (member_id) do update
     set enabled = excluded.enabled,
         -- consent time: set when it is turned on, kept while on, cleared when off
         enabled_at = case when excluded.enabled then coalesce(public.nearby_setting.enabled_at, now()) end,
         -- discovery consent: every "on" from 0029 on is given under the Nearby explanation
         discoverable_at = case when excluded.enabled then now() end;
  if not v_on then
    delete from public.nearby_live where member_id = uid;
  end if;
  return v_on;
end;
$$;
revoke all on function public.set_nearby_enabled(boolean) from public, anon;
grant execute on function public.set_nearby_enabled(boolean) to authenticated;

-- =============================================================================================
-- 3. Passes, 4. where a request came from
-- =============================================================================================
create table if not exists public.nearby_passed (
  member_id uuid not null references public.profiles(id) on delete cascade,
  other_id uuid not null references public.profiles(id) on delete cascade,
  passed_at timestamptz not null default now(),
  primary key (member_id, other_id)
);
alter table public.nearby_passed enable row level security;
revoke all on public.nearby_passed from public, anon, authenticated;

alter table public.connection_requests add column if not exists via text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'connection_requests_via_check') then
    alter table public.connection_requests add constraint connection_requests_via_check check (via is null or via = 'nearby');
  end if;
end $$;

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
$$;
revoke all on function public.purge_nearby() from public, anon, authenticated;

-- =============================================================================================
-- 5. The RPCs
-- =============================================================================================
-- Who the caller may discover right now, and how far: (other id, km between cell centres). Both switches on, both live
-- cells under 20 minutes old, visible to each other (completed, same world, no block), not connected, not already asked
-- by the caller (one request per direction, ever), not passed by the caller in the last 7 days.
create or replace function public.brivia_nearby_pool(p_me uuid, p_radius_km double precision)
returns table(other_id uuid, km double precision, seen_at timestamptz, cell text)
language sql
stable
security definer
set search_path = public
as $$
  select l.member_id, public.brivia_near_km(me.near_cell, l.near_cell), l.seen_at, l.cell
    from public.nearby_live me
    join public.nearby_setting ms on ms.member_id = me.member_id and ms.enabled and ms.discoverable_at is not null
    join public.nearby_live l on l.member_id <> me.member_id and l.near_cell is not null
                             and l.seen_at >= now() - interval '20 minutes'
    join public.nearby_setting s on s.member_id = l.member_id and s.enabled and s.discoverable_at is not null
   where me.member_id = p_me and me.near_cell is not null and me.seen_at >= now() - interval '20 minutes'
     and public.brivia_near_km(me.near_cell, l.near_cell) <= p_radius_km + 0.1
     and public.brivia_visible_to(p_me, l.member_id)
     and not public.brivia_is_connection(p_me, l.member_id)
     and not exists (select 1 from public.connection_requests c where c.from_id = p_me and c.to_id = l.member_id)
     and not exists (select 1 from public.nearby_passed np
                      where np.member_id = p_me and np.other_id = l.member_id and np.passed_at >= now() - interval '7 days')
$$;
revoke all on function public.brivia_nearby_pool(uuid, double precision) from public, anon, authenticated;

-- nearby_discover(p_radius_km 1 | 3 | 5, p_limit) -> the cards, most shared interests first, then nearest, then most
-- recently here. 22023 'nearby off' (switch off), 'location needed' (no live location in the last 20 minutes),
-- 'invalid radius'. Never a cell, a coordinate or metres: only the band and the city.
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
  if p_radius_km is null or p_radius_km not in (1, 3, 5) then
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

-- nearby_pass(p_other): hides p_other from the caller's Nearby for 7 days. Nobody is told.
create or replace function public.nearby_pass(p_other uuid)
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
    raise exception 'invalid member' using errcode = '22023';
  end if;
  insert into public.nearby_passed (member_id, other_id) values (uid, p_other)
  on conflict (member_id, other_id) do update set passed_at = now();
end;
$$;
revoke all on function public.nearby_pass(uuid) from public, anon;
grant execute on function public.nearby_pass(uuid) to authenticated;

-- nearby_connect(p_to, p_note) -> send_connect_request's answer ('sent', 'matched', 'chat'; quota and caps as ever).
-- The request is marked via = 'nearby' only when p_to is discoverable to the caller at that moment (within 5 km), so
-- the label cannot be put on an ordinary request. Two members who both connect from Nearby match at once (the
-- crossing-request trigger), and each note becomes the first message of their chat exactly once (0024, 0028).
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
            and exists (select 1 from public.brivia_nearby_pool(uid, 5) x where x.other_id = p_to);
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

-- my_nearby_matches(): the caller's connections from the last 7 days that began on Nearby (a 'nearby' request either
-- way), newest first, at most 20, with the other member's name and photo. The client marks them seen on its own.
create or replace function public.my_nearby_matches()
returns table(other_id uuid, name text, photo_url text, matched_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := public.brivia_nearby_require_profile();
begin
  return query
  select o.id, o.name, o.photo_url, m.created_at
    from public.matches m
    join public.profiles o on o.id = case when m.user1_id = uid then m.user2_id else m.user1_id end
   where (m.user1_id = uid or m.user2_id = uid)
     and m.created_at >= now() - interval '7 days'
     and public.brivia_visible_to(uid, o.id)
     and exists (select 1 from public.connection_requests c
                  where c.via = 'nearby'
                    and ((c.from_id = uid and c.to_id = o.id) or (c.from_id = o.id and c.to_id = uid)))
   order by m.created_at desc
   limit 20;
end;
$$;
revoke all on function public.my_nearby_matches() from public, anon;
grant execute on function public.my_nearby_matches() to authenticated;
