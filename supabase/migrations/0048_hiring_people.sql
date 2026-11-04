set lock_timeout = '5s';
-- 0048_hiring_people.sql: the Hiring switch finds people who are hiring, not only the ones already in the deck
-- (founder, 2026-11-04: "still no one in hiring", D-169). Applied by hand in the Supabase SQL editor, as postgres,
-- after 0047 (README "## 0048"). Idempotent. Until it runs the client falls back to filtering the loaded deck.
--
-- hiring_people(limit): members with a shown role (brivia_role_shown: open, live, over the bar, seeded hirers only for
-- testers) whom the caller can see (brivia_visible_to), nearest first: the caller's own ~3 km / ~10 km rings, then
-- the nearest place. Search reaches everyone (VISION rule 3), so there is no distance cut; a caller with "Roles I'm
-- open to" sees roles that fit (0.5 or more) first. Never a cell, a city of the caller or a km: the same distance
-- band as hiring_suggestions. Excludes matches and live requests the caller sent (the deck's own checks). At most 50.
create or replace function public.hiring_people(p_limit int default 30)
returns table(id uuid, fit numeric, role_title text, distance_band text)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, public.brivia_in_test_world(p.id) as in_test_world, o.home_cell, o.precision, vp.country,
           vp.lat as place_lat, vp.lng as place_lng,
           exists (select 1 from public.role_intent i where i.member_id = p.id) as seeking
      from public.profiles p
      join public.member_orbit o on o.member_id = p.id and o.cell_scheme = 'grid1'
      join public.place vp on vp.id = o.place_id
     where p.id = auth.uid() and public.brivia_member_completed(p.id) and public.brivia_hiring_enabled()
  ),
  roles as (
    select r.member_id as tid, r.title, r.opened_at,
           case when me.seeking then public.brivia_role_fit(me.id, r.id) else 0 end as fit
      from me join public.hiring_role r on r.member_id <> me.id
     where public.brivia_role_shown(r) and public.brivia_visible_to(me.id, r.member_id)
  ),
  best as (select distinct on (tid) tid, fit, title from roles order by tid, fit desc, opened_at desc, title),
  placed as (
    select b.*, tp.name as place_name, tp.country,
           case when me.precision = 'cell' and o.precision = 'cell' and o.home_cell ~ '^g7:'
                     and public.brivia_cell_ok(o.home_cell, me.in_test_world, 10)
                then public.brivia_ring(public.brivia_cell_km(me.home_cell, o.home_cell)) end as fine_ring,
           public.brivia_haversine_km(me.place_lat, me.place_lng, tp.lat, tp.lng) as place_km
      from best b cross join me
      join public.member_orbit o on o.member_id = b.tid and o.cell_scheme = 'grid1'
      join public.place tp on tp.id = o.place_id
  )
  select pl.tid, pl.fit, pl.title,
         case when pl.country is distinct from me.country then 'Abroad'
              when pl.fine_ring = 0 then '~3 km' when pl.fine_ring = 1 then '~10 km' else pl.place_name end
    from placed pl cross join me
   where not exists (select 1 from public.matches m
                      where (m.user1_id = me.id and m.user2_id = pl.tid) or (m.user1_id = pl.tid and m.user2_id = me.id))
     and not exists (select 1 from public.connection_requests r
                      where r.from_id = me.id and r.to_id = pl.tid and public.brivia_request_is_live(r.status, r.created_at))
   order by (pl.fit >= 0.5) desc, coalesce(pl.fine_ring, 2), pl.place_km, pl.fit desc, pl.tid
   limit greatest(1, least(coalesce(p_limit, 30), 50)) $$;
revoke all on function public.hiring_people(int) from public, anon;
grant execute on function public.hiring_people(int) to authenticated;
