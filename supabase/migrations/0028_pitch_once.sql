set lock_timeout = '5s';
-- 0028_pitch_once.sql: a pitch appears once in chat (founder bug report 2026-11-03, D-129). "When someone sends me a
-- companion request from the Explore page and I accept it, their pitch message appears twice in our private chat."
-- Applied by hand in the Supabase SQL editor, as postgres, after 0024 (README "## 0028"). 0001-0027 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- Cause (live database, read 2026-11-03): brivia_create_match(uuid, uuid) on live is NOT the repo's (0002). It was
-- edited by hand in the SQL editor (CRLF line endings; the drift is flagged in docs/HANDOFF.md, 2026-11-02) to copy
-- every pending/accepted request note into brivia_messages when it creates a match. 0024 then added the
-- brivia_matches_deliver_pitches trigger, which delivers the same notes on the same match insert. Every accepted
-- request with a note therefore landed twice, with the same created_at (both copy the request's time). The trigger
-- path is keyed (brivia_pitch_delivery: one row per pitch, retries and crossing requests included); the hand-edited
-- path is not. Accept (respond_connection_request), crossing requests (brivia_on_connection_request) and companion
-- matches (companion_swipe) all go through brivia_create_match, so all three were affected.
--
-- What changes:
--   1. brivia_create_match(uuid, uuid) only creates the match again (0002's body, plpgsql so `create or replace` works
--      over either live language). The pitch is delivered once, by the 0024 trigger on matches.
--   2. brivia_private.brivia_remove_duplicate_pitches(): one-time cleanup, run once below. A message is removed only when
--      it is an exact twin (same sender, recipient, body and created_at to the microsecond) of a message recorded in
--      brivia_pitch_delivery, and is itself not recorded there. The delivered copy stays. Returns the rows removed;
--      0 on every later run. Security definer, no client grants.

-- 1. ---------------------------------------------------------------------------------------------------------------
create or replace function public.brivia_create_match(first_user uuid, second_user uuid)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  -- Pitches (request notes) are delivered by the brivia_matches_deliver_pitches trigger (0024), exactly once.
  insert into public.matches(user1_id, user2_id)
  select least(first_user, second_user), greatest(first_user, second_user)
  where not exists (
    select 1 from public.matches m
    where (m.user1_id = first_user and m.user2_id = second_user)
       or (m.user1_id = second_user and m.user2_id = first_user)
  )
  on conflict (user1_id, user2_id) do nothing;
end;
$$;
revoke all on function public.brivia_create_match(uuid, uuid) from public, anon, authenticated;

-- 2. ---------------------------------------------------------------------------------------------------------------
create or replace function brivia_private.brivia_remove_duplicate_pitches()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare removed integer;
begin
  delete from public.brivia_messages dup
   using public.brivia_pitch_delivery d
    join public.brivia_messages kept on kept.id = d.message_id
   where dup.id <> kept.id
     and dup.sender_id = kept.sender_id
     and dup.recipient_id = kept.recipient_id
     and dup.body = kept.body
     and dup.created_at = kept.created_at
     and not exists (select 1 from public.brivia_pitch_delivery d2 where d2.message_id = dup.id);
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function brivia_private.brivia_remove_duplicate_pitches() from public, anon, authenticated;

select brivia_private.brivia_remove_duplicate_pitches() as duplicate_pitches_removed;
