-- 0035 (D-140): the worldwide city directory.
-- G1 search: prefix, a typo, accents folded, native script, an alias, "City, Country" and "City, State" to tell
--    same-named cities apart, a country alone (its largest cities); never a coordinate; members cannot read the table.
-- G2 ensure_place: a picked city becomes one place row (geo-<n>) once; a city that is already a place answers that id;
--    set_home_city then works with it; bad ids are refused.
set brivia.harness_autocomplete = 'off';
begin;
select public.brivia_import_cities($j$[{"id": 57933, "name": "Bengaluru", "native": "ಬೆಂಗಳೂರು", "region": "Karnataka", "region_code": "KA", "country_code": "IN", "country": "India", "lat": 12.97194, "lng": 77.59369, "population": 8495492, "kind": "city"}, {"id": 132785, "name": "Ludhiana", "native": "लुधियाना", "region": "Punjab", "region_code": "PB", "country_code": "IN", "country": "India", "lat": 30.91204, "lng": 75.85379, "population": 1618879, "kind": "city"}, {"id": 900001, "name": "Springfield", "native": "", "region": "Illinois", "region_code": "IL", "country_code": "US", "country": "United States", "lat": 39.80172, "lng": -89.64371, "population": 114394, "kind": "city"}, {"id": 900002, "name": "Springfield", "native": "", "region": "Missouri", "region_code": "MO", "country_code": "US", "country": "United States", "lat": 37.21533, "lng": -93.29824, "population": 169176, "kind": "city"}, {"id": 900003, "name": "Tokyo", "native": "東京", "region": "Tokyo", "region_code": "13", "country_code": "JP", "country": "Japan", "lat": 35.6895, "lng": 139.69171, "population": 8336599, "kind": "city"}, {"id": 900004, "name": "São Paulo", "native": "", "region": "São Paulo", "region_code": "SP", "country_code": "BR", "country": "Brazil", "lat": -23.5475, "lng": -46.63611, "population": 10021295, "kind": "city"}, {"id": 900005, "name": "Kharar", "native": "खरड़", "region": "Punjab", "region_code": "PB", "country_code": "IN", "country": "India", "lat": 30.74632, "lng": 76.64689, "population": 74460, "kind": "town"}]$j$::jsonb);
-- The published parts are arrays of rows; a bad row (no country, a coordinate out of range) is skipped.
select public.brivia_import_cities($j$[[58190,"Chandigarh","चंडीगढ़","Chandigarh","CH","IN","India",30.7363,76.7884,1055450,"city"],[999998,"Nowhere","","","","","",0,0,null,"city"],[999999,"Bad","","X","X","IN","India",95,0,null,"city"]]$j$::jsonb);
select public.brivia_finish_city_import();

set local role anon;
do $$
declare r record; ids text;
begin
  -- G1 (as anon: signup searches before the account exists)
  select string_agg(id, ',') into ids from public.search_cities('ludh');
  if ids is distinct from 'in-ludhiana' then raise exception 'FAIL G1: prefix found %', ids; end if;   -- linked to the existing place
  if (select id from public.search_cities('Bangalore') limit 1) <> 'in-bengaluru' then raise exception 'FAIL G1: alias'; end if;
  if (select id from public.search_cities('Ludhiyana') limit 1) <> 'in-ludhiana' then raise exception 'FAIL G1: typo'; end if;
  if (select id from public.search_cities('sao paulo') limit 1) <> 'geo-900004' then raise exception 'FAIL G1: accents'; end if;
  if (select id from public.search_cities('東京') limit 1) <> 'geo-900003' then raise exception 'FAIL G1: native script'; end if;
  if (select id from public.search_cities('Springfield, Missouri') limit 1) <> 'geo-900002' then raise exception 'FAIL G1: city, state'; end if;
  if (select count(*) from public.search_cities('Springfield')) <> 2 then raise exception 'FAIL G1: same-named cities'; end if;
  if (select id from public.search_cities('Kharar, India') limit 1) <> 'geo-900005' then raise exception 'FAIL G1: city, country'; end if;
  if (select string_agg(id, ',') from public.search_cities('India')) not like 'in-bengaluru,in-ludhiana%' then raise exception 'FAIL G1: a country alone %', (select string_agg(id, ',') from public.search_cities('India')); end if;
  if (select id from public.search_cities('chandi') limit 1) <> 'in-chandigarh' and (select id from public.search_cities('chandi') limit 1) <> 'geo-58190' then
    raise exception 'FAIL G1: an array part'; end if;
  if exists (select 1 from public.search_cities('Nowhere')) or exists (select 1 from public.search_cities('Bad')) then raise exception 'FAIL G1: a bad row was kept'; end if;
  if exists (select 1 from public.search_cities('x')) then raise exception 'FAIL G1: one letter searched'; end if;
  if has_function_privilege('anon', 'public.brivia_import_cities(jsonb)', 'execute') then raise exception 'FAIL G1: anon may import'; end if;
  if not has_function_privilege('anon', 'public.search_cities(text,int)', 'execute') then raise exception 'FAIL G1: signup cannot search'; end if;
end $$;
reset role;
select 'u-city-directory.test G1 OK';

do $$
declare uid uuid := '0e350000-0000-4000-8000-000000000001'; got text; refused text := 'none';
begin
  insert into auth.users(id) values (uid) on conflict do nothing;
  insert into public.profiles (id, name, full_name, email) values (uid, 'Geo One', 'Geo One', 'geo1@example.com') on conflict (id) do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
  set local role authenticated;
  got := public.ensure_place('geo-900005');
  if got <> 'geo-900005' then raise exception 'FAIL G2: id %', got; end if;
  if public.ensure_place('geo-900005') <> 'geo-900005' then raise exception 'FAIL G2: second pick'; end if;
  if public.ensure_place('in-ludhiana') <> 'in-ludhiana' then raise exception 'FAIL G2: an existing place'; end if;
  begin perform public.ensure_place('geo-1; drop table x'); exception when others then refused := sqlerrm; end;
  if refused <> 'invalid place' then raise exception 'FAIL G2: bad id %', refused; end if;
  refused := 'none';
  begin perform public.ensure_place('geo-123456789'); exception when others then refused := sqlerrm; end;
  if refused <> 'invalid place' then raise exception 'FAIL G2: unknown id'; end if;
  perform public.set_home_city('geo-900005');
  reset role;
  if (select count(*) from public.place where id = 'geo-900005') <> 1 then raise exception 'FAIL G2: place rows'; end if;
  if (select place_id from public.member_orbit where member_id = uid) <> 'geo-900005' then raise exception 'FAIL G2: home city not set'; end if;
  if (select id from public.search_cities('Kharar') limit 1) <> 'geo-900005' then raise exception 'FAIL G2: search after pick'; end if;
end $$;
select 'u-city-directory.test G2 OK';
-- G3 a postcode centre (Ludhiana 141001) maps to the nearest directory city; never callable by members.
do $$ begin
  if (select id from public.brivia_nearest_cities(30.90, 75.85, 'in') limit 1) <> 'in-ludhiana' then raise exception 'FAIL G3: nearest'; end if;
  if exists (select 1 from public.brivia_nearest_cities(30.90, 75.85, 'US')) then raise exception 'FAIL G3: wrong country'; end if;
  if has_function_privilege('authenticated', 'public.brivia_nearest_cities(double precision,double precision,text,int)', 'execute') then raise exception 'FAIL G3: grants'; end if;
end $$;
select 'u-city-directory.test G3 OK';
rollback;
