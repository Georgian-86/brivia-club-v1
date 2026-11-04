set lock_timeout = '5s';
-- 0047_hiring_test_world.sql: seeded hirers and seekers stay inside the test world (founder request 2026-11-04, D-162).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0037 (README "## 0047"). Idempotent: the local harness
-- applies every migration twice. Needs 0037: it redefines four of its functions.
--
-- Why: the founder asked for realistic hiring profiles to test the feature end to end (supabase/seed/
-- hiring-test-members.sql). open_test_world is on live, so real members already see the seeded members; a seeded
-- "Hiring" banner on such a card would be a job that does not exist (the reasoning of D-156 for seeded photos).
-- What:
--   * brivia_hiring_seen_by(viewer, member): true unless the member is a seeded test member (profiles.is_test) and the
--     viewer is neither that member nor in the strict test world (brivia_tester_world: is_test, or a brivia_tester row).
--     open_test_world does not widen it.
--   * brivia_role_shown (member_hiring, the seeker side of hiring_suggestions, ask_about_role), member_open_to and the
--     hirer side of hiring_suggestions also require it. A real member who is not a tester sees no seeded role and no
--     seeded "Open to roles", and cannot ask about a seeded role.
--   * brivia_hiring_bar: a seeded member skips the 14-day account age and the photo (seeded members never carry a
--     photo, D-156, and many are new). Completed, a confirmed email and no open flag still apply.

create or replace function public.brivia_hiring_seen_by(p_viewer uuid, p_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((select p.is_test from public.profiles p where p.id = p_member), false)
      or p_member = p_viewer
      or (p_viewer is not null and public.brivia_tester_world(p_viewer)) $$;
revoke all on function public.brivia_hiring_seen_by(uuid, uuid) from public, anon, authenticated;

-- The hiring bar (spec §9), seeded members exempt from account age and photo.
create or replace function public.brivia_hiring_bar(p_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.brivia_hiring_enabled()
    and public.brivia_member_completed(p_member)
    and exists (select 1 from public.profiles p
                 where p.id = p_member
                   and (p.is_test or (p.created_at <= now() - interval '14 days' and coalesce(btrim(p.photo_url), '') <> '')))
    and exists (select 1 from auth.users u where u.id = p_member and u.email_confirmed_at is not null)
    and not exists (select 1 from public.member_flag f
                     where f.member_id = p_member and (f.expires_at is null or f.expires_at > now())),
    false) $$;
revoke all on function public.brivia_hiring_bar(uuid) from public, anon, authenticated;

-- A role that is shown: open, not expired, its hirer over the bar, and seen by the caller (seeded hirers: testers only).
create or replace function public.brivia_role_shown(p_role public.hiring_role)
returns boolean language sql stable security definer set search_path = public as $$
  select p_role.status = 'open' and p_role.expires_at > now() and public.brivia_hiring_bar(p_role.member_id)
     and public.brivia_hiring_seen_by(auth.uid(), p_role.member_id) $$;
revoke all on function public.brivia_role_shown(public.hiring_role) from public, anon, authenticated;

-- member_open_to: as 0037, and a seeded seeker's intent only for testers.
create or replace function public.member_open_to(p_id uuid)
returns table(titles text[], level text, work_modes text[])
language sql stable security definer set search_path = public as $$
  select i.titles, i.level, i.work_modes
    from public.role_intent i
   where i.member_id = p_id and public.brivia_hiring_enabled() and public.brivia_visible_to(auth.uid(), p_id)
     and public.brivia_hiring_seen_by(auth.uid(), p_id)
     and (i.visibility = 'everyone'
          or (exists (select 1 from public.hiring_role r where r.member_id = auth.uid() and r.status = 'open' and r.expires_at > now())
              and not exists (select 1 from public.hiring_role r
                               where r.member_id = auth.uid() and r.status <> 'closed' and i.private_company is not null
                                 and lower(btrim(r.company)) = lower(btrim(i.private_company))))) $$;
revoke all on function public.member_open_to(uuid) from public, anon;
grant execute on function public.member_open_to(uuid) to authenticated;

-- hiring_suggestions: as 0037; the seeker side through brivia_role_shown, the hirer side gates seeded seekers.
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
   where (pl.fine_ring <= 1 or pl.place_km <= 60)
     and public.brivia_visible_to(me.id, pl.tid)
     and not exists (select 1 from public.matches m
                      where (m.user1_id = me.id and m.user2_id = pl.tid) or (m.user1_id = pl.tid and m.user2_id = me.id))
     and not exists (select 1 from public.signal_ledger l
                      where l.sender_id = me.id and l.to_id = pl.tid and l.at > now() - interval '30 days')
     and not exists (select 1 from public.connection_requests r
                      where r.from_id = me.id and r.to_id = pl.tid and public.brivia_request_is_live(r.status, r.created_at))
     and not exists (select 1 from public.interaction i
                      where i.viewer_id = me.id and i.target_id = pl.tid and i.event = 'pass'
                        and i.created_at > now() - interval '7 days')
   order by pl.fit desc, coalesce(pl.fine_ring, 2), pl.place_km, pl.tid
   limit greatest(1, least(coalesce(p_limit, 10), 20)) $$;
revoke all on function public.hiring_suggestions(int) from public, anon;
grant execute on function public.hiring_suggestions(int) to authenticated;
