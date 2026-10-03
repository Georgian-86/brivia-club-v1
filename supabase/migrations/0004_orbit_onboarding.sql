-- 0004_orbit_onboarding.sql: the Iteration 3 (ORBIT onboarding) migration.
-- Apply after 0001, 0002 and 0003, in the Supabase SQL editor. Idempotent: safe to re-run (the local harness
-- applies every migration twice).
-- Sections:
--   1. Grid and places: the coarse equal-area grid (D-028, spec §4.1 / §9.1.4) and the place list.
--   2. Taxonomy and member interests: interest_node, member_interest, the 20-point Passion Budget (§3.1 / §3.2).
--   3. Member orbit: member_orbit, location_change, set_home_location and set_home_city (§9.1.4).
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
  m := regexp_match(coalesce(p_cell, ''), '^g([5-7]):([0-9]{1,6}):([0-9]{1,6})$');
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
  select uid, e ->> 'interest_id', (e ->> 'points')::smallint, coalesce(e ->> 'mode', 'play')
    from jsonb_array_elements(p_items) e;

  update public.profiles
     set skills = (select array_agg(n.label order by mi.points desc, n.label asc)
                     from public.member_interest mi join public.interest_node n on n.id = mi.interest_id
                    where mi.member_id = uid),
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
-- Data: interest taxonomy (spec §3.1; India-relevant, spec §10 phase 1). Original Brivia wording.
-- 13 domains, 62 categories, 327 interests, 30 niches (432 nodes). Re-runs update labels only; a node that a
-- moderator retired stays retired. parent_id and level are derived from the id.
-- =============================================================================================
insert into public.interest_node (id, parent_id, level, label)
select v.id, nullif(regexp_replace(v.id, '\.[^.]+$', ''), v.id), array_length(string_to_array(v.id, '.'), 1), v.label
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
on conflict (id) do update set label = excluded.label;
