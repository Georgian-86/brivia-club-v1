-- 0004_orbit_onboarding.sql: the Iteration 3 (ORBIT onboarding) migration.
-- Apply after 0001, 0002 and 0003, in the Supabase SQL editor. Idempotent: safe to re-run (the local harness
-- applies every migration twice).
-- RE-RUN ORDER: section 4 redefines get_candidates, search_members, list_members and brivia_can_see_author from 0003;
-- section 6 redefines brivia_has_completed_profile (0001), brivia_before_connection_request and
-- respond_connection_request (0003), recreates the completion-gated policies of 0001-0003 and revokes the 0003
-- insert grant on connection_requests.
-- Any re-run of 0003 (or of 0001/0002, which require a 0003 re-run) must be followed by a re-run of 0004.
-- Sections:
--   1. Grid and places: the coarse equal-area grid (D-028, spec §4.1 / §9.1.4) and the place list.
--   2. Taxonomy and member interests: interest_node, member_interest, the 20-point Passion Budget (§3.1 / §3.2).
--   3. Member orbit: member_orbit, location_change, set_home_location and set_home_city (§9.1.4).
--   4. Completion and visibility: brivia_member_completed, brivia_visible_to, the candidate RPCs, my_onboarding_status
--      (D-030, §7). Redefines get_candidates, search_members, list_members and brivia_can_see_author from 0003.
--   5. k-anonymity: member_flag, cell_density, refresh_cell_density (nightly, 7-night hysteresis), brivia_cell_ok
--      (§9.1.4).
--   6. Signals: brivia_config, signal_ledger, send_signal, my_signal_quota (Ruling A1, D-032, §6.4). Revokes raw
--      client inserts into connection_requests; redefines brivia_before_connection_request (0003, without the caps),
--      respond_connection_request (0003) and brivia_has_completed_profile (0001) on top of the D-030 completion,
--      and recreates the completion-gated request, match, message and post policies (once-per-statement check).
--   Data: places (section 1) and the interest taxonomy (end of file).
-- Privacy (CLAUDE.md): coordinates exist only as function arguments. No member table stores them; the only
-- coordinate columns are the public city centroids in public.place, which no client role can read.

-- =============================================================================================
-- 1. Grid and places
-- =============================================================================================
-- Grid "grid1" (D-028). Level L has n_L rows per degree of latitude: 48 (g7), 16 (g6), 16/3 (g5).
--   row   = least(floor((lat + 90) * n_L), 180 * n_L - 1); centre latitude phi_c = -90 + (row + 0.5) / n_L
--   ncols = greatest(1, floor(360 * n_L * cos(radians(phi_c))))
--   col   = floor((lng + 180) / 360 * ncols) mod ncols
--   id    = 'g' || L || ':' || row || ':' || col; centroid = (phi_c, -180 + (col + 0.5) * 360 / ncols)
-- A parent is the snap of the child's centroid at the coarser level. Distance is haversine between
-- centroids (R = 6371.0088 km). Error messages never carry an input value.

create or replace function public.brivia_grid_rows_per_degree(p_level int)
returns double precision
language sql
immutable
set search_path = public
as $$
  select case p_level when 7 then 48.0::float8 when 6 then 16.0::float8 when 5 then 16.0::float8 / 3.0 end
$$;

create or replace function public.brivia_grid_cell(p_lat double precision, p_lng double precision, p_level int default 7)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  n float8;
  r bigint;
  phi float8;
  ncols bigint;
  c bigint;
begin
  if p_lat is null or p_lng is null or p_level is null or p_level not in (5, 6, 7)
     or p_lat = 'NaN'::float8 or p_lng = 'NaN'::float8
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    -- (Infinity is out of range, so it is caught by the range checks.)
    raise exception 'invalid location' using errcode = '22023';
  end if;
  n := public.brivia_grid_rows_per_degree(p_level);
  r := least(floor((p_lat + 90) * n)::bigint, round(180 * n)::bigint - 1);
  phi := -90 + (r + 0.5) / n;
  ncols := greatest(1, floor(360 * n * cos(radians(phi)))::bigint);
  c := mod(floor((p_lng + 180) / 360 * ncols)::bigint, ncols);
  return 'g' || p_level || ':' || r || ':' || c;
end;
$$;

create or replace function public.brivia_grid_centroid(p_cell text)
returns table(lat double precision, lng double precision)
language plpgsql
immutable
set search_path = public
as $$
declare
  m text[];
  lvl int;
  n float8;
  r bigint;
  c bigint;
  phi float8;
  ncols bigint;
begin
  m := regexp_match(coalesce(p_cell, ''), '^g([5-7]):(0|[1-9][0-9]{0,5}):(0|[1-9][0-9]{0,5})$');
  if m is null then
    raise exception 'invalid cell' using errcode = '22023';
  end if;
  lvl := m[1]::int; r := m[2]::bigint; c := m[3]::bigint;
  n := public.brivia_grid_rows_per_degree(lvl);
  if r > round(180 * n)::bigint - 1 then
    raise exception 'invalid cell' using errcode = '22023';
  end if;
  phi := -90 + (r + 0.5) / n;
  ncols := greatest(1, floor(360 * n * cos(radians(phi)))::bigint);
  if c > ncols - 1 then
    raise exception 'invalid cell' using errcode = '22023';
  end if;
  lat := phi;
  lng := -180 + (c + 0.5) * 360 / ncols;
  return next;
end;
$$;

create or replace function public.brivia_grid_parent(p_cell text, p_level int)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  g record;
begin
  select * into g from public.brivia_grid_centroid(p_cell);   -- validates the cell
  -- A parent is at the same or a coarser level (5..cell level).
  if p_level is null or p_level < 5 or p_level > substr(p_cell, 2, 1)::int then
    raise exception 'invalid cell' using errcode = '22023';
  end if;
  return public.brivia_grid_cell(g.lat, g.lng, p_level);
end;
$$;

create or replace function public.brivia_haversine_km(a_lat double precision, a_lng double precision,
                                                      b_lat double precision, b_lng double precision)
returns double precision
language sql
immutable
set search_path = public
as $$
  select 2 * 6371.0088 * asin(least(1.0, sqrt(
           power(sin(radians(b_lat - a_lat) / 2), 2)
           + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))))
$$;

create or replace function public.brivia_cell_km(p_a text, p_b text)
returns double precision
language plpgsql
immutable
set search_path = public
as $$
declare
  a record;
  b record;
begin
  select * into a from public.brivia_grid_centroid(p_a);
  if p_a = p_b then
    return 0;
  end if;
  select * into b from public.brivia_grid_centroid(p_b);
  return public.brivia_haversine_km(a.lat, a.lng, b.lat, b.lng);
end;
$$;

-- Rings (spec §4.2): 0 <= 3 km, 1 <= 15, 2 <= 60, 3 <= 350, 4 <= 2500, 5 beyond.
create or replace function public.brivia_ring(p_km double precision)
returns int
language sql
immutable
set search_path = public
as $$
  select case
    when p_km is null or p_km = 'NaN'::float8 then null
    when p_km <= 3 then 0
    when p_km <= 15 then 1
    when p_km <= 60 then 2
    when p_km <= 350 then 3
    when p_km <= 2500 then 4
    else 5
  end
$$;

-- Places: a city list for the "Pick my city" fallback and the place label of a cell.
create table if not exists public.place (
  id text primary key,
  name text not null,
  region text not null,
  country text not null,
  lat double precision not null,
  lng double precision not null,
  is_launch boolean not null default false
);
alter table public.place enable row level security;
revoke all on public.place from public, anon, authenticated;
grant select (id, name, region, country, is_launch) on public.place to anon, authenticated;
drop policy if exists place_select on public.place;
create policy place_select on public.place for select to anon, authenticated using (true);

-- The place whose centroid is nearest to the cell's centroid.
create or replace function public.brivia_nearest_place(p_cell text)
returns text
language sql
stable
set search_path = public
as $$
  select p.id
    from public.brivia_grid_centroid(p_cell) g, public.place p
   order by public.brivia_haversine_km(g.lat, g.lng, p.lat, p.lng), p.id
   limit 1
$$;

revoke all on function public.brivia_grid_rows_per_degree(int) from public, anon, authenticated;
revoke all on function public.brivia_grid_cell(double precision, double precision, int) from public, anon, authenticated;
revoke all on function public.brivia_grid_centroid(text) from public, anon, authenticated;
revoke all on function public.brivia_grid_parent(text, int) from public, anon, authenticated;
revoke all on function public.brivia_haversine_km(double precision, double precision, double precision, double precision)
  from public, anon, authenticated;
revoke all on function public.brivia_cell_km(text, text) from public, anon, authenticated;
revoke all on function public.brivia_ring(double precision) from public, anon, authenticated;
revoke all on function public.brivia_nearest_place(text) from public, anon, authenticated;

-- Seed: every Indian state capital, the main metros and union-territory capitals, plus world metros.
-- Launch cities (is_launch): Bengaluru, Mumbai, Delhi, Pune. Centroids are approximate city centres.
insert into public.place (id, name, region, country, lat, lng, is_launch) values
  -- Launch cities
  ('in-bengaluru', 'Bengaluru', 'Karnataka', 'India', 12.9716, 77.5946, true),
  ('in-mumbai', 'Mumbai', 'Maharashtra', 'India', 19.0760, 72.8777, true),
  ('in-delhi', 'Delhi', 'Delhi', 'India', 28.6139, 77.2090, true),
  ('in-pune', 'Pune', 'Maharashtra', 'India', 18.5204, 73.8567, true),
  -- State capitals
  ('in-amaravati', 'Amaravati', 'Andhra Pradesh', 'India', 16.5131, 80.5165, false),
  ('in-itanagar', 'Itanagar', 'Arunachal Pradesh', 'India', 27.0844, 93.6053, false),
  ('in-guwahati', 'Guwahati', 'Assam', 'India', 26.1445, 91.7362, false),
  ('in-patna', 'Patna', 'Bihar', 'India', 25.5941, 85.1376, false),
  ('in-raipur', 'Raipur', 'Chhattisgarh', 'India', 21.2514, 81.6296, false),
  ('in-panaji', 'Panaji', 'Goa', 'India', 15.4909, 73.8278, false),
  ('in-gandhinagar', 'Gandhinagar', 'Gujarat', 'India', 23.2156, 72.6369, false),
  ('in-chandigarh', 'Chandigarh', 'Chandigarh', 'India', 30.7333, 76.7794, false),
  ('in-shimla', 'Shimla', 'Himachal Pradesh', 'India', 31.1048, 77.1734, false),
  ('in-ranchi', 'Ranchi', 'Jharkhand', 'India', 23.3441, 85.3096, false),
  ('in-thiruvananthapuram', 'Thiruvananthapuram', 'Kerala', 'India', 8.5241, 76.9366, false),
  ('in-bhopal', 'Bhopal', 'Madhya Pradesh', 'India', 23.2599, 77.4126, false),
  ('in-imphal', 'Imphal', 'Manipur', 'India', 24.8170, 93.9368, false),
  ('in-shillong', 'Shillong', 'Meghalaya', 'India', 25.5788, 91.8933, false),
  ('in-aizawl', 'Aizawl', 'Mizoram', 'India', 23.7271, 92.7176, false),
  ('in-kohima', 'Kohima', 'Nagaland', 'India', 25.6751, 94.1086, false),
  ('in-bhubaneswar', 'Bhubaneswar', 'Odisha', 'India', 20.2961, 85.8245, false),
  ('in-jaipur', 'Jaipur', 'Rajasthan', 'India', 26.9124, 75.7873, false),
  ('in-gangtok', 'Gangtok', 'Sikkim', 'India', 27.3389, 88.6065, false),
  ('in-chennai', 'Chennai', 'Tamil Nadu', 'India', 13.0827, 80.2707, false),
  ('in-hyderabad', 'Hyderabad', 'Telangana', 'India', 17.3850, 78.4867, false),
  ('in-agartala', 'Agartala', 'Tripura', 'India', 23.8315, 91.2868, false),
  ('in-lucknow', 'Lucknow', 'Uttar Pradesh', 'India', 26.8467, 80.9462, false),
  ('in-dehradun', 'Dehradun', 'Uttarakhand', 'India', 30.3165, 78.0322, false),
  ('in-kolkata', 'Kolkata', 'West Bengal', 'India', 22.5726, 88.3639, false),
  -- Union-territory capitals
  ('in-srinagar', 'Srinagar', 'Jammu and Kashmir', 'India', 34.0837, 74.7973, false),
  ('in-jammu', 'Jammu', 'Jammu and Kashmir', 'India', 32.7266, 74.8570, false),
  ('in-leh', 'Leh', 'Ladakh', 'India', 34.1526, 77.5771, false),
  ('in-puducherry', 'Puducherry', 'Puducherry', 'India', 11.9416, 79.8083, false),
  ('in-port-blair', 'Port Blair', 'Andaman and Nicobar Islands', 'India', 11.6234, 92.7265, false),
  ('in-kavaratti', 'Kavaratti', 'Lakshadweep', 'India', 10.5667, 72.6417, false),
  ('in-daman', 'Daman', 'Dadra and Nagar Haveli and Daman and Diu', 'India', 20.3974, 72.8328, false),
  -- Metros and large cities
  ('in-navi-mumbai', 'Navi Mumbai', 'Maharashtra', 'India', 19.0330, 73.0297, false),
  ('in-thane', 'Thane', 'Maharashtra', 'India', 19.2183, 72.9781, false),
  ('in-nagpur', 'Nagpur', 'Maharashtra', 'India', 21.1458, 79.0882, false),
  ('in-nashik', 'Nashik', 'Maharashtra', 'India', 19.9975, 73.7898, false),
  ('in-aurangabad', 'Chhatrapati Sambhajinagar', 'Maharashtra', 'India', 19.8762, 75.3433, false),
  ('in-gurugram', 'Gurugram', 'Haryana', 'India', 28.4595, 77.0266, false),
  ('in-noida', 'Noida', 'Uttar Pradesh', 'India', 28.5355, 77.3910, false),
  ('in-ghaziabad', 'Ghaziabad', 'Uttar Pradesh', 'India', 28.6692, 77.4538, false),
  ('in-faridabad', 'Faridabad', 'Haryana', 'India', 28.4089, 77.3178, false),
  ('in-ahmedabad', 'Ahmedabad', 'Gujarat', 'India', 23.0225, 72.5714, false),
  ('in-surat', 'Surat', 'Gujarat', 'India', 21.1702, 72.8311, false),
  ('in-vadodara', 'Vadodara', 'Gujarat', 'India', 22.3072, 73.1812, false),
  ('in-rajkot', 'Rajkot', 'Gujarat', 'India', 22.3039, 70.8022, false),
  ('in-indore', 'Indore', 'Madhya Pradesh', 'India', 22.7196, 75.8577, false),
  ('in-kochi', 'Kochi', 'Kerala', 'India', 9.9312, 76.2673, false),
  ('in-kozhikode', 'Kozhikode', 'Kerala', 'India', 11.2588, 75.7804, false),
  ('in-coimbatore', 'Coimbatore', 'Tamil Nadu', 'India', 11.0168, 76.9558, false),
  ('in-madurai', 'Madurai', 'Tamil Nadu', 'India', 9.9252, 78.1198, false),
  ('in-tiruchirappalli', 'Tiruchirappalli', 'Tamil Nadu', 'India', 10.7905, 78.7047, false),
  ('in-mysuru', 'Mysuru', 'Karnataka', 'India', 12.2958, 76.6394, false),
  ('in-mangaluru', 'Mangaluru', 'Karnataka', 'India', 12.9141, 74.8560, false),
  ('in-hubballi', 'Hubballi', 'Karnataka', 'India', 15.3647, 75.1240, false),
  ('in-visakhapatnam', 'Visakhapatnam', 'Andhra Pradesh', 'India', 17.6868, 83.2185, false),
  ('in-vijayawada', 'Vijayawada', 'Andhra Pradesh', 'India', 16.5062, 80.6480, false),
  ('in-kanpur', 'Kanpur', 'Uttar Pradesh', 'India', 26.4499, 80.3319, false),
  ('in-varanasi', 'Varanasi', 'Uttar Pradesh', 'India', 25.3176, 82.9739, false),
  ('in-agra', 'Agra', 'Uttar Pradesh', 'India', 27.1767, 78.0081, false),
  ('in-prayagraj', 'Prayagraj', 'Uttar Pradesh', 'India', 25.4358, 81.8463, false),
  ('in-ludhiana', 'Ludhiana', 'Punjab', 'India', 30.9010, 75.8573, false),
  ('in-amritsar', 'Amritsar', 'Punjab', 'India', 31.6340, 74.8723, false),
  ('in-jodhpur', 'Jodhpur', 'Rajasthan', 'India', 26.2389, 73.0243, false),
  ('in-udaipur', 'Udaipur', 'Rajasthan', 'India', 24.5854, 73.7125, false),
  ('in-jamshedpur', 'Jamshedpur', 'Jharkhand', 'India', 22.8046, 86.2029, false),
  -- World metros
  ('gb-london', 'London', 'England', 'United Kingdom', 51.5074, -0.1278, false),
  ('us-new-york', 'New York', 'New York', 'United States', 40.7128, -74.0060, false),
  ('us-san-francisco', 'San Francisco', 'California', 'United States', 37.7749, -122.4194, false),
  ('ca-toronto', 'Toronto', 'Ontario', 'Canada', 43.6532, -79.3832, false),
  ('ae-dubai', 'Dubai', 'Dubai', 'United Arab Emirates', 25.2048, 55.2708, false),
  ('sg-singapore', 'Singapore', 'Singapore', 'Singapore', 1.3521, 103.8198, false),
  ('au-sydney', 'Sydney', 'New South Wales', 'Australia', -33.8688, 151.2093, false),
  ('au-melbourne', 'Melbourne', 'Victoria', 'Australia', -37.8136, 144.9631, false),
  ('de-berlin', 'Berlin', 'Berlin', 'Germany', 52.5200, 13.4050, false),
  ('fr-paris', 'Paris', 'Île-de-France', 'France', 48.8566, 2.3522, false),
  ('nl-amsterdam', 'Amsterdam', 'North Holland', 'Netherlands', 52.3676, 4.9041, false),
  ('jp-tokyo', 'Tokyo', 'Tokyo', 'Japan', 35.6762, 139.6503, false),
  ('hk-hong-kong', 'Hong Kong', 'Hong Kong', 'China', 22.3193, 114.1694, false),
  ('my-kuala-lumpur', 'Kuala Lumpur', 'Kuala Lumpur', 'Malaysia', 3.1390, 101.6869, false),
  ('lk-colombo', 'Colombo', 'Western Province', 'Sri Lanka', 6.9271, 79.8612, false),
  ('np-kathmandu', 'Kathmandu', 'Bagmati', 'Nepal', 27.7172, 85.3240, false)
on conflict (id) do update
  set name = excluded.name, region = excluded.region, country = excluded.country,
      lat = excluded.lat, lng = excluded.lng, is_launch = excluded.is_launch;

-- =============================================================================================
-- 2. Taxonomy and member interests
-- =============================================================================================
-- Interest Topology (spec §3.1): domain (1) -> category (2) -> interest (3) -> niche (4). Ids are dotted slugs;
-- level = number of segments, parent = the id without its last segment (enforced by a check constraint).
-- The taxonomy is original Brivia wording (no third-party taxonomy) and is seeded at the end of this file.
create table if not exists public.interest_node (
  id text primary key,
  parent_id text references public.interest_node(id),
  level smallint not null check (level between 1 and 4),
  label text not null,
  status text not null default 'active' check (status in ('active', 'retired')),
  constraint interest_node_shape check (
    id ~ '^[a-z0-9_]+(\.[a-z0-9_]+){0,3}$'
    and level = array_length(string_to_array(id, '.'), 1)
    and parent_id is not distinct from nullif(regexp_replace(id, '\.[^.]+$', ''), id)
  )
);
-- sensitive (D-029): special-category topics (health and mental health, religion and spirituality, sexual
-- orientation and gender identity, sobriety). They count toward resonance only and are never shown to other
-- members: not in profiles.skills, cards, chips or search.
alter table public.interest_node add column if not exists sensitive boolean not null default false;
create index if not exists interest_node_parent_idx on public.interest_node (parent_id);
alter table public.interest_node enable row level security;
revoke all on public.interest_node from public, anon, authenticated;
grant select on public.interest_node to anon, authenticated;
drop policy if exists interest_node_select on public.interest_node;
create policy interest_node_select on public.interest_node for select to anon, authenticated using (true);

-- Passion Budget (spec §3.2): each member spreads exactly 20 points over 1-12 interests (level 3 or 4).
-- Written only by set_member_interests; read only through my_interests (no client grants).
create table if not exists public.member_interest (
  member_id uuid not null references public.profiles(id) on delete cascade,
  interest_id text not null references public.interest_node(id),
  points smallint not null check (points between 1 and 20),
  mode text not null default 'play' check (mode in ('learn', 'play', 'teach', 'build')),
  primary key (member_id, interest_id)
);
create index if not exists member_interest_interest_idx on public.member_interest (interest_id);
alter table public.member_interest enable row level security;
revoke all on public.member_interest from public, anon, authenticated;

-- set_member_interests(p_items): atomically replaces the caller's interests.
-- p_items = [{ "interest_id": text, "points": int, "mode": "learn"|"play"|"teach"|"build" (optional, default play) }].
-- Rules: 1-12 items, no duplicate ids, every id an active node at level >= 3, integer points >= 1 summing to
-- exactly 20, a valid mode. Any violation raises 22023 'invalid interests' and changes nothing. Then
-- profiles.skills is set to the chosen labels ordered by points desc, label asc (a server-written display copy).
-- Sensitive interests (D-029) are stored for matching but left out of profiles.skills, which other members see.
create or replace function public.set_member_interests(p_items jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  -- A profile row is required; locking it serialises concurrent calls by the same member.
  perform 1 from public.profiles where id = uid for update;
  if uid is null or not found then
    raise exception 'profile required' using errcode = 'P0002';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid interests' using errcode = '22023';
  end if;
  n := jsonb_array_length(p_items);
  if n < 1 or n > 12 then
    raise exception 'invalid interests' using errcode = '22023';
  end if;
  -- Shape of every item (types first, so the casts below cannot fail).
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'interest_id') is distinct from 'string'
        or jsonb_typeof(e -> 'points') is distinct from 'number'
        or (e ? 'mode' and jsonb_typeof(e -> 'mode') is distinct from 'string')
  ) then
    raise exception 'invalid interests' using errcode = '22023';
  end if;
  -- Values: integer points in 1..20 summing to 20, valid modes, distinct active level-3/4 nodes.
  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where (e ->> 'points')::numeric <> trunc((e ->> 'points')::numeric)
        or (e ->> 'points')::numeric not between 1 and 20
        or coalesce(e ->> 'mode', 'play') not in ('learn', 'play', 'teach', 'build')
        or not exists (select 1 from public.interest_node n
                        where n.id = e ->> 'interest_id' and n.status = 'active' and n.level >= 3)
  )
  or (select sum((e ->> 'points')::numeric) from jsonb_array_elements(p_items) e) <> 20
  or (select count(distinct e ->> 'interest_id') from jsonb_array_elements(p_items) e) <> n then
    raise exception 'invalid interests' using errcode = '22023';
  end if;

  delete from public.member_interest where member_id = uid;
  insert into public.member_interest (member_id, interest_id, points, mode)
  select uid, e ->> 'interest_id', (e ->> 'points')::numeric::smallint, coalesce(e ->> 'mode', 'play')
    from jsonb_array_elements(p_items) e;

  update public.profiles
     set skills = coalesce((select array_agg(n.label order by mi.points desc, n.label asc)
                              from public.member_interest mi join public.interest_node n on n.id = mi.interest_id
                             where mi.member_id = uid and not n.sensitive), '{}'),
         updated_at = now()
   where id = uid;
end;
$$;
revoke all on function public.set_member_interests(jsonb) from public, anon;
grant execute on function public.set_member_interests(jsonb) to authenticated;

-- my_interests(): the caller's own interests with labels.
create or replace function public.my_interests()
returns table(interest_id text, label text, points int, mode text)
language sql
stable
security definer
set search_path = public
as $$
  select mi.interest_id, n.label, mi.points::int, mi.mode
    from public.member_interest mi
    join public.interest_node n on n.id = mi.interest_id
   where mi.member_id = auth.uid()
   order by mi.points desc, n.label asc
$$;
revoke all on function public.my_interests() from public, anon;
grant execute on function public.my_interests() to authenticated;

-- =============================================================================================
-- 3. Member orbit
-- =============================================================================================
-- The member's home cell (spec §9.1.4). Only cells are stored: the g7 cell, its g6 and g5 parents (k-anonymity
-- coarsening) and the nearest place. No client grants: written by set_home_location / set_home_city only.
create table if not exists public.member_orbit (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  cell_scheme text not null default 'grid1',
  home_cell text not null,
  home_cell_g6 text not null,
  home_cell_g5 text not null,
  place_id text not null references public.place(id),
  home_set_at timestamptz not null default now()
);
alter table public.member_orbit enable row level security;
revoke all on public.member_orbit from public, anon, authenticated;

-- One row per accepted home (or, later, travel) change. It stores no cell. Cap: 3 per rolling 24 h.
create table if not exists public.location_change (
  id bigserial primary key,
  member_id uuid not null references public.profiles(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists location_change_member_at_idx on public.location_change (member_id, at);
alter table public.location_change enable row level security;
revoke all on public.location_change from public, anon, authenticated;
revoke all on sequence public.location_change_id_seq from public, anon, authenticated;

-- Internal: apply one home change for p_member (the caller has checked the profile and validated the cell).
-- Serialised per member by an advisory lock; over the cap it raises PT429 'try again later' (PostgREST: HTTP 429)
-- before anything is written.
create or replace function public.brivia_apply_home_change(p_member uuid, p_cell text, p_place_id text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_name text;
begin
  perform pg_advisory_xact_lock(hashtextextended('brivia.location_change:' || p_member::text, 0));
  if (select count(*) from public.location_change
       where member_id = p_member and at > now() - interval '24 hours') >= 3 then
    raise exception 'try again later' using errcode = 'PT429';
  end if;
  insert into public.location_change (member_id) values (p_member);
  insert into public.member_orbit (member_id, cell_scheme, home_cell, home_cell_g6, home_cell_g5, place_id, home_set_at)
  values (p_member, 'grid1', p_cell, public.brivia_grid_parent(p_cell, 6), public.brivia_grid_parent(p_cell, 5),
          p_place_id, now())
  on conflict (member_id) do update
    set cell_scheme = excluded.cell_scheme, home_cell = excluded.home_cell, home_cell_g6 = excluded.home_cell_g6,
        home_cell_g5 = excluded.home_cell_g5, place_id = excluded.place_id, home_set_at = excluded.home_set_at;
  select name into v_name from public.place where id = p_place_id;
  return v_name;
end;
$$;
revoke all on function public.brivia_apply_home_change(uuid, text, text) from public, anon, authenticated;

-- set_home_location(lat, lng): snaps to the g7 cell in SQL (D-028) and returns the nearest place's name.
-- Volatile, so PostgREST serves it only on POST (coordinates in the body, never in a query string).
-- The coordinates are never stored, echoed or put in an error message. Invalid input: 22023 'invalid location',
-- and no change is consumed. Requires a profile row (P0002 'profile required').
create or replace function public.set_home_location(lat double precision, lng double precision)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_cell text;
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  v_cell := public.brivia_grid_cell($1, $2, 7);
  return public.brivia_apply_home_change(uid, v_cell, public.brivia_nearest_place(v_cell));
end;
$$;
revoke all on function public.set_home_location(double precision, double precision) from public, anon;
grant execute on function public.set_home_location(double precision, double precision) to authenticated;

-- set_home_city(p_place_id): the "Pick my city" fallback. Uses the place's centroid cell and that place's id.
-- Unknown id: 22023 'invalid place'. Same cap and rules as set_home_location.
create or replace function public.set_home_city(p_place_id text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_cell text;
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  select public.brivia_grid_cell(p.lat, p.lng, 7) into v_cell from public.place p where p.id = p_place_id;
  if v_cell is null then
    raise exception 'invalid place' using errcode = '22023';
  end if;
  return public.brivia_apply_home_change(uid, v_cell, p_place_id);
end;
$$;
revoke all on function public.set_home_city(text) from public, anon;
grant execute on function public.set_home_city(text) to authenticated;

-- =============================================================================================
-- 4. Completion and visibility
-- =============================================================================================
-- D-030 (spec §7): a member is completed when they have
--   * a name: brivia_is_completed(name, 'x') (trimmed, not empty, not 'New Member'; the legacy city plays no part);
--   * a member_orbit row (a cell);
--   * 1-12 member_interest rows whose points sum to exactly 20 (the Passion Budget).
-- Completion reads member_interest and member_orbit, never profiles.skills (a client-writable display copy).
-- Internal: not executable by any client role.
create or replace function public.brivia_member_completed(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (select 1 from public.profiles p where p.id = p_id and public.brivia_is_completed(p.name, 'x'))
    and exists (select 1 from public.member_orbit o where o.member_id = p_id)
    and (select count(*) between 1 and 12 and coalesce(sum(mi.points), 0) = 20
           from public.member_interest mi where mi.member_id = p_id),
    false)
$$;
revoke all on function public.brivia_member_completed(uuid) from public, anon, authenticated;

-- The single member-facing visibility rule (spec §9.1.1): both completed, different members, same world (is_test
-- equal, Ruling P14), and no block in either direction. Internal: not executable by any client role.
create or replace function public.brivia_visible_to(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_viewer <> p_target
    and exists (select 1 from public.profiles a join public.profiles b on a.is_test = b.is_test
                 where a.id = p_viewer and b.id = p_target)
    and not exists (select 1 from public.brivia_blocks bl
                     where (bl.blocker_id = p_viewer and bl.blocked_id = p_target)
                        or (bl.blocker_id = p_target and bl.blocked_id = p_viewer))
    and public.brivia_member_completed(p_viewer)
    and public.brivia_member_completed(p_target),
    false)
$$;
revoke all on function public.brivia_visible_to(uuid, uuid) from public, anon, authenticated;

-- The candidate RPCs of 0003, redefined on top of brivia_member_completed / brivia_visible_to. Signatures, return
-- types, caps (50 ids, 20 rows), ordering and LIKE escaping are unchanged. A caller who is not completed sees nothing.
create or replace function public.get_candidates(p_ids uuid[])
returns setof public.public_profile_card
language sql
stable
security definer
set search_path = public
as $$
  with me as (  -- Ruling I5: the caller must be a completed member
    select id, is_test from public.profiles where id = auth.uid() and public.brivia_member_completed(id)),
  wanted as (  -- the first 50 distinct ids, in the order given
    select id from (
      select distinct on (u.id) u.id, u.ord from unnest(p_ids) with ordinality as u(id, ord)
      where u.id is not null order by u.id, u.ord
    ) d order by d.ord limit 50
  )
  select p.id, p.name, p.full_name, p.gender, p.city, p.state, p.experience, p.skills, p.looking_for,
         p.photo_url, p.cover_url, p.created_at
  from public.profiles p
  join me on p.id <> me.id and p.is_test = me.is_test
  where p.id in (select id from wanted)
    and public.brivia_visible_to(me.id, p.id)
  order by p.created_at desc, p.id desc;
$$;
revoke all on function public.get_candidates(uuid[]) from public, anon;
grant execute on function public.get_candidates(uuid[]) to authenticated;

create or replace function public.search_members(p_query text, p_limit int default 20)
returns setof public.public_profile_card
language sql
stable
security definer
set search_path = public
as $$
  with me as (  -- Ruling I5: the caller must be a completed member
    select id, is_test from public.profiles where id = auth.uid() and public.brivia_member_completed(id)),
  q as (  -- LIKE wildcards in the query are literal; empty or whitespace-only queries match nothing
    select '%' || replace(replace(replace(left(btrim(p_query), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
    where coalesce(btrim(p_query), '') <> ''
  )
  select p.id, p.name, p.full_name, p.gender, p.city, p.state, p.experience, p.skills, p.looking_for,
         p.photo_url, p.cover_url, p.created_at
  from public.profiles p
  join me on p.id <> me.id and p.is_test = me.is_test
  cross join q
  where (p.name ilike q.pattern escape '\' or p.full_name ilike q.pattern escape '\'
         or p.city ilike q.pattern escape '\'
         or exists (select 1 from unnest(p.skills) s where s ilike q.pattern escape '\')
         or exists (select 1 from unnest(p.looking_for) l where l ilike q.pattern escape '\'))
    and public.brivia_visible_to(me.id, p.id)
  order by (p.name ilike q.pattern escape '\' or p.full_name ilike q.pattern escape '\') desc,
           p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 20));
$$;
revoke all on function public.search_members(text, int) from public, anon;
grant execute on function public.search_members(text, int) to authenticated;

create or replace function public.list_members(p_limit int default 20, p_after timestamptz default null,
                                               p_after_id uuid default null)
returns setof public.public_profile_card
language sql
stable
security definer
set search_path = public
as $$
  with me as (  -- Ruling I5: the caller must be a completed member
    select id, is_test from public.profiles where id = auth.uid() and public.brivia_member_completed(id))
  select p.id, p.name, p.full_name, p.gender, p.city, p.state, p.experience, p.skills, p.looking_for,
         p.photo_url, p.cover_url, p.created_at
  from public.profiles p
  join me on p.id <> me.id and p.is_test = me.is_test
  where (p_after is null
         or p.created_at < p_after
         or (p_after_id is not null and p.created_at = p_after and p.id < p_after_id))
    and public.brivia_visible_to(me.id, p.id)
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 20));
$$;
revoke all on function public.list_members(int, timestamptz, uuid) from public, anon;
grant execute on function public.list_members(int, timestamptz, uuid) to authenticated;

-- Posts by p_author: own posts always; otherwise brivia_visible_to(caller, author).
create or replace function public.brivia_can_see_author(p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_author = auth.uid() or public.brivia_visible_to(auth.uid(), p_author);
$$;
revoke all on function public.brivia_can_see_author(uuid) from public, anon;
grant execute on function public.brivia_can_see_author(uuid) to authenticated;

-- my_onboarding_status(): the caller's own onboarding progress (one row; none without a session). Counts only:
-- no interest labels, no cell id.
create or replace function public.my_onboarding_status()
returns table(interests int, points int, has_cell boolean, place_label text, completed boolean)
language sql
stable
security definer
set search_path = public
as $$
  select (select count(*)::int from public.member_interest mi where mi.member_id = me.uid),
         (select coalesce(sum(mi.points), 0)::int from public.member_interest mi where mi.member_id = me.uid),
         exists (select 1 from public.member_orbit o where o.member_id = me.uid),
         (select pl.name from public.member_orbit o join public.place pl on pl.id = o.place_id where o.member_id = me.uid),
         public.brivia_member_completed(me.uid)
    from (select auth.uid() as uid) me
   where me.uid is not null
$$;
revoke all on function public.my_onboarding_status() from public, anon;
grant execute on function public.my_onboarding_status() to authenticated;

-- =============================================================================================
-- 5. k-anonymity
-- =============================================================================================
-- Spec §9.1.4. A cell's population counts members of one world (is_test) who are completed
-- (brivia_member_completed), whose account is older than 14 days at the refresh date, and who are not flagged.
-- Floors: k = 10 for rings 0-1, k = 5 for rings 2+. Hysteresis: a cell is ok for k only after 7 consecutive
-- nightly counts with n >= k (a missed night restarts the streak), and stops being ok at the first count with n < k.
-- Populations are counted for every g7 cell and for the g6 and g5 parents STORED in member_orbit (home_cell_g6,
-- home_cell_g5). Parents are never re-derived here: grid parents are only approximately nested.

-- "Flagged (reported or restricted)": the source until moderation tooling exists. Owner-only (no client grants).
create table if not exists public.member_flag (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null,
  flagged_at timestamptz not null default now()
);
alter table public.member_flag enable row level security;
revoke all on public.member_flag from public, anon, authenticated;

-- One row per (cell, world). Owner-only: populations near the floor are exactly what k-anonymity hides.
create table if not exists public.cell_density (
  cell text not null,
  is_test boolean not null,
  n int not null,
  streak10 int not null default 0,
  streak5 int not null default 0,
  ok10 boolean not null default false,
  ok5 boolean not null default false,
  as_of date not null,
  primary key (cell, is_test)
);
alter table public.cell_density enable row level security;
revoke all on public.cell_density from public, anon, authenticated;

-- refresh_cell_density(p_as_of): the nightly count (owner only; pg_cron below).
-- * Watermark: if any row already has as_of >= p_as_of, it returns 0 and changes nothing (a same-day or older
--   re-run is a true no-op, even if members moved in between).
-- * Otherwise every (cell, world) with members, and every existing row, is rewritten with as_of = p_as_of:
--   n = the population; streakK = previous streakK + 1 when n >= k, else 0; okK = streakK >= 7. The previous streak
--   only carries over from the night before (p_as_of - as_of = 1): a missed night restarts the count at 1 or 0.
-- * Rows left with n = 0 and both streaks 0 are deleted. Returns the number of rows written.
create or replace function public.refresh_cell_density(p_as_of date default current_date)
returns int
language plpgsql
volatile
set search_path = public
as $$
declare
  v_rows int;
begin
  if p_as_of is null then
    raise exception 'invalid date' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('brivia.cell_density', 0));
  -- Global watermark: a refresh for a date that is not newer than the last one is a no-op.
  if exists (select 1 from public.cell_density where as_of >= p_as_of) then
    return 0;
  end if;
  with member as (
    select o.home_cell, o.home_cell_g6, o.home_cell_g5, p.is_test,
           (p.created_at < (p_as_of - 14)::timestamptz
            and not exists (select 1 from public.member_flag f where f.member_id = p.id)
            and public.brivia_member_completed(p.id)) as counted
      from public.member_orbit o
      join public.profiles p on p.id = o.member_id
  ),
  counts as (
    select c.cell, c.is_test, (count(*) filter (where c.counted))::int as n
      from (select home_cell as cell, is_test, counted from member
            union all select home_cell_g6, is_test, counted from member
            union all select home_cell_g5, is_test, counted from member) c
     group by c.cell, c.is_test
  ),
  merged as (
    select coalesce(c.cell, d.cell) as cell, coalesce(c.is_test, d.is_test) as is_test, coalesce(c.n, 0) as n,
           -- a missed night (a gap of more than one day) restarts the streak
           case when p_as_of - d.as_of = 1 then d.streak10 else 0 end as old10,
           case when p_as_of - d.as_of = 1 then d.streak5 else 0 end as old5
      from counts c
      full join public.cell_density d on d.cell = c.cell and d.is_test = c.is_test
  ),
  nxt as (
    select cell, is_test, n,
           case when n >= 10 then old10 + 1 else 0 end as s10,
           case when n >= 5 then old5 + 1 else 0 end as s5
      from merged
  )
  insert into public.cell_density (cell, is_test, n, streak10, streak5, ok10, ok5, as_of)
  select cell, is_test, n, s10, s5, s10 >= 7, s5 >= 7, p_as_of from nxt
  on conflict (cell, is_test) do update
    set n = excluded.n, streak10 = excluded.streak10, streak5 = excluded.streak5,
        ok10 = excluded.ok10, ok5 = excluded.ok5, as_of = excluded.as_of;
  get diagnostics v_rows = row_count;
  -- An empty cell with no streak carries no information: drop it.
  delete from public.cell_density where n = 0 and streak10 = 0 and streak5 = 0;
  return v_rows;
end;
$$;
revoke all on function public.refresh_cell_density(date) from public, anon, authenticated;

-- brivia_cell_ok(cell, world, k): may a band be shown at this cell's level for floor k (10 or 5)? Internal.
-- A missing row, or any k other than 10 or 5, is false.
create or replace function public.brivia_cell_ok(p_cell text, p_is_test boolean, p_k int)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((select case p_k when 10 then d.ok10 when 5 then d.ok5 else false end
                     from public.cell_density d where d.cell = p_cell and d.is_test = p_is_test), false)
$$;
revoke all on function public.brivia_cell_ok(text, boolean, int) from public, anon, authenticated;

-- Nightly schedule (01:47 IST). pg_cron is optional here: without it (the local harness), run
-- `select public.refresh_cell_density();` nightly some other way. cron.schedule with a job name replaces that job,
-- so re-running this migration does not add a second one.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.schedule('brivia-refresh-cell-density', '17 20 * * *',
                                     'select public.refresh_cell_density()')$q$;
  else
    raise notice 'pg_cron is not installed: schedule public.refresh_cell_density() nightly (spec §9.1.4).';
  end if;
end $$;

-- =============================================================================================
-- 6. Signals
-- =============================================================================================
-- Arena Ruling A1 (D-026, D-032; spec §6.4). The sender's OWN quota is honest; every RECIPIENT-side outcome is
-- uniform and silent.
-- * Every send goes through send_signal (raw client inserts into connection_requests are revoked below). It charges
--   the sender-only ledger BEFORE it looks at the recipient, so blocked (either direction), cross-world, duplicate,
--   declined, unknown and not-completed targets all answer 'sent' and cost exactly one unit: neither the response,
--   nor my_signal_quota(), nor the sender's interaction rows (send_signal writes none) can probe recipient state.
-- * Only the sender's own cap fails visibly (PT429, PostgREST HTTP 429), and a refused send is not charged.
-- * A request that completes a match is never refused, and it still costs one unit.
-- * Completion gates every consent path: brivia_has_completed_profile() (0001; used by the request, message, match
--   and post policies) now means brivia_member_completed(auth.uid()), and respond_connection_request requires it.

-- Private config (owner only). Keys: signal_daily_limit (default 30), signal_live_limit (default 100). No row is
-- inserted here, so the defaults apply until the founder sets private values in the SQL editor.
create table if not exists public.brivia_config (
  key text primary key,
  value jsonb not null
);
alter table public.brivia_config enable row level security;
revoke all on public.brivia_config from public, anon, authenticated;

-- Internal: an integer config value, or the default when the key is missing, not a number, negative, or above the
-- int range (2147483647).
create or replace function public.brivia_config_int(p_key text, p_default int)
returns int
language sql
stable
set search_path = public
as $$
  select coalesce((select case when jsonb_typeof(c.value) = 'number'
                                    and (c.value #>> '{}')::numeric between 0 and 2147483647
                               then floor((c.value #>> '{}')::numeric)::int end
                     from public.brivia_config c where c.key = p_key), p_default)
$$;
revoke all on function public.brivia_config_int(text, int) from public, anon, authenticated;

-- One row per send attempt. Sender-only and server-written: no client grants, RLS on with no policy.
-- kind: 'signal' (the deck / search signal), 'long_range' (§7, iteration 4) and 'wtd' (Worth-the-Distance, §5.3)
-- get their own counters. to_id deliberately has NO foreign key: an attempt at a non-existent id is charged and
-- kept like any other, so the ledger cannot tell a sender which ids exist.
create table if not exists public.signal_ledger (
  id bigserial primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null,
  kind text not null default 'signal' check (kind in ('signal', 'long_range', 'wtd')),
  at timestamptz not null default now()
);
create index if not exists signal_ledger_sender_kind_at_idx on public.signal_ledger (sender_id, kind, at);
alter table public.signal_ledger enable row level security;
revoke all on public.signal_ledger from public, anon, authenticated;
revoke all on sequence public.signal_ledger_id_seq from public, anon, authenticated;

-- Internal: the caller's quota state. used = 'signal' rows in the last 24 h; live = distinct to_id (any kind) in
-- the last 30 days with no current match to the sender (a declined or dead target stays live: the sender cannot
-- tell); resets_at = when the oldest 'signal' row leaves the 24 h window, rounded UP to the hour (null if none).
create or replace function public.brivia_signal_state(p_sender uuid)
returns table(daily_limit int, used int, resets_at timestamptz, live_unanswered int, live_limit int)
language sql
stable
security definer
set search_path = public
as $$
  select public.brivia_config_int('signal_daily_limit', 30),
         (select count(*)::int from public.signal_ledger l
           where l.sender_id = p_sender and l.kind = 'signal' and l.at > now() - interval '24 hours'),
         (select case when date_trunc('hour', t) = t then t else date_trunc('hour', t) + interval '1 hour' end
            from (select min(l.at) + interval '24 hours' as t from public.signal_ledger l
                   where l.sender_id = p_sender and l.kind = 'signal' and l.at > now() - interval '24 hours') o
           where t is not null),
         (select count(distinct l.to_id)::int from public.signal_ledger l
           where l.sender_id = p_sender and l.at > now() - interval '30 days'
             and not exists (select 1 from public.matches m
                              where (m.user1_id = p_sender and m.user2_id = l.to_id)
                                 or (m.user1_id = l.to_id and m.user2_id = p_sender))),
         public.brivia_config_int('signal_live_limit', 100)
$$;
revoke all on function public.brivia_signal_state(uuid) from public, anon, authenticated;

-- my_signal_quota(): the caller's own quota (one row; none without a session). Feeds "N signals left today",
-- "More at HH:MM" and "You have 100 signals waiting for an answer" (UX_SPEC §B/§D).
create or replace function public.my_signal_quota()
returns table(daily_limit int, remaining int, resets_at timestamptz, live_unanswered int, live_limit int)
language sql
stable
security definer
set search_path = public
as $$
  select s.daily_limit, greatest(s.daily_limit - s.used, 0), s.resets_at, s.live_unanswered, s.live_limit
    from public.brivia_signal_state(auth.uid()) s
   where auth.uid() is not null
$$;
revoke all on function public.my_signal_quota() from public, anon;
grant execute on function public.my_signal_quota() to authenticated;

-- send_signal(p_to, p_note): the only way a member sends a request. The order is normative (spec §6.4):
--   1. caller checks, not charged: not completed -> 22023 'complete your profile'; p_to null or self -> 22023
--      'invalid signal'; a note over 500 characters -> 22001;
--   2. the sender lock (one send per sender at a time), then the pair lock (lock order: sender, then pair);
--   3. quota: at a cap, raise PT429 'signal_quota_exhausted' (daily) or 'signal_live_cap' (live), not charged,
--      UNLESS a live reverse request from a visible p_to exists (the completion case is never refused);
--   4. charge: one ledger row;
--   5. recipient side, all silent: only a brivia_visible_to target gets a request (a duplicate or a vanished
--      recipient is swallowed); 'matched' iff a match row for the pair exists afterwards, on every path (the sender
--      can read that row anyway), otherwise 'sent';
--   6. no interaction row on any path; 7. returns the post-charge remaining (floored at 0) and resets_at.
create or replace function public.send_signal(p_to uuid, p_note text default null)
returns table(status text, remaining int, resets_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  s record;
  v_status text := 'sent';
begin
  -- 1. Caller checks (the caller's own state and input: honest, not charged).
  if me is null or not public.brivia_member_completed(me) then
    raise exception 'complete your profile' using errcode = '22023';
  end if;
  if p_to is null or p_to = me then
    raise exception 'invalid signal' using errcode = '22023';
  end if;
  if char_length(p_note) > 500 then
    raise exception 'note too long' using errcode = '22001';
  end if;
  -- 2. One send per sender at a time (parallel sends cannot overshoot the caps), then the pair lock, so a
  --    concurrent reverse request is seen by the completion check below.
  perform pg_advisory_xact_lock(hashtextextended('brivia_request_caps:' || me::text, 0));
  perform public.brivia_lock_pair(me, p_to);
  -- 3. Quota.
  select * into s from public.brivia_signal_state(me);
  if s.used >= s.daily_limit or s.live_unanswered >= s.live_limit then
    if not (public.brivia_visible_to(me, p_to)
            and exists (select 1 from public.connection_requests r
                         where r.from_id = p_to and r.to_id = me and r.status in ('pending', 'declined')
                           and public.brivia_request_is_live(r.status, r.created_at))) then
      if s.used >= s.daily_limit then
        raise exception 'signal_quota_exhausted' using errcode = 'PT429';
      end if;
      raise exception 'signal_live_cap' using errcode = 'PT429';
    end if;
  end if;
  -- 4. Charge, before anything about the recipient is looked at.
  insert into public.signal_ledger (sender_id, to_id) values (me, p_to);
  -- 5. Recipient side: every outcome below answers the same way. Only a visible target gets a request row, so a
  --    NEW match can only come from this branch (the completion trigger).
  if public.brivia_visible_to(me, p_to) then
    begin
      insert into public.connection_requests (from_id, to_id, note) values (me, p_to, p_note);
    exception when unique_violation or foreign_key_violation then
      null;  -- a live earlier request (pending or declined) or a recipient that just vanished: still 'sent'
    end;
  end if;
  -- 'matched' reflects a match row the sender can already read, whatever the partner's state now (blocked, other
  -- world, no longer completed). Checking it only on the visible path would leak a block or a completion change.
  if exists (select 1 from public.matches m
              where (m.user1_id = me and m.user2_id = p_to) or (m.user1_id = p_to and m.user2_id = me)) then
    v_status := 'matched';
  end if;
  -- 6. No interaction row. 7. The post-charge quota.
  select * into s from public.brivia_signal_state(me);
  return query select v_status, greatest(s.daily_limit - s.used, 0), s.resets_at;
end;
$$;
revoke all on function public.send_signal(uuid, text) from public, anon;
grant execute on function public.send_signal(uuid, text) to authenticated;

-- purge_expired_requests (0003, owner only) also prunes signal_ledger rows older than 30 days: no cap reads them
-- (daily: 24 h; live: 30 days). It still returns the number of request rows deleted.
create or replace function public.purge_expired_requests()
returns integer
language sql
volatile
set search_path = public
as $$
  with gone_ledger as (
    delete from public.signal_ledger where at <= now() - interval '30 days'
    returning 1
  ),
  gone as (
    delete from public.connection_requests
     where not public.brivia_request_is_live(status, created_at)
    returning 1
  )
  select count(*)::integer from gone;  -- gone_ledger runs too: data-modifying CTEs always execute
$$;
revoke all on function public.purge_expired_requests() from public, anon, authenticated;

-- Raw client inserts are gone (this also removes the 0003 column grant on from_id, to_id, note).
revoke insert on public.connection_requests from public, anon, authenticated;
drop policy if exists "Members can send connection requests" on public.connection_requests;

-- The before-insert trigger (0003) without the caps (the ledger owns them now). It keeps the pair lock and the
-- replacement of the sender's own expired row (a decline stays indistinguishable from an unanswered request).
create or replace function public.brivia_before_connection_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.brivia_lock_pair(new.from_id, new.to_id);
  delete from public.connection_requests
   where from_id = new.from_id and to_id = new.to_id
     and not public.brivia_request_is_live(status, created_at);
  return new;
end;
$$;
revoke all on function public.brivia_before_connection_request() from public, anon, authenticated;

-- Completion gates every consent path (D-032). Same signature as 0001; the request, message, match and post
-- policies that call it now require the D-030 completion.
create or replace function public.brivia_has_completed_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.brivia_member_completed(auth.uid());
$$;
revoke all on function public.brivia_has_completed_profile() from public, anon;
grant execute on function public.brivia_has_completed_profile() to authenticated;

-- Policies gated on completion, recreated so brivia_has_completed_profile() is evaluated once per statement
-- (wrapped in a scalar subquery: an initplan) instead of once per row. Semantics are those of 0001/0003, except the
-- incoming-request policy, which also hides requests from senders who are no longer completed (fix round 1), so
-- "like back" (send_signal writes nothing to them) and "accept" agree.
-- Internal-for-policies: true only for a sender with a request addressed to the caller who is completed. It answers
-- false for anyone else, so it is not an oracle about arbitrary members.
create or replace function public.brivia_request_sender_completed(p_from uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.connection_requests r where r.from_id = p_from and r.to_id = auth.uid())
     and public.brivia_member_completed(p_from);
$$;
revoke all on function public.brivia_request_sender_completed(uuid) from public, anon;
grant execute on function public.brivia_request_sender_completed(uuid) to authenticated;

drop policy if exists "Members can view their connection requests" on public.connection_requests;
create policy "Members can view their connection requests"
  on public.connection_requests for select to authenticated
  using (
    (select public.brivia_has_completed_profile())
    and to_id = auth.uid()
    and not public.brivia_is_blocked_between(from_id, to_id)  -- caller is a party, so this answers
    and public.brivia_request_is_live(status, created_at)
    and public.brivia_request_sender_completed(from_id)
  );

drop policy if exists "Completed members can view their matches" on public.matches;
create policy "Completed members can view their matches"
  on public.matches for select to authenticated
  using ((select public.brivia_has_completed_profile()) and auth.uid() in (user1_id, user2_id));

drop policy if exists "Completed members can remove their matches" on public.matches;
create policy "Completed members can remove their matches"
  on public.matches for delete to authenticated
  using ((select public.brivia_has_completed_profile()) and auth.uid() in (user1_id, user2_id));

drop policy if exists "Completed members can view their messages" on public.brivia_messages;
create policy "Completed members can view their messages"
  on public.brivia_messages for select to authenticated
  using ((select public.brivia_has_completed_profile()) and auth.uid() in (sender_id, recipient_id));

-- Still ONE insert policy (a second permissive policy would OR away these checks). Same checks as 0003.
drop policy if exists "Completed members can send messages" on public.brivia_messages;
create policy "Completed members can send messages"
  on public.brivia_messages for insert to authenticated
  with check (
    (select public.brivia_has_completed_profile())
    and sender_id = auth.uid()
    and not public.brivia_is_blocked_between(sender_id, recipient_id)
    and public.brivia_same_world(sender_id, recipient_id)
    and exists (
      select 1 from public.matches m
      where (m.user1_id = sender_id and m.user2_id = recipient_id)
         or (m.user1_id = recipient_id and m.user2_id = sender_id)
    )
  );

drop policy if exists "Members can create their own community posts" on public.community_posts;
create policy "Members can create their own community posts"
  on public.community_posts for insert to authenticated
  with check ((select public.brivia_has_completed_profile()) and author_id = auth.uid());

-- respond_connection_request (0003) plus the completion gates: a caller who is not completed gets 22023
-- 'complete your profile' (their own state; it says nothing about the request), and a request from a sender who is
-- not completed answers no_data_found, like a request that does not exist. Everything else is unchanged.
create or replace function public.respond_connection_request(p_from uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_from is null or p_accept is null then
    raise exception 'no pending connection request' using errcode = 'no_data_found';
  end if;
  if not public.brivia_member_completed(me) then
    raise exception 'complete your profile' using errcode = '22023';
  end if;
  perform public.brivia_lock_pair(p_from, me);
  -- A request from a sender who is no longer completed is hidden by the select policy below, so it answers like
  -- one that does not exist (the like-back path, send_signal, writes nothing to such a member either).
  if not exists (
    select 1 from public.connection_requests
    where from_id = p_from and to_id = me and status = 'pending'
      and public.brivia_request_is_live(status, created_at)
  ) or not public.brivia_member_completed(p_from) then
    raise exception 'no pending connection request' using errcode = 'no_data_found';
  end if;
  if not p_accept or public.brivia_pair_is_blocked(p_from, me) then
    update public.connection_requests set status = 'declined' where from_id = p_from and to_id = me;
    return;
  end if;
  update public.connection_requests set status = 'accepted'
   where (from_id = p_from and to_id = me) or (from_id = me and to_id = p_from and status = 'pending');
  perform public.brivia_create_match(p_from, me);
end;
$$;
revoke all on function public.respond_connection_request(uuid, boolean) from public, anon;
grant execute on function public.respond_connection_request(uuid, boolean) to authenticated;

-- =============================================================================================
-- Data: interest taxonomy (spec §3.1; India-relevant, spec §10 phase 1). Original Brivia wording.
-- 13 domains, 62 categories, 327 interests, 30 niches (432 nodes). Re-runs update labels only; a node that a
-- moderator retired stays retired. parent_id and level are derived from the id. `sensitive` (D-029) is set from
-- the list below on every run: health and mental health, religion and spirituality, LGBTQ+, sobriety.
-- =============================================================================================
insert into public.interest_node (id, parent_id, level, label, sensitive)
select v.id, nullif(regexp_replace(v.id, '\.[^.]+$', ''), v.id), array_length(string_to_array(v.id, '.'), 1), v.label,
       v.id = any (array[
         'wellbeing.health', 'wellbeing.health.nutrition', 'wellbeing.health.sleep', 'wellbeing.health.peer_support',
         'wellbeing.health.sober_social', 'wellbeing.health.healthy_ageing',
         'wellbeing.spirituality', 'wellbeing.spirituality.pilgrimages', 'wellbeing.spirituality.kirtan',
         'wellbeing.spirituality.scripture_study', 'wellbeing.spirituality.interfaith',
         'music.singing.devotional',
         'community.social.lgbtq'])
from (values
  ('sports', 'Sports and fitness'),
  ('sports.racket', 'Racket sports'),
  ('sports.racket.badminton', 'Badminton'),
  ('sports.racket.badminton.doubles', 'Doubles badminton'),
  ('sports.racket.tennis', 'Tennis'),
  ('sports.racket.table_tennis', 'Table tennis'),
  ('sports.racket.squash', 'Squash'),
  ('sports.racket.pickleball', 'Pickleball'),
  ('sports.racket.padel', 'Padel'),
  ('sports.team', 'Team sports'),
  ('sports.team.cricket', 'Cricket'),
  ('sports.team.cricket.box_cricket', 'Box cricket'),
  ('sports.team.cricket.tennis_ball_cricket', 'Tennis-ball cricket'),
  ('sports.team.football', 'Football'),
  ('sports.team.football.five_a_side', 'Five-a-side football'),
  ('sports.team.basketball', 'Basketball'),
  ('sports.team.volleyball', 'Volleyball'),
  ('sports.team.hockey', 'Field hockey'),
  ('sports.team.kabaddi', 'Kabaddi'),
  ('sports.team.kho_kho', 'Kho-kho'),
  ('sports.team.ultimate', 'Ultimate frisbee'),
  ('sports.fitness', 'Fitness training'),
  ('sports.fitness.gym', 'Gym training'),
  ('sports.fitness.calisthenics', 'Calisthenics'),
  ('sports.fitness.functional', 'Functional fitness'),
  ('sports.fitness.powerlifting', 'Powerlifting'),
  ('sports.fitness.hiit', 'Interval training'),
  ('sports.fitness.pilates', 'Pilates'),
  ('sports.endurance', 'Endurance'),
  ('sports.endurance.running', 'Running'),
  ('sports.endurance.running.marathon', 'Marathon running'),
  ('sports.endurance.running.trail_running', 'Trail running'),
  ('sports.endurance.cycling', 'Cycling'),
  ('sports.endurance.cycling.road_cycling', 'Road cycling'),
  ('sports.endurance.cycling.mountain_biking', 'Mountain biking'),
  ('sports.endurance.swimming', 'Swimming'),
  ('sports.endurance.swimming.open_water', 'Open-water swimming'),
  ('sports.endurance.triathlon', 'Triathlon'),
  ('sports.endurance.walking', 'Walking groups'),
  ('sports.combat', 'Combat and martial arts'),
  ('sports.combat.boxing', 'Boxing'),
  ('sports.combat.karate', 'Karate'),
  ('sports.combat.taekwondo', 'Taekwondo'),
  ('sports.combat.judo', 'Judo'),
  ('sports.combat.kalaripayattu', 'Kalaripayattu'),
  ('sports.combat.mma', 'Mixed martial arts'),
  ('sports.combat.wrestling', 'Wrestling'),
  ('sports.precision', 'Precision and cue sports'),
  ('sports.precision.archery', 'Archery'),
  ('sports.precision.shooting', 'Sport shooting'),
  ('sports.precision.golf', 'Golf'),
  ('sports.precision.snooker', 'Snooker and pool'),
  ('sports.fandom', 'Following sport'),
  ('sports.fandom.following_cricket', 'Following cricket'),
  ('sports.fandom.following_football', 'Following football'),
  ('sports.fandom.motorsport_fandom', 'Following motorsport'),
  ('sports.fandom.fantasy_sports', 'Fantasy leagues'),
  ('outdoors', 'Outdoors and adventure'),
  ('outdoors.trekking', 'Trekking and hiking'),
  ('outdoors.trekking.day_hikes', 'Day hikes'),
  ('outdoors.trekking.himalayan_treks', 'Himalayan treks'),
  ('outdoors.trekking.monsoon_treks', 'Monsoon treks in the Western Ghats'),
  ('outdoors.trekking.camping', 'Camping'),
  ('outdoors.climbing', 'Climbing'),
  ('outdoors.climbing.bouldering', 'Bouldering'),
  ('outdoors.climbing.bouldering.indoor_bouldering', 'Indoor bouldering gyms'),
  ('outdoors.climbing.sport_climbing', 'Sport climbing'),
  ('outdoors.climbing.mountaineering', 'Mountaineering'),
  ('outdoors.water', 'Water adventures'),
  ('outdoors.water.surfing', 'Surfing'),
  ('outdoors.water.kayaking', 'Kayaking'),
  ('outdoors.water.scuba', 'Scuba diving'),
  ('outdoors.water.rafting', 'River rafting'),
  ('outdoors.air_snow', 'Air and snow'),
  ('outdoors.air_snow.paragliding', 'Paragliding'),
  ('outdoors.air_snow.skiing', 'Skiing'),
  ('outdoors.nature', 'Nature watching'),
  ('outdoors.nature.birdwatching', 'Birdwatching'),
  ('outdoors.nature.birdwatching.urban_birding', 'Birding in the city'),
  ('outdoors.nature.wildlife_safaris', 'Wildlife safaris'),
  ('outdoors.nature.stargazing', 'Stargazing'),
  ('outdoors.nature.butterflies', 'Butterflies and insects'),
  ('outdoors.riding', 'Road trips and riding'),
  ('outdoors.riding.motorcycle_touring', 'Motorcycle touring'),
  ('outdoors.riding.road_trips', 'Road trips'),
  ('music', 'Music'),
  ('music.indian_classical', 'Indian classical music'),
  ('music.indian_classical.hindustani_vocal', 'Hindustani vocal'),
  ('music.indian_classical.carnatic_vocal', 'Carnatic vocal'),
  ('music.indian_classical.sitar', 'Sitar'),
  ('music.indian_classical.tabla', 'Tabla'),
  ('music.indian_classical.carnatic_violin', 'Carnatic violin'),
  ('music.indian_classical.veena', 'Veena'),
  ('music.indian_classical.bansuri', 'Bansuri'),
  ('music.indian_classical.mridangam', 'Mridangam'),
  ('music.instruments', 'Playing an instrument'),
  ('music.instruments.guitar', 'Guitar'),
  ('music.instruments.guitar.fingerstyle', 'Fingerstyle guitar'),
  ('music.instruments.guitar.electric_guitar', 'Electric guitar'),
  ('music.instruments.piano', 'Piano and keys'),
  ('music.instruments.drums', 'Drums'),
  ('music.instruments.violin', 'Western violin'),
  ('music.instruments.ukulele', 'Ukulele'),
  ('music.instruments.harmonium', 'Harmonium'),
  ('music.singing', 'Singing'),
  ('music.singing.karaoke', 'Karaoke'),
  ('music.singing.choir', 'Choirs'),
  ('music.singing.film_songs', 'Film songs'),
  ('music.singing.western_vocals', 'Western vocals'),
  ('music.singing.devotional', 'Devotional singing'),
  ('music.making', 'Making music'),
  ('music.making.songwriting', 'Songwriting'),
  ('music.making.production', 'Music production'),
  ('music.making.djing', 'DJing'),
  ('music.listening', 'Listening and scenes'),
  ('music.listening.indie', 'Indie music'),
  ('music.listening.hip_hop', 'Hip-hop'),
  ('music.listening.rock_metal', 'Rock and metal'),
  ('music.listening.electronic', 'Electronic music'),
  ('music.listening.jazz_blues', 'Jazz and blues'),
  ('music.listening.live_gigs', 'Live gigs'),
  ('music.listening.sufi_qawwali', 'Sufi and qawwali'),
  ('music.listening.k_pop', 'K-pop'),
  ('arts', 'Arts and crafts'),
  ('arts.visual', 'Drawing and painting'),
  ('arts.visual.sketching', 'Sketching'),
  ('arts.visual.watercolour', 'Watercolour'),
  ('arts.visual.acrylic_oil', 'Acrylic and oil painting'),
  ('arts.visual.digital_illustration', 'Digital illustration'),
  ('arts.visual.digital_illustration.character_design', 'Character design'),
  ('arts.visual.calligraphy', 'Calligraphy'),
  ('arts.visual.madhubani', 'Madhubani painting'),
  ('arts.visual.warli', 'Warli art'),
  ('arts.photography', 'Photography'),
  ('arts.photography.street_photography', 'Street photography'),
  ('arts.photography.portraits', 'Portrait photography'),
  ('arts.photography.wildlife_photography', 'Wildlife photography'),
  ('arts.photography.film_cameras', 'Film cameras'),
  ('arts.photography.phone_photography', 'Phone photography'),
  ('arts.crafts', 'Handmade crafts'),
  ('arts.crafts.pottery', 'Pottery'),
  ('arts.crafts.pottery.wheel_throwing', 'Throwing on the wheel'),
  ('arts.crafts.knitting', 'Knitting and crochet'),
  ('arts.crafts.embroidery', 'Embroidery'),
  ('arts.crafts.woodworking', 'Woodworking'),
  ('arts.crafts.jewellery', 'Jewellery making'),
  ('arts.crafts.block_printing', 'Block printing'),
  ('arts.writing', 'Writing'),
  ('arts.writing.fiction', 'Fiction writing'),
  ('arts.writing.poetry', 'Poetry'),
  ('arts.writing.poetry.urdu_shayari', 'Urdu shayari'),
  ('arts.writing.poetry.slam_poetry', 'Slam poetry'),
  ('arts.writing.journaling', 'Journaling'),
  ('arts.writing.essays', 'Essays and blogging'),
  ('arts.writing.screenwriting', 'Screenwriting'),
  ('arts.writing.comics', 'Comics and zines'),
  ('arts.design', 'Design'),
  ('arts.design.graphic_design', 'Graphic design'),
  ('arts.design.ux_design', 'Product and UX design'),
  ('arts.design.interior_design', 'Interior design'),
  ('arts.design.fashion_design', 'Fashion design'),
  ('stage_screen', 'Stage and screen'),
  ('stage_screen.dance', 'Dance'),
  ('stage_screen.dance.bharatanatyam', 'Bharatanatyam'),
  ('stage_screen.dance.kathak', 'Kathak'),
  ('stage_screen.dance.odissi', 'Odissi'),
  ('stage_screen.dance.salsa', 'Salsa'),
  ('stage_screen.dance.salsa.bachata', 'Bachata'),
  ('stage_screen.dance.hip_hop_dance', 'Hip-hop dance'),
  ('stage_screen.dance.contemporary', 'Contemporary dance'),
  ('stage_screen.dance.bollywood_dance', 'Bollywood dance'),
  ('stage_screen.dance.garba', 'Garba and dandiya'),
  ('stage_screen.theatre', 'Theatre and comedy'),
  ('stage_screen.theatre.acting', 'Acting'),
  ('stage_screen.theatre.improv', 'Improv'),
  ('stage_screen.theatre.stand_up', 'Stand-up comedy'),
  ('stage_screen.theatre.street_theatre', 'Street theatre'),
  ('stage_screen.theatre.open_mics', 'Open mics'),
  ('stage_screen.theatre.storytelling', 'Spoken storytelling'),
  ('stage_screen.film', 'Film and video'),
  ('stage_screen.film.filmmaking', 'Filmmaking'),
  ('stage_screen.film.film_clubs', 'Film clubs'),
  ('stage_screen.film.world_cinema', 'World cinema'),
  ('stage_screen.film.documentaries', 'Documentaries'),
  ('stage_screen.film.video_editing', 'Video editing'),
  ('stage_screen.film.animation', 'Animation'),
  ('stage_screen.online', 'Creating online'),
  ('stage_screen.online.video_channels', 'Video channels'),
  ('stage_screen.online.podcasting', 'Podcasting'),
  ('stage_screen.online.live_streaming', 'Live streaming'),
  ('stage_screen.online.short_video', 'Short-form video'),
  ('food', 'Food and drink'),
  ('food.cooking', 'Cooking'),
  ('food.cooking.home_cooking', 'Everyday home cooking'),
  ('food.cooking.regional_indian', 'Regional Indian cooking'),
  ('food.cooking.baking', 'Baking'),
  ('food.cooking.baking.sourdough', 'Sourdough'),
  ('food.cooking.plant_based', 'Plant-based cooking'),
  ('food.cooking.meal_prep', 'Meal prep'),
  ('food.cooking.barbecue', 'Barbecue and tandoor'),
  ('food.cooking.mithai', 'Mithai making'),
  ('food.drinks', 'Drinks'),
  ('food.drinks.coffee', 'Speciality coffee'),
  ('food.drinks.coffee.home_espresso', 'Home espresso'),
  ('food.drinks.coffee.pour_over', 'Pour-over brewing'),
  ('food.drinks.tea', 'Tea tasting'),
  ('food.drinks.craft_beer', 'Craft beer'),
  ('food.drinks.wine', 'Wine'),
  ('food.drinks.mixology', 'Cocktails and mocktails'),
  ('food.drinks.fermenting', 'Fermented drinks'),
  ('food.eating_out', 'Eating out'),
  ('food.eating_out.street_food', 'Street food walks'),
  ('food.eating_out.cafe_hopping', 'Cafe hopping'),
  ('food.eating_out.fine_dining', 'Fine dining'),
  ('food.growing', 'Growing food'),
  ('food.growing.terrace_gardening', 'Terrace gardening'),
  ('food.growing.hydroponics', 'Hydroponics'),
  ('food.growing.composting', 'Composting'),
  ('food.growing.foraging', 'Foraging'),
  ('tech', 'Technology'),
  ('tech.software', 'Software'),
  ('tech.software.web_development', 'Web development'),
  ('tech.software.web_development.frontend', 'Front-end development'),
  ('tech.software.mobile_apps', 'Mobile apps'),
  ('tech.software.backend', 'Backend systems'),
  ('tech.software.devops', 'DevOps and cloud'),
  ('tech.software.open_source', 'Open source'),
  ('tech.software.game_dev', 'Game development'),
  ('tech.software.competitive_programming', 'Competitive programming'),
  ('tech.ai_data', 'AI and data'),
  ('tech.ai_data.machine_learning', 'Machine learning'),
  ('tech.ai_data.machine_learning.ml_deployment', 'Shipping ML models'),
  ('tech.ai_data.generative_ai', 'Generative AI'),
  ('tech.ai_data.data_analysis', 'Data analysis'),
  ('tech.ai_data.data_engineering', 'Data engineering'),
  ('tech.ai_data.computer_vision', 'Computer vision'),
  ('tech.ai_data.nlp', 'Natural-language processing'),
  ('tech.hardware', 'Hardware and making'),
  ('tech.hardware.electronics', 'Electronics tinkering'),
  ('tech.hardware.microcontrollers', 'Microcontrollers and single-board computers'),
  ('tech.hardware.printing_3d', '3D printing'),
  ('tech.hardware.robotics', 'Robotics'),
  ('tech.hardware.drones', 'Drones'),
  ('tech.security', 'Security and privacy'),
  ('tech.security.ethical_hacking', 'Ethical hacking'),
  ('tech.security.ctf', 'Capture-the-flag contests'),
  ('tech.security.privacy_tools', 'Privacy tools'),
  ('tech.frontier', 'Frontier tech'),
  ('tech.frontier.blockchain', 'Blockchain'),
  ('tech.frontier.ar_vr', 'AR and VR'),
  ('tech.frontier.quantum', 'Quantum computing'),
  ('tech.frontier.space_tech', 'Space tech'),
  ('business', 'Work and enterprise'),
  ('business.startups', 'Startups'),
  ('business.startups.founding', 'Founding a company'),
  ('business.startups.fundraising', 'Fundraising'),
  ('business.startups.product_management', 'Product management'),
  ('business.startups.growth', 'Growth marketing'),
  ('business.startups.side_projects', 'Side projects'),
  ('business.startups.bootstrapping', 'Bootstrapping'),
  ('business.careers', 'Careers'),
  ('business.careers.public_speaking', 'Public speaking'),
  ('business.careers.mentoring', 'Mentoring'),
  ('business.careers.career_change', 'Changing careers'),
  ('business.careers.freelancing', 'Freelancing'),
  ('business.careers.leadership', 'Leading teams'),
  ('business.money', 'Money'),
  ('business.money.personal_finance', 'Personal finance'),
  ('business.money.stock_investing', 'Stock investing'),
  ('business.money.index_funds', 'Index and mutual funds'),
  ('business.money.real_estate', 'Real estate'),
  ('business.money.early_retirement', 'Planning early retirement'),
  ('business.marketing', 'Marketing and sales'),
  ('business.marketing.branding', 'Branding'),
  ('business.marketing.copywriting', 'Copywriting'),
  ('business.marketing.seo', 'Search optimisation'),
  ('business.marketing.selling', 'Selling'),
  ('business.marketing.social_marketing', 'Social media marketing'),
  ('learning', 'Ideas and learning'),
  ('learning.languages', 'Languages'),
  ('learning.languages.english', 'English conversation'),
  ('learning.languages.hindi', 'Hindi'),
  ('learning.languages.kannada', 'Kannada'),
  ('learning.languages.tamil', 'Tamil'),
  ('learning.languages.marathi', 'Marathi'),
  ('learning.languages.bengali', 'Bengali'),
  ('learning.languages.french', 'French'),
  ('learning.languages.japanese', 'Japanese'),
  ('learning.languages.sanskrit', 'Sanskrit'),
  ('learning.languages.sign_language', 'Indian Sign Language'),
  ('learning.science', 'Science'),
  ('learning.science.astronomy', 'Astronomy'),
  ('learning.science.physics', 'Physics'),
  ('learning.science.biology', 'Biology'),
  ('learning.science.neuroscience', 'Neuroscience'),
  ('learning.science.climate_science', 'Climate science'),
  ('learning.science.maths', 'Recreational maths'),
  ('learning.humanities', 'Humanities'),
  ('learning.humanities.history', 'History'),
  ('learning.humanities.history.indian_history', 'Indian history'),
  ('learning.humanities.philosophy', 'Philosophy'),
  ('learning.humanities.psychology', 'Psychology'),
  ('learning.humanities.economics', 'Economics'),
  ('learning.humanities.mythology', 'Mythology and epics'),
  ('learning.humanities.policy', 'Public policy'),
  ('learning.reading', 'Reading'),
  ('learning.reading.book_clubs', 'Book clubs'),
  ('learning.reading.fantasy_scifi', 'Fantasy and sci-fi'),
  ('learning.reading.literary_fiction', 'Literary fiction'),
  ('learning.reading.non_fiction', 'Non-fiction'),
  ('learning.reading.indian_languages', 'Indian-language literature'),
  ('learning.reading.graphic_novels', 'Manga and graphic novels'),
  ('learning.reading.poetry_reading', 'Reading poetry'),
  ('learning.study', 'Study and exams'),
  ('learning.study.exam_prep', 'Competitive exam prep'),
  ('learning.study.study_groups', 'Study groups'),
  ('learning.study.study_abroad', 'Studying abroad'),
  ('learning.study.quizzing', 'Quizzing'),
  ('learning.discussion', 'Debate and discussion'),
  ('learning.discussion.debating', 'Debating'),
  ('learning.discussion.model_un', 'Model United Nations'),
  ('learning.discussion.discussion_circles', 'Discussion circles'),
  ('wellbeing', 'Mind and wellbeing'),
  ('wellbeing.yoga', 'Yoga'),
  ('wellbeing.yoga.hatha', 'Hatha yoga'),
  ('wellbeing.yoga.flow_yoga', 'Flow yoga'),
  ('wellbeing.yoga.ashtanga', 'Ashtanga yoga'),
  ('wellbeing.yoga.restorative', 'Restorative yoga'),
  ('wellbeing.yoga.breathwork', 'Breathwork'),
  ('wellbeing.meditation', 'Meditation and mindfulness'),
  ('wellbeing.meditation.silent_retreats', 'Silent retreats'),
  ('wellbeing.meditation.mindfulness', 'Mindfulness'),
  ('wellbeing.meditation.sound_baths', 'Sound baths'),
  ('wellbeing.meditation.guided_meditation', 'Guided meditation'),
  ('wellbeing.health', 'Health habits'),
  ('wellbeing.health.nutrition', 'Nutrition'),
  ('wellbeing.health.sleep', 'Better sleep'),
  ('wellbeing.health.peer_support', 'Mental-health peer support'),
  ('wellbeing.health.sober_social', 'Sober socialising'),
  ('wellbeing.health.healthy_ageing', 'Healthy ageing'),
  ('wellbeing.spirituality', 'Spirituality'),
  ('wellbeing.spirituality.pilgrimages', 'Pilgrimages'),
  ('wellbeing.spirituality.kirtan', 'Kirtan and chanting'),
  ('wellbeing.spirituality.scripture_study', 'Scripture study'),
  ('wellbeing.spirituality.interfaith', 'Interfaith dialogue'),
  ('games', 'Games and play'),
  ('games.board', 'Board and card games'),
  ('games.board.chess', 'Chess'),
  ('games.board.chess.blitz', 'Blitz and bullet chess'),
  ('games.board.chess.chess_problems', 'Chess problems'),
  ('games.board.carrom', 'Carrom'),
  ('games.board.modern_board_games', 'Modern board games'),
  ('games.board.poker', 'Poker'),
  ('games.board.bridge', 'Contract bridge'),
  ('games.board.rummy', 'Rummy'),
  ('games.board.word_games', 'Word games'),
  ('games.board.speedcubing', 'Speedcubing'),
  ('games.video', 'Video games'),
  ('games.video.pc', 'PC gaming'),
  ('games.video.console', 'Console gaming'),
  ('games.video.mobile', 'Mobile gaming'),
  ('games.video.esports', 'Esports'),
  ('games.video.retro', 'Retro gaming'),
  ('games.video.speedrunning', 'Speedrunning'),
  ('games.tabletop', 'Tabletop and puzzles'),
  ('games.tabletop.rpg', 'Tabletop role-playing'),
  ('games.tabletop.rpg.game_mastering', 'Running tabletop games'),
  ('games.tabletop.escape_rooms', 'Escape rooms'),
  ('games.tabletop.jigsaws', 'Jigsaw puzzles'),
  ('games.tabletop.crosswords', 'Crosswords and cryptics'),
  ('games.tabletop.trivia_nights', 'Pub trivia'),
  ('games.tabletop.murder_mystery', 'Murder-mystery evenings'),
  ('games.collecting', 'Collecting'),
  ('games.collecting.coins', 'Coin collecting'),
  ('games.collecting.stamps', 'Stamp collecting'),
  ('games.collecting.sneakers', 'Sneakers'),
  ('games.collecting.trading_cards', 'Trading cards'),
  ('games.collecting.building_bricks', 'Building bricks'),
  ('community', 'Community and causes'),
  ('community.volunteering', 'Volunteering'),
  ('community.volunteering.teaching_children', 'Teaching children'),
  ('community.volunteering.animal_rescue', 'Animal rescue'),
  ('community.volunteering.food_banks', 'Food banks'),
  ('community.volunteering.blood_donation', 'Blood donation drives'),
  ('community.volunteering.disaster_relief', 'Disaster relief'),
  ('community.environment', 'Environment'),
  ('community.environment.beach_cleanups', 'Beach clean-ups'),
  ('community.environment.tree_planting', 'Tree planting'),
  ('community.environment.low_waste', 'Low-waste living'),
  ('community.environment.cycle_friendly', 'Cycle-friendly cities'),
  ('community.environment.lake_restoration', 'Lake restoration'),
  ('community.environment.climate_action', 'Climate action'),
  ('community.civic', 'Civic life'),
  ('community.civic.civic_tech', 'Civic tech'),
  ('community.civic.urban_planning', 'Urban planning'),
  ('community.civic.neighbourhood_forums', 'Neighbourhood forums'),
  ('community.civic.heritage_conservation', 'Heritage conservation'),
  ('community.social', 'Meeting people'),
  ('community.social.new_in_town', 'New in town'),
  ('community.social.expat_circles', 'Expat circles'),
  ('community.social.parenting', 'Parenting groups'),
  ('community.social.pet_parents', 'Pet parents'),
  ('community.social.pet_parents.dog_walks', 'Dog-walking groups'),
  ('community.social.womens_circles', 'Women''s circles'),
  ('community.social.lgbtq', 'LGBTQ+ community'),
  ('lifestyle', 'Home, style and travel'),
  ('lifestyle.travel', 'Travel'),
  ('lifestyle.travel.solo_travel', 'Solo travel'),
  ('lifestyle.travel.solo_travel.women_solo', 'Women travelling solo'),
  ('lifestyle.travel.heritage_sites', 'Heritage sites'),
  ('lifestyle.travel.culinary_travel', 'Culinary travel'),
  ('lifestyle.travel.slow_travel', 'Slow travel'),
  ('lifestyle.travel.weekend_getaways', 'Weekend getaways'),
  ('lifestyle.travel.international', 'International travel'),
  ('lifestyle.home', 'Home and garden'),
  ('lifestyle.home.indoor_plants', 'Indoor plants'),
  ('lifestyle.home.indoor_plants.bonsai', 'Bonsai'),
  ('lifestyle.home.home_decor', 'Home decor'),
  ('lifestyle.home.home_repairs', 'Home repairs'),
  ('lifestyle.home.minimalism', 'Minimalism'),
  ('lifestyle.home.aquariums', 'Aquarium keeping'),
  ('lifestyle.style', 'Style'),
  ('lifestyle.style.fashion', 'Fashion'),
  ('lifestyle.style.thrifting', 'Thrifting'),
  ('lifestyle.style.handloom', 'Handloom and textiles'),
  ('lifestyle.style.skincare', 'Skincare'),
  ('lifestyle.style.tattoos', 'Tattoo art'),
  ('lifestyle.vehicles', 'Cars and bikes'),
  ('lifestyle.vehicles.cars', 'Cars'),
  ('lifestyle.vehicles.motorcycles', 'Motorcycles'),
  ('lifestyle.vehicles.electric_vehicles', 'Electric vehicles'),
  ('lifestyle.vehicles.vintage_vehicles', 'Vintage vehicles')
) as v(id, label)
on conflict (id) do update set label = excluded.label, sensitive = excluded.sensitive;
