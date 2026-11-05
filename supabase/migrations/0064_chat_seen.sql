set lock_timeout = '5s';
-- 0064_chat_seen.sql (D-213, founder 2026-11-05: "pls do clear old notifications once the user opens the chats on
-- either phone or laptop"). Apply after 0063 (README "## 0064"), with the client deploy. 0001-0063 are frozen.
-- Idempotent.
--
-- The bell's message rows and the inbox's unread counts were kept per browser, so a chat read on the phone stayed
-- unread on the laptop. Read receipts (0042) cannot carry this: they are set only while both members have them on.
-- A private marker, the member's own, never shown to anyone else:
--   brivia_private.chat_seen(member_id, other_id, seen_at): the newest message the member has seen in the conversation
--   with other_id; other_id = member_id is the time they last opened the Chats tab (which clears the bell's message
--   rows, not the inbox's counts). Never moves backwards, never ahead of now().
--   mark_chat_seen(p_other, p_at): p_other null for the Chats tab. my_chat_seen(): the caller's rows (other_id null
--   for the Chats tab), newest 500.

create table if not exists brivia_private.chat_seen (
  member_id uuid not null references public.profiles(id) on delete cascade,
  other_id uuid not null,
  seen_at timestamptz not null,
  primary key (member_id, other_id)
);
revoke all on brivia_private.chat_seen from public, anon, authenticated;

create or replace function public.mark_chat_seen(p_other uuid, p_at timestamptz default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_at timestamptz := least(coalesce(p_at, now()), now());
begin
  if uid is null then
    raise exception 'profile required' using errcode = '42501';
  end if;
  if v_at < now() - interval '400 days' then return; end if;
  insert into brivia_private.chat_seen as s (member_id, other_id, seen_at)
  values (uid, coalesce(p_other, uid), v_at)
  on conflict (member_id, other_id) do update set seen_at = greatest(s.seen_at, excluded.seen_at);
end;
$$;
revoke all on function public.mark_chat_seen(uuid, timestamptz) from public, anon;
grant execute on function public.mark_chat_seen(uuid, timestamptz) to authenticated;

create or replace function public.my_chat_seen()
returns table(other_id uuid, seen_at timestamptz)
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
  return query
  select nullif(s.other_id, uid), s.seen_at
    from brivia_private.chat_seen s
   where s.member_id = uid
   order by s.seen_at desc
   limit 500;
end;
$$;
revoke all on function public.my_chat_seen() from public, anon;
grant execute on function public.my_chat_seen() to authenticated;
