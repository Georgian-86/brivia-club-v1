-- 0018 (D-110): active status for connections. member_presence, touch_presence, connection_presence,
-- set_presence_visible, my_presence_visible.
-- Ids 0d180000-0000-4000-8000-0000000000NN: 01 A, 02 B (A's match), 03 C (A's match, blocked by A), 04 D (no match).
-- P1 touch_presence writes the caller's row; a second touch within 30 s does not move last_seen_at.
-- P2 connection_presence: true for a match seen within 3 minutes; false when stale; non-matches are left out; a
--    blocked pair is false; the result has no time column.
-- P3 either side turning visibility off makes it false; my_presence_visible reads the switch (default on).
-- P4 more than 100 ids is refused (22023); no session is refused (42501); anon cannot execute any of them; the table
--    has no grants.
-- P5 deleting a profile deletes its presence row.
set brivia.harness_autocomplete = 'off';
create or replace function pg_temp.hp(n int) returns uuid language sql immutable as $$
  select ('0d180000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

do $$
declare g int;
begin
  for g in 1..4 loop
    insert into auth.users(id) values (pg_temp.hp(g)) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (pg_temp.hp(g), 'Hpres ' || g, 'Hpres ' || g, 'hpres' || g || '@example.com', 'Some years', array['Friends']) on conflict (id) do nothing;
  end loop;
  insert into public.matches (user1_id, user2_id) values (pg_temp.hp(1), pg_temp.hp(2)), (pg_temp.hp(3), pg_temp.hp(1)) on conflict do nothing;
end $$;

do $$
declare t1 timestamptz; t2 timestamptz; n int; code text; cols text;
begin
  foreach cols in array array['public.touch_presence()', 'public.connection_presence(uuid[])', 'public.set_presence_visible(boolean)', 'public.my_presence_visible()'] loop
    if has_function_privilege('anon', cols, 'execute') then raise exception 'FAIL P4: anon may execute %', cols; end if;
    if not has_function_privilege('authenticated', cols, 'execute') then raise exception 'FAIL P4: authenticated may not execute %', cols; end if;
  end loop;
  if has_table_privilege('authenticated', 'public.member_presence', 'select') or has_table_privilege('anon', 'public.member_presence', 'select') then
    raise exception 'FAIL P4: member_presence is readable directly'; end if;
  select pg_get_function_result('public.connection_presence(uuid[])'::regprocedure) into cols;
  if cols <> 'TABLE(member_id uuid, active boolean)' then raise exception 'FAIL P2: connection_presence returns %', cols; end if;

  -- P1
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.hp(2))::text, true);
  perform public.touch_presence();
  reset role;
  select last_seen_at into t1 from public.member_presence where member_id = pg_temp.hp(2);
  if t1 is null then raise exception 'FAIL P1: no presence row'; end if;
  update public.member_presence set last_seen_at = now() - interval '10 seconds' where member_id = pg_temp.hp(2);
  select last_seen_at into t1 from public.member_presence where member_id = pg_temp.hp(2);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.hp(2))::text, true);
  perform public.touch_presence();
  reset role;
  select last_seen_at into t2 from public.member_presence where member_id = pg_temp.hp(2);
  if t2 <> t1 then raise exception 'FAIL P1: a touch within 30 s moved last_seen_at'; end if;
  update public.member_presence set last_seen_at = now() - interval '40 seconds' where member_id = pg_temp.hp(2);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.hp(2))::text, true);
  perform public.touch_presence();
  reset role;
  if (select last_seen_at from public.member_presence where member_id = pg_temp.hp(2)) < now() - interval '5 seconds' then
    raise exception 'FAIL P1: a touch after 30 s did not move last_seen_at'; end if;
  insert into public.member_presence (member_id, last_seen_at) values (pg_temp.hp(3), now()), (pg_temp.hp(4), now())
  on conflict (member_id) do update set last_seen_at = excluded.last_seen_at;

  -- P2 (A asks about B, C, D)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.hp(1))::text, true);
  if not coalesce((select active from public.connection_presence(array[pg_temp.hp(2)]) where member_id = pg_temp.hp(2)), false) then
    raise exception 'FAIL P2: a match seen just now is not active'; end if;
  if exists (select 1 from public.connection_presence(array[pg_temp.hp(4)])) then raise exception 'FAIL P2: a non-match is listed'; end if;
  if (select count(*) from public.connection_presence(array[pg_temp.hp(2), pg_temp.hp(3), pg_temp.hp(4), pg_temp.hp(1)])) <> 2 then
    raise exception 'FAIL P2: expected rows for the two matches only'; end if;
  reset role;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.hp(1), pg_temp.hp(3)) on conflict do nothing;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.hp(1))::text, true);
  if coalesce((select active from public.connection_presence(array[pg_temp.hp(3)]) where member_id = pg_temp.hp(3)), false) then
    raise exception 'FAIL P2: a blocked pair shows active'; end if;
  reset role;
  update public.member_presence set last_seen_at = now() - interval '4 minutes' where member_id = pg_temp.hp(2);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.hp(1))::text, true);
  if (select active from public.connection_presence(array[pg_temp.hp(2)])) then raise exception 'FAIL P2: 4 minutes ago is still active'; end if;
  reset role;
  update public.member_presence set last_seen_at = now() where member_id = pg_temp.hp(2);

  -- P3
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.hp(1))::text, true);
  if not public.my_presence_visible() then raise exception 'FAIL P3: the switch should default to on'; end if;
  perform public.set_presence_visible(false);
  if public.my_presence_visible() then raise exception 'FAIL P3: the switch did not turn off'; end if;
  if (select active from public.connection_presence(array[pg_temp.hp(2)])) then raise exception 'FAIL P3: a hidden viewer sees others'; end if;
  perform public.set_presence_visible(true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.hp(2))::text, true);
  perform public.set_presence_visible(false);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.hp(1))::text, true);
  if (select active from public.connection_presence(array[pg_temp.hp(2)])) then raise exception 'FAIL P3: a hidden member shows active'; end if;

  -- P4
  code := null;
  begin perform * from public.connection_presence((select array_agg(gen_random_uuid()) from generate_series(1, 101))); exception when others then code := sqlstate; end;
  if code is distinct from '22023' then raise exception 'FAIL P4: 101 ids gave %', coalesce(code, 'no error'); end if;
  perform set_config('request.jwt.claims', '{}', true);
  code := null;
  begin perform public.touch_presence(); exception when others then code := sqlstate; end;
  if code is distinct from '42501' then raise exception 'FAIL P4: no session gave %', coalesce(code, 'no error'); end if;
  reset role;
end $$;
select 'h-member-presence.test P1-P4 OK';

-- P5
delete from public.brivia_blocks where blocker_id::text like '0d180000-%' or blocked_id::text like '0d180000-%';
delete from public.matches where user1_id::text like '0d180000-%' or user2_id::text like '0d180000-%';
delete from public.profiles where id = pg_temp.hp(4);
do $$ begin
  if exists (select 1 from public.member_presence where member_id = pg_temp.hp(4)) then raise exception 'FAIL P5: presence outlived the profile'; end if;
end $$;
select 'h-member-presence.test P5 OK';
delete from public.profiles where id::text like '0d180000-%';
delete from auth.users where id::text like '0d180000-%';
