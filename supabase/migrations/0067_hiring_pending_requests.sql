set lock_timeout = '5s';
-- 0067_hiring_pending_requests.sql (D-219, founder 2026-11-06: "people I have sent req already to are now hiring but
-- their profile is not being shown in the hiring deck ... I want their id to be displayed and when I try to reswipe
-- them, it must show something like Request is already pending"). Apply after 0066 (README "## 0067"), with the client
-- deploy. 0001-0066 are frozen. Idempotent.
--
-- hiring_people_v2: 0054's hiring_people (same people, order, pages and impression logging) plus a last column
-- request_pending, and members the caller has a live request to are no longer left out: they are served with
-- request_pending = true. Connections, a declined or expired request's 30-day pause, passes and blocks are unchanged.
-- A new name because the answer gains a column; hiring_people stays for the client deployed before this.

create or replace function public.hiring_people_v2(p_limit int default 30, p_after_score numeric default null, p_after_id uuid default null)
returns table(id uuid, fit numeric, role_title text, distance_band text, hiring_kind text, score numeric, request_pending boolean)
language sql
volatile
security definer
set search_path = public
as $$
  with me as (
    select p.id, p.skills, vp.country
      from public.profiles p
      left join public.member_orbit o on o.member_id = p.id and o.cell_scheme = 'grid1'
      left join public.place vp on vp.id = o.place_id
     where p.id = auth.uid() and public.brivia_member_completed(p.id) and public.brivia_hiring_enabled()
  ),
  my_roles as (
    select r.* from public.hiring_role r join me on r.member_id = me.id where r.status = 'open' and r.expires_at > now()
  ),
  hirers as (
    select r.member_id as tid,
           max(case when exists (select 1 from public.role_intent i where i.member_id = me.id) then public.brivia_role_fit(me.id, r.id) else 0 end) as fit,
           (array_agg(r.title order by case when exists (select 1 from public.role_intent i where i.member_id = me.id)
                                            then public.brivia_role_fit(me.id, r.id) else 0 end desc, r.opened_at desc))[1] as title
      from public.hiring_role r cross join me
     where r.member_id <> me.id and public.brivia_role_shown(r)
     group by r.member_id
  ),
  seekers as (
    select i.member_id as tid,
           coalesce((select max(public.brivia_role_fit(i.member_id, mr.id)) from my_roles mr), 0) as fit,
           i.titles[1] as title
      from public.role_intent i cross join me
     where i.member_id <> me.id
       and public.brivia_hiring_seen_by(me.id, i.member_id)
       and (i.visibility = 'everyone'
            or (exists (select 1 from my_roles)
                and not exists (select 1 from public.hiring_role c
                                 where c.member_id = me.id and c.status <> 'closed' and i.private_company is not null
                                   and lower(btrim(c.company)) = lower(btrim(i.private_company)))))
  ),
  pool as (
    -- A member who is both hiring and open to roles shows once, as hiring.
    select tid, 'hiring'::text as kind, fit, title from hirers
    union all
    select s.tid, 'open_to', s.fit, s.title from seekers s where not exists (select 1 from hirers h where h.tid = s.tid)
  ),
  eligible as (
    select pool.*, exists (select 1 from public.connection_requests r
                            where r.from_id = me.id and r.to_id = pool.tid and public.brivia_request_is_live(r.status, r.created_at)) as pending
      from pool cross join me
     where public.brivia_visible_to(me.id, pool.tid)
       and not exists (select 1 from public.matches m
                        where (m.user1_id = me.id and m.user2_id = pool.tid) or (m.user1_id = pool.tid and m.user2_id = me.id))
       -- D-219: a live request from the caller no longer hides them (they are flagged pending). A signal in the last
       -- 30 days with no live request (declined or expired) still does, as in 0054.
       and (exists (select 1 from public.connection_requests r
                     where r.from_id = me.id and r.to_id = pool.tid and public.brivia_request_is_live(r.status, r.created_at))
            or not exists (select 1 from public.signal_ledger l
                            where l.sender_id = me.id and l.to_id = pool.tid and l.at > now() - interval '30 days'))
       and not exists (select 1 from public.interaction i
                        where i.viewer_id = me.id and i.target_id = pool.tid and i.event = 'pass'
                          and i.created_at > now() - interval '7 days')
  ),
  shared as (
    select e.tid, sum(least(mv.points, mt.points))::numeric / 20 as overlap
      from eligible e
      join public.member_interest mt on mt.member_id = e.tid
      join public.member_interest mv on mv.member_id = (select me.id from me) and mv.interest_id = mt.interest_id
      join public.interest_node nd on nd.id = mt.interest_id and nd.status = 'active' and not nd.sensitive
     group by e.tid
  ),
  scored as (
    select e.tid, e.kind, e.title, e.pending, coalesce(e.fit, 0) as fit,
           round(0.5 * least(1, coalesce(e.fit, 0))
                 + 0.35 * least(1, coalesce(s.overlap, 0))
                 + 0.15 * least(1, (select count(distinct lower(btrim(a)))::numeric
                                      from public.profiles tp, unnest(coalesce(tp.skills, '{}')) a
                                     where tp.id = e.tid
                                       and lower(btrim(a)) in (select lower(btrim(b)) from me, unnest(coalesce(me.skills, '{}')) b)) / 3), 4) as score
      from eligible e left join shared s on s.tid = e.tid
  ),
  page as (
    select sc.* from scored sc
     where p_after_score is null or sc.score < p_after_score or (sc.score = p_after_score and sc.tid > p_after_id)
     order by sc.score desc, sc.tid
     limit greatest(1, least(coalesce(p_limit, 30), 200))
  ),
  logged as (  -- a data-modifying CTE always runs: the card was served, so a Pass on it is stored
    insert into public.interaction (viewer_id, target_id, event, context, propensity, model_version)
    select me.id, pg.tid, 'impression', jsonb_build_object('policy', 'hiring-global-v1', 'surface', 'hiring', 'kind', pg.kind), 1, 'hiring-global-v1'
      from page pg cross join me
    on conflict (viewer_id, target_id, (context ->> 'surface'), ((created_at at time zone 'UTC')::date))
      where event = 'impression' do nothing
    returning 1
  )
  select pg.tid, round(pg.fit, 4), pg.title,
         case when tpl.country is not null and tpl.country is distinct from (select me.country from me) then 'Abroad' else tpl.name end,
         pg.kind, pg.score, pg.pending
    from page pg
    left join public.member_orbit o on o.member_id = pg.tid and o.cell_scheme = 'grid1'
    left join public.place tpl on tpl.id = o.place_id
   order by pg.score desc, pg.tid
$$;
revoke all on function public.hiring_people_v2(int, numeric, uuid) from public, anon;
grant execute on function public.hiring_people_v2(int, numeric, uuid) to authenticated;
