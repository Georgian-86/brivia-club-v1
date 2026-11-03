set lock_timeout = '5s';
-- 0045_daily_swipes_dj.sql: 10 free swipes a day on the deck and 10 on Find my companion, and "DJ" in the founder's
-- wording (founder request 2026-11-04, D-156: "allow only 10 free swipes a day and for event find my companion also
-- 10 swipes max per day"; "i want this complete list of interests, nothing must be left"). Applied after 0044 (README
-- "## 0045"). 0001-0044 are frozen. Idempotent: the local harness applies every migration twice.
--
-- 1. Deck swipes. A swipe is a Pass or a Pitch on the deck. The daily signal quota (0004 brivia_signal_state, read by
--    my_signal_quota and enforced by send_signal) now counts both: used = signals sent in the last 24 h + distinct
--    members passed in the last 24 h. The limit stays the private config key signal_daily_limit, now set to 10 (a row
--    in brivia_config; the founder changes it in the SQL editor without a migration). A pass over the cap is refused
--    by a trigger on interaction (PT429 'swipe_quota_exhausted', not stored). A request that completes a match is
--    still never refused (0004 rule), and passing the same member twice in a day costs one swipe.
-- 2. Find my companion: at most 10 companion swipes (left or right, all events together) per rolling 24 h. Config key
--    companion_swipe_daily_limit (10). companion_swipe raises PT429 'companion_swipe_quota' over the cap (re-swiping
--    someone already swiped is free and changes nothing); my_companion_quota() answers { daily_limit, remaining,
--    resets_at } for the counter.
-- 3. "DJing" reads "DJ" (the founder's list); id unchanged, catalog_order recomputed A-Z as in 0031.

-- 1 + 2. The limits, as private config rows (0004: brivia_config, owner only). An existing row is kept.
insert into public.brivia_config (key, value) values ('signal_daily_limit', '10'), ('companion_swipe_daily_limit', '10')
on conflict (key) do nothing;

-- 1. The quota state: 0004's function with "used" and "resets_at" over signals and passes. Copied from
--    0004_orbit_onboarding.sql (brivia_signal_state); the live and limit columns are unchanged.
create or replace function public.brivia_signal_state(p_sender uuid)
returns table(daily_limit int, used int, resets_at timestamptz, live_unanswered int, live_limit int)
language sql
stable
security definer
set search_path = public
as $$
  with swipes as (
    select l.at from public.signal_ledger l
     where l.sender_id = p_sender and l.kind = 'signal' and l.at > now() - interval '24 hours'
    union all
    select min(i.created_at) from public.interaction i
     where i.viewer_id = p_sender and i.event = 'pass' and i.created_at > now() - interval '24 hours'
     group by i.target_id
  )
  select public.brivia_config_int('signal_daily_limit', 30),
         (select count(*)::int from swipes),
         (select case when date_trunc('hour', t) = t then t else date_trunc('hour', t) + interval '1 hour' end
            from (select min(s.at) + interval '24 hours' as t from swipes s) o
           where t is not null),
         (select count(distinct l.to_id)::int from public.signal_ledger l
           where l.sender_id = p_sender and l.at > now() - interval '30 days'
             and not exists (select 1 from public.matches m
                              where (m.user1_id = p_sender and m.user2_id = l.to_id)
                                 or (m.user1_id = l.to_id and m.user2_id = p_sender))),
         public.brivia_config_int('signal_live_limit', 100)
$$;
revoke all on function public.brivia_signal_state(uuid) from public, anon, authenticated;

-- A member's own pass over the daily cap is refused. Fires after brivia_interaction_served (trigger names run in
-- alphabetical order), so a pass that trigger drops is never charged. Same sender lock as send_signal, so a pass and a
-- signal at the same moment cannot overshoot. A second pass on someone already passed today is free.
create or replace function public.brivia_interaction_swipe_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare s record;
begin
  if new.event <> 'pass' or new.viewer_id is distinct from auth.uid() then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('brivia_request_caps:' || new.viewer_id::text, 0));
  if exists (select 1 from public.interaction i
              where i.viewer_id = new.viewer_id and i.target_id = new.target_id and i.event = 'pass'
                and i.created_at > now() - interval '24 hours') then
    return new;
  end if;
  select * into s from public.brivia_signal_state(new.viewer_id);
  if s.used >= s.daily_limit then
    raise exception 'swipe_quota_exhausted' using errcode = 'PT429';
  end if;
  return new;
end;
$$;
revoke all on function public.brivia_interaction_swipe_cap() from public, anon, authenticated;
drop trigger if exists brivia_interaction_swipe_cap on public.interaction;
create trigger brivia_interaction_swipe_cap
  before insert on public.interaction
  for each row execute function public.brivia_interaction_swipe_cap();
create index if not exists interaction_viewer_pass_idx on public.interaction (viewer_id, created_at) where event = 'pass';

-- 2. Companion swipes: the caller's state over the last 24 h, all events together.
create or replace function public.brivia_companion_state(p_actor uuid)
returns table(daily_limit int, used int, resets_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select public.brivia_config_int('companion_swipe_daily_limit', 10),
         (select count(*)::int from public.event_companion_swipe s
           where s.actor_id = p_actor and s.created_at > now() - interval '24 hours'),
         (select case when date_trunc('hour', t) = t then t else date_trunc('hour', t) + interval '1 hour' end
            from (select min(s.created_at) + interval '24 hours' as t from public.event_companion_swipe s
                   where s.actor_id = p_actor and s.created_at > now() - interval '24 hours') o
           where t is not null)
$$;
revoke all on function public.brivia_companion_state(uuid) from public, anon, authenticated;
create index if not exists event_companion_swipe_actor_at_idx on public.event_companion_swipe (actor_id, created_at);

-- my_companion_quota(): the caller's own companion quota (one row; none without a session).
create or replace function public.my_companion_quota()
returns table(daily_limit int, remaining int, resets_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.daily_limit, greatest(s.daily_limit - s.used, 0), s.resets_at
    from public.brivia_companion_state(auth.uid()) s
   where auth.uid() is not null
$$;
revoke all on function public.my_companion_quota() from public, anon;
grant execute on function public.my_companion_quota() to authenticated;

-- companion_swipe: copied from 0023_event_companions.sql; only the daily cap (and its lock) is added before the insert.
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
  q record;
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
  -- 0045: one companion swipe per member at a time, then the daily cap (a repeat swipe is free: it inserts nothing).
  perform pg_advisory_xact_lock(hashtextextended('brivia_companion_caps:' || me::text, 0));
  if not exists (select 1 from public.event_companion_swipe s
                  where s.event_id = p_event and s.actor_id = me and s.target_id = p_target) then
    select * into q from public.brivia_companion_state(me);
    if q.used >= q.daily_limit then
      raise exception 'companion_swipe_quota' using errcode = 'PT429';
    end if;
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

-- 3. "DJ", as the founder wrote it (only while the label still reads as 0017 left it).
update public.interest_node set label = 'DJ' where id = 'music.making.djing' and label = 'DJing';
with ordered as (
  select id, row_number() over (order by lower(label), id) as ord
    from public.interest_node where catalog_order is not null
)
update public.interest_node n set catalog_order = o.ord
  from ordered o
 where n.id = o.id and n.catalog_order is distinct from o.ord;
