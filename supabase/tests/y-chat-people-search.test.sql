-- 0044 (D-152): chat_people_search.
-- Ids 0d440000-0000-4000-8000-0000000000NN: 01 A (caller), 02 Yashika Rao (A's match, no messages), 03 Yash Thakkar
-- (A sent a request), 04 Yasmin Khan (sent A a request), 05 Yashwant (no relation), 06 Meera (match, works at Zeta Labs,
-- conversation), 07 Yasir (blocked by A), 08 incomplete (no city).
-- S1 a connection is found by a partial first name with no conversation; by last name; by company; by title.
-- S2 statuses: connected, request_sent (pending and declined alike), request_received, none.
-- S3 one character finds connections only; two find others too; blocked and incomplete members never appear.
-- S4 has_conversation / last_message_at for Meera; a withheld message from her does not count; bio preview <= 140.
-- S5 anon cannot execute; no session returns nothing; wildcards are literal.
set brivia.harness_autocomplete = 'on';
create or replace function pg_temp.ys(n int) returns uuid language sql immutable as $$
  select ('0d440000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

do $$
declare g int; names text[] := array['Arjun Mehta', 'Yashika Rao', 'Yash Thakkar', 'Yasmin Khan', 'Yashwant', 'Meera Iyer', 'Yasir', 'Yasna Incomplete'];
begin
  for g in 1..8 loop
    insert into auth.users(id) values (pg_temp.ys(g)) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, city, experience, looking_for, bio)
    values (pg_temp.ys(g), names[g], names[g], 'ys' || g || '@example.com', case when g = 8 then null else 'Pune' end, 'Some years', array['Friends'],
            case when g = 2 then 'Passionate photographer, filmmaker, storyteller, entrepreneur, mountaineer, bibliophile, musician, gastronome, conversationalist, environmentalist, lifelong learner exploring everywhere' else null end)
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where id = pg_temp.ys(g);
  end loop;
  insert into public.company (id, name, name_key, source) values ('0d440000-0000-4000-8000-0000000000c1', 'Zeta Labs', 'zeta labs', 'member') on conflict do nothing;
  update public.profiles set company_id = '0d440000-0000-4000-8000-0000000000c1', job_title = 'Product Designer' where id = pg_temp.ys(6);
  insert into public.matches (user1_id, user2_id) values (pg_temp.ys(1), pg_temp.ys(2)), (pg_temp.ys(6), pg_temp.ys(1)) on conflict do nothing;
  insert into public.connection_requests (from_id, to_id, status) values (pg_temp.ys(1), pg_temp.ys(3), 'declined'), (pg_temp.ys(4), pg_temp.ys(1), 'pending');
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.ys(1), pg_temp.ys(7)) on conflict do nothing;
  insert into public.brivia_messages (id, sender_id, recipient_id, body, created_at) values
    ('0d440000-0000-4000-8000-0000000000a1', pg_temp.ys(1), pg_temp.ys(6), 'hello', now() - interval '2 hours'),
    ('0d440000-0000-4000-8000-0000000000a2', pg_temp.ys(6), pg_temp.ys(1), 'withheld', now() - interval '1 hour');
  insert into brivia_private.withheld_message (message_id) values ('0d440000-0000-4000-8000-0000000000a2') on conflict do nothing;
end $$;

do $$
declare n int; s text; t timestamptz; code text;
begin
  if has_function_privilege('anon', 'public.chat_people_search(text, int)', 'execute') then raise exception 'FAIL S5: anon may execute'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.ys(1))::text, true);
  -- S1
  select status into s from public.chat_people_search('yas') where member_id = pg_temp.ys(2);
  if s is distinct from 'connected' then raise exception 'FAIL S1: Yashika by "yas" gave %', s; end if;
  if not exists (select 1 from public.chat_people_search('rao') where member_id = pg_temp.ys(2)) then raise exception 'FAIL S1: last name'; end if;
  if not exists (select 1 from public.chat_people_search('yashika r') where member_id = pg_temp.ys(2)) then raise exception 'FAIL S1: full name words'; end if;
  if not exists (select 1 from public.chat_people_search('zeta') where member_id = pg_temp.ys(6)) then raise exception 'FAIL S1: company'; end if;
  if not exists (select 1 from public.chat_people_search('designer') where member_id = pg_temp.ys(6)) then raise exception 'FAIL S1: title'; end if;
  if exists (select 1 from public.chat_people_search('ashika') where member_id = pg_temp.ys(2)) then raise exception 'FAIL S1: a mid-word name match'; end if;
  -- S2
  if (select status from public.chat_people_search('yash thakkar') where member_id = pg_temp.ys(3)) is distinct from 'request_sent' then raise exception 'FAIL S2: declined should read request_sent'; end if;
  if (select status from public.chat_people_search('yasmin') where member_id = pg_temp.ys(4)) is distinct from 'request_received' then raise exception 'FAIL S2: request_received'; end if;
  if (select status from public.chat_people_search('yashwant') where member_id = pg_temp.ys(5)) is distinct from 'none' then raise exception 'FAIL S2: none'; end if;
  if (select member_id from public.chat_people_search('yas') limit 1) is distinct from pg_temp.ys(2) then raise exception 'FAIL S2: the connection should come first'; end if;
  -- S3
  select count(*) into n from public.chat_people_search('y');
  if n <> 1 then raise exception 'FAIL S3: one letter should find the one connection only, got %', n; end if;
  if exists (select 1 from public.chat_people_search('yas') where member_id in (pg_temp.ys(7), pg_temp.ys(8), pg_temp.ys(1))) then
    raise exception 'FAIL S3: blocked, incomplete or self listed'; end if;
  -- S4
  select last_message_at into t from public.chat_people_search('meera') where member_id = pg_temp.ys(6) and has_conversation;
  if t is null or t > now() - interval '90 minutes' then raise exception 'FAIL S4: last_message_at should be the visible one (2 h ago), got %', t; end if;
  if (select has_conversation from public.chat_people_search('yashika') where member_id = pg_temp.ys(2)) then raise exception 'FAIL S4: no conversation expected'; end if;
  select bio_preview into s from public.chat_people_search('yashika') where member_id = pg_temp.ys(2);
  if s is null or char_length(s) > 140 then raise exception 'FAIL S4: bio preview %', s; end if;
  if (select company_name || '/' || job_title from public.chat_people_search('meera')) <> 'Zeta Labs/Product Designer' then raise exception 'FAIL S4: work'; end if;
  -- S5
  if exists (select 1 from public.chat_people_search('%')) or exists (select 1 from public.chat_people_search('_a')) then raise exception 'FAIL S5: wildcards matched'; end if;
  perform set_config('request.jwt.claims', '{}', true);
  if exists (select 1 from public.chat_people_search('yas')) then raise exception 'FAIL S5: no session returned rows'; end if;
  reset role;
end $$;
select 'y-chat-people-search.test S1-S5 OK';

delete from public.brivia_messages where id::text like '0d440000-%';
delete from public.connection_requests where from_id::text like '0d440000-%';
delete from public.brivia_blocks where blocker_id::text like '0d440000-%';
delete from public.matches where user1_id::text like '0d440000-%' or user2_id::text like '0d440000-%';
delete from public.profiles where id::text like '0d440000-%';
delete from public.company where id = '0d440000-0000-4000-8000-0000000000c1';
delete from auth.users where id::text like '0d440000-%';
