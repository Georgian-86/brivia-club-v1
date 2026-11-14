set lock_timeout = '5s';
-- 0081_fast_message_policy.sql (D-264, founder 2026-11-14: "chat section ... is bit slow and unresponsive"). Apply after
-- 0080 (README "## 0081"). 0001-0080 are frozen. Idempotent. Same rule, computed once per query instead of per row.
--
-- The select policy on brivia_messages (0013) called two SECURITY DEFINER checks on every row it looked at
-- (brivia_pair_world_ok and brivia_message_visible, about 0.4 ms each, never inlined), so a member with 700 messages
-- paid ~380 ms for the 80-row "new messages" check the app runs every few seconds, and realtime paid it per insert.
-- The rule is unchanged; two helpers answer it once per query for the caller (an InitPlan):
--   * brivia_private.my_hidden_message_ids(): the caller's messages they must not see: deleted for them (0046
--     hidden_message), or withheld from them as the recipient of someone else's message (0013 withheld_message).
--     Exactly what brivia_message_visible removed, given the caller is the sender or the recipient.
--   * brivia_private.my_other_world_peers(): the people the caller has messages with whose pair fails
--     public.brivia_pair_world_ok (the tester-world rule, 0008), checked once per person instead of once per message.
-- brivia_message_visible and brivia_pair_world_ok stay for the RPCs that use them.

create or replace function brivia_private.my_hidden_message_ids()
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare me uuid := auth.uid();  -- read once: auth.uid() per row was the cost
begin
  return (select coalesce(array_agg(x.id), '{}'::uuid[]) from (
    select h.message_id as id from brivia_private.hidden_message h where h.member_id = me
    union
    select w.message_id from brivia_private.withheld_message w
      join public.brivia_messages b on b.id = w.message_id
     where b.recipient_id = me and b.sender_id is distinct from me
  ) x);
end;
$$;
revoke all on function brivia_private.my_hidden_message_ids() from public, anon;
grant execute on function brivia_private.my_hidden_message_ids() to authenticated;

create or replace function brivia_private.my_other_world_peers()
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then return '{}'::uuid[]; end if;
  -- materialized: the world check runs once per person, after the union (pushed into it, it ran per message)
  return (with o as materialized (
            select b.recipient_id as other from public.brivia_messages b where b.sender_id = me
            union
            select b.sender_id from public.brivia_messages b where b.recipient_id = me)
          select coalesce(array_agg(o.other), '{}'::uuid[]) from o
           where not public.brivia_pair_world_ok(me, o.other));
end;
$$;
revoke all on function brivia_private.my_other_world_peers() from public, anon;
grant execute on function brivia_private.my_other_world_peers() to authenticated;

grant usage on schema brivia_private to authenticated;

drop policy if exists "Completed members can view their messages" on public.brivia_messages;
create policy "Completed members can view their messages"
  on public.brivia_messages for select to authenticated
  using ((select public.brivia_has_completed_profile()) and (select auth.uid()) in (sender_id, recipient_id)
         and not (id = any ((select brivia_private.my_hidden_message_ids())::uuid[]))
         and not ((case when sender_id = (select auth.uid()) then recipient_id else sender_id end)
                  = any ((select brivia_private.my_other_world_peers())::uuid[])));
