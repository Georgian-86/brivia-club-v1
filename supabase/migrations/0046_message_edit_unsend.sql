set lock_timeout = '5s';
-- 0046_message_edit_unsend.sql: edit a message, unsend it, or delete it for me (founder request 2026-11-04, D-157:
-- "add edit message and unsend message feature and delete for me message in the chats section popping after long
-- pressing the text"). Applied after 0045 (README "## 0046"). 0001-0045 are frozen. Idempotent.
--
-- Members still have no UPDATE or DELETE on brivia_messages: every change goes through one of three RPCs.
--   * edit_message(id, body): the sender, a plain text message (no attachment), not unsent, within 15 minutes of
--     sending. Sets body and edited_at. 1 to 4000 characters after trimming.
--   * unsend_message(id): the sender, any message, any time ("delete for everyone"). The content goes for both sides
--     (body '' and the attachment columns cleared; a resume message becomes a plain text row so 0012's resume check
--     still holds) and unsent_at is set, so both apps show "This message was unsent". Returns the chat upload's
--     storage path (never the member's resume) so the sender's app can remove the file.
--   * delete_message_for_me(id): either member of the pair hides one message from their own view only
--     (brivia_private.hidden_message). brivia_message_visible (0013) now also checks that mark, so the message leaves
--     their reads and their Realtime stream; the other member keeps it.
-- Each RPC finds the message only under the select policy's world rule (brivia_pair_world_ok, 0008/0013).
-- Edits and unsends are UPDATEs, so Realtime delivers them to both members under the 0013 select policy.

alter table public.brivia_messages add column if not exists edited_at timestamptz;
alter table public.brivia_messages add column if not exists unsent_at timestamptz;

create table if not exists brivia_private.hidden_message (
  member_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.brivia_messages(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (member_id, message_id)
);
create index if not exists hidden_message_message_idx on brivia_private.hidden_message (message_id);
alter table brivia_private.hidden_message enable row level security;
revoke all on brivia_private.hidden_message from public, anon, authenticated;

-- 0013_blocked_sends_withheld.sql:41 plus the "deleted for me" mark (the caller's own only).
create or replace function brivia_private.brivia_message_visible(p_id uuid, p_sender uuid, p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.uid() = p_sender
     or (auth.uid() = p_recipient
         and not exists (select 1 from brivia_private.withheld_message w where w.message_id = p_id)))
    and not exists (select 1 from brivia_private.hidden_message h where h.message_id = p_id and h.member_id = auth.uid()),
    false);
$$;
revoke all on function brivia_private.brivia_message_visible(uuid, uuid, uuid) from public, anon;
grant execute on function brivia_private.brivia_message_visible(uuid, uuid, uuid) to authenticated;

create or replace function public.edit_message(p_id uuid, p_body text)
returns table(id uuid, body text, edited_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  m public.brivia_messages%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if me is null or not public.brivia_member_completed(me) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 4000 then
    raise exception 'invalid message' using errcode = '22023';
  end if;
  select * into m from public.brivia_messages b
   where b.id = p_id and b.sender_id = me and brivia_private.brivia_pair_world_ok(b.sender_id, b.recipient_id) for update;
  if not found then
    raise exception 'message not found' using errcode = 'no_data_found';
  end if;
  if m.unsent_at is not null or m.message_type <> 'text' or m.attachment_url is not null or m.attachment_path is not null then
    raise exception 'message cannot be edited' using errcode = '22023';
  end if;
  if m.created_at < now() - interval '15 minutes' then
    raise exception 'edit window closed' using errcode = '22023';
  end if;
  if m.body is distinct from v_body then
    update public.brivia_messages b set body = v_body, edited_at = now() where b.id = p_id;
  end if;
  return query select b.id, b.body, b.edited_at from public.brivia_messages b where b.id = p_id;
end;
$$;
revoke all on function public.edit_message(uuid, text) from public, anon;
grant execute on function public.edit_message(uuid, text) to authenticated;

create or replace function public.unsend_message(p_id uuid)
returns table(id uuid, unsent_at timestamptz, removed_path text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  m public.brivia_messages%rowtype;
  v_path text;
begin
  if me is null then
    raise exception 'profile required' using errcode = '42501';
  end if;
  select * into m from public.brivia_messages b
   where b.id = p_id and b.sender_id = me and brivia_private.brivia_pair_world_ok(b.sender_id, b.recipient_id) for update;
  if not found then
    raise exception 'message not found' using errcode = 'no_data_found';
  end if;
  if m.unsent_at is null then
    v_path := case when m.message_type = 'resume' then null else m.attachment_path end;
    update public.brivia_messages b
       set body = '', unsent_at = now(), edited_at = null,
           message_type = 'text', attachment_url = null, attachment_path = null, attachment_name = null,
           attachment_mime = null, attachment_size = null
     where b.id = p_id;
  end if;
  return query select b.id, b.unsent_at, v_path from public.brivia_messages b where b.id = p_id;
end;
$$;
revoke all on function public.unsend_message(uuid) from public, anon;
grant execute on function public.unsend_message(uuid) to authenticated;

create or replace function public.delete_message_for_me(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'profile required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.brivia_messages b where b.id = p_id and me in (b.sender_id, b.recipient_id)
                   and brivia_private.brivia_pair_world_ok(b.sender_id, b.recipient_id)) then
    raise exception 'message not found' using errcode = 'no_data_found';
  end if;
  insert into brivia_private.hidden_message (member_id, message_id) values (me, p_id) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.delete_message_for_me(uuid) from public, anon;
grant execute on function public.delete_message_for_me(uuid) to authenticated;
