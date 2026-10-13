-- 0008_tester_world.sql: the tester switch (Phase D, Task 1).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0001-0006 (0007 is independent of this file).
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- Test members (profiles.is_test) live in an isolated world (Ruling P14): they see only each other, and real members
-- never see them. A real account (the founder's) can join that world without becoming is_test, which matters
-- because the purge (supabase/seed/purge-test-members.sql) deletes every is_test profile.
--   * public.brivia_tester lists those accounts. Owner-only: RLS on with no policy, no client grants. The founder adds
--     and removes rows in the SQL editor (supabase/migrations/README.md, "0008").
--   * public.brivia_in_test_world(member) = the profile is_test, or the member has a brivia_tester row.
--   * Every function that compares two members' worlds is redefined below to compare brivia_in_test_world instead of
--     is_test, copied verbatim from its current definition (named above each one) except for that comparison, with
--     the same grants. The sites were enumerated from the live catalogue after 0001-0006 (pg_proc.prosrc and
--     pg_policies mentioning is_test); no policy reads is_test directly. Not redefined: brivia_guard_is_test (it keeps
--     is_test owner-only) and brivia_cell_ok (it reads a cell_density row for the world it is given; deck_candidates
--     now passes the caller's world).
--   * Section 3: a tester's requests, matches and messages with real members (rows made before the switch) are
--     hidden from both sides while the tester row exists (brivia_pair_world_ok). The rule needs a tester row, so it
--     does not hide test-world rows after the row is deleted: the ex-tester can then read its old test matches and
--     messages and see (and accept) pending requests from test members until the purge, but cannot message them.
--     Pairs without a tester behave exactly as before.
--   * cell_density keeps its column name is_test, but refresh_cell_density fills it from brivia_in_test_world, so a
--     tester is counted in the test world's density while a tester.
-- Semantics are unchanged for everyone who is not a tester. A tester sees only the test world and is seen only by it.
-- (supabase/tests/d-tester-world.test.sql; its guard fails if a function or policy compares is_test again.)

-- =============================================================================================
-- 1. The tester list and the world helper
-- =============================================================================================
create table if not exists public.brivia_tester (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.brivia_tester enable row level security;
revoke all on public.brivia_tester from public, anon, authenticated;

-- brivia_in_test_world(p_id): is this member in the test world? Internal: called only inside definer functions (and
-- by the owner's nightly refresh_cell_density); no client role may execute it. An unknown id is false.
create or replace function public.brivia_in_test_world(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_test from public.profiles p where p.id = p_id), false)
      or exists (select 1 from public.brivia_tester t where t.member_id = p_id)
$$;
revoke all on function public.brivia_in_test_world(uuid) from public, anon, authenticated;

-- =============================================================================================
-- 2. World comparisons through brivia_in_test_world
-- =============================================================================================
-- brivia_same_world: copied from 0003_trust_hardening.sql:196, with the grants 0004_orbit_onboarding.sql:1697 left
-- (no client role); only the world comparison changes.
create or replace function public.brivia_same_world(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() in (first_user, second_user)
     and exists (
       select 1 from public.profiles a join public.profiles b on public.brivia_in_test_world(a.id) = public.brivia_in_test_world(b.id)
       where a.id = first_user and b.id = second_user
     );
$$;
revoke all on function public.brivia_same_world(uuid, uuid) from public, anon, authenticated;

-- brivia_visible_to: copied from 0004_orbit_onboarding.sql:719; only the world comparison changes.
create or replace function public.brivia_visible_to(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_viewer <> p_target
    and exists (select 1 from public.profiles a join public.profiles b on public.brivia_in_test_world(a.id) = public.brivia_in_test_world(b.id)
                 where a.id = p_viewer and b.id = p_target)
    and not exists (select 1 from public.brivia_blocks bl
                     where (bl.blocker_id = p_viewer and bl.blocked_id = p_target)
                        or (bl.blocker_id = p_target and bl.blocked_id = p_viewer))
    and public.brivia_member_completed(p_viewer)
    and public.brivia_member_completed(p_target),
    false)
$$;
revoke all on function public.brivia_visible_to(uuid, uuid) from public, anon, authenticated;

-- get_candidates: copied from 0004_orbit_onboarding.sql:746; only the world comparison changes.
create or replace function public.get_candidates(p_ids uuid[])
returns setof public.public_profile_card
language sql
stable
security definer
set search_path = public
as $$
  with me as (  -- Ruling I5: the caller must be a completed member
    select id, public.brivia_in_test_world(id) as in_test_world from public.profiles where id = auth.uid() and public.brivia_member_completed(id)),
  wanted as (  -- the first 50 distinct ids, in the order given
    select id from (
      select distinct on (u.id) u.id, u.ord from unnest(p_ids) with ordinality as u(id, ord)
      where u.id is not null order by u.id, u.ord
    ) d order by d.ord limit 50
  )
  select p.id, p.name, p.full_name, null::text, null::text, null::text, p.experience, p.skills, p.looking_for,
         p.photo_url, p.cover_url, p.created_at
  from public.profiles p
  join me on p.id <> me.id and public.brivia_in_test_world(p.id) = me.in_test_world
  where p.id in (select id from wanted)
    and public.brivia_visible_to(me.id, p.id)
  order by p.created_at desc, p.id desc;
$$;
revoke all on function public.get_candidates(uuid[]) from public, anon;
grant execute on function public.get_candidates(uuid[]) to authenticated;

-- search_members: copied from 0004_orbit_onboarding.sql:772; only the world comparison changes.
create or replace function public.search_members(p_query text, p_limit int default 20)
returns setof public.public_profile_card
language sql
volatile
security definer
set search_path = public
as $$
  with me as (  -- Ruling I5: the caller must be a completed member
    select id, public.brivia_in_test_world(id) as in_test_world from public.profiles where id = auth.uid() and public.brivia_member_completed(id)),
  q as (  -- LIKE wildcards in the query are literal; a query with fewer than 2 non-space characters matches nothing
         -- (R4: a one-letter query would page the directory)
    select '%' || replace(replace(replace(left(btrim(p_query), 100), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
    where char_length(regexp_replace(coalesce(p_query, ''), '\s', '', 'g')) >= 2
  ),
  hits as (
    select p.id, p.name, p.full_name, p.experience, p.skills, p.looking_for, p.photo_url, p.cover_url,
           p.created_at,
           row_number() over (order by (p.name ilike q.pattern escape '\' or p.full_name ilike q.pattern escape '\') desc,
                                       p.created_at desc, p.id desc) as pos
      from public.profiles p
      join me on p.id <> me.id and public.brivia_in_test_world(p.id) = me.in_test_world
      cross join q
     where (p.name ilike q.pattern escape '\' or p.full_name ilike q.pattern escape '\'
            or exists (select 1 from unnest(p.skills) s where s ilike q.pattern escape '\')
            or exists (select 1 from unnest(p.looking_for) l where l ilike q.pattern escape '\'))
       and public.brivia_visible_to(me.id, p.id)
     order by pos
     limit greatest(1, least(coalesce(p_limit, 20), 20))
  ),
  logged as (  -- impressions (C-4, P0-A3), like deck_candidates: owner-only, surface 'search'
    insert into public.interaction (viewer_id, target_id, event, context, propensity, model_version)
    select me.id, h.id, 'impression', jsonb_build_object('policy', 'interim-v1', 'surface', 'search', 'position', h.pos),
           1, 'interim-v1'
      from hits h cross join me
    on conflict (viewer_id, target_id, (context ->> 'surface'), ((created_at at time zone 'UTC')::date))
      where event = 'impression' do nothing
    returning 1
  )
  select h.id, h.name, h.full_name, null::text, null::text, null::text, h.experience, h.skills, h.looking_for,
         h.photo_url, h.cover_url, h.created_at
    from hits h
   order by h.pos;
$$;
revoke all on function public.search_members(text, int) from public, anon;
grant execute on function public.search_members(text, int) to authenticated;

-- list_members: copied from 0004_orbit_onboarding.sql:818; only the world comparison changes.
create or replace function public.list_members(p_limit int default 20, p_after timestamptz default null,
                                               p_after_id uuid default null)
returns setof public.public_profile_card
language sql
stable
security definer
set search_path = public
as $$
  with me as (  -- Ruling I5: the caller must be a completed member
    select id, public.brivia_in_test_world(id) as in_test_world from public.profiles where id = auth.uid() and public.brivia_member_completed(id))
  select p.id, p.name, p.full_name, null::text, null::text, null::text, p.experience, p.skills, p.looking_for,
         p.photo_url, p.cover_url, p.created_at
  from public.profiles p
  join me on p.id <> me.id and public.brivia_in_test_world(p.id) = me.in_test_world
  where (p_after is null
         or p.created_at < p_after
         or (p_after_id is not null and p.created_at = p_after and p.id < p_after_id))
    and public.brivia_visible_to(me.id, p.id)
  order by p.created_at desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 20));
$$;
-- R4 (B-F2): list_members pages every visible member, and the client no longer calls it: no client role may.
revoke all on function public.list_members(int, timestamptz, uuid) from public, anon, authenticated;

-- refresh_cell_density: copied from 0004_orbit_onboarding.sql:918; only the world comparison changes.
create or replace function public.refresh_cell_density(p_as_of date default current_date)
returns int
language plpgsql
volatile
set search_path = public
as $$
declare
  v_rows int;
begin
  if p_as_of is null then
    raise exception 'invalid date' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('brivia.cell_density', 0));
  -- Global watermark: a refresh for a date that is not newer than the last one is a no-op.
  if exists (select 1 from public.cell_density where as_of >= p_as_of) then
    return 0;
  end if;
  with member as (
    select o.home_cell, o.home_cell_g6, o.home_cell_g5, public.brivia_in_test_world(p.id) as is_test, o.precision = 'cell' as is_cell,
           (p.created_at < (p_as_of - 14)::timestamptz
            and not exists (select 1 from public.member_flag f where f.member_id = p.id)
            and public.brivia_member_completed(p.id)) as counted
      from public.member_orbit o
      join public.profiles p on p.id = o.member_id
  ),
  counts as (  -- a 'place' member (a city pick, R2) is counted at g5 only, never at g7 or g6
    select c.cell, c.is_test, (count(*) filter (where c.counted))::int as n
      from (select home_cell as cell, is_test, counted and is_cell as counted from member
            union all select home_cell_g6, is_test, counted and is_cell from member
            union all select home_cell_g5, is_test, counted from member) c
     group by c.cell, c.is_test
  ),
  merged as (
    select coalesce(c.cell, d.cell) as cell, coalesce(c.is_test, d.is_test) as is_test, coalesce(c.n, 0) as n,
           -- a missed night (a gap of more than one day) restarts the streak
           case when p_as_of - d.as_of = 1 then d.streak10 else 0 end as old10,
           case when p_as_of - d.as_of = 1 then d.streak5 else 0 end as old5
      from counts c
      full join public.cell_density d on d.cell = c.cell and d.is_test = c.is_test
  ),
  nxt as (
    select cell, is_test, n,
           case when n >= 10 then old10 + 1 else 0 end as s10,
           case when n >= 5 then old5 + 1 else 0 end as s5
      from merged
  )
  insert into public.cell_density (cell, is_test, n, streak10, streak5, ok10, ok5, as_of)
  select cell, is_test, n, s10, s5, s10 >= 7, s5 >= 7, p_as_of from nxt
  on conflict (cell, is_test) do update
    set n = excluded.n, streak10 = excluded.streak10, streak5 = excluded.streak5,
        ok10 = excluded.ok10, ok5 = excluded.ok5, as_of = excluded.as_of;
  get diagnostics v_rows = row_count;
  -- An empty cell with no streak carries no information: drop it.
  delete from public.cell_density where n = 0 and streak10 = 0 and streak5 = 0;
  return v_rows;
end;
$$;
revoke all on function public.refresh_cell_density(date) from public, anon, authenticated;

-- brivia_can_message: copied from 0004_orbit_onboarding.sql:1312; only the world comparison changes.
create or replace function brivia_private.brivia_can_message(p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (select 1 from public.matches m
             where (m.user1_id = auth.uid() and m.user2_id = p_recipient)
                or (m.user1_id = p_recipient and m.user2_id = auth.uid()))
    and not public.brivia_pair_is_blocked(auth.uid(), p_recipient)
    and exists (select 1 from public.profiles a join public.profiles b on public.brivia_in_test_world(a.id) = public.brivia_in_test_world(b.id)
                 where a.id = auth.uid() and b.id = p_recipient),
    false);
$$;
revoke all on function brivia_private.brivia_can_message(uuid) from public, anon;
grant execute on function brivia_private.brivia_can_message(uuid) to authenticated;

-- my_outgoing_requests: copied from 0004_orbit_onboarding.sql:1376; only the world comparison changes.
create or replace function public.my_outgoing_requests()
returns table (to_id uuid, note text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.to_id, r.note,
         case when r.status = 'declined' then 'pending' else r.status end,
         r.created_at
  from public.connection_requests r
  join public.profiles me on me.id = auth.uid()
  join public.profiles p on p.id = r.to_id and public.brivia_in_test_world(p.id) = public.brivia_in_test_world(me.id)
  where r.from_id = auth.uid()
    and public.brivia_request_is_live(r.status, r.created_at)
  order by r.created_at desc, r.to_id;
$$;
revoke all on function public.my_outgoing_requests() from public, anon;
grant execute on function public.my_outgoing_requests() to authenticated;

-- deck_candidates: copied from 0004_orbit_onboarding.sql:1491; only the world comparison changes.
create or replace function public.deck_candidates(p_limit int default 12)
returns table(id uuid, name text, photo_url text, cover_url text, experience text, skills text[],
              looking_for text[], distance_band text, shared_interests text[])
language sql
volatile
security definer
set search_path = public
as $$
  with me as (
    select p.id, public.brivia_in_test_world(p.id) as in_test_world, o.home_cell, o.precision, vp.country, vp.lat as place_lat, vp.lng as place_lng,
           substring(o.home_cell from '^g7:(\d+):')::int as g7row
      from public.profiles p
      join public.member_orbit o on o.member_id = p.id and o.cell_scheme = 'grid1'
      join public.place vp on vp.id = o.place_id
     where p.id = auth.uid() and public.brivia_member_completed(p.id)
  ),
  near as (  -- cheap prefilters before the haversine: a fine pair is <= 15 km apart (at most 8 g7 rows), a place pair
             -- has place centroids <= 60 km apart (at most 0.54 deg of latitude). The CASE keeps a cell that is not a
             -- g7 grid1 id away from brivia_cell_km.
    select o.member_id as tid, tp.name as place_name, tp.country,
           case when me.precision = 'cell' and o.precision = 'cell' and o.home_cell ~ '^g7:'
                     and abs(substring(o.home_cell from '^g7:(\d+):')::int - me.g7row) <= 8
                     and public.brivia_cell_ok(o.home_cell, me.in_test_world, 10)
                then public.brivia_ring(public.brivia_cell_km(me.home_cell, o.home_cell)) end as fine_ring,
           public.brivia_haversine_km(me.place_lat, me.place_lng, tp.lat, tp.lng) as place_km
      from me
      join public.member_orbit o on o.member_id <> me.id and o.cell_scheme = 'grid1'
      join public.profiles t on t.id = o.member_id and public.brivia_in_test_world(t.id) = me.in_test_world
      join public.place tp on tp.id = o.place_id
     where abs(tp.lat - me.place_lat) <= 0.6
        or abs(coalesce(substring(o.home_cell from '^g7:(\d+):')::int, -100000) - me.g7row) <= 8
  ),
  pool as (  -- the two admission rules, then the cheap own-history checks; brivia_visible_to (the single rule) last
    select n.* from near n, me
     where (n.fine_ring <= 1 or n.place_km <= 60)
       and not exists (select 1 from public.matches m
                        where (m.user1_id = me.id and m.user2_id = n.tid) or (m.user1_id = n.tid and m.user2_id = me.id))
       and not exists (select 1 from public.signal_ledger l
                        where l.sender_id = me.id and l.to_id = n.tid and l.at > now() - interval '30 days')
       and not exists (select 1 from public.connection_requests r
                        where r.from_id = me.id and r.to_id = n.tid
                          and public.brivia_request_is_live(r.status, r.created_at))
       and not exists (select 1 from public.interaction i
                        where i.viewer_id = me.id and i.target_id = n.tid and i.event = 'pass'
                          and i.created_at > now() - interval '7 days')
       and public.brivia_visible_to(me.id, n.tid)
  ),
  shared as (
    select pool.tid, count(*)::int as n, sum(least(mv.points, mt.points))::numeric / 20 as overlap,
           (array_agg(nd.label order by mv.points + mt.points desc, nd.label))[1:2] as labels
      from pool
      join public.member_interest mt on mt.member_id = pool.tid
      join public.member_interest mv on mv.member_id = (select me.id from me) and mv.interest_id = mt.interest_id
      join public.interest_node nd on nd.id = mt.interest_id and nd.status = 'active' and not nd.sensitive
     group by pool.tid
  ),
  banded as (
    select pool.tid, pool.place_name, coalesce(s.n, 0) as shared_n, coalesce(s.overlap, 0) as overlap,
           -- the overlap in 4 levels (M-2): 0 none, 1 low (<= 0.25), 2 mid (<= 0.5), 3 high
           case when coalesce(s.overlap, 0) = 0 then 0 when s.overlap <= 0.25 then 1 when s.overlap <= 0.5 then 2
                else 3 end as overlap_level,
           coalesce(s.labels, '{}'::text[]) as labels,
           case when pool.fine_ring <= 1 then pool.fine_ring else 2 end as display_ring,
           pool.country is distinct from me.country as abroad,
           public.brivia_deck_tie(me.id, pool.tid, current_date) as tie
      from pool
      cross join me
      left join shared s on s.tid = pool.tid
  ),
  top as (
    select b.*, row_number() over (order by b.shared_n > 0 desc, b.display_ring, b.overlap_level desc, b.tie, b.tid) as pos
      from banded b
     order by pos
     limit greatest(1, least(coalesce(p_limit, 12), 20))
  ),
  logged as (  -- a data-modifying CTE always runs
    insert into public.interaction (viewer_id, target_id, event, context, propensity, model_version)
    select me.id, t.tid, 'impression',
           jsonb_build_object('policy', 'interim-v1', 'surface', 'deck', 'position', t.pos, 'ring', t.display_ring,
                              'overlap', round(t.overlap, 4), 'overlap_level', t.overlap_level, 'shared', t.shared_n),
           1, 'interim-v1'
      from top t cross join me
    on conflict (viewer_id, target_id, (context ->> 'surface'), ((created_at at time zone 'UTC')::date))
      where event = 'impression' do nothing
    returning 1
  )
  select p.id, p.name, p.photo_url, p.cover_url, p.experience, p.skills, p.looking_for,
         case
           when b.abroad then 'Abroad'
           when b.display_ring = 0 then '~3 km'
           when b.display_ring = 1 then '~10 km'
           else b.place_name
         end,
         b.labels
    from top b
    join public.profiles p on p.id = b.tid
   order by b.pos
$$;
revoke all on function public.deck_candidates(int) from public, anon;
grant execute on function public.deck_candidates(int) to authenticated;

-- deck_status: copied from 0004_orbit_onboarding.sql:1645; only the world comparison changes.
create or replace function public.deck_status()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.brivia_member_completed(auth.uid()) then 'complete_profile'
    when not exists (select 1 from public.profiles t
                      where public.brivia_in_test_world(t.id) = (select public.brivia_in_test_world(auth.uid()))
                        and public.brivia_visible_to(auth.uid(), t.id)) then 'no_members_yet'
    else 'caught_up'
  end
$$;
revoke all on function public.deck_status() from public, anon;
grant execute on function public.deck_status() to authenticated;

-- report_member: copied from 0005_p0b_dpdp_safety.sql:363; only the world comparison changes.
create or replace function public.report_member(p_target uuid, p_reason text, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_note text;
  v_world boolean;
  v_qual boolean;
  v_evidence jsonb;
begin
  perform 1 from public.profiles where id = uid for update;   -- also serialises this member's calls (the cap)
  if uid is null or not found then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  insert into public.report_attempt (reporter_id) values (uid);
  if (select count(*) from public.report_attempt where reporter_id = uid and at > now() - interval '24 hours') > 10 then
    raise exception 'report_cap' using errcode = 'PT429';
  end if;
  if p_reason is null or p_reason not in ('harassment', 'explicit', 'spam', 'fake', 'underage', 'safety', 'other') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  -- control characters (C0, DEL, C1), zero-width and bidi characters stripped; only newline and tab survive
  v_note := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[\x00-\x08\x0b-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069]', '', 'g'), E' \t\r\n'), '');
  if char_length(v_note) > 500 then
    raise exception 'note too long' using errcode = '22023';
  end if;
  if p_target is null or p_target = uid or not exists (select 1 from public.profiles where id = p_target) then
    return;
  end if;
  -- Qualification and evidence are read BEFORE the block: a block deletes the pair's pending requests (0003), which are
  -- one of the relations that qualify a report.
  select public.brivia_in_test_world(uid) = public.brivia_in_test_world(p_target)
    into v_world;
  v_qual := coalesce(v_world, false)
    and public.brivia_member_completed(uid)
    and (select created_at <= now() - interval '7 days' from public.profiles where id = uid)
    and (exists (select 1 from public.interaction i
                  where i.event <> 'impression'   -- impressions are written automatically by the deck and search
                    and ((i.viewer_id = uid and i.target_id = p_target) or (i.viewer_id = p_target and i.target_id = uid)))
         or exists (select 1 from public.connection_requests c
                     where (c.from_id = uid and c.to_id = p_target) or (c.from_id = p_target and c.to_id = uid))
         or exists (select 1 from public.matches m
                     where (m.user1_id = uid and m.user2_id = p_target) or (m.user1_id = p_target and m.user2_id = uid))
         or exists (select 1 from public.brivia_messages b
                     where (b.sender_id = uid and b.recipient_id = p_target) or (b.sender_id = p_target and b.recipient_id = uid)));
  select coalesce(jsonb_agg(e.j order by e.at desc), '[]'::jsonb) into v_evidence
    from (select m.created_at as at,
                 jsonb_build_object('from_me', m.sender_id = uid, 'body', m.body, 'kind', m.message_type,
                                    'attachment_path', m.attachment_path, 'at', m.created_at) as j
            from public.brivia_messages m
           where (m.sender_id = uid and m.recipient_id = p_target) or (m.sender_id = p_target and m.recipient_id = uid)
           order by m.created_at desc, m.id desc
           limit 50) e;
  -- a report always blocks, for any existing profile in either world (exactly what a direct block insert allows)
  insert into public.brivia_blocks (blocker_id, blocked_id) values (uid, p_target) on conflict do nothing;
  if exists (select 1 from public.member_report r
              where r.reporter_id = uid and r.target_id = p_target and r.created_at > now() - interval '24 hours') then
    return;
  end if;
  insert into public.member_report (reporter_id, target_id, reason, note, evidence, qualifying)
  values (uid, p_target, p_reason, v_note, v_evidence, v_qual);
  if v_qual then
    -- Serialise qualifying reports about one target (F8): two concurrent reports must not each count only themselves
    -- and both miss the 2-reporter threshold. The count below runs after the lock, on a fresh snapshot.
    perform pg_advisory_xact_lock(hashtext('report:' || p_target::text));
    if (select count(distinct r.reporter_id) from public.member_report r
         where r.target_id = p_target and r.qualifying and r.reporter_id is not null
           and r.created_at > now() - interval '30 days') >= 2 then
      insert into public.member_flag (member_id, reason, expires_at)
      values (p_target, 'reported', now() + interval '90 days') on conflict (member_id) do nothing;
    end if;
    if p_reason = 'underage' then
      insert into public.member_flag (member_id, reason, expires_at) values (p_target, 'suspended_pending_review', null)
      on conflict (member_id) do update
        set reason = 'suspended_pending_review', flagged_at = now(), expires_at = null
        where public.member_flag.reason in ('reported', 'rejoin_review');
    end if;
  end if;
end;
$$;
revoke all on function public.report_member(uuid, text, text) from public, anon;
grant execute on function public.report_member(uuid, text, text) to authenticated;


-- =============================================================================================
-- 3. Requests, matches and messages with a tester across worlds
-- =============================================================================================
-- A tester's world is not fixed: requests, matches and messages made before the switch can sit across worlds. While a
-- tester row exists and the tester sits across worlds from the other member, neither side can read the pair's match,
-- messages or pending requests, accept or decline the request, or learn of the match through send_signal. Everything
-- reappears unchanged when the row is deleted. After that the ex-tester is an ordinary real member: its rows with test
-- members are no longer hidden (it can read them and accept a pending request from a test member; brivia_can_message
-- still refuses messages) until the purge deletes the test members. Pairs without a tester keep their exact 0001-0006
-- behaviour, including a legacy cross-world match between a real and a test member (trust.test.sql I6).

-- brivia_pair_world_ok(a, b): false only when a or b is a tester and they are in different worlds. Internal.
create or replace function public.brivia_pair_world_ok(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.brivia_in_test_world(p_a) = public.brivia_in_test_world(p_b)
      or not exists (select 1 from public.brivia_tester t where t.member_id in (p_a, p_b))
$$;
revoke all on function public.brivia_pair_world_ok(uuid, uuid) from public, anon, authenticated;

-- brivia_private.brivia_pair_world_ok(p_user1, p_user2): the policy wrapper, pinned to the caller (it answers only when
-- the caller is one of the two members), in the non-exposed schema like the other wrappers (M-1).
create or replace function brivia_private.brivia_pair_world_ok(p_user1 uuid, p_user2 uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.uid() in (p_user1, p_user2) and public.brivia_pair_world_ok(p_user1, p_user2), false);
$$;
revoke all on function brivia_private.brivia_pair_world_ok(uuid, uuid) from public, anon;
grant execute on function brivia_private.brivia_pair_world_ok(uuid, uuid) to authenticated;

-- The two select policies, copied from 0006_perf_policies.sql:77 and :88 plus the rule. Delete (0006:82) is unchanged:
-- a DELETE with a WHERE clause also needs the row to pass the select policy.
drop policy if exists "Completed members can view their matches" on public.matches;
create policy "Completed members can view their matches"
  on public.matches for select to authenticated
  using ((select public.brivia_has_completed_profile()) and (select auth.uid()) in (user1_id, user2_id)
         and brivia_private.brivia_pair_world_ok(user1_id, user2_id));

drop policy if exists "Completed members can view their messages" on public.brivia_messages;
create policy "Completed members can view their messages"
  on public.brivia_messages for select to authenticated
  using ((select public.brivia_has_completed_profile()) and (select auth.uid()) in (sender_id, recipient_id)
         and brivia_private.brivia_pair_world_ok(sender_id, recipient_id));

-- brivia_incoming_request_visible (the incoming-request select policy, 0006_perf_policies.sql:66): copied from
-- 0004_orbit_onboarding.sql:1284; only the rule is added.
create or replace function brivia_private.brivia_incoming_request_visible(p_from uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.connection_requests r where r.from_id = p_from and r.to_id = auth.uid())
     and public.brivia_member_completed(p_from)
     and not public.brivia_pair_is_blocked(p_from, auth.uid())
     and public.brivia_pair_world_ok(p_from, auth.uid());
$$;
revoke all on function brivia_private.brivia_incoming_request_visible(uuid) from public, anon;
grant execute on function brivia_private.brivia_incoming_request_visible(uuid) to authenticated;

-- respond_connection_request: copied from 0004_orbit_onboarding.sql:1399; only the rule is added (no_data_found, like a
-- request that does not exist, for accept and decline alike).
create or replace function public.respond_connection_request(p_from uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_from is null or p_accept is null then
    raise exception 'no pending connection request' using errcode = 'no_data_found';
  end if;
  if not public.brivia_member_completed(me) then
    raise exception 'complete your profile' using errcode = '22023';
  end if;
  perform public.brivia_lock_pair(p_from, me);
  -- A request from a sender who is no longer completed is hidden by the select policy below, so it answers like
  -- one that does not exist (the like-back path, send_signal, writes nothing to such a member either).
  if not exists (
    select 1 from public.connection_requests
    where from_id = p_from and to_id = me and status = 'pending'
      and public.brivia_request_is_live(status, created_at)
  ) or not public.brivia_member_completed(p_from)
    or not public.brivia_pair_world_ok(p_from, me) then   -- 0008: a tester across worlds answers like a request that does not exist
    raise exception 'no pending connection request' using errcode = 'no_data_found';
  end if;
  if not p_accept or public.brivia_pair_is_blocked(p_from, me) then
    update public.connection_requests set status = 'declined' where from_id = p_from and to_id = me;
    return;
  end if;
  update public.connection_requests set status = 'accepted'
   where (from_id = p_from and to_id = me) or (from_id = me and to_id = p_from and status = 'pending');
  perform public.brivia_create_match(p_from, me);
end;
$$;
revoke all on function public.respond_connection_request(uuid, boolean) from public, anon;
grant execute on function public.respond_connection_request(uuid, boolean) to authenticated;

-- send_signal: copied from 0004_orbit_onboarding.sql:1100; only the 'matched' check gains the rule (and its comment).
create or replace function public.send_signal(p_to uuid, p_note text default null)
returns table(status text, remaining int, resets_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  s record;
  v_status text := 'sent';
begin
  -- 1. Caller checks (the caller's own state and input: honest, not charged).
  if me is null or not public.brivia_member_completed(me) then
    raise exception 'complete your profile' using errcode = '22023';
  end if;
  if p_to is null or p_to = me then
    raise exception 'invalid signal' using errcode = '22023';
  end if;
  if char_length(p_note) > 500 then
    raise exception 'note too long' using errcode = '22001';
  end if;
  -- 2. One send per sender at a time (parallel sends cannot overshoot the caps), then the pair lock, so a
  --    concurrent reverse request is seen by the completion check below.
  perform pg_advisory_xact_lock(hashtextextended('brivia_request_caps:' || me::text, 0));
  perform public.brivia_lock_pair(me, p_to);
  -- 3. Quota.
  select * into s from public.brivia_signal_state(me);
  if s.used >= s.daily_limit or s.live_unanswered >= s.live_limit then
    if not (public.brivia_visible_to(me, p_to)
            and exists (select 1 from public.connection_requests r
                         where r.from_id = p_to and r.to_id = me and r.status in ('pending', 'declined')
                           and public.brivia_request_is_live(r.status, r.created_at))) then
      if s.used >= s.daily_limit then
        raise exception 'signal_quota_exhausted' using errcode = 'PT429';
      end if;
      raise exception 'signal_live_cap' using errcode = 'PT429';
    end if;
  end if;
  -- 4. Charge, before anything about the recipient is looked at.
  insert into public.signal_ledger (sender_id, to_id) values (me, p_to);
  -- 5. Recipient side: every outcome below answers the same way. Only a visible target gets a request row, so a
  --    NEW match can only come from this branch (the completion trigger).
  if public.brivia_visible_to(me, p_to) then
    begin
      insert into public.connection_requests (from_id, to_id, note) values (me, p_to, p_note);
    exception when unique_violation or foreign_key_violation then
      null;  -- a live earlier request (pending or declined) or a recipient that just vanished: still 'sent'
    end;
  end if;
  -- 'matched' reflects a match row the sender can already read, whatever the partner's state now (blocked, other
  -- world, no longer completed). Checking it only on the visible path would leak a block or a completion change.
  -- 0008: a match with a tester across worlds is not readable (the matches select policy), so it answers 'sent'.
  if exists (select 1 from public.matches m
              where (m.user1_id = me and m.user2_id = p_to) or (m.user1_id = p_to and m.user2_id = me))
     and public.brivia_pair_world_ok(me, p_to) then
    v_status := 'matched';
  end if;
  -- 6. No interaction row. 7. The post-charge quota.
  select * into s from public.brivia_signal_state(me);
  return query select v_status, greatest(s.daily_limit - s.used, 0), s.resets_at;
end;
$$;
revoke all on function public.send_signal(uuid, text) from public, anon;
grant execute on function public.send_signal(uuid, text) to authenticated;
