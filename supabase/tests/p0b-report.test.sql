set brivia.harness_autocomplete = 'off';
-- Iteration 4 (P0-B), Task 4: report_member, flags, suspension, rejoin tombstone (R4, R6).
--   R1 one qualifying report: report row + block, no flag; same pair within 24 h is a no-op
--   R2 a second distinct qualifying reporter: 'reported' flag (90 d expiry) and the target leaves refresh_cell_density
--   R3 non-qualifying reports (new account, no relation, incomplete reporter, other world) never flag
--   R4 same-world and other-world targets leave the same block footprint; unknown id and self write nothing
--   R5 the 11th call in 24 h is PT429, even after 10 no-ops; bad reason 22023
--   R6 underage: qualifying report suspends (not completed); 'restricted' is never overridden, 'rejoin_review' is
--   R7 evidence = last 50 messages, newest first; note sanitised
--   R8 pre-existing blocks either way: no error
--   R9 clients cannot read the new tables or the digest; R10 tombstone rejoin -> rejoin_review
--   R11 reports survive the target's deletion; reporter_id is nulled when the reporter is deleted
--   R12 an undeclared member can still withdraw sensitive consent (carried-in fix)
-- Client sessions use SET LOCAL SESSION AUTHORIZATION. One transaction, rolled back.
begin;

create or replace function pg_temp.id(n int) returns uuid language sql as
$$ select ('a4000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- A member: profile (declared), a cell, 20 points (when done), aged age_days, world w.
create or replace function pg_temp.mk(n int, age_days int, done boolean, w boolean default false, p_email text default null)
returns void language plpgsql as $f$
declare mid uuid := pg_temp.id(n); cell text := public.brivia_grid_cell(18.5204, 73.8567, 7);
begin
  insert into auth.users(id, email) values (mid, coalesce(p_email, 'rp' || n || '@example.com')) on conflict do nothing;
  insert into public.profiles (id, name, full_name, email, is_test)
  values (mid, 'Report ' || n, 'Report ' || n, coalesce(p_email, 'rp' || n || '@example.com'), w) on conflict (id) do nothing;
  update public.profiles set adult_declared_at = now(), created_at = now() - make_interval(days => age_days) where id = mid;
  if done then
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), 'in-pune')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points, mode)
    values (mid, 'sports.racket.badminton', 20, 'play') on conflict do nothing;
  end if;
end $f$;

-- Call report_member as a signed-in client, then restore the owner session.
create or replace function pg_temp.rep(p_by uuid, p_target uuid, p_reason text, p_note text default null)
returns void language plpgsql as $f$
begin
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_by)::text, true);
  perform public.report_member(p_target, p_reason, p_note);
  reset role; reset session authorization;
end $f$;

select pg_temp.mk(1, 10, true);    -- A  qualifying reporter
select pg_temp.mk(2, 10, true);    -- B  qualifying reporter
select pg_temp.mk(3, 20, true);    -- T  target
select pg_temp.mk(4, 20, true, true);   -- W  target in the other world
select pg_temp.mk(5, 1, true);     -- C  new account
select pg_temp.mk(6, 10, true);    -- E  aged, no relation
select pg_temp.mk(7, 10, false);   -- F  aged, relation, not completed
select pg_temp.mk(8, 20, true);    -- T2 target
select pg_temp.mk(9, 20, true);    -- U  underage target
select pg_temp.mk(10, 20, true);   -- R  restricted target
select pg_temp.mk(11, 20, true);   -- X  evidence target
select pg_temp.mk(12, 10, true);   -- G  cap reporter
select pg_temp.mk(13, 20, true);   -- BL blocked A
select pg_temp.mk(14, 20, true);   -- BK blocked by A
select pg_temp.mk(21, 20, true);   -- RJ rejoin_review target
-- relations
insert into public.interaction (viewer_id, target_id, event) values
  (pg_temp.id(1), pg_temp.id(3), 'like'), (pg_temp.id(1), pg_temp.id(4), 'like'),
  (pg_temp.id(5), pg_temp.id(8), 'like');
insert into public.brivia_messages (sender_id, recipient_id, body) values (pg_temp.id(3), pg_temp.id(2), 'hello from T');
insert into public.connection_requests (from_id, to_id) values (pg_temp.id(1), pg_temp.id(9)), (pg_temp.id(7), pg_temp.id(8)),
  (pg_temp.id(1), pg_temp.id(10)), (pg_temp.id(1), pg_temp.id(21));
insert into public.matches (user1_id, user2_id) values (pg_temp.id(8), pg_temp.id(5));
insert into public.member_flag (member_id, reason) values (pg_temp.id(10), 'restricted');
insert into public.member_flag (member_id, reason) values (pg_temp.id(21), 'rejoin_review');

-- R9 first (cheap): clients cannot read the new tables or call the digest.
do $$
declare stmt text; failed boolean;
begin
  foreach stmt in array array['select * from public.member_report', 'select * from public.report_attempt',
                              'select * from public.moderation_tombstone', 'select * from public.moderation_pepper',
                              'select public.brivia_email_digest(''a@b.c'')',
                              'insert into public.report_attempt(reporter_id) values (''a4000000-0000-4000-8000-000000000001'')'] loop
    failed := false;
    set local session authorization authenticated; set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(1))::text, true);
    begin execute stmt; exception when insufficient_privilege then failed := true; end;
    reset role; reset session authorization;
    if not failed then raise exception 'FAIL R9: a client may run %', stmt; end if;
  end loop;
  if has_function_privilege('anon', 'public.report_member(uuid,text,text)', 'execute') then raise exception 'FAIL R9: anon may report'; end if;
  if not has_function_privilege('authenticated', 'public.report_member(uuid,text,text)', 'execute') then raise exception 'FAIL R9: authenticated cannot report'; end if;
end $$;

-- R1: A reports T (qualifying); one report, a block, no flag; duplicate within 24 h changes nothing.
do $$
declare a uuid := pg_temp.id(1); t uuid := pg_temp.id(3); n int;
begin
  perform pg_temp.rep(a, t, 'harassment', E'  rude \u0001 messages\t ');
  select count(*) into n from public.member_report where reporter_id = a and target_id = t;
  if n <> 1 then raise exception 'FAIL R1: % reports', n; end if;
  if not (select qualifying from public.member_report where reporter_id = a and target_id = t) then raise exception 'FAIL R1: report not qualifying'; end if;
  if (select note from public.member_report where reporter_id = a and target_id = t) <> 'rude  messages' then
    raise exception 'FAIL R1: note not sanitised: [%]', (select note from public.member_report where reporter_id = a and target_id = t); end if;
  if not exists (select 1 from public.brivia_blocks where blocker_id = a and blocked_id = t) then raise exception 'FAIL R1: no block'; end if;
  if exists (select 1 from public.member_flag where member_id = t) then raise exception 'FAIL R1: one qualifying report flagged'; end if;
  perform pg_temp.rep(a, t, 'spam');
  select count(*) into n from public.member_report where reporter_id = a and target_id = t;
  if n <> 1 then raise exception 'FAIL R1: duplicate within 24 h wrote a second report (%)', n; end if;
  -- the empty note becomes null
  perform pg_temp.rep(pg_temp.id(6), t, 'fake', E' \u0002 ');   -- E is not qualifying: no effect on the flag count
  if (select note from public.member_report where reporter_id = pg_temp.id(6) and target_id = t) is not null then raise exception 'FAIL R1: empty note not null'; end if;
  delete from public.member_report where reporter_id = pg_temp.id(6) and target_id = t;   -- (owner) keep R3 clean
  delete from public.brivia_blocks where blocker_id = pg_temp.id(6);
  delete from public.report_attempt where reporter_id = pg_temp.id(6);
end $$;

-- R2: B (qualifying) as the second reporter flags T; the flag expires in ~90 d; T leaves the cell count.
do $$
declare t uuid := pg_temp.id(3); v_cell text; n0 int; n1 int; ex timestamptz;
begin
  select home_cell into v_cell from public.member_orbit where member_id = t;
  select d.n into n0 from public.cell_density d where d.cell = v_cell and not d.is_test;
  perform pg_temp.rep(pg_temp.id(2), t, 'harassment');
  if not exists (select 1 from public.member_flag where member_id = t and reason = 'reported') then raise exception 'FAIL R2: no flag after 2 qualifying reporters'; end if;
  select expires_at into ex from public.member_flag where member_id = t;
  if ex is null or ex < now() + interval '89 days' or ex > now() + interval '91 days' then raise exception 'FAIL R2: expiry %', ex; end if;
  select d.n into n1 from public.cell_density d where d.cell = v_cell and not d.is_test;
  if n1 <> n0 - 1 then raise exception 'FAIL R2: cell count % -> % (target not counted out)', n0, n1; end if;
end $$;

-- R3: non-qualifying reports never flag; each is stored with qualifying = false.
do $$
declare t constant uuid := pg_temp.id(8); r int;
begin
  perform pg_temp.rep(pg_temp.id(5), t, 'spam');    -- new account (relation exists)
  perform pg_temp.rep(pg_temp.id(6), t, 'spam');    -- aged, no relation
  perform pg_temp.rep(pg_temp.id(7), t, 'spam');    -- aged, relation, not completed
  perform pg_temp.rep(pg_temp.id(1), pg_temp.id(4), 'spam');   -- other world (relation exists)
  select count(*) into r from public.member_report where target_id in (t, pg_temp.id(4));
  if r <> 4 then raise exception 'FAIL R3: % reports', r; end if;
  if exists (select 1 from public.member_report where target_id in (t, pg_temp.id(4)) and qualifying) then raise exception 'FAIL R3: a non-qualifying report is qualifying'; end if;
  if exists (select 1 from public.member_flag where member_id in (t, pg_temp.id(4))) then raise exception 'FAIL R3: non-qualifying reports flagged'; end if;
end $$;

-- R4: same-world and other-world target leave the same footprint; unknown id and self write nothing but the attempt.
do $$
declare a uuid := pg_temp.id(1); b0 int; r0 int; at0 int; unk constant uuid := 'a4ffffff-0000-4000-8000-000000000000';
begin
  if not exists (select 1 from public.brivia_blocks where blocker_id = a and blocked_id = pg_temp.id(3))
     or not exists (select 1 from public.brivia_blocks where blocker_id = a and blocked_id = pg_temp.id(4)) then
    raise exception 'FAIL R4: the block footprint differs between a same-world and an other-world report'; end if;
  if (select count(*) from public.brivia_blocks where blocker_id = a and blocked_id in (pg_temp.id(3), pg_temp.id(4))) <> 2 then raise exception 'FAIL R4: block count'; end if;
  select count(*) into b0 from public.brivia_blocks; select count(*) into r0 from public.member_report;
  select count(*) into at0 from public.report_attempt where reporter_id = a;
  perform pg_temp.rep(a, unk, 'spam');
  perform pg_temp.rep(a, a, 'spam');
  if (select count(*) from public.brivia_blocks) <> b0 or (select count(*) from public.member_report) <> r0 then raise exception 'FAIL R4: unknown id or self wrote a block or report'; end if;
  if (select count(*) from public.report_attempt where reporter_id = a) <> at0 + 2 then raise exception 'FAIL R4: the no-ops were not charged'; end if;
end $$;

-- R5: the cap is charged first: 10 no-ops, the 11th is PT429; a bad reason is 22023 (and charged).
do $$
declare g constant uuid := pg_temp.id(12); i int; code text; bad text;
begin
  begin perform pg_temp.rep(g, pg_temp.id(3), 'nonsense'); exception when sqlstate '22023' then bad := 'ok'; end;
  if bad is distinct from 'ok' then raise exception 'FAIL R5: a bad reason is not 22023'; end if;
  begin perform pg_temp.rep(g, pg_temp.id(3), null); exception when sqlstate '22023' then bad := 'ok2'; end;
  if bad is distinct from 'ok2' then raise exception 'FAIL R5: a null reason is not 22023'; end if;
  delete from public.report_attempt where reporter_id = g;
  for i in 1..10 loop perform pg_temp.rep(g, g, 'spam'); end loop;   -- ten no-ops (self)
  begin perform pg_temp.rep(g, pg_temp.id(3), 'spam'); exception when sqlstate 'PT429' then code := 'PT429'; end;
  if code is distinct from 'PT429' then raise exception 'FAIL R5: the 11th call was not PT429'; end if;
  if exists (select 1 from public.member_report where reporter_id = g) then raise exception 'FAIL R5: a capped call wrote a report'; end if;
end $$;

-- R6: a qualifying underage report suspends; 'restricted' stays; 'rejoin_review' is replaced; the target is not completed.
do $$
declare a constant uuid := pg_temp.id(1);
begin
  if not public.brivia_member_completed(pg_temp.id(9)) then raise exception 'FAIL R6 setup: U not completed'; end if;
  perform pg_temp.rep(a, pg_temp.id(9), 'underage');
  if (select reason from public.member_flag where member_id = pg_temp.id(9)) is distinct from 'suspended_pending_review' then raise exception 'FAIL R6: U not suspended'; end if;
  if public.brivia_member_completed(pg_temp.id(9)) then raise exception 'FAIL R6: a suspended member is completed'; end if;
  perform pg_temp.rep(a, pg_temp.id(10), 'underage');
  if (select reason from public.member_flag where member_id = pg_temp.id(10)) is distinct from 'restricted' then raise exception 'FAIL R6: restricted was overridden'; end if;
  perform pg_temp.rep(a, pg_temp.id(21), 'underage');
  if (select reason from public.member_flag where member_id = pg_temp.id(21)) is distinct from 'suspended_pending_review' then raise exception 'FAIL R6: rejoin_review not replaced'; end if;
  -- a non-qualifying underage report does not suspend
  perform pg_temp.rep(pg_temp.id(6), pg_temp.id(11), 'underage');
  if exists (select 1 from public.member_flag where member_id = pg_temp.id(11)) then raise exception 'FAIL R6: a non-qualifying underage report suspended'; end if;
  delete from public.member_report where target_id = pg_temp.id(11);
end $$;

-- R7: evidence = the last 50 messages of the pair, newest first, from the reporter's point of view.
do $$
declare a constant uuid := pg_temp.id(1); x constant uuid := pg_temp.id(11); ev jsonb;
begin
  insert into public.brivia_messages (sender_id, recipient_id, body, message_type, created_at)
  select case when i % 2 = 0 then a else x end, case when i % 2 = 0 then x else a end, 'm' || i, 'text',
         now() - make_interval(mins => 100 - i)
    from generate_series(1, 60) i;
  insert into public.brivia_messages (sender_id, recipient_id, body, created_at)   -- another pair: never evidence
    values (pg_temp.id(2), x, 'not the pair', now());
  perform pg_temp.rep(a, x, 'harassment');
  select evidence into ev from public.member_report where reporter_id = a and target_id = x;
  if jsonb_array_length(ev) <> 50 then raise exception 'FAIL R7: % evidence items', jsonb_array_length(ev); end if;
  if ev->0->>'body' <> 'm60' or ev->49->>'body' <> 'm11' then raise exception 'FAIL R7: order % .. %', ev->0->>'body', ev->49->>'body'; end if;
  if (ev->0->>'from_me')::boolean is not true or (ev->1->>'from_me')::boolean is not false then raise exception 'FAIL R7: from_me'; end if;
  if not (ev->0 ? 'kind' and ev->0 ? 'attachment_path' and ev->0 ? 'at') then raise exception 'FAIL R7: keys'; end if;
  if exists (select 1 from jsonb_array_elements(ev) e where e->>'body' = 'not the pair') then raise exception 'FAIL R7: a third-party message leaked'; end if;
end $$;

-- R8: reporting someone who blocked you, or whom you blocked, is not an error.
do $$
declare a constant uuid := pg_temp.id(1);
begin
  delete from public.report_attempt where reporter_id = a;   -- (owner) A has used its cap above
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.id(13), a), (a, pg_temp.id(14));
  perform pg_temp.rep(a, pg_temp.id(13), 'other');
  perform pg_temp.rep(a, pg_temp.id(14), 'other');
  if not exists (select 1 from public.member_report where reporter_id = a and target_id = pg_temp.id(13))
     or not exists (select 1 from public.member_report where reporter_id = a and target_id = pg_temp.id(14)) then raise exception 'FAIL R8: reports missing'; end if;
  if (select count(*) from public.brivia_blocks where blocker_id = a and blocked_id = pg_temp.id(14)) <> 1 then raise exception 'FAIL R8: duplicate block'; end if;
end $$;

-- R10: tombstone rejoin. A live tombstone for the digest of a new member's email -> rejoin_review; others not.
select pg_temp.mk(15, 0, false, false, 'Rejoin@Example.com');
select pg_temp.mk(16, 0, false, false, 'fresh@example.com');
select pg_temp.mk(17, 0, false, false, 'expired@example.com');
update public.profiles set adult_declared_at = null where id in (pg_temp.id(15), pg_temp.id(16), pg_temp.id(17));
insert into public.moderation_tombstone (digest, reasons, report_ids, expires_at) values
  (public.brivia_email_digest(' rejoin@example.com'), array['harassment'], array[1::bigint], now() + interval '300 days'),
  (public.brivia_email_digest('expired@example.com'), array['spam'], array[2::bigint], now() - interval '1 day');
do $$
declare m uuid;
begin
  foreach m in array array[pg_temp.id(15), pg_temp.id(16), pg_temp.id(17)] loop
    set local session authorization authenticated; set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true);
    perform public.declare_adult(public.brivia_notice_version());
    reset role; reset session authorization;
  end loop;
  if (select reason from public.member_flag where member_id = pg_temp.id(15)) is distinct from 'rejoin_review' then raise exception 'FAIL R10: no rejoin_review'; end if;
  if exists (select 1 from public.member_flag where member_id in (pg_temp.id(16), pg_temp.id(17))) then raise exception 'FAIL R10: flagged without a live tombstone'; end if;
  if (select count(*) from public.profiles where id in (pg_temp.id(15), pg_temp.id(16), pg_temp.id(17)) and adult_declared_at is not null) <> 3 then raise exception 'FAIL R10: declare_adult behaviour changed'; end if;
  if public.brivia_email_digest('REJOIN@example.com ') <> public.brivia_email_digest('rejoin@example.com') then raise exception 'FAIL R10: digest not normalised'; end if;
  if length(public.brivia_email_digest('x@y.z')) <> 64 then raise exception 'FAIL R10: digest length'; end if;
end $$;

-- R11: reports survive the target's deletion; reporter_id is nulled when the reporter goes.
select pg_temp.mk(18, 20, true); select pg_temp.mk(19, 10, true); select pg_temp.mk(22, 10, true);
do $$
begin
  perform pg_temp.rep(pg_temp.id(19), pg_temp.id(18), 'spam');
  perform pg_temp.rep(pg_temp.id(22), pg_temp.id(11), 'spam');
  delete from auth.users where id = pg_temp.id(18);
  if not exists (select 1 from public.member_report where target_id = pg_temp.id(18)) then raise exception 'FAIL R11: report vanished with the target'; end if;
  delete from auth.users where id = pg_temp.id(22);
  if exists (select 1 from public.member_report where target_id = pg_temp.id(11) and reporter_id = pg_temp.id(22)) then raise exception 'FAIL R11: reporter id kept'; end if;
  if not exists (select 1 from public.member_report where target_id = pg_temp.id(11) and reporter_id is null) then raise exception 'FAIL R11: report lost with the reporter'; end if;
end $$;

-- R12: an undeclared member (owner-written data) can still withdraw sensitive consent through a client session.
do $$
declare z constant uuid := pg_temp.id(20); pts text;
begin
  insert into auth.users(id) values (z) on conflict do nothing;
  insert into public.profiles (id, name, full_name, email, city) values (z, 'Undeclared Z', 'Undeclared Z', 'z20@example.com', 'Pune') on conflict (id) do nothing;
  update public.profiles set adult_declared_at = null, sensitive_consent_at = now() where id = z;
  insert into public.member_interest (member_id, interest_id, points, mode) values
    (z, 'sports.racket.badminton', 12, 'play'), (z, 'community.social.lgbtq', 8, 'play');
  set local session authorization authenticated; set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', z)::text, true);
  perform public.set_sensitive_consent(false);
  reset role; reset session authorization;
  select string_agg(interest_id || '=' || points, ',') into pts from public.member_interest where member_id = z;
  if pts <> 'sports.racket.badminton=20' then raise exception 'FAIL R12: points are %', pts; end if;
  -- the bypass is not open to a client that sets the flag itself: a direct write for an undeclared member is refused
  declare denied boolean := false;
  begin
    set local session authorization authenticated; set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', z)::text, true);
    perform set_config('brivia.consent_write', 'on', true);
    begin
      perform public.set_member_interests('[{"interest_id":"sports.racket.badminton","points":20}]'::jsonb);
    exception when sqlstate 'P0001' then denied := true;
    end;
    reset role; reset session authorization;
    if not denied then raise exception 'FAIL R12: a client-set flag opened the adult gate'; end if;
  end;
end $$;

rollback;
