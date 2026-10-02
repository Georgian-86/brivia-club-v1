-- P0 consent (supabase/migrations/0002_p0_privacy_consent.sql): a connection (match) exists only
-- after both members agree, created server-side by the connection_requests trigger or by
-- respond_connection_request. Messages need a match. Blocked pairs never match.
-- Data-touching blocks run in transactions that are rolled back, except the race test, which must
-- commit across two sessions and deletes its own rows afterwards.

-- Members: A, B (the pair), C (third party), D (blocks A), E (no profile).
insert into auth.users(id) values
  ('a0000000-0000-0000-0000-00000000000a'), ('b0000000-0000-0000-0000-00000000000b'),
  ('c0000000-0000-0000-0000-00000000000c'), ('d0000000-0000-0000-0000-00000000000d'),
  ('e0000000-0000-0000-0000-00000000000e')
  on conflict do nothing;
insert into public.profiles (id, name, full_name, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'A', 'A', 'a@test.brivia.club'),
  ('b0000000-0000-0000-0000-00000000000b', 'B', 'B', 'b@test.brivia.club'),
  ('c0000000-0000-0000-0000-00000000000c', 'C', 'C', 'c@test.brivia.club'),
  ('d0000000-0000-0000-0000-00000000000d', 'D', 'D', 'd@test.brivia.club')
  on conflict (id) do nothing;

-- 1. Shape, policies and grants.
do $$
declare n int; p text;
begin
  if to_regclass('public.connection_requests') is null then
    raise exception 'FAIL: public.connection_requests missing';
  end if;
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'connection_requests'
     and ((column_name in ('from_id', 'to_id') and data_type = 'uuid')
       or (column_name = 'note' and data_type = 'text')
       or (column_name = 'status' and data_type = 'text')
       or (column_name = 'created_at' and data_type like 'timestamp%'));
  if n <> 5 then raise exception 'FAIL: connection_requests has % of 5 expected columns', n; end if;
  select count(*) into n from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f' and c.conrelid = 'public.connection_requests'::regclass
     and a.attname in ('from_id', 'to_id') and c.confrelid = 'public.profiles'::regclass and c.confdeltype = 'c';
  if n <> 2 then raise exception 'FAIL: connection_requests has % cascading FKs to profiles (want 2)', n; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.connection_requests'::regclass) then
    raise exception 'FAIL: RLS disabled on connection_requests';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'connection_requests'
     and cmd in ('UPDATE', 'DELETE', 'ALL');
  if n <> 0 then raise exception 'FAIL: connection_requests has % update/delete/all policies (want 0)', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'matches' and cmd in ('INSERT', 'ALL');
  if n <> 0 then raise exception 'FAIL: matches has % client insert policies (want 0)', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'brivia_messages' and cmd = 'INSERT';
  if n <> 1 then raise exception 'FAIL: brivia_messages has % insert policies (want 1)', n; end if;
  select string_agg(privilege_type, ',' order by privilege_type) into p from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'connection_requests' and grantee = 'authenticated';
  if p is distinct from 'INSERT,SELECT' then raise exception 'FAIL: authenticated privileges on connection_requests = %', p; end if;
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'connection_requests' and grantee in ('anon', 'PUBLIC');
  if n <> 0 then raise exception 'FAIL: anon/public hold % privileges on connection_requests', n; end if;
  if has_function_privilege('anon', 'public.respond_connection_request(uuid, boolean)', 'execute') then
    raise exception 'FAIL: anon can execute respond_connection_request';
  end if;
  if not has_function_privilege('authenticated', 'public.respond_connection_request(uuid, boolean)', 'execute') then
    raise exception 'FAIL: authenticated cannot execute respond_connection_request';
  end if;
  select count(*) into n from pg_proc where pronamespace = 'public'::regnamespace
     and proname in ('respond_connection_request', 'brivia_on_connection_request')
     and prosecdef and proconfig @> array['search_path=public'];
  if n <> 2 then raise exception 'FAIL: % of 2 consent functions are security definer with search_path=public', n; end if;
end $$;

-- 2. One-sided request: no match, no messages. The reverse request completes the match.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
declare n int;
begin
  insert into public.connection_requests(from_id, to_id, note)
  values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'hi');
  select count(*) into n from public.matches;
  if n <> 0 then raise exception 'FAIL: one-sided request created % matches', n; end if;
  begin
    insert into public.brivia_messages(sender_id, recipient_id, body)
    values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'pitch');
    raise exception 'FAIL: message without a match allowed';
  exception when insufficient_privilege then null; end;
  -- clients still cannot create matches directly, in either orientation
  begin
    insert into public.matches(user1_id, user2_id)
    values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b');
    raise exception 'FAIL: client inserted a match';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.matches(user1_id, user2_id)
    values ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL: client inserted a reversed match';
  exception when insufficient_privilege then null; end;
  -- cannot spoof the sender, request yourself, or pre-accept
  begin
    insert into public.connection_requests(from_id, to_id)
    values ('c0000000-0000-0000-0000-00000000000c', 'b0000000-0000-0000-0000-00000000000b');
    raise exception 'FAIL: spoofed request sender allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.connection_requests(from_id, to_id)
    values ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL: self request allowed';
  exception when insufficient_privilege or check_violation then null; end;
  begin
    insert into public.connection_requests(from_id, to_id, status)
    values ('a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c', 'accepted');
    raise exception 'FAIL: client inserted a pre-accepted request';
  exception when insufficient_privilege then null; end;
  -- no client update/delete of requests
  begin
    update public.connection_requests set status = 'accepted';
    raise exception 'FAIL: client updated a request';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.connection_requests;
    raise exception 'FAIL: client deleted a request';
  exception when insufficient_privilege then null; end;
  -- re-requesting the same person is a primary-key conflict (no update path, by design)
  begin
    insert into public.connection_requests(from_id, to_id)
    values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b');
    raise exception 'FAIL: duplicate request allowed';
  exception when unique_violation then null; end;
end $$;

-- C (third party) sees neither the request nor a way to accept it.
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
declare n int;
begin
  select count(*) into n from public.connection_requests;
  if n <> 0 then raise exception 'FAIL: third party sees % requests', n; end if;
  begin
    perform public.respond_connection_request('a0000000-0000-0000-0000-00000000000a', true);
    raise exception 'FAIL: third party accepted a request';
  exception when no_data_found then null; end;
end $$;

-- B sees the request addressed to them, then requests A back: exactly one match.
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare n int;
begin
  select count(*) into n from public.connection_requests where to_id = 'b0000000-0000-0000-0000-00000000000b' and note = 'hi';
  if n <> 1 then raise exception 'FAIL: recipient sees % incoming requests', n; end if;
  insert into public.connection_requests(from_id, to_id)
  values ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a');
  select count(*) into n from public.matches;
  if n <> 1 then raise exception 'FAIL: mutual request created % matches (want 1)', n; end if;
  select count(*) into n from public.matches
   where user1_id = least('a0000000-0000-0000-0000-00000000000a'::uuid, 'b0000000-0000-0000-0000-00000000000b'::uuid)
     and user2_id = greatest('a0000000-0000-0000-0000-00000000000a'::uuid, 'b0000000-0000-0000-0000-00000000000b'::uuid);
  if n <> 1 then raise exception 'FAIL: match row is not least/greatest ordered'; end if;
  select count(*) into n from public.connection_requests where status = 'accepted';
  if n <> 2 then raise exception 'FAIL: % of 2 requests accepted', n; end if;
  -- second identical reverse insert: conflict, still one match
  begin
    insert into public.connection_requests(from_id, to_id)
    values ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL: duplicate reverse request allowed';
  exception when unique_violation then null; end;
  -- accepting an already-accepted request is not possible and adds nothing
  begin
    perform public.respond_connection_request('a0000000-0000-0000-0000-00000000000a', true);
    raise exception 'FAIL: re-accept succeeded';
  exception when no_data_found then null; end;
  select count(*) into n from public.matches;
  if n <> 1 then raise exception 'FAIL: % matches after duplicate attempts (want 1)', n; end if;
  insert into public.brivia_messages(sender_id, recipient_id, body)
  values ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 'hello');
end $$;

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  insert into public.brivia_messages(sender_id, recipient_id, body)
  values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'hello back');
end $$;
rollback;

-- 3. respond_connection_request: only the recipient can accept or decline.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
insert into public.connection_requests(from_id, to_id)
values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b'),
       ('a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c');
do $$
begin
  -- the sender cannot accept their own request (as either argument shape)
  begin
    perform public.respond_connection_request('a0000000-0000-0000-0000-00000000000a', true);
    raise exception 'FAIL: sender accepted their own request';
  exception when no_data_found then null; end;
  begin
    perform public.respond_connection_request('b0000000-0000-0000-0000-00000000000b', true);
    raise exception 'FAIL: sender accepted on the recipient''s behalf';
  exception when no_data_found then null; end;
end $$;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
do $$
declare n int;
begin
  perform public.respond_connection_request('a0000000-0000-0000-0000-00000000000a', true);
  select count(*) into n from public.matches;
  if n <> 1 then raise exception 'FAIL: accept created % matches (want 1)', n; end if;
  select count(*) into n from public.connection_requests
   where from_id = 'a0000000-0000-0000-0000-00000000000a' and status = 'accepted';
  if n <> 1 then raise exception 'FAIL: accepted request status not set'; end if;
  insert into public.brivia_messages(sender_id, recipient_id, body)
  values ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 'welcome');
end $$;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
do $$
declare n int;
begin
  perform public.respond_connection_request('a0000000-0000-0000-0000-00000000000a', false);
  select count(*) into n from public.connection_requests
   where from_id = 'a0000000-0000-0000-0000-00000000000a' and to_id = 'c0000000-0000-0000-0000-00000000000c' and status = 'declined';
  if n <> 1 then raise exception 'FAIL: decline did not set status'; end if;
  select count(*) into n from public.matches;
  if n <> 0 then raise exception 'FAIL: decliner sees % matches', n; end if;
  -- a declined request cannot be accepted later
  begin
    perform public.respond_connection_request('a0000000-0000-0000-0000-00000000000a', true);
    raise exception 'FAIL: accepted after declining';
  exception when no_data_found then null; end;
end $$;
-- the declined sender cannot re-request (no update policy; primary-key conflict)
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  begin
    insert into public.connection_requests(from_id, to_id)
    values ('a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c')
    on conflict (from_id, to_id) do update set status = 'pending';
    raise exception 'FAIL: re-request after decline via upsert allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

-- 4. Blocks: a blocked pair cannot request, and never matches even if both already requested.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
insert into public.brivia_blocks(blocker_id, blocked_id)
values ('d0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000a');
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
do $$
begin
  begin
    insert into public.connection_requests(from_id, to_id)
    values ('a0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000d');
    raise exception 'FAIL: blocked member can request the blocker';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
do $$
begin
  begin
    insert into public.connection_requests(from_id, to_id)
    values ('d0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL: blocker can request the blocked member';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
insert into public.connection_requests(from_id, to_id)
values ('a0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000d');
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
-- D blocks A after A requested; D's pending request row is inserted as the superuser (bypassing
-- the insert policy) to model "both requested, then a block": the trigger must still not match.
insert into public.brivia_blocks(blocker_id, blocked_id)
values ('d0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000a');
do $$
declare n int;
begin
  begin
    perform public.respond_connection_request('a0000000-0000-0000-0000-00000000000a', true);
    raise exception 'FAIL: blocked pair accepted a request';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.matches;
  if n <> 0 then raise exception 'FAIL: blocked accept created % matches', n; end if;
end $$;
reset role;
insert into public.connection_requests(from_id, to_id)
values ('d0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000a');
do $$
declare n int;
begin
  select count(*) into n from public.matches
   where 'd0000000-0000-0000-0000-00000000000d' in (user1_id, user2_id);
  if n <> 0 then raise exception 'FAIL: blocked pair matched by trigger (% rows)', n; end if;
end $$;
rollback;

-- 5. A legacy reversed match row is respected: completing consent adds no second, reversed row.
begin;
insert into public.matches(user1_id, user2_id)  -- greatest-first, as legacy unordered rows can be
values ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a');
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
insert into public.connection_requests(from_id, to_id)
values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b');
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
insert into public.connection_requests(from_id, to_id)
values ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a');
do $$
declare n int;
begin
  select count(*) into n from public.matches;
  if n <> 1 then raise exception 'FAIL: % matches with a legacy reversed row (want 1)', n; end if;
end $$;
rollback;

-- 6. Anonymous visitors have no access to requests or the RPC; members without a profile cannot request.
begin;
set local role anon;
do $$
begin
  begin
    perform 1 from public.connection_requests;
    raise exception 'FAIL: anon can select connection_requests';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.connection_requests(from_id, to_id)
    values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b');
    raise exception 'FAIL: anon can insert connection_requests';
  exception when insufficient_privilege then null; end;
  begin
    perform public.respond_connection_request('a0000000-0000-0000-0000-00000000000a', true);
    raise exception 'FAIL: anon can call respond_connection_request';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000e"}';
do $$
begin
  begin
    insert into public.connection_requests(from_id, to_id)
    values ('e0000000-0000-0000-0000-00000000000e', 'a0000000-0000-0000-0000-00000000000a');
    raise exception 'FAIL: non-member can send a request';
  exception when insufficient_privilege or foreign_key_violation then null; end;
end $$;
rollback;

-- 7. Race: A->B and B->A in two concurrent sessions. Without serialisation, neither trigger sees
-- the other's uncommitted row and no match is ever created. Session 1 inserts A->B and stays open;
-- session 2 inserts B->A; session 1 commits; session 2 commits. Exactly one match must exist.
create schema if not exists brivia_test_ext;
create extension if not exists dblink schema brivia_test_ext;
do $$
declare
  conn text := format('host=/tmp port=%s dbname=%s user=%s', current_setting('port'), current_database(), current_user);
  n int; waited int := 0; blocked boolean := false;
begin
  perform brivia_test_ext.dblink_connect('s1', conn);
  perform brivia_test_ext.dblink_connect('s2', conn);
  perform brivia_test_ext.dblink_exec('s1', 'begin');
  perform brivia_test_ext.dblink_exec('s1', 'set local role authenticated');
  perform brivia_test_ext.dblink_exec('s1', $q$set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}'$q$);
  perform brivia_test_ext.dblink_exec('s1', $q$insert into public.connection_requests(from_id, to_id)
    values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b')$q$);
  perform brivia_test_ext.dblink_exec('s2', 'begin');
  perform brivia_test_ext.dblink_exec('s2', 'set local role authenticated');
  perform brivia_test_ext.dblink_exec('s2', $q$set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}'$q$);
  perform brivia_test_ext.dblink_send_query('s2', $q$insert into public.connection_requests(from_id, to_id)
    values ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a')$q$);
  -- Wait until session 2 has either finished its insert or is waiting on a lock (max ~5 s).
  loop
    exit when brivia_test_ext.dblink_is_busy('s2') = 0;
    select exists (select 1 from pg_stat_activity
                    where wait_event_type = 'Lock' and query like '%b0000000-0000-0000-0000-00000000000b'', ''a0000000%')
      into blocked;
    exit when blocked or waited >= 100;
    perform pg_sleep(0.05); waited := waited + 1;
  end loop;
  perform brivia_test_ext.dblink_exec('s1', 'commit');
  perform * from brivia_test_ext.dblink_get_result('s2') as t(r text);
  perform * from brivia_test_ext.dblink_get_result('s2') as t(r text);  -- drain: ends the async query
  perform brivia_test_ext.dblink_exec('s2', 'commit');
  perform brivia_test_ext.dblink_disconnect('s1');
  perform brivia_test_ext.dblink_disconnect('s2');

  select count(*) into n from public.matches
   where (user1_id, user2_id) in (('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b'),
                                  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'));
  delete from public.matches
   where (user1_id, user2_id) in (('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b'),
                                  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a'));
  delete from public.connection_requests
   where from_id in ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b');
  if n <> 1 then raise exception 'FAIL: concurrent mutual requests created % matches (want 1)', n; end if;
end $$;
drop extension dblink;
drop schema brivia_test_ext;

select 'p0-consent.test.sql OK' as result;
