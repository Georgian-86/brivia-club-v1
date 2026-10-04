-- Iteration-3 arena P0-A5 (R4, B-F2) and P0-A7 (R6, B-F5): harvest closure and block inference (D-038).
--   * list_members (the paged directory) is not executable by any client role; the client never calls it.
--   * gender is null in every card RPC (get_candidates, search_members, list_members); the type is unchanged.
--   * search_members needs at least 2 non-space characters: a one-character query returns nothing.
--   * my_outgoing_requests keeps a request to a member who then blocked the sender exactly as it was ('pending', same
--     created_at) until its natural 30-day expiry, so the sender cannot infer the block.
-- Members are completed by the harness autocomplete fixture (name + city). One transaction, rolled back.
begin;
insert into auth.users(id) values
  ('4a7e4a7e-0000-4000-8000-0000000000a1'), ('4a7e4a7e-0000-4000-8000-0000000000b2'),
  ('4a7e4a7e-0000-4000-8000-0000000000c3')
  on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city, gender)
values ('4a7e4a7e-0000-4000-8000-0000000000a1', 'Hv Viewer', 'Hv Viewer', 'hv@example.com', 'Pune', 'Male'),
       ('4a7e4a7e-0000-4000-8000-0000000000b2', 'Ht Target', 'Ht Target', 'ht@example.com', 'Pune', 'Female'),
       ('4a7e4a7e-0000-4000-8000-0000000000c3', 'Hb Blocker', 'Hb Blocker', 'hb@example.com', 'Pune', 'Female')
on conflict (id) do nothing;

-- 1. list_members is closed to every client role.
do $$
declare r text; failed boolean;
begin
  foreach r in array array['anon', 'authenticated', 'public'] loop
    if has_function_privilege(r, 'public.list_members(integer, timestamp with time zone, uuid)', 'execute') then
      raise exception 'FAIL R4: % can execute list_members', r;
    end if;
  end loop;
  failed := false;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"4a7e4a7e-0000-4000-8000-0000000000a1"}', true);
  begin perform * from public.list_members(20); exception when insufficient_privilege then failed := true; end;
  reset role;
  if not failed then raise exception 'FAIL R4: a member may page list_members'; end if;
end $$;

-- 2. gender is null in every card RPC (list_members checked as the owner, its only remaining caller).
do $$
declare t constant uuid := '4a7e4a7e-0000-4000-8000-0000000000b2'; r record; n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"4a7e4a7e-0000-4000-8000-0000000000a1"}', true);
  select * into r from public.list_members(20) where id = t;
  if r.id is null then raise exception 'FAIL setup: list_members (owner) does not show the target'; end if;
  if r.gender is not null then raise exception 'FAIL R4: list_members returns gender %', r.gender; end if;
  set local role authenticated;
  select * into r from public.get_candidates(array[t]);
  if r.id is null then reset role; raise exception 'FAIL setup: get_candidates does not show the target'; end if;
  if r.gender is not null then reset role; raise exception 'FAIL R4: get_candidates returns gender %', r.gender; end if;
  select * into r from public.search_members('Ht Target') where id = t;
  if r.id is null then reset role; raise exception 'FAIL setup: search_members does not find the target'; end if;
  if r.gender is not null then reset role; raise exception 'FAIL R4: search_members returns gender %', r.gender; end if;
  select count(*) into n from public.search_members('Ht', 20) where gender is not null;
  reset role;
  if n <> 0 then raise exception 'FAIL R4: search rows with gender'; end if;
end $$;

-- 3. A one-character query (after trimming spaces) returns nothing; two characters work.
do $$
declare q text; n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"4a7e4a7e-0000-4000-8000-0000000000a1"}', true);
  foreach q in array array['H', 'h', ' H ', 'e', '   t', 'H ', E'\tH\n'] loop
    select count(*) into n from public.search_members(q, 20);
    if n <> 0 then reset role; raise exception 'FAIL R4: the one-character query "%" returned % rows', q, n; end if;
  end loop;
  select count(*) into n from public.search_members('Ht', 20);
  if n <> 1 then reset role; raise exception 'FAIL R4: a two-character query returned % rows (want 1)', n; end if;
  select count(*) into n from public.search_members('H t', 20);   -- two non-space characters
  if n <> 0 then reset role; raise exception 'FAIL setup: "H t" matched % rows', n; end if;
  reset role;
end $$;

-- 4. Block inference (R6): V's request to C stays 'pending' with the same created_at after C blocks V, and leaves
-- only at the natural 30-day expiry. (A decline already reads 'pending'.)
do $$
declare v constant uuid := '4a7e4a7e-0000-4000-8000-0000000000a1'; c constant uuid := '4a7e4a7e-0000-4000-8000-0000000000c3';
        before_row text; after_row text;
begin
  insert into public.connection_requests (from_id, to_id, note) values (v, c, 'hello');
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  select string_agg(to_id || '|' || status || '|' || coalesce(note, '') || '|' || created_at, ',') into before_row
    from public.my_outgoing_requests() where to_id = c;
  reset role;
  if before_row is null then raise exception 'FAIL setup: the request is not in my_outgoing_requests'; end if;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (c, v);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  select string_agg(to_id || '|' || status || '|' || coalesce(note, '') || '|' || created_at, ',') into after_row
    from public.my_outgoing_requests() where to_id = c;
  reset role;
  if after_row is distinct from before_row then
    raise exception 'FAIL R6: a block changed the sender''s outgoing row (% -> %)', before_row, after_row;
  end if;
  -- C also declines (as the owner, like respond_connection_request): still 'pending' to V
  update public.connection_requests set status = 'declined' where from_id = v and to_id = c;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  select string_agg(to_id || '|' || status || '|' || coalesce(note, '') || '|' || created_at, ',') into after_row
    from public.my_outgoing_requests() where to_id = c;
  reset role;
  if after_row is distinct from before_row then raise exception 'FAIL R6: declined + blocked reads %', after_row; end if;
  -- natural expiry: 31 days old, gone
  update public.connection_requests set created_at = now() - interval '31 days' where from_id = v and to_id = c;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  if exists (select 1 from public.my_outgoing_requests() where to_id = c) then
    reset role; raise exception 'FAIL R6: an expired request is still listed';
  end if;
  reset role;
end $$;

rollback;

select 'orbit-harvest.test.sql OK' as result;
