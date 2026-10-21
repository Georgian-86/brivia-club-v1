-- Polish wave, Task D2 (0012 section D): typing broadcast authorization on realtime.messages.
-- T1 matched a and b can both send and receive on typing:<lower>:<higher>
-- T2 c (not in the pair) can neither send nor receive on a/b's topic, nor build a topic with a as the other side
-- T3 after a block in either direction, neither a nor b can send or receive; unblocking restores it
-- T4 malformed topics fail: wrong order, missing/extra parts, extra suffix, other prefix, upper case, self pair, null
-- T5 anon can neither send nor receive; a non-broadcast extension fails; no match means no access
-- Ids: d1300000-0000-4000-8000-0000000000NN: 01 A, 02 B, 03 C. One transaction, rolled back.
set brivia.harness_autocomplete = 'off';
begin;

create or replace function pg_temp.rm(n int) returns uuid language sql immutable as $$
  select ('d1300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(p_uid uuid) returns void language plpgsql as $f$
begin
  if p_uid is null then
    set local role anon;
    perform set_config('request.jwt.claims', '', true);
  else
    set local role authenticated;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  end if;
end $f$;
create or replace function pg_temp.as_owner() returns void language plpgsql as $f$
begin reset role; perform set_config('request.jwt.claims', '', true); end $f$;

-- Can the current client send on the topic? (insert policy; 42501 means no)
create or replace function pg_temp.can_send(p_topic text, p_ext text default 'broadcast') returns boolean language plpgsql as $f$
begin
  perform set_config('realtime.topic', coalesce(p_topic, ''), true);
  insert into realtime.messages (topic, extension, event, payload) values (coalesce(p_topic, 'x'), p_ext, 'typing', '{}'::jsonb);
  return true;
exception when insufficient_privilege then return false;
end $f$;
-- Can the current client receive on the topic? (select policy, evaluated for the topic the socket joined)
create or replace function pg_temp.can_recv(p_topic text) returns boolean language plpgsql as $f$
declare n int;
begin
  perform set_config('realtime.topic', coalesce(p_topic, ''), true);
  select count(*) into n from realtime.messages where extension = 'broadcast';
  return n > 0;
end $f$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(19.2183, 72.9781, 7);
begin
  for g in 1..3 loop
    mid := pg_temp.rm(g);
    insert into auth.users(id, email) values (mid, 'typing' || g || '@example.com') on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (mid, 'Typing ' || g, 'Typing ' || g, 'typing' || g || '@example.com', 'Some years', array['Friends'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell))
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20)
    on conflict do nothing;
  end loop;
  if not (public.brivia_member_completed(pg_temp.rm(1)) and public.brivia_member_completed(pg_temp.rm(2))
          and public.brivia_member_completed(pg_temp.rm(3))) then
    raise exception 'FAIL setup: A, B and C must be completed'; end if;
  -- the policies exist, exactly two, for authenticated only
  if (select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages') <> 2 then
    raise exception 'FAIL setup: expected exactly two realtime.messages policies'; end if;
  if exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and roles <> array['authenticated']::name[]) then
    raise exception 'FAIL setup: realtime.messages policies must be for authenticated only'; end if;
end $$;

-- T5 (no match yet): nobody, including a and b, has access.
do $$
declare a uuid := pg_temp.rm(1); b uuid := pg_temp.rm(2); t text := 'typing:' || pg_temp.rm(1) || ':' || pg_temp.rm(2);
begin
  perform pg_temp.as_member(a);
  if pg_temp.can_send(t) then raise exception 'FAIL T5: a sends without a match'; end if;
  if pg_temp.can_recv(t) then raise exception 'FAIL T5: a receives without a match'; end if;
  perform pg_temp.as_owner();
  insert into public.matches (user1_id, user2_id) values (least(a, b), greatest(a, b));
end $$;

-- T1: matched a and b.
do $$
declare a uuid := pg_temp.rm(1); b uuid := pg_temp.rm(2); t text := 'typing:' || pg_temp.rm(1) || ':' || pg_temp.rm(2);
begin
  perform pg_temp.as_member(a);
  if not pg_temp.can_send(t) then raise exception 'FAIL T1: a cannot send on the pair topic'; end if;
  if not pg_temp.can_recv(t) then raise exception 'FAIL T1: a cannot receive on the pair topic'; end if;
  perform pg_temp.as_member(b);
  if not pg_temp.can_send(t) then raise exception 'FAIL T1: b cannot send on the pair topic'; end if;
  if not pg_temp.can_recv(t) then raise exception 'FAIL T1: b cannot receive on the pair topic'; end if;
  -- a non-broadcast extension is never allowed
  if pg_temp.can_send(t, 'presence') then raise exception 'FAIL T5: a non-broadcast extension is allowed'; end if;
  perform pg_temp.as_owner();
end $$;

-- T2: c, and a topic naming a pair c is not in, or a pair c has no match with.
do $$
declare a uuid := pg_temp.rm(1); b uuid := pg_temp.rm(2); c uuid := pg_temp.rm(3);
        t text := 'typing:' || pg_temp.rm(1) || ':' || pg_temp.rm(2);
begin
  perform pg_temp.as_member(c);
  if pg_temp.can_send(t) then raise exception 'FAIL T2: c sends on a/b topic'; end if;
  if pg_temp.can_recv(t) then raise exception 'FAIL T2: c receives on a/b topic'; end if;
  -- c names a pair that contains c but c has no match with a
  if pg_temp.can_send('typing:' || a || ':' || c) then raise exception 'FAIL T2: c sends on a/c topic without a match'; end if;
  if pg_temp.can_recv('typing:' || a || ':' || c) then raise exception 'FAIL T2: c receives on a/c topic without a match'; end if;
  if pg_temp.can_send('typing:' || b || ':' || c) then raise exception 'FAIL T2: c sends on b/c topic without a match'; end if;
  perform pg_temp.as_owner();
  -- a and b matched; a cannot use the b/c topic (a is not in it)
  perform pg_temp.as_member(a);
  if pg_temp.can_send('typing:' || b || ':' || c) then raise exception 'FAIL T2: a sends on b/c topic'; end if;
  if pg_temp.can_recv('typing:' || b || ':' || c) then raise exception 'FAIL T2: a receives on b/c topic'; end if;
  perform pg_temp.as_owner();
end $$;

-- T3: a block in either direction closes it; unblocking restores it.
do $$
declare a uuid := pg_temp.rm(1); b uuid := pg_temp.rm(2); t text := 'typing:' || pg_temp.rm(1) || ':' || pg_temp.rm(2); who uuid;
begin
  for i in 1..2 loop
    if i = 1 then insert into public.brivia_blocks (blocker_id, blocked_id) values (b, a);
    else insert into public.brivia_blocks (blocker_id, blocked_id) values (a, b); end if;
    foreach who in array array[a, b] loop
      perform pg_temp.as_member(who);
      if pg_temp.can_send(t) then raise exception 'FAIL T3: % sends after block direction %', who, i; end if;
      if pg_temp.can_recv(t) then raise exception 'FAIL T3: % receives after block direction %', who, i; end if;
    end loop;
    perform pg_temp.as_owner();
    delete from public.brivia_blocks where blocker_id in (a, b) and blocked_id in (a, b);
  end loop;
  perform pg_temp.as_member(a);
  if not pg_temp.can_send(t) then raise exception 'FAIL T3: unblocking did not restore sending'; end if;
  perform pg_temp.as_owner();
end $$;

-- T4: malformed topics, as a member of a live match.
do $$
declare a uuid := pg_temp.rm(1); b uuid := pg_temp.rm(2); bad text;
begin
  perform pg_temp.as_member(a);
  foreach bad in array array[
    'typing:' || a,
    'typing:' || b || ':' || a,                       -- wrong order
    'typing:' || a || ':' || b || ':x',               -- extra part
    'typing:' || a || ':' || b || 'x',                -- extra suffix
    'typing:' || a || ':' || b || ' ',
    ' typing:' || a || ':' || b,
    'Typing:' || a || ':' || b,                       -- case
    'presence:' || a || ':' || b,                     -- other prefix
    'chat:' || a || ':' || b,
    'typing:' || upper(a::text) || ':' || upper(b::text),
    'typing:' || a || ':' || a,                       -- self pair
    'typing::' || b,
    'typing:' || replace(a::text, '-', '') || ':' || replace(b::text, '-', ''),
    '%typing:' || a || ':' || b,
    'typing:' || a || E':' || b || E'\n',
    ''
  ] loop
    if pg_temp.can_send(bad) then raise exception 'FAIL T4: send allowed on malformed topic %', bad; end if;
    if pg_temp.can_recv(bad) then raise exception 'FAIL T4: receive allowed on malformed topic %', bad; end if;
  end loop;
  -- no topic at all
  perform set_config('realtime.topic', '', true);
  begin
    insert into realtime.messages (topic, extension) values ('x', 'broadcast');
    raise exception 'FAIL T4: send allowed with no topic';
  exception when insufficient_privilege then null; end;
  if brivia_private.brivia_typing_topic_ok(null) then raise exception 'FAIL T4: null topic is ok'; end if;
  perform pg_temp.as_owner();
end $$;

-- T5: anon gets nothing, not even on a live pair topic, and cannot call the helper.
do $$
declare t text := 'typing:' || pg_temp.rm(1) || ':' || pg_temp.rm(2);
begin
  perform pg_temp.as_member(null);
  if pg_temp.can_send(t) then raise exception 'FAIL T5: anon sends'; end if;
  if pg_temp.can_recv(t) then raise exception 'FAIL T5: anon receives'; end if;
  begin
    perform brivia_private.brivia_typing_topic_ok(t);
    raise exception 'FAIL T5: anon can call the helper';
  exception when insufficient_privilege then null; end;
  perform pg_temp.as_owner();
end $$;

rollback;
select 'd-typing ok' as result;
