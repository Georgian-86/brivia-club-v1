-- 0019 (D-112): the pitch (a connection request's note) is seeded as the first chat message when the pair connects,
-- and report_member keeps the pair's request notes as evidence (kind = 'pitch').
-- Ids 0d190000-0000-4000-8000-0000000000NN:
--   01 A, 02 B, 03 C (third member)           S1 B Connects to A's pitch "Hi there" (2 h ago): one message A->B with the
--                                                request's created_at; A and B can read it, C cannot.
--   04 D, 05 E                                 S2 a no-note (D) and a '   '-note (E) request to B: Connect seeds nothing.
--   06 F, 07 G                                 S3 F pitches G ("first", 2 h ago), G pitches F ("second", send_signal):
--                                                like-back match, two messages in time order.
--                                             S4 brivia_create_match again for an existing pair inserts nothing.
--   08 H, 09 I                                 S5 H pitches I, I blocks H, I Connects: no match, no message.
--   10 J, 11 K                                 S6 K reports J after J's pitch (not connected): evidence has kind 'pitch'.
--                                             S7 the 0013 guard's dependency exists; brivia_create_match keeps its
--                                                signature, invoker status and grants, and is plpgsql.
-- The guard's raise path (0019 run without 0013 -> exception) is not exercised: it would need a database without
-- 0013, and the harness applies every migration in order. It is a plain to_regprocedure check at the top of 0019.
-- Client calls use SET LOCAL SESSION AUTHORIZATION (session_user is not the owner, like PostgREST's authenticator), so
-- the 0003 brivia_server_created_at trigger behaves as it does live. One transaction, rolled back.
set brivia.harness_autocomplete = 'off';
begin;

create or replace function pg_temp.ip(n int) returns uuid language sql immutable as $$
  select ('0d190000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

-- A completed member (declared, a cell, 20 points), 10 days old.
create or replace function pg_temp.mk(n int) returns void language plpgsql as $f$
declare mid uuid := pg_temp.ip(n); cell text := public.brivia_grid_cell(18.5204, 73.8567, 7);
begin
  insert into auth.users(id, email) values (mid, 'ipitch' || n || '@example.com') on conflict do nothing;
  insert into public.profiles (id, name, full_name, email)
  values (mid, 'Ipitch ' || n, 'Ipitch ' || n, 'ipitch' || n || '@example.com') on conflict (id) do nothing;
  update public.profiles set adult_declared_at = now(), created_at = now() - interval '10 days' where id = mid;
  insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
  values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), 'in-pune')
  on conflict (member_id) do nothing;
  insert into public.member_interest (member_id, interest_id, points, mode)
  values (mid, 'sports.racket.badminton', 20, 'play') on conflict do nothing;
end $f$;

-- Act as a signed-in client; pg_temp.owner() restores the owner session.
create or replace function pg_temp.client(p_uid uuid) returns void language plpgsql as $f$
begin
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
end $f$;
create or replace function pg_temp.owner() returns void language plpgsql as $f$
begin
  reset role; reset session authorization;
end $f$;

create or replace function pg_temp.pair_msgs(a uuid, b uuid) returns bigint language sql as $f$
  select count(*) from public.brivia_messages m
   where (m.sender_id = a and m.recipient_id = b) or (m.sender_id = b and m.recipient_id = a) $f$;
create or replace function pg_temp.matched(a uuid, b uuid) returns boolean language sql as $f$
  select exists (select 1 from public.matches m
                  where (m.user1_id = a and m.user2_id = b) or (m.user1_id = b and m.user2_id = a)) $f$;

do $$ begin perform pg_temp.mk(g) from generate_series(1, 11) g; end $$;

-- Pitches written as the owner, with a past created_at (send_signal always writes now()).
insert into public.connection_requests (from_id, to_id, note, created_at) values
  (pg_temp.ip(1), pg_temp.ip(2), 'Hi there', now() - interval '2 hours'),
  (pg_temp.ip(4), pg_temp.ip(2), null, now() - interval '1 hour'),
  (pg_temp.ip(5), pg_temp.ip(2), '   ', now() - interval '1 hour'),
  (pg_temp.ip(6), pg_temp.ip(7), 'first', now() - interval '2 hours'),
  (pg_temp.ip(8), pg_temp.ip(9), 'blocked hello', now() - interval '1 hour'),
  (pg_temp.ip(10), pg_temp.ip(11), 'pitch evidence', now() - interval '1 hour');

-- S7 first (cheap).
do $$
declare p record;
begin
  if to_regprocedure('brivia_private.brivia_message_visible(uuid,uuid,uuid)') is null then
    raise exception 'FAIL S7: the 0013 dependency is missing';
  end if;
  select l.lanname, f.prosecdef, f.provolatile, pg_get_function_result(f.oid) as res into p
    from pg_proc f join pg_language l on l.oid = f.prolang
   where f.oid = 'public.brivia_create_match(uuid,uuid)'::regprocedure;
  if p.lanname <> 'plpgsql' then raise exception 'FAIL S7: brivia_create_match is %, not plpgsql', p.lanname; end if;
  if p.prosecdef then raise exception 'FAIL S7: brivia_create_match became security definer'; end if;
  if p.res <> 'void' or p.provolatile <> 'v' then raise exception 'FAIL S7: brivia_create_match returns % (%)', p.res, p.provolatile; end if;
  if has_function_privilege('authenticated', 'public.brivia_create_match(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.brivia_create_match(uuid,uuid)', 'execute') then
    raise exception 'FAIL S7: brivia_create_match is executable by clients'; end if;
end $$;
select 'i-pitch-seed.test S7 OK';

-- S1, S2: B Connects to A, D and E.
do $$
declare r_at timestamptz; m record; n int;
begin
  select created_at into r_at from public.connection_requests where from_id = pg_temp.ip(1) and to_id = pg_temp.ip(2);
  perform pg_temp.client(pg_temp.ip(2));
  perform public.respond_connection_request(pg_temp.ip(1), true);
  perform public.respond_connection_request(pg_temp.ip(4), true);
  perform public.respond_connection_request(pg_temp.ip(5), true);
  perform pg_temp.owner();
  if not pg_temp.matched(pg_temp.ip(1), pg_temp.ip(2)) then raise exception 'FAIL S1: Connect made no match'; end if;
  if pg_temp.pair_msgs(pg_temp.ip(1), pg_temp.ip(2)) <> 1 then
    raise exception 'FAIL S1: expected one seeded message, got %', pg_temp.pair_msgs(pg_temp.ip(1), pg_temp.ip(2)); end if;
  select * into m from public.brivia_messages where sender_id = pg_temp.ip(1) and recipient_id = pg_temp.ip(2);
  if m.body is distinct from 'Hi there' or m.message_type <> 'text' then
    raise exception 'FAIL S1: seeded % / %', m.body, m.message_type; end if;
  if m.created_at is distinct from r_at then
    raise exception 'FAIL S1: seeded at %, the request was at %', m.created_at, r_at; end if;
  -- S2
  if not pg_temp.matched(pg_temp.ip(4), pg_temp.ip(2)) or not pg_temp.matched(pg_temp.ip(5), pg_temp.ip(2)) then
    raise exception 'FAIL S2: Connect made no match'; end if;
  if pg_temp.pair_msgs(pg_temp.ip(4), pg_temp.ip(2)) <> 0 then raise exception 'FAIL S2: a no-note request seeded a message'; end if;
  if pg_temp.pair_msgs(pg_temp.ip(5), pg_temp.ip(2)) <> 0 then raise exception 'FAIL S2: a blank note seeded a message'; end if;
  -- S1 readability: A and B read it, C does not.
  perform pg_temp.client(pg_temp.ip(1));
  if pg_temp.pair_msgs(pg_temp.ip(1), pg_temp.ip(2)) <> 1 then raise exception 'FAIL S1: the sender cannot read the pitch'; end if;
  perform pg_temp.client(pg_temp.ip(2));
  if pg_temp.pair_msgs(pg_temp.ip(1), pg_temp.ip(2)) <> 1 then raise exception 'FAIL S1: the recipient cannot read the pitch'; end if;
  perform pg_temp.client(pg_temp.ip(3));
  if pg_temp.pair_msgs(pg_temp.ip(1), pg_temp.ip(2)) <> 0 then raise exception 'FAIL S1: a third member reads the pitch'; end if;
  perform pg_temp.owner();
end $$;
select 'i-pitch-seed.test S1-S2 OK';

-- S3: like-back. G pitches F back through send_signal: the completion trigger makes the match.
do $$
declare st text; bodies text[]; first_at timestamptz;
begin
  perform pg_temp.client(pg_temp.ip(7));
  select status into st from public.send_signal(pg_temp.ip(6), 'second');
  perform pg_temp.owner();
  if st is distinct from 'matched' then raise exception 'FAIL S3: like-back answered %', st; end if;
  select array_agg(body order by created_at, id) into bodies from public.brivia_messages
   where (sender_id = pg_temp.ip(6) and recipient_id = pg_temp.ip(7)) or (sender_id = pg_temp.ip(7) and recipient_id = pg_temp.ip(6));
  if bodies is distinct from array['first', 'second'] then raise exception 'FAIL S3: seeded %', bodies; end if;
  select created_at into first_at from public.brivia_messages where sender_id = pg_temp.ip(6) and recipient_id = pg_temp.ip(7);
  if first_at is distinct from (select created_at from public.connection_requests where from_id = pg_temp.ip(6) and to_id = pg_temp.ip(7)) then
    raise exception 'FAIL S3: the first pitch is not at its request time'; end if;
  if not exists (select 1 from public.brivia_messages where sender_id = pg_temp.ip(7) and recipient_id = pg_temp.ip(6) and body = 'second') then
    raise exception 'FAIL S3: the second pitch is missing or reversed'; end if;
end $$;
select 'i-pitch-seed.test S3 OK';

-- S4: an existing match seeds nothing again (both orientations).
do $$
begin
  perform public.brivia_create_match(pg_temp.ip(6), pg_temp.ip(7));
  perform public.brivia_create_match(pg_temp.ip(2), pg_temp.ip(1));
  if pg_temp.pair_msgs(pg_temp.ip(6), pg_temp.ip(7)) <> 2 then raise exception 'FAIL S4: a second create_match seeded again (F, G)'; end if;
  if pg_temp.pair_msgs(pg_temp.ip(1), pg_temp.ip(2)) <> 1 then raise exception 'FAIL S4: a second create_match seeded again (A, B)'; end if;
  if (select count(*) from public.matches where (user1_id, user2_id) = (least(pg_temp.ip(6), pg_temp.ip(7)), greatest(pg_temp.ip(6), pg_temp.ip(7)))) <> 1 then
    raise exception 'FAIL S4: duplicate match row'; end if;
end $$;
select 'i-pitch-seed.test S4 OK';

-- S5: a blocked pair never reaches create_match (respond declines silently, P12).
do $$
begin
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.ip(9), pg_temp.ip(8));
  perform pg_temp.client(pg_temp.ip(9));
  perform public.respond_connection_request(pg_temp.ip(8), true);
  perform pg_temp.owner();
  if pg_temp.matched(pg_temp.ip(8), pg_temp.ip(9)) then raise exception 'FAIL S5: a blocked pair matched'; end if;
  if pg_temp.pair_msgs(pg_temp.ip(8), pg_temp.ip(9)) <> 0 then raise exception 'FAIL S5: a blocked pair got a message'; end if;
end $$;
select 'i-pitch-seed.test S5 OK';

-- S6: K reports J after J's pitch; the pair has no messages, the evidence keeps the pitch.
do $$
declare ev jsonb; e jsonb;
begin
  perform pg_temp.client(pg_temp.ip(11));
  perform public.report_member(pg_temp.ip(10), 'spam', null);
  perform pg_temp.owner();
  select evidence into ev from public.member_report where reporter_id = pg_temp.ip(11) and target_id = pg_temp.ip(10);
  if ev is null then raise exception 'FAIL S6: no report row'; end if;
  select x into e from jsonb_array_elements(ev) x where x->>'kind' = 'pitch';
  if e is null then raise exception 'FAIL S6: evidence has no pitch: %', ev; end if;
  if e->>'body' is distinct from 'pitch evidence' or (e->>'from_me')::boolean is distinct from false
     or not (e ? 'attachment_path') or (e->>'at') is null then
    raise exception 'FAIL S6: pitch evidence shape %', e; end if;
end $$;
select 'i-pitch-seed.test S6 OK';

rollback;
