set brivia.harness_autocomplete = 'off';
-- Iteration 4 (P0-B), Task 1: the 18+ declaration gate (R1) and consent history (R3).
--   A1 completion needs adult_declared_at: an undeclared member with a name, a cell and 20 points is not completed
--      and is invisible both ways;
--   A2 no client write can set adult_declared_at or sensitive_consent_at (not even with a temporary UPDATE grant);
--   A3 declare_adult: stale notice refused, first call stamps + logs one consent_event, a second changes nothing;
--   A4 location and interests are refused (P0001) before the declaration;
--   A5 clients cannot read consent_event; A6 a suspended_pending_review flag un-completes a member.
-- "Client" sessions use SET LOCAL SESSION AUTHORIZATION so session_user is not the owner, like PostgREST's
-- authenticator (a plain SET ROLE leaves session_user = owner, which is the owner/SQL-editor session).
-- One transaction, rolled back.
begin;
insert into auth.users(id) values
  ('ad000000-0000-4000-8000-000000000001'), ('ad000000-0000-4000-8000-000000000002'),
  ('ad000000-0000-4000-8000-000000000003'), ('ad000000-0000-4000-8000-000000000004')
  on conflict do nothing;
-- v1 viewer (declared), t2 undeclared target, n3 fresh member (A3/A4), u4 (A2).
insert into public.profiles (id, name, full_name, email, city)
values ('ad000000-0000-4000-8000-000000000001', 'Adult Viewer', 'Adult Viewer', 'ad1@example.com', 'Pune'),
       ('ad000000-0000-4000-8000-000000000002', 'Undeclared Target', 'Undeclared Target', 'ad2@example.com', 'Pune'),
       ('ad000000-0000-4000-8000-000000000003', 'Fresh Member', 'Fresh Member', 'ad3@example.com', 'Pune'),
       ('ad000000-0000-4000-8000-000000000004', 'Update Probe', 'Update Probe', 'ad4@example.com', 'Pune')
on conflict (id) do nothing;
-- the owner (this session) may declare directly
update public.profiles set adult_declared_at = now() where id = 'ad000000-0000-4000-8000-000000000001';

-- v1 completes through the member RPCs; t2 gets data written by the owner (an owner write is not guarded).
do $$
begin
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"ad000000-0000-4000-8000-000000000001"}', true);
  perform public.set_member_interests('[{"interest_id":"sports.racket.badminton","points":12},
                                        {"interest_id":"games.board.chess","points":8}]'::jsonb);
  perform public.set_home_city('in-pune');
  reset role; reset session authorization;
end $$;
insert into public.member_interest (member_id, interest_id, points, mode) values
  ('ad000000-0000-4000-8000-000000000002', 'sports.racket.badminton', 12, 'play'),
  ('ad000000-0000-4000-8000-000000000002', 'games.board.chess', 8, 'play');
insert into public.member_orbit (member_id, cell_scheme, home_cell, home_cell_g6, home_cell_g5, place_id)
select 'ad000000-0000-4000-8000-000000000002', cell_scheme, home_cell, home_cell_g6, home_cell_g5, place_id
  from public.member_orbit where member_id = 'ad000000-0000-4000-8000-000000000001';

-- A1. Undeclared: not completed, invisible both ways, absent from deck and search; declaring flips all of it.
do $$
declare v constant uuid := 'ad000000-0000-4000-8000-000000000001'; t constant uuid := 'ad000000-0000-4000-8000-000000000002';
begin
  if not public.brivia_member_completed(v) then raise exception 'FAIL A1 setup: the declared viewer is not completed'; end if;
  if public.brivia_member_completed(t) then raise exception 'FAIL A1: an undeclared member (name, cell, 20 points) is completed'; end if;
  if public.brivia_visible_to(v, t) or public.brivia_visible_to(t, v) then raise exception 'FAIL A1: an undeclared member is visible'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  if exists (select 1 from public.deck_candidates(50) d where d.id = t) then reset role; raise exception 'FAIL A1: deck_candidates returns the undeclared member'; end if;
  if exists (select 1 from public.search_members('Undeclared', 20) s where s.id = t) then reset role; raise exception 'FAIL A1: search_members returns the undeclared member'; end if;
  reset role;
  update public.profiles set adult_declared_at = now() where id = t;   -- owner declares: positive control
  if not public.brivia_member_completed(t) or not public.brivia_visible_to(v, t) or not public.brivia_visible_to(t, v) then
    raise exception 'FAIL A1 control: a declared member is not completed/visible';
  end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v)::text, true);
  if not exists (select 1 from public.search_members('Undeclared', 20) s where s.id = t) then reset role; raise exception 'FAIL A1 control: search does not return the declared member'; end if;
  reset role;
  update public.profiles set adult_declared_at = null where id = t;   -- (owner) undeclare again for later checks
end $$;

-- A2. No client write sets either consent column, with or without a temporary UPDATE grant.
do $$
declare u constant uuid := 'ad000000-0000-4000-8000-000000000004'; a timestamptz; s timestamptz; denied boolean;
begin
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
  denied := false;
  begin update public.profiles set adult_declared_at = now() where id = u; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'FAIL A2: the stock grants let a client update adult_declared_at'; end if;
  reset role; reset session authorization;
  grant update on public.profiles to authenticated;                   -- temporary (rolled back with the transaction)
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
  update public.profiles set adult_declared_at = now(), sensitive_consent_at = now() where id = u;
  -- a client may also try to set the "consent RPC" flag itself
  perform set_config('brivia.consent_write', 'on', true);
  update public.profiles set adult_declared_at = now(), sensitive_consent_at = now() where id = u;
  reset role; reset session authorization;
  select adult_declared_at, sensitive_consent_at into a, s from public.profiles where id = u;
  if a is not null or s is not null then raise exception 'FAIL A2: a client update changed a consent column (% %)', a, s; end if;
  perform set_config('brivia.consent_write', 'off', true);
  revoke update on public.profiles from authenticated;
end $$;
do $$
declare w constant uuid := 'ad000000-0000-4000-8000-000000000005'; a timestamptz; s timestamptz;
begin
  insert into auth.users(id) values (w) on conflict do nothing;
  grant insert on public.profiles to authenticated;                   -- temporary
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', w)::text, true);
  insert into public.profiles (id, name, full_name, email, adult_declared_at, sensitive_consent_at)
  values (w, 'Insert Probe', 'Insert Probe', 'ad5@example.com', now(), now());
  reset role; reset session authorization;
  select adult_declared_at, sensitive_consent_at into a, s from public.profiles where id = w;
  if a is not null or s is not null then raise exception 'FAIL A2: a client insert stored a consent column (% %)', a, s; end if;
  revoke insert on public.profiles from authenticated;
end $$;

-- A3. declare_adult.
do $$
declare n constant uuid := 'ad000000-0000-4000-8000-000000000003'; code text; a1 timestamptz; a2 timestamptz; ev int;
begin
  if public.brivia_notice_version() <> '2026-10-05' then raise exception 'FAIL A3: notice version %', public.brivia_notice_version(); end if;
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  begin perform public.declare_adult('1999-01-01'); code := 'none';
  exception when others then code := sqlstate; end;
  if code <> '22023' then reset role; reset session authorization; raise exception 'FAIL A3: stale version gave %', code; end if;
  perform public.declare_adult(public.brivia_notice_version());
  reset role; reset session authorization;
  select adult_declared_at into a1 from public.profiles where id = n;
  select count(*) into ev from public.consent_event where member_id = n and kind = 'adult';
  if a1 is null or ev <> 1 then raise exception 'FAIL A3: after declaring: at=%, events=%', a1, ev; end if;
  if (select notice_version from public.consent_event where member_id = n and kind = 'adult') <> '2026-10-05' then
    raise exception 'FAIL A3: event notice_version';
  end if;
  perform pg_sleep(0.01);
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  perform public.declare_adult(public.brivia_notice_version());
  reset role; reset session authorization;
  select adult_declared_at into a2 from public.profiles where id = n;
  select count(*) into ev from public.consent_event where member_id = n and kind = 'adult';
  if a2 is distinct from a1 or ev <> 1 then raise exception 'FAIL A3: second call changed state (% -> %, events %)', a1, a2, ev; end if;
  -- no profile: P0002
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"ad000000-0000-4000-8000-0000000000ff"}', true);
  begin perform public.declare_adult(public.brivia_notice_version()); code := 'none'; exception when others then code := sqlstate; end;
  reset role; reset session authorization;
  if code <> 'P0002' then raise exception 'FAIL A3: no profile gave %', code; end if;
  -- the sensitive consent RPC still works for a client (it sets the guard flag) and the guard keeps it otherwise
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  perform public.set_sensitive_consent(true);
  reset role; reset session authorization;
  if (select sensitive_consent_at from public.profiles where id = n) is null then raise exception 'FAIL A3: set_sensitive_consent no longer records consent'; end if;
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  perform public.set_sensitive_consent(false);
  reset role; reset session authorization;
  if (select sensitive_consent_at from public.profiles where id = n) is not null then raise exception 'FAIL A3: set_sensitive_consent(false) did not withdraw'; end if;
end $$;

-- A4. Before the declaration, location and interests are refused (P0001). u4 is undeclared.
do $$
declare u constant uuid := 'ad000000-0000-4000-8000-000000000004'; code text; msg text;
begin
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
  begin perform public.set_home_city('in-mumbai'); code := 'none'; msg := '';
  exception when others then code := sqlstate; msg := sqlerrm; end;
  if code <> 'P0001' or msg <> 'adult declaration required' then reset role; reset session authorization; raise exception 'FAIL A4: set_home_city gave % %', code, msg; end if;
  begin perform public.set_member_interests('[{"interest_id":"sports.racket.badminton","points":12},{"interest_id":"games.board.chess","points":8}]'::jsonb);
        code := 'none'; msg := '';
  exception when others then code := sqlstate; msg := sqlerrm; end;
  reset role; reset session authorization;
  if code <> 'P0001' or msg <> 'adult declaration required' then raise exception 'FAIL A4: set_member_interests gave % %', code, msg; end if;
  if exists (select 1 from public.member_orbit where member_id = u) or exists (select 1 from public.member_interest where member_id = u) then
    raise exception 'FAIL A4: a row was written for an undeclared member';
  end if;
end $$;

-- A5. Clients cannot read consent_event.
do $$
declare r text; denied boolean;
begin
  foreach r in array array['anon', 'authenticated'] loop
    denied := false;
    execute format('set local role %I', r);
    begin perform count(*) from public.consent_event; exception when insufficient_privilege then denied := true; end;
    reset role;
    if not denied then raise exception 'FAIL A5: % can read consent_event', r; end if;
  end loop;
  if has_function_privilege('anon', 'public.declare_adult(text)', 'execute') then raise exception 'FAIL A5: anon can declare'; end if;
  if not has_function_privilege('authenticated', 'public.brivia_notice_version()', 'execute') then raise exception 'FAIL A5: notice version not executable'; end if;
end $$;

-- A6. A suspended_pending_review flag un-completes a member.
do $$
declare v constant uuid := 'ad000000-0000-4000-8000-000000000001';
begin
  if not public.brivia_member_completed(v) then raise exception 'FAIL A6 setup'; end if;
  insert into public.member_flag (member_id, reason) values (v, 'suspended_pending_review');
  if public.brivia_member_completed(v) then raise exception 'FAIL A6: a suspended member is completed'; end if;
  delete from public.member_flag where member_id = v;
  if not public.brivia_member_completed(v) then raise exception 'FAIL A6: lifting the flag does not restore completion'; end if;
end $$;

rollback;
select 'p0b-adult OK' as result;
