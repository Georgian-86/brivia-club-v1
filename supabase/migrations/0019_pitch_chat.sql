set lock_timeout = '5s';
-- 0019_pitch_chat.sql: pitch in chat (D-112; spec docs/superpowers/specs/2026-10-31-pitch-chat-design.md §2-3).
-- A pitch is a connection request with a note. The receiver can accept its chat before (or without) connecting; a
-- request whose chat is open must then never expire, be purged, or be replaced by a later send.
-- Applied by hand in the Supabase SQL editor, as postgres, after 0018. 0001-0018 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
-- Each redefinition below is copied from the LATEST live definition and only gains the clause named beside it.
--
-- Section 1: the column and the liveness rule.
--   1. connection_requests.chat_accepted_at timestamptz null. Clients cannot write it: the table has no client insert
--      grant since 0004 (send_signal is the only send path), and a before-insert trigger nulls it on every insert
--      anyway, so only a server function's UPDATE can set it.
--   2. brivia_request_is_live(status, created_at, chat_accepted_at): live when accepted, or pending with an open chat,
--      or sent within 30 days. The two-argument form stays (0003-0008 call it and are frozen), but no latest
--      definition reads connection_requests through it any more (guard: i-pitch-chat.test.sql L5).
--   3. Every latest caller passes chat_accepted_at: brivia_before_connection_request, brivia_on_connection_request,
--      respond_connection_request, purge_expired_requests, my_outgoing_requests, deck_candidates, send_signal and the
--      select policy "Members can view their connection requests".
-- Section 2: accept_pitch_chat, end_pitch_chat, my_pitch_threads (all security definer, authenticated), and chat-open brivia_can_send /
-- brivia_can_message, and the chat-open typing topic (brivia_typing_topic_ok).

-- =============================================================================================
-- Section 1: chat_accepted_at and the liveness rule that keeps an open pitch chat
-- =============================================================================================

alter table public.connection_requests add column if not exists chat_accepted_at timestamptz null;

-- Clients only ever insert (through send_signal); the chat opens only through a server function's UPDATE.
create or replace function public.brivia_requests_chat_null()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.chat_accepted_at := null;
  return new;
end;
$$;
revoke all on function public.brivia_requests_chat_null() from public, anon, authenticated;

drop trigger if exists brivia_requests_chat_null on public.connection_requests;
create trigger brivia_requests_chat_null
  before insert on public.connection_requests
  for each row execute function public.brivia_requests_chat_null();

-- Liveness (0003_trust_hardening.sql:291) plus the open-chat clause: a pending request whose chat the receiver accepted
-- never expires (a declined one does: decline and End chat close it).
create or replace function public.brivia_request_is_live(p_status text, p_created_at timestamptz, p_chat_accepted_at timestamptz)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_status = 'accepted'
      or (p_status = 'pending' and p_chat_accepted_at is not null)
      or p_created_at > now() - interval '30 days';
$$;
revoke all on function public.brivia_request_is_live(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.brivia_request_is_live(text, timestamptz, timestamptz) to authenticated;

-- brivia_before_connection_request: copied from 0004_orbit_onboarding.sql:1243; only the liveness call gains chat_accepted_at.
create or replace function public.brivia_before_connection_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.brivia_lock_pair(new.from_id, new.to_id);
  delete from public.connection_requests
   where from_id = new.from_id and to_id = new.to_id
     and not public.brivia_request_is_live(status, created_at, chat_accepted_at);
  return new;
end;
$$;
revoke all on function public.brivia_before_connection_request() from public, anon, authenticated;

-- brivia_on_connection_request: copied from 0003_trust_hardening.sql:354; only the liveness call gains chat_accepted_at.
create or replace function public.brivia_on_connection_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.brivia_lock_pair(new.from_id, new.to_id);
  if public.brivia_pair_is_blocked(new.from_id, new.to_id) then
    return null;
  end if;
  if exists (
    select 1 from public.connection_requests
    where from_id = new.to_id and to_id = new.from_id
      and (status = 'pending' or (status = 'declined' and to_id = new.from_id))
      and public.brivia_request_is_live(status, created_at, chat_accepted_at)
  ) then
    update public.connection_requests set status = 'accepted'
     where (from_id = new.from_id and to_id = new.to_id)
        or (from_id = new.to_id and to_id = new.from_id);
    perform public.brivia_create_match(new.from_id, new.to_id);
  end if;
  return null;
end;
$$;
revoke all on function public.brivia_on_connection_request() from public, anon, authenticated;

-- respond_connection_request: copied from 0008_tester_world.sql:577; only the liveness call gains chat_accepted_at.
create or replace function public.respond_connection_request(p_from uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_from is null or p_accept is null then
    raise exception 'no pending connection request' using errcode = 'no_data_found';
  end if;
  if not public.brivia_member_completed(me) then
    raise exception 'complete your profile' using errcode = '22023';
  end if;
  perform public.brivia_lock_pair(p_from, me);
  -- A request from a sender who is no longer completed is hidden by the select policy below, so it answers like
  -- one that does not exist (the like-back path, send_signal, writes nothing to such a member either).
  if not exists (
    select 1 from public.connection_requests
    where from_id = p_from and to_id = me and status = 'pending'
      and public.brivia_request_is_live(status, created_at, chat_accepted_at)
  ) or not public.brivia_member_completed(p_from)
    or not public.brivia_pair_world_ok(p_from, me) then   -- 0008: a tester across worlds answers like a request that does not exist
    raise exception 'no pending connection request' using errcode = 'no_data_found';
  end if;
  if not p_accept or public.brivia_pair_is_blocked(p_from, me) then
    update public.connection_requests set status = 'declined' where from_id = p_from and to_id = me;
    return;
  end if;
  update public.connection_requests set status = 'accepted'
   where (from_id = p_from and to_id = me) or (from_id = me and to_id = p_from and status = 'pending');
  perform public.brivia_create_match(p_from, me);
end;
$$;
revoke all on function public.respond_connection_request(uuid, boolean) from public, anon;
grant execute on function public.respond_connection_request(uuid, boolean) to authenticated;

-- purge_expired_requests: copied from 0005_p0b_dpdp_safety.sql:598; only the liveness call gains chat_accepted_at.
create or replace function public.purge_expired_requests()
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.signal_ledger where at <= now() - interval '30 days';
  delete from public.interest_rewrite where at <= now() - interval '24 hours';
  delete from public.location_change where at <= now() - interval '24 hours';
  delete from public.interaction where event = 'impression' and created_at <= now() - interval '30 days';
  delete from public.interaction where event in ('like', 'pass') and created_at <= now() - interval '180 days';
  delete from public.interaction where event in ('request', 'accept', 'decline', 'met', 'letgo') and created_at <= now() - interval '365 days';
  delete from public.member_report where created_at <= now() - interval '365 days';
  delete from public.report_attempt where at <= now() - interval '30 days';
  delete from public.member_flag where expires_at < now();
  delete from public.moderation_tombstone where expires_at < now();
  delete from public.consent_event where member_id in
    (select c.member_id from public.consent_event c where c.kind = 'account_deleted' and c.at <= now() - interval '1 year');
  delete from public.career_applications where created_at <= now() - interval '180 days';
  if to_regclass('cron.job_run_details') is not null then
    execute 'delete from cron.job_run_details where end_time < now() - interval ''7 days''';
  end if;
  delete from public.connection_requests where not public.brivia_request_is_live(status, created_at, chat_accepted_at);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purge_expired_requests() from public, anon, authenticated;

-- my_outgoing_requests: copied from 0008_tester_world.sql:276; only the liveness call gains chat_accepted_at.
create or replace function public.my_outgoing_requests()
returns table (to_id uuid, note text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.to_id, r.note,
         case when r.status = 'declined' then 'pending' else r.status end,
         r.created_at
  from public.connection_requests r
  join public.profiles me on me.id = auth.uid()
  join public.profiles p on p.id = r.to_id and public.brivia_in_test_world(p.id) = public.brivia_in_test_world(me.id)
  where r.from_id = auth.uid()
    and public.brivia_request_is_live(r.status, r.created_at, r.chat_accepted_at)
  order by r.created_at desc, r.to_id;
$$;
revoke all on function public.my_outgoing_requests() from public, anon;
grant execute on function public.my_outgoing_requests() to authenticated;

-- deck_candidates: copied from 0008_tester_world.sql:297; only the liveness call gains chat_accepted_at.
create or replace function public.deck_candidates(p_limit int default 12)
returns table(id uuid, name text, photo_url text, cover_url text, experience text, skills text[],
              looking_for text[], distance_band text, shared_interests text[])
language sql
volatile
security definer
set search_path = public
as $$
  with me as (
    select p.id, public.brivia_in_test_world(p.id) as in_test_world, o.home_cell, o.precision, vp.country, vp.lat as place_lat, vp.lng as place_lng,
           substring(o.home_cell from '^g7:(\d+):')::int as g7row
      from public.profiles p
      join public.member_orbit o on o.member_id = p.id and o.cell_scheme = 'grid1'
      join public.place vp on vp.id = o.place_id
     where p.id = auth.uid() and public.brivia_member_completed(p.id)
  ),
  near as (  -- cheap prefilters before the haversine: a fine pair is <= 15 km apart (at most 8 g7 rows), a place pair
             -- has place centroids <= 60 km apart (at most 0.54 deg of latitude). The CASE keeps a cell that is not a
             -- g7 grid1 id away from brivia_cell_km.
    select o.member_id as tid, tp.name as place_name, tp.country,
           case when me.precision = 'cell' and o.precision = 'cell' and o.home_cell ~ '^g7:'
                     and abs(substring(o.home_cell from '^g7:(\d+):')::int - me.g7row) <= 8
                     and public.brivia_cell_ok(o.home_cell, me.in_test_world, 10)
                then public.brivia_ring(public.brivia_cell_km(me.home_cell, o.home_cell)) end as fine_ring,
           public.brivia_haversine_km(me.place_lat, me.place_lng, tp.lat, tp.lng) as place_km
      from me
      join public.member_orbit o on o.member_id <> me.id and o.cell_scheme = 'grid1'
      join public.profiles t on t.id = o.member_id and public.brivia_in_test_world(t.id) = me.in_test_world
      join public.place tp on tp.id = o.place_id
     where abs(tp.lat - me.place_lat) <= 0.6
        or abs(coalesce(substring(o.home_cell from '^g7:(\d+):')::int, -100000) - me.g7row) <= 8
  ),
  pool as (  -- the two admission rules, then the cheap own-history checks; brivia_visible_to (the single rule) last
    select n.* from near n, me
     where (n.fine_ring <= 1 or n.place_km <= 60)
       and not exists (select 1 from public.matches m
                        where (m.user1_id = me.id and m.user2_id = n.tid) or (m.user1_id = n.tid and m.user2_id = me.id))
       and not exists (select 1 from public.signal_ledger l
                        where l.sender_id = me.id and l.to_id = n.tid and l.at > now() - interval '30 days')
       and not exists (select 1 from public.connection_requests r
                        where r.from_id = me.id and r.to_id = n.tid
                          and public.brivia_request_is_live(r.status, r.created_at, r.chat_accepted_at))
       and not exists (select 1 from public.interaction i
                        where i.viewer_id = me.id and i.target_id = n.tid and i.event = 'pass'
                          and i.created_at > now() - interval '7 days')
       and public.brivia_visible_to(me.id, n.tid)
  ),
  shared as (
    select pool.tid, count(*)::int as n, sum(least(mv.points, mt.points))::numeric / 20 as overlap,
           (array_agg(nd.label order by mv.points + mt.points desc, nd.label))[1:2] as labels
      from pool
      join public.member_interest mt on mt.member_id = pool.tid
      join public.member_interest mv on mv.member_id = (select me.id from me) and mv.interest_id = mt.interest_id
      join public.interest_node nd on nd.id = mt.interest_id and nd.status = 'active' and not nd.sensitive
     group by pool.tid
  ),
  banded as (
    select pool.tid, pool.place_name, coalesce(s.n, 0) as shared_n, coalesce(s.overlap, 0) as overlap,
           -- the overlap in 4 levels (M-2): 0 none, 1 low (<= 0.25), 2 mid (<= 0.5), 3 high
           case when coalesce(s.overlap, 0) = 0 then 0 when s.overlap <= 0.25 then 1 when s.overlap <= 0.5 then 2
                else 3 end as overlap_level,
           coalesce(s.labels, '{}'::text[]) as labels,
           case when pool.fine_ring <= 1 then pool.fine_ring else 2 end as display_ring,
           pool.country is distinct from me.country as abroad,
           public.brivia_deck_tie(me.id, pool.tid, current_date) as tie
      from pool
      cross join me
      left join shared s on s.tid = pool.tid
  ),
  top as (
    select b.*, row_number() over (order by b.shared_n > 0 desc, b.display_ring, b.overlap_level desc, b.tie, b.tid) as pos
      from banded b
     order by pos
     limit greatest(1, least(coalesce(p_limit, 12), 20))
  ),
  logged as (  -- a data-modifying CTE always runs
    insert into public.interaction (viewer_id, target_id, event, context, propensity, model_version)
    select me.id, t.tid, 'impression',
           jsonb_build_object('policy', 'interim-v1', 'surface', 'deck', 'position', t.pos, 'ring', t.display_ring,
                              'overlap', round(t.overlap, 4), 'overlap_level', t.overlap_level, 'shared', t.shared_n),
           1, 'interim-v1'
      from top t cross join me
    on conflict (viewer_id, target_id, (context ->> 'surface'), ((created_at at time zone 'UTC')::date))
      where event = 'impression' do nothing
    returning 1
  )
  select p.id, p.name, p.photo_url, p.cover_url, p.experience, p.skills, p.looking_for,
         case
           when b.abroad then 'Abroad'
           when b.display_ring = 0 then '~3 km'
           when b.display_ring = 1 then '~10 km'
           else b.place_name
         end,
         b.labels
    from top b
    join public.profiles p on p.id = b.tid
   order by b.pos
$$;
revoke all on function public.deck_candidates(int) from public, anon;
grant execute on function public.deck_candidates(int) to authenticated;

-- send_signal: copied from 0008_tester_world.sql:616; only the liveness call gains chat_accepted_at (a chat-open
-- request is live, so the before-insert trigger no longer replaces it and the duplicate is swallowed as today).
create or replace function public.send_signal(p_to uuid, p_note text default null)
returns table(status text, remaining int, resets_at timestamptz)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  s record;
  v_status text := 'sent';
begin
  -- 1. Caller checks (the caller's own state and input: honest, not charged).
  if me is null or not public.brivia_member_completed(me) then
    raise exception 'complete your profile' using errcode = '22023';
  end if;
  if p_to is null or p_to = me then
    raise exception 'invalid signal' using errcode = '22023';
  end if;
  if char_length(p_note) > 500 then
    raise exception 'note too long' using errcode = '22001';
  end if;
  -- 2. One send per sender at a time (parallel sends cannot overshoot the caps), then the pair lock, so a
  --    concurrent reverse request is seen by the completion check below.
  perform pg_advisory_xact_lock(hashtextextended('brivia_request_caps:' || me::text, 0));
  perform public.brivia_lock_pair(me, p_to);
  -- 3. Quota.
  select * into s from public.brivia_signal_state(me);
  if s.used >= s.daily_limit or s.live_unanswered >= s.live_limit then
    if not (public.brivia_visible_to(me, p_to)
            and exists (select 1 from public.connection_requests r
                         where r.from_id = p_to and r.to_id = me and r.status in ('pending', 'declined')
                           and public.brivia_request_is_live(r.status, r.created_at, r.chat_accepted_at))) then
      if s.used >= s.daily_limit then
        raise exception 'signal_quota_exhausted' using errcode = 'PT429';
      end if;
      raise exception 'signal_live_cap' using errcode = 'PT429';
    end if;
  end if;
  -- 4. Charge, before anything about the recipient is looked at.
  insert into public.signal_ledger (sender_id, to_id) values (me, p_to);
  -- 5. Recipient side: every outcome below answers the same way. Only a visible target gets a request row, so a
  --    NEW match can only come from this branch (the completion trigger).
  if public.brivia_visible_to(me, p_to) then
    begin
      insert into public.connection_requests (from_id, to_id, note) values (me, p_to, p_note);
    exception when unique_violation or foreign_key_violation then
      null;  -- a live earlier request (pending or declined) or a recipient that just vanished: still 'sent'
    end;
  end if;
  -- 'matched' reflects a match row the sender can already read, whatever the partner's state now (blocked, other
  -- world, no longer completed). Checking it only on the visible path would leak a block or a completion change.
  -- 0008: a match with a tester across worlds is not readable (the matches select policy), so it answers 'sent'.
  if exists (select 1 from public.matches m
              where (m.user1_id = me and m.user2_id = p_to) or (m.user1_id = p_to and m.user2_id = me))
     and public.brivia_pair_world_ok(me, p_to) then
    v_status := 'matched';
  end if;
  -- 6. No interaction row. 7. The post-charge quota.
  select * into s from public.brivia_signal_state(me);
  return query select v_status, greatest(s.daily_limit - s.used, 0), s.resets_at;
end;
$$;
revoke all on function public.send_signal(uuid, text) from public, anon;
grant execute on function public.send_signal(uuid, text) to authenticated;

-- The select policy: copied from 0006_perf_policies.sql:65; only the liveness call gains chat_accepted_at.
drop policy if exists "Members can view their connection requests" on public.connection_requests;
create policy "Members can view their connection requests"
  on public.connection_requests for select to authenticated
  using (
    (select public.brivia_has_completed_profile())
    and to_id = (select auth.uid())
    and public.brivia_request_is_live(status, created_at, chat_accepted_at)
    and brivia_private.brivia_incoming_request_visible(from_id)
  );

-- =============================================================================================
-- Section 2: accept_pitch_chat, end_pitch_chat, my_pitch_threads, chat-open sends (D-112)
-- =============================================================================================
-- Spec §3 items 3-6. A pitch is a pending request with a non-blank note. The receiver's Accept opens its chat
-- (chat_accepted_at) without a match; Connect (respond_connection_request / send_signal) still makes the match.
-- Decline, End chat and Not now set the request to 'declined', which closes the chat (the gates below need 'pending').

-- brivia_can_send: copied from 0013_blocked_sends_withheld.sql:22; only the matched clause gains "or a chat-open
-- pitch between the pair" (either direction). Still no block clause (0013: a blocked sender's messages are stored and
-- withheld); a blocked pair never gets chat_accepted_at, because accept_pitch_chat writes nothing for it.
create or replace function brivia_private.brivia_can_send(p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (exists (select 1 from public.matches m
              where (m.user1_id = auth.uid() and m.user2_id = p_recipient)
                 or (m.user1_id = p_recipient and m.user2_id = auth.uid()))
     or exists (select 1 from public.connection_requests r
                 where ((r.from_id = auth.uid() and r.to_id = p_recipient)
                     or (r.from_id = p_recipient and r.to_id = auth.uid()))
                   and r.status = 'pending' and r.chat_accepted_at is not null
                   and public.brivia_request_is_live(r.status, r.created_at, r.chat_accepted_at)))
    and exists (select 1 from public.profiles a join public.profiles b on public.brivia_in_test_world(a.id) = public.brivia_in_test_world(b.id)
                 where a.id = auth.uid() and b.id = p_recipient),
    false);
$$;
revoke all on function brivia_private.brivia_can_send(uuid) from public, anon;
grant execute on function brivia_private.brivia_can_send(uuid) to authenticated;

-- brivia_can_message: copied from 0008_tester_world.sql:256; only the matched clause gains "or a chat-open pitch
-- between the pair" (either direction). The block clause stays (typing channel, attachments: 0012).
create or replace function brivia_private.brivia_can_message(p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (exists (select 1 from public.matches m
              where (m.user1_id = auth.uid() and m.user2_id = p_recipient)
                 or (m.user1_id = p_recipient and m.user2_id = auth.uid()))
     or exists (select 1 from public.connection_requests r
                 where ((r.from_id = auth.uid() and r.to_id = p_recipient)
                     or (r.from_id = p_recipient and r.to_id = auth.uid()))
                   and r.status = 'pending' and r.chat_accepted_at is not null
                   and public.brivia_request_is_live(r.status, r.created_at, r.chat_accepted_at)))
    and not public.brivia_pair_is_blocked(auth.uid(), p_recipient)
    and exists (select 1 from public.profiles a join public.profiles b on public.brivia_in_test_world(a.id) = public.brivia_in_test_world(b.id)
                 where a.id = auth.uid() and b.id = p_recipient),
    false);
$$;
revoke all on function brivia_private.brivia_can_message(uuid) from public, anon;
grant execute on function brivia_private.brivia_can_message(uuid) to authenticated;

-- accept_pitch_chat(p_from): the receiver's Accept in Chat. Opens the pitch's chat; never makes a match.
-- Same pair lock and the same "does not exist" rule as respond_connection_request (0019 section 1, from
-- 0008_tester_world.sql:577), plus a non-blank note. A blocked pair answers normally and nothing opens (P12).
create or replace function public.accept_pitch_chat(p_from uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.brivia_member_completed(me) then
    raise exception 'complete your profile' using errcode = '22023';
  end if;
  if p_from is null or p_from = me then
    raise exception 'no pending connection request' using errcode = 'no_data_found';
  end if;
  perform public.brivia_lock_pair(p_from, me);
  if not exists (
    select 1 from public.connection_requests
    where from_id = p_from and to_id = me and status = 'pending'
      and nullif(btrim(note), '') is not null
      and public.brivia_request_is_live(status, created_at, chat_accepted_at)
  ) or not public.brivia_member_completed(p_from)
    or not public.brivia_pair_world_ok(p_from, me)
    or exists (select 1 from public.matches m
                where (m.user1_id = p_from and m.user2_id = me) or (m.user1_id = me and m.user2_id = p_from)) then
    raise exception 'no pending connection request' using errcode = 'no_data_found';
  end if;
  if public.brivia_pair_is_blocked(p_from, me) then
    return;  -- P12: the same success, and the chat stays closed
  end if;
  update public.connection_requests set chat_accepted_at = coalesce(chat_accepted_at, now())
   where from_id = p_from and to_id = me;
end;
$$;
revoke all on function public.accept_pitch_chat(uuid) from public, anon;
grant execute on function public.accept_pitch_chat(uuid) to authenticated;

-- end_pitch_chat(p_other): Decline (the receiver, before or after Accept) or End chat (the sender, once the chat is
-- open) on a live pending pitch between an unmatched pair. Sets it to 'declined'; the sender's own views
-- (my_outgoing_requests, my_pitch_threads) still read it as pending, so they learn only that the chat closed.
create or replace function public.end_pitch_chat(p_other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  n integer;
begin
  if me is null or not public.brivia_member_completed(me) then
    raise exception 'complete your profile' using errcode = '22023';
  end if;
  if p_other is null or p_other = me then
    raise exception 'no pending connection request' using errcode = 'no_data_found';
  end if;
  perform public.brivia_lock_pair(p_other, me);
  if not public.brivia_member_completed(p_other)
     or not public.brivia_pair_world_ok(p_other, me)
     or exists (select 1 from public.matches m
                 where (m.user1_id = p_other and m.user2_id = me) or (m.user1_id = me and m.user2_id = p_other)) then
    raise exception 'no pending connection request' using errcode = 'no_data_found';
  end if;
  update public.connection_requests r set status = 'declined'
   where ((r.from_id = p_other and r.to_id = me)                                   -- Decline (receiver)
       or (r.from_id = me and r.to_id = p_other and r.chat_accepted_at is not null)) -- End chat (sender)
     and r.status = 'pending'
     and nullif(btrim(r.note), '') is not null
     and public.brivia_request_is_live(r.status, r.created_at, r.chat_accepted_at);
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'no pending connection request' using errcode = 'no_data_found';
  end if;
end;
$$;
revoke all on function public.end_pitch_chat(uuid) from public, anon;
grant execute on function public.end_pitch_chat(uuid) to authenticated;

-- my_pitch_threads(): the Chat tab's message requests. Matched pairs and blank notes are left out.
--   'in':  live pending pitches to me, visible under the request select policy's rule (brivia_incoming_request_visible:
--          completed sender, not blocked, same world); chat_open once I accepted.
--   'out': my live pitches, read the way my_outgoing_requests reads them (declined shows as pending, accepted is a
--          connection, same world); chat_open only while pending with the chat accepted.
-- No email, phone, place or coordinates: the client loads names and photos through the profile policies.
create or replace function public.my_pitch_threads()
returns table (other_id uuid, direction text, note text, created_at timestamptz, chat_open boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.brivia_member_completed(me) then
    raise exception 'complete your profile' using errcode = '22023';
  end if;
  return query
  select t.other_id, t.direction, t.note, t.created_at, t.chat_open
    from (
      select r.from_id as other_id, 'in'::text as direction, r.note, r.created_at,
             r.chat_accepted_at is not null as chat_open
        from public.connection_requests r
       where r.to_id = me and r.status = 'pending'
         and public.brivia_request_is_live(r.status, r.created_at, r.chat_accepted_at)
         and brivia_private.brivia_incoming_request_visible(r.from_id)
      union all
      select r.to_id, 'out'::text, r.note, r.created_at,
             (r.status = 'pending' and r.chat_accepted_at is not null)
        from public.connection_requests r
        join public.profiles mp on mp.id = me
        join public.profiles p on p.id = r.to_id and public.brivia_in_test_world(p.id) = public.brivia_in_test_world(mp.id)
       where r.from_id = me and r.status in ('pending', 'declined')
         and public.brivia_request_is_live(r.status, r.created_at, r.chat_accepted_at)
    ) t
   where nullif(btrim(t.note), '') is not null
     and not exists (select 1 from public.matches m
                      where (m.user1_id = me and m.user2_id = t.other_id) or (m.user1_id = t.other_id and m.user2_id = me))
   order by t.created_at desc, t.other_id, t.direction;
end;
$$;
revoke all on function public.my_pitch_threads() from public, anon;
grant execute on function public.my_pitch_threads() to authenticated;

-- brivia_typing_topic_ok: copied from 0012_polish_wave.sql:191; only the matched clause gains "or a chat-open pitch
-- between the pair" (either direction), so the typing channel follows the chat gates. The caller-only block clause
-- and the world clause stay. Same guard as 0012: a no-op where Realtime Authorization (realtime.messages) is absent.
do $typing$
begin
  if to_regclass('realtime.messages') is null then
    return;
  end if;

  execute $f$
    create or replace function brivia_private.brivia_typing_topic_ok(p_topic text)
    returns boolean
    language plpgsql
    stable
    security definer
    set search_path = public
    as $b$
    declare
      m text[];
      me uuid := auth.uid();
      lo uuid;
      hi uuid;
      other uuid;
    begin
      if me is null or p_topic is null then
        return false;
      end if;
      m := regexp_match(p_topic,
        '^typing:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
      if m is null or not (m[1] collate "C" < m[2] collate "C") then
        return false;
      end if;
      lo := m[1]::uuid;
      hi := m[2]::uuid;
      if me = lo then
        other := hi;
      elsif me = hi then
        other := lo;
      else
        return false;
      end if;
      -- Same checks as brivia_can_message (matched, same world) but only the CALLER's own block counts, so the
      -- blocked member is never told: their join and sends behave exactly as before, only the blocker is cut off.
      return coalesce(
        (exists (select 1 from public.matches mt
                  where (mt.user1_id = me and mt.user2_id = other) or (mt.user1_id = other and mt.user2_id = me))
         or exists (select 1 from public.connection_requests r
                     where ((r.from_id = me and r.to_id = other) or (r.from_id = other and r.to_id = me))
                       and r.status = 'pending' and r.chat_accepted_at is not null
                       and public.brivia_request_is_live(r.status, r.created_at, r.chat_accepted_at)))
        and not exists (select 1 from public.brivia_blocks bl where bl.blocker_id = me and bl.blocked_id = other)
        and exists (select 1 from public.profiles a join public.profiles b
                      on public.brivia_in_test_world(a.id) = public.brivia_in_test_world(b.id)
                     where a.id = me and b.id = other),
        false);
      return false;
    end;
    $b$
  $f$;
  revoke all on function brivia_private.brivia_typing_topic_ok(text) from public, anon;
  grant execute on function brivia_private.brivia_typing_topic_ok(text) to authenticated;
end
$typing$;
