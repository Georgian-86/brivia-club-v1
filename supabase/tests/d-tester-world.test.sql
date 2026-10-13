-- Phase D, Task 1 (0008): the tester switch. A real account listed in public.brivia_tester joins the test world
-- (brivia_in_test_world) without ever becoming is_test, so the purge (which deletes by is_test) never deletes it.
-- Every world comparison between two members goes through brivia_in_test_world; semantics are otherwise unchanged:
--   a test member sees only the test world; a real member sees only real members; a tester sees only the test world
--   and is visible only to it; no real member can see a tester while it is a tester.
-- Members are made completed directly as the owner (the harness autocomplete is off).
-- Ids: de7e57e7-e7e7-4e7e-a7e7-e7e7e7e7e7NN, all in one Bengaluru g7 cell:
--   01 T1 test   02 T2 test   03 R1 real (made a tester)   04 R2 real
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.tw(n int) returns uuid language sql immutable as $$
  select ('de7e57e7-e7e7-4e7e-a7e7-e7e7e7e7e7' || lpad(n::text, 2, '0'))::uuid $$;

-- The density watermark is global: no other suite may leave a row behind, and neither does this one.
delete from public.cell_density;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9352, 77.6245, 7);
begin
  for g in 1..4 loop
    mid := pg_temp.tw(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, is_test, experience, looking_for)
    values (mid, 'Twx ' || g, 'Twx ' || g, 'twx' || g || '@example.com', g <= 2, 'Some years', array['Friends'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now(), created_at = now() - interval '20 days' where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5),
            public.brivia_nearest_place(cell))
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20)
    on conflict do nothing;
  end loop;
  if (select count(*) from generate_series(1, 4) s(i) where public.brivia_member_completed(pg_temp.tw(s.i))) <> 4 then
    raise exception 'FAIL setup: the four tester-world fixtures are not completed';
  end if;
  if (select count(*) from public.profiles where id::text like 'de7e57e7-%' and is_test) <> 2 then
    raise exception 'FAIL setup: expected exactly T1 and T2 to be is_test';
  end if;
end $$;

-- Helpers: run an RPC as a signed-in member (role authenticated, auth.uid() = p_viewer).
create or replace function pg_temp.deck_ids(p_viewer uuid) returns uuid[] language plpgsql as $$
declare r uuid[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select coalesce(array_agg(d.id order by d.id), '{}') into r from public.deck_candidates(20) d
   where d.id::text like 'de7e57e7-%';
  reset role;
  return r;
end $$;

create or replace function pg_temp.search_ids(p_viewer uuid) returns uuid[] language plpgsql as $$
declare r uuid[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select coalesce(array_agg(s.id order by s.id), '{}') into r from public.search_members('Twx', 20) s;
  reset role;
  return r;
end $$;

create or replace function pg_temp.cand_ids(p_viewer uuid) returns uuid[] language plpgsql as $$
declare r uuid[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select coalesce(array_agg(c.id order by c.id), '{}') into r
    from public.get_candidates(array[pg_temp.tw(1), pg_temp.tw(2), pg_temp.tw(3), pg_temp.tw(4)]) c;
  reset role;
  return r;
end $$;

-- list_members is executable by no client role: the owner calls it with the member's claims.
create or replace function pg_temp.list_ids(p_viewer uuid) returns uuid[] language plpgsql as $$
declare r uuid[];
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select coalesce(array_agg(l.id order by l.id), '{}') into r from public.list_members(20) l where l.id::text like 'de7e57e7-%';
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

create or replace function pg_temp.status(p_viewer uuid) returns text language plpgsql as $$
declare r text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  r := public.deck_status();
  reset role;
  return r;
end $$;

create or replace function pg_temp.signal(p_from uuid, p_to uuid) returns text language plpgsql as $$
declare r text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_from)::text, true);
  select s.status into r from public.send_signal(p_to) s;
  reset role;
  return r;
end $$;

create or replace function pg_temp.outgoing(p_viewer uuid) returns uuid[] language plpgsql as $$
declare r uuid[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select coalesce(array_agg(o.to_id order by o.to_id), '{}') into r from public.my_outgoing_requests() o;
  reset role;
  return r;
end $$;

-- true when the member's message insert is accepted by RLS
create or replace function pg_temp.can_send(p_from uuid, p_to uuid) returns boolean language plpgsql as $$
declare ok boolean := true;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_from)::text, true);
  begin
    insert into public.brivia_messages (sender_id, recipient_id, body) values (p_from, p_to, 'tester world');
  exception when insufficient_privilege then ok := false;
  end;
  reset role;
  return ok;
end $$;

-- pending requests addressed to the viewer that the viewer can read (the client's request and notification list)
create or replace function pg_temp.incoming(p_viewer uuid) returns uuid[] language plpgsql as $$
declare r uuid[];
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select coalesce(array_agg(c.from_id order by c.from_id), '{}') into r from public.connection_requests c
   where c.status = 'pending';
  reset role;
  return r;
end $$;

-- the policy helper behind that list, evaluated as the viewer
create or replace function pg_temp.req_visible(p_viewer uuid, p_from uuid) returns boolean language plpgsql as $$
declare r boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  r := brivia_private.brivia_incoming_request_visible(p_from);
  reset role;
  return r;
end $$;

-- respond_connection_request as the viewer: 'ok' or the SQLSTATE
create or replace function pg_temp.respond(p_viewer uuid, p_from uuid, p_accept boolean) returns text language plpgsql as $$
declare r text := 'ok';
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  begin
    perform public.respond_connection_request(p_from, p_accept);
  exception when others then r := sqlstate;
  end;
  reset role;
  return r;
end $$;

-- can the viewer read a match row with p_other (the client's match and chat list)?
create or replace function pg_temp.sees_match(p_viewer uuid, p_other uuid) returns boolean language plpgsql as $$
declare r boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  r := exists (select 1 from public.matches m where p_other in (m.user1_id, m.user2_id));
  reset role;
  return r;
end $$;

-- messages between the viewer and p_other that the viewer can read
create or replace function pg_temp.msg_count(p_viewer uuid, p_other uuid) returns int language plpgsql as $$
declare r int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select count(*) into r from public.brivia_messages m where p_other in (m.sender_id, m.recipient_id);
  reset role;
  return r;
end $$;

create or replace function pg_temp.ids(variadic n int[]) returns uuid[] language sql immutable as $$
  select coalesce(array_agg(pg_temp.tw(x) order by pg_temp.tw(x)), '{}') from unnest(n) u(x) $$;

-- deck_why (Task 3) as the viewer: the one row as jsonb, or null when it returns nothing; '{"rows":n}' when n > 1.
create or replace function pg_temp.why(p_viewer uuid, p_target uuid) returns jsonb language plpgsql as $$
declare r jsonb; n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select count(*), (array_agg(to_jsonb(w)))[1] into n, r from public.deck_why(p_target) w;
  reset role;
  if n > 1 then return jsonb_build_object('rows', n); end if;
  return r;
end $$;

-- the deck_candidates row for p_target as the viewer (band and labels only), or null
create or replace function pg_temp.deck_row(p_viewer uuid, p_target uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', p_viewer)::text, true);
  select jsonb_build_object('distance_band', d.distance_band, 'shared_interests', d.shared_interests) into r
    from public.deck_candidates(20) d where d.id = p_target;
  reset role;
  return r;
end $$;


-- 1. Shape and privileges: brivia_tester is owner-only; brivia_in_test_world is an internal definer helper.
do $$
declare r text; failed boolean;
begin
  if to_regclass('public.brivia_tester') is null then raise exception 'FAIL: public.brivia_tester missing'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.brivia_tester'::regclass) then
    raise exception 'FAIL: brivia_tester must have RLS enabled'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'brivia_tester') then
    raise exception 'FAIL: brivia_tester must have no policies'; end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'public.brivia_tester', 'select') or has_table_privilege(r, 'public.brivia_tester', 'insert')
       or has_table_privilege(r, 'public.brivia_tester', 'update') or has_table_privilege(r, 'public.brivia_tester', 'delete') then
      raise exception 'FAIL: % has a privilege on brivia_tester', r; end if;
  end loop;
  -- and an attempt really fails, for both roles, both directions
  foreach r in array array['anon', 'authenticated'] loop
    failed := false;
    execute format('set local role %I', r);
    begin perform 1 from public.brivia_tester; exception when insufficient_privilege then failed := true; end;
    reset role;
    if not failed then raise exception 'FAIL: % can read brivia_tester', r; end if;
    failed := false;
    execute format('set local role %I', r);
    perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.tw(3))::text, true);
    begin insert into public.brivia_tester(member_id) values (pg_temp.tw(3));
    exception when insufficient_privilege then failed := true; end;
    reset role;
    if not failed then raise exception 'FAIL: % can write brivia_tester', r; end if;
  end loop;
  if to_regprocedure('public.brivia_in_test_world(uuid)') is null then raise exception 'FAIL: brivia_in_test_world missing'; end if;
  if not (select prosecdef and provolatile = 's' and proconfig @> array['search_path=public']
            from pg_proc where oid = 'public.brivia_in_test_world(uuid)'::regprocedure) then
    raise exception 'FAIL: brivia_in_test_world must be stable security definer with search_path=public'; end if;
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_function_privilege(r, 'public.brivia_in_test_world(uuid)', 'execute') then
      raise exception 'FAIL: % can execute brivia_in_test_world', r; end if;
  end loop;
  -- the pair rule: internal in public; its caller-pinned policy wrapper in brivia_private (authenticated only)
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_function_privilege(r, 'public.brivia_pair_world_ok(uuid, uuid)', 'execute') then
      raise exception 'FAIL: % can execute public.brivia_pair_world_ok', r; end if;
  end loop;
  if has_function_privilege('anon', 'brivia_private.brivia_pair_world_ok(uuid, uuid)', 'execute')
     or has_function_privilege('public', 'brivia_private.brivia_pair_world_ok(uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'brivia_private.brivia_pair_world_ok(uuid, uuid)', 'execute') then
    raise exception 'FAIL: brivia_private.brivia_pair_world_ok grants'; end if;
  if not (select bool_and(prosecdef and proconfig @> array['search_path=public']) from pg_proc
           where oid in ('public.brivia_pair_world_ok(uuid, uuid)'::regprocedure,
                         'brivia_private.brivia_pair_world_ok(uuid, uuid)'::regprocedure)) then
    raise exception 'FAIL: brivia_pair_world_ok must be security definer with search_path=public'; end if;
end $$;

-- 2. Before the switch: two separate worlds.
do $$
begin
  if public.brivia_in_test_world(pg_temp.tw(3)) or not public.brivia_in_test_world(pg_temp.tw(1)) then
    raise exception 'FAIL: brivia_in_test_world before the switch'; end if;
  if pg_temp.deck_ids(pg_temp.tw(3)) <> pg_temp.ids(4) then raise exception 'FAIL before: R1 deck %', pg_temp.deck_ids(pg_temp.tw(3)); end if;
  if pg_temp.deck_ids(pg_temp.tw(1)) <> pg_temp.ids(2) then raise exception 'FAIL before: T1 deck %', pg_temp.deck_ids(pg_temp.tw(1)); end if;
end $$;

-- 2b. deck_why (Task 3): a real member gets nothing, even for a member on its own deck; only definer, authenticated.
do $$
declare r1 uuid := pg_temp.tw(3); r2 uuid := pg_temp.tw(4);
begin
  if to_regprocedure('public.deck_why(uuid)') is null then raise exception 'FAIL why: public.deck_why(uuid) missing'; end if;
  if not (select prosecdef from pg_proc where oid = 'public.deck_why(uuid)'::regprocedure) then
    raise exception 'FAIL why: deck_why must be security definer'; end if;
  if has_function_privilege('anon', 'public.deck_why(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.deck_why(uuid)', 'execute') then
    raise exception 'FAIL why: deck_why must be executable by authenticated only'; end if;
  if pg_temp.deck_row(r1, r2) is null then raise exception 'FAIL why setup: R2 is not on real R1''s deck'; end if;
  if pg_temp.why(r1, r2) is not null then
    raise exception 'FAIL why: deck_why returns nothing for a real member, got %', pg_temp.why(r1, r2); end if;
  if pg_temp.why(r2, r1) is not null then raise exception 'FAIL why: real R2 got a row for R1'; end if;
end $$;

-- 3. R1 becomes a tester (the founder's one-line insert). is_test is untouched.
insert into public.brivia_tester(member_id) values ('de7e57e7-e7e7-4e7e-a7e7-e7e7e7e7e703') on conflict do nothing;

do $$
declare r1 uuid := pg_temp.tw(3); r2 uuid := pg_temp.tw(4); n int;
begin
  if (select is_test from public.profiles where id = r1) then raise exception 'FAIL: the switch changed R1.is_test'; end if;
  if not public.brivia_in_test_world(r1) then raise exception 'FAIL: R1 is not in the test world'; end if;
  -- tester R1's deck returns test members and no real members
  if pg_temp.deck_ids(r1) <> pg_temp.ids(1, 2) then raise exception 'FAIL tester: R1 deck %', pg_temp.deck_ids(r1); end if;
  if pg_temp.search_ids(r1) <> pg_temp.ids(1, 2) then raise exception 'FAIL tester: R1 search %', pg_temp.search_ids(r1); end if;
  if pg_temp.cand_ids(r1) <> pg_temp.ids(1, 2) then raise exception 'FAIL tester: R1 candidates %', pg_temp.cand_ids(r1); end if;
  if pg_temp.list_ids(r1) <> pg_temp.ids(1, 2) then raise exception 'FAIL tester: R1 list_members %', pg_temp.list_ids(r1); end if;
  if pg_temp.status(r1) <> 'caught_up' then raise exception 'FAIL tester: R1 deck_status %', pg_temp.status(r1); end if;
  -- real member R2 sees neither R1 nor test members (deck, search, candidates, list, profile row)
  if pg_temp.deck_ids(r2) <> '{}' then raise exception 'FAIL real: R2 deck %', pg_temp.deck_ids(r2); end if;
  if pg_temp.search_ids(r2) <> '{}' then raise exception 'FAIL real: R2 search %', pg_temp.search_ids(r2); end if;
  if pg_temp.cand_ids(r2) <> '{}' then raise exception 'FAIL real: R2 candidates %', pg_temp.cand_ids(r2); end if;
  if pg_temp.list_ids(r2) <> '{}' then raise exception 'FAIL real: R2 list_members %', pg_temp.list_ids(r2); end if;
  if pg_temp.status(r2) <> 'no_members_yet' then raise exception 'FAIL real: R2 deck_status %', pg_temp.status(r2); end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', r2)::text, true);
  select count(*) into n from public.profiles where id in (r1, pg_temp.tw(1), pg_temp.tw(2));
  reset role;
  if n <> 0 then raise exception 'FAIL real: R2 reads % tester-world profile rows', n; end if;
  -- test member T1 sees R1 (same world)
  if pg_temp.deck_ids(pg_temp.tw(1)) <> pg_temp.ids(2, 3) then raise exception 'FAIL test: T1 deck %', pg_temp.deck_ids(pg_temp.tw(1)); end if;
  if pg_temp.cand_ids(pg_temp.tw(1)) <> pg_temp.ids(2, 3) then raise exception 'FAIL test: T1 candidates %', pg_temp.cand_ids(pg_temp.tw(1)); end if;
  if pg_temp.search_ids(pg_temp.tw(1)) <> pg_temp.ids(2, 3) then raise exception 'FAIL test: T1 search %', pg_temp.search_ids(pg_temp.tw(1)); end if;
end $$;

-- 3b. deck_why (Task 3): a tester viewing a test member gets the same band and shared interests as its deck card,
-- with the deck's order keys; an invisible target (another world, blocked, unknown, itself) gets nothing; no row is
-- logged (deck_why is not a serving surface).
do $$
declare r1 uuid := pg_temp.tw(3); r2 uuid := pg_temp.tw(4); t2 uuid := pg_temp.tw(2); w jsonb; d jsonb; n0 int; n1 int;
begin
  select count(*) into n0 from public.interaction where viewer_id = r1;
  w := pg_temp.why(r1, t2);
  select count(*) into n1 from public.interaction where viewer_id = r1;
  if w is null then raise exception 'FAIL why: tester R1 got no row for test member T2'; end if;
  if n1 <> n0 then raise exception 'FAIL why: deck_why wrote % interaction rows', n1 - n0; end if;
  d := pg_temp.deck_row(r1, t2);
  if d is null then raise exception 'FAIL why setup: T2 is not on tester R1''s deck'; end if;
  if w -> 'shared_interests' <> d -> 'shared_interests' or w ->> 'distance_band' <> d ->> 'distance_band' then
    raise exception 'FAIL why: deck_why % differs from the deck card %', w, d; end if;
  -- no cell_density rows here, so the band is the place tier (the place name), as on the deck card
  if w ->> 'distance_band' <> (select pl.name from public.member_orbit o join public.place pl on pl.id = o.place_id
                                where o.member_id = t2)
     or w -> 'shared_interests' <> to_jsonb(array[(select label from public.interest_node where id = 'sports.racket.badminton')]) then
    raise exception 'FAIL why: expected T2''s place and the badminton label, got %', w; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(w -> 'rank_keys') k)
     <> array['has_shared', 'overlap_level', 'ring', 'shared_count', 'tie_break'] then
    raise exception 'FAIL why: rank_keys %', w -> 'rank_keys'; end if;
  if (w #>> '{rank_keys,has_shared}')::boolean is not true or (w #>> '{rank_keys,shared_count}')::int <> 1
     or (w #>> '{rank_keys,ring}')::int <> 2 or (w #>> '{rank_keys,overlap_level}')::int <> 3
     or w #>> '{rank_keys,tie_break}' <> 'daily' then
    raise exception 'FAIL why: rank_keys values %', w -> 'rank_keys'; end if;
  -- nothing for an invisible target
  if pg_temp.why(r1, r2) is not null then raise exception 'FAIL why: tester R1 got a row for real R2'; end if;
  if pg_temp.why(r1, r1) is not null then raise exception 'FAIL why: R1 got a row for itself'; end if;
  if pg_temp.why(r1, '00000000-0000-4000-8000-0000000000ff') is not null then
    raise exception 'FAIL why: a row for an unknown id'; end if;
  if pg_temp.why(r1, null) is not null then raise exception 'FAIL why: a row for null'; end if;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (t2, r1);
  if pg_temp.why(r1, t2) is not null then raise exception 'FAIL why: a row for a test member who blocked R1'; end if;
  delete from public.brivia_blocks where blocker_id = t2 and blocked_id = r1;
  -- real R2 still gets nothing, for anyone
  if pg_temp.why(r2, t2) is not null or pg_temp.why(r2, r1) is not null then
    raise exception 'FAIL why: real R2 got a row'; end if;
end $$;

-- 4. T1 can request R1, and a match forms only by mutual consent; then both can message.
do $$
declare t1 uuid := pg_temp.tw(1); r1 uuid := pg_temp.tw(3); st text;
begin
  st := pg_temp.signal(t1, r1);
  if st <> 'sent' then raise exception 'FAIL consent: T1 -> R1 answered %', st; end if;
  if not exists (select 1 from public.connection_requests where from_id = t1 and to_id = r1) then
    raise exception 'FAIL consent: T1 -> R1 wrote no request'; end if;
  if exists (select 1 from public.matches where t1 in (user1_id, user2_id) and r1 in (user1_id, user2_id)) then
    raise exception 'FAIL consent: a match exists after one side only'; end if;
  if pg_temp.can_send(t1, r1) then raise exception 'FAIL consent: T1 can message R1 before a match'; end if;
  st := pg_temp.signal(r1, t1);
  if st <> 'matched' then raise exception 'FAIL consent: R1 -> T1 answered %', st; end if;
  if not exists (select 1 from public.matches where t1 in (user1_id, user2_id) and r1 in (user1_id, user2_id)) then
    raise exception 'FAIL consent: no match after both sides'; end if;
  if not pg_temp.can_send(t1, r1) or not pg_temp.can_send(r1, t1) then
    raise exception 'FAIL consent: matched T1 and R1 cannot message'; end if;
end $$;

-- 5. R1 cannot request or message R2 while a tester (even with a match and a request from before the switch).
do $$
declare r1 uuid := pg_temp.tw(3); r2 uuid := pg_temp.tw(4); st text;
begin
  st := pg_temp.signal(r1, r2);
  if st <> 'sent' then raise exception 'FAIL: tester -> real answered % (must look like any send)', st; end if;
  if exists (select 1 from public.connection_requests where from_id = r1 and to_id = r2) then
    raise exception 'FAIL: tester R1 wrote a request to real R2'; end if;
  st := pg_temp.signal(r2, r1);
  if exists (select 1 from public.connection_requests where from_id = r2 and to_id = r1) then
    raise exception 'FAIL: real R2 wrote a request to tester R1'; end if;
  -- A match and messages from before the switch (owner writes): no new messages either way, and while R1 is a
  -- tester neither side can read the match or the old messages.
  perform public.brivia_create_match(r1, r2);
  insert into public.brivia_messages (sender_id, recipient_id, body) values (r1, r2, 'before the switch');
  if pg_temp.can_send(r1, r2) then raise exception 'FAIL: tester R1 can message real R2'; end if;
  if pg_temp.can_send(r2, r1) then raise exception 'FAIL: real R2 can message tester R1'; end if;
  if pg_temp.sees_match(r2, r1) or pg_temp.sees_match(r1, r2) then
    raise exception 'FAIL: a real-world match is readable while R1 is a tester'; end if;
  if pg_temp.msg_count(r2, r1) <> 0 or pg_temp.msg_count(r1, r2) <> 0 then
    raise exception 'FAIL: real-world messages are readable while R1 is a tester'; end if;
  -- send_signal answers like for any unreadable pair: 'sent', never 'matched'
  st := pg_temp.signal(r2, r1);
  if st <> 'sent' then raise exception 'FAIL: R2 -> tester R1 with a hidden match answered %', st; end if;
  -- (deleting a match also deletes the pair's requests, 0002 brivia_on_match_deleted: the request comes after)
  delete from public.matches where r1 in (user1_id, user2_id) and r2 in (user1_id, user2_id);
  -- A pending request R1 -> R2 from before the switch: R1's outgoing list hides it, R2 does not see it (list and
  -- visibility helper) and cannot accept it.
  insert into public.connection_requests (from_id, to_id, note) values (r1, r2, 'from before the switch');
  if r2 = any(pg_temp.outgoing(r1)) then raise exception 'FAIL: R1 outgoing shows real R2 while a tester'; end if;
  if r1 = any(pg_temp.incoming(r2)) then raise exception 'FAIL: R2 sees tester R1''s pending request'; end if;
  if pg_temp.req_visible(r2, r1) then raise exception 'FAIL: brivia_incoming_request_visible shows R1 to R2'; end if;
  st := pg_temp.respond(r2, r1, true);
  if st <> 'P0002' then raise exception 'FAIL: R2 accepting tester R1''s request answered %', st; end if;
  if exists (select 1 from public.matches where r1 in (user1_id, user2_id) and r2 in (user1_id, user2_id))
     or (select status from public.connection_requests where from_id = r1 and to_id = r2) <> 'pending' then
    raise exception 'FAIL: R2 accepted a request across worlds'; end if;
  st := pg_temp.respond(r2, r1, false);
  if st <> 'P0002' or (select status from public.connection_requests where from_id = r1 and to_id = r2) <> 'pending' then
    raise exception 'FAIL: R2 declined a request across worlds (%)', st; end if;
end $$;

-- 5b. The other direction: a pending request R2 -> R1 from before the switch is invisible to tester R1 too.
do $$
declare r1 uuid := pg_temp.tw(3); r2 uuid := pg_temp.tw(4); st text;
begin
  delete from public.connection_requests where from_id = r1 and to_id = r2;   -- else the insert below matches them
  insert into public.connection_requests (from_id, to_id, note) values (r2, r1, 'also from before the switch');
  if r2 = any(pg_temp.incoming(r1)) then raise exception 'FAIL: tester R1 sees R2''s pending request'; end if;
  if pg_temp.req_visible(r1, r2) then raise exception 'FAIL: brivia_incoming_request_visible shows R2 to tester R1'; end if;
  st := pg_temp.respond(r1, r2, true);
  if st <> 'P0002' then raise exception 'FAIL: tester R1 accepting R2''s request answered %', st; end if;
  if exists (select 1 from public.matches where r1 in (user1_id, user2_id) and r2 in (user1_id, user2_id)) then
    raise exception 'FAIL: tester R1 accepted a request across worlds'; end if;
  if r1 = any(pg_temp.outgoing(r2)) then raise exception 'FAIL: R2 outgoing shows tester R1'; end if;
  -- Pairs without a tester keep their 0001-0006 behaviour: a legacy match between real R2 and test member T2 stays
  -- readable to both (trust.test.sql I6 covers its 'matched' signal answer).
  perform public.brivia_create_match(r2, pg_temp.tw(2));
  if not pg_temp.sees_match(r2, pg_temp.tw(2)) or not pg_temp.sees_match(pg_temp.tw(2), r2) then
    raise exception 'FAIL: a legacy cross-world match without a tester became unreadable'; end if;
  delete from public.matches where r2 in (user1_id, user2_id) and pg_temp.tw(2) in (user1_id, user2_id);
end $$;

-- 6. Cell density counts R1 in the test world while a tester, and in the real world after.
do $$
declare v_cell text := (select home_cell from public.member_orbit where member_id = pg_temp.tw(3));
begin
  perform public.refresh_cell_density(current_date);
  if (select n from public.cell_density where cell_density.cell = v_cell and is_test) is distinct from 3
     or (select n from public.cell_density where cell_density.cell = v_cell and not is_test) is distinct from 1 then
    raise exception 'FAIL density: tester counted in the wrong world: %',
      (select json_agg(d) from public.cell_density d where d.cell = v_cell);
  end if;
end $$;

-- 6b. While R1 is a tester, test member T2 sends R1 a request that stays pending (T1 and R1 are already matched).
do $$
declare st text;
begin
  st := pg_temp.signal(pg_temp.tw(2), pg_temp.tw(3));
  if st is distinct from 'sent'
     or not exists (select 1 from public.connection_requests where from_id = pg_temp.tw(2) and to_id = pg_temp.tw(3) and status = 'pending') then
    raise exception 'FAIL setup: T2 -> tester R1 answered %, request pending: %', st,
      exists (select 1 from public.connection_requests where from_id = pg_temp.tw(2) and to_id = pg_temp.tw(3) and status = 'pending'); end if;
  if not (pg_temp.tw(2) = any(pg_temp.incoming(pg_temp.tw(3)))) then raise exception 'FAIL: tester R1 does not see T2''s request'; end if;
end $$;

-- 7. Removing R1's tester row restores R1 <-> R2 and hides the test members again.
delete from public.brivia_tester where member_id = 'de7e57e7-e7e7-4e7e-a7e7-e7e7e7e7e703';

do $$
declare r1 uuid := pg_temp.tw(3); r2 uuid := pg_temp.tw(4); v_cell text;
begin
  if public.brivia_in_test_world(r1) then raise exception 'FAIL restore: R1 still in the test world'; end if;
  -- R1 signalled R2 in step 5 (30-day deck exclusion): R1 reads R2 through search and candidates; the deck stays empty
  if pg_temp.search_ids(r1) <> pg_temp.ids(4) then raise exception 'FAIL restore: R1 search %', pg_temp.search_ids(r1); end if;
  if pg_temp.cand_ids(r1) <> pg_temp.ids(4) then raise exception 'FAIL restore: R1 candidates %', pg_temp.cand_ids(r1); end if;
  if pg_temp.deck_ids(r1) <> '{}' then raise exception 'FAIL restore: R1 deck % (no test member, and R2 was signalled)', pg_temp.deck_ids(r1); end if;
  -- R2 signalled R1 in step 5 too (30-day deck exclusion): R2 reads R1 through search and candidates
  if pg_temp.search_ids(r2) <> pg_temp.ids(3) then raise exception 'FAIL restore: R2 search %', pg_temp.search_ids(r2); end if;
  if pg_temp.cand_ids(r2) <> pg_temp.ids(3) then raise exception 'FAIL restore: R2 candidates %', pg_temp.cand_ids(r2); end if;
  if pg_temp.cand_ids(pg_temp.tw(1)) <> pg_temp.ids(2) then raise exception 'FAIL restore: T1 candidates %', pg_temp.cand_ids(pg_temp.tw(1)); end if;
  if not (r1 = any(pg_temp.outgoing(r2))) then raise exception 'FAIL restore: R2 outgoing lost the request to R1'; end if;
  if pg_temp.msg_count(r2, r1) <> 1 or pg_temp.msg_count(r1, r2) <> 1 then
    raise exception 'FAIL restore: the real-world message is not readable again'; end if;
  if pg_temp.can_send(r1, pg_temp.tw(1)) then raise exception 'FAIL restore: R1 can still message test member T1'; end if;
  -- Pinned behaviour (fix round 1): the rule needs a tester row, so the ex-tester's test-world rows are NOT hidden
  -- after it stops. Until the purge, R1 still reads its match and messages with T1 and sees T2's pending request,
  -- while the deck and search show no test member and messaging them stays refused (above).
  if not pg_temp.sees_match(r1, pg_temp.tw(1)) then raise exception 'FAIL restore: ex-tester R1 no longer reads its T1 match'; end if;
  if pg_temp.msg_count(r1, pg_temp.tw(1)) <> 2 then
    raise exception 'FAIL restore: ex-tester R1 reads % of its 2 messages with T1', pg_temp.msg_count(r1, pg_temp.tw(1)); end if;
  if not (pg_temp.tw(2) = any(pg_temp.incoming(r1))) then raise exception 'FAIL restore: ex-tester R1 does not see T2''s pending request'; end if;
  if pg_temp.tw(1) = any(pg_temp.search_ids(r1)) or pg_temp.tw(2) = any(pg_temp.search_ids(r1)) then
    raise exception 'FAIL restore: ex-tester R1 finds test members in search'; end if;
  select home_cell into v_cell from public.member_orbit where member_id = r1;
  perform public.refresh_cell_density(current_date + 1);
  if (select n from public.cell_density where cell_density.cell = v_cell and is_test) is distinct from 2
     or (select n from public.cell_density where cell_density.cell = v_cell and not is_test) is distinct from 2 then
    raise exception 'FAIL density: R1 not back in the real world: %', (select json_agg(d) from public.cell_density d where d.cell = v_cell);
  end if;
  -- the pending request R2 -> R1 is visible and acceptable again (it is not expired), and the match forms
  if not (r2 = any(pg_temp.incoming(r1))) or not pg_temp.req_visible(r1, r2) then
    raise exception 'FAIL restore: R1 does not see R2''s pending request again'; end if;
  if pg_temp.respond(r1, r2, true) <> 'ok' then raise exception 'FAIL restore: R1 cannot accept R2''s request'; end if;
  if not pg_temp.sees_match(r1, r2) or not pg_temp.sees_match(r2, r1) then
    raise exception 'FAIL restore: the accepted match is not readable by both'; end if;
end $$;
delete from public.cell_density;

-- 8. report_member qualifies only within the reporter's world (R1 a tester again).
insert into public.brivia_tester(member_id) values ('de7e57e7-e7e7-4e7e-a7e7-e7e7e7e7e703') on conflict do nothing;
do $$
declare r1 uuid := pg_temp.tw(3);
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', r1)::text, true);
  perform public.report_member(pg_temp.tw(1), 'spam', null);   -- matched, same (test) world: qualifying
  perform public.report_member(pg_temp.tw(4), 'spam', null);   -- a request exists, but another world: not qualifying
  reset role;
  if not (select qualifying from public.member_report where reporter_id = r1 and target_id = pg_temp.tw(1)) then
    raise exception 'FAIL report: a tester reporting a matched test member does not qualify'; end if;
  if (select qualifying from public.member_report where reporter_id = r1 and target_id = pg_temp.tw(4)) then
    raise exception 'FAIL report: a tester reporting a real member qualifies'; end if;
  delete from public.member_report where reporter_id = r1;
  delete from public.brivia_blocks where blocker_id = r1;
end $$;

-- 9. Guard: no function (public, brivia_private) or policy compares is_test between two profiles any more.
do $$
declare bad text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname) into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'brivia_private')
     and p.proname not in ('brivia_guard_is_test', 'refresh_cell_density')
     and (p.prosrc ~ 'is_test\s*=\s*\(?\s*(select\s+)?\w+\.is_test'
          or p.prosrc ~ '=\s*me\.is_test'
          or p.prosrc ~ 'select\s+is_test\s+from\s+public\.profiles[^;]*\)\s*=\s*\(\s*select\s+is_test'
          or p.prosrc ~ 'brivia_cell_ok\([^)]*\.is_test');
  if bad is not null then raise exception 'FAIL guard: world compared on is_test in %', bad; end if;
  -- refresh_cell_density joins density rows on their own (cell, is_test) key; a member's world comes from the helper
  if (select prosrc from pg_proc where oid = 'public.refresh_cell_density(date)'::regprocedure) ~ '\mp\.is_test'
     or (select prosrc from pg_proc where oid = 'public.refresh_cell_density(date)'::regprocedure) !~ 'brivia_in_test_world\(p\.id\)' then
    raise exception 'FAIL guard: refresh_cell_density does not key the world on brivia_in_test_world'; end if;
  -- the only functions that still mention is_test at all (brivia_posts_image_rule, 0008 section 4: a test member's
  -- preset post image; it reads the author's own flag and compares no two members' worlds)
  select string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname) into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'brivia_private') and p.prosrc ~ 'is_test'
     and p.proname not in ('brivia_guard_is_test', 'brivia_in_test_world', 'brivia_cell_ok', 'refresh_cell_density',
                           'brivia_posts_image_rule');
  if bad is not null then raise exception 'FAIL guard: is_test still read by %', bad; end if;
  select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ') into bad
    from pg_policies where coalesce(qual, '') || coalesce(with_check, '') ~ 'is_test';
  if bad is not null then raise exception 'FAIL guard: a policy reads is_test: %', bad; end if;
  -- Pair paths: every client-executable definer function (public or brivia_private) that reads requests, matches or
  -- messages applies a world rule, and so does every select or insert policy on those tables.
  select string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname) into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'brivia_private') and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute')
     and p.prosrc ~ '\m(connection_requests|matches|brivia_messages)\M'
     and p.prosrc !~ '(brivia_in_test_world|brivia_same_world|brivia_visible_to|brivia_pair_world_ok)\(';
  if bad is not null then raise exception 'FAIL guard: pair paths without a world rule: %', bad; end if;
  select string_agg(tablename || '.' || policyname, ', ') into bad
    from pg_policies
   where schemaname = 'public' and tablename in ('connection_requests', 'matches', 'brivia_messages')
     and cmd in ('SELECT', 'INSERT')
     and coalesce(qual, '') || coalesce(with_check, '')
         !~ '(brivia_incoming_request_visible|brivia_pair_world_ok|brivia_can_message)\(';
  if bad is not null then raise exception 'FAIL guard: pair policies without a world rule: %', bad; end if;
end $$;

-- 10. The purge deletes the test members and R1's test match and messages, empties brivia_tester, and keeps R1's
-- profile, member_interest and member_orbit (and R2). Only this suite's test members may exist at this point.
do $$
begin
  if exists (select 1 from public.profiles where is_test and id::text not like 'de7e57e7-%')
     or exists (select 1 from auth.users where id::text like 'a7e57000-0000-4000-8000-%') then
    raise exception 'FAIL setup: another suite left test members behind; the purge would remove them';
  end if;
  if not exists (select 1 from public.brivia_messages where pg_temp.tw(3) in (sender_id, recipient_id) and pg_temp.tw(1) in (sender_id, recipient_id))
     or not exists (select 1 from public.matches where pg_temp.tw(3) in (user1_id, user2_id) and pg_temp.tw(1) in (user1_id, user2_id)) then
    raise exception 'FAIL setup: R1 has no test match or messages to purge';
  end if;
end $$;
\o /dev/null
\ir ../seed/purge-test-members.sql
\o
do $$
declare r1 uuid := pg_temp.tw(3);
begin
  if exists (select 1 from public.profiles where id in (pg_temp.tw(1), pg_temp.tw(2)))
     or exists (select 1 from auth.users where id in (pg_temp.tw(1), pg_temp.tw(2))) then
    raise exception 'FAIL purge: test members remain'; end if;
  if exists (select 1 from public.matches where r1 in (user1_id, user2_id) and pg_temp.tw(4) not in (user1_id, user2_id)) then
    raise exception 'FAIL purge: R1 test match remains'; end if;
  if exists (select 1 from public.brivia_messages where r1 in (sender_id, recipient_id) and pg_temp.tw(4) not in (sender_id, recipient_id)) then
    raise exception 'FAIL purge: R1 test messages remain'; end if;
  if not exists (select 1 from public.matches where r1 in (user1_id, user2_id) and pg_temp.tw(4) in (user1_id, user2_id))
     or not exists (select 1 from public.brivia_messages where sender_id = r1 and recipient_id = pg_temp.tw(4)) then
    raise exception 'FAIL purge: R1''s real match or message with R2 was deleted'; end if;
  if exists (select 1 from public.connection_requests where from_id in (pg_temp.tw(1), pg_temp.tw(2)) or to_id in (pg_temp.tw(1), pg_temp.tw(2))) then
    raise exception 'FAIL purge: test requests remain'; end if;
  if exists (select 1 from public.brivia_tester) then raise exception 'FAIL purge: brivia_tester not emptied'; end if;
  if not exists (select 1 from public.profiles where id = r1 and not is_test) or not exists (select 1 from auth.users where id = r1) then
    raise exception 'FAIL purge: the tester''s own account was deleted'; end if;
  if not exists (select 1 from public.member_interest where member_id = r1) or not exists (select 1 from public.member_orbit where member_id = r1) then
    raise exception 'FAIL purge: the tester''s interests or area were deleted'; end if;
  if not exists (select 1 from public.profiles where id = pg_temp.tw(4)) then raise exception 'FAIL purge: real R2 deleted'; end if;
  -- R1 is a plain real member again
  if pg_temp.cand_ids(r1) <> pg_temp.ids(4) then raise exception 'FAIL purge: R1 candidates %', pg_temp.cand_ids(r1); end if;
end $$;

-- Clean up.
delete from public.cell_density;
delete from public.brivia_tester where member_id::text like 'de7e57e7-%';
delete from public.signal_ledger where sender_id::text like 'de7e57e7-%' or to_id::text like 'de7e57e7-%';
delete from public.report_attempt where reporter_id::text like 'de7e57e7-%';
delete from public.profiles where id::text like 'de7e57e7-%';
delete from auth.users where id::text like 'de7e57e7-%';

select 'd-tester-world.test.sql OK' as result;
