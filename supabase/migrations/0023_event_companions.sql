set lock_timeout = '5s';
-- 0023_event_companions.sql: Find a Companion, event-based matching (founder request 2026-11-02, D-123). Members who
-- registered for an event and opted in ("Looking for a companion?", 0020/0022 event_rsvp.wants_companion) see one
-- another as swipeable cards for THAT event: right is "I'd like to go together", left passes. Two rights make a match
-- for the event and a Brivia connection (matches), so Brivia Chat opens; both are told.
-- Applied by hand in the Supabase SQL editor, as postgres, after 0022 (README "## 0023"). Needs 0020 and 0022.
-- Idempotent: the local harness applies every migration twice.
--
-- Rules (CLAUDE.md, ORBIT §11.2):
--   * Mutual consent: one right swipe never creates anything visible to the other member. A match exists only when
--     both swiped right for the same event. The connection is the ordinary one (brivia_create_match), so it is the
--     same as an accepted request everywhere else (chat, unmatch, block).
--   * Per event: swipes, passes and matches are keyed by event. A pass hides the member in that event's deck only.
--   * Who appears: members with a CONFIRMED registration who opted in, whom the caller can see (brivia_visible_to:
--     same world, no block, both completed), not the caller, not already swiped by the caller for the event, not
--     already a connection. The caller must be confirmed and opted in too (otherwise no rows).
--   * Privacy: no swipe is readable by anyone (RLS on, no grants; definer functions only). A member never learns who
--     passed, or who liked them before they like back. Location is the deck's own band ('~3 km', '~10 km', the
--     place name, 'Abroad'); never a cell, km, coordinate, city text, email or phone.
--
-- What changes:
--   1. event_companion_swipe(event_id, actor_id, target_id, liked): one decision per member, candidate and event
--      (primary key; a second swipe changes nothing).
--   2. event_companion_match(event_id, user1_id < user2_id, seen flags): one match per pair per event (unique).
--   3. companion_events(), companion_deck(p_event, p_limit), companion_swipe(p_event, p_target, p_like),
--      my_companion_matches(), mark_companion_match_seen(p_match): authenticated only.

-- 1. Swipes -------------------------------------------------------------------------------------------------------------
create table if not exists public.event_companion_swipe (
  event_id uuid not null references public.club_event(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (event_id, actor_id, target_id),
  constraint event_companion_swipe_not_self check (actor_id <> target_id)
);
create index if not exists event_companion_swipe_target_idx on public.event_companion_swipe (event_id, target_id) where liked;
create index if not exists event_companion_swipe_actor_idx on public.event_companion_swipe (actor_id);
alter table public.event_companion_swipe enable row level security;
revoke all on public.event_companion_swipe from public, anon, authenticated;

-- 2. Matches ------------------------------------------------------------------------------------------------------------
create table if not exists public.event_companion_match (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.club_event(id) on delete cascade,
  user1_id uuid not null references public.profiles(id) on delete cascade,
  user2_id uuid not null references public.profiles(id) on delete cascade,
  seen_by_user1 boolean not null default false,
  seen_by_user2 boolean not null default false,
  created_at timestamptz not null default now(),
  constraint event_companion_match_order check (user1_id < user2_id),
  constraint event_companion_match_unique unique (event_id, user1_id, user2_id)
);
create index if not exists event_companion_match_user1_idx on public.event_companion_match (user1_id);
create index if not exists event_companion_match_user2_idx on public.event_companion_match (user2_id);
alter table public.event_companion_match enable row level security;
revoke all on public.event_companion_match from public, anon, authenticated;

-- 3. Functions ----------------------------------------------------------------------------------------------------------
-- A member is in an event's companion pool: a confirmed registration that wants a companion, on a published, open,
-- not cancelled event.
create or replace function public.brivia_companion_eligible(p_event uuid, p_member uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.event_rsvp r join public.club_event e on e.id = r.event_id
                  where r.event_id = p_event and r.member_id = p_member and r.wants_companion and r.status = 'confirmed'
                    and e.is_published and e.cancelled_at is null and public.brivia_event_open(e.starts_at, e.ends_at))
$$;
revoke all on function public.brivia_companion_eligible(uuid, uuid) from public, anon, authenticated;

create or replace function public.brivia_is_connection(p_a uuid, p_b uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.matches m
                  where (m.user1_id = p_a and m.user2_id = p_b) or (m.user1_id = p_b and m.user2_id = p_a))
$$;
revoke all on function public.brivia_is_connection(uuid, uuid) from public, anon, authenticated;

-- companion_events(): the events the caller is looking for company at, soonest first, with how many people are left
-- to see in each (opted-in, confirmed, visible, not yet swiped, not already a connection).
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
           where r.event_id = e.id and r.member_id <> me.id and r.wants_companion and r.status = 'confirmed'
             and public.brivia_visible_to(me.id, r.member_id)
             and not public.brivia_is_connection(me.id, r.member_id)
             and not exists (select 1 from public.event_companion_swipe s
                              where s.event_id = e.id and s.actor_id = me.id and s.target_id = r.member_id))
    from me join public.club_event e on public.brivia_companion_eligible(e.id, me.id)
   order by e.starts_at, e.id
   limit 50
$$;
revoke all on function public.companion_events() from public, anon;
grant execute on function public.companion_events() to authenticated;

-- companion_deck(p_event, p_limit): the cards for one event (rules above), most shared interests first, then shared
-- goals and skills, then who opted in first. interests: up to 4 of the member's interest labels, shared ones first;
-- shared_interests: the shared labels (up to 4). distance_band as the Connect deck. No rows unless the caller is in
-- the event's pool.
create or replace function public.companion_deck(p_event uuid, p_limit int default 20)
returns table(member_id uuid, name text, photo_url text, cover_url text, headline text, looking_for text[],
              interests text[], shared_interests text[], distance_band text, shared_count int)
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
           o.home_cell, pl.name as place_name, pl.country
      from me
      join public.event_rsvp r on r.event_id = p_event and r.member_id <> me.id and r.wants_companion and r.status = 'confirmed'
      join public.profiles p on p.id = r.member_id
      left join public.member_orbit o on o.member_id = p.id
      left join public.place pl on pl.id = o.place_id
     where public.brivia_visible_to(me.id, p.id)
       and not public.brivia_is_connection(me.id, p.id)
       and not exists (select 1 from public.event_companion_swipe s
                        where s.event_id = p_event and s.actor_id = me.id and s.target_id = p.id)),
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
         s.interests, s.shared[1:4], s.band, cardinality(s.shared)
    from scored s
   order by cardinality(s.shared) desc, s.background desc, s.opted_at, s.id
   limit greatest(1, least(coalesce(p_limit, 20), 50))
$$;
revoke all on function public.companion_deck(uuid, int) from public, anon;
grant execute on function public.companion_deck(uuid, int) to authenticated;

-- companion_swipe(p_event, p_target, p_like) -> (matched, match_id). Both must be in the event's pool and visible to
-- each other ('not available', 22023). One decision per pair and event: a repeat keeps the first and answers the
-- current state. A like that meets the other's like makes the event match and the Brivia connection, under the pair
-- lock (two simultaneous likes make one match).
create or replace function public.companion_swipe(p_event uuid, p_target uuid, p_like boolean)
returns table(matched boolean, match_id uuid)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_match uuid;
begin
  if me is null or not public.brivia_member_completed(me) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  if p_target is null or p_target = me or p_like is null then
    raise exception 'invalid swipe' using errcode = '22023';
  end if;
  if not public.brivia_companion_eligible(p_event, me) then
    raise exception 'not looking' using errcode = '22023';
  end if;
  perform public.brivia_lock_pair(me, p_target);
  if not public.brivia_companion_eligible(p_event, p_target) or not public.brivia_visible_to(me, p_target) then
    raise exception 'not available' using errcode = '22023';
  end if;
  insert into public.event_companion_swipe (event_id, actor_id, target_id, liked)
  values (p_event, me, p_target, p_like)
  on conflict (event_id, actor_id, target_id) do nothing;
  if exists (select 1 from public.event_companion_swipe s
              where s.event_id = p_event and s.actor_id = me and s.target_id = p_target and s.liked)
     and exists (select 1 from public.event_companion_swipe s
                  where s.event_id = p_event and s.actor_id = p_target and s.target_id = me and s.liked) then
    insert into public.event_companion_match (event_id, user1_id, user2_id, seen_by_user1, seen_by_user2)
    values (p_event, least(me, p_target), greatest(me, p_target), least(me, p_target) = me, greatest(me, p_target) = me)
    on conflict (event_id, user1_id, user2_id) do nothing;
    perform public.brivia_create_match(me, p_target);
    select m.id into v_match from public.event_companion_match m
     where m.event_id = p_event and m.user1_id = least(me, p_target) and m.user2_id = greatest(me, p_target);
    return query select true, v_match;
    return;
  end if;
  return query select false, null::uuid;
end;
$$;
revoke all on function public.companion_swipe(uuid, uuid, boolean) from public, anon;
grant execute on function public.companion_swipe(uuid, uuid, boolean) to authenticated;

-- my_companion_matches(): the caller's event matches, newest first (at most 50), with the event (title, date, venue)
-- and the other member (id, name, photo). seen: the caller has seen the "going together" moment. Only matches whose
-- other member the caller can still see.
create or replace function public.my_companion_matches()
returns table(match_id uuid, event_id uuid, event_title text, starts_at timestamptz, venue_name text, other_id uuid,
              other_name text, other_photo_url text, created_at timestamptz, seen boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, e.id, e.title, e.starts_at, e.venue_name, p.id, p.name, p.photo_url, m.created_at,
         case when m.user1_id = auth.uid() then m.seen_by_user1 else m.seen_by_user2 end
    from public.event_companion_match m
    join public.club_event e on e.id = m.event_id
    join public.profiles p on p.id = case when m.user1_id = auth.uid() then m.user2_id else m.user1_id end
   where auth.uid() is not null and auth.uid() in (m.user1_id, m.user2_id)
     and public.brivia_visible_to(auth.uid(), p.id)
   order by m.created_at desc
   limit 50
$$;
revoke all on function public.my_companion_matches() from public, anon;
grant execute on function public.my_companion_matches() to authenticated;

create or replace function public.mark_companion_match_seen(p_match uuid)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  update public.event_companion_match m
     set seen_by_user1 = case when m.user1_id = auth.uid() then true else m.seen_by_user1 end,
         seen_by_user2 = case when m.user2_id = auth.uid() then true else m.seen_by_user2 end
   where m.id = p_match and auth.uid() in (m.user1_id, m.user2_id)
  returning true
$$;
revoke all on function public.mark_companion_match_seen(uuid) from public, anon;
grant execute on function public.mark_companion_match_seen(uuid) to authenticated;
