-- Iteration 3, Task 6: send_signal, the sender-only ledger and my_signal_quota() (arena Ruling A1, D-026, D-032;
-- spec §6.4). The sender's own quota is honest; every recipient-side outcome is uniform and silent.
-- Members are completed by the harness autocomplete fixture (name + city), except those created without a city.
-- Ids: f6000000-0000-0000-0000-NNNNNNNNNNNN.
--   1 S (sender)       2 N (normal)          3 B (blocked S)       4 X (S blocked X)     5 W (test world)
--   6 D (declined S)   7 U (not completed)   8 M (asked S first)   9 Q (not completed caller)
--   100-299: plain targets.
insert into auth.users(id)
select ('f6000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(1, 299) g
on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city)
select ('f6000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'Sig ' || g, 'Sig ' || g, 'sig' || g || '@example.com',
       case when g in (7, 9) then null else 'Pune' end
from generate_series(1, 299) g where g <> 5
on conflict (id) do nothing;
insert into public.profiles (id, name, full_name, email, city, is_test)
values ('f6000000-0000-0000-0000-000000000005', 'Sig 5', 'Sig 5', 'sig5@test.brivia.club', 'Pune', true)
on conflict (id) do nothing;
create or replace function pg_temp.s6(n int) returns uuid language sql immutable as $$
  select ('f6000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

do $$ begin
  if not public.brivia_member_completed(pg_temp.s6(1)) or not public.brivia_member_completed(pg_temp.s6(5))
     or public.brivia_member_completed(pg_temp.s6(7)) or public.brivia_member_completed(pg_temp.s6(9)) then
    raise exception 'FAIL setup: fixture completion is not as expected';
  end if;
end $$;

-- 1. Shape, grants and privileges.
do $$
declare t text; f text; n int;
begin
  foreach t in array array['public.signal_ledger', 'public.brivia_config'] loop
    if to_regclass(t) is null then raise exception 'FAIL: % missing', t; end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass(t)) then raise exception 'FAIL: RLS off on %', t; end if;
    select count(*) into n from information_schema.role_table_grants
     where table_schema = 'public' and table_name = split_part(t, '.', 2) and grantee in ('anon', 'authenticated', 'PUBLIC');
    if n <> 0 then raise exception 'FAIL: % client privileges on %', n, t; end if;
    select count(*) into n from information_schema.column_privileges
     where table_schema = 'public' and table_name = split_part(t, '.', 2) and grantee in ('anon', 'authenticated', 'PUBLIC');
    if n <> 0 then raise exception 'FAIL: % client column privileges on %', n, t; end if;
  end loop;
  -- to_id has no foreign key: an attempt at a non-existent id is charged like any other.
  if exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
              where c.conrelid = 'public.signal_ledger'::regclass and c.contype = 'f' and a.attname = 'to_id') then
    raise exception 'FAIL: signal_ledger.to_id has a foreign key';
  end if;
  if not exists (select 1 from pg_indexes where tablename = 'signal_ledger' and indexdef ~ '\(sender_id, kind, at\)') then
    raise exception 'FAIL: signal_ledger (sender_id, kind, at) index missing';
  end if;
  foreach f in array array['public.send_signal(uuid,text)', 'public.my_signal_quota()'] loop
    if to_regprocedure(f) is null then raise exception 'FAIL: % missing', f; end if;
    if not (select prosecdef and proconfig @> array['search_path=public'] from pg_proc where oid = to_regprocedure(f)) then
      raise exception 'FAIL: % must be security definer with search_path=public', f;
    end if;
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL: anon can execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL: authenticated cannot execute %', f; end if;
  end loop;
  if (select provolatile from pg_proc where oid = to_regprocedure('public.send_signal(uuid,text)')) <> 'v' then
    raise exception 'FAIL: send_signal must be volatile (POST only)';
  end if;
  -- Raw client inserts into connection_requests are gone: no table or column insert, no insert policy.
  if has_table_privilege('authenticated', 'public.connection_requests', 'insert')
     or has_any_column_privilege('authenticated', 'public.connection_requests', 'insert') then
    raise exception 'FAIL: authenticated may still insert into connection_requests';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'connection_requests' and cmd in ('INSERT', 'ALL')) then
    raise exception 'FAIL: connection_requests still has a client insert policy';
  end if;
end $$;

-- anon is denied both RPCs; a raw insert as a member is denied.
do $$
declare stmt text; failed boolean;
begin
  foreach stmt in array array['select * from public.send_signal(''f6000000-0000-0000-0000-000000000002'')',
                              'select * from public.my_signal_quota()'] loop
    failed := false;
    set local role anon;
    begin execute stmt; exception when insufficient_privilege then failed := true; end;
    reset role;
    if not failed then raise exception 'FAIL: anon may run %', stmt; end if;
  end loop;
  failed := false;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s6(1))::text, true);
  begin
    insert into public.connection_requests (from_id, to_id) values (pg_temp.s6(1), pg_temp.s6(2));
  exception when insufficient_privilege then failed := true;
  end;
  reset role;
  if not failed then raise exception 'FAIL: a member inserted into connection_requests directly'; end if;
end $$;

-- 2. Caller checks are honest and never charged.
do $$
declare st text; msg text; stmt text; q record;
begin
  -- a caller who is not completed
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s6(9))::text, true);
  st := null;
  begin perform * from public.send_signal(pg_temp.s6(2), 'hi');
  exception when others then st := sqlstate; msg := sqlerrm; end;
  if st is distinct from '22023' or msg <> 'complete your profile' then
    raise exception 'FAIL: incomplete caller got % %', st, msg;
  end if;
  -- the sender's own bad input
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s6(1))::text, true);
  foreach stmt in array array['select * from public.send_signal(null)',
                              'select * from public.send_signal(''f6000000-0000-0000-0000-000000000001'')'] loop
    st := null;
    begin execute stmt; exception when others then st := sqlstate; msg := sqlerrm; end;
    if st is distinct from '22023' or msg <> 'invalid signal' then raise exception 'FAIL: % gave % %', stmt, st, msg; end if;
  end loop;
  st := null;
  begin perform * from public.send_signal(pg_temp.s6(2), repeat('x', 501));
  exception when others then st := sqlstate; end;
  if st is distinct from '22001' then raise exception 'FAIL: a 501-character note gave %', st; end if;
  -- a fresh sender: full quota, no reset time
  select * into q from public.my_signal_quota();
  if q.daily_limit <> 30 or q.remaining <> 30 or q.resets_at is not null or q.live_unanswered <> 0 or q.live_limit <> 100 then
    raise exception 'FAIL: fresh quota is %', q;
  end if;
  reset role;
  if exists (select 1 from public.signal_ledger where sender_id in (pg_temp.s6(1), pg_temp.s6(9))) then
    raise exception 'FAIL: a refused call was charged';
  end if;
end $$;

-- 3. The P0-3 acceptance criterion (Review Focus 1). Blocked (both directions), cross-world, duplicate, declined,
--    unknown and not-completed targets all answer exactly like a normal target and each cost exactly one unit.
--    The sender's interaction rows do not change, and only the normal target gets a request row.
begin;
insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.s6(3), pg_temp.s6(1)), (pg_temp.s6(1), pg_temp.s6(4));
insert into public.connection_requests (from_id, to_id, status, created_at)
values (pg_temp.s6(1), pg_temp.s6(6), 'declined', now() - interval '1 day');
do $$
declare
  targets uuid[] := array[pg_temp.s6(2), pg_temp.s6(3), pg_temp.s6(4), pg_temp.s6(5), pg_temp.s6(2), pg_temp.s6(6),
                          'f6000000-dead-beef-0000-000000000000'::uuid, pg_temp.s6(7)];
  t uuid; r record; q record; prev int := 30; prev_live int := 0; i int := 0;
  rows_seen text := ''; inter_before text; inter_after text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s6(1))::text, true);
  select coalesce(string_agg(id::text || event, ',' order by id), '') into inter_before from public.interaction;
  foreach t in array targets loop
    i := i + 1;
    select * into r from public.send_signal(t, 'hello');
    select * into q from public.my_signal_quota();
    if r.status <> 'sent' then raise exception 'FAIL P0-3: target % answered %', i, r.status; end if;
    if q.remaining <> prev - 1 or r.remaining <> q.remaining then
      raise exception 'FAIL P0-3: target % moved the quota from % to % (response %)', i, prev, q.remaining, r.remaining;
    end if;
    if r.resets_at is distinct from q.resets_at or q.resets_at is null then
      raise exception 'FAIL P0-3: target % resets_at % vs %', i, r.resets_at, q.resets_at;
    end if;
    -- live_unanswered counts distinct targets: +1 for every new target, whatever its state (the duplicate adds 0)
    if q.live_unanswered <> prev_live + (case when i = 5 then 0 else 1 end) then
      raise exception 'FAIL P0-3: target % moved live_unanswered from % to %', i, prev_live, q.live_unanswered;
    end if;
    rows_seen := rows_seen || r.status || '|' || (r.remaining = prev - 1) || '|' || (r.resets_at = q.resets_at) || ';';
    prev := q.remaining; prev_live := q.live_unanswered;
  end loop;
  if rows_seen <> repeat('sent|true|true;', 8) then raise exception 'FAIL P0-3: responses differ: %', rows_seen; end if;
  select coalesce(string_agg(id::text || event, ',' order by id), '') into inter_after from public.interaction;
  if inter_before <> '' or inter_after <> inter_before then
    raise exception 'FAIL Review Focus 1: interaction rows changed (% -> %)', inter_before, inter_after;
  end if;
  reset role;
  if (select count(*) from public.signal_ledger where sender_id = pg_temp.s6(1)) <> 8 then
    raise exception 'FAIL P0-3: % ledger rows (want 8)', (select count(*) from public.signal_ledger where sender_id = pg_temp.s6(1));
  end if;
  select string_agg(right(r2.to_id::text, 2) || ':' || r2.status, ',' order by r2.to_id) into rows_seen
    from public.connection_requests r2 where r2.from_id = pg_temp.s6(1);
  if rows_seen is distinct from '02:pending,06:declined' then raise exception 'FAIL P0-3: request rows are %', rows_seen; end if;
  if exists (select 1 from public.interaction where viewer_id = pg_temp.s6(1) or target_id = pg_temp.s6(1)) then
    raise exception 'FAIL Review Focus 1: send_signal wrote an interaction row';
  end if;
end $$;
-- A request that completes a match answers 'matched' and still costs one unit.
insert into public.connection_requests (from_id, to_id) values (pg_temp.s6(8), pg_temp.s6(1));
do $$
declare r record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s6(1))::text, true);
  select * into r from public.send_signal(pg_temp.s6(8));
  if r.status <> 'matched' or r.remaining <> 21 then raise exception 'FAIL: completing request answered %', r; end if;
  reset role;
  if not exists (select 1 from public.matches where user1_id = least(pg_temp.s6(1), pg_temp.s6(8))
                                                 and user2_id = greatest(pg_temp.s6(1), pg_temp.s6(8))) then
    raise exception 'FAIL: the completing request made no match';
  end if;
  if exists (select 1 from public.interaction where viewer_id = pg_temp.s6(1)) then
    raise exception 'FAIL Review Focus 1: the matched path wrote an interaction row';
  end if;
end $$;
rollback;

-- 3b. Fix round 1 (Important): an EXISTING match answers 'matched' whatever the partner's state now. The sender can
--     already read the match row, so the status must not depend on visibility: a partner who has since blocked the
--     sender, or is no longer completed, answers exactly like an unblocked partner (same status, same quota delta).
begin;
insert into public.matches (user1_id, user2_id)
select least(pg_temp.s6(1), pg_temp.s6(i)), greatest(pg_temp.s6(1), pg_temp.s6(i)) from generate_series(11, 13) i;
insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.s6(12), pg_temp.s6(1));
delete from public.member_interest where member_id = pg_temp.s6(13);   -- 13 is no longer completed
do $$
declare t int; r record; q record; prev int := 30; prev_live int; got text := '';
begin
  if public.brivia_member_completed(pg_temp.s6(13)) then raise exception 'FAIL setup: 13 still completed'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s6(1))::text, true);
  select live_unanswered into prev_live from public.my_signal_quota();
  foreach t in array array[11, 12, 13] loop
    select * into r from public.send_signal(pg_temp.s6(t));
    select * into q from public.my_signal_quota();
    got := got || r.status || ':' || (prev - r.remaining) || ':' || (q.live_unanswered - prev_live) || ',';
    prev := r.remaining; prev_live := q.live_unanswered;
  end loop;
  reset role;
  if got <> 'matched:1:0,matched:1:0,matched:1:0,' then
    raise exception 'FAIL Review Focus 1: existing matches answer differently by partner state: %', got;
  end if;
  -- no new match is ever created off the visible path
  if (select count(*) from public.matches where pg_temp.s6(1) in (user1_id, user2_id)) <> 3 then
    raise exception 'FAIL: the match count changed';
  end if;
  if exists (select 1 from public.connection_requests where from_id = pg_temp.s6(1) and to_id in (pg_temp.s6(12), pg_temp.s6(13))) then
    raise exception 'FAIL: a request was written to an invisible partner';
  end if;
end $$;
rollback;

-- 4. The daily cap: 30 per rolling 24 h. The 31st raises PT429 signal_quota_exhausted, is not charged and writes
--    no request. A request that completes a match is never refused, and remaining stays 0.
begin;
do $$
declare i int; r record; q record; st text; msg text; first_at timestamptz;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s6(1))::text, true);
  for i in 100..129 loop
    select * into r from public.send_signal(pg_temp.s6(i));
    if r.status <> 'sent' or r.remaining <> 129 - i then raise exception 'FAIL cap: send % answered %', i - 99, r; end if;
  end loop;
  begin
    perform * from public.send_signal(pg_temp.s6(130));
  exception when others then st := sqlstate; msg := sqlerrm;
  end;
  if st is distinct from 'PT429' or msg <> 'signal_quota_exhausted' then
    raise exception 'FAIL cap: the 31st send gave % %', st, msg;
  end if;
  select * into q from public.my_signal_quota();
  if q.remaining <> 0 then raise exception 'FAIL cap: remaining % at the cap', q.remaining; end if;
  reset role;
  if (select count(*) from public.signal_ledger where sender_id = pg_temp.s6(1)) <> 30 then
    raise exception 'FAIL cap: the refused send was charged';
  end if;
  if exists (select 1 from public.connection_requests where from_id = pg_temp.s6(1) and to_id = pg_temp.s6(130)) then
    raise exception 'FAIL cap: the refused send wrote a request';
  end if;
  -- resets_at: the oldest attempt plus 24 h, rounded up to the hour
  select min(at) into first_at from public.signal_ledger where sender_id = pg_temp.s6(1);
  if q.resets_at <> date_trunc('hour', q.resets_at) or q.resets_at < first_at + interval '24 hours'
     or q.resets_at >= first_at + interval '25 hours' then
    raise exception 'FAIL cap: resets_at % for an oldest attempt at %', q.resets_at, first_at;
  end if;
  -- the completion case at the cap
  insert into public.connection_requests (from_id, to_id) values (pg_temp.s6(140), pg_temp.s6(1));
  set local role authenticated;
  select * into r from public.send_signal(pg_temp.s6(140));
  if r.status <> 'matched' or r.remaining <> 0 then raise exception 'FAIL cap: completing request at the cap answered %', r; end if;
  reset role;
  if (select count(*) from public.signal_ledger where sender_id = pg_temp.s6(1)) <> 31 then
    raise exception 'FAIL cap: the completing request was not charged';
  end if;
  -- a reverse request from someone the sender cannot see does not open the cap (it reads as no request)
  insert into public.connection_requests (from_id, to_id) values (pg_temp.s6(141), pg_temp.s6(1));
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.s6(1), pg_temp.s6(141));
  set local role authenticated;
  st := null;
  begin perform * from public.send_signal(pg_temp.s6(141)); exception when others then st := sqlstate; msg := sqlerrm; end;
  reset role;
  if st is distinct from 'PT429' or msg <> 'signal_quota_exhausted' then
    raise exception 'FAIL cap: an invisible reverse request opened the cap (% %)', st, msg;
  end if;
end $$;
rollback;

-- 5. The live cap: 100 distinct unanswered targets within 30 days (backdated past 24 h). A match frees a unit.
begin;
insert into public.signal_ledger (sender_id, to_id, at)
select pg_temp.s6(1), pg_temp.s6(i), now() - interval '2 days' from generate_series(100, 199) i;
insert into public.signal_ledger (sender_id, to_id, at)   -- older than 30 days: no longer live
select pg_temp.s6(1), pg_temp.s6(i), now() - interval '31 days' from generate_series(200, 220) i;
do $$
declare r record; q record; st text; msg text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s6(1))::text, true);
  select * into q from public.my_signal_quota();
  if q.remaining <> 30 or q.live_unanswered <> 100 or q.resets_at is not null then raise exception 'FAIL live: quota %', q; end if;
  begin
    perform * from public.send_signal(pg_temp.s6(250));
  exception when others then st := sqlstate; msg := sqlerrm;
  end;
  if st is distinct from 'PT429' or msg <> 'signal_live_cap' then raise exception 'FAIL live: 101st live gave % %', st, msg; end if;
  reset role;
  if (select count(*) from public.signal_ledger where sender_id = pg_temp.s6(1)) <> 121 then
    raise exception 'FAIL live: the refused send was charged';
  end if;
  insert into public.matches (user1_id, user2_id) values (least(pg_temp.s6(1), pg_temp.s6(150)), greatest(pg_temp.s6(1), pg_temp.s6(150)));
  set local role authenticated;
  select * into q from public.my_signal_quota();
  if q.live_unanswered <> 99 then raise exception 'FAIL live: a match did not free a unit (%)', q.live_unanswered; end if;
  select * into r from public.send_signal(pg_temp.s6(250));
  if r.status <> 'sent' or r.remaining <> 29 then raise exception 'FAIL live: send after a match answered %', r; end if;
  select * into q from public.my_signal_quota();
  if q.live_unanswered <> 100 then raise exception 'FAIL live: live_unanswered % after the send', q.live_unanswered; end if;
  reset role;
end $$;
rollback;

-- 6. Private config: the owner may lower the limits; clients cannot read or write brivia_config.
begin;
insert into public.brivia_config (key, value) values ('signal_daily_limit', '2'), ('signal_live_limit', '5');
do $$
declare q record; st text; failed boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s6(1))::text, true);
  begin perform * from public.brivia_config; exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL config: a member can read brivia_config'; end if;
  perform * from public.send_signal(pg_temp.s6(100));
  perform * from public.send_signal(pg_temp.s6(101));
  select * into q from public.my_signal_quota();
  if q.daily_limit <> 2 or q.remaining <> 0 or q.live_limit <> 5 or q.live_unanswered <> 2 then raise exception 'FAIL config: %', q; end if;
  begin perform * from public.send_signal(pg_temp.s6(102)); exception when others then st := sqlstate; end;
  if st is distinct from 'PT429' then raise exception 'FAIL config: the lowered cap did not hold (%)', st; end if;
  reset role;
end $$;
rollback;
-- Fix round 1: a value above the int range (or not a number, or negative) falls back to the default.
begin;
insert into public.brivia_config (key, value) values ('signal_daily_limit', '3000000000'), ('signal_live_limit', '"many"');
do $$
declare q record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s6(1))::text, true);
  select * into q from public.my_signal_quota();
  reset role;
  if q.daily_limit <> 30 or q.live_limit <> 100 then raise exception 'FAIL config: out-of-range values gave %', q; end if;
  update public.brivia_config set value = '-1' where key = 'signal_daily_limit';
  if public.brivia_config_int('signal_daily_limit', 30) <> 30 then raise exception 'FAIL config: a negative value was used'; end if;
end $$;
rollback;

-- 7. brivia_has_completed_profile() means the new completion (D-030): a member who is not completed cannot
--    message a match or accept a request. Completed members still can.
begin;
insert into public.matches (user1_id, user2_id) values (least(pg_temp.s6(9), pg_temp.s6(2)), greatest(pg_temp.s6(9), pg_temp.s6(2)));
insert into public.connection_requests (from_id, to_id) values (pg_temp.s6(2), pg_temp.s6(9)), (pg_temp.s6(10), pg_temp.s6(9)),
                                                               (pg_temp.s6(10), pg_temp.s6(2));
do $$
declare failed boolean := false; st text; n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s6(9))::text, true);
  if public.brivia_has_completed_profile() then raise exception 'FAIL: an incomplete member counts as completed'; end if;
  begin
    insert into public.brivia_messages (sender_id, recipient_id, body) values (pg_temp.s6(9), pg_temp.s6(2), 'hi');
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL: an incomplete member sent a message'; end if;
  select count(*) into n from public.connection_requests;
  if n <> 0 then raise exception 'FAIL: an incomplete member reads % incoming requests', n; end if;
  begin perform public.respond_connection_request(pg_temp.s6(10), true); exception when others then st := sqlstate; end;
  if st is distinct from '22023' then raise exception 'FAIL: an incomplete member accepted a request (%)', st; end if;
  -- positive control: the completed member N messages and accepts
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s6(2))::text, true);
  if not public.brivia_has_completed_profile() then raise exception 'FAIL: a completed member is not completed'; end if;
  insert into public.brivia_messages (sender_id, recipient_id, body) values (pg_temp.s6(2), pg_temp.s6(9), 'hi');
  perform public.respond_connection_request(pg_temp.s6(10), true);
  reset role;
  if exists (select 1 from public.matches where pg_temp.s6(10) in (user1_id, user2_id) and pg_temp.s6(9) in (user1_id, user2_id)) then
    raise exception 'FAIL: an incomplete member''s accept made a match';
  end if;
  if not exists (select 1 from public.matches where pg_temp.s6(10) in (user1_id, user2_id) and pg_temp.s6(2) in (user1_id, user2_id)) then
    raise exception 'FAIL: positive control: the completed member''s accept made no match';
  end if;
end $$;
rollback;

-- 8. Fix round 1, minor 1: an incoming request from a sender who is no longer completed is hidden from the recipient
--    and cannot be accepted, matching the like-back path (send_signal to them writes nothing).
begin;
insert into public.connection_requests (from_id, to_id) values (pg_temp.s6(14), pg_temp.s6(2)), (pg_temp.s6(15), pg_temp.s6(2));
delete from public.member_interest where member_id = pg_temp.s6(14);   -- 14 is no longer completed; 15 is the control
do $$
declare n int; st text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.s6(2))::text, true);
  select count(*) into n from public.connection_requests where from_id = pg_temp.s6(14);
  if n <> 0 then raise exception 'FAIL: the recipient sees a request from a member who is not completed'; end if;
  select count(*) into n from public.connection_requests where from_id = pg_temp.s6(15);
  if n <> 1 then raise exception 'FAIL: positive control: the recipient does not see a completed sender''s request'; end if;
  begin perform public.respond_connection_request(pg_temp.s6(14), true); exception when others then st := sqlstate; end;
  if st is distinct from 'P0002' then raise exception 'FAIL: a not-completed sender''s request was answerable (%)', st; end if;
  reset role;
  if exists (select 1 from public.matches where pg_temp.s6(14) in (user1_id, user2_id)) then
    raise exception 'FAIL: accept made a match with a member who is not completed';
  end if;
end $$;
rollback;

-- 9. Fix round 1, minor 2: every RLS policy evaluates brivia_has_completed_profile() once per statement, wrapped as
--    (select public.brivia_has_completed_profile()). No policy calls it bare.
do $$
declare r record; expr text;
begin
  for r in select tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as e
             from pg_policies where schemaname = 'public'
              and (coalesce(qual, '') || coalesce(with_check, '')) like '%brivia_has_completed_profile%' loop
    expr := regexp_replace(r.e, '\(\s*SELECT\s+(public\.)?brivia_has_completed_profile\(\)\s+AS\s+brivia_has_completed_profile\s*\)', '', 'g');
    if expr like '%brivia_has_completed_profile%' then
      raise exception 'FAIL: policy % on % calls brivia_has_completed_profile() per row: %', r.policyname, r.tablename, r.e;
    end if;
  end loop;
  if (select count(*) from pg_policies where schemaname = 'public'
        and (coalesce(qual, '') || coalesce(with_check, '')) like '%brivia_has_completed_profile%') < 6 then
    raise exception 'FAIL: expected at least 6 policies gated on brivia_has_completed_profile()';
  end if;
end $$;

-- 10. Fix round 1, minor 3: purge_expired_requests() also prunes ledger rows older than 30 days (they no longer
--     count toward any cap). It stays owner-only and still returns the number of request rows deleted.
begin;
insert into public.signal_ledger (sender_id, to_id, at) values
  (pg_temp.s6(1), pg_temp.s6(100), now() - interval '31 days'),
  (pg_temp.s6(1), pg_temp.s6(101), now() - interval '29 days'),
  (pg_temp.s6(1), pg_temp.s6(102), now());
insert into public.connection_requests (from_id, to_id, created_at) values (pg_temp.s6(1), pg_temp.s6(103), now() - interval '31 days');
do $$
declare n int;
begin
  select public.purge_expired_requests() into n;
  if n <> 1 then raise exception 'FAIL purge: returned % (want 1 request row)', n; end if;
  if (select string_agg(right(to_id::text, 3), ',' order by to_id) from public.signal_ledger where sender_id = pg_temp.s6(1))
     is distinct from '101,102' then
    raise exception 'FAIL purge: ledger rows left: %',
      (select string_agg(right(to_id::text, 3), ',' order by to_id) from public.signal_ledger where sender_id = pg_temp.s6(1));
  end if;
end $$;
rollback;

-- Clean up.
delete from public.signal_ledger where sender_id::text like 'f6000000-%';
delete from public.connection_requests where from_id::text like 'f6000000-%' or to_id::text like 'f6000000-%';
delete from public.matches where user1_id::text like 'f6000000-%' or user2_id::text like 'f6000000-%';
delete from public.brivia_blocks where blocker_id::text like 'f6000000-%';
delete from public.profiles where id::text like 'f6000000-%';
delete from auth.users where id::text like 'f6000000-%';

select 'orbit-signals.test.sql OK' as result;
