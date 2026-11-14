-- 0079 (D-261): members on brivia_private.unlimited_swipes have no swipe caps; everyone else keeps theirs.
-- U1 a listed member: signal and companion daily limits are 100000, live limit 100000.
-- U2 an unlisted member: the configured limits (unchanged).
-- U3 members cannot read the list.
set brivia.harness_autocomplete = 'off';
begin;
do $$
declare a uuid := '0e790000-0000-4000-8000-000000000001'; b uuid := '0e790000-0000-4000-8000-000000000002'; s record; c record;
begin
  insert into auth.users(id) values (a), (b) on conflict do nothing;
  insert into public.profiles (id, name, full_name, email) values (a, 'Uma', 'Uma', 'u1@example.com'), (b, 'Ved', 'Ved', 'u2@example.com') on conflict (id) do nothing;
  insert into brivia_private.unlimited_swipes (member_id, note) values (a, 'test');
  select * into s from public.brivia_signal_state(a);
  select * into c from public.brivia_companion_state(a);
  if s.daily_limit <> 100000 or s.live_limit <> 100000 or c.daily_limit <> 100000 then raise exception 'FAIL U1: % % %', s.daily_limit, s.live_limit, c.daily_limit; end if;
  select * into s from public.brivia_signal_state(b);
  select * into c from public.brivia_companion_state(b);
  if s.daily_limit <> public.brivia_config_int('signal_daily_limit', 30) or s.live_limit <> public.brivia_config_int('signal_live_limit', 100)
     or c.daily_limit <> public.brivia_config_int('companion_swipe_daily_limit', 10) then raise exception 'FAIL U2'; end if;
  if has_table_privilege('authenticated', 'brivia_private.unlimited_swipes', 'select') then raise exception 'FAIL U3'; end if;
end $$;
rollback;
select 'zs-unlimited-swipes.test ALL PASSED';
