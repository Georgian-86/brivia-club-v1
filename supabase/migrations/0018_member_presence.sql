set lock_timeout = '5s';
-- 0018_member_presence.sql: "Active now" for connections in chat (founder request 2026-10-29, D-110).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0017 (see README.md "## 0018"). 0001-0017 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- What changes (shown to connections only, with an opt-out that works both ways; founder, 2026-10-29):
--   1. member_presence(member_id, last_seen_at, visible): one row per member, RLS on, no grants (read and written only
--      through the functions below). Deleted with the profile.
--   2. touch_presence(): the caller's own row, written at most once per 30 s (the app calls it on load, every 60 s while
--      the tab is visible, and on focus).
--   3. connection_presence(p_ids): one row per id that is the caller's match: active = both members' switch is on, the
--      pair is not blocked, both are in the same world, and the other member was seen within 3 minutes. Never returns a time. At most 100 ids.
--   4. set_presence_visible(p_visible) / my_presence_visible(): the "Show when I'm active" switch (default on). Off hides
--      the member from others and others from the member.
create table if not exists public.member_presence (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  visible boolean not null default true
);
alter table public.member_presence enable row level security;
revoke all on public.member_presence from public, anon, authenticated;

create or replace function public.touch_presence()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  insert into public.member_presence (member_id, last_seen_at) values (uid, now())
  on conflict (member_id) do update set last_seen_at = excluded.last_seen_at
   where public.member_presence.last_seen_at < now() - interval '30 seconds';
end;
$$;
revoke all on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

create or replace function public.connection_presence(p_ids uuid[])
returns table(member_id uuid, active boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'profile required' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) > 100 then
    raise exception 'too many ids' using errcode = '22023';
  end if;
  return query
  select o.id,
         coalesce(me.visible, true)
           and coalesce(them.visible, true)
           and them.last_seen_at >= now() - interval '3 minutes'
           and not public.brivia_is_blocked_between(uid, o.id)
    from (select distinct unnest(p_ids) as id) o
    left join public.member_presence them on them.member_id = o.id
    left join public.member_presence me on me.member_id = uid
   where o.id <> uid
     and public.brivia_same_world(uid, o.id)  -- a tester and a real member never see each other (0008/0010)
     and exists (select 1 from public.matches m
                  where (m.user1_id = uid and m.user2_id = o.id) or (m.user2_id = uid and m.user1_id = o.id));
end;
$$;
revoke all on function public.connection_presence(uuid[]) from public, anon;
grant execute on function public.connection_presence(uuid[]) to authenticated;

create or replace function public.set_presence_visible(p_visible boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  insert into public.member_presence (member_id, visible) values (uid, coalesce(p_visible, true))
  on conflict (member_id) do update set visible = excluded.visible;
end;
$$;
revoke all on function public.set_presence_visible(boolean) from public, anon;
grant execute on function public.set_presence_visible(boolean) to authenticated;

create or replace function public.my_presence_visible()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.visible from public.member_presence p where p.member_id = auth.uid()), true)
$$;
revoke all on function public.my_presence_visible() from public, anon;
grant execute on function public.my_presence_visible() to authenticated;
