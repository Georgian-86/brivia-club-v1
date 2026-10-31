set lock_timeout = '5s';
-- 0019_pitch_seed.sql: the pitch in the review sheet; the chat starts with the pitch (founder request 2026-11-01, D-112;
-- spec docs/superpowers/specs/2026-11-01-pitch-in-review-design.md §3).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0013-0018 (see README.md "## 0019"). 0001-0018 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
-- Each redefinition below is copied from the LATEST definition and only gains the change named beside it.
--
-- What changes:
--   1. A guard: 0019 refuses to run before 0013 (the seeded messages rely on 0013's select policy and withholding).
--   2. brivia_create_match: when it actually inserts the match row, it also inserts the pair's pitches as the first
--      chat messages (every match path goes through it: respond_connection_request and the like-back trigger).
--   3. report_member: the evidence also keeps the pair's request notes (kind = 'pitch'), so a report about a pitch
--      that never became a message still carries it.
-- (supabase/tests/i-pitch-seed.test.sql)

-- 1. Dependency guard (0013).
do $$
begin
  if to_regprocedure('brivia_private.brivia_message_visible(uuid,uuid,uuid)') is null then
    raise exception '0019 needs 0013 (brivia_private.brivia_message_visible is missing): apply 0013 first';
  end if;
end $$;

-- 2. brivia_create_match: copied from 0002_p0_privacy_consent.sql:119; only it becomes plpgsql and, when the match row
-- is actually inserted, seeds the pair's pitches. Seeded: every request between the pair, either direction, whose
-- status is pending or accepted (both callers mark the requests accepted before calling; a pending reverse note is
-- kept too) and whose note is not blank. Each becomes a text message from the request's sender to its recipient, at
-- the request's created_at, so the pitch sorts first. Still invoker (its callers are security definer) and revoked
-- from every client role. A blocked pair never reaches it (both callers check the block first).
-- created_at: brivia_server_created_at (0003) resets created_at to now() for any insert outside an owner session,
-- which is the case live (session_user is PostgREST's authenticator). The row is therefore inserted, then its
-- created_at is set to the request's time by an update (brivia_messages has no update trigger or client update grant).
create or replace function public.brivia_create_match(first_user uuid, second_user uuid)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  v_inserted int;
  r record;
  v_id uuid;
begin
  insert into public.matches(user1_id, user2_id)
  select least(first_user, second_user), greatest(first_user, second_user)
  where not exists (
    select 1 from public.matches m
    where (m.user1_id = first_user and m.user2_id = second_user)
       or (m.user1_id = second_user and m.user2_id = first_user)
  )
  on conflict (user1_id, user2_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return;   -- the match already existed: nothing is seeded again
  end if;
  for r in
    select c.from_id, c.to_id, c.note, c.created_at
      from public.connection_requests c
     where ((c.from_id = first_user and c.to_id = second_user) or (c.from_id = second_user and c.to_id = first_user))
       and c.status in ('pending', 'accepted')
       and nullif(btrim(c.note), '') is not null
     order by c.created_at, c.from_id
  loop
    insert into public.brivia_messages (sender_id, recipient_id, body, message_type)
    values (r.from_id, r.to_id, r.note, 'text')
    returning id into v_id;
    update public.brivia_messages set created_at = r.created_at where id = v_id;
  end loop;
end;
$$;
revoke all on function public.brivia_create_match(uuid, uuid) from public, anon, authenticated;

-- 3. report_member: copied from 0008_tester_world.sql:418; only the evidence also gains the pair's request notes as
-- kind = 'pitch' entries (from_me, body, kind, attachment_path null, at: the shape of the message entries), read before
-- the block like the rest of the evidence, in addition to the last 50 messages (spec §3.3, arena F-3).
create or replace function public.report_member(p_target uuid, p_reason text, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_note text;
  v_world boolean;
  v_qual boolean;
  v_evidence jsonb;
begin
  perform 1 from public.profiles where id = uid for update;   -- also serialises this member's calls (the cap)
  if uid is null or not found then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  insert into public.report_attempt (reporter_id) values (uid);
  if (select count(*) from public.report_attempt where reporter_id = uid and at > now() - interval '24 hours') > 10 then
    raise exception 'report_cap' using errcode = 'PT429';
  end if;
  if p_reason is null or p_reason not in ('harassment', 'explicit', 'spam', 'fake', 'underage', 'safety', 'other') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  -- control characters (C0, DEL, C1), zero-width and bidi characters stripped; only newline and tab survive
  v_note := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[\x00-\x08\x0b-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069]', '', 'g'), E' \t\r\n'), '');
  if char_length(v_note) > 500 then
    raise exception 'note too long' using errcode = '22023';
  end if;
  if p_target is null or p_target = uid or not exists (select 1 from public.profiles where id = p_target) then
    return;
  end if;
  -- Qualification and evidence are read BEFORE the block: a block deletes the pair's pending requests (0003), which are
  -- one of the relations that qualify a report.
  select public.brivia_in_test_world(uid) = public.brivia_in_test_world(p_target)
    into v_world;
  v_qual := coalesce(v_world, false)
    and public.brivia_member_completed(uid)
    and (select created_at <= now() - interval '7 days' from public.profiles where id = uid)
    and (exists (select 1 from public.interaction i
                  where i.event <> 'impression'   -- impressions are written automatically by the deck and search
                    and ((i.viewer_id = uid and i.target_id = p_target) or (i.viewer_id = p_target and i.target_id = uid)))
         or exists (select 1 from public.connection_requests c
                     where (c.from_id = uid and c.to_id = p_target) or (c.from_id = p_target and c.to_id = uid))
         or exists (select 1 from public.matches m
                     where (m.user1_id = uid and m.user2_id = p_target) or (m.user1_id = p_target and m.user2_id = uid))
         or exists (select 1 from public.brivia_messages b
                     where (b.sender_id = uid and b.recipient_id = p_target) or (b.sender_id = p_target and b.recipient_id = uid)));
  select coalesce(jsonb_agg(e.j order by e.at desc), '[]'::jsonb) into v_evidence
    from ((select m.created_at as at,
                  jsonb_build_object('from_me', m.sender_id = uid, 'body', m.body, 'kind', m.message_type,
                                     'attachment_path', m.attachment_path, 'at', m.created_at) as j
             from public.brivia_messages m
            where (m.sender_id = uid and m.recipient_id = p_target) or (m.sender_id = p_target and m.recipient_id = uid)
            order by m.created_at desc, m.id desc
            limit 50)
          union all
          -- 0019: the pair's request notes (at most one per direction, any status), the same shape with kind 'pitch'
          (select c.created_at as at,
                  jsonb_build_object('from_me', c.from_id = uid, 'body', c.note, 'kind', 'pitch',
                                     'attachment_path', null, 'at', c.created_at) as j
             from public.connection_requests c
            where ((c.from_id = uid and c.to_id = p_target) or (c.from_id = p_target and c.to_id = uid))
              and nullif(btrim(c.note), '') is not null)) e;
  -- a report always blocks, for any existing profile in either world (exactly what a direct block insert allows)
  insert into public.brivia_blocks (blocker_id, blocked_id) values (uid, p_target) on conflict do nothing;
  if exists (select 1 from public.member_report r
              where r.reporter_id = uid and r.target_id = p_target and r.created_at > now() - interval '24 hours') then
    return;
  end if;
  insert into public.member_report (reporter_id, target_id, reason, note, evidence, qualifying)
  values (uid, p_target, p_reason, v_note, v_evidence, v_qual);
  if v_qual then
    -- Serialise qualifying reports about one target (F8): two concurrent reports must not each count only themselves
    -- and both miss the 2-reporter threshold. The count below runs after the lock, on a fresh snapshot.
    perform pg_advisory_xact_lock(hashtext('report:' || p_target::text));
    if (select count(distinct r.reporter_id) from public.member_report r
         where r.target_id = p_target and r.qualifying and r.reporter_id is not null
           and r.created_at > now() - interval '30 days') >= 2 then
      insert into public.member_flag (member_id, reason, expires_at)
      values (p_target, 'reported', now() + interval '90 days') on conflict (member_id) do nothing;
    end if;
    if p_reason = 'underage' then
      insert into public.member_flag (member_id, reason, expires_at) values (p_target, 'suspended_pending_review', null)
      on conflict (member_id) do update
        set reason = 'suspended_pending_review', flagged_at = now(), expires_at = null
        where public.member_flag.reason in ('reported', 'rejoin_review');
    end if;
  end if;
end;
$$;
revoke all on function public.report_member(uuid, text, text) from public, anon;
grant execute on function public.report_member(uuid, text, text) to authenticated;
