set lock_timeout = '5s';
-- 0049_hiring_anywhere.sql: hiring matches are not cut by distance (founder, 2026-11-04: "make the hiring match not use
-- the location. Ofc show the nearest first but show all the vacancies", D-170). Applied by hand in the Supabase SQL
-- editor, as postgres, after 0048 (README "## 0049"). Idempotent.
--   * hiring_suggestions (the deck lift, the notification row): the 60 km / ~10 km admission is gone; fit still decides
--     who is suggested (0.5 or more); the nearest come first, fit breaks ties. The deck itself (deck_candidates, the Escape-Velocity gate) is unchanged:
--     this is the hiring lane only.
--   * hiring_people (the Hiring switch): up to 200 hirers (was 50), nearest first (fit breaks ties, was fit first), so every open vacancy is reachable.
-- Both still answer only the distance band, never a cell or a km.

create or replace function public.hiring_suggestions(p_limit int default 10)
returns table(id uuid, fit numeric, role_title text, distance_band text)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id, public.brivia_in_test_world(p.id) as in_test_world, o.home_cell, o.precision, vp.country,
           vp.lat as place_lat, vp.lng as place_lng
      from public.profiles p
      join public.member_orbit o on o.member_id = p.id and o.cell_scheme = 'grid1'
      join public.place vp on vp.id = o.place_id
     where p.id = auth.uid() and public.brivia_member_completed(p.id) and public.brivia_hiring_enabled()
  ),
  as_seeker as (
    select r.member_id as tid, public.brivia_role_fit(me.id, r.id) as fit, r.title
      from me join public.role_intent i on i.member_id = me.id
      join public.hiring_role r on r.member_id <> me.id
     where public.brivia_role_shown(r)
  ),
  as_hirer as (
    select i.member_id as tid, public.brivia_role_fit(i.member_id, r.id) as fit, r.title
      from me join public.hiring_role r on r.member_id = me.id and r.status = 'open' and r.expires_at > now()
      join public.role_intent i on i.member_id <> me.id and i.findable
     where public.brivia_hiring_bar(me.id) and public.brivia_hiring_seen_by(me.id, i.member_id)
       and not exists (select 1 from public.hiring_role c
                        where c.member_id = me.id and c.status <> 'closed' and i.private_company is not null
                          and lower(btrim(c.company)) = lower(btrim(i.private_company)))
  ),
  best as (
    select distinct on (tid) tid, fit, title from (select * from as_seeker union all select * from as_hirer) u
     where fit >= 0.5 order by tid, fit desc, title
  ),
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
   where public.brivia_visible_to(me.id, pl.tid)
     and not exists (select 1 from public.matches m
                      where (m.user1_id = me.id and m.user2_id = pl.tid) or (m.user1_id = pl.tid and m.user2_id = me.id))
     and not exists (select 1 from public.signal_ledger l
                      where l.sender_id = me.id and l.to_id = pl.tid and l.at > now() - interval '30 days')
     and not exists (select 1 from public.connection_requests r
                      where r.from_id = me.id and r.to_id = pl.tid and public.brivia_request_is_live(r.status, r.created_at))
     and not exists (select 1 from public.interaction i
                      where i.viewer_id = me.id and i.target_id = pl.tid and i.event = 'pass'
                        and i.created_at > now() - interval '7 days')
   order by coalesce(pl.fine_ring, 2), pl.place_km, pl.fit desc, pl.tid
   limit greatest(1, least(coalesce(p_limit, 10), 20)) $$;
revoke all on function public.hiring_suggestions(int) from public, anon;
grant execute on function public.hiring_suggestions(int) to authenticated;

create or replace function public.hiring_people(p_limit int default 200)
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
   order by coalesce(pl.fine_ring, 2), pl.place_km, pl.fit desc, pl.tid
   limit greatest(1, least(coalesce(p_limit, 200), 200)) $$;
revoke all on function public.hiring_people(int) from public, anon;
grant execute on function public.hiring_people(int) to authenticated;
