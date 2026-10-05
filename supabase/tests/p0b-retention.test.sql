set brivia.harness_autocomplete = 'off';
-- Iteration 4 (P0-B), Task 5: the retention purge (R7). Rows just inside and just outside each boundary; run
-- purge_expired_requests(); assert what is kept and what is deleted. The signature and return value are unchanged.
-- One transaction, rolled back.
begin;
insert into auth.users(id) values ('a6000000-0000-4000-8000-000000000001'), ('a6000000-0000-4000-8000-000000000002'),
  ('a6000000-0000-4000-8000-000000000003') on conflict do nothing;
insert into public.profiles (id, name, full_name, email) values
  ('a6000000-0000-4000-8000-000000000001', 'R1', 'R1', 'r1@example.com'),
  ('a6000000-0000-4000-8000-000000000002', 'R2', 'R2', 'r2@example.com'),
  ('a6000000-0000-4000-8000-000000000003', 'R3', 'R3', 'r3@example.com') on conflict (id) do nothing;

-- interactions: viewer 1 -> target 2, one row per (event, age) with distinct targets via viewer/target swap and ids
create temp table t_inter (tag text, ev text, age interval, keep boolean);
insert into t_inter values
  ('like-in', 'like', '179 days', true), ('like-out', 'like', '181 days', false),
  ('pass-in', 'pass', '179 days', true), ('pass-out', 'pass', '181 days', false),
  ('req-in', 'request', '364 days', true), ('req-out', 'request', '366 days', false),
  ('acc-in', 'accept', '364 days', true), ('acc-out', 'accept', '366 days', false),
  ('dec-in', 'decline', '364 days', true), ('dec-out', 'decline', '366 days', false),
  ('met-in', 'met', '364 days', true), ('met-out', 'met', '366 days', false),
  ('let-in', 'letgo', '364 days', true), ('let-out', 'letgo', '366 days', false),
  ('imp-in', 'impression', '29 days', true), ('imp-out', 'impression', '31 days', false),
  ('imp-old-kept?', 'impression', '200 days', false);
-- the 0003 table is unique per (viewer, target, event, ...) for some events; spread rows across context surfaces
insert into public.interaction (viewer_id, target_id, event, context, created_at)
select 'a6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002', ev,
       jsonb_build_object('surface', tag), now() - age
  from t_inter;

-- reports
insert into public.member_report (reporter_id, target_id, reason, qualifying, created_at) values
  ('a6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002', 'spam', false, now() - interval '364 days'),
  ('a6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000003', 'fake', false, now() - interval '366 days');
-- attempts
insert into public.report_attempt (reporter_id, at) values
  ('a6000000-0000-4000-8000-000000000001', now() - interval '29 days'),
  ('a6000000-0000-4000-8000-000000000001', now() - interval '31 days');
-- flags: auto (expires) due / not due / founder (no expiry) / suspension
insert into public.member_flag (member_id, reason, expires_at) values
  ('a6000000-0000-4000-8000-000000000001', 'reported', now() - interval '1 hour'),
  ('a6000000-0000-4000-8000-000000000002', 'reported', now() + interval '1 hour'),
  ('a6000000-0000-4000-8000-000000000003', 'restricted', null);
-- tombstones
insert into public.moderation_tombstone (digest, reasons, report_ids, expires_at) values
  ('due', '{spam}', '{1}', now() - interval '1 minute'), ('live', '{spam}', '{2}', now() + interval '1 minute');
-- consent events: member A deleted > 1 y ago (all rows go), B deleted < 1 y ago (rows stay), C never deleted
insert into public.consent_event (member_id, kind, notice_version, at) values
  ('a6100000-0000-4000-8000-00000000000a', 'adult', 'x', now() - interval '800 days'),
  ('a6100000-0000-4000-8000-00000000000a', 'account_deleted', null, now() - interval '366 days'),
  ('a6100000-0000-4000-8000-00000000000b', 'adult', 'x', now() - interval '400 days'),
  ('a6100000-0000-4000-8000-00000000000b', 'account_deleted', null, now() - interval '364 days'),
  ('a6100000-0000-4000-8000-00000000000c', 'adult', 'x', now() - interval '900 days');
-- career applications
-- (the insert trigger ignores a supplied created_at, so the age is set afterwards)
insert into public.career_applications (role, name, email, resume_path, resume_name, resume_size) values
  ('in', 'old', 'o@x.y', 'p1', 'n', 1), ('in', 'new', 'n@x.y', 'p2', 'n', 1);
update public.career_applications set created_at = now() - interval '181 days' where name = 'old';
update public.career_applications set created_at = now() - interval '179 days' where name = 'new';
-- pre-existing deletes still happen: an old ledger row and a stale request
insert into public.signal_ledger (sender_id, to_id, at) values
  ('a6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002', now() - interval '31 days'),
  ('a6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000003', now() - interval '29 days');
insert into public.connection_requests (from_id, to_id, status, created_at)
values ('a6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000003', 'pending', now() - interval '40 days');

do $$
declare n int;
begin
  n := public.purge_expired_requests();
  if n <> 1 then raise exception 'FAIL: purge returned % (expected the 1 stale request)', n; end if;
  -- interactions
  if exists (select 1 from public.interaction i join t_inter t on t.tag = i.context ->> 'surface' where not t.keep) then
    raise exception 'FAIL: interactions past their boundary remain: %',
      (select string_agg(t.tag, ',') from public.interaction i join t_inter t on t.tag = i.context ->> 'surface' where not t.keep);
  end if;
  if (select count(*) from public.interaction i join t_inter t on t.tag = i.context ->> 'surface' where t.keep) <> (select count(*) from t_inter where keep) then
    raise exception 'FAIL: interactions inside their boundary were deleted: kept %',
      (select string_agg(t.tag, ',') from public.interaction i join t_inter t on t.tag = i.context ->> 'surface' where t.keep);
  end if;
  -- reports and attempts
  if (select count(*) from public.member_report) <> 1 or not exists (select 1 from public.member_report where reason = 'spam') then
    raise exception 'FAIL: member_report boundary (365 d)';
  end if;
  if (select count(*) from public.report_attempt) <> 1 then raise exception 'FAIL: report_attempt boundary (30 d)'; end if;
  -- flags: only the due auto flag goes; founder and unexpired stay
  if exists (select 1 from public.member_flag where member_id = 'a6000000-0000-4000-8000-000000000001') then raise exception 'FAIL: due auto flag kept'; end if;
  if (select count(*) from public.member_flag where member_id in ('a6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000003')) <> 2 then
    raise exception 'FAIL: an unexpired or founder flag was deleted';
  end if;
  -- tombstones
  if (select string_agg(digest, ',') from public.moderation_tombstone) is distinct from 'live' then raise exception 'FAIL: tombstone expiry'; end if;
  -- consent events
  if exists (select 1 from public.consent_event where member_id = 'a6100000-0000-4000-8000-00000000000a') then raise exception 'FAIL: consent log of a member deleted > 1 y ago kept'; end if;
  if (select count(*) from public.consent_event where member_id = 'a6100000-0000-4000-8000-00000000000b') <> 2 then raise exception 'FAIL: consent log of a member deleted < 1 y ago purged'; end if;
  if (select count(*) from public.consent_event where member_id = 'a6100000-0000-4000-8000-00000000000c') <> 1 then raise exception 'FAIL: consent log of a live member purged'; end if;
  -- careers
  if (select string_agg(name, ',') from public.career_applications where name in ('old', 'new')) is distinct from 'new' then raise exception 'FAIL: career_applications 180 d: %', (select string_agg(name, ',') from public.career_applications); end if;
  -- existing deletes
  if (select count(*) from public.signal_ledger where sender_id = 'a6000000-0000-4000-8000-000000000001') <> 1 then raise exception 'FAIL: signal_ledger 30 d'; end if;
  -- idempotent
  if public.purge_expired_requests() <> 0 then raise exception 'FAIL: second purge deleted request rows'; end if;
end $$;
rollback;
select 'p0b-retention: ok' as result;
