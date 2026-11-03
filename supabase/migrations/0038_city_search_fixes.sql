set lock_timeout = '5s';
-- 0038_city_search_fixes.sql: two fixes found on the live directory right after the 156k import (D-140). Applied by hand
-- after 0037 (README "## 0038"). 0001-0037 are frozen. Idempotent.
--   1. brivia_fold kept only [:alnum:] characters, which dropped the vowel signs of Indic scripts (ಬೆಂಗಳೂರು became
--      "ಬ ಗಳ ರ"), so native-script names could not be found. It now removes only spaces and punctuation. The stored
--      search keys are recomputed (geo_city, geo_alias, company).
--   2. A country typed alone ("Japan") ranked below fuzzy name matches ("Jalpan"). An exact country name now lists that
--      country's largest cities first.

create or replace function public.brivia_fold(p text)
returns text
language sql
stable
set search_path = public, extensions
as $$ select btrim(regexp_replace(lower(extensions.unaccent(coalesce(p, ''))), '[[:space:][:punct:]]+', ' ', 'g')) $$;
revoke all on function public.brivia_fold(text) from public;
grant execute on function public.brivia_fold(text) to anon, authenticated;

-- Recompute the keys (the triggers fold again on these no-op updates).
update public.geo_city set name = name
 where search is distinct from btrim(public.brivia_fold(name) || ' ' || public.brivia_fold(native));
update public.geo_alias set alias = public.brivia_fold(alias) where alias is distinct from public.brivia_fold(alias);
update public.company set name = name where name_key is distinct from public.brivia_fold(name);

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
           4 as tier
      from public.geo_city c where v_rest is null and c.country_search = v_city and c.population is not null
    union all
    select c.id, c.name, c.region, c.country, c.country_code, c.population, c.search, c.country_search, c.region_search, c.place_id, 3
      from public.geo_city c where c.search like v_city || '%' or c.search like '% ' || v_city || '%'
    union all
    select c.id, c.name, c.region, c.country, c.country_code, c.population, c.search, c.country_search, c.region_search, c.place_id, 2
      from public.geo_alias a join public.geo_city c on c.id = a.city_id where a.alias like v_city || '%'
    union all
    select c.id, c.name, c.region, c.country, c.country_code, c.population, c.search, c.country_search, c.region_search, c.place_id, 1
      from public.geo_city c where length(v_city) >= 4 and c.search % v_city
  ), best as (
    select distinct on (h.cid) h.*
      from hits h
     where v_rest is null or h.ccs like v_rest || '%' or h.crs like v_rest || '%' or lower(h.ccode) = v_rest
     order by h.cid, h.tier desc
  )
  select coalesce(b.cplace, 'geo-' || b.cid), b.cname, b.cregion, b.ccountry, b.ccode
    from best b
   order by b.tier desc,
            case when b.tier between 1 and 3 then (b.csearch like v_city || '%') end desc,
            case when b.tier between 1 and 3 then extensions.similarity(b.csearch, v_city) end desc,
            b.cpop desc nulls last, b.cid
   limit v_limit;
end;
$$;
revoke all on function public.search_cities(text, int) from public;
grant execute on function public.search_cities(text, int) to anon, authenticated;
