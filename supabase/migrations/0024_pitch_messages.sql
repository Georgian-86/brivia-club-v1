set lock_timeout = '5s';
-- 0024_pitch_messages.sql: the pitch becomes the first chat message (founder request 2026-11-02, D-124). "When User B
-- accepts, the exact message User A sent must automatically appear as the first message in their Brivia Chat
-- conversation ... Do not make the sender type or resend it. If they are already connected, append the message to the
-- existing chat. If the request is declined, never expose the message as a chat message."
-- Applied by hand in the Supabase SQL editor, as postgres, after 0023 (README "## 0024"). Needs 0023
-- (brivia_is_connection). Idempotent: the local harness applies every migration twice.
--
-- How:
--   1. brivia_pitch_delivery(pitch_key primary key, message_id): one row per delivered pitch, so a pitch lands exactly
--      once whatever path created the connection (Accept, two requests crossing, a companion match) and however often
--      it is retried. A separate table, not a message column: brivia_messages keeps its columns (a5-blocked-send S2:
--      no column may tell one message apart from another).
--   2. A trigger after insert on matches delivers each direction's note (a request that is pending or accepted, with a
--      non-empty note) as a message from its sender, with the request's own time, and marks a pending request
--      accepted. A declined request never makes a match, so its note never reaches chat.
--   3. brivia_server_created_at (0003) keeps a message's time only inside this delivery (a transaction-local flag set
--      by the owner-run function); every client insert still gets the server's now().
--   4. send_connect_request(p_to, p_note): the composer's Send. Already connected: the note is appended to the existing
--      conversation as an ordinary message (status 'chat'); no request, no second conversation. Otherwise it is
--      exactly send_signal (quota, caps, 'sent' / 'matched').

-- 1. ---------------------------------------------------------------------------------------------------------------
create table if not exists public.brivia_pitch_delivery (
  pitch_key text primary key,
  message_id uuid references public.brivia_messages(id) on delete cascade,
  delivered_at timestamptz not null default now()
);
alter table public.brivia_pitch_delivery enable row level security;
revoke all on public.brivia_pitch_delivery from public, anon, authenticated;

-- 3. -----------------------------------------------------------------------------------------------------------------
create or replace function public.brivia_server_created_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_owner text := (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = tg_relid);
begin
  -- The owner itself (migrations, the SQL editor) keeps any time; so does the owner-run pitch delivery below, which
  -- sets brivia.keep_created_at for its own transaction. Everyone else gets now().
  if (current_user = v_owner and session_user = v_owner)
     or (current_user = v_owner and coalesce(current_setting('brivia.keep_created_at', true), '') = 'on') then
    return new;
  end if;
  new.created_at := now();
  return new;
end;
$$;
revoke all on function public.brivia_server_created_at() from public, anon, authenticated;

-- 2. -----------------------------------------------------------------------------------------------------------------
create or replace function public.brivia_deliver_pitches(p_a uuid, p_b uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
  v_key text;
  v_id uuid;
begin
  perform set_config('brivia.keep_created_at', 'on', true);
  for r in
    select c.from_id, c.to_id, btrim(c.note) as note, c.created_at
      from public.connection_requests c
     where ((c.from_id = p_a and c.to_id = p_b) or (c.from_id = p_b and c.to_id = p_a))
       and c.status in ('pending', 'accepted') and nullif(btrim(coalesce(c.note, '')), '') is not null
     order by c.created_at
  loop
    v_key := r.from_id::text || '>' || r.to_id::text || '@' || to_char(r.created_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS');
    insert into public.brivia_pitch_delivery (pitch_key) values (v_key) on conflict (pitch_key) do nothing;
    if found then
      insert into public.brivia_messages (sender_id, recipient_id, body, message_type, created_at)
      values (r.from_id, r.to_id, left(r.note, 500), 'text', r.created_at)
      returning id into v_id;
      update public.brivia_pitch_delivery set message_id = v_id where pitch_key = v_key;
      n := n + 1;
    end if;
  end loop;
  perform set_config('brivia.keep_created_at', 'off', true);
  -- The connection exists: an open request between the two is answered.
  update public.connection_requests c set status = 'accepted'
   where ((c.from_id = p_a and c.to_id = p_b) or (c.from_id = p_b and c.to_id = p_a)) and c.status = 'pending';
  return n;
end;
$$;
revoke all on function public.brivia_deliver_pitches(uuid, uuid) from public, anon, authenticated;

create or replace function public.brivia_on_match_deliver_pitches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.brivia_deliver_pitches(new.user1_id, new.user2_id);
  return null;
end;
$$;
revoke all on function public.brivia_on_match_deliver_pitches() from public, anon, authenticated;
drop trigger if exists brivia_matches_deliver_pitches on public.matches;
create trigger brivia_matches_deliver_pitches after insert on public.matches
  for each row execute function public.brivia_on_match_deliver_pitches();

-- 4. -----------------------------------------------------------------------------------------------------------------
-- send_connect_request(p_to, p_note) -> (status, remaining, resets_at). 'chat': already connected, the note was added
-- to their conversation (remaining and resets_at null; nothing is charged). Otherwise send_signal's own answer.
create or replace function public.send_connect_request(p_to uuid, p_note text default null)
returns table(status text, remaining int, resets_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if me is null or not public.brivia_member_completed(me) then
    raise exception 'complete your profile' using errcode = '22023';
  end if;
  if p_to is null or p_to = me then
    raise exception 'invalid signal' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'note too long' using errcode = '22001';
  end if;
  if public.brivia_is_connection(me, p_to) then
    -- Scenario B: the existing conversation continues. The same rules as the chat insert policy (0003): no block,
    -- same world (brivia_visible_to also needs both completed).
    if v_note is null then return query select 'chat'::text, null::int, null::timestamptz; return; end if;
    if not public.brivia_visible_to(me, p_to) then
      raise exception 'cannot message' using errcode = '42501';
    end if;
    insert into public.brivia_messages (sender_id, recipient_id, body, message_type) values (me, p_to, v_note, 'text');
    return query select 'chat'::text, null::int, null::timestamptz;
    return;
  end if;
  return query select * from public.send_signal(p_to, v_note);
end;
$$;
revoke all on function public.send_connect_request(uuid, text) from public, anon;
grant execute on function public.send_connect_request(uuid, text) to authenticated;
