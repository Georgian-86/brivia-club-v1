-- 0064 (D-215): chats read on any device.
-- Ids 0d640000-0000-4000-8000-0000000000NN: 01 A, 02 B.
-- S1 mark_chat_seen stores the time for the caller only; it never moves backwards and never ahead of now().
-- S2 p_other null is the Chats tab: my_chat_seen returns it with other_id null.
-- S3 another member never sees A's rows; no session is refused (42501); anon cannot execute either function.
set brivia.harness_autocomplete = 'off';
create or replace function pg_temp.cs(n int) returns uuid language sql immutable as $$
  select ('0d640000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

do $$
declare g int;
begin
  for g in 1..2 loop
    insert into auth.users(id) values (pg_temp.cs(g)) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (pg_temp.cs(g), 'Cseen ' || g, 'Cseen ' || g, 'cseen' || g || '@example.com', 'Some years', array['Friends']) on conflict (id) do nothing;
  end loop;
end $$;

do $$
declare n int; t timestamptz; code text; f text;
begin
  foreach f in array array['public.mark_chat_seen(uuid, timestamptz)', 'public.my_chat_seen()'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL S3: anon may execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL S3: authenticated may not execute %', f; end if;
  end loop;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.cs(1))::text, true);
  perform public.mark_chat_seen(pg_temp.cs(2), now() - interval '1 hour');
  perform public.mark_chat_seen(pg_temp.cs(2), now() - interval '2 hours');   -- older: ignored
  select s.seen_at into t from public.my_chat_seen() s where s.other_id = pg_temp.cs(2);
  if t is null or t > now() - interval '59 minutes' or t < now() - interval '61 minutes' then
    raise exception 'FAIL S1: expected an hour ago, got %', t; end if;
  perform public.mark_chat_seen(pg_temp.cs(2), now() + interval '1 day');     -- future: capped at now()
  select s.seen_at into t from public.my_chat_seen() s where s.other_id = pg_temp.cs(2);
  if t > now() then raise exception 'FAIL S1: seen_at ahead of now()'; end if;
  -- S2
  perform public.mark_chat_seen(null);
  select count(*) into n from public.my_chat_seen() s where s.other_id is null;
  if n <> 1 then raise exception 'FAIL S2: expected one Chats-tab row, got %', n; end if;
  select count(*) into n from public.my_chat_seen();
  if n <> 2 then raise exception 'FAIL S1: expected 2 rows, got %', n; end if;
  -- S3: B sees none of A's rows
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.cs(2))::text, true);
  select count(*) into n from public.my_chat_seen();
  if n <> 0 then raise exception 'FAIL S3: B sees % of A''s rows', n; end if;
  perform set_config('request.jwt.claims', '{}', true);
  begin perform public.my_chat_seen(); code := 'none'; exception when others then code := sqlstate; end;
  if code <> '42501' then raise exception 'FAIL S3: no session gave %', code; end if;
  begin perform public.mark_chat_seen(null); code := 'none'; exception when others then code := sqlstate; end;
  if code <> '42501' then raise exception 'FAIL S3: no session gave % on mark', code; end if;
  reset role;
  raise notice 'z-chat-seen: S1-S3 pass';
end $$;

delete from public.profiles where id::text like '0d640000-%';
delete from auth.users where id::text like '0d640000-%';
