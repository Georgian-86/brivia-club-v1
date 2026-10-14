-- 0010_open_test_world.sql: one owner switch that opens the test world to every member (founder, 2026-10-14:
-- "let test members also appear in the registered people deck for now"). D-059.
--
-- While public.brivia_world_switch.open_test_world is true, every member with a profile is in the test world, so real
-- members, testers and seeded test members all see one another in the deck, search, candidates, requests, matches,
-- messages and posts. Nothing else changes: matching stays mutual-consent, location stays coarse, and the purge still
-- deletes only is_test members.
--   * Off by default. The founder turns it on and off in the SQL editor:
--       update public.brivia_world_switch set open_test_world = true,  changed_at = now();   -- open
--       update public.brivia_world_switch set open_test_world = false, changed_at = now();   -- close
--     `select public.refresh_cell_density();` is a no-op if that night's run already happened (0008's global
--     watermark: a date not newer than the last run returns 0), so the ~3 km / ~10 km bands do not change at once;
--     they follow the next nightly runs and the 7-night hysteresis.
--   * Density while open: cell_density is keyed by brivia_in_test_world, so every member counts in the open world's
--     cells and seeded test members count toward a real member's 10-member floor. The real-world cells get no
--     members, so their streaks reset; after closing, real members have no ~3 km / ~10 km band for at least 7 nights.
--     Close within 6 nights, so no band is ever earned on test members. (Backlog: 0011 keys density on
--     brivia_tester_world, so is_test members never satisfy a real member's floor.)
--   * "Why this person?" (deck_why) stays limited to testers and test members: the open world does not show real
--     members the ranking keys. Only that gate is redefined below; deck_why is otherwise copied verbatim from 0008.
--   * After closing: a real member's requests, matches and messages with test members stay readable (0008 hides
--     cross-world pairs only when a tester is on one side) until the purge deletes the test members.
-- Idempotent; owner-only; no client role can read or change the switch.

create table if not exists public.brivia_world_switch (
  id boolean primary key default true check (id),
  open_test_world boolean not null default false,
  changed_at timestamptz not null default now()
);
alter table public.brivia_world_switch enable row level security;
revoke all on public.brivia_world_switch from public, anon, authenticated;
insert into public.brivia_world_switch (id) values (true) on conflict (id) do nothing;

-- brivia_test_world_open(): is the switch on? Internal.
create or replace function public.brivia_test_world_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.open_test_world from public.brivia_world_switch s where s.id), false)
$$;
revoke all on function public.brivia_test_world_open() from public, anon, authenticated;

-- brivia_tester_world(p_id): 0008's brivia_in_test_world, unchanged (is_test, or a brivia_tester row). Internal.
create or replace function public.brivia_tester_world(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_test from public.profiles p where p.id = p_id), false)
      or exists (select 1 from public.brivia_tester t where t.member_id = p_id)
$$;
revoke all on function public.brivia_tester_world(uuid) from public, anon, authenticated;

-- brivia_in_test_world(p_id): as 0008, or any existing profile while the switch is open. An unknown id is still false.
create or replace function public.brivia_in_test_world(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.brivia_tester_world(p_id)
      or (public.brivia_test_world_open() and exists (select 1 from public.profiles p where p.id = p_id))
$$;
revoke all on function public.brivia_in_test_world(uuid) from public, anon, authenticated;

-- deck_why: copied from 0008_tester_world.sql; only the caller gate changes from brivia_in_test_world to
-- brivia_tester_world, so the open world never sends ranking keys to a real member's client.
create or replace function public.deck_why(p_target uuid)
returns table(shared_interests text[], distance_band text, rank_keys jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select p.id, public.brivia_in_test_world(p.id) as in_test_world, o.home_cell, o.precision, vp.country, vp.lat as place_lat, vp.lng as place_lng,
           substring(o.home_cell from '^g7:(\d+):')::int as g7row
      from public.profiles p
      join public.member_orbit o on o.member_id = p.id and o.cell_scheme = 'grid1'
      join public.place vp on vp.id = o.place_id
     where p.id = auth.uid() and public.brivia_member_completed(p.id) and public.brivia_tester_world(p.id)
  ),
  near as (  -- deck_candidates' near, for the one target
    select o.member_id as tid, tp.name as place_name, tp.country,
           case when me.precision = 'cell' and o.precision = 'cell' and o.home_cell ~ '^g7:'
                     and abs(substring(o.home_cell from '^g7:(\d+):')::int - me.g7row) <= 8
                     and public.brivia_cell_ok(o.home_cell, me.in_test_world, 10)
                then public.brivia_ring(public.brivia_cell_km(me.home_cell, o.home_cell)) end as fine_ring,
           public.brivia_haversine_km(me.place_lat, me.place_lng, tp.lat, tp.lng) as place_km
      from me
      join public.member_orbit o on o.member_id = p_target and o.member_id <> me.id and o.cell_scheme = 'grid1'
      join public.profiles t on t.id = o.member_id and public.brivia_in_test_world(t.id) = me.in_test_world
      join public.place tp on tp.id = o.place_id
  ),
  pool as (  -- deck_candidates' admission rules and the single visibility rule (not its own-history hides)
    select n.* from near n, me
     where (n.fine_ring <= 1 or n.place_km <= 60)
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
    select pool.tid, pool.place_name, coalesce(s.n, 0) as shared_n,
           case when coalesce(s.overlap, 0) = 0 then 0 when s.overlap <= 0.25 then 1 when s.overlap <= 0.5 then 2
                else 3 end as overlap_level,
           coalesce(s.labels, '{}'::text[]) as labels,
           case when pool.fine_ring <= 1 then pool.fine_ring else 2 end as display_ring,
           pool.country is distinct from me.country as abroad
      from pool
      cross join me
      left join shared s on s.tid = pool.tid
  )
  select b.labels,
         case
           when b.abroad then 'Abroad'
           when b.display_ring = 0 then '~3 km'
           when b.display_ring = 1 then '~10 km'
           else b.place_name
         end,
         jsonb_build_object('has_shared', b.shared_n > 0, 'shared_count', b.shared_n, 'ring', b.display_ring,
                            'overlap_level', b.overlap_level, 'tie_break', 'daily')
    from banded b
$$;
revoke all on function public.deck_why(uuid) from public, anon;
grant execute on function public.deck_why(uuid) to authenticated;
