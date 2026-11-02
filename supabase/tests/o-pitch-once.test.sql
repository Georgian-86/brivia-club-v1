-- 0028 (D-129): a pitch appears once in chat. Ids 0e280000-0000-4000-8000-0000000000NN.
-- Q1 Accept of a request with a note: exactly one message (the delivered pitch), whatever brivia_create_match did before.
-- Q2 the live bug reproduced: with the hand-edited brivia_create_match (seeds notes itself, as live had it before 0028),
--    Accept writes the pitch twice; brivia_remove_duplicate_pitches() removes the undelivered twin only (the delivered
--    copy, other messages and a same-text message at another time stay) and is a no-op when run again.
-- Q3 crossing requests: each note once.
-- Q4 the cleanup is executable by no client role.
-- One transaction, rolled back.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.po(n int) returns uuid language sql immutable as $$
  select ('0e280000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;
create or replace function pg_temp.msgs(a uuid, b uuid) returns int language sql as $$
  select count(*)::int from public.brivia_messages where sender_id = a and recipient_id = b $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9698, 77.7499, 7);
begin
  for g in 1..6 loop
    mid := pg_temp.po(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (mid, 'Once ' || g, 'Once ' || g, 'once' || g || '@example.com', 'Some years', array['Friends']) on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  if not public.brivia_member_completed(pg_temp.po(1)) then raise exception 'FAIL setup'; end if;
end $$;

-- Q1
do $$
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.po(1));
  perform public.send_connect_request(pg_temp.po(2), 'Going to the Candlelit Gambit too. Want to go together?');
  perform pg_temp.as_member(pg_temp.po(2));
  perform public.respond_connection_request(pg_temp.po(1), true);
  reset role;
  if pg_temp.msgs(pg_temp.po(1), pg_temp.po(2)) <> 1 then
    raise exception 'FAIL Q1: % copies of the pitch', pg_temp.msgs(pg_temp.po(1), pg_temp.po(2)); end if;
end $$;

-- Q2: put the live, hand-edited brivia_create_match back for this transaction only.
create or replace function public.brivia_create_match(first_user uuid, second_user uuid)
returns void language plpgsql set search_path = public as $$
declare v_inserted int; r record; v_id uuid;
begin
  insert into public.matches(user1_id, user2_id)
  select least(first_user, second_user), greatest(first_user, second_user)
  where not exists (select 1 from public.matches m where (m.user1_id = first_user and m.user2_id = second_user)
                                                      or (m.user1_id = second_user and m.user2_id = first_user))
  on conflict (user1_id, user2_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return; end if;
  for r in select c.from_id, c.to_id, c.note, c.created_at from public.connection_requests c
            where ((c.from_id = first_user and c.to_id = second_user) or (c.from_id = second_user and c.to_id = first_user))
              and c.status in ('pending', 'accepted') and nullif(btrim(c.note), '') is not null
            order by c.created_at, c.from_id loop
    insert into public.brivia_messages (sender_id, recipient_id, body, message_type) values (r.from_id, r.to_id, r.note, 'text')
    returning id into v_id;
    update public.brivia_messages set created_at = r.created_at where id = v_id;
  end loop;
end $$;
do $$
declare n int; kept uuid;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.po(3));
  perform public.send_connect_request(pg_temp.po(4), 'Hi! Same event, want to go together?');
  perform pg_temp.as_member(pg_temp.po(4));
  perform public.respond_connection_request(pg_temp.po(3), true);
  reset role;
  -- An ordinary later message with the same words must survive the cleanup. One transaction shares one now(), so it
  -- is written as the owner with a real later time.
  insert into public.brivia_messages (sender_id, recipient_id, body, message_type, created_at)
  values (pg_temp.po(3), pg_temp.po(4), 'Hi! Same event, want to go together?', 'text', now() + interval '1 minute');
  if pg_temp.msgs(pg_temp.po(3), pg_temp.po(4)) <> 3 then
    raise exception 'FAIL Q2: the bug did not reproduce (% messages, expected 2 pitches + 1 chat)', pg_temp.msgs(pg_temp.po(3), pg_temp.po(4)); end if;
  select d.message_id into kept from public.brivia_pitch_delivery d join public.brivia_messages m on m.id = d.message_id
   where m.sender_id = pg_temp.po(3) and m.recipient_id = pg_temp.po(4);
  n := brivia_private.brivia_remove_duplicate_pitches();
  if n <> 1 then raise exception 'FAIL Q2: cleanup removed %, expected 1', n; end if;
  if pg_temp.msgs(pg_temp.po(3), pg_temp.po(4)) <> 2 then raise exception 'FAIL Q2: % messages left, expected 2', pg_temp.msgs(pg_temp.po(3), pg_temp.po(4)); end if;
  if not exists (select 1 from public.brivia_messages where id = kept) then raise exception 'FAIL Q2: the delivered copy was removed'; end if;
  if pg_temp.msgs(pg_temp.po(1), pg_temp.po(2)) <> 1 then raise exception 'FAIL Q2: another pair was touched'; end if;
  n := brivia_private.brivia_remove_duplicate_pitches();
  if n <> 0 then raise exception 'FAIL Q2: second run removed %', n; end if;
end $$;
-- Back to 0028's definition (the transaction rolls back anyway; Q3 needs the fixed one).
create or replace function public.brivia_create_match(first_user uuid, second_user uuid)
returns void language plpgsql volatile set search_path = public as $$
begin
  insert into public.matches(user1_id, user2_id)
  select least(first_user, second_user), greatest(first_user, second_user)
  where not exists (select 1 from public.matches m where (m.user1_id = first_user and m.user2_id = second_user)
                                                      or (m.user1_id = second_user and m.user2_id = first_user))
  on conflict (user1_id, user2_id) do nothing;
end $$;

-- Q3
do $$
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.po(5));
  perform public.send_connect_request(pg_temp.po(6), 'Note from five');
  perform pg_temp.as_member(pg_temp.po(6));
  perform public.send_connect_request(pg_temp.po(5), 'Note from six');
  reset role;
  if not public.brivia_is_connection(pg_temp.po(5), pg_temp.po(6)) then raise exception 'FAIL Q3: crossing did not connect'; end if;
  if pg_temp.msgs(pg_temp.po(5), pg_temp.po(6)) <> 1 or pg_temp.msgs(pg_temp.po(6), pg_temp.po(5)) <> 1 then
    raise exception 'FAIL Q3: % and % copies', pg_temp.msgs(pg_temp.po(5), pg_temp.po(6)), pg_temp.msgs(pg_temp.po(6), pg_temp.po(5)); end if;
end $$;

-- Q4
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, 'brivia_private.brivia_remove_duplicate_pitches()', 'execute') then
      raise exception 'FAIL Q4: % can execute the cleanup', r; end if;
  end loop;
end $$;
rollback;
