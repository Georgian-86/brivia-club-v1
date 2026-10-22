set lock_timeout = '5s';
-- 0013_blocked_sends_withheld.sql: polish wave Task A5 (spec docs/superpowers/specs/2026-10-21-polish-wave-design.md).
-- A blocked sender's messages are stored and withheld, never refused. A block is never revealed to the blocked member:
-- their send succeeds exactly as before (same response, no error code), their own thread shows the message, and the
-- member who blocked them never receives it (no row, no Realtime event, no notification or unread count, no
-- attachment, no resume). Withheld is permanent: unblocking does not release it. Moderation evidence
-- (report_member) still includes withheld rows.
-- Applied by hand in the Supabase SQL editor, as postgres, after 0012. 0001-0012 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
-- Each redefinition below is copied from the LATEST live definition and only gains the clause named beside it.

-- The withheld marks. Private to the server: no grants, RLS on with no policy, in the non-exposed schema.
create table if not exists brivia_private.withheld_message (
  message_id uuid primary key references public.brivia_messages(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table brivia_private.withheld_message enable row level security;
revoke all on brivia_private.withheld_message from public, anon, authenticated;

-- brivia_can_send: brivia_can_message (0008_tester_world.sql:256) without the block clause: matched + same world.
-- The insert policy uses it, so a send to a match that blocked you (or that you blocked) is stored, then withheld.
create or replace function brivia_private.brivia_can_send(p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (select 1 from public.matches m
             where (m.user1_id = auth.uid() and m.user2_id = p_recipient)
                or (m.user1_id = p_recipient and m.user2_id = auth.uid()))
    and exists (select 1 from public.profiles a join public.profiles b on public.brivia_in_test_world(a.id) = public.brivia_in_test_world(b.id)
                 where a.id = auth.uid() and b.id = p_recipient),
    false);
$$;
revoke all on function brivia_private.brivia_can_send(uuid) from public, anon;
grant execute on function brivia_private.brivia_can_send(uuid) to authenticated;

-- brivia_message_visible: the sender always sees their own message; the recipient sees it unless it is withheld.
create or replace function brivia_private.brivia_message_visible(p_id uuid, p_sender uuid, p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() = p_sender
    or (auth.uid() = p_recipient
        and not exists (select 1 from brivia_private.withheld_message w where w.message_id = p_id)),
    false);
$$;
revoke all on function brivia_private.brivia_message_visible(uuid, uuid, uuid) from public, anon;
grant execute on function brivia_private.brivia_message_visible(uuid, uuid, uuid) to authenticated;

-- The withholding trigger: a message between a blocked pair (either direction, public.brivia_pair_is_blocked from
-- 0002) gets a withheld mark in the same transaction, so it is never visible to the recipient, not even to Realtime
-- (postgres_changes checks the subscriber's select policy after commit, when the mark already exists).
create or replace function public.brivia_withhold_blocked_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Same pair lock as the block trigger (0003), so a block committed at the same instant as a send is always seen.
  perform public.brivia_lock_pair(new.sender_id, new.recipient_id);
  if public.brivia_pair_is_blocked(new.sender_id, new.recipient_id) then
    insert into brivia_private.withheld_message (message_id) values (new.id) on conflict (message_id) do nothing;
  end if;
  return null;
end;
$$;
revoke all on function public.brivia_withhold_blocked_message() from public, anon, authenticated;
drop trigger if exists brivia_messages_withhold_blocked on public.brivia_messages;
create trigger brivia_messages_withhold_blocked after insert on public.brivia_messages
  for each row execute function public.brivia_withhold_blocked_message();

-- brivia_messages select: 0008_tester_world.sql:552 verbatim plus brivia_message_visible.
drop policy if exists "Completed members can view their messages" on public.brivia_messages;
create policy "Completed members can view their messages"
  on public.brivia_messages for select to authenticated
  using ((select public.brivia_has_completed_profile()) and (select auth.uid()) in (sender_id, recipient_id)
         and brivia_private.brivia_pair_world_ok(sender_id, recipient_id)
         and brivia_private.brivia_message_visible(id, sender_id, recipient_id));

-- brivia_messages insert: 0006_perf_policies.sql:92 with brivia_can_send in place of brivia_can_message.
-- Still exactly one insert policy: a second permissive policy would OR rules away.
drop policy if exists "Completed members can send messages" on public.brivia_messages;
create policy "Completed members can send messages"
  on public.brivia_messages for insert to authenticated
  with check (
    (select public.brivia_has_completed_profile())
    and sender_id = (select auth.uid())
    and brivia_private.brivia_can_send(recipient_id)
  );

-- message-attachments select: 0012_polish_wave.sql §D verbatim plus brivia_message_visible inside the exists, so a
-- withheld message never opens its file to the recipient (the sender keeps their own folder).
drop policy if exists "Participants can view message attachments" on storage.objects;
create policy "Participants can view message attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      or exists (
        select 1 from public.brivia_messages m
         where m.attachment_path = storage.objects.name
           and m.message_type <> 'resume'
           -- the object must sit in the SENDER's folder: a message cannot claim someone else's file
           and (storage.foldername(storage.objects.name))[1] = m.sender_id::text
           and (select auth.uid()) in (m.sender_id, m.recipient_id)
           and brivia_private.brivia_message_visible(m.id, m.sender_id, m.recipient_id)
      )
    )
  );

-- resumes select: 0012_polish_wave.sql §D verbatim plus brivia_message_visible inside the exists. While blocked,
-- brivia_can_message already closes it; withheld is permanent, so after an unblock a withheld resume message still
-- opens nothing (a resume message sent after the unblock does).
drop policy if exists "Members can read their resume or one shared with them" on storage.objects;
create policy "Members can read their resume or one shared with them"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'resumes'
    and (
      name = (select auth.uid())::text || '/resume.pdf'
      or exists (
        select 1 from public.brivia_messages m
         where m.message_type = 'resume'
           and m.attachment_path = storage.objects.name
           and m.recipient_id = (select auth.uid())
           and brivia_private.brivia_can_message(m.sender_id)
           and brivia_private.brivia_message_visible(m.id, m.sender_id, m.recipient_id)
      )
    )
  );
