set lock_timeout = '5s';
-- 0072_discover_people.sql (D-239, founder 2026-11-11: a location filter "Search anywhere / Near me / Custom /
-- Search radius", and "when we search with some particular interests, show all the available people from any
-- location when there is no person with those skills nearby"). Apply after 0071 (README "## 0072"), then deploy the
-- client. 0001-0071 are frozen. Idempotent.
--
-- discover_people is the filter drawer's search lane (ORBIT_ENGINE §7: search is not gated and not ring-restricted).
-- deck_candidates and the Escape-Velocity gate are unchanged: the deck is still location-first; this runs only when
-- the member asks for it (a location filter) or when their interest filters find no one in the deck.
--
--   * Who: every member the caller may see (brivia_visible_to: completed, same world, no block either way), minus
--     the deck's own-history exclusions (connected, a signal in 30 days, a live request, a pass in 7 days) and the
--     ids the client already holds (p_exclude, at most 300).
--   * Filters: p_skills / p_looking_for, case-insensitive whole values against the card's own lists; a member needs
--     at least one hit in each list that is given (the drawer's own rule). Both empty: no interest filter.
--   * Where: distance between place centroids (city level, never a member's cell or position). The centre is the
--     caller's own place, or p_place_id (a "Custom" city from the place directory). p_radius_km null = anywhere;
--     otherwise 5..20000 km.
--   * Order: interest hits, then shared interests, then distance, then id.
--   * Answers: id, distance_band (the member's city, or 'Abroad' for another country, as the deck says beyond
--     ~10 km), hits and up to two shared interest labels. Never km, a cell, coordinates, email or phone.

create or replace function public.discover_people(
  p_skills text[] default '{}', p_looking_for text[] default '{}', p_radius_km int default null,
  p_place_id text default null, p_exclude uuid[] default '{}', p_limit int default 20)
returns table(id uuid, distance_band text, hits int, shared_interests text[])
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id, vp.country, coalesce(cp.lat, vp.lat) as lat, coalesce(cp.lng, vp.lng) as lng
      from public.profiles p
      join public.member_orbit o on o.member_id = p.id and o.cell_scheme = 'grid1'
      join public.place vp on vp.id = o.place_id
      left join public.place cp on cp.id = nullif(btrim(coalesce(p_place_id, '')), '')
     where p.id = auth.uid() and public.brivia_member_completed(p.id)
  ),
  want as (
    select array(select distinct lower(btrim(x)) from unnest(coalesce(p_skills, '{}'::text[])) x where btrim(x) <> '' limit 12) as skills,
           array(select distinct lower(btrim(x)) from unnest(coalesce(p_looking_for, '{}'::text[])) x where btrim(x) <> '' limit 12) as looking,
           case when p_radius_km is null then null else least(greatest(p_radius_km, 5), 20000) end as radius,
           (select coalesce(array_agg(e), '{}'::uuid[]) from (select unnest(coalesce(p_exclude, '{}'::uuid[])) e limit 300) x) as exclude
  ),
  cand as (
    select t.id as tid, tp.name as place_name, tp.country,
           public.brivia_haversine_km(me.lat, me.lng, tp.lat, tp.lng) as km,
           (select count(*) from unnest(coalesce(t.skills, '{}'::text[])) s where lower(btrim(s)) = any(want.skills))::int as skill_hits,
           (select count(*) from unnest(coalesce(t.looking_for, '{}'::text[])) s where lower(btrim(s)) = any(want.looking))::int as looking_hits
      from me cross join want
      join public.member_orbit o on o.member_id <> me.id and o.cell_scheme = 'grid1'
      join public.profiles t on t.id = o.member_id
      join public.place tp on tp.id = o.place_id
     where (want.radius is null or abs(tp.lat - me.lat) <= want.radius / 111.0 + 0.05)
       and not (t.id = any(want.exclude))
  ),
  eligible as (
    select c.* from cand c cross join me cross join want
     where (want.radius is null or c.km <= want.radius)
       and (cardinality(want.skills) = 0 or c.skill_hits > 0)
       and (cardinality(want.looking) = 0 or c.looking_hits > 0)
       and not exists (select 1 from public.matches m
                        where (m.user1_id = me.id and m.user2_id = c.tid) or (m.user1_id = c.tid and m.user2_id = me.id))
       and not exists (select 1 from public.signal_ledger l
                        where l.sender_id = me.id and l.to_id = c.tid and l.at > now() - interval '30 days')
       and not exists (select 1 from public.connection_requests r
                        where r.from_id = me.id and r.to_id = c.tid and public.brivia_request_is_live(r.status, r.created_at))
       and not exists (select 1 from public.interaction i
                        where i.viewer_id = me.id and i.target_id = c.tid and i.event = 'pass'
                          and i.created_at > now() - interval '7 days')
       and public.brivia_visible_to(me.id, c.tid)
  ),
  shared as (
    select e.tid, count(*)::int as n,
           (array_agg(nd.label order by mv.points + mt.points desc, nd.label))[1:2] as labels
      from eligible e
      join public.member_interest mt on mt.member_id = e.tid
      join public.member_interest mv on mv.member_id = (select me.id from me) and mv.interest_id = mt.interest_id
      join public.interest_node nd on nd.id = mt.interest_id and nd.status = 'active' and not nd.sensitive
     group by e.tid
  )
  select e.tid,
         case when e.country is distinct from me.country then 'Abroad' else e.place_name end,
         e.skill_hits + e.looking_hits,
         coalesce(s.labels, '{}'::text[])
    from eligible e
    cross join me
    left join shared s on s.tid = e.tid
   order by e.skill_hits + e.looking_hits desc, coalesce(s.n, 0) desc, e.km, e.tid
   limit greatest(1, least(coalesce(p_limit, 20), 30))
$$;
revoke all on function public.discover_people(text[], text[], int, text, uuid[], int) from public, anon;
grant execute on function public.discover_people(text[], text[], int, text, uuid[], int) to authenticated;
