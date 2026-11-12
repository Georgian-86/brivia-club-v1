set lock_timeout = '5s';
-- 0075_message_reactions.sql (D-244, founder 2026-11-12: "there must be an option to leave the message on react
-- (through emojis)"). Apply after 0074 (README "## 0075"), then deploy the client. 0001-0074 are frozen. Idempotent.
--
-- A member of a chat pair can react to any message of that pair with one emoji; a new emoji replaces their old one,
-- the same emoji again (or null) removes it. Members have no direct access to the table: two RPCs only.
--   * react_to_message(p_message, p_emoji): the caller is the sender or the recipient, the message is still there
--     (not unsent), they can still see it (brivia_message_visible: not withheld, not deleted for them) and the pair
--     passes the select policy's world rule (brivia_pair_world_ok). 1 to 16 characters, no letters, spaces or markup.
--     Returns the message's reactions after the change.
--   * message_reactions_for(p_ids): the reactions on up to 500 of the caller's visible messages.
-- No notification row: the other member sees it in the thread on their next sync.

create table if not exists brivia_private.message_reaction (
  message_id uuid not null references public.brivia_messages(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, member_id)
);
create index if not exists message_reaction_member_idx on brivia_private.message_reaction (member_id);
alter table brivia_private.message_reaction enable row level security;
revoke all on brivia_private.message_reaction from public, anon, authenticated;

create or replace function public.message_reactions_for(p_ids uuid[])
returns table(message_id uuid, member_id uuid, emoji text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with ids as (select distinct unnest(coalesce(p_ids, '{}'::uuid[])) as id limit 500)
  select r.message_id, r.member_id, r.emoji, r.created_at
    from ids
    join public.brivia_messages b on b.id = ids.id
    join brivia_private.message_reaction r on r.message_id = b.id
   where auth.uid() in (b.sender_id, b.recipient_id)
     and b.unsent_at is null
     and brivia_private.brivia_message_visible(b.id, b.sender_id, b.recipient_id)
     and brivia_private.brivia_pair_world_ok(b.sender_id, b.recipient_id)
   order by r.message_id, r.created_at, r.member_id
$$;
revoke all on function public.message_reactions_for(uuid[]) from public, anon;
grant execute on function public.message_reactions_for(uuid[]) to authenticated;

create or replace function public.react_to_message(p_message uuid, p_emoji text default null)
returns table(message_id uuid, member_id uuid, emoji text, created_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  m public.brivia_messages%rowtype;
  v_emoji text := nullif(btrim(coalesce(p_emoji, '')), '');
begin
  if me is null then
    raise exception 'profile required' using errcode = '42501';
  end if;
  if v_emoji is not null and (char_length(v_emoji) > 16 or v_emoji ~ '[A-Za-z<>&"''[:space:]]') then
    raise exception 'invalid reaction' using errcode = '22023';
  end if;
  select * into m from public.brivia_messages b
   where b.id = p_message and me in (b.sender_id, b.recipient_id)
     and brivia_private.brivia_message_visible(b.id, b.sender_id, b.recipient_id)
     and brivia_private.brivia_pair_world_ok(b.sender_id, b.recipient_id);
  if not found or m.unsent_at is not null then
    raise exception 'message not found' using errcode = 'no_data_found';
  end if;
  if v_emoji is null or exists (select 1 from brivia_private.message_reaction r
                                 where r.message_id = p_message and r.member_id = me and r.emoji = v_emoji) then
    delete from brivia_private.message_reaction r where r.message_id = p_message and r.member_id = me;
  else
    insert into brivia_private.message_reaction as r (message_id, member_id, emoji)
    values (p_message, me, v_emoji)
    on conflict on constraint message_reaction_pkey do update set emoji = excluded.emoji, created_at = now();
  end if;
  return query select r.message_id, r.member_id, r.emoji, r.created_at
                 from brivia_private.message_reaction r where r.message_id = p_message
                order by r.created_at, r.member_id;
end;
$$;
revoke all on function public.react_to_message(uuid, text) from public, anon;
grant execute on function public.react_to_message(uuid, text) to authenticated;
