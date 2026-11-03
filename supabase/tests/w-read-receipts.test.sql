-- 0042 (D-150): Delivered, Read and last active.
-- Ids 0d420000-0000-4000-8000-0000000000NN: 01 A, 02 B (A's match), 03 C (A's match, blocked by A later), 04 D (no match).
-- R1 a client insert cannot set delivered_at or read_at (the trigger clears both).
-- R2 mark_messages_delivered marks only the caller's incoming messages, never a withheld one, and is idempotent.
-- R3 mark_conversation_read marks only messages from that member to the caller, also sets delivered_at, never a
--    withheld one; the sender's own messages are untouched; p_other = self or null marks nothing.
-- R4 no session is refused (42501); anon cannot execute any of the three; authenticated can.
-- R5 connection_last_seen: a match's time rounded to the minute and active within 3 minutes; a non-match is left out;
--    a blocked pair or either switch off gives no time and not active; more than 100 ids is refused (22023).
set brivia.harness_autocomplete = 'off';
create or replace function pg_temp.rr(n int) returns uuid language sql immutable as $$
  select ('0d420000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

do $$
declare g int;
begin
  for g in 1..4 loop
    insert into auth.users(id) values (pg_temp.rr(g)) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (pg_temp.rr(g), 'Rread ' || g, 'Rread ' || g, 'rread' || g || '@example.com', 'Some years', array['Friends']) on conflict (id) do nothing;
  end loop;
  insert into public.matches (user1_id, user2_id) values (pg_temp.rr(1), pg_temp.rr(2)), (pg_temp.rr(3), pg_temp.rr(1)) on conflict do nothing;
  -- R1: the owner inserts here, and the trigger still clears what the row tried to carry.
  insert into public.brivia_messages (id, sender_id, recipient_id, body, delivered_at, read_at) values
    ('0d420000-0000-4000-8000-0000000000a1', pg_temp.rr(2), pg_temp.rr(1), 'B to A one', now(), now()),
    ('0d420000-0000-4000-8000-0000000000a2', pg_temp.rr(2), pg_temp.rr(1), 'B to A two', null, null),
    ('0d420000-0000-4000-8000-0000000000a3', pg_temp.rr(1), pg_temp.rr(2), 'A to B', null, null),
    ('0d420000-0000-4000-8000-0000000000a4', pg_temp.rr(3), pg_temp.rr(1), 'C to A, withheld', null, null),
    ('0d420000-0000-4000-8000-0000000000a5', pg_temp.rr(3), pg_temp.rr(1), 'C to A', null, null);
  insert into brivia_private.withheld_message (message_id) values ('0d420000-0000-4000-8000-0000000000a4') on conflict do nothing;
end $$;

do $$
declare n int; code text; f text;
begin
  -- R1
  if exists (select 1 from public.brivia_messages where sender_id::text like '0d420000-%' and (delivered_at is not null or read_at is not null)) then
    raise exception 'FAIL R1: an insert kept delivered_at or read_at'; end if;

  -- R4
  foreach f in array array['public.mark_messages_delivered()', 'public.mark_conversation_read(uuid)', 'public.connection_last_seen(uuid[])'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL R4: anon may execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL R4: authenticated may not execute %', f; end if;
  end loop;

  -- R2 (A's device receives)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.rr(1))::text, true);
  n := public.mark_messages_delivered();
  if n <> 3 then raise exception 'FAIL R2: expected 3 delivered, got %', n; end if;
  if public.mark_messages_delivered() <> 0 then raise exception 'FAIL R2: a second call marked again'; end if;
  reset role;
  if (select delivered_at from public.brivia_messages where id = '0d420000-0000-4000-8000-0000000000a4') is not null then
    raise exception 'FAIL R2: a withheld message shows delivered'; end if;
  if (select delivered_at from public.brivia_messages where id = '0d420000-0000-4000-8000-0000000000a3') is not null then
    raise exception 'FAIL R2: the caller''s own sent message was marked'; end if;
  if exists (select 1 from public.brivia_messages where sender_id::text like '0d420000-%' and read_at is not null) then
    raise exception 'FAIL R2: delivered marked something read'; end if;

  -- R3 (A opens B's conversation, then C's)
  update public.brivia_messages set delivered_at = null where id = '0d420000-0000-4000-8000-0000000000a2';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.rr(1))::text, true);
  n := public.mark_conversation_read(pg_temp.rr(2));
  if n <> 2 then raise exception 'FAIL R3: expected 2 read from B, got %', n; end if;
  if public.mark_conversation_read(pg_temp.rr(2)) <> 0 then raise exception 'FAIL R3: a second call marked again'; end if;
  if public.mark_conversation_read(pg_temp.rr(1)) <> 0 or public.mark_conversation_read(null) <> 0 then
    raise exception 'FAIL R3: self or null marked something'; end if;
  n := public.mark_conversation_read(pg_temp.rr(3));
  if n <> 1 then raise exception 'FAIL R3: expected 1 read from C (the withheld one stays), got %', n; end if;
  reset role;
  if (select delivered_at is null or read_at is null from public.brivia_messages where id = '0d420000-0000-4000-8000-0000000000a2') then
    raise exception 'FAIL R3: read did not also set delivered'; end if;
  if (select read_at from public.brivia_messages where id = '0d420000-0000-4000-8000-0000000000a3') is not null then
    raise exception 'FAIL R3: the reader''s own message was marked read'; end if;
  if (select read_at from public.brivia_messages where id = '0d420000-0000-4000-8000-0000000000a4') is not null then
    raise exception 'FAIL R3: a withheld message shows read'; end if;
  -- B cannot mark A's message to B as read on A's behalf by naming the wrong member.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.rr(4))::text, true);
  if public.mark_conversation_read(pg_temp.rr(1)) <> 0 then raise exception 'FAIL R3: a stranger marked messages read'; end if;

  -- R4 no session
  perform set_config('request.jwt.claims', '{}', true);
  code := null;
  begin perform public.mark_messages_delivered(); exception when others then code := sqlstate; end;
  if code is distinct from '42501' then raise exception 'FAIL R4: no session gave %', coalesce(code, 'no error'); end if;
  code := null;
  begin perform public.mark_conversation_read(pg_temp.rr(2)); exception when others then code := sqlstate; end;
  if code is distinct from '42501' then raise exception 'FAIL R4: no session (read) gave %', coalesce(code, 'no error'); end if;
  reset role;

  -- R5
  insert into public.member_presence (member_id, last_seen_at) values
    (pg_temp.rr(2), now() - interval '10 minutes'), (pg_temp.rr(3), now()), (pg_temp.rr(4), now())
  on conflict (member_id) do update set last_seen_at = excluded.last_seen_at, visible = true;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.rr(1))::text, true);
  if (select count(*) from public.connection_last_seen(array[pg_temp.rr(2), pg_temp.rr(3), pg_temp.rr(4), pg_temp.rr(1)])) <> 2 then
    raise exception 'FAIL R5: expected rows for the two matches only'; end if;
  if (select active or last_seen_at is null or last_seen_at <> date_trunc('minute', last_seen_at)
        or last_seen_at < now() - interval '11 minutes'
        from public.connection_last_seen(array[pg_temp.rr(2)])) then
    raise exception 'FAIL R5: B should be inactive, seen ~10 minutes ago, to the minute'; end if;
  if not (select active from public.connection_last_seen(array[pg_temp.rr(3)])) then raise exception 'FAIL R5: C seen now is not active'; end if;
  reset role;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.rr(1), pg_temp.rr(3)) on conflict do nothing;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.rr(1))::text, true);
  if (select active or last_seen_at is not null from public.connection_last_seen(array[pg_temp.rr(3)])) then
    raise exception 'FAIL R5: a blocked pair shows a time'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.rr(2))::text, true);
  perform public.set_presence_visible(false);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.rr(1))::text, true);
  if (select last_seen_at is not null from public.connection_last_seen(array[pg_temp.rr(2)])) then
    raise exception 'FAIL R5: a hidden member shows a time'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.rr(2))::text, true);
  perform public.set_presence_visible(true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.rr(1))::text, true);
  perform public.set_presence_visible(false);
  if (select last_seen_at is not null from public.connection_last_seen(array[pg_temp.rr(2)])) then
    raise exception 'FAIL R5: a hidden viewer sees a time'; end if;
  perform public.set_presence_visible(true);
  code := null;
  begin perform * from public.connection_last_seen((select array_agg(gen_random_uuid()) from generate_series(1, 101))); exception when others then code := sqlstate; end;
  if code is distinct from '22023' then raise exception 'FAIL R5: 101 ids gave %', coalesce(code, 'no error'); end if;
  reset role;
end $$;
select 'w-read-receipts.test R1-R5 OK';

delete from public.brivia_messages where sender_id::text like '0d420000-%';
delete from public.brivia_blocks where blocker_id::text like '0d420000-%' or blocked_id::text like '0d420000-%';
delete from public.matches where user1_id::text like '0d420000-%' or user2_id::text like '0d420000-%';
delete from public.profiles where id::text like '0d420000-%';
delete from auth.users where id::text like '0d420000-%';
