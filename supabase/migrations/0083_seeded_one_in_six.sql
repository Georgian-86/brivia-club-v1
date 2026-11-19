set lock_timeout = '5s';
-- 0083_seeded_one_in_six.sql (D-271, founder 2026-11-18: "make sure fake ids ... should not be visible to people
-- together, after original very active profiles, it must be like 1 fake profile in 5 active original profiles").
-- Apply after 0081 (README "## 0083"); no client change is needed. 0001-0082 are frozen. Idempotent.
--
-- While the open test world is on (0010), seeded test members (profiles.is_test, the @test.brivia.club accounts) are
-- shown to real members. This migration keeps every rule of who may be shown and changes only the ORDER of the lists
-- that show people to a member: real members keep their own order, and a seeded member may take a place only after
-- five real ones. Real 1-5, seeded 1, real 6-10, seeded 2, ... When the real members of a list run out, the remaining
-- seeded members follow, in their own order, so a list never ends early because of the mix.
--   * deck_candidates (Connect deck), discover_people (filters / search anywhere), newcomer_cards (started, not
--     finished): mixed one in six.
--   * search_members (search by name): the people whose name matches come first, real before seeded.
--   * Inside the strict test world (testers and seeded members) the lists are almost all seeded; the mix leaves that
--     order unchanged. Nearby and Find a Companion have no seeded members (they never go live or RSVP).
-- Only the place in the list changes: nothing new is exposed, matching stays mutual-consent, location stays coarse.

-- brivia_private.brivia_is_seeded(id): a seeded test member (profiles.is_test). The one place these lists read is_test
-- (the tester-world guard allows it by name, as it does brivia_tester_world). Internal.
create or replace function brivia_private.brivia_is_seeded(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_test from public.profiles p where p.id = p_id), false)
$$;
revoke all on function brivia_private.brivia_is_seeded(uuid) from public, anon, authenticated;

-- brivia_private.brivia_seed_slot(seeded, rank among its own kind, number of real members in the list): the position.
create or replace function brivia_private.brivia_seed_slot(p_seeded boolean, p_rank bigint, p_real bigint)
returns bigint
language sql
immutable
set search_path = public
as $$
  select case
    when not coalesce(p_seeded, false) then p_rank + (p_rank - 1) / 5        -- real: 1-5, 7-11, 13-17, ...
    when p_rank <= coalesce(p_real, 0) / 5 then p_rank * 6                    -- seeded k: after the 5k-th real
    else 1000000000 + p_rank                                                  -- after every real member
  end
$$;
revoke all on function brivia_private.brivia_seed_slot(boolean, bigint, bigint) from public, anon, authenticated;

-- 1. deck_candidates. The live function differs from the repo's 0008 copy (a live-only edit: the 3-argument
--    brivia_request_is_live with chat_accepted_at, D-129), so, as 0073 did for send_signal, the installed body is
--    read, the one ranking expression is replaced, and the function is re-created from it. Idempotent; refuses rather
--    than guessing when the expression is not there.
do $mig$
declare
  src text;
  patched text;
begin
  select prosrc into src from pg_proc where oid = 'public.deck_candidates(int)'::regprocedure;
  if position('brivia_seed_slot' in src) > 0 then return; end if;
  patched := regexp_replace(src,
    'row_number\(\) over \(order by b\.shared_n > 0 desc, b\.display_ring, b\.overlap_level desc, b\.tie, b\.tid\) as pos\s+from banded b',
    'row_number() over (order by b.slot) as pos
      from (select k.*, brivia_private.brivia_seed_slot(k.seeded, k.kind_rank, count(*) filter (where not k.seeded) over ()) as slot
              from (select b0.*, brivia_private.brivia_is_seeded(b0.tid) as seeded,
                           row_number() over (partition by brivia_private.brivia_is_seeded(b0.tid)
                                              order by b0.shared_n > 0 desc, b0.display_ring, b0.overlap_level desc, b0.tie, b0.tid) as kind_rank
                      from banded b0) k) b');
  if patched = src then raise exception '0083: deck_candidates ranking not found; nothing changed'; end if;
  execute format($f$create or replace function public.deck_candidates(p_limit int default 12)
returns table(id uuid, name text, photo_url text, cover_url text, experience text, skills text[],
              looking_for text[], distance_band text, shared_interests text[])
language sql
volatile
security definer
set search_path = public
as %L$f$, patched);
end
$mig$;
revoke all on function public.deck_candidates(int) from public, anon;
grant execute on function public.deck_candidates(int) to authenticated;

-- 2. discover_people: copied from 0072 (the same as live); only the final order changes.
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
    select t.id as tid, tp.name as place_name, tp.country, brivia_private.brivia_is_seeded(t.id) as seeded,
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
  ),
  ranked as (
    select e.*, coalesce(s.labels, '{}'::text[]) as labels,
           row_number() over (partition by e.seeded
                              order by e.skill_hits + e.looking_hits desc, coalesce(s.n, 0) desc, e.km, e.tid) as kind_rank
      from eligible e
      left join shared s on s.tid = e.tid
  ),
  mixed as (
    select r.*, brivia_private.brivia_seed_slot(r.seeded, r.kind_rank, count(*) filter (where not r.seeded) over ()) as slot
      from ranked r
  )
  select m.tid,
         case when m.country is distinct from me.country then 'Abroad' else m.place_name end,
         m.skill_hits + m.looking_hits,
         m.labels
    from mixed m
    cross join me
   order by m.slot
   limit greatest(1, least(coalesce(p_limit, 20), 30))
$$;
revoke all on function public.discover_people(text[], text[], int, text, uuid[], int) from public, anon;
grant execute on function public.discover_people(text[], text[], int, text, uuid[], int) to authenticated;

-- 3. newcomer_cards: copied from 0073 (the same as live); only the order changes (newest first within each kind).
create or replace function public.newcomer_cards(p_exclude uuid[] default '{}', p_limit int default 6)
returns table(id uuid, name text, photo_url text, cover_url text, experience text, skills text[],
              looking_for text[], distance_band text, shared_interests text[])
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id where public.brivia_member_completed(auth.uid())),
  ex as (select coalesce(array_agg(e), '{}'::uuid[]) as ids from (select unnest(coalesce(p_exclude, '{}'::uuid[])) e limit 500) x),
  pool as (
    select t.id, t.name, t.photo_url, t.cover_url, t.experience, t.skills, t.looking_for,
           brivia_private.brivia_is_seeded(t.id) as seeded,
           row_number() over (partition by brivia_private.brivia_is_seeded(t.id) order by t.created_at desc, t.id) as kind_rank
      from public.profiles t cross join me cross join ex
     where t.id <> me.id
       and not (t.id = any(ex.ids))
       and not public.brivia_member_completed(t.id)
       and brivia_private.brivia_newcomer_visible(me.id, t.id)
       and public.brivia_in_test_world(t.id) = public.brivia_in_test_world(me.id)
       and not exists (select 1 from public.matches m
                        where (m.user1_id = me.id and m.user2_id = t.id) or (m.user1_id = t.id and m.user2_id = me.id))
       and not exists (select 1 from public.signal_ledger l
                        where l.sender_id = me.id and l.to_id = t.id and l.at > now() - interval '30 days')
       and not exists (select 1 from public.connection_requests r
                        where r.from_id = me.id and r.to_id = t.id and public.brivia_request_is_live(r.status, r.created_at))
       and not exists (select 1 from public.interaction i
                        where i.viewer_id = me.id and i.target_id = t.id and i.event = 'pass'
                          and i.created_at > now() - interval '7 days')
  ),
  mixed as (
    select p.*, brivia_private.brivia_seed_slot(p.seeded, p.kind_rank, count(*) filter (where not p.seeded) over ()) as slot
      from pool p
  )
  select m.id, m.name, m.photo_url, m.cover_url, m.experience, m.skills, m.looking_for, 'New to Brivia'::text, '{}'::text[]
    from mixed m
   order by m.slot
   limit greatest(1, least(coalesce(p_limit, 6), 20))
$$;
revoke all on function public.newcomer_cards(uuid[], int) from public, anon;
grant execute on function public.newcomer_cards(uuid[], int) to authenticated;

-- 4. search_members: the same patch-the-installed-body approach (the live body has CRLF line ends); the name match
--    still comes first, then real members before seeded ones, then newest.
do $mig$
declare
  src text;
  patched text;
  def text;
begin
  select prosrc into src from pg_proc where oid = 'public.search_members(text, int)'::regprocedure;
  if position('brivia_is_seeded(p.id), p.created_at desc' in src) > 0 then return; end if;
  patched := regexp_replace(src,
    '(row_number\(\) over \(order by \(p\.name ilike q\.pattern escape ''\\'' or p\.full_name ilike q\.pattern escape ''\\''\) desc,\s+)p\.created_at desc, p\.id desc\) as pos',
    '\1brivia_private.brivia_is_seeded(p.id), p.created_at desc, p.id desc) as pos');
  if patched = src then raise exception '0083: search_members order not found; nothing changed'; end if;
  -- Keep the installed header (returns setof public_profile_card, volatility, security definer, search_path).
  def := pg_get_functiondef('public.search_members(text, int)'::regprocedure);
  execute replace(def, src, patched);
end
$mig$;
revoke all on function public.search_members(text, int) from public, anon;
grant execute on function public.search_members(text, int) to authenticated;
