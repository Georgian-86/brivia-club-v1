set brivia.harness_autocomplete = 'off';
-- Phase E (0007): the notice version 2026-10-20 with a 14-day grace window for 2026-10-05.
--   E1 the current version is 2026-10-20 and declare_adult accepts it, logging that version;
--   E2 2026-10-05 is accepted inside the window and refused after it; an unknown or null version is refused;
--   E3 declare_adult refuses an unknown version with 22023.
-- One transaction, rolled back.
begin;
insert into auth.users(id) values ('ae000000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city)
values ('ae000000-0000-4000-8000-000000000001', 'Notice Probe', 'Notice Probe', 'ae1@example.com', 'Pune')
on conflict (id) do nothing;

do $$
begin
  if public.brivia_notice_version() <> '2026-10-20' then raise exception 'FAIL E1: version %', public.brivia_notice_version(); end if;
  if not public.brivia_notice_accepted('2026-10-20') then raise exception 'FAIL E1: current version refused'; end if;
  if not public.brivia_notice_accepted('2026-10-05', '2026-10-25 12:00+00') then raise exception 'FAIL E2: old version refused inside the window'; end if;
  if not public.brivia_notice_accepted('2026-10-05', '2026-11-02 23:00+00') then raise exception 'FAIL E2: old version refused on the last day'; end if;
  if public.brivia_notice_accepted('2026-10-05', '2026-11-03 00:00+00') then raise exception 'FAIL E2: old version accepted after the window'; end if;
  if public.brivia_notice_accepted('1999-01-01') then raise exception 'FAIL E2: unknown version accepted'; end if;
  if public.brivia_notice_accepted(null) then raise exception 'FAIL E2: null accepted'; end if;
  if has_function_privilege('authenticated', 'public.brivia_notice_accepted(text, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.brivia_notice_accepted(text, timestamptz)', 'execute') then
    raise exception 'FAIL E2: clients may call brivia_notice_accepted';
  end if;
end $$;

do $$
declare n constant uuid := 'ae000000-0000-4000-8000-000000000001'; code text;
begin
  set local session authorization authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', n)::text, true);
  begin perform public.declare_adult('2001-01-01'); code := 'none';
  exception when others then code := sqlstate; end;
  if code <> '22023' then reset role; reset session authorization; raise exception 'FAIL E3: unknown version gave %', code; end if;
  perform public.declare_adult('2026-10-20');
  reset role; reset session authorization;
  if (select notice_version from public.consent_event where member_id = n and kind = 'adult') <> '2026-10-20' then
    raise exception 'FAIL E1: consent_event notice_version';
  end if;
end $$;
rollback;
