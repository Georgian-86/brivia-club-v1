set brivia.harness_autocomplete = 'off';
-- Phase E, Task 1 (0009): the notice version with a 14-day grace window.
--   brivia_notice_version() = '2026-10-20'; brivia_notice_accepted(v, at) is true for it, and for the previous
--   '2026-10-05' only until '2026-10-20'::date + 14 (a client deployed before 0009 keeps working during the window).
--   N1 accepted(): current, old inside the window, old after it, unknown;
--   N2 declare_adult accepts the new version and stores it on the consent row;
--   N3 declare_adult refuses an unknown version (22023);
--   N4 declare_adult accepts the old version while the window is open (the real clock decides: skipped when closed)
--      and refuses it once the window is shut (also decided by the real clock, so exactly one of the two runs);
--   N5 other consent rows (sensitive_give) record the new version.
--   N6 privileges: anon and PUBLIC cannot execute the three 0009 functions; authenticated can.
-- Superseded by 0011 (D-070), and updated here only where it is: the current version is '2026-10-05' again and both
-- '2026-10-05' and '2026-10-20' are accepted with no expiry (N1's version and window checks, N4's after-window branch,
-- N5's recorded version). The full 0011 proof is p0f-notice-restore.test.sql.
-- One transaction, rolled back.
begin;
insert into auth.users(id) values
  ('e0000000-0000-4000-8000-000000000001'), ('e0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000003') on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city)
values ('e0000000-0000-4000-8000-000000000001', 'Notice One', 'Notice One', 'ne1@example.com', 'Pune'),
       ('e0000000-0000-4000-8000-000000000002', 'Notice Two', 'Notice Two', 'ne2@example.com', 'Pune'),
       ('e0000000-0000-4000-8000-000000000003', 'Notice Three', 'Notice Three', 'ne3@example.com', 'Pune')
on conflict (id) do nothing;

-- N1
do $$
begin
  -- 0011: the current version is '2026-10-05' again (was '2026-10-20' under 0009).
  if public.brivia_notice_version() <> '2026-10-05' then raise exception 'FAIL N1: version %', public.brivia_notice_version(); end if;
  if not public.brivia_notice_accepted('2026-10-20', '2030-01-01') then raise exception 'FAIL N1: current version refused'; end if;
  if not public.brivia_notice_accepted('2026-10-05', '2026-10-13') then raise exception 'FAIL N1: old version refused before release'; end if;
  if not public.brivia_notice_accepted('2026-10-05', '2026-10-20') then raise exception 'FAIL N1: old version refused on release day'; end if;
  if not public.brivia_notice_accepted('2026-10-05', '2026-11-02 23:59:59+00') then raise exception 'FAIL N1: old version refused inside the window'; end if;
  -- 0011: '2026-10-05' has no expiry any more (under 0009 both of these were refused).
  if not public.brivia_notice_accepted('2026-10-05', '2026-11-03') then raise exception 'FAIL N1: 2026-10-05 refused on 2026-11-03'; end if;
  if not public.brivia_notice_accepted('2026-10-05', '2027-01-01') then raise exception 'FAIL N1: 2026-10-05 refused long after'; end if;
  if public.brivia_notice_accepted('1999-01-01', '2026-10-21') then raise exception 'FAIL N1: unknown version accepted'; end if;
  if public.brivia_notice_accepted(null, '2026-10-21') then raise exception 'FAIL N1: null accepted'; end if;
  if not public.brivia_notice_accepted('2026-10-20') then raise exception 'FAIL N1: default clock refused the current version'; end if;
end $$;

-- N2, N3
do $$
declare n constant uuid := 'e0000000-0000-4000-8000-000000000001'; code text;
begin
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  begin perform public.declare_adult('1999-01-01'); code := 'none'; exception when others then code := sqlstate; end;
  if code <> '22023' then reset role; reset session authorization; raise exception 'FAIL N3: unknown version gave %', code; end if;
  perform public.declare_adult('2026-10-20');
  reset role; reset session authorization;
  if (select notice_version from public.consent_event where member_id = n and kind = 'adult') is distinct from '2026-10-20' then
    raise exception 'FAIL N2: consent row does not record the new version';
  end if;
end $$;

-- N4: '2026-10-05' at the real clock (declare_adult uses now()). 0011: accepted at any date, so the after-window
-- branch (refusal) no longer applies.
do $$
declare n constant uuid := 'e0000000-0000-4000-8000-000000000002'; code text;
begin
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  begin perform public.declare_adult('2026-10-05'); code := 'none'; exception when others then code := sqlstate; end;
  reset role; reset session authorization;
  if code <> 'none' then raise exception 'FAIL N4: 2026-10-05 refused (%)', code; end if;
  if (select notice_version from public.consent_event where member_id = n and kind = 'adult') is distinct from '2026-10-05' then
    raise exception 'FAIL N4: the row must record what the client declared';
  end if;
end $$;

-- N5
do $$
declare n constant uuid := 'e0000000-0000-4000-8000-000000000003';
begin
  update public.profiles set adult_declared_at = now() where id = n;
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  perform public.set_sensitive_consent(true);
  reset role; reset session authorization;
  if (select notice_version from public.consent_event where member_id = n and kind = 'sensitive_give') is distinct from '2026-10-05' then
    -- 0011: server-written rows record the current version, '2026-10-05' again (was '2026-10-20' under 0009).
    raise exception 'FAIL N5: sensitive_give does not record the current version';
  end if;
end $$;
-- N6 (final fix Minor 4): privileges, exactly as 0009 grants them. anon (and PUBLIC) cannot execute any of the three;
-- authenticated can execute all three (the client calls declare_adult; 0009 grants the two notice helpers too).
do $$
declare f text;
begin
  foreach f in array array['public.brivia_notice_accepted(text, timestamptz)', 'public.brivia_notice_version()',
                           'public.declare_adult(text)'] loop
    if has_function_privilege('anon', f, 'execute') then raise exception 'FAIL N6: anon can execute %', f; end if;
    if has_function_privilege('public', f, 'execute') then raise exception 'FAIL N6: PUBLIC can execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'execute') then raise exception 'FAIL N6: authenticated cannot execute %', f; end if;
  end loop;
end $$;
rollback;
select 'p0e-notice ok';
