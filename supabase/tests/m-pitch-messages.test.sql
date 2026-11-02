-- 0024 (D-124): the pitch becomes the first chat message. Ids 0e240000-0000-4000-8000-0000000000NN: 01 A, 02 B, 03 C,
-- 04 D, 05 E.
-- P1 a request with a note sends no message; a decline never exposes it (no match, no message).
-- P2 Accept: exactly one message, from the sender, with the note verbatim and the request's own time; a second
--    delivery (retry) adds nothing; the request is accepted.
-- P3 already connected: send_connect_request appends the note to the existing chat ('chat'); no new request, no second
--    connection, the history is kept.
-- P4 two requests crossing make the match and deliver both notes, oldest first.
-- P6 the delivery table has RLS on and no client grants.
-- P5 a client cannot backdate a message (the server's time still wins outside the delivery).
set brivia.harness_autocomplete = 'off';
create or replace function pg_temp.pm(n int) returns uuid language sql immutable as $$
  select ('0e240000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9698, 77.7499, 7);
begin
  for g in 1..5 loop
    mid := pg_temp.pm(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (mid, 'Pitch ' || g, 'Pitch ' || g, 'pitch' || g || '@example.com', 'Some years', array['Friends']) on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  if not public.brivia_member_completed(pg_temp.pm(1)) then raise exception 'FAIL setup'; end if;
end $$;

-- P1
do $$
declare r record;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.pm(1));
  select * into r from public.send_connect_request(pg_temp.pm(2), 'Hi B, loved your chess posts.');
  if r.status <> 'sent' then raise exception 'FAIL P1: status %', r.status; end if;
  perform pg_temp.as_member(pg_temp.pm(2));
  perform public.respond_connection_request(pg_temp.pm(1), false);
  reset role;
  if exists (select 1 from public.brivia_messages where sender_id = pg_temp.pm(1)) then raise exception 'FAIL P1: a declined pitch reached chat'; end if;
  if (select status from public.connection_requests where from_id = pg_temp.pm(1) and to_id = pg_temp.pm(2)) <> 'declined' then raise exception 'FAIL P1: status'; end if;
  if public.brivia_is_connection(pg_temp.pm(1), pg_temp.pm(2)) then raise exception 'FAIL P1: a decline connected'; end if;
end $$;

-- P2
do $$
declare r record; m record; req timestamptz;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.pm(3));
  perform public.send_connect_request(pg_temp.pm(2), 'Hello B! Going to the chess meetup too?');
  reset role;
  select created_at into req from public.connection_requests where from_id = pg_temp.pm(3) and to_id = pg_temp.pm(2);
  if exists (select 1 from public.brivia_messages where sender_id = pg_temp.pm(3)) then raise exception 'FAIL P2: a message before Accept'; end if;
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.pm(2));
  perform public.respond_connection_request(pg_temp.pm(3), true);
  reset role;
  if (select count(*) from public.brivia_messages where sender_id = pg_temp.pm(3) and recipient_id = pg_temp.pm(2)) <> 1 then raise exception 'FAIL P2: one message expected'; end if;
  select * into m from public.brivia_messages where sender_id = pg_temp.pm(3) and recipient_id = pg_temp.pm(2);
  if m.body <> 'Hello B! Going to the chess meetup too?' or m.created_at <> req or not exists (select 1 from public.brivia_pitch_delivery d where d.message_id = m.id) then raise exception 'FAIL P2: message %', m; end if;
  perform public.brivia_deliver_pitches(pg_temp.pm(2), pg_temp.pm(3));
  if (select count(*) from public.brivia_messages where sender_id = pg_temp.pm(3)) <> 1 then raise exception 'FAIL P2: delivered twice'; end if;
  if (select status from public.connection_requests where from_id = pg_temp.pm(3) and to_id = pg_temp.pm(2)) <> 'accepted' then raise exception 'FAIL P2: not accepted'; end if;
  -- The recipient reads it through the ordinary chat policy.
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.pm(2));
  if not exists (select 1 from public.brivia_messages where sender_id = pg_temp.pm(3) and body like 'Hello B!%') then raise exception 'FAIL P2: B cannot read the pitch'; end if;
  reset role;
end $$;

-- P3
do $$
declare r record;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.pm(3));
  select * into r from public.send_connect_request(pg_temp.pm(2), 'See you there at six?');
  if r.status <> 'chat' then raise exception 'FAIL P3: status %', r.status; end if;
  reset role;
  if (select count(*) from public.brivia_messages where sender_id = pg_temp.pm(3) and recipient_id = pg_temp.pm(2)) <> 2 then raise exception 'FAIL P3: appended message missing'; end if;
  if (select count(*) from public.matches where (user1_id, user2_id) in ((least(pg_temp.pm(2), pg_temp.pm(3)), greatest(pg_temp.pm(2), pg_temp.pm(3))))) <> 1 then raise exception 'FAIL P3: duplicate connection'; end if;
  if (select count(*) from public.connection_requests where from_id = pg_temp.pm(3) and to_id = pg_temp.pm(2)) <> 1 then raise exception 'FAIL P3: a new request'; end if;
  if (select body from public.brivia_messages where sender_id = pg_temp.pm(3) order by created_at desc, id limit 1) <> 'See you there at six?' then raise exception 'FAIL P3: not the latest'; end if;
end $$;

-- P4
do $$
declare bodies text[];
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.pm(4));
  perform public.send_connect_request(pg_temp.pm(5), 'First: hi E!');
  reset role;
end $$;
-- (a separate transaction: each request gets its own time, as in real use)
do $$
declare bodies text[];
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.pm(5));
  perform public.send_connect_request(pg_temp.pm(4), 'Second: hi D!');
  reset role;
  if not public.brivia_is_connection(pg_temp.pm(4), pg_temp.pm(5)) then raise exception 'FAIL P4: crossing requests must match'; end if;
  select array_agg(body order by created_at, id) into bodies from public.brivia_messages
   where sender_id in (pg_temp.pm(4), pg_temp.pm(5)) and recipient_id in (pg_temp.pm(4), pg_temp.pm(5));
  if bodies is distinct from array['First: hi E!', 'Second: hi D!'] then raise exception 'FAIL P4: both pitches, oldest first; got %', bodies; end if;
end $$;

-- P5
do $$
declare t timestamptz;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.pm(4));
  insert into public.brivia_messages (sender_id, recipient_id, body, created_at) values (pg_temp.pm(4), pg_temp.pm(5), 'backdated?', now() - interval '3 days');
  reset role;
  select created_at into t from public.brivia_messages where body = 'backdated?';
  if t < now() - interval '1 minute' then raise exception 'FAIL P5: a client backdated a message'; end if;
end $$;

do $$
begin
  delete from public.brivia_messages where sender_id in (select pg_temp.pm(g) from generate_series(1, 5) g);
  delete from public.matches where user1_id in (select pg_temp.pm(g) from generate_series(1, 5) g) or user2_id in (select pg_temp.pm(g) from generate_series(1, 5) g);
  delete from public.profiles where id in (select pg_temp.pm(g) from generate_series(1, 5) g);
  delete from auth.users where id in (select pg_temp.pm(g) from generate_series(1, 5) g);
end $$;
do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.brivia_pitch_delivery'::regclass)
     or has_table_privilege('authenticated', 'public.brivia_pitch_delivery', 'select') then raise exception 'FAIL P6: delivery table exposed'; end if;
end $$;
select 'm-pitch-messages: ALL PASSED' as result;
