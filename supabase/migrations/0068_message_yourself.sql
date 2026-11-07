set lock_timeout = '5s';
-- 0068_message_yourself.sql (D-224): a member can message themselves ("You · Message yourself" at the top of Chats),
-- for notes, links, photos and files they want to keep. A row with sender_id = recipient_id = the member.
-- Applied by hand in the Supabase SQL editor, as postgres, after 0067, with the client deploy. Idempotent.
-- Only brivia_can_send changes (copied from 0013_blocked_sends_withheld.sql:22, LATEST): the recipient may also be the
-- sender. Nothing else needs to: the select policy (0013) already admits a row whose sender and recipient are both the
-- caller (same world, own message); a pair is never blocked with itself, so nothing is withheld; mark_conversation_read
-- returns 0 for the caller (0042), and the client shows no ticks there; edit, unsend, delete-for-me and replies (0046,
-- 0055) work on the member's own rows as in any thread. Mutual consent is untouched: no one else can be messaged
-- without a match, and a self-thread creates no match.

create or replace function brivia_private.brivia_can_send(p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (p_recipient = auth.uid())                                                    -- D-224: a note to yourself
    or (
      exists (select 1 from public.matches m
               where (m.user1_id = auth.uid() and m.user2_id = p_recipient)
                  or (m.user1_id = p_recipient and m.user2_id = auth.uid()))
      and exists (select 1 from public.profiles a join public.profiles b on public.brivia_in_test_world(a.id) = public.brivia_in_test_world(b.id)
                   where a.id = auth.uid() and b.id = p_recipient)
    ),
    false);
$$;
revoke all on function brivia_private.brivia_can_send(uuid) from public, anon;
grant execute on function brivia_private.brivia_can_send(uuid) to authenticated;
