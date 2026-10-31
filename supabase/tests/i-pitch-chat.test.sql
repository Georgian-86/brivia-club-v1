-- 0019 (D-112): pitch in chat. connection_requests.chat_accepted_at and the liveness rule that never expires a
-- pending request whose chat the receiver accepted.
-- Ids 0d190000-0000-4000-8000-0000000000NN: 01 A sender, 02 B receiver, 03 C third, 04 D blocked by B, 05 T tester.
-- All five are completed (name, 18+ declaration, one 20-point interest, a cell) in one Pune cell, so the deck would
-- offer each to the others when nothing else rules it out.
-- L1 chat_accepted_at exists and is nullable; authenticated cannot insert a row with it set (the insert fails or
--    stores null); an owner insert that sets it stores null (the before-insert trigger).
-- L2 a pending request 31 days old with chat_accepted_at set: visible to B through the select policy, still in the
--    table after purge_expired_requests(), and B's respond_connection_request(A, true) creates the match (last step).
-- L3 a pending request 31 days old without chat_accepted_at: hidden from its receiver, purged (today's behaviour).
-- L4 A's my_outgoing_requests() lists the 31-day chat-open request; deck_candidates for A does not offer B (and, as
--    the control, does offer C, whose expired request was purged).
-- L5 guard: no function source and no policy reads requests through the two-argument brivia_request_is_live.
-- L6 A's send_signal(B, 'again') while the request is chat-open answers 'sent'; the row's note and chat_accepted_at
--    are unchanged.
-- Layout: fixtures, L-tests, the pair-state reset, then the teardown (keep it last; later C-tests go above it).
set brivia.harness_autocomplete = 'off';
create or replace function pg_temp.pc(n int) returns uuid language sql immutable as $$
  select ('0d190000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Fixtures (shared by every test in this file)
-- ---------------------------------------------------------------------------------------------------------------
do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(18.5204, 73.8567, 7);   -- the Pune centroid
begin
  for g in 1..5 loop
    mid := pg_temp.pc(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (mid, 'Ipitch ' || g, 'Ipitch ' || g, 'ipitch' || g || '@example.com', 'Some years', array['Friends'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now(), created_at = now() - interval '20 days' where profiles.id = mid;
    insert into public.member_orbit (member_id, cell_scheme, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, 'grid1', cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), 'in-pune')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20)
    on conflict do nothing;
  end loop;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.pc(2), pg_temp.pc(4)) on conflict do nothing;
  insert into public.brivia_tester (member_id) values (pg_temp.pc(5)) on conflict do nothing;
  for g in 1..5 loop
    if not public.brivia_member_completed(pg_temp.pc(g)) then
      raise exception 'FAIL fixture: member % is not completed', g;
    end if;
  end loop;
end $$;

-- Resets the pair state between the fixture members (requests, matches, ledger, deck impressions); keeps profiles.
create or replace function pg_temp.pc_reset() returns void language plpgsql as $$
begin
  delete from public.matches where user1_id::text like '0d190000-%' or user2_id::text like '0d190000-%';
  delete from public.connection_requests where from_id::text like '0d190000-%' or to_id::text like '0d190000-%';
  delete from public.signal_ledger where sender_id::text like '0d190000-%' or to_id::text like '0d190000-%';
  delete from public.interaction where viewer_id::text like '0d190000-%' or target_id::text like '0d190000-%';
end $$;

-- An owner-written request, aged and optionally chat-open (the before-insert trigger nulls chat_accepted_at on
-- insert, so it is set by an update, the way the server will set it).
create or replace function pg_temp.pc_request(p_from int, p_to int, p_note text, p_age interval, p_chat_at timestamptz)
returns void language plpgsql as $$
begin
  insert into public.connection_requests (from_id, to_id, note) values (pg_temp.pc(p_from), pg_temp.pc(p_to), p_note);
  execute 'update public.connection_requests set created_at = now() - $3, chat_accepted_at = $4
            where from_id = $1 and to_id = $2'
    using pg_temp.pc(p_from), pg_temp.pc(p_to), p_age, p_chat_at;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- L1
-- ---------------------------------------------------------------------------------------------------------------
do $$ begin perform pg_temp.pc_reset(); end $$;
do $$
declare v text;
begin
  select is_nullable into v from information_schema.columns
   where table_schema = 'public' and table_name = 'connection_requests' and column_name = 'chat_accepted_at';
  if v is null then raise exception 'FAIL L1: connection_requests.chat_accepted_at is missing'; end if;
  if v <> 'YES' then raise exception 'FAIL L1: chat_accepted_at is not nullable'; end if;
  if (select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'connection_requests' and column_name = 'chat_accepted_at')
     <> 'timestamp with time zone' then
    raise exception 'FAIL L1: chat_accepted_at is not timestamptz'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(1))::text, true);
  begin
    execute 'insert into public.connection_requests (from_id, to_id, note, chat_accepted_at) values ($1, $2, $3, now())'
      using pg_temp.pc(1), pg_temp.pc(3), 'self-opened';
  exception when others then
    null;  -- refused: allowed
  end;
  reset role;
  if exists (select 1 from public.connection_requests
              where from_id = pg_temp.pc(1) and to_id = pg_temp.pc(3) and chat_accepted_at is not null) then
    raise exception 'FAIL L1: an authenticated insert stored chat_accepted_at'; end if;

  execute 'insert into public.connection_requests (from_id, to_id, note, chat_accepted_at) values ($1, $2, $3, now())'
    using pg_temp.pc(3), pg_temp.pc(5), 'owner insert';
  if (select chat_accepted_at from public.connection_requests where from_id = pg_temp.pc(3) and to_id = pg_temp.pc(5))
     is not null then
    raise exception 'FAIL L1: the before-insert trigger did not null chat_accepted_at'; end if;
end $$;
do $$ begin perform pg_temp.pc_reset(); end $$;
select 'i-pitch-chat.test L1 OK';

-- ---------------------------------------------------------------------------------------------------------------
-- L2 (visibility and purge), L3, L4, L6, then L2 (respond). One scene: A -> B chat-open, A -> C expired.
-- ---------------------------------------------------------------------------------------------------------------
do $$ begin perform pg_temp.pc_request(1, 2, 'hello pitch', interval '31 days', now() - interval '30 days'); end $$;
do $$ begin perform pg_temp.pc_request(1, 3, 'old pitch', interval '31 days', null); end $$;

do $$
declare n int;
begin
  -- L2: B still sees the chat-open request; L3: C no longer sees the expired one.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(2))::text, true);
  select count(*) into n from public.connection_requests where from_id = pg_temp.pc(1);
  if n <> 1 then raise exception 'FAIL L2: B sees % rows of the 31-day chat-open request (want 1)', n; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(3))::text, true);
  select count(*) into n from public.connection_requests where from_id = pg_temp.pc(1);
  if n <> 0 then raise exception 'FAIL L3: C sees the expired request'; end if;
  reset role;

  perform public.purge_expired_requests();
  if not exists (select 1 from public.connection_requests where from_id = pg_temp.pc(1) and to_id = pg_temp.pc(2)) then
    raise exception 'FAIL L2: purge_expired_requests deleted the chat-open request'; end if;
  if exists (select 1 from public.connection_requests where from_id = pg_temp.pc(1) and to_id = pg_temp.pc(3)) then
    raise exception 'FAIL L3: purge_expired_requests kept the expired request'; end if;
end $$;
select 'i-pitch-chat.test L2 (visible, kept) L3 OK';

do $$
declare n int; ids uuid[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(1))::text, true);
  select count(*) into n from public.my_outgoing_requests() o
   where o.to_id = pg_temp.pc(2) and o.status = 'pending' and o.note = 'hello pitch';
  if n <> 1 then raise exception 'FAIL L4: my_outgoing_requests does not list the chat-open request'; end if;
  select coalesce(array_agg(d.id), '{}') into ids from public.deck_candidates(20) d where d.id::text like '0d190000-%';
  reset role;
  if not pg_temp.pc(3) = any(ids) then
    raise exception 'FAIL L4 control: the deck does not offer C (deck setup broken): %', ids; end if;
  if pg_temp.pc(2) = any(ids) then raise exception 'FAIL L4: the deck offers B despite the chat-open request'; end if;
end $$;
select 'i-pitch-chat.test L4 OK';

do $$
declare n int;
begin
  select count(*) into n from pg_proc
   where prosrc ~ 'brivia_request_is_live\(\s*[a-z_.]*status\s*,\s*[a-z_.]*created_at\s*\)';
  if n <> 0 then
    raise exception 'FAIL L5: % function(s) still call the two-argument form: %', n,
      (select string_agg(proname, ', ') from pg_proc
        where prosrc ~ 'brivia_request_is_live\(\s*[a-z_.]*status\s*,\s*[a-z_.]*created_at\s*\)'); end if;
  select count(*) into n from pg_policies
   where coalesce(qual, '') ~ 'brivia_request_is_live\(\s*[a-z_.]*status\s*,\s*[a-z_.]*created_at\s*\)'
      or coalesce(with_check, '') ~ 'brivia_request_is_live\(\s*[a-z_.]*status\s*,\s*[a-z_.]*created_at\s*\)';
  if n <> 0 then raise exception 'FAIL L5: % policy(ies) still use the two-argument form', n; end if;
end $$;
select 'i-pitch-chat.test L5 OK';

do $$
declare st text; t0 timestamptz; t1 timestamptz; nt text;
begin
  select chat_accepted_at into t0 from public.connection_requests where from_id = pg_temp.pc(1) and to_id = pg_temp.pc(2);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(1))::text, true);
  select s.status into st from public.send_signal(pg_temp.pc(2), 'again') s;
  reset role;
  if st is distinct from 'sent' then raise exception 'FAIL L6: send_signal answered %', st; end if;
  select note, chat_accepted_at into nt, t1 from public.connection_requests
   where from_id = pg_temp.pc(1) and to_id = pg_temp.pc(2);
  if nt is distinct from 'hello pitch' then raise exception 'FAIL L6: the note changed to %', nt; end if;
  if t1 is distinct from t0 then raise exception 'FAIL L6: chat_accepted_at changed (% -> %)', t0, t1; end if;
end $$;
select 'i-pitch-chat.test L6 OK';

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(2))::text, true);
  perform public.respond_connection_request(pg_temp.pc(1), true);
  reset role;
  if not exists (select 1 from public.matches m
                  where (m.user1_id = pg_temp.pc(1) and m.user2_id = pg_temp.pc(2))
                     or (m.user1_id = pg_temp.pc(2) and m.user2_id = pg_temp.pc(1))) then
    raise exception 'FAIL L2: accepting the 31-day chat-open request created no match'; end if;
end $$;
do $$ begin perform pg_temp.pc_reset(); end $$;
select 'i-pitch-chat.test L2 (respond) OK';

-- ---------------------------------------------------------------------------------------------------------------
-- Teardown (keep last)
-- ---------------------------------------------------------------------------------------------------------------
do $$ begin perform pg_temp.pc_reset(); end $$;
delete from public.brivia_blocks where blocker_id::text like '0d190000-%' or blocked_id::text like '0d190000-%';
delete from public.brivia_tester where member_id::text like '0d190000-%';
delete from public.profiles where id::text like '0d190000-%';
delete from auth.users where id::text like '0d190000-%';
