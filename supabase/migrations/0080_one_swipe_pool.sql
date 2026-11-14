set lock_timeout = '5s';
-- 0080_one_swipe_pool.sql (D-263, founder 2026-11-14: "only yashika and golu have unlimited swipes, all the others must
-- have only 10 swipes per day in total"). Apply after 0079 (README "## 0080"). 0001-0079 are frozen. Idempotent.
--
-- Before: 10 deck swipes (a Pitch or a Pass, 0045) AND a separate 10 event-companion swipes, so 20 a day.
-- Now one pool: deck Pitches, deck Passes (one per person per 24 h, as before) and companion swipes (one per event and
-- person, as before) all count against signal_daily_limit (10), rolling 24 h. Members on
-- brivia_private.unlimited_swipes (0079) still have no cap. The live cap on unanswered requests (100) is unchanged.
--   * brivia_private.brivia_swipe_times(member): every counted swipe in the last 24 h.
--   * brivia_signal_state and brivia_companion_state both read that one count and limit, so the deck and the
--     companions page show the same "N of 10 swipes left today".
--   * companion_swipe takes the same per-member lock as send_signal and the Pass trigger, so a deck swipe and a
--     companion swipe at the same moment cannot both take the last one.

create or replace function brivia_private.brivia_swipe_times(p_member uuid)
returns table(at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select l.at from public.signal_ledger l
   where l.sender_id = p_member and l.kind = 'signal' and l.at > now() - interval '24 hours'
  union all
  select min(i.created_at) from public.interaction i
   where i.viewer_id = p_member and i.event = 'pass' and i.created_at > now() - interval '24 hours'
   group by i.target_id
  union all
  select s.created_at from public.event_companion_swipe s
   where s.actor_id = p_member and s.created_at > now() - interval '24 hours'
$$;
revoke all on function brivia_private.brivia_swipe_times(uuid) from public, anon, authenticated;

create or replace function public.brivia_signal_state(p_sender uuid)
returns table(daily_limit integer, used integer, resets_at timestamptz, live_unanswered integer, live_limit integer)
language sql
stable
security definer
set search_path = public
as $$
  with swipes as (select t.at from brivia_private.brivia_swipe_times(p_sender) t),
  free as (
    select exists (select 1 from brivia_private.unlimited_swipes u where u.member_id = p_sender) as unlimited
  )
  select case when (select unlimited from free) then 100000 else public.brivia_config_int('signal_daily_limit', 30) end,
         (select count(*)::int from swipes),
         (select case when date_trunc('hour', t) = t then t else date_trunc('hour', t) + interval '1 hour' end
            from (select min(s.at) + interval '24 hours' as t from swipes s) o
           where t is not null),
         (select count(distinct l.to_id)::int from public.signal_ledger l
           where l.sender_id = p_sender and l.at > now() - interval '30 days'
             and not exists (select 1 from public.matches m
                              where (m.user1_id = p_sender and m.user2_id = l.to_id)
                                 or (m.user1_id = l.to_id and m.user2_id = p_sender))),
         case when (select unlimited from free) then 100000 else public.brivia_config_int('signal_live_limit', 100) end
$$;
revoke all on function public.brivia_signal_state(uuid) from public, anon, authenticated;

create or replace function public.brivia_companion_state(p_actor uuid)
returns table(daily_limit integer, used integer, resets_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.daily_limit, s.used, s.resets_at from public.brivia_signal_state(p_actor) s
$$;
revoke all on function public.brivia_companion_state(uuid) from public, anon, authenticated;

create or replace function public.companion_swipe(p_event uuid, p_target uuid, p_like boolean)
returns table(matched boolean, match_id uuid)
language plpgsql
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
  -- D-263: the same lock as send_signal and the Pass trigger (one pool).
  perform pg_advisory_xact_lock(hashtextextended('brivia_request_caps:' || me::text, 0));
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

insert into public.brivia_config (key, value) values ('signal_daily_limit', '10')
on conflict (key) do update set value = excluded.value;
