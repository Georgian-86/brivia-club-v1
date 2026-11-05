-- 0059 (D-202): more places. G3 a state typed alone lists its largest places (after names that start with the text);
-- G4 brivia_add_osm_places adds a place the directory lacks once (by its OpenStreetMap ref), reuses a directory city
--    of the same name within 25 km, skips bad rows, never exposes a coordinate, and only the service role may call it.
set brivia.harness_autocomplete = 'off';
begin;
select public.brivia_import_cities($j$[
  [133342,"Panaji","","Goa","GA","IN","India",15.4909,73.8278,70991,"adm1"],
  [134333,"Vasco da Gama","","Goa","GA","IN","India",15.3956,73.8158,100485,"city"],
  [132811,"Madgaon","","Goa","GA","IN","India",15.2736,73.9581,87650,"city"],
  [131901,"Goa Velha","","Goa","GA","IN","India",15.4446,73.8833,5000,"locality"],
  [167535,"Goalpara","","Assam","AS","IN","India",26.1764,90.6203,9636,"municipality"]]$j$::jsonb);

set local role anon;
do $$
declare ids text;
begin
  select string_agg(name, ',') into ids from public.search_cities('Goa');
  if ids not like 'Goa Velha,Goalpara,Vasco da Gama,Madgaon,Panaji%' then raise exception 'FAIL G3: Goa listed %', ids; end if;
  select string_agg(name, ',') into ids from public.search_cities('Goa, India');
  if ids not like 'Goa Velha,Goalpara,Vasco da Gama%' then raise exception 'FAIL G3: Goa, India listed %', ids; end if;
  if has_function_privilege('anon', 'public.brivia_add_osm_places(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.brivia_add_osm_places(jsonb)', 'execute') then
    raise exception 'FAIL G4: a client may add places'; end if;
end $$;
reset role;

do $$
declare a text; b text; n int;
begin
  select string_agg(id || '|' || name || '|' || region, ',') into a from public.brivia_add_osm_places($j$[
    {"osm_ref": "R1990381", "name": "South Goa", "region": "Goa", "country": "India", "country_code": "IN", "lat": 15.17, "lng": 74.07, "kind": "district"},
    {"osm_ref": "N245", "name": "Vasco da Gama", "region": "Goa", "country": "India", "country_code": "IN", "lat": 15.40, "lng": 73.81, "kind": "town"},
    {"osm_ref": "bad", "name": "Nowhere", "region": "", "country": "India", "country_code": "IN", "lat": 1, "lng": 1},
    {"osm_ref": "N9", "name": "Far", "region": "", "country": "India", "country_code": "IN", "lat": 95, "lng": 1}]$j$::jsonb);
  if a not like 'geo-9%|South Goa|Goa,geo-134333|Vasco da Gama|Goa' then raise exception 'FAIL G4: added %', a; end if;
  select string_agg(id, ',') into b from public.brivia_add_osm_places($j$[
    {"osm_ref": "R1990381", "name": "South Goa", "region": "Goa", "country": "India", "country_code": "IN", "lat": 15.17, "lng": 74.07}]$j$::jsonb);
  if b <> split_part(split_part(a, ',', 1), '|', 1) then raise exception 'FAIL G4: added twice (% then %)', a, b; end if;
  select count(*) into n from public.geo_city where name = 'South Goa';
  if n <> 1 then raise exception 'FAIL G4: % South Goa rows', n; end if;
end $$;

set local role anon;
do $$
begin
  if (select name from public.search_cities('South Goa') limit 1) is distinct from 'South Goa' then raise exception 'FAIL G4: not searchable after'; end if;
end $$;
reset role;
-- ensure_place turns it into a place (members pick it like any directory city).
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
do $$
declare g text := (select 'geo-' || id from public.geo_city where name = 'South Goa');
begin
  if public.ensure_place(g) <> g then raise exception 'FAIL G4: ensure_place gave another id'; end if;
  if not exists (select 1 from public.place where id = g and region = 'Goa' and country = 'India') then raise exception 'FAIL G4: no place row'; end if;
end $$;
rollback;
select 'zf-more-places.test ALL PASSED';
