-- Iteration-3 arena P0-A8 (hygiene, D-038) and the live advisor findings (controller additions, 2026-10-04).
--   H1 an anonymous account (auth.users.is_anonymous) is never completed;
--   H2 brivia_guard_is_test, brivia_is_storage_url and brivia_is_preset_cover are not executable by anon or PUBLIC
--      (the two URL checks stay executable by authenticated: profile and post CHECK constraints call them), and
--      brivia_guard_is_test has a pinned search_path (advisor: mutable search_path);
--   H3 no 0001-0003 helper that answers about an arbitrary pair is client-executable: brivia_same_world,
--      brivia_interaction_allowed and both brivia_is_blocked_between overloads are revoked from every client role;
--      the policies that used them call definer wrappers pinned to auth.uid(), which live in the non-exposed schema
--      brivia_private (fix round 1, M-1: PostgREST exposes only public, so they are not RPCs); the client-executable
--      definer set in public is exactly the RPC whitelist below;
--   H4 purge_expired_requests also deletes location_change rows older than 24 h and interest_rewrite rows older than
--      24 h, and prunes cron.job_run_details older than 7 days when pg_cron is installed;
--   H5 every function in public pins its search_path.
set brivia.harness_autocomplete = 'off';

create or replace function pg_temp.h8(n int) returns uuid language sql immutable as $$
  select ('4e8e4e8e-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(18.5204, 73.8567, 7);
begin
  for g in 1..3 loop
    mid := pg_temp.h8(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email) values (mid, 'Hyg ' || g, 'Hyg ' || g, 'h' || g || '@example.com')
    on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;   -- R1: declared (fixture is off)
    insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
    values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), 'in-pune')
    on conflict (member_id) do nothing;
    insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.tennis', 20)
    on conflict do nothing;
  end loop;
end $$;

-- H1. An anonymous account is never completed (and so never visible, never a sender).
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users'
                  and column_name = 'is_anonymous') then
    raise exception 'FAIL setup: the stub has no auth.users.is_anonymous';
  end if;
  if not public.brivia_member_completed(pg_temp.h8(1)) then raise exception 'FAIL setup: H1 member not completed'; end if;
  update auth.users set is_anonymous = true where id = pg_temp.h8(1);
  if public.brivia_member_completed(pg_temp.h8(1)) then raise exception 'FAIL H1: an anonymous account is completed'; end if;
  if public.brivia_visible_to(pg_temp.h8(2), pg_temp.h8(1)) then raise exception 'FAIL H1: an anonymous account is visible'; end if;
  update auth.users set is_anonymous = false where id = pg_temp.h8(1);
  if not public.brivia_member_completed(pg_temp.h8(1)) then raise exception 'FAIL H1: is_anonymous = false is not completed'; end if;
end $$;

-- H2. The 0003 helpers.
do $$
declare f text; r text;
begin
  foreach f in array array['public.brivia_guard_is_test()', 'public.brivia_is_storage_url(text, text, uuid)',
                           'public.brivia_is_preset_cover(text)'] loop
    foreach r in array array['anon', 'public'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FAIL H2: % can execute %', r, f; end if;
    end loop;
  end loop;
  if has_function_privilege('authenticated', 'public.brivia_guard_is_test()', 'execute') then
    raise exception 'FAIL H2: authenticated can execute brivia_guard_is_test'; end if;
  if not has_function_privilege('authenticated', 'public.brivia_is_storage_url(text, text, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.brivia_is_preset_cover(text)', 'execute') then
    raise exception 'FAIL H2: the CHECK-constraint helpers must stay executable by authenticated'; end if;
  if not (select proconfig @> array['search_path=public'] from pg_proc where oid = 'public.brivia_guard_is_test()'::regprocedure) then
    raise exception 'FAIL H2: brivia_guard_is_test has a mutable search_path'; end if;
end $$;
-- A member's photo update still passes the storage-URL CHECK (it runs as authenticated).
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.h8(2))::text, true);
  update public.profiles
     set photo_url = 'https://proj.supabase.co/storage/v1/object/public/profile-photos/' || pg_temp.h8(2) || '/p.jpg'
   where id = pg_temp.h8(2);
  reset role;
  if (select photo_url from public.profiles where id = pg_temp.h8(2)) is null then raise exception 'FAIL H2: photo update lost'; end if;
end $$;

-- H3. Pair helpers: no client role; the client-executable set is exactly the RPC whitelist.
do $$
declare f text; r text; got text; want text;
begin
  foreach f in array array['public.brivia_same_world(uuid, uuid)', 'public.brivia_interaction_allowed(uuid, uuid, text)',
                           'public.brivia_is_blocked_between(uuid, uuid)', 'public.brivia_is_blocked_between(text, text)'] loop
    foreach r in array array['anon', 'authenticated', 'public'] loop
      if has_function_privilege(r, f, 'execute') then raise exception 'FAIL H3: % can execute %', r, f; end if;
    end loop;
  end loop;
  select string_agg(p.proname, ',' order by p.proname) into got
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute');
  want := 'brivia_can_see_author,brivia_has_completed_profile,'
       || 'deck_candidates,deck_status,declare_adult,delete_my_account,get_candidates,my_interests,my_onboarding_status,'
       || 'my_outgoing_requests,my_signal_quota,report_member,respond_connection_request,search_members,send_signal,set_home_city,'
       || 'set_home_location,set_member_interests,set_sensitive_consent';
  if got is distinct from want then raise exception 'FAIL H3: authenticated may execute definer functions %', got; end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
              and has_function_privilege('anon', p.oid, 'execute')) then
    raise exception 'FAIL H3: anon may execute a definer function';
  end if;
  -- M-1: the wrappers are not in public (no /rpc), but in brivia_private, usable by authenticated policies only
  foreach f in array array['brivia_can_message(uuid)', 'brivia_incoming_request_visible(uuid)',
                           'brivia_interaction_insert_ok(uuid, text)'] loop
    if to_regprocedure('public.' || f) is not null then raise exception 'FAIL M-1: public.% is exposed', f; end if;
    if to_regprocedure('brivia_private.' || f) is null then raise exception 'FAIL M-1: brivia_private.% missing', f; end if;
    if has_function_privilege('anon', 'brivia_private.' || f, 'execute')
       or not has_function_privilege('authenticated', 'brivia_private.' || f, 'execute') then
      raise exception 'FAIL M-1: brivia_private.% grants', f;
    end if;
  end loop;
  if has_schema_privilege('anon', 'brivia_private', 'usage') or has_schema_privilege('public', 'brivia_private', 'usage')
     or not has_schema_privilege('authenticated', 'brivia_private', 'usage') then
    raise exception 'FAIL M-1: brivia_private schema usage grants';
  end if;
end $$;
-- An /rpc-style call of the old public names fails for a member.
do $$
declare stmt text; failed boolean;
begin
  foreach stmt in array array['select public.brivia_can_message(''4e8e4e8e-0000-4000-8000-000000000002''::uuid)',
                              'select public.brivia_incoming_request_visible(''4e8e4e8e-0000-4000-8000-000000000002''::uuid)',
                              'select public.brivia_interaction_insert_ok(''4e8e4e8e-0000-4000-8000-000000000002''::uuid, ''like'')'] loop
    failed := false;
    set local role authenticated;
    begin execute stmt; exception when undefined_function or insufficient_privilege then failed := true; end;
    reset role;
    if not failed then raise exception 'FAIL M-1: a member ran %', stmt; end if;
  end loop;
end $$;

-- The wrappers answer only about the caller's own pairs, and the policies built on them still work.
do $$
declare a uuid := pg_temp.h8(1); b uuid := pg_temp.h8(2); c uuid := pg_temp.h8(3); failed boolean;
begin
  perform public.brivia_create_match(a, b);
  insert into public.connection_requests (from_id, to_id) values (c, a);
  set local role authenticated;
  -- the caller c is in no match with a or b: no answer about them
  perform set_config('request.jwt.claims', json_build_object('sub', c)::text, true);
  if brivia_private.brivia_can_message(a) or brivia_private.brivia_can_message(b) then reset role; raise exception 'FAIL H3: can_message answers a non-party'; end if;
  if brivia_private.brivia_incoming_request_visible(a) then reset role; raise exception 'FAIL H3: request wrapper answers a non-party'; end if;
  -- a and b are matched: a messages b
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  if not brivia_private.brivia_can_message(b) then reset role; raise exception 'FAIL H3: can_message denies a match'; end if;
  insert into public.brivia_messages (sender_id, recipient_id, body) values (a, b, 'hi');
  if not brivia_private.brivia_incoming_request_visible(c) then reset role; raise exception 'FAIL H3: a cannot see c''s request'; end if;
  if (select count(*) from public.connection_requests where to_id = a) <> 1 then reset role; raise exception 'FAIL H3: request policy'; end if;
  reset role;
  -- a blocks b: no message, either way; a blocks c: c's request is hidden from a
  insert into public.brivia_blocks (blocker_id, blocked_id) values (b, a), (a, c);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  failed := false;
  begin insert into public.brivia_messages (sender_id, recipient_id, body) values (a, b, 'again');
  exception when insufficient_privilege then failed := true; end;
  if not failed then reset role; raise exception 'FAIL H3: a message to a blocking match was allowed'; end if;
  if (select count(*) from public.connection_requests where to_id = a) <> 0 then reset role; raise exception 'FAIL H3: blocked request visible'; end if;
  reset role;
  delete from public.brivia_blocks where blocker_id in (a, b);
  delete from public.brivia_messages where sender_id = a;
  delete from public.connection_requests where from_id = c;
  delete from public.matches where a in (user1_id, user2_id);
end $$;

-- H4. The nightly purge.
do $$
declare m uuid := pg_temp.h8(3); n int;
begin
  insert into public.location_change (member_id, at) values (m, now() - interval '25 hours'), (m, now() - interval '1 hour');
  insert into public.interest_rewrite (member_id, at) values (m, now() - interval '25 hours'), (m, now() - interval '1 hour');
  perform public.purge_expired_requests();
  select count(*) into n from public.location_change where member_id = m;
  if n <> 1 or exists (select 1 from public.location_change where member_id = m and at < now() - interval '24 hours') then
    raise exception 'FAIL H4: location_change after the purge: % rows', n; end if;
  select count(*) into n from public.interest_rewrite where member_id = m;
  if n <> 1 then raise exception 'FAIL H4: interest_rewrite after the purge: % rows', n; end if;
end $$;
-- With pg_cron (a stub schema, rolled back): job history older than 7 days is pruned.
begin;
create schema cron;
create table cron.job_run_details (runid bigserial primary key, jobid bigint, status text, end_time timestamptz);
insert into cron.job_run_details (jobid, status, end_time) values
  (1, 'succeeded', now() - interval '8 days'), (1, 'succeeded', now() - interval '6 days'), (1, 'running', null);
do $$
begin
  perform public.purge_expired_requests();
  if (select count(*) from cron.job_run_details) <> 2
     or exists (select 1 from cron.job_run_details where end_time < now() - interval '7 days') then
    raise exception 'FAIL H4: cron.job_run_details not pruned (% rows)', (select count(*) from cron.job_run_details);
  end if;
end $$;
rollback;

-- H5. Every function in public pins its search_path (advisor lint: function_search_path_mutable).
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  if bad is not null then raise exception 'FAIL H5: mutable search_path: %', bad; end if;
end $$;

-- Clean up.
delete from public.profiles where id::text like '4e8e4e8e-%';
delete from auth.users where id::text like '4e8e4e8e-%';

select 'orbit-hygiene.test.sql OK' as result;
