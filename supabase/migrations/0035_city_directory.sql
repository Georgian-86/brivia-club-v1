set lock_timeout = '5s';
-- 0035_city_directory.sql: a worldwide city directory for every "Pick my city" (founder request 2026-11-03, D-140).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0034 (README "## 0035"). 0001-0034 are frozen.
-- Idempotent: the local harness applies every migration twice.
--
-- What changes:
--   1. geo_city: one row per city, town or locality in the world (about 156,000, every country), loaded from the open
--      countries-states-cities database (ODbL; credit on the privacy page), published with the site as
--      site/public/data/cities/part-NN.json and imported with pg_net (README "## 0035"). Each
--      row has the city, its state or region and country (to tell same-named cities apart), the native-script name, the
--      population and a centroid. Like place (0004), its coordinates are never granted to clients: members only ever
--      see names. geo_alias holds other spellings (Bangalore, Bombay, Gurgaon...).
--   2. search_cities(q, limit): typed text to the best matches. "Ludhiana", "ludh", "Lüdhiana", "Ludhiana, India",
--      "Springfield, Illinois", "Bangalore", a native-script name, or a country name (its largest cities). Ranked by
--      prefix match, then similarity, then population. Never returns a coordinate.
--   3. ensure_place(id): a picked directory city becomes a place row (id 'geo-<n>') the first time a member chooses it,
--      so set_home_city, member_orbit.place_id, ORBIT's pool, card labels, Nearby, events and filters all keep using the
--      one place table exactly as before (ORBIT spec §9.1.4: "only place holds coordinates"). A directory city that is
--      already a place (Bengaluru is in-bengaluru) answers with that id, so the same city is never two places.
-- Postal codes are looked up by the directory Edge Function (OpenStreetMap Photon) and mapped to the nearest
-- directory city; nothing here stores a member's position.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
grant usage on schema extensions to anon, authenticated;   -- as on Supabase: the folding and trigram search run as the member

-- 1. ------------------------------------------------------------------------------------------------------------------
create table if not exists public.geo_city (
  id int primary key,
  name text not null,
  native text,
  region text,
  region_code text,
  country_code text not null,
  country text not null,
  population int,
  kind text,
  search text not null default '',
  country_search text not null default '',
  region_search text not null default '',
  place_id text references public.place(id) on delete set null
);
alter table public.geo_city enable row level security;
revoke all on public.geo_city from public, anon, authenticated;
-- Names only (the centroids are in brivia_private.geo_city_point, never granted).
grant select on public.geo_city to anon, authenticated;
drop policy if exists geo_city_select on public.geo_city;
create policy geo_city_select on public.geo_city for select to anon, authenticated using (true);
create index if not exists geo_city_search_trgm on public.geo_city using gin (search extensions.gin_trgm_ops);
create index if not exists geo_city_country_idx on public.geo_city (country_search, population desc nulls last);

-- The centroids live outside the public schema (only place may hold coordinates there; orbit-location.test).
create table if not exists brivia_private.geo_city_point (
  city_id int primary key references public.geo_city(id) on delete cascade,
  lat double precision not null,
  lng double precision not null
);
revoke all on brivia_private.geo_city_point from public, anon, authenticated;

create table if not exists public.geo_alias (
  alias text not null,
  city_id int not null references public.geo_city(id) on delete cascade,
  primary key (alias, city_id)
);
alter table public.geo_alias enable row level security;
revoke all on public.geo_alias from public, anon, authenticated;
grant select on public.geo_alias to anon, authenticated;
drop policy if exists geo_alias_select on public.geo_alias;
create policy geo_alias_select on public.geo_alias for select to anon, authenticated using (true);

create or replace function public.brivia_fold(p text)
returns text
language sql
stable
set search_path = public, extensions
as $$ select btrim(regexp_replace(lower(extensions.unaccent(coalesce(p, ''))), '[^[:alnum:]]+', ' ', 'g')) $$;
revoke all on function public.brivia_fold(text) from public;
grant execute on function public.brivia_fold(text) to anon, authenticated;   -- not a definer function: folds text only

create or replace function public.brivia_geo_city_fold()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  new.search := btrim(public.brivia_fold(new.name) || ' ' || public.brivia_fold(new.native));
  new.country_search := public.brivia_fold(new.country);
  new.region_search := public.brivia_fold(new.region);
  return new;
end;
$$;
revoke all on function public.brivia_geo_city_fold() from public, anon, authenticated;
drop trigger if exists geo_city_fold on public.geo_city;
create trigger geo_city_fold before insert or update of name, native, country, region on public.geo_city
  for each row execute function public.brivia_geo_city_fold();

-- 2. ------------------------------------------------------------------------------------------------------------------
create or replace function public.search_cities(p_q text, p_limit int default 8)
returns table(id text, name text, region text, country text, country_code text)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_in text := left(coalesce(p_q, ''), 80);
  v_city text := public.brivia_fold(split_part(v_in, ',', 1));
  v_rest text := nullif(public.brivia_fold(substr(v_in, length(split_part(v_in, ',', 1)) + 2)), '');
  v_limit int := least(greatest(coalesce(p_limit, 8), 1), 20);
begin
  if length(v_city) < 2 then return; end if;
  return query
  with hits as (
    select c.id as cid, c.name as cname, c.region as cregion, c.country as ccountry, c.country_code as ccode,
           c.population as cpop, c.search as csearch, c.country_search as ccs, c.region_search as crs, c.place_id as cplace,
           3 as tier
      from public.geo_city c where c.search like v_city || '%' or c.search like '% ' || v_city || '%'
    union all
    select c.id, c.name, c.region, c.country, c.country_code, c.population, c.search, c.country_search, c.region_search, c.place_id, 2
      from public.geo_alias a join public.geo_city c on c.id = a.city_id where a.alias like v_city || '%'
    union all
    select c.id, c.name, c.region, c.country, c.country_code, c.population, c.search, c.country_search, c.region_search, c.place_id, 1
      from public.geo_city c where length(v_city) >= 4 and c.search % v_city
    union all
    -- A country typed alone: its largest cities.
    select c.id, c.name, c.region, c.country, c.country_code, c.population, c.search, c.country_search, c.region_search, c.place_id, 0
      from public.geo_city c where v_rest is null and c.country_search = v_city and c.population is not null
  ), best as (
    select distinct on (h.cid) h.*
      from hits h
     where v_rest is null or h.ccs like v_rest || '%' or h.crs like v_rest || '%' or lower(h.ccode) = v_rest
     order by h.cid, h.tier desc
  )
  select coalesce(b.cplace, 'geo-' || b.cid), b.cname, b.cregion, b.ccountry, b.ccode
    from best b
   order by b.tier desc,
            case when b.tier > 0 then (b.csearch like v_city || '%') end desc,
            case when b.tier > 0 then extensions.similarity(b.csearch, v_city) end desc,
            b.cpop desc nulls last, b.cid
   limit v_limit;
end;
$$;
revoke all on function public.search_cities(text, int) from public;
grant execute on function public.search_cities(text, int) to anon, authenticated;

-- 3. ------------------------------------------------------------------------------------------------------------------
create or replace function public.ensure_place(p_id text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_n int;
  c public.geo_city%rowtype;
  pt brivia_private.geo_city_point%rowtype;
begin
  if auth.uid() is null then raise exception 'profile required' using errcode = 'P0002'; end if;
  if exists (select 1 from public.place where id = p_id) then return p_id; end if;
  if p_id !~ '^geo-[0-9]{1,9}$' then raise exception 'invalid place' using errcode = '22023'; end if;
  v_n := substr(p_id, 5)::int;
  select * into c from public.geo_city where id = v_n;
  if not found then raise exception 'invalid place' using errcode = '22023'; end if;
  if c.place_id is not null then return c.place_id; end if;
  select * into pt from brivia_private.geo_city_point where city_id = v_n;
  if not found then raise exception 'invalid place' using errcode = '22023'; end if;
  insert into public.place (id, name, region, country, lat, lng, is_launch)
  values (p_id, c.name, coalesce(c.region, c.country), c.country, pt.lat, pt.lng, false)
  on conflict (id) do nothing;
  update public.geo_city set place_id = p_id where id = v_n and place_id is null;
  return p_id;
end;
$$;
revoke all on function public.ensure_place(text) from public, anon;
grant execute on function public.ensure_place(text) to authenticated;

-- After an import: link directory cities to the places that already exist (same country, same name, within 40 km), so a
-- search answers in-bengaluru and never makes a second Bengaluru. Internal; the import calls it.
create or replace function public.brivia_link_places()
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare n int;
begin
  update public.geo_city c set place_id = p.id
    from public.place p, brivia_private.geo_city_point pt
   where c.place_id is null and pt.city_id = c.id
     and public.brivia_fold(p.name) = public.brivia_fold(c.name)
     and public.brivia_fold(p.country) = c.country_search
     and public.brivia_haversine_km(p.lat, p.lng, pt.lat, pt.lng) <= 40;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.brivia_link_places() from public, anon, authenticated;

-- The import (service role or the SQL editor only): one published part of the directory, site/public/data/cities/
-- part-NN.json, as a JSON array of rows [id, name, native, region, region_code, country_code, country, lat, lng,
-- population, kind] (objects with those keys work too), upserted with their centroids. Returns the rows written.
-- README "## 0035" has the three statements that fetch the parts with pg_net and import them.
create or replace function public.brivia_import_cities(p_rows jsonb)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare n int;
begin
  create temporary table if not exists pg_temp.brivia_city_in (id int, name text, native text, region text, region_code text,
    country_code text, country text, lat float8, lng float8, population int, kind text) on commit drop;
  truncate pg_temp.brivia_city_in;
  insert into pg_temp.brivia_city_in
  select case when jsonb_typeof(r) = 'array' then (r->>0)::int else (r->>'id')::int end,
         left(case when jsonb_typeof(r) = 'array' then r->>1 else r->>'name' end, 120),
         nullif(left(case when jsonb_typeof(r) = 'array' then r->>2 else r->>'native' end, 120), ''),
         nullif(left(case when jsonb_typeof(r) = 'array' then r->>3 else r->>'region' end, 120), ''),
         nullif(left(case when jsonb_typeof(r) = 'array' then r->>4 else r->>'region_code' end, 12), ''),
         upper(left(case when jsonb_typeof(r) = 'array' then r->>5 else r->>'country_code' end, 2)),
         left(case when jsonb_typeof(r) = 'array' then r->>6 else r->>'country' end, 80),
         (case when jsonb_typeof(r) = 'array' then r->>7 else r->>'lat' end)::float8,
         (case when jsonb_typeof(r) = 'array' then r->>8 else r->>'lng' end)::float8,
         nullif(case when jsonb_typeof(r) = 'array' then r->>9 else r->>'population' end, '')::int,
         nullif(left(case when jsonb_typeof(r) = 'array' then r->>10 else r->>'kind' end, 20), '')
    from jsonb_array_elements(p_rows) r;
  delete from pg_temp.brivia_city_in
   where coalesce(name, '') = '' or coalesce(country_code, '') = '' or coalesce(country, '') = ''
      or lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180;
  insert into public.geo_city (id, name, native, region, region_code, country_code, country, population, kind)
  select id, name, native, region, region_code, country_code, country, population, kind from pg_temp.brivia_city_in
  on conflict (id) do update set name = excluded.name, native = excluded.native, region = excluded.region,
    region_code = excluded.region_code, country_code = excluded.country_code, country = excluded.country,
    population = excluded.population, kind = excluded.kind;
  get diagnostics n = row_count;
  insert into brivia_private.geo_city_point (city_id, lat, lng)
  select id, lat, lng from pg_temp.brivia_city_in
  on conflict (city_id) do update set lat = excluded.lat, lng = excluded.lng;
  truncate pg_temp.brivia_city_in;
  return n;
end;
$$;
revoke all on function public.brivia_import_cities(jsonb) from public, anon, authenticated;

-- After the last batch: link to existing places and add the other spellings.
create or replace function public.brivia_finish_city_import()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  return jsonb_build_object('linked', public.brivia_link_places(), 'aliases', public.brivia_seed_city_aliases(),
                            'cities', (select count(*) from public.geo_city));
end;
$$;
revoke all on function public.brivia_finish_city_import() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.brivia_import_cities(jsonb) to service_role';
    execute 'grant execute on function public.brivia_finish_city_import() to service_role';
  end if;
end $$;

-- Other spellings people type (added once the cities are loaded; safe to run again).
create or replace function public.brivia_seed_city_aliases()
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare n int;
begin
  insert into public.geo_alias (alias, city_id)
  select public.brivia_fold(a.alias), c.id
    from (values
      ('Bangalore', 'Bengaluru', 'IN'), ('Bombay', 'Mumbai', 'IN'), ('Calcutta', 'Kolkata', 'IN'),
      ('Madras', 'Chennai', 'IN'), ('Gurgaon', 'Gurugram', 'IN'), ('Poona', 'Pune', 'IN'),
      ('Mysore', 'Mysuru', 'IN'), ('Mangalore', 'Mangaluru', 'IN'), ('Trivandrum', 'Thiruvananthapuram', 'IN'),
      ('Cochin', 'Kochi', 'IN'), ('Baroda', 'Vadodara', 'IN'), ('Benares', 'Varanasi', 'IN'), ('Banaras', 'Varanasi', 'IN'),
      ('Pondicherry', 'Puducherry', 'IN'), ('Calicut', 'Kozhikode', 'IN'), ('Vizag', 'Visakhapatnam', 'IN'),
      ('Allahabad', 'Prayagraj', 'IN'), ('New Delhi', 'Delhi', 'IN'), ('Hubli', 'Hubballi', 'IN'),
      ('NYC', 'New York City', 'US'), ('New York', 'New York City', 'US'), ('SF', 'San Francisco', 'US'),
      ('LA', 'Los Angeles', 'US'), ('Peking', 'Beijing', 'CN'), ('Saigon', 'Ho Chi Minh City', 'VN'),
      ('Bombay', 'Mumbai', 'IN'), ('Kiev', 'Kyiv', 'UA'), ('Munchen', 'Munich', 'DE'), ('Muenchen', 'Munich', 'DE')
    ) as a(alias, city, cc)
    join lateral (select g.id from public.geo_city g where g.country_code = a.cc and public.brivia_fold(g.name) = public.brivia_fold(a.city)
                   order by g.population desc nulls last limit 1) c on true
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.brivia_seed_city_aliases() from public, anon, authenticated;

-- Postal codes (directory Edge Function, service role only): the postcode's public centroid from OpenStreetMap to the
-- nearest directory cities in that country (towns of 1,000+ first, within 40 km). Stores and returns no coordinate.
create or replace function public.brivia_nearest_cities(p_lat double precision, p_lng double precision, p_cc text, p_limit int default 3)
returns table(id text, name text, region text, country text, country_code text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(c.place_id, 'geo-' || c.id), c.name, c.region, c.country, c.country_code
    from public.geo_city c join brivia_private.geo_city_point pt on pt.city_id = c.id
   where c.country_code = upper(p_cc)
     and pt.lat between p_lat - 0.4 and p_lat + 0.4 and pt.lng between p_lng - 0.5 and p_lng + 0.5
     and public.brivia_haversine_km(p_lat, p_lng, pt.lat, pt.lng) <= 40
   order by (coalesce(c.population, 0) >= 1000) desc, public.brivia_haversine_km(p_lat, p_lng, pt.lat, pt.lng), c.id
   limit least(greatest(coalesce(p_limit, 3), 1), 5)
$$;
revoke all on function public.brivia_nearest_cities(double precision, double precision, text, int) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.brivia_nearest_cities(double precision, double precision, text, int) to service_role';
  end if;
end $$;
create index if not exists geo_city_point_lat_idx on brivia_private.geo_city_point (lat, lng);
