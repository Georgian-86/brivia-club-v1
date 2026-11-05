set lock_timeout = '5s';
-- 0063_companions_include_connections.sql (D-214, founder 2026-11-05: "no matter if the person is added or not, if they
-- turn on companion button i want their profile to be shown in that section, and when i view it, it must show you are
-- already connected, and then a button of Text Them and make a plan"). Apply after 0062 (README "## 0063"), with the
-- client deploy. 0001-0062 are frozen. Idempotent.
--   companion_deck (0025's) also returns members the caller is already connected with who want company at the event,
--   flagged connected (a new last column), first in the order, whether or not they were swiped before. Everyone else is
--   as before (until swiped). It is a new function, companion_deck_v2, because the answer gains a column (companion_deck
--   from 0025 is left as it is for the client deployed before this). companion_events' to_see counts the same way.

create or replace function public.companion_deck_v2(p_event uuid, p_limit int default 20)
returns table(member_id uuid, name text, photo_url text, cover_url text, headline text, looking_for text[],
              interests text[], shared_interests text[], distance_band text, shared_count int, connected boolean)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id, p.looking_for, p.skills, o.home_cell, o.place_id, pl.country
      from public.profiles p
      left join public.member_orbit o on o.member_id = p.id
      left join public.place pl on pl.id = o.place_id
     where p.id = auth.uid() and auth.uid() is not null and public.brivia_member_completed(auth.uid())
       and public.brivia_companion_eligible(p_event, auth.uid())),
  pool as (
    select p.id, p.name, p.photo_url, p.cover_url, p.experience, p.looking_for, p.skills, r.created_at as opted_at,
           o.home_cell, pl.name as place_name, pl.country, public.brivia_is_connection(me.id, p.id) as connected
      from me
      join public.event_rsvp r on r.event_id = p_event and r.member_id <> me.id and r.wants_companion and public.brivia_companion_status(r.status)
      join public.profiles p on p.id = r.member_id
      left join public.member_orbit o on o.member_id = p.id
      left join public.place pl on pl.id = o.place_id
     where public.brivia_visible_to(me.id, p.id)
       -- D-214: a connection who also wants company is always shown (marked connected); others until swiped.
       and (public.brivia_is_connection(me.id, p.id)
            or not exists (select 1 from public.event_companion_swipe s
                            where s.event_id = p_event and s.actor_id = me.id and s.target_id = p.id))),
  scored as (
    select pool.*,
           (select coalesce(array_agg(x.label order by x.shared desc, x.points desc, x.label), '{}')
              from (select n.label, mi.points, exists (select 1 from public.member_interest a, me
                                                         where a.member_id = me.id and a.interest_id = mi.interest_id) as shared
                      from public.member_interest mi join public.interest_node n on n.id = mi.interest_id
                     where mi.member_id = pool.id
                     order by 3 desc, mi.points desc, n.label limit 4) x) as interests,
           (select coalesce(array_agg(n.label order by n.label), '{}')
              from public.member_interest a join public.member_interest b on b.interest_id = a.interest_id
              join public.interest_node n on n.id = a.interest_id, me
             where a.member_id = me.id and b.member_id = pool.id) as shared,
           (select count(*)::int from (select lower(x) from me, unnest(me.looking_for || me.skills) x
                                       intersect select lower(y) from unnest(pool.looking_for || pool.skills) y) q) as background,
           case when pool.country is not null and (select country from me) is not null and pool.country <> (select country from me) then 'Abroad'
                when pool.home_cell is not null and (select home_cell from me) is not null
                     and public.brivia_ring(public.brivia_cell_km((select home_cell from me), pool.home_cell)) = 0 then '~3 km'
                when pool.home_cell is not null and (select home_cell from me) is not null
                     and public.brivia_ring(public.brivia_cell_km((select home_cell from me), pool.home_cell)) = 1 then '~10 km'
                else pool.place_name end as band
      from pool)
  select s.id, s.name, s.photo_url, s.cover_url, nullif(btrim(coalesce(s.experience, '')), ''), s.looking_for,
         s.interests, s.shared[1:4], s.band, cardinality(s.shared), s.connected
    from scored s
   order by s.connected desc, cardinality(s.shared) desc, s.background desc, s.opted_at, s.id
   limit greatest(1, least(coalesce(p_limit, 20), 50))
$$;
revoke all on function public.companion_deck_v2(uuid, int) from public, anon;
grant execute on function public.companion_deck_v2(uuid, int) to authenticated;

create or replace function public.companion_events()
returns table(event_id uuid, title text, starts_at timestamptz, ends_at timestamptz, venue_name text, venue_area text,
              to_see int)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id where auth.uid() is not null and public.brivia_member_completed(auth.uid()))
  select e.id, e.title, e.starts_at, e.ends_at, e.venue_name, e.venue_area,
         (select count(*)::int from public.event_rsvp r
           where r.event_id = e.id and r.member_id <> me.id and r.wants_companion and public.brivia_companion_status(r.status)
             and public.brivia_visible_to(me.id, r.member_id)
             and (public.brivia_is_connection(me.id, r.member_id)   -- D-214: connections count, always
                  or not exists (select 1 from public.event_companion_swipe s
                                  where s.event_id = e.id and s.actor_id = me.id and s.target_id = r.member_id)))
    from me join public.club_event e on public.brivia_companion_eligible(e.id, me.id)
   order by e.starts_at, e.id
   limit 50
$$;
revoke all on function public.companion_events() from public, anon;
grant execute on function public.companion_events() to authenticated;
