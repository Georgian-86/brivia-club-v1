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
-- C1-C10 (Task 2) are described above their block.
-- Layout: fixtures, L-tests, C-tests, then the teardown (keep it last; later tests go above it).
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
-- C-tests (Task 2): accept_pitch_chat, end_pitch_chat, my_pitch_threads and the chat-open message gates.
-- C1 before Accept neither side can insert a message (42501); B's my_pitch_threads lists A 'in', chat_open false.
-- C2 accept_pitch_chat on a blank or null note is P0002; on a real note it succeeds, and again (idempotent).
-- C3 after Accept both directions insert and read; the pair is not in matches; both thread rows read chat_open.
-- C4 end_pitch_chat: by B before Accept, and (fresh) by A after Accept, declines the request and closes the chat;
--    A still reads it as pending, with chat_open false. A ending before Accept is P0002.
-- C5 respond_connection_request(A, false) after Accept closes the chat.
-- C6 a blocked pair (D pitches B, B blocked D): Accept answers normally and opens nothing; B reads nothing from D.
-- C7 a tester pitching a real member across worlds: Accept is P0002; the thread list omits it.
-- C8 after Accept, B's send_signal(A) answers 'matched'; messages still flow; the thread list omits the pair.
-- C9 deleting that match (P10) closes everything: both inserts 42501, neither thread list shows the pair.
-- C11 the typing topic follows the chat: false before Accept, true after (for both), false again after End chat.
-- C10 the thread list's exact signature (no email, phone, coordinates or city); anon cannot execute the three;
--    a caller without a completed profile gets 22023.
-- Callers below run as `authenticated` (set local role in the do block); the helpers set the JWT subject.
-- ---------------------------------------------------------------------------------------------------------------
-- Runs p_sql (one $1 parameter, the member p_arg) as member p_as; 'ok' or the SQLSTATE.
create or replace function pg_temp.pc_try(p_as int, p_sql text, p_arg int) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(p_as))::text, true);
  execute p_sql using pg_temp.pc(p_arg);
  return 'ok';
exception when others then
  return sqlstate;
end $$;

-- Member p_from sends one message to p_to; 'ok' or the SQLSTATE.
create or replace function pg_temp.pc_send(p_from int, p_to int) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(p_from))::text, true);
  insert into public.brivia_messages (sender_id, recipient_id, body)
  values (pg_temp.pc(p_from), pg_temp.pc(p_to), 'pitch chat test');
  return 'ok';
exception when others then
  return sqlstate;
end $$;

-- The messages between p_a and p_b that member p_as can read.
create or replace function pg_temp.pc_seen(p_as int, p_a int, p_b int) returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(p_as))::text, true);
  select count(*) into n from public.brivia_messages m
   where (m.sender_id = pg_temp.pc(p_a) and m.recipient_id = pg_temp.pc(p_b))
      or (m.sender_id = pg_temp.pc(p_b) and m.recipient_id = pg_temp.pc(p_a));
  return n;
end $$;

-- Member p_as's my_pitch_threads() row for p_other, as 'direction:chat_open:note' (null when absent).
create or replace function pg_temp.pc_thread(p_as int, p_other int) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(p_as))::text, true);
  select string_agg(t.direction || ':' || t.chat_open || ':' || coalesce(t.note, '<null>'), ',') into v
    from public.my_pitch_threads() t where t.other_id = pg_temp.pc(p_other);
  return v;
end $$;

create or replace function pg_temp.pc_matched(p_a int, p_b int) returns boolean language sql as $$
  select exists (select 1 from public.matches m
                  where (m.user1_id = pg_temp.pc(p_a) and m.user2_id = pg_temp.pc(p_b))
                     or (m.user1_id = pg_temp.pc(p_b) and m.user2_id = pg_temp.pc(p_a))) $$;

create or replace function pg_temp.pc_clear_messages() returns void language sql as $$
  delete from public.brivia_messages where sender_id::text like '0d190000-%' or recipient_id::text like '0d190000-%' $$;

-- C1 -------------------------------------------------------------------------------------------------------------
do $$ begin perform pg_temp.pc_reset(); perform pg_temp.pc_clear_messages();
            perform pg_temp.pc_request(1, 2, 'hello B', interval '1 day', null); end $$;
do $$
declare v text;
begin
  set local role authenticated;
  v := pg_temp.pc_send(1, 2); if v <> '42501' then raise exception 'FAIL C1: A -> B before Accept: %', v; end if;
  v := pg_temp.pc_send(2, 1); if v <> '42501' then raise exception 'FAIL C1: B -> A before Accept: %', v; end if;
  v := pg_temp.pc_thread(2, 1);
  if v is distinct from 'in:false:hello B' then raise exception 'FAIL C1: B''s thread row for A is %', v; end if;
  v := pg_temp.pc_thread(1, 2);
  if v is distinct from 'out:false:hello B' then raise exception 'FAIL C1: A''s thread row for B is %', v; end if;
end $$;
select 'i-pitch-chat.test C1 OK';

-- C2 -------------------------------------------------------------------------------------------------------------
do $$ begin update public.connection_requests set note = '   ' where from_id = pg_temp.pc(1) and to_id = pg_temp.pc(2); end $$;
do $$
declare v text;
begin
  set local role authenticated;
  v := pg_temp.pc_try(2, 'select public.accept_pitch_chat($1)', 1);
  if v <> 'P0002' then raise exception 'FAIL C2: accept on a blank note answered %', v; end if;
  if pg_temp.pc_thread(2, 1) is not null then raise exception 'FAIL C2: the thread list shows a blank-note request'; end if;
end $$;
do $$ begin update public.connection_requests set note = null where from_id = pg_temp.pc(1) and to_id = pg_temp.pc(2); end $$;
do $$
declare v text;
begin
  set local role authenticated;
  v := pg_temp.pc_try(2, 'select public.accept_pitch_chat($1)', 1);
  if v <> 'P0002' then raise exception 'FAIL C2: accept on a null note answered %', v; end if;
end $$;
do $$ begin update public.connection_requests set note = 'hello B' where from_id = pg_temp.pc(1) and to_id = pg_temp.pc(2); end $$;
do $$
declare v text; t0 timestamptz; t1 timestamptz;
begin
  if (select chat_accepted_at from public.connection_requests where from_id = pg_temp.pc(1) and to_id = pg_temp.pc(2))
     is not null then raise exception 'FAIL C2: the refused accepts set chat_accepted_at'; end if;
  set local role authenticated;
  v := pg_temp.pc_try(2, 'select public.accept_pitch_chat($1)', 1);
  if v <> 'ok' then raise exception 'FAIL C2: accept on a real note answered %', v; end if;
  reset role;
  select chat_accepted_at into t0 from public.connection_requests where from_id = pg_temp.pc(1) and to_id = pg_temp.pc(2);
  if t0 is null then raise exception 'FAIL C2: accept did not set chat_accepted_at'; end if;
  set local role authenticated;
  v := pg_temp.pc_try(2, 'select public.accept_pitch_chat($1)', 1);
  if v <> 'ok' then raise exception 'FAIL C2: a second accept answered %', v; end if;
  reset role;
  select chat_accepted_at into t1 from public.connection_requests where from_id = pg_temp.pc(1) and to_id = pg_temp.pc(2);
  if t1 is distinct from t0 then raise exception 'FAIL C2: a second accept moved chat_accepted_at'; end if;
end $$;
select 'i-pitch-chat.test C2 OK';

-- C3 (continues C2: the chat is open) ------------------------------------------------------------------------------
do $$
declare v text; n int;
begin
  set local role authenticated;
  v := pg_temp.pc_send(1, 2); if v <> 'ok' then raise exception 'FAIL C3: A -> B after Accept: %', v; end if;
  v := pg_temp.pc_send(2, 1); if v <> 'ok' then raise exception 'FAIL C3: B -> A after Accept: %', v; end if;
  n := pg_temp.pc_seen(1, 1, 2); if n <> 2 then raise exception 'FAIL C3: A reads % messages (want 2)', n; end if;
  n := pg_temp.pc_seen(2, 1, 2); if n <> 2 then raise exception 'FAIL C3: B reads % messages (want 2)', n; end if;
  v := pg_temp.pc_thread(2, 1);
  if v is distinct from 'in:true:hello B' then raise exception 'FAIL C3: B''s thread row for A is %', v; end if;
  v := pg_temp.pc_thread(1, 2);
  if v is distinct from 'out:true:hello B' then raise exception 'FAIL C3: A''s thread row for B is %', v; end if;
  reset role;
  if pg_temp.pc_matched(1, 2) then raise exception 'FAIL C3: accept_pitch_chat made a match'; end if;
end $$;
select 'i-pitch-chat.test C3 OK';

-- C4 (B declines before Accept; A ends after Accept; A cannot end before Accept) -----------------------------------
create or replace function pg_temp.pc_c4_closed(p_label text, p_history int) returns void language plpgsql as $$
declare v text; n int;
begin
  if (select status from public.connection_requests where from_id = pg_temp.pc(1) and to_id = pg_temp.pc(2))
     is distinct from 'declined' then raise exception 'FAIL C4 %: the request is not declined', p_label; end if;
  set local role authenticated;
  v := pg_temp.pc_send(1, 2); if v <> '42501' then raise exception 'FAIL C4 %: A -> B after end: %', p_label, v; end if;
  v := pg_temp.pc_send(2, 1); if v <> '42501' then raise exception 'FAIL C4 %: B -> A after end: %', p_label, v; end if;
  -- spec §3.8: what was sent while the chat was open stays readable to both sides
  n := pg_temp.pc_seen(1, 1, 2); if n <> p_history then raise exception 'FAIL C4 %: A reads % messages (want %)', p_label, n, p_history; end if;
  n := pg_temp.pc_seen(2, 1, 2); if n <> p_history then raise exception 'FAIL C4 %: B reads % messages (want %)', p_label, n, p_history; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(1))::text, true);
  select count(*) into n from public.my_outgoing_requests() o where o.to_id = pg_temp.pc(2) and o.status = 'pending';
  if n <> 1 then raise exception 'FAIL C4 %: A''s my_outgoing_requests no longer shows pending', p_label; end if;
  v := pg_temp.pc_thread(1, 2);
  if v is distinct from 'out:false:hello B' then raise exception 'FAIL C4 %: A''s thread row is %', p_label, v; end if;
  v := pg_temp.pc_thread(2, 1);
  if v is not null then raise exception 'FAIL C4 %: B still lists the ended request: %', p_label, v; end if;
  reset role;
end $$;

do $$ begin perform pg_temp.pc_reset(); perform pg_temp.pc_clear_messages();
            perform pg_temp.pc_request(1, 2, 'hello B', interval '1 day', null); end $$;
do $$
declare v text;
begin
  set local role authenticated;
  v := pg_temp.pc_try(1, 'select public.end_pitch_chat($1)', 2);
  if v <> 'P0002' then raise exception 'FAIL C4: A ending before Accept answered %', v; end if;
  reset role;
  if (select status from public.connection_requests where from_id = pg_temp.pc(1) and to_id = pg_temp.pc(2))
     is distinct from 'pending' then raise exception 'FAIL C4: A''s refused end changed the request'; end if;
  set local role authenticated;
  v := pg_temp.pc_try(2, 'select public.end_pitch_chat($1)', 1);
  if v <> 'ok' then raise exception 'FAIL C4: B declining before Accept answered %', v; end if;
  reset role;
  perform pg_temp.pc_c4_closed('(B before Accept)', 0);
  set local role authenticated;
  v := pg_temp.pc_try(2, 'select public.end_pitch_chat($1)', 1);
  if v <> 'P0002' then raise exception 'FAIL C4: ending a declined request answered %', v; end if;
  v := pg_temp.pc_try(2, 'select public.accept_pitch_chat($1)', 1);
  if v <> 'P0002' then raise exception 'FAIL C4: accepting a declined request answered %', v; end if;
end $$;

do $$ begin perform pg_temp.pc_reset(); perform pg_temp.pc_clear_messages();
            perform pg_temp.pc_request(1, 2, 'hello B', interval '1 day', null); end $$;
do $$
declare v text;
begin
  set local role authenticated;
  v := pg_temp.pc_try(2, 'select public.accept_pitch_chat($1)', 1);
  if v <> 'ok' then raise exception 'FAIL C4: accept answered %', v; end if;
  v := pg_temp.pc_send(1, 2); if v <> 'ok' then raise exception 'FAIL C4: A -> B while open: %', v; end if;
  v := pg_temp.pc_try(1, 'select public.end_pitch_chat($1)', 2);
  if v <> 'ok' then raise exception 'FAIL C4: A ending after Accept answered %', v; end if;
  reset role;
  perform pg_temp.pc_c4_closed('(A after Accept)', 1);
end $$;
select 'i-pitch-chat.test C4 OK';

-- C5 -------------------------------------------------------------------------------------------------------------
do $$ begin perform pg_temp.pc_reset(); perform pg_temp.pc_clear_messages();
            perform pg_temp.pc_request(1, 2, 'hello B', interval '1 day', null); end $$;
do $$
declare v text;
begin
  set local role authenticated;
  v := pg_temp.pc_try(2, 'select public.accept_pitch_chat($1)', 1);
  if v <> 'ok' then raise exception 'FAIL C5: accept answered %', v; end if;
  v := pg_temp.pc_send(1, 2); if v <> 'ok' then raise exception 'FAIL C5: A -> B while open: %', v; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(2))::text, true);
  perform public.respond_connection_request(pg_temp.pc(1), false);
  v := pg_temp.pc_send(1, 2); if v <> '42501' then raise exception 'FAIL C5: A -> B after Not now: %', v; end if;
  v := pg_temp.pc_send(2, 1); if v <> '42501' then raise exception 'FAIL C5: B -> A after Not now: %', v; end if;
  reset role;
  if pg_temp.pc_matched(1, 2) then raise exception 'FAIL C5: Not now made a match'; end if;
end $$;
select 'i-pitch-chat.test C5 OK';

-- C6 -------------------------------------------------------------------------------------------------------------
do $$ begin perform pg_temp.pc_reset(); perform pg_temp.pc_clear_messages();
            perform pg_temp.pc_request(4, 2, 'hello from D', interval '1 day', null); end $$;
do $$
declare v text; n int;
begin
  set local role authenticated;
  v := pg_temp.pc_try(2, 'select public.accept_pitch_chat($1)', 4);
  if v <> 'ok' then raise exception 'FAIL C6: accept on a blocked pair answered % (a block must not show)', v; end if;
  reset role;
  if (select chat_accepted_at from public.connection_requests where from_id = pg_temp.pc(4) and to_id = pg_temp.pc(2))
     is not null then raise exception 'FAIL C6: accept on a blocked pair opened the chat'; end if;
  set local role authenticated;
  v := pg_temp.pc_send(4, 2);
  if v <> '42501' then raise exception 'FAIL C6: D -> B answered % (want 42501: the chat never opened)', v; end if;
  n := pg_temp.pc_seen(2, 4, 2); if n <> 0 then raise exception 'FAIL C6: B reads % messages from D', n; end if;
  v := pg_temp.pc_thread(2, 4); if v is not null then raise exception 'FAIL C6: B''s thread list shows D: %', v; end if;
end $$;
select 'i-pitch-chat.test C6 OK';

-- C7 -------------------------------------------------------------------------------------------------------------
do $$ begin perform pg_temp.pc_reset(); perform pg_temp.pc_clear_messages();
            perform pg_temp.pc_request(5, 2, 'hello from T', interval '1 day', null); end $$;
do $$
declare v text;
begin
  set local role authenticated;
  v := pg_temp.pc_try(2, 'select public.accept_pitch_chat($1)', 5);
  if v <> 'P0002' then raise exception 'FAIL C7: accept across worlds answered %', v; end if;
  v := pg_temp.pc_thread(2, 5); if v is not null then raise exception 'FAIL C7: B''s thread list shows T: %', v; end if;
  v := pg_temp.pc_thread(5, 2); if v is not null then raise exception 'FAIL C7: T''s thread list shows B: %', v; end if;
  reset role;
  if (select chat_accepted_at from public.connection_requests where from_id = pg_temp.pc(5) and to_id = pg_temp.pc(2))
     is not null then raise exception 'FAIL C7: accept across worlds opened the chat'; end if;
end $$;
select 'i-pitch-chat.test C7 OK';

-- C8, C9 ---------------------------------------------------------------------------------------------------------
do $$ begin perform pg_temp.pc_reset(); perform pg_temp.pc_clear_messages();
            perform pg_temp.pc_request(1, 2, 'hello B', interval '1 day', null); end $$;
do $$
declare v text; st text;
begin
  set local role authenticated;
  v := pg_temp.pc_try(2, 'select public.accept_pitch_chat($1)', 1);
  if v <> 'ok' then raise exception 'FAIL C8: accept answered %', v; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(2))::text, true);
  select s.status into st from public.send_signal(pg_temp.pc(1), null) s;
  if st is distinct from 'matched' then raise exception 'FAIL C8: B''s send_signal answered %', st; end if;
  v := pg_temp.pc_send(1, 2); if v <> 'ok' then raise exception 'FAIL C8: A -> B after the match: %', v; end if;
  v := pg_temp.pc_send(2, 1); if v <> 'ok' then raise exception 'FAIL C8: B -> A after the match: %', v; end if;
  v := pg_temp.pc_thread(1, 2); if v is not null then raise exception 'FAIL C8: A still lists B: %', v; end if;
  v := pg_temp.pc_thread(2, 1); if v is not null then raise exception 'FAIL C8: B still lists A: %', v; end if;
  reset role;
  if not pg_temp.pc_matched(1, 2) then raise exception 'FAIL C8: no match row'; end if;
end $$;
select 'i-pitch-chat.test C8 OK';

do $$ begin delete from public.matches where (user1_id, user2_id) in ((pg_temp.pc(1), pg_temp.pc(2)), (pg_temp.pc(2), pg_temp.pc(1))); end $$;
do $$
declare v text;
begin
  set local role authenticated;
  v := pg_temp.pc_send(1, 2); if v <> '42501' then raise exception 'FAIL C9: A -> B after the match was deleted: %', v; end if;
  v := pg_temp.pc_send(2, 1); if v <> '42501' then raise exception 'FAIL C9: B -> A after the match was deleted: %', v; end if;
  v := pg_temp.pc_thread(1, 2); if v is not null then raise exception 'FAIL C9: A lists B: %', v; end if;
  v := pg_temp.pc_thread(2, 1); if v is not null then raise exception 'FAIL C9: B lists A: %', v; end if;
end $$;
select 'i-pitch-chat.test C9 OK';

-- C10 ------------------------------------------------------------------------------------------------------------
do $$
declare f text; v text;
begin
  if to_regprocedure('public.my_pitch_threads()') is null then raise exception 'FAIL C10: my_pitch_threads() is missing'; end if;
  v := pg_get_function_result('public.my_pitch_threads()'::regprocedure);
  if v is distinct from 'TABLE(other_id uuid, direction text, note text, created_at timestamp with time zone, chat_open boolean)' then
    raise exception 'FAIL C10: my_pitch_threads returns %', v; end if;
  if v ~* '(email|phone|lat|lng|cell|city|coord)' then raise exception 'FAIL C10: my_pitch_threads exposes %', v; end if;
  foreach f in array array['public.accept_pitch_chat(uuid)', 'public.end_pitch_chat(uuid)', 'public.my_pitch_threads()'] loop
    if not (select prosecdef and proconfig @> array['search_path=public'] from pg_proc where oid = to_regprocedure(f)) then
      raise exception 'FAIL C10: % must be security definer with search_path=public', f; end if;
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL C10: anon can execute %', f; end if;
    if has_function_privilege('public', f, 'execute') then raise exception 'FAIL C10: public can execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL C10: authenticated cannot execute %', f; end if;
  end loop;
  set local role authenticated;   -- member 09 has no profile, so is not completed
  v := pg_temp.pc_try(9, 'select public.accept_pitch_chat($1)', 1);
  if v <> '22023' then raise exception 'FAIL C10: an incomplete caller''s accept answered %', v; end if;
  v := pg_temp.pc_try(9, 'select public.end_pitch_chat($1)', 1);
  if v <> '22023' then raise exception 'FAIL C10: an incomplete caller''s end answered %', v; end if;
  v := pg_temp.pc_try(9, 'select count(*) from public.my_pitch_threads() where other_id = $1', 1);
  if v <> '22023' then raise exception 'FAIL C10: an incomplete caller''s thread list answered %', v; end if;
end $$;
do $$ begin perform pg_temp.pc_reset(); perform pg_temp.pc_clear_messages(); end $$;
select 'i-pitch-chat.test C10 OK';

-- C11 -------------------------------------------------------------------------------------------------------------
-- Member p_as's brivia_typing_topic_ok for the A/B pair topic (ids sorted, as the client builds it).
create or replace function pg_temp.pc_typing(p_as int) returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.pc(p_as))::text, true);
  return brivia_private.brivia_typing_topic_ok('typing:' || pg_temp.pc(1)::text || ':' || pg_temp.pc(2)::text);
end $$;

do $$ begin perform pg_temp.pc_reset(); perform pg_temp.pc_clear_messages();
            perform pg_temp.pc_request(1, 2, 'hello B', interval '1 day', null); end $$;
do $$
declare v text;
begin
  if to_regprocedure('brivia_private.brivia_typing_topic_ok(text)') is null then
    raise exception 'FAIL C11: brivia_typing_topic_ok is missing (the stub has realtime.messages)'; end if;
  set local role authenticated;
  if pg_temp.pc_typing(1) or pg_temp.pc_typing(2) then raise exception 'FAIL C11: typing allowed before Accept'; end if;
  v := pg_temp.pc_try(2, 'select public.accept_pitch_chat($1)', 1);
  if v <> 'ok' then raise exception 'FAIL C11: accept answered %', v; end if;
  if not pg_temp.pc_typing(1) then raise exception 'FAIL C11: A cannot type after Accept'; end if;
  if not pg_temp.pc_typing(2) then raise exception 'FAIL C11: B cannot type after Accept'; end if;
  v := pg_temp.pc_try(1, 'select public.end_pitch_chat($1)', 2);
  if v <> 'ok' then raise exception 'FAIL C11: end answered %', v; end if;
  if pg_temp.pc_typing(1) or pg_temp.pc_typing(2) then raise exception 'FAIL C11: typing allowed after End chat'; end if;
end $$;
do $$ begin perform pg_temp.pc_reset(); perform pg_temp.pc_clear_messages(); end $$;
select 'i-pitch-chat.test C11 OK';

-- ---------------------------------------------------------------------------------------------------------------
-- Teardown (keep last)
-- ---------------------------------------------------------------------------------------------------------------
do $$ begin perform pg_temp.pc_reset(); end $$;
delete from public.brivia_messages where sender_id::text like '0d190000-%' or recipient_id::text like '0d190000-%';
delete from public.brivia_blocks where blocker_id::text like '0d190000-%' or blocked_id::text like '0d190000-%';
delete from public.brivia_tester where member_id::text like '0d190000-%';
delete from public.profiles where id::text like '0d190000-%';
delete from auth.users where id::text like '0d190000-%';
