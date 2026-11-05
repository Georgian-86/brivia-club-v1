set lock_timeout = '5s';
-- 0055_message_replies.sql: reply to any message in a chat (founder request 2026-11-05, D-191: "i need a feature where
-- i can reply on any message in continuation"). Apply after 0046 (README "## 0055"). 0001-0054 are frozen. Idempotent.
--
-- A message may name the message it answers (reply_to_id). The client shows a small quote of it above the reply, and
-- tapping the quote scrolls to the original. Only on INSERT: members still have no UPDATE on brivia_messages (edits and
-- unsends go through the 0046 RPCs, which never touch reply_to_id).
-- The trigger refuses a reply to a message from another conversation (the same two members, either direction), so a
-- crafted reply can never quote a stranger's message. It reads the target with the definer's rights only to compare
-- the pair; nothing about the target is returned. A target that is later deleted outright leaves the reply standing
-- (on delete set null); an unsent target stays (body '') and the client quotes it as "This message was unsent".

alter table public.brivia_messages add column if not exists reply_to_id uuid
  references public.brivia_messages(id) on delete set null;
create index if not exists brivia_messages_reply_to_idx on public.brivia_messages (reply_to_id) where reply_to_id is not null;

create or replace function public.brivia_messages_check_reply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reply_to_id is null then return new; end if;
  if new.reply_to_id = new.id or not exists (
    select 1 from public.brivia_messages t
     where t.id = new.reply_to_id
       and ((t.sender_id = new.sender_id and t.recipient_id = new.recipient_id)
         or (t.sender_id = new.recipient_id and t.recipient_id = new.sender_id))) then
    raise exception 'reply target not in this conversation' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function public.brivia_messages_check_reply() from public, anon, authenticated;

drop trigger if exists brivia_messages_check_reply on public.brivia_messages;
create trigger brivia_messages_check_reply before insert on public.brivia_messages
  for each row execute function public.brivia_messages_check_reply();
