-- 0073 (D-241): members who started but did not finish setup are shown as newcomers.
-- N1 newcomer_cards gives a completed caller the newcomer (name, photo, 18+, no interests or area): 'New to Brivia';
--    not one without the 18+ declaration, without a photo, under review, blocked, or already completed (the deck
--    covers those), and never to a caller who is not completed.
-- N2 a request to a newcomer is recorded (a connection_requests row, status 'sent'); one to a member without the 18+
--    declaration is charged and dropped, as before; no match exists.
-- N3 the newcomer sees no incoming request until setup is finished; then they do. The trigger function is internal.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.mv(n int) returns uuid language sql immutable as $$
  select ('0e730000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(12.9698, 77.7499, 7);
begin
  -- 1 viewer (completed), 2 newcomer, 3 no 18+, 4 no photo, 5 newcomer blocked by 1, 6 completed member, 7 under review
  for g in 1..7 loop
    mid := pg_temp.mv(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, skills)
    values (mid, 'New ' || g, 'New ' || g, 'newcomer' || g || '@example.com', 'Some years', array['Friends'], array['Chess'])
    on conflict (id) do nothing;
    if g <> 3 then update public.profiles set adult_declared_at = now() where profiles.id = mid; end if;
    if g <> 4 then
      update public.profiles set photo_url = 'https://proj.supabase.co/storage/v1/object/public/profile-photos/' || mid || '/p.jpg' where profiles.id = mid;
    end if;
    if g in (1, 6) then
      insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
      values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
      on conflict (member_id) do nothing;
      insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
    end if;
  end loop;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.mv(1), pg_temp.mv(5)) on conflict do nothing;
  insert into public.member_flag (member_id, reason) values (pg_temp.mv(7), 'suspended_pending_review');
  if has_function_privilege('authenticated', 'brivia_private.brivia_newcomer_visible(uuid, uuid)', 'execute') then
    raise exception 'FAIL N3: members can call brivia_newcomer_visible'; end if;
end $$;

-- N1 and N2, as the viewer
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.mv(1))::text, true);
set local role authenticated;
do $$
declare ids uuid[]; r record;
begin
  select array_agg(c.id order by c.id) into ids from public.newcomer_cards() c where c.id::text like '0e730000%';
  if ids is distinct from array[pg_temp.mv(2)] then raise exception 'FAIL N1: newcomers %', ids; end if;
  select c.* into r from public.newcomer_cards() c where c.id = pg_temp.mv(2);
  if r.distance_band <> 'New to Brivia' or r.name <> 'New 2' or r.photo_url not like '%profile-photos%' then raise exception 'FAIL N1: card %', row_to_json(r); end if;
  select array_agg(c.id) into ids from public.newcomer_cards(array[pg_temp.mv(2)]) c where c.id::text like '0e730000%';
  if ids is not null then raise exception 'FAIL N1: p_exclude %', ids; end if;
  -- N2
  select * into r from public.send_signal(pg_temp.mv(2), 'Welcome to Brivia');
  if r.status <> 'sent' then raise exception 'FAIL N2: status %', r.status; end if;
  select * into r from public.send_signal(pg_temp.mv(3), null);
  if r.status <> 'sent' then raise exception 'FAIL N2: status (no 18+) %', r.status; end if;
  if exists (select 1 from public.newcomer_cards() c where c.id = pg_temp.mv(2)) then raise exception 'FAIL N2: shown again after a request'; end if;
end $$;
reset role;
do $$
begin
  if not exists (select 1 from public.connection_requests where from_id = pg_temp.mv(1) and to_id = pg_temp.mv(2) and note = 'Welcome to Brivia') then
    raise exception 'FAIL N2: the request to the newcomer was not recorded'; end if;
  if exists (select 1 from public.connection_requests where from_id = pg_temp.mv(1) and to_id = pg_temp.mv(3)) then
    raise exception 'FAIL N2: a request reached a member without the 18+ declaration'; end if;
  if exists (select 1 from public.matches where pg_temp.mv(2) in (user1_id, user2_id)) then raise exception 'FAIL N2: a match'; end if;
end $$;

-- N1: a caller who is not completed gets nothing
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.mv(2))::text, true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.newcomer_cards()) then raise exception 'FAIL N1: a newcomer caller got cards'; end if;
  -- N3: not completed yet: the incoming request is not visible to them
  if exists (select 1 from public.connection_requests where to_id = pg_temp.mv(2)) then raise exception 'FAIL N3: seen before setup'; end if;
end $$;
reset role;

-- N3: the newcomer finishes setup; the request is theirs to answer
do $$
declare cell text := public.brivia_grid_cell(12.9698, 77.7499, 7);
begin
  insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
  values (pg_temp.mv(2), cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell');
  insert into public.member_interest (member_id, interest_id, points) values (pg_temp.mv(2), 'sports.racket.badminton', 20);
end $$;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.mv(2))::text, true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.connection_requests where to_id = pg_temp.mv(2) and from_id = pg_temp.mv(1)) then
    raise exception 'FAIL N3: not visible after setup'; end if;
end $$;
reset role;
rollback;
select 'zm-newcomer-cards.test ALL PASSED';
