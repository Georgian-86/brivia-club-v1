-- 0075 (D-244): react to a chat message with an emoji.
-- R1 grants: anon runs neither RPC; authenticated runs both; the table is closed to members.
-- R2 either member of the pair reacts; a new emoji replaces theirs; the same emoji again (or null) removes it.
-- R3 a third member can neither react nor read; text, markup and long values are refused; an unsent message is refused
--    and its reactions are no longer returned; a message deleted for me cannot be reacted to by me.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.rx(n int) returns uuid language sql immutable as $$
  select ('0e750000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(m uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true); end $$;
create or replace function pg_temp.code_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlstate; end $$;
do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9716, 77.6412, 7);
begin
  for g in 1..3 loop
    mid := pg_temp.rx(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'React ' || g, 'React ' || g, 'react' || g || '@example.com', 'Some years', array['Friends'], array['Chess'])
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  insert into public.matches (user1_id, user2_id) values (least(pg_temp.rx(1), pg_temp.rx(2)), greatest(pg_temp.rx(1), pg_temp.rx(2))) on conflict do nothing;
  insert into public.brivia_messages (id, sender_id, recipient_id, body) values
    ('0e750000-0000-4000-8000-0000000000a1', pg_temp.rx(1), pg_temp.rx(2), 'Chess tonight?'),
    ('0e750000-0000-4000-8000-0000000000a2', pg_temp.rx(2), pg_temp.rx(1), 'Sure'),
    ('0e750000-0000-4000-8000-0000000000a3', pg_temp.rx(1), pg_temp.rx(2), 'To unsend');
  -- R1
  if has_function_privilege('anon', 'public.react_to_message(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.message_reactions_for(uuid[])', 'execute') then raise exception 'FAIL R1: anon'; end if;
  if not has_function_privilege('authenticated', 'public.react_to_message(uuid, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.message_reactions_for(uuid[])', 'execute') then raise exception 'FAIL R1: authenticated'; end if;
  if has_table_privilege('authenticated', 'brivia_private.message_reaction', 'select')
     or has_table_privilege('authenticated', 'brivia_private.message_reaction', 'insert') then raise exception 'FAIL R1: table open'; end if;
end $$;

-- R2
set local role authenticated;
do $$
declare n int; e text; a1 uuid := '0e750000-0000-4000-8000-0000000000a1';
begin
  perform pg_temp.as_member(pg_temp.rx(2));
  perform * from public.react_to_message(a1, '😂');
  perform * from public.react_to_message(a1, '❤️');   -- replaces
  perform pg_temp.as_member(pg_temp.rx(1));
  perform * from public.react_to_message(a1, '👍🏻');
  select count(*) into n from public.message_reactions_for(array[a1]);
  if n <> 2 then raise exception 'FAIL R2: % reactions', n; end if;
  select r.emoji into e from public.message_reactions_for(array[a1]) r where r.member_id = pg_temp.rx(2);
  if e <> '❤️' then raise exception 'FAIL R2: replace gave %', e; end if;
  perform * from public.react_to_message(a1, '👍🏻');   -- same again: removed
  select count(*) into n from public.message_reactions_for(array[a1]) r where r.member_id = pg_temp.rx(1);
  if n <> 0 then raise exception 'FAIL R2: same emoji did not remove'; end if;
  perform * from public.react_to_message(a1, '🔥');
  perform * from public.react_to_message(a1, null);
  select count(*) into n from public.message_reactions_for(array[a1]) r where r.member_id = pg_temp.rx(1);
  if n <> 0 then raise exception 'FAIL R2: null did not remove'; end if;
  perform * from public.react_to_message(a1, '1️⃣');   -- a keycap is an emoji
end $$;

-- R3
do $$
declare n int; a1 uuid := '0e750000-0000-4000-8000-0000000000a1';
begin
  perform pg_temp.as_member(pg_temp.rx(3));
  if pg_temp.code_of(format('select * from public.react_to_message(%L, %L)', a1, '😂')) <> 'P0002' then raise exception 'FAIL R3: third member reacted'; end if;
  select count(*) into n from public.message_reactions_for(array[a1]);
  if n <> 0 then raise exception 'FAIL R3: third member read % reactions', n; end if;
  perform pg_temp.as_member(pg_temp.rx(1));
  if pg_temp.code_of(format('select * from public.react_to_message(%L, %L)', a1, 'lol')) <> '22023' then raise exception 'FAIL R3: text accepted'; end if;
  if pg_temp.code_of(format('select * from public.react_to_message(%L, %L)', a1, '<b>')) <> '22023' then raise exception 'FAIL R3: markup accepted'; end if;
  if pg_temp.code_of(format('select * from public.react_to_message(%L, %L)', a1, repeat('😂', 17))) <> '22023' then raise exception 'FAIL R3: long accepted'; end if;
  perform * from public.react_to_message('0e750000-0000-4000-8000-0000000000a3', '😮');
  perform * from public.unsend_message('0e750000-0000-4000-8000-0000000000a3');
  if pg_temp.code_of($q$select * from public.react_to_message('0e750000-0000-4000-8000-0000000000a3', '😢')$q$) <> 'P0002' then raise exception 'FAIL R3: unsent accepted'; end if;
  select count(*) into n from public.message_reactions_for(array['0e750000-0000-4000-8000-0000000000a3'::uuid]);
  if n <> 0 then raise exception 'FAIL R3: unsent reactions returned'; end if;
  perform pg_temp.as_member(pg_temp.rx(2));
  perform public.delete_message_for_me('0e750000-0000-4000-8000-0000000000a2');
  if pg_temp.code_of($q$select * from public.react_to_message('0e750000-0000-4000-8000-0000000000a2', '😢')$q$) <> 'P0002' then raise exception 'FAIL R3: hidden accepted'; end if;
end $$;
reset role;
rollback;
select 'zo-message-reactions.test ALL PASSED';
