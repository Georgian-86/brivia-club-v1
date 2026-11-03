-- 0034 (D-138): Hiring. Ids 0e330000-0000-4000-8000-0000000000NN. One transaction, rolled back.
--   01 H hirer (old account, photo, confirmed email, skills React + Badminton), Bengaluru
--   02 S seeker: Frontend Developer, mid, hybrid or remote, skills React + Chess, Bengaluru
--   03 O neither, Bengaluru          04 N hirer with a 2-day-old account
--   05 F far hirer (Delhi)            06 P seeker, findable, private company "Lumen Labs" (H's company)
--   07 Q seeker, findable             08, 09, 10 more hirers over the bar (for the 3-a-day cap)
--   11 B blocked by S                 30..54 waiting askers for the 25-per-role cap
-- H1 grants and shapes; H2 role validation and the 3-role cap; H3 the hiring bar; H4 the fit maths;
-- H5 member_hiring visibility; H6 hiring_suggestions both ways; H7 member_open_to; H8 asking and its caps;
-- H9 25 waiting asks per role; H10 pause / open / renew / close; H11 report_fake_job; H12 the kill switch;
-- H13 withdrawing intent and deleting a profile.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.hp(n int) returns uuid language sql immutable as $$
  select ('0e330000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function pg_temp.as_member(n int) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.hp(n))::text, true); end $$;
create or replace function pg_temp.err(sql text) returns text language plpgsql as $$
begin execute sql; return 'none'; exception when others then return sqlstate; end $$;

do $$
declare g int; mid uuid; blr text := public.brivia_grid_cell(12.9716, 77.5946, 7); del text := public.brivia_grid_cell(28.6139, 77.2090, 7); cell text;
begin
  for g in 1..11 loop
    mid := pg_temp.hp(g);
    cell := case when g = 5 then del else blr end;
    insert into auth.users(id, email_confirmed_at) values (mid, now()) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for, photo_url, skills)
    values (mid, 'Hire ' || g, 'Hire ' || g, 'hire' || g || '@example.com', 'Some years', array['Friends'],
            'https://x.supabase.co/storage/v1/object/public/profile-photos/' || mid || '/p.jpg',
            case g when 1 then array['React', 'Badminton'] when 2 then array['react', 'Chess'] else array['Chess'] end)
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now(),
           created_at = case when g = 4 then now() - interval '2 days' else now() - interval '30 days' end
     where profiles.id = mid;
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell), 'cell')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
  end loop;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.hp(2), pg_temp.hp(11));
  if not public.brivia_member_completed(pg_temp.hp(1)) or not public.brivia_member_completed(pg_temp.hp(5)) then
    raise exception 'FAIL setup'; end if;
end $$;

-- H1 ---------------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.save_hiring_role(uuid, text, text, text, text, text, text, text)',
    'public.set_hiring_role_status(uuid, text)', 'public.my_hiring_roles()',
    'public.save_role_intent(text[], text[], text, text[], text, boolean, text)', 'public.withdraw_role_intent()',
    'public.my_role_intent()', 'public.member_hiring(uuid[])', 'public.member_open_to(uuid)',
    'public.hiring_suggestions(integer)', 'public.ask_about_role(uuid, text)', 'public.my_role_asks()',
    'public.my_sent_role_asks()', 'public.report_fake_job(uuid, text)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL H1: anon may execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL H1: authenticated may not execute %', f; end if;
  end loop;
  foreach f in array array['public.brivia_hiring_bar(uuid)', 'public.brivia_role_fit(uuid, uuid)', 'public.purge_hiring()',
    'public.brivia_hiring_enabled()', 'public.brivia_role_waiting_count(uuid)'] loop
    if has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute') then
      raise exception 'FAIL H1: a client may execute %', f; end if;
  end loop;
  foreach f in array array['public.hiring_role', 'public.role_intent', 'public.role_ask', 'public.brivia_feature'] loop
    if has_table_privilege('authenticated', f, 'select') or has_table_privilege('anon', f, 'select')
       or has_table_privilege('authenticated', f, 'insert') or has_table_privilege('authenticated', f, 'update') then
      raise exception 'FAIL H1: % is reachable directly', f; end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name in ('hiring_role', 'role_intent', 'role_ask')
              and (data_type in ('double precision', 'real', 'point') or column_name ~ '(city|state|lat|lng|cell|place)')) then
    raise exception 'FAIL H1: a hiring table has a place or coordinate column'; end if;
end $$;
select 's-hiring.test H1 OK';

-- H2 ---------------------------------------------------------------------------------------------------------------
do $$
declare v uuid;
begin
  set local role authenticated;
  perform pg_temp.as_member(1);
  if pg_temp.err($q$select public.save_hiring_role(null, 'Frontend Developer', 'software', 'mid', 'hybrid', 'refer', 'Lumen Labs', 'Apply at lumen.io/jobs')$q$) <> '22023'
     or pg_temp.err($q$select public.save_hiring_role(null, 'Frontend Developer', 'software', 'mid', 'hybrid', 'refer', null, 'Call me on 98450 12345')$q$) <> '22023'
     or pg_temp.err($q$select public.save_hiring_role(null, 'Frontend Developer', 'software', 'mid', 'hybrid', 'refer', null, 'mail jobs@lumen.in')$q$) <> '22023'
     or pg_temp.err($q$select public.save_hiring_role(null, 'Frontend Developer', 'software', 'mid', 'hybrid', 'refer', null, 'DM on telegram')$q$) <> '22023'
     or pg_temp.err($q$select public.save_hiring_role(null, 'FD', 'software', 'mid', 'hybrid', 'refer', null, null)$q$) <> '22023'
     or pg_temp.err($q$select public.save_hiring_role(null, 'Frontend Developer', 'astrology', 'mid', 'hybrid', 'refer', null, null)$q$) <> '22023'
     or pg_temp.err($q$select public.save_hiring_role(null, 'Frontend Developer', 'software', 'mid', 'mars', 'refer', null, null)$q$) <> '22023' then
    raise exception 'FAIL H2: a bad role was accepted'; end if;
  v := public.save_hiring_role(null, '  Frontend   Developer ', 'software', 'mid', 'hybrid', 'refer', 'Lumen Labs',
                               'React and TypeScript, a small product team.');
  perform public.save_hiring_role(null, 'Backend Developer', 'software', 'senior', 'onsite', 'refer', 'Lumen Labs', null);
  perform public.save_hiring_role(null, 'Design Intern', 'design', 'intern', 'remote', 'hiring', 'Lumen Labs', null);
  if pg_temp.err($q$select public.save_hiring_role(null, 'Data Analyst', 'data', 'mid', 'remote', 'hiring', null, null)$q$) <> 'PT429' then
    raise exception 'FAIL H2: a fourth role was accepted'; end if;
  if (select title from public.my_hiring_roles() where id = v) <> 'Frontend Developer' then raise exception 'FAIL H2: title not tidied'; end if;
  perform pg_temp.as_member(3);
  if pg_temp.err(format('select public.save_hiring_role(%L, %L, %L, %L, %L, %L)', v, 'Mine now', 'software', 'mid', 'hybrid', 'refer')) <> 'P0002' then
    raise exception 'FAIL H2: another member edited a role'; end if;
  -- hirers 4 (new account), 5 (far), 8, 9, 10
  perform pg_temp.as_member(4); perform public.save_hiring_role(null, 'Frontend Developer', 'software', 'mid', 'hybrid', 'hiring', null, null);
  perform pg_temp.as_member(5); perform public.save_hiring_role(null, 'Frontend Developer', 'software', 'mid', 'hybrid', 'hiring', null, null);
  perform pg_temp.as_member(8); perform public.save_hiring_role(null, 'React Developer', 'software', 'mid', 'remote', 'hiring', null, null);
  perform pg_temp.as_member(9); perform public.save_hiring_role(null, 'Frontend Developer', 'software', 'entry', 'hybrid', 'refer', null, null);
  perform pg_temp.as_member(10); perform public.save_hiring_role(null, 'Frontend Developer', 'software', 'mid', 'onsite', 'refer', null, null);
  perform public.save_hiring_role(null, 'Frontend Developer', 'software', 'mid', 'hybrid', 'refer', null, null);
  reset role;
end $$;
select 's-hiring.test H2 OK';

-- H3 ---------------------------------------------------------------------------------------------------------------
do $$
begin
  if not public.brivia_hiring_bar(pg_temp.hp(1)) then raise exception 'FAIL H3: H is under the bar'; end if;
  if public.brivia_hiring_bar(pg_temp.hp(4)) then raise exception 'FAIL H3: a 2-day-old account is over the bar'; end if;
  update public.profiles set photo_url = null where id = pg_temp.hp(9);
  if public.brivia_hiring_bar(pg_temp.hp(9)) then raise exception 'FAIL H3: no photo is over the bar'; end if;
  update public.profiles set photo_url = 'https://x.supabase.co/storage/v1/object/public/profile-photos/' || pg_temp.hp(9) || '/p.jpg' where id = pg_temp.hp(9);
  update auth.users set email_confirmed_at = null where id = pg_temp.hp(9);
  if public.brivia_hiring_bar(pg_temp.hp(9)) then raise exception 'FAIL H3: an unconfirmed email is over the bar'; end if;
  update auth.users set email_confirmed_at = now() where id = pg_temp.hp(9);
  insert into public.member_flag (member_id, reason, expires_at) values (pg_temp.hp(9), 'reported', now() + interval '7 days');
  if public.brivia_hiring_bar(pg_temp.hp(9)) then raise exception 'FAIL H3: a flagged member is over the bar'; end if;
  delete from public.member_flag where member_id = pg_temp.hp(9);
  if not public.brivia_hiring_bar(pg_temp.hp(9)) then raise exception 'FAIL H3: the bar did not come back'; end if;
  set local role authenticated;
  perform pg_temp.as_member(4);
  if (select live_from from public.my_hiring_roles() limit 1) <> (now() - interval '2 days' + interval '14 days')::date
     or (select banner_live from public.my_hiring_roles() limit 1) then
    raise exception 'FAIL H3: my_hiring_roles live_from / banner_live wrong'; end if;
  perform pg_temp.as_member(3);
  if exists (select 1 from public.member_hiring(array[pg_temp.hp(4)])) then raise exception 'FAIL H3: N''s banner shows'; end if;
  if (select jsonb_array_length(roles) from public.member_hiring(array[pg_temp.hp(1)])) <> 3 then raise exception 'FAIL H3: H''s banner'; end if;
  reset role;
end $$;
select 's-hiring.test H3 OK';

-- H4 ---------------------------------------------------------------------------------------------------------------
do $$
declare fe uuid; be uuid; de uuid; v numeric;
begin
  set local role authenticated;
  perform pg_temp.as_member(2);
  if pg_temp.err($q$select public.save_role_intent(array['Frontend Developer','a','b','c'], array['software'], 'mid', array['hybrid'])$q$) <> '22023'
     or pg_temp.err($q$select public.save_role_intent(array['Frontend Developer'], array['software'], 'mid', array['moon'])$q$) <> '22023'
     or pg_temp.err($q$select public.save_role_intent(array['Frontend Developer'], array['software'], 'mid', array['hybrid'], 'world')$q$) <> '22023' then
    raise exception 'FAIL H4: a bad intent was accepted'; end if;
  perform public.save_role_intent(array['Frontend Developer', 'frontend developer', 'React Developer'], array['software'], 'mid', array['hybrid', 'remote']);
  if (select cardinality(titles) from public.my_role_intent()) <> 2 or (select visibility from public.my_role_intent()) <> 'hirers'
     or (select findable from public.my_role_intent()) then raise exception 'FAIL H4: intent defaults or de-duplication'; end if;
  perform pg_temp.as_member(6);
  perform public.save_role_intent(array['Frontend Developer'], array['software'], 'mid', array['hybrid'], 'hirers', true, 'lumen labs');
  perform pg_temp.as_member(7);
  perform public.save_role_intent(array['Frontend Developer'], array['software'], null, array['hybrid', 'onsite'], 'hirers', true, null);
  reset role;
  select id into fe from public.hiring_role where member_id = pg_temp.hp(1) and title = 'Frontend Developer';
  select id into be from public.hiring_role where member_id = pg_temp.hp(1) and title = 'Backend Developer';
  select id into de from public.hiring_role where member_id = pg_temp.hp(1) and title = 'Design Intern';
  v := public.brivia_role_fit(pg_temp.hp(2), fe);   -- 1 x 1 x 1 x (0.8 + 0.2 x 1/3): React is shared (case-insensitive)
  if v <> 0.8667 then raise exception 'FAIL H4: Frontend fit %', v; end if;
  v := public.brivia_role_fit(pg_temp.hp(2), be);   -- onsite: S accepts hybrid and remote only
  if v <> 0 then raise exception 'FAIL H4: an onsite role fits a hybrid seeker (%)', v; end if;
  update public.hiring_role set work_mode = 'remote' where id = be;
  v := public.brivia_role_fit(pg_temp.hp(2), be);   -- same family 0.7, one level apart 0.6
  if v <> round(0.7 * 0.6 * (0.8 + 0.2 / 3.0), 4) then raise exception 'FAIL H4: Backend fit %', v; end if;
  update public.hiring_role set work_mode = 'onsite' where id = be;
  v := public.brivia_role_fit(pg_temp.hp(2), de);   -- design is not adjacent to software; intern vs mid is 0
  if v <> 0 then raise exception 'FAIL H4: Design Intern fit %', v; end if;
  if public.brivia_role_fit(pg_temp.hp(3), fe) <> 0 then raise exception 'FAIL H4: no intent should fit 0'; end if;
  if public.brivia_role_fit(pg_temp.hp(1), fe) <> 0 then raise exception 'FAIL H4: own role fits'; end if;
  if not public.brivia_family_adjacent('software', 'data') or public.brivia_family_adjacent('software', 'design') then
    raise exception 'FAIL H4: adjacency'; end if;
end $$;
select 's-hiring.test H4 OK';

-- H5 ---------------------------------------------------------------------------------------------------------------
do $$
declare row record;
begin
  set local role authenticated;
  perform pg_temp.as_member(2);
  select * into row from public.member_hiring(array[pg_temp.hp(1), pg_temp.hp(11), pg_temp.hp(4)]);
  if row.member_id <> pg_temp.hp(1) or not row.fits or row.best_title <> 'Frontend Developer'
     or (row.roles -> 0 ->> 'fit')::numeric <> 0.8667 or (row.roles -> 0 ->> 'accepting')::boolean is not true
     or (row.roles -> 0 ->> 'asked')::boolean or row.roles -> 0 ? 'member_id' or row.roles::text ~ 'city' then
    raise exception 'FAIL H5: S''s view of H: %', row; end if;
  if (select count(*) from public.member_hiring(array[pg_temp.hp(1), pg_temp.hp(11), pg_temp.hp(4)])) <> 1 then
    raise exception 'FAIL H5: more than one banner'; end if;
  perform pg_temp.as_member(3);
  select * into row from public.member_hiring(array[pg_temp.hp(1)]);
  if row.fits or row.roles -> 0 ->> 'fit' is not null then raise exception 'FAIL H5: O got a fit'; end if;
  -- blocked: B sees nothing of S, and nobody sees a blocked pair's banner (B is a hirer here)
  reset role;
  insert into public.hiring_role (member_id, title, family, level, work_mode, help) values (pg_temp.hp(11), 'Frontend Developer', 'software', 'mid', 'hybrid', 'hiring');
  set local role authenticated;
  perform pg_temp.as_member(2);
  if exists (select 1 from public.member_hiring(array[pg_temp.hp(11)])) then raise exception 'FAIL H5: a blocked hirer shows'; end if;
  reset role;
end $$;
select 's-hiring.test H5 OK';

-- H6 ---------------------------------------------------------------------------------------------------------------
do $$
declare ids uuid[];
begin
  set local role authenticated;
  perform pg_temp.as_member(2);
  select array_agg(id) into ids from public.hiring_suggestions(20);
  if not (pg_temp.hp(1) = any(ids)) then raise exception 'FAIL H6: H not suggested to S: %', ids; end if;
  if pg_temp.hp(5) = any(ids) then raise exception 'FAIL H6: a far hirer (Delhi) was suggested'; end if;
  if pg_temp.hp(4) = any(ids) or pg_temp.hp(11) = any(ids) then raise exception 'FAIL H6: an under-bar or blocked hirer'; end if;
  if pg_temp.hp(10) = any(ids) and (select fit from public.hiring_suggestions(20) where id = pg_temp.hp(10)) < 0.5 then
    raise exception 'FAIL H6: an unfit suggestion'; end if;
  -- a cell under the k-anonymity floor shows the place band, exactly as the deck does
  if (select distance_band from public.hiring_suggestions(20) where id = pg_temp.hp(1)) is null then raise exception 'FAIL H6: band'; end if;
  perform pg_temp.as_member(3);
  if exists (select 1 from public.hiring_suggestions(20)) then raise exception 'FAIL H6: O got suggestions'; end if;
  perform pg_temp.as_member(1);
  select array_agg(id) into ids from public.hiring_suggestions(20);
  if not (pg_temp.hp(7) = any(ids)) then raise exception 'FAIL H6: findable Q not suggested to H: %', ids; end if;
  if pg_temp.hp(6) = any(ids) then raise exception 'FAIL H6: P (private company Lumen Labs) was suggested to H'; end if;
  if pg_temp.hp(2) = any(ids) then raise exception 'FAIL H6: S is not findable but was suggested'; end if;
  reset role;
end $$;
select 's-hiring.test H6 OK';

-- H7 ---------------------------------------------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform pg_temp.as_member(3);
  if exists (select 1 from public.member_open_to(pg_temp.hp(2))) then raise exception 'FAIL H7: O sees S''s roles'; end if;
  perform pg_temp.as_member(1);
  if not exists (select 1 from public.member_open_to(pg_temp.hp(2))) then raise exception 'FAIL H7: H cannot see S''s roles'; end if;
  if exists (select 1 from public.member_open_to(pg_temp.hp(6))) then raise exception 'FAIL H7: H sees P (same company)'; end if;
  perform pg_temp.as_member(2);
  perform public.save_role_intent(array['Frontend Developer', 'React Developer'], array['software'], 'mid', array['hybrid', 'remote'], 'everyone');
  perform pg_temp.as_member(3);
  if not exists (select 1 from public.member_open_to(pg_temp.hp(2))) then raise exception 'FAIL H7: Everyone not honoured'; end if;
  reset role;
end $$;
select 's-hiring.test H7 OK';

-- H8 ---------------------------------------------------------------------------------------------------------------
do $$
declare fe uuid; r record; n int; r8 uuid; r9 uuid; r10 uuid;
begin
  select id into fe from public.hiring_role where member_id = pg_temp.hp(1) and title = 'Frontend Developer';
  select id into r8 from public.hiring_role where member_id = pg_temp.hp(8);
  select id into r9 from public.hiring_role where member_id = pg_temp.hp(9);
  select id into r10 from public.hiring_role where member_id = pg_temp.hp(10) and work_mode = 'hybrid';
  set local role authenticated;
  perform pg_temp.as_member(2);
  if pg_temp.err(format('select * from public.ask_about_role(%L, %L)', fe, 'Hi, too short')) <> '22023' then raise exception 'FAIL H8: short note'; end if;
  if pg_temp.err(format('select * from public.ask_about_role(%L, %L)', gen_random_uuid(), repeat('x', 30))) <> 'P0002' then raise exception 'FAIL H8: unknown role'; end if;
  select * into r from public.ask_about_role(fe, 'Hi, I build React apps and would love to hear about the frontend role.');
  if r.status <> 'sent' or r.asks_left <> 2 then raise exception 'FAIL H8: first ask %', r; end if;
  if pg_temp.err(format('select * from public.ask_about_role(%L, %L)', fe, repeat('again ', 5))) <> '23505' then raise exception 'FAIL H8: asked twice'; end if;
  if not (select (roles -> 0 ->> 'asked')::boolean from public.member_hiring(array[pg_temp.hp(1)])) then raise exception 'FAIL H8: asked flag'; end if;
  perform pg_temp.as_member(1);
  if not exists (select 1 from public.my_role_asks() where seeker_id = pg_temp.hp(2) and role_title = 'Frontend Developer') then
    raise exception 'FAIL H8: H does not see the ask'; end if;
  perform pg_temp.as_member(2);
  perform public.ask_about_role(r8, 'Hello, I would like to know more about the React role.');
  perform public.ask_about_role(r9, 'Hello, I would like to know more about the frontend role.');
  if pg_temp.err(format('select * from public.ask_about_role(%L, %L)',
       r10, 'A fourth ask on the same day here.')) <> 'PT429' then
    raise exception 'FAIL H8: a fourth ask in a day'; end if;
  perform pg_temp.as_member(11);
  if pg_temp.err(format('select * from public.ask_about_role(%L, %L)',
       r10, 'Hello there, about your frontend role.')) <> 'none' then
    raise exception 'FAIL H8: B could not ask an unrelated hirer'; end if;
  reset role;
  select count(*) into n from public.connection_requests where from_id = pg_temp.hp(2) and to_id = pg_temp.hp(1) and status = 'pending'
     and note like 'Hi, I build React apps%';
  if n <> 1 then raise exception 'FAIL H8: the request with the note is missing'; end if;
end $$;
select 's-hiring.test H8 OK';

-- H9 ---------------------------------------------------------------------------------------------------------------
do $$
declare g int; fe uuid; mid uuid;
begin
  select id into fe from public.hiring_role where member_id = pg_temp.hp(10) and work_mode = 'hybrid';
  for g in 30..53 loop
    mid := pg_temp.hp(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email) values (mid, 'Asker ' || g, 'Asker ' || g, 'ask' || g || '@example.com') on conflict do nothing;
    insert into public.connection_requests (from_id, to_id, note) values (mid, pg_temp.hp(10), 'hello');
    insert into public.role_ask (role_id, seeker_id, hirer_id) values (fe, mid, pg_temp.hp(10));
  end loop;
  -- 24 from the loop + B's ask in H8 = 25
  if public.brivia_role_waiting_count(fe) <> 25 then raise exception 'FAIL H9: % waiting', public.brivia_role_waiting_count(fe); end if;
  set local role authenticated;
  perform pg_temp.as_member(7);
  if pg_temp.err(format('select * from public.ask_about_role(%L, %L)', fe, 'Hello, about your frontend role, please.')) <> 'PT429' then
    raise exception 'FAIL H9: a 26th ask'; end if;
  if (select (roles -> 0 ->> 'accepting')::boolean from public.member_hiring(array[pg_temp.hp(10)])
        where roles -> 0 ->> 'work_mode' = 'hybrid') then raise exception 'FAIL H9: still accepting'; end if;
  reset role;
  update public.role_ask set created_at = now() - interval '15 days' where role_id = fe and seeker_id = pg_temp.hp(30);
  if public.brivia_role_waiting_count(fe) <> 24 then raise exception 'FAIL H9: a 15-day-old ask still waits'; end if;
end $$;
select 's-hiring.test H9 OK';

-- H10 --------------------------------------------------------------------------------------------------------------
do $$
declare fe uuid;
begin
  select id into fe from public.hiring_role where member_id = pg_temp.hp(1) and title = 'Frontend Developer';
  set local role authenticated;
  perform pg_temp.as_member(1);
  if pg_temp.err(format('select public.set_hiring_role_status(%L, %L)', fe, 'renew')) <> 'PT409' then raise exception 'FAIL H10: renewed with a waiting ask'; end if;
  perform public.set_hiring_role_status(fe, 'pause');
  perform pg_temp.as_member(3);
  if (select jsonb_array_length(roles) from public.member_hiring(array[pg_temp.hp(1)])) <> 2 then raise exception 'FAIL H10: a paused role shows'; end if;
  perform pg_temp.as_member(1);
  perform public.set_hiring_role_status(fe, 'open');
  perform pg_temp.as_member(1);
  perform public.respond_connection_request(pg_temp.hp(2), true);
  perform public.set_hiring_role_status(fe, 'renew');
  if (select expires_at from public.my_hiring_roles() where id = fe) < now() + interval '29 days' then raise exception 'FAIL H10: renew'; end if;
  perform public.set_hiring_role_status(fe, 'close');
  if exists (select 1 from public.my_hiring_roles() where id = fe) then raise exception 'FAIL H10: a closed role is listed'; end if;
  if pg_temp.err(format('select public.set_hiring_role_status(%L, %L)', fe, 'open')) <> 'P0002' then raise exception 'FAIL H10: reopened a closed role'; end if;
  perform pg_temp.as_member(2);
  if (select role_status from public.my_sent_role_asks() where role_id = fe) <> 'closed' then raise exception 'FAIL H10: S not told the role closed'; end if;
  reset role;
  -- an expired role is not shown and cannot be asked about
  update public.hiring_role set expires_at = now() - interval '1 minute' where member_id = pg_temp.hp(8);
  set local role authenticated;
  perform pg_temp.as_member(7);
  if exists (select 1 from public.member_hiring(array[pg_temp.hp(8)])) then raise exception 'FAIL H10: an expired role shows'; end if;
  reset role;
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise exception 'FAIL H10: % %', sqlstate, sqlerrm;
end $$;
select 's-hiring.test H10 OK';

-- H11 --------------------------------------------------------------------------------------------------------------
do $$
declare be uuid;
begin
  select id into be from public.hiring_role where member_id = pg_temp.hp(1) and title = 'Backend Developer';
  set local role authenticated;
  perform pg_temp.as_member(7);
  perform public.report_fake_job(pg_temp.hp(1), 'Asked me for a Rs 2,000 registration fee');
  reset role;
  if exists (select 1 from public.hiring_role where member_id = pg_temp.hp(1) and status = 'open') then raise exception 'FAIL H11: roles still open'; end if;
  if not exists (select 1 from public.member_report where target_id = pg_temp.hp(1) and reason = 'fake' and note like 'Hiring:%') then
    raise exception 'FAIL H11: no report row'; end if;
  set local role authenticated;
  perform pg_temp.as_member(1);
  if pg_temp.err(format('select public.set_hiring_role_status(%L, %L)', be, 'open')) <> '42501' then raise exception 'FAIL H11: reopened under review'; end if;
  reset role;
end $$;
select 's-hiring.test H11 OK';

-- H12 --------------------------------------------------------------------------------------------------------------
do $$
begin
  update public.brivia_feature set enabled = false where name = 'hiring';
  set local role authenticated;
  perform pg_temp.as_member(3);
  if exists (select 1 from public.member_hiring(array[pg_temp.hp(9)])) or exists (select 1 from public.my_role_intent()) then
    raise exception 'FAIL H12: data while off'; end if;
  if pg_temp.err($q$select public.save_hiring_role(null, 'Frontend Developer', 'software', 'mid', 'hybrid', 'refer')$q$) <> 'P0001' then
    raise exception 'FAIL H12: saved while off'; end if;
  reset role;
  update public.brivia_feature set enabled = true where name = 'hiring';
end $$;
select 's-hiring.test H12 OK';

-- H13 --------------------------------------------------------------------------------------------------------------
do $$
begin
  set local role authenticated;
  perform pg_temp.as_member(7);
  perform public.withdraw_role_intent();
  if exists (select 1 from public.my_role_intent()) then raise exception 'FAIL H13: withdraw kept the intent'; end if;
  reset role;
  delete from public.profiles where id = pg_temp.hp(1);
  if exists (select 1 from public.hiring_role where member_id = pg_temp.hp(1))
     or exists (select 1 from public.role_ask where hirer_id = pg_temp.hp(1)) then raise exception 'FAIL H13: rows survived the profile'; end if;
end $$;
select 's-hiring.test H13 OK';

rollback;
