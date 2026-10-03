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
