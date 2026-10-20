set brivia.harness_autocomplete = 'off';
-- 0011 (D-070): the 2026-10-05 privacy notice is current again, with no expiry; 2026-10-20 stays accepted.
-- Live had 0009 (current '2026-10-20', '2026-10-05' only until 2026-11-03) while the shipped client and privacy.html
-- say 2026-10-05, so from 2026-11-03 every declare_adult would have failed. After all migrations:
--   R1 brivia_notice_version() = '2026-10-05'; accepted() is true for '2026-10-05' and '2026-10-20' at any date
--      (2026-10-14, 2026-11-03, 2026-11-10, 2030), false for an unknown version, '' and null.
--   R2 declare_adult('2026-10-05') succeeds at a simulated date after 2026-11-03 and stores '2026-10-05'. The clock is
--      simulated by re-creating brivia_notice_accepted from its own live definition (pg_get_functiondef) with only the
--      p_at default moved from now() to '2026-11-10'; declare_adult calls it with the default, so it sees that date.
--      Under 0009's definition the same call refuses (22023), so this check fails without 0011.
--   R3 declare_adult('2026-10-20') succeeds (members who declared it during 14-20 Oct stay valid) and stores it.
--   R4 declare_adult refuses an unknown version with 22023 and writes nothing.
--   R5 server-written consent rows (sensitive_give) record '2026-10-05'.
--   R6 privileges: anon and PUBLIC cannot execute the three functions; authenticated can execute declare_adult (the
--      only one the client calls) and the two helpers, exactly as 0009 granted them; none is security definer except
--      declare_adult.
-- One transaction, rolled back.
begin;
insert into auth.users(id) values
  ('e0f00000-0000-4000-8000-000000000001'), ('e0f00000-0000-4000-8000-000000000002'),
  ('e0f00000-0000-4000-8000-000000000003'), ('e0f00000-0000-4000-8000-000000000004') on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city)
values ('e0f00000-0000-4000-8000-000000000001', 'Restore One', 'Restore One', 'nr1@example.com', 'Pune'),
       ('e0f00000-0000-4000-8000-000000000002', 'Restore Two', 'Restore Two', 'nr2@example.com', 'Pune'),
       ('e0f00000-0000-4000-8000-000000000003', 'Restore Three', 'Restore Three', 'nr3@example.com', 'Pune'),
       ('e0f00000-0000-4000-8000-000000000004', 'Restore Four', 'Restore Four', 'nr4@example.com', 'Pune')
on conflict (id) do nothing;

-- R1
do $$
declare v text; t timestamptz;
begin
  if public.brivia_notice_version() is distinct from '2026-10-05' then
    raise exception 'FAIL R1: version %', public.brivia_notice_version(); end if;
  foreach v in array array['2026-10-05', '2026-10-20'] loop
    foreach t in array array['2026-10-14'::timestamptz, '2026-11-02 23:59:59+00', '2026-11-03', '2026-11-10',
                             '2030-01-01'] loop
      if not public.brivia_notice_accepted(v, t) then raise exception 'FAIL R1: % refused at %', v, t; end if;
    end loop;
    if not public.brivia_notice_accepted(v) then raise exception 'FAIL R1: % refused by the default clock', v; end if;
  end loop;
  if public.brivia_notice_accepted('1999-01-01', '2026-11-10') then raise exception 'FAIL R1: unknown version accepted'; end if;
  if public.brivia_notice_accepted('2026-10-19', '2026-11-10') then raise exception 'FAIL R1: near-miss version accepted'; end if;
  if public.brivia_notice_accepted('', '2026-11-10') then raise exception 'FAIL R1: empty version accepted'; end if;
  if public.brivia_notice_accepted(null, '2026-11-10') is distinct from false then raise exception 'FAIL R1: null not false'; end if;
end $$;

-- R2: simulate 2026-11-10 for the default clock, using the live definition with only the default changed.
do $$
declare def text; sim text;
begin
  def := pg_get_functiondef('public.brivia_notice_accepted(text, timestamptz)'::regprocedure);
  sim := regexp_replace(def, 'DEFAULT now\(\)', $q$DEFAULT '2026-11-10 12:00:00+00'::timestamptz$q$);
  if sim = def then raise exception 'FAIL R2: could not find the now() default in %', def; end if;
  execute sim;
  if pg_get_functiondef('public.brivia_notice_accepted(text, timestamptz)'::regprocedure) !~ '2026-11-10 12:00:00' then
    raise exception 'FAIL R2: the simulated default is not in effect'; end if;
end $$;

do $$
declare n constant uuid := 'e0f00000-0000-4000-8000-000000000001'; code text;
begin
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  begin perform public.declare_adult('2026-10-05'); code := 'none'; exception when others then code := sqlstate; end;
  reset role; reset session authorization;
  if code <> 'none' then raise exception 'FAIL R2: declare_adult(2026-10-05) after 2026-11-03 gave %', code; end if;
  if (select adult_declared_at from public.profiles where id = n) is null then raise exception 'FAIL R2: not stamped'; end if;
  if (select notice_version from public.consent_event where member_id = n and kind = 'adult') is distinct from '2026-10-05' then
    raise exception 'FAIL R2: consent row does not record 2026-10-05'; end if;
end $$;

-- R3, R4
do $$
declare n constant uuid := 'e0f00000-0000-4000-8000-000000000002'; m constant uuid := 'e0f00000-0000-4000-8000-000000000003';
        code text;
begin
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  begin perform public.declare_adult('2026-10-20'); code := 'none'; exception when others then code := sqlstate; end;
  perform set_config('request.jwt.claims', json_build_object('sub', m)::text, true);
  begin perform public.declare_adult('1999-01-01'); exception when others then code := code || '|' || sqlstate; end;
  reset role; reset session authorization;
  if code <> 'none|22023' then raise exception 'FAIL R3/R4: results %', code; end if;
  if (select notice_version from public.consent_event where member_id = n and kind = 'adult') is distinct from '2026-10-20' then
    raise exception 'FAIL R3: consent row does not record 2026-10-20'; end if;
  if (select adult_declared_at from public.profiles where id = m) is not null
     or exists (select 1 from public.consent_event where member_id = m) then
    raise exception 'FAIL R4: a refused declaration wrote something'; end if;
end $$;

-- R5
do $$
declare n constant uuid := 'e0f00000-0000-4000-8000-000000000004';
begin
  update public.profiles set adult_declared_at = now() where id = n;
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  perform public.set_sensitive_consent(true);
  reset role; reset session authorization;
  if (select notice_version from public.consent_event where member_id = n and kind = 'sensitive_give') is distinct from '2026-10-05' then
    raise exception 'FAIL R5: sensitive_give does not record 2026-10-05'; end if;
end $$;
rollback;

-- R6 (outside the rolled-back transaction: the real definitions, not R2's simulation)
do $$
declare f text;
begin
  foreach f in array array['public.brivia_notice_accepted(text, timestamptz)', 'public.brivia_notice_version()',
                           'public.declare_adult(text)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL R6: anon can execute %', f; end if;
    if has_function_privilege('public', f, 'execute') then raise exception 'FAIL R6: PUBLIC can execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL R6: authenticated cannot execute %', f; end if;
  end loop;
  if (select prosecdef from pg_proc where oid = 'public.brivia_notice_accepted(text, timestamptz)'::regprocedure)
     or (select prosecdef from pg_proc where oid = 'public.brivia_notice_version()'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public.declare_adult(text)'::regprocedure) then
    raise exception 'FAIL R6: security mode changed'; end if;
  if (select provolatile from pg_proc where oid = 'public.brivia_notice_version()'::regprocedure) <> 'i'
     or (select provolatile from pg_proc where oid = 'public.brivia_notice_accepted(text, timestamptz)'::regprocedure) <> 's' then
    raise exception 'FAIL R6: volatility changed'; end if;
  if pg_get_functiondef('public.brivia_notice_accepted(text, timestamptz)'::regprocedure) !~ 'DEFAULT now\(\)' then
    raise exception 'FAIL R6: the p_at default is no longer now()'; end if;
end $$;
select 'p0f-notice-restore ok';
