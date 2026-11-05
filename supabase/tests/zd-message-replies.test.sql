-- 0055 (D-191): replies. Ids 0e550000-0000-4000-8000-0000000000NN: 01 A, 02 B (A's match), 03 C (C's match with A).
-- R1 A replies to B's message in their chat: stored with reply_to_id; B can reply to A's reply.
-- R2 a reply to a message from another conversation (A-C's message, quoted in A-B) is refused; a reply to a missing id
--    is refused (foreign key); the trigger function is not callable by members.
-- R3 members still cannot change reply_to_id afterwards (no UPDATE policy); a target deleted outright leaves the reply.
set brivia.harness_autocomplete = 'off';
create or replace function pg_temp.rm(n int) returns uuid language sql immutable as $$
  select ('0e550000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;
create or replace function pg_temp.code_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlstate; end $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9716, 77.6412, 7);
begin
  for g in 1..3 loop
    mid := pg_temp.rm(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'Reply ' || g, 'Reply ' || g, 'reply' || g || '@example.com', 'Some years', array['Friends'], array['Chess'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  insert into public.matches (user1_id, user2_id) values
    (least(pg_temp.rm(1), pg_temp.rm(2)), greatest(pg_temp.rm(1), pg_temp.rm(2))),
    (least(pg_temp.rm(1), pg_temp.rm(3)), greatest(pg_temp.rm(1), pg_temp.rm(3))) on conflict do nothing;
  insert into public.brivia_messages (id, sender_id, recipient_id, body) values
    ('0e550000-0000-4000-8000-0000000000b1', pg_temp.rm(2), pg_temp.rm(1), 'Been to Manali?'),
    ('0e550000-0000-4000-8000-0000000000c1', pg_temp.rm(3), pg_temp.rm(1), 'C to A, private');
end $$;

-- R1
do $$
declare r uuid;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.rm(1));
  insert into public.brivia_messages (sender_id, recipient_id, body, reply_to_id)
  values (pg_temp.rm(1), pg_temp.rm(2), 'Loved it', '0e550000-0000-4000-8000-0000000000b1') returning id into r;
  reset role;
  if (select reply_to_id from public.brivia_messages where id = r) is distinct from '0e550000-0000-4000-8000-0000000000b1'::uuid then
    raise exception 'FAIL R1: the reply was not stored'; end if;
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.rm(2));
  insert into public.brivia_messages (sender_id, recipient_id, body, reply_to_id) values (pg_temp.rm(2), pg_temp.rm(1), 'Same!', r);
  reset role;
  raise notice 'R1 OK';
end $$;

-- R2
do $$
declare c text;
begin
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.rm(1));
  c := pg_temp.code_of(format('insert into public.brivia_messages (sender_id, recipient_id, body, reply_to_id) values (%L, %L, %L, %L)',
         pg_temp.rm(1), pg_temp.rm(2), 'quoting C', '0e550000-0000-4000-8000-0000000000c1'));
  if c <> '22023' then raise exception 'FAIL R2: a reply across conversations gave %', c; end if;
  c := pg_temp.code_of(format('insert into public.brivia_messages (sender_id, recipient_id, body, reply_to_id) values (%L, %L, %L, %L)',
         pg_temp.rm(1), pg_temp.rm(2), 'quoting nothing', '0e550000-0000-4000-8000-0000000000ff'));
  if c not in ('22023', '23503') then raise exception 'FAIL R2: a reply to a missing message gave %', c; end if;
  reset role;
  if has_function_privilege('authenticated', 'public.brivia_messages_check_reply()', 'execute')
     or has_function_privilege('anon', 'public.brivia_messages_check_reply()', 'execute') then
    raise exception 'FAIL R2: members may call the trigger function'; end if;
  raise notice 'R2 OK';
end $$;

-- R3
do $$
declare n int; r uuid;
begin
  select id into r from public.brivia_messages where body = 'Loved it';
  set local role authenticated;
  perform pg_temp.as_member(pg_temp.rm(1));
  update public.brivia_messages set reply_to_id = null where id = r;
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'FAIL R3: a member changed reply_to_id'; end if;
  delete from public.brivia_messages where id = '0e550000-0000-4000-8000-0000000000b1';
  if not exists (select 1 from public.brivia_messages where id = r and reply_to_id is null) then
    raise exception 'FAIL R3: the reply did not survive its target'; end if;
  raise notice 'R3 OK';
end $$;
