set lock_timeout = '5s';
-- 0079_unlimited_swipes.sql (D-261, founder 2026-11-14: "give yashika and golu unlimited swipes access"). Apply after
-- 0078 (README "## 0079"), then deploy the client. 0001-0078 are frozen. Idempotent.
--
-- A private allow-list of members whose swipes are not capped. For them:
--   * brivia_signal_state returns a daily limit and a live (unanswered requests) limit of 100000, so send_signal, the
--     Pass cap trigger and my_signal_quota never block them;
--   * brivia_companion_state returns a daily limit of 100000, so companion_swipe never blocks them.
-- Everyone else is unchanged. Members cannot read or write the list; it is granted in the SQL editor:
--   insert into brivia_private.unlimited_swipes (member_id, note) values ('<profile id>', 'why') on conflict do nothing;
-- and taken away with a delete. The app shows "Unlimited swipes" when the limit is 100000 or more.

create table if not exists brivia_private.unlimited_swipes (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  note text,
  granted_at timestamptz not null default now()
);
alter table brivia_private.unlimited_swipes enable row level security;
revoke all on brivia_private.unlimited_swipes from public, anon, authenticated;

create or replace function public.brivia_signal_state(p_sender uuid)
returns table(daily_limit integer, used integer, resets_at timestamptz, live_unanswered integer, live_limit integer)
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
  ), free as (
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

create or replace function public.brivia_companion_state(p_actor uuid)
returns table(daily_limit integer, used integer, resets_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select case when exists (select 1 from brivia_private.unlimited_swipes u where u.member_id = p_actor) then 100000
              else public.brivia_config_int('companion_swipe_daily_limit', 10) end,
         (select count(*)::int from public.event_companion_swipe s
           where s.actor_id = p_actor and s.created_at > now() - interval '24 hours'),
         (select case when date_trunc('hour', t) = t then t else date_trunc('hour', t) + interval '1 hour' end
            from (select min(s.created_at) + interval '24 hours' as t from public.event_companion_swipe s
                   where s.actor_id = p_actor and s.created_at > now() - interval '24 hours') o
           where t is not null)
$$;
revoke all on function public.brivia_signal_state(uuid) from public, anon, authenticated;
revoke all on function public.brivia_companion_state(uuid) from public, anon, authenticated;
