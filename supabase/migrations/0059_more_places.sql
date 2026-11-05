set lock_timeout = '5s';
-- 0059_more_places.sql (D-202, founder 2026-11-05: "there is no option of south goa, pls try to include all the cities,
-- specially for india"). Apply after 0058 (README "## 0059"), then deploy the directory Edge Function and the client.
-- 0001-0058 are frozen. Idempotent.
--
-- The worldwide directory (0035, about 156,000 cities, towns and localities) has every town in Goa, but its districts
-- are patchy: North Goa is there, South Goa is not; many Indian districts are missing. Two changes:
--   1. A place the directory does not have is looked up in OpenStreetMap (Photon, by the directory Edge Function, kind
--      'places') and added to it with brivia_add_osm_places: one geo_city row per OpenStreetMap object (remembered in
--      brivia_private.geo_osm, so it is added once), unless the directory already has the same name in the same
--      country within 25 km (then that row answers). Ids continue from 90,000,000; the centroid goes to
--      brivia_private.geo_city_point as for every directory city, never to clients. Service role only.
--   2. search_cities: a state or region typed alone ("Goa", "Kerala", or "Goa, India") also lists that region's
--      largest places, after any place whose name starts with the text.

create sequence if not exists brivia_private.geo_city_extra_seq start with 90000000;
create table if not exists brivia_private.geo_osm (
  osm_ref text primary key,              -- 'R123', 'N456', 'W789'
  city_id int not null references public.geo_city(id) on delete cascade
);
revoke all on brivia_private.geo_osm from public, anon, authenticated;

-- p_rows: [{ osm_ref, name, region, country, country_code, lat, lng, kind }]. Returns the rows as search_cities does.
create or replace function public.brivia_add_osm_places(p_rows jsonb)
returns table(id text, name text, region text, country text, country_code text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_ref text; v_name text; v_region text; v_country text; v_cc text; v_lat float8; v_lng float8; v_kind text;
  v_id int;
  v_ids int[] := '{}';
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) limit 12 loop
    v_ref := left(r ->> 'osm_ref', 24);
    v_name := nullif(btrim(left(r ->> 'name', 120)), '');
    v_region := nullif(btrim(left(r ->> 'region', 120)), '');
    v_country := nullif(btrim(left(r ->> 'country', 80)), '');
    v_cc := upper(left(r ->> 'country_code', 2));
    v_kind := nullif(left(r ->> 'kind', 20), '');
    begin v_lat := (r ->> 'lat')::float8; v_lng := (r ->> 'lng')::float8; exception when others then continue; end;
    if v_ref !~ '^[NWR][0-9]{1,15}$' or v_name is null or v_country is null or v_cc !~ '^[A-Z]{2}$'
       or v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      continue;
    end if;
    v_id := (select o.city_id from brivia_private.geo_osm o where o.osm_ref = v_ref);
    if v_id is null then
      -- The same place already in the directory (same name, same country, within 25 km)?
      select c.id into v_id
        from public.geo_city c join brivia_private.geo_city_point pt on pt.city_id = c.id
       where c.country_code = v_cc and c.search = public.brivia_fold(v_name)
         and public.brivia_haversine_km(pt.lat, pt.lng, v_lat, v_lng) <= 25
       order by public.brivia_haversine_km(pt.lat, pt.lng, v_lat, v_lng)
       limit 1;
      if v_id is null then
        v_id := nextval('brivia_private.geo_city_extra_seq');
        insert into public.geo_city (id, name, region, country_code, country, kind)
        values (v_id, v_name, v_region, v_cc, v_country, coalesce(v_kind, 'osm'));
        insert into brivia_private.geo_city_point (city_id, lat, lng) values (v_id, v_lat, v_lng);
      end if;
      insert into brivia_private.geo_osm (osm_ref, city_id) values (v_ref, v_id) on conflict (osm_ref) do nothing;
    end if;
    if not v_id = any(v_ids) then v_ids := v_ids || v_id; end if;
  end loop;
  return query
  select coalesce(c.place_id, 'geo-' || c.id), c.name, c.region, c.country, c.country_code
    from unnest(v_ids) with ordinality u(cid, ord) join public.geo_city c on c.id = u.cid
   order by u.ord;
end;
$$;
revoke all on function public.brivia_add_osm_places(jsonb) from public, anon, authenticated;

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
    -- A country typed alone: its largest cities, first.
    select c.id as cid, c.name as cname, c.region as cregion, c.country as ccountry, c.country_code as ccode,
           c.population as cpop, c.search as csearch, c.country_search as ccs, c.region_search as crs, c.place_id as cplace,
           4 as tier, false as in_region
      from public.geo_city c where v_rest is null and c.country_search = v_city and c.population is not null
    union all
    select c.id, c.name, c.region, c.country, c.country_code, c.population, c.search, c.country_search, c.region_search, c.place_id, 3, false
      from public.geo_city c where c.search like v_city || '%' or c.search like '% ' || v_city || '%'
    union all
    -- D-202: a state or region typed alone ("Goa", "Goa, India"): its largest places.
    select c.id, c.name, c.region, c.country, c.country_code, c.population, c.search, c.country_search, c.region_search, c.place_id, 3, true
      from public.geo_city c where length(v_city) >= 3 and c.region_search = v_city and c.population is not null
    union all
    select c.id, c.name, c.region, c.country, c.country_code, c.population, c.search, c.country_search, c.region_search, c.place_id, 2, false
      from public.geo_alias a join public.geo_city c on c.id = a.city_id where a.alias like v_city || '%'
    union all
    select c.id, c.name, c.region, c.country, c.country_code, c.population, c.search, c.country_search, c.region_search, c.place_id, 1, false
      from public.geo_city c where length(v_city) >= 4 and c.search % v_city
  ), best as (
    select distinct on (h.cid) h.*
      from hits h
     where v_rest is null or h.ccs like v_rest || '%' or h.crs like v_rest || '%' or lower(h.ccode) = v_rest
     order by h.cid, h.tier desc, h.in_region
  )
  select coalesce(b.cplace, 'geo-' || b.cid), b.cname, b.cregion, b.ccountry, b.ccode
    from best b
   order by b.tier desc,
            (b.csearch = v_city) desc,
            case when b.tier between 1 and 3 then (b.csearch like v_city || '%') end desc,
            b.in_region desc,
            case when b.tier between 1 and 3 and not b.in_region then extensions.similarity(b.csearch, v_city) end desc,
            b.cpop desc nulls last, b.cid
   limit v_limit;
end;
$$;
revoke all on function public.search_cities(text, int) from public;
grant execute on function public.search_cities(text, int) to anon, authenticated;
