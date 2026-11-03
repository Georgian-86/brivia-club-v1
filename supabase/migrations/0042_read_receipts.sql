set lock_timeout = '5s';
-- 0042_read_receipts.sql: Delivered and Read on chat messages, and "Active 5 min ago" for connections (founder request
-- 2026-11-03, D-150: "put read receipts, delivered on chat section and also last active time"). Applied after 0041
-- (README "## 0042"). 0001-0041 are frozen. Idempotent.
--   1. brivia_messages.delivered_at / read_at. Only the recipient sets them, only through the two functions below
--      (there is no update policy on the table, and a trigger clears both on every client insert). A withheld message
--      (0013: sent to or from a member who blocked the other) is never marked, so its sender sees "Sent" and nothing
--      more, exactly as before the block.
--   2. mark_messages_delivered(): every visible message to the caller that has not been delivered yet. The app calls it
--      when it loads or receives messages. Returns the number marked.
--   3. mark_conversation_read(p_other): every visible message from p_other to the caller that is still unread (also
--      delivered, if it was not). The app calls it while the conversation is open on screen. Returns the number marked.
--   4. connection_last_seen(p_ids): connection_presence (0018) plus the time a match was last here, rounded down to the
--      minute. Same rules: matches only, same world, not blocked, and both members' "Show when I'm active" switch on.
--      Otherwise the time is null and active is false. Never a place, only a time.
--   5. Backfill: a message the recipient answered before this migration is read (and delivered) at that answer.
-- Realtime: brivia_messages is already in supabase_realtime (0001), so the sender gets the UPDATE under the same
-- select policy.

-- 1. ------------------------------------------------------------------------------------------------------------------
alter table public.brivia_messages add column if not exists delivered_at timestamptz;
alter table public.brivia_messages add column if not exists read_at timestamptz;
create index if not exists brivia_messages_undelivered_idx on public.brivia_messages (recipient_id) where delivered_at is null;
create index if not exists brivia_messages_unread_idx on public.brivia_messages (recipient_id, sender_id) where read_at is null;

create or replace function public.brivia_messages_clear_receipts()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.delivered_at := null;
  new.read_at := null;
  return new;
end;
$$;
revoke all on function public.brivia_messages_clear_receipts() from public, anon, authenticated;
drop trigger if exists brivia_messages_clear_receipts on public.brivia_messages;
create trigger brivia_messages_clear_receipts before insert on public.brivia_messages
  for each row execute function public.brivia_messages_clear_receipts();

-- 2. ------------------------------------------------------------------------------------------------------------------
create or replace function public.mark_messages_delivered()
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then
    raise exception 'profile required' using errcode = '42501';
  end if;
  update public.brivia_messages m
     set delivered_at = now()
   where m.recipient_id = uid
     and m.delivered_at is null
     and brivia_private.brivia_pair_world_ok(m.sender_id, m.recipient_id)  -- the select policy's world rule (0013)
     and not exists (select 1 from brivia_private.withheld_message w where w.message_id = m.id);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.mark_messages_delivered() from public, anon;
grant execute on function public.mark_messages_delivered() to authenticated;

-- 3. ------------------------------------------------------------------------------------------------------------------
create or replace function public.mark_conversation_read(p_other uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then
    raise exception 'profile required' using errcode = '42501';
  end if;
  if p_other is null or p_other = uid then
    return 0;
  end if;
  update public.brivia_messages m
     set read_at = now(),
         delivered_at = coalesce(m.delivered_at, now())
   where m.recipient_id = uid
     and m.sender_id = p_other
     and m.read_at is null
     and brivia_private.brivia_pair_world_ok(m.sender_id, m.recipient_id)  -- the select policy's world rule (0013)
     and not exists (select 1 from brivia_private.withheld_message w where w.message_id = m.id);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- 4. ------------------------------------------------------------------------------------------------------------------
create or replace function public.connection_last_seen(p_ids uuid[])
returns table(member_id uuid, active boolean, last_seen_at timestamptz)
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
  with o as (
    select x.id,
           them.last_seen_at as seen,
           coalesce(me.visible, true) and coalesce(them.visible, true)
             and not public.brivia_is_blocked_between(uid, x.id) as shown
      from (select distinct unnest(p_ids) as id) x
      left join public.member_presence them on them.member_id = x.id
      left join public.member_presence me on me.member_id = uid
     where x.id <> uid
       and public.brivia_same_world(uid, x.id)
       and exists (select 1 from public.matches m
                    where (m.user1_id = uid and m.user2_id = x.id) or (m.user2_id = uid and m.user1_id = x.id))
  )
  select o.id,
         coalesce(o.shown and o.seen >= now() - interval '3 minutes', false),
         case when o.shown then date_trunc('minute', o.seen) end
    from o;
end;
$$;
revoke all on function public.connection_last_seen(uuid[]) from public, anon;
grant execute on function public.connection_last_seen(uuid[]) to authenticated;

-- 5. ------------------------------------------------------------------------------------------------------------------
update public.brivia_messages m
   set read_at = r.answered, delivered_at = coalesce(m.delivered_at, r.answered)
  from (
    select m2.id, (select min(a.created_at) from public.brivia_messages a
                    where a.sender_id = m2.recipient_id and a.recipient_id = m2.sender_id
                      and a.created_at >= m2.created_at) as answered
      from public.brivia_messages m2
     where m2.read_at is null
  ) r
 where r.id = m.id
   and r.answered is not null
   and not exists (select 1 from brivia_private.withheld_message w where w.message_id = m.id);
