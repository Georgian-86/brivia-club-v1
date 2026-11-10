set lock_timeout = '5s';
-- 0068_message_yourself.sql (D-224, founder 2026-11-10: "user should be able to search their profile in chats section
-- and should be able to text themselves"). Apply after 0067 (README "## 0068"), with the client deploy (the client
-- before it never offers the self chat, so the order does not matter). 0001-0067 are frozen. Idempotent.
--
-- brivia_can_send (0013, used by the brivia_messages insert policy) also allows a message whose recipient is the
-- sender: a private note-to-self thread. Nothing else changes:
--   * the policy still requires a completed profile and sender_id = auth.uid(), so no one writes as someone else;
--   * to anyone else the old rule applies verbatim (a match, and both in the same world: tester or real);
--   * reading is unchanged: the select policy shows a message to its sender and recipient, here the same member, so
--     nobody else ever sees a self message; the withholding trigger (blocked pairs) never applies to a member alone.
-- No data is touched; there is no new table, column or grant.

create or replace function brivia_private.brivia_can_send(p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_recipient = auth.uid()
    or (
      exists (select 1 from public.matches m
               where (m.user1_id = auth.uid() and m.user2_id = p_recipient)
                  or (m.user1_id = p_recipient and m.user2_id = auth.uid()))
      and exists (select 1 from public.profiles a join public.profiles b on public.brivia_in_test_world(a.id) = public.brivia_in_test_world(b.id)
                   where a.id = auth.uid() and b.id = p_recipient)),
    false);
$$;
revoke all on function brivia_private.brivia_can_send(uuid) from public, anon;
grant execute on function brivia_private.brivia_can_send(uuid) to authenticated;
