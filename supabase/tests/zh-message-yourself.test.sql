-- 0068 (D-224): message yourself. Ids 0e680000-0000-4000-8000-0000000000NN: 01 A, 02 B (no match with A),
-- 03 C (never completed onboarding), 04 D (A's match).
-- S1 A sends a message to themselves; it is stored and A reads it back.
-- S2 nobody else reads A's note (B, D), and A still cannot message B (no match) while A to D (a match) still works.
-- S3 a member who has not completed onboarding cannot message themselves either.
-- S4 a reply inside the self thread is stored; quoting a message from another conversation is still refused.
-- S5 the sender check still holds: A cannot write a note as B, and B cannot drop a message into A's self thread.
set brivia.harness_autocomplete = 'off';
create or replace function pg_temp.my(n int) returns uuid language sql immutable as $$
  select ('0e680000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;
create or replace function pg_temp.code_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlstate; end $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9716, 77.6412, 7);
begin
  for g in 1..4 loop
    mid := pg_temp.my(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Self ' || g, 'Self ' || g, 'self' || g || '@example.com', 'Some years', array['Friends'], array['Chess'])
    on conflict (id) do nothing;
    continue when g = 3;   -- C never completes onboarding
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  insert into public.matches (user1_id, user2_id)
  values (least(pg_temp.my(1), pg_temp.my(4)), greatest(pg_temp.my(1), pg_temp.my(4))) on conflict do nothing;
  insert into public.brivia_messages (id, sender_id, recipient_id, body)
  values ('0e680000-0000-4000-8000-0000000000d1', pg_temp.my(4), pg_temp.my(1), 'D to A');
  if public.brivia_member_completed(pg_temp.my(3)) then raise exception 'FAIL setup: C should not be completed'; end if;
  if not public.brivia_member_completed(pg_temp.my(1)) then raise exception 'FAIL setup: A should be completed'; end if;
end $$;

-- S1
do $$
declare r uuid; n int;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.my(1));
  insert into public.brivia_messages (sender_id, recipient_id, body) values (pg_temp.my(1), pg_temp.my(1), 'Buy milk') returning id into r;
  select count(*) into n from public.brivia_messages where id = r;
  reset role;
  if n <> 1 then raise exception 'FAIL S1: A cannot read their own note back (saw %)', n; end if;
  if (select sender_id = recipient_id from public.brivia_messages where id = r) is not true then
    raise exception 'FAIL S1: the note was not stored as a self message'; end if;
  raise notice 'S1 OK';
end $$;

-- S2
do $$
declare n int; c text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.my(2));
  select count(*) into n from public.brivia_messages where body = 'Buy milk';
  if n <> 0 then raise exception 'FAIL S2: B can read A''s note'; end if;
  perform pg_temp.as_member(pg_temp.my(4));
  select count(*) into n from public.brivia_messages where body = 'Buy milk';
  if n <> 0 then raise exception 'FAIL S2: A''s match D can read A''s note'; end if;
  perform pg_temp.as_member(pg_temp.my(1));
  c := pg_temp.code_of(format('insert into public.brivia_messages (sender_id, recipient_id, body) values (%L, %L, %L)', pg_temp.my(1), pg_temp.my(2), 'hi B'));
  if c <> '42501' then raise exception 'FAIL S2: A messaged B without a match (gave %)', c; end if;
  c := pg_temp.code_of(format('insert into public.brivia_messages (sender_id, recipient_id, body) values (%L, %L, %L)', pg_temp.my(1), pg_temp.my(4), 'hi D'));
  if c <> 'none' then raise exception 'FAIL S2: A could not message their match D (gave %)', c; end if;
  reset role;
  raise notice 'S2 OK';
end $$;

-- S3
do $$
declare c text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.my(3));
  c := pg_temp.code_of(format('insert into public.brivia_messages (sender_id, recipient_id, body) values (%L, %L, %L)', pg_temp.my(3), pg_temp.my(3), 'note'));
  reset role;
  if c <> '42501' then raise exception 'FAIL S3: an incomplete member messaged themselves (gave %)', c; end if;
  raise notice 'S3 OK';
end $$;

-- S4
do $$
declare r uuid; c text;
begin
  select id into r from public.brivia_messages where body = 'Buy milk';
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.my(1));
  c := pg_temp.code_of(format('insert into public.brivia_messages (sender_id, recipient_id, body, reply_to_id) values (%L, %L, %L, %L)', pg_temp.my(1), pg_temp.my(1), 'and eggs', r));
  if c <> 'none' then raise exception 'FAIL S4: a reply in the self thread gave %', c; end if;
  c := pg_temp.code_of(format('insert into public.brivia_messages (sender_id, recipient_id, body, reply_to_id) values (%L, %L, %L, %L)', pg_temp.my(1), pg_temp.my(1), 'quoting D', '0e680000-0000-4000-8000-0000000000d1'));
  reset role;
  if c <> '22023' then raise exception 'FAIL S4: quoting another conversation in the self thread gave %', c; end if;
  raise notice 'S4 OK';
end $$;

-- S5
do $$
declare c text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.my(1));
  c := pg_temp.code_of(format('insert into public.brivia_messages (sender_id, recipient_id, body) values (%L, %L, %L)', pg_temp.my(2), pg_temp.my(2), 'forged'));
  if c <> '42501' then raise exception 'FAIL S5: A wrote a note as B (gave %)', c; end if;
  perform pg_temp.as_member(pg_temp.my(2));
  c := pg_temp.code_of(format('insert into public.brivia_messages (sender_id, recipient_id, body) values (%L, %L, %L)', pg_temp.my(2), pg_temp.my(1), 'into A''s thread'));
  reset role;
  if c <> '42501' then raise exception 'FAIL S5: B messaged A without a match (gave %)', c; end if;
  raise notice 'S5 OK';
end $$;

reset brivia.harness_autocomplete;
